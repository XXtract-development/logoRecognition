"""Main training pipeline for logo detection models."""

import asyncio
import json
import logging
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import torch
import torch.nn as nn
import torch.optim as optim
from torch.cuda.amp import GradScaler, autocast
from torch.utils.data import DataLoader, Dataset

from app.core.config import settings
from app.models.base import get_db
from app.models.training import TrainingJob, ModelRegistry
from app.storage.minio_client import MinIOClient

from .augmentation import DataAugmentationPipeline
from .few_shot import FewShotLearner, PrototypicalNetwork
from .onnx_export import ONNXExporter

logger = logging.getLogger(__name__)


class LogoDataset(Dataset):
    """Dataset for logo training."""

    def __init__(
        self,
        image_paths: List[str],
        labels: List[int],
        transform=None,
        augmentation_factor: int = 50,
    ):
        """Initialize dataset with augmentation support."""
        self.image_paths = image_paths
        self.labels = labels
        self.transform = transform
        self.augmentation_factor = augmentation_factor
        self.augmenter = DataAugmentationPipeline(factor=augmentation_factor)

        # Generate augmented data
        self.augmented_data = []
        for img_path, label in zip(image_paths, labels):
            augmented = self.augmenter.augment(img_path)
            for aug_img in augmented:
                self.augmented_data.append((aug_img, label))

    def __len__(self):
        return len(self.augmented_data)

    def __getitem__(self, idx):
        img, label = self.augmented_data[idx]
        if self.transform:
            img = self.transform(img)
        return img, label


class TrainingPipeline:
    """Complete training pipeline with ONNX export."""

    def __init__(
        self,
        job_id: str,
        minio_client: Optional[MinIOClient] = None,
        device: str = None,
    ):
        """Initialize training pipeline."""
        self.job_id = job_id
        self.minio_client = minio_client or MinIOClient()
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")

        # Training configuration
        self.config = {
            "batch_size": 32,
            "learning_rate": 0.001,
            "epochs": 100,
            "early_stopping_patience": 10,
            "gradient_clip_val": 1.0,
            "mixed_precision": torch.cuda.is_available(),
        }

        # Initialize components
        self.model = None
        self.optimizer = None
        self.scaler = GradScaler() if self.config["mixed_precision"] else None
        self.best_model_state = None
        self.best_accuracy = 0
        self.training_history = []

        # WebSocket progress tracking
        self.progress = {
            "status": "initializing",
            "epoch": 0,
            "total_epochs": self.config["epochs"],
            "loss": 0.0,
            "accuracy": 0.0,
            "message": "Initializing training pipeline",
        }

    async def initialize(
        self,
        n_classes: int,
        n_support: int = 5,
        embedding_dim: int = 512,
    ) -> None:
        """Initialize model and training components."""
        logger.info(f"Initializing training pipeline for job {self.job_id}")

        # Initialize few-shot model
        self.model = PrototypicalNetwork(
            n_classes=n_classes,
            n_support=n_support,
            embedding_dim=embedding_dim,
        ).to(self.device)

        # Initialize optimizer with weight decay
        self.optimizer = optim.AdamW(
            self.model.parameters(),
            lr=self.config["learning_rate"],
            weight_decay=1e-4,
        )

        # Learning rate scheduler
        self.scheduler = optim.lr_scheduler.ReduceLROnPlateau(
            self.optimizer,
            mode="max",
            factor=0.5,
            patience=5,
            verbose=True,
        )

        self.progress["status"] = "initialized"
        self.progress["message"] = "Training pipeline initialized"

        await self._emit_progress()

    async def train(
        self,
        train_loader: DataLoader,
        val_loader: Optional[DataLoader] = None,
    ) -> Dict[str, Any]:
        """Execute training loop with GPU acceleration."""
        logger.info(f"Starting training for job {self.job_id}")

        self.progress["status"] = "training"
        best_val_acc = 0
        patience_counter = 0

        try:
            for epoch in range(self.config["epochs"]):
                self.progress["epoch"] = epoch + 1

                # Training phase
                train_loss, train_acc = await self._train_epoch(train_loader)

                # Validation phase
                if val_loader:
                    val_loss, val_acc = await self._validate(val_loader)
                else:
                    val_loss, val_acc = train_loss, train_acc

                # Update learning rate
                self.scheduler.step(val_acc)

                # Early stopping check
                if val_acc > best_val_acc:
                    best_val_acc = val_acc
                    self.best_accuracy = val_acc
                    self.best_model_state = self.model.state_dict()
                    patience_counter = 0
                    await self._save_checkpoint(epoch, val_acc)
                else:
                    patience_counter += 1

                # Record history
                self.training_history.append({
                    "epoch": epoch + 1,
                    "train_loss": train_loss,
                    "train_acc": train_acc,
                    "val_loss": val_loss,
                    "val_acc": val_acc,
                    "learning_rate": self.optimizer.param_groups[0]["lr"],
                })

                # Update progress
                self.progress.update({
                    "loss": train_loss,
                    "accuracy": val_acc,
                    "message": f"Epoch {epoch + 1}/{self.config['epochs']} - Val Acc: {val_acc:.2%}",
                })
                await self._emit_progress()

                # Check early stopping
                if patience_counter >= self.config["early_stopping_patience"]:
                    logger.info(f"Early stopping triggered at epoch {epoch + 1}")
                    break

            # Load best model
            if self.best_model_state:
                self.model.load_state_dict(self.best_model_state)

            self.progress["status"] = "completed"
            self.progress["message"] = f"Training completed - Best accuracy: {self.best_accuracy:.2%}"
            await self._emit_progress()

            return {
                "best_accuracy": self.best_accuracy,
                "total_epochs": len(self.training_history),
                "history": self.training_history,
                "model_path": await self._save_final_model(),
            }

        except Exception as e:
            logger.error(f"Training failed for job {self.job_id}: {str(e)}")
            self.progress["status"] = "failed"
            self.progress["message"] = f"Training failed: {str(e)}"
            await self._emit_progress()
            raise

    async def _train_epoch(self, train_loader: DataLoader) -> Tuple[float, float]:
        """Train for one epoch with mixed precision."""
        self.model.train()
        total_loss = 0
        correct = 0
        total = 0

        for batch_idx, (images, labels) in enumerate(train_loader):
            images, labels = images.to(self.device), labels.to(self.device)

            self.optimizer.zero_grad()

            if self.config["mixed_precision"]:
                with autocast():
                    outputs, loss = self.model(images, labels)

                self.scaler.scale(loss).backward()

                # Gradient clipping
                self.scaler.unscale_(self.optimizer)
                nn.utils.clip_grad_norm_(
                    self.model.parameters(),
                    self.config["gradient_clip_val"]
                )

                self.scaler.step(self.optimizer)
                self.scaler.update()
            else:
                outputs, loss = self.model(images, labels)
                loss.backward()

                # Gradient clipping
                nn.utils.clip_grad_norm_(
                    self.model.parameters(),
                    self.config["gradient_clip_val"]
                )

                self.optimizer.step()

            total_loss += loss.item()
            _, predicted = outputs.max(1)
            total += labels.size(0)
            correct += predicted.eq(labels).sum().item()

        avg_loss = total_loss / len(train_loader)
        accuracy = correct / total

        return avg_loss, accuracy

    async def _validate(self, val_loader: DataLoader) -> Tuple[float, float]:
        """Validate model performance."""
        self.model.eval()
        total_loss = 0
        correct = 0
        total = 0

        with torch.no_grad():
            for images, labels in val_loader:
                images, labels = images.to(self.device), labels.to(self.device)

                if self.config["mixed_precision"]:
                    with autocast():
                        outputs, loss = self.model(images, labels)
                else:
                    outputs, loss = self.model(images, labels)

                total_loss += loss.item()
                _, predicted = outputs.max(1)
                total += labels.size(0)
                correct += predicted.eq(labels).sum().item()

        avg_loss = total_loss / len(val_loader)
        accuracy = correct / total

        return avg_loss, accuracy

    async def _save_checkpoint(self, epoch: int, accuracy: float) -> None:
        """Save model checkpoint."""
        checkpoint = {
            "epoch": epoch,
            "model_state_dict": self.model.state_dict(),
            "optimizer_state_dict": self.optimizer.state_dict(),
            "scheduler_state_dict": self.scheduler.state_dict(),
            "accuracy": accuracy,
            "config": self.config,
        }

        checkpoint_path = f"checkpoints/{self.job_id}/checkpoint_epoch_{epoch}.pt"

        # Save to MinIO
        if self.minio_client:
            await self.minio_client.save_checkpoint(self.job_id, checkpoint, epoch)

        logger.info(f"Saved checkpoint for epoch {epoch} with accuracy {accuracy:.2%}")

    async def _save_final_model(self) -> str:
        """Save final trained model."""
        model_path = f"models/{self.job_id}/final_model.pt"

        torch.save({
            "model_state_dict": self.model.state_dict(),
            "config": self.config,
            "accuracy": self.best_accuracy,
            "training_history": self.training_history,
        }, model_path)

        # Upload to MinIO
        if self.minio_client:
            await self.minio_client.upload_model(self.job_id, model_path)

        return model_path

    async def export_to_onnx(self, output_path: Optional[str] = None) -> str:
        """Export trained model to ONNX format."""
        if not self.model:
            raise ValueError("Model not initialized or trained")

        exporter = ONNXExporter(self.model, self.device)
        onnx_path = output_path or f"models/{self.job_id}/model.onnx"

        # Export and optimize
        onnx_path = await exporter.export(
            onnx_path,
            input_shape=(1, 3, 224, 224),
            optimize=True,
            quantize=True,
        )

        # Upload to MinIO
        if self.minio_client:
            await self.minio_client.upload_onnx(self.job_id, onnx_path)

        logger.info(f"Exported model to ONNX: {onnx_path}")
        return onnx_path

    async def _emit_progress(self) -> None:
        """Emit training progress via WebSocket."""
        # This will be connected to WebSocket manager
        # For now, just log the progress
        logger.info(f"Training progress: {json.dumps(self.progress)}")

    def cleanup(self) -> None:
        """Clean up resources."""
        if self.model:
            del self.model
        if self.optimizer:
            del self.optimizer
        torch.cuda.empty_cache()