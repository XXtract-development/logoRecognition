"""Model training pipeline for logo detection."""

import json
import logging
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from torchvision.models.detection import fasterrcnn_resnet50_fpn
from torchvision.models.detection.faster_rcnn import FastRCNNPredictor

from .data_loader import TrainingDataLoader
from .metrics_tracker import MetricsTracker

logger = logging.getLogger(__name__)


class ModelTrainingPipeline:
    """Training pipeline for logo detection models."""

    def __init__(
        self,
        model_type: str = "faster_rcnn",
        num_classes: int = 5,
        device: Optional[str] = None,
        checkpoint_dir: str = "./checkpoints"
    ):
        """Initialize training pipeline.

        Args:
            model_type: Type of model to train
            num_classes: Number of classes to detect
            device: Device to train on (cuda/cpu)
            checkpoint_dir: Directory to save checkpoints
        """
        self.model_type = model_type
        self.num_classes = num_classes
        self.device = device or self._get_device()
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)

        self.model = None
        self.optimizer = None
        self.scheduler = None
        self.metrics_tracker = MetricsTracker()
        self.training_history = []

        logger.info(f"Training pipeline initialized - Device: {self.device}")

    def _get_device(self) -> str:
        """Determine the best available device."""
        if torch.cuda.is_available():
            return "cuda"
        elif torch.backends.mps.is_available():
            return "mps"
        else:
            return "cpu"

    def initialize_model(self, pretrained: bool = True) -> nn.Module:
        """Initialize the detection model.

        Args:
            pretrained: Whether to use pretrained weights

        Returns:
            Initialized model
        """
        if self.model_type == "faster_rcnn":
            # Load pretrained Faster R-CNN
            model = fasterrcnn_resnet50_fpn(pretrained=pretrained)

            # Replace the classifier head
            in_features = model.roi_heads.box_predictor.cls_score.in_features
            model.roi_heads.box_predictor = FastRCNNPredictor(
                in_features,
                self.num_classes + 1  # +1 for background
            )

        else:
            raise ValueError(f"Unknown model type: {self.model_type}")

        self.model = model.to(self.device)
        logger.info(f"Model initialized: {self.model_type}")
        return self.model

    def setup_training(
        self,
        learning_rate: float = 0.001,
        weight_decay: float = 0.0005,
        momentum: float = 0.9,
        scheduler_type: str = "step"
    ):
        """Setup optimizer and learning rate scheduler.

        Args:
            learning_rate: Initial learning rate
            weight_decay: L2 regularization weight
            momentum: Momentum for SGD
            scheduler_type: Type of learning rate scheduler
        """
        if self.model is None:
            raise ValueError("Model must be initialized before setup")

        # Setup optimizer
        params = [p for p in self.model.parameters() if p.requires_grad]
        self.optimizer = optim.SGD(
            params,
            lr=learning_rate,
            momentum=momentum,
            weight_decay=weight_decay
        )

        # Setup learning rate scheduler
        if scheduler_type == "step":
            self.scheduler = optim.lr_scheduler.StepLR(
                self.optimizer,
                step_size=3,
                gamma=0.1
            )
        elif scheduler_type == "cosine":
            self.scheduler = optim.lr_scheduler.CosineAnnealingLR(
                self.optimizer,
                T_max=10
            )
        else:
            self.scheduler = None

        logger.info(
            f"Training setup complete - LR: {learning_rate}, "
            f"Scheduler: {scheduler_type}"
        )

    def train_epoch(
        self,
        train_loader: DataLoader,
        epoch: int
    ) -> Dict[str, float]:
        """Train for one epoch.

        Args:
            train_loader: Training data loader
            epoch: Current epoch number

        Returns:
            Dictionary of training metrics
        """
        self.model.train()
        epoch_losses = []
        batch_times = []

        for batch_idx, (images, targets) in enumerate(train_loader):
            start_time = time.time()

            # Move to device
            images = list(img.to(self.device) for img in images)
            targets = [{k: v.to(self.device) for k, v in t.items()}
                      for t in targets]

            # Forward pass
            loss_dict = self.model(images, targets)
            losses = sum(loss for loss in loss_dict.values())

            # Backward pass
            self.optimizer.zero_grad()
            losses.backward()
            self.optimizer.step()

            # Track metrics
            batch_time = time.time() - start_time
            batch_times.append(batch_time)
            epoch_losses.append(losses.item())

            # Log progress
            if batch_idx % 10 == 0:
                logger.info(
                    f"Epoch {epoch} [{batch_idx}/{len(train_loader)}] "
                    f"Loss: {losses.item():.4f} "
                    f"Time: {batch_time:.2f}s"
                )

        # Calculate epoch metrics
        metrics = {
            'epoch': epoch,
            'train_loss': sum(epoch_losses) / len(epoch_losses),
            'avg_batch_time': sum(batch_times) / len(batch_times),
            'learning_rate': self.optimizer.param_groups[0]['lr']
        }

        return metrics

    def validate(
        self,
        val_loader: DataLoader,
        epoch: int
    ) -> Dict[str, float]:
        """Validate the model.

        Args:
            val_loader: Validation data loader
            epoch: Current epoch number

        Returns:
            Dictionary of validation metrics
        """
        self.model.eval()
        val_losses = []

        with torch.no_grad():
            for images, targets in val_loader:
                # Move to device
                images = list(img.to(self.device) for img in images)
                targets = [{k: v.to(self.device) for k, v in t.items()}
                          for t in targets]

                # Get predictions (inference mode)
                predictions = self.model(images)

                # For validation loss, we need to temporarily set to train mode
                self.model.train()
                loss_dict = self.model(images, targets)
                losses = sum(loss for loss in loss_dict.values())
                self.model.eval()

                val_losses.append(losses.item())

        metrics = {
            'epoch': epoch,
            'val_loss': sum(val_losses) / len(val_losses) if val_losses else 0
        }

        return metrics

    def train(
        self,
        train_loader: DataLoader,
        val_loader: DataLoader,
        num_epochs: int = 10,
        save_best: bool = True,
        early_stopping_patience: int = 5
    ) -> Dict[str, Any]:
        """Full training loop.

        Args:
            train_loader: Training data loader
            val_loader: Validation data loader
            num_epochs: Number of epochs to train
            save_best: Whether to save best model
            early_stopping_patience: Patience for early stopping

        Returns:
            Training results and history
        """
        if self.model is None or self.optimizer is None:
            raise ValueError("Model and optimizer must be initialized")

        best_val_loss = float('inf')
        patience_counter = 0
        training_start = time.time()

        logger.info(f"Starting training for {num_epochs} epochs")

        for epoch in range(1, num_epochs + 1):
            epoch_start = time.time()

            # Training phase
            train_metrics = self.train_epoch(train_loader, epoch)
            self.metrics_tracker.update_metrics('train', train_metrics)

            # Validation phase
            val_metrics = self.validate(val_loader, epoch)
            self.metrics_tracker.update_metrics('validation', val_metrics)

            # Learning rate scheduling
            if self.scheduler:
                self.scheduler.step()

            # Combine metrics
            epoch_metrics = {**train_metrics, **val_metrics}
            epoch_metrics['epoch_time'] = time.time() - epoch_start
            self.training_history.append(epoch_metrics)

            # Log epoch summary
            logger.info(
                f"Epoch {epoch}/{num_epochs} - "
                f"Train Loss: {train_metrics['train_loss']:.4f}, "
                f"Val Loss: {val_metrics['val_loss']:.4f}, "
                f"Time: {epoch_metrics['epoch_time']:.2f}s"
            )

            # Save checkpoint
            if save_best and val_metrics['val_loss'] < best_val_loss:
                best_val_loss = val_metrics['val_loss']
                patience_counter = 0
                self.save_checkpoint(epoch, val_metrics['val_loss'], is_best=True)
                logger.info(f"Saved best model at epoch {epoch}")
            else:
                patience_counter += 1

            # Early stopping
            if patience_counter >= early_stopping_patience:
                logger.info(f"Early stopping at epoch {epoch}")
                break

            # Regular checkpoint
            if epoch % 5 == 0:
                self.save_checkpoint(epoch, val_metrics['val_loss'])

        training_time = time.time() - training_start

        # Final results
        results = {
            'total_epochs': epoch,
            'best_val_loss': best_val_loss,
            'training_time': training_time,
            'final_train_loss': train_metrics['train_loss'],
            'final_val_loss': val_metrics['val_loss'],
            'history': self.training_history,
            'metrics_summary': self.metrics_tracker.get_summary()
        }

        logger.info(
            f"Training completed - Epochs: {epoch}, "
            f"Best Val Loss: {best_val_loss:.4f}, "
            f"Time: {training_time/60:.2f} minutes"
        )

        return results

    def save_checkpoint(
        self,
        epoch: int,
        val_loss: float,
        is_best: bool = False
    ):
        """Save model checkpoint.

        Args:
            epoch: Current epoch
            val_loss: Validation loss
            is_best: Whether this is the best model
        """
        checkpoint = {
            'epoch': epoch,
            'model_state_dict': self.model.state_dict(),
            'optimizer_state_dict': self.optimizer.state_dict(),
            'scheduler_state_dict': self.scheduler.state_dict() if self.scheduler else None,
            'val_loss': val_loss,
            'model_type': self.model_type,
            'num_classes': self.num_classes,
            'training_history': self.training_history,
            'timestamp': datetime.now().isoformat()
        }

        # Save checkpoint
        if is_best:
            path = self.checkpoint_dir / 'best_model.pth'
        else:
            path = self.checkpoint_dir / f'checkpoint_epoch_{epoch}.pth'

        torch.save(checkpoint, path)
        logger.info(f"Checkpoint saved: {path}")

        # Also save training history
        history_path = self.checkpoint_dir / 'training_history.json'
        with open(history_path, 'w') as f:
            json.dump(self.training_history, f, indent=2)

    def load_checkpoint(self, checkpoint_path: str):
        """Load model from checkpoint.

        Args:
            checkpoint_path: Path to checkpoint file
        """
        checkpoint = torch.load(checkpoint_path, map_location=self.device)

        # Initialize model if needed
        if self.model is None:
            self.initialize_model()

        # Load state
        self.model.load_state_dict(checkpoint['model_state_dict'])

        if self.optimizer:
            self.optimizer.load_state_dict(checkpoint['optimizer_state_dict'])

        if self.scheduler and checkpoint.get('scheduler_state_dict'):
            self.scheduler.load_state_dict(checkpoint['scheduler_state_dict'])

        # Load history
        self.training_history = checkpoint.get('training_history', [])

        logger.info(
            f"Checkpoint loaded from {checkpoint_path} - "
            f"Epoch: {checkpoint.get('epoch')}, "
            f"Val Loss: {checkpoint.get('val_loss', 'N/A')}"
        )

    def export_model(
        self,
        export_path: str,
        format: str = "torchscript"
    ):
        """Export trained model.

        Args:
            export_path: Path to export model
            format: Export format (torchscript, onnx)
        """
        if self.model is None:
            raise ValueError("No model to export")

        self.model.eval()

        if format == "torchscript":
            # Export as TorchScript
            example_input = torch.randn(1, 3, 640, 640).to(self.device)
            traced_model = torch.jit.trace(self.model, example_input)
            torch.jit.save(traced_model, export_path)
            logger.info(f"Model exported as TorchScript: {export_path}")

        elif format == "onnx":
            # Export as ONNX
            example_input = torch.randn(1, 3, 640, 640).to(self.device)
            torch.onnx.export(
                self.model,
                example_input,
                export_path,
                opset_version=11,
                input_names=['input'],
                output_names=['output'],
                dynamic_axes={'input': {0: 'batch_size'}}
            )
            logger.info(f"Model exported as ONNX: {export_path}")

        else:
            raise ValueError(f"Unsupported export format: {format}")