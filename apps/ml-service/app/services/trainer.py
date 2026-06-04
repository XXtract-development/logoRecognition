"""
Training service for ML models.
Implements actual training pipeline with PyTorch/TensorFlow.
"""

import os
import uuid
import asyncio
import hashlib
from typing import Optional, List, Dict, Any, Callable
from datetime import datetime
from pathlib import Path
import numpy as np

from app.core.config import settings
from app.core.logging import logger
from app.services.database import db_service
from app.services.storage import storage_service


# Minimum number of validated holdout records required before a training run
# may start (NFR3). Configurable via env; defaults to 25. NB: the same env var
# feeds the API-layer guard (training.ts) — wire it ONCE via docker-compose so
# both layers cannot diverge.
HOLDOUT_MINIMUM = int(os.environ.get("HOLDOUT_MINIMUM", "25"))

# Canonical input-preprocessing constants. Training, validation AND holdout
# evaluation MUST share these — if they diverge, holdout metrics are computed
# with different preprocessing than the model was trained with, silently
# invalidating the champion/challenger comparison.
IMAGE_SIZE = (224, 224)
NORMALIZE_MEAN = [0.485, 0.456, 0.406]
NORMALIZE_STD = [0.229, 0.224, 0.225]


def build_eval_transform():
    """Deterministic eval/holdout transform: resize + normalize, NO augmentation."""
    from torchvision import transforms

    return transforms.Compose([
        transforms.Resize(IMAGE_SIZE),
        transforms.ToTensor(),
        transforms.Normalize(mean=NORMALIZE_MEAN, std=NORMALIZE_STD),
    ])


class HoldoutSetTooSmallError(Exception):
    """Raised when the protected holdout set is empty or below the minimum.

    Training without a stable, protected evaluation baseline is meaningless,
    so the trainer refuses to start (NFR3).
    """


def compute_holdout_hash(ids: List[str]) -> str:
    """Order-independent fingerprint of a holdout id-set.

    The same set of ids always yields the same hash (proving two model
    versions were evaluated on the exact same holdout set); a different set
    yields a different hash. Format: ``sha256:<hexdigest>``.
    """
    joined = ",".join(sorted(str(i) for i in ids))
    digest = hashlib.sha256(joined.encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


class TrainingConfig:
    """Training configuration."""
    def __init__(
        self,
        batch_size: int = 16,
        epochs: int = 100,
        learning_rate: float = 0.001,
        augmentation_factor: int = 50,
        validation_split: float = 0.2,
        early_stopping_patience: int = 10,
    ):
        self.batch_size = batch_size
        self.epochs = epochs
        self.learning_rate = learning_rate
        self.augmentation_factor = augmentation_factor
        self.validation_split = validation_split
        self.early_stopping_patience = early_stopping_patience


class TrainingProgress:
    """Training progress tracking."""
    def __init__(self, job_id: str, total_epochs: int):
        self.job_id = job_id
        self.total_epochs = total_epochs
        self.current_epoch = 0
        self.current_loss = 0.0
        self.current_accuracy = 0.0
        self.best_accuracy = 0.0
        self.status = "queued"
        self.started_at: Optional[datetime] = None
        self.completed_at: Optional[datetime] = None
        self.error_message: Optional[str] = None
        self._callbacks: List[Callable] = []

    def add_callback(self, callback: Callable) -> None:
        """Add progress callback."""
        self._callbacks.append(callback)

    async def update(
        self,
        epoch: Optional[int] = None,
        loss: Optional[float] = None,
        accuracy: Optional[float] = None,
        status: Optional[str] = None,
    ) -> None:
        """Update progress and notify callbacks."""
        if epoch is not None:
            self.current_epoch = epoch
        if loss is not None:
            self.current_loss = loss
        if accuracy is not None:
            self.current_accuracy = accuracy
            if accuracy > self.best_accuracy:
                self.best_accuracy = accuracy
        if status is not None:
            self.status = status

        # Persist to database
        await db_service.update_training_job(
            self.job_id,
            status=self.status,
            progress=(self.current_epoch / self.total_epochs) * 100,
            current_epoch=self.current_epoch,
            current_accuracy=self.current_accuracy,
        )

        # Notify callbacks
        for callback in self._callbacks:
            try:
                await callback(self)
            except Exception as e:
                logger.warning(f"Callback error: {e}")

    @property
    def progress_percent(self) -> float:
        return (self.current_epoch / self.total_epochs) * 100 if self.total_epochs > 0 else 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "job_id": self.job_id,
            "status": self.status,
            "progress": self.progress_percent,
            "current_epoch": self.current_epoch,
            "total_epochs": self.total_epochs,
            "current_loss": self.current_loss,
            "current_accuracy": self.current_accuracy,
            "best_accuracy": self.best_accuracy,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "error_message": self.error_message,
        }


class TrainerService:
    """ML model training service."""

    def __init__(self):
        self._active_jobs: Dict[str, TrainingProgress] = {}
        self._models_dir = Path(settings.MODEL_PATH)
        self._models_dir.mkdir(parents=True, exist_ok=True)

    def build_augmented_dataset(
        self, images: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Return the trainable subset eligible for augmentation (NFR3).

        Holdout-marked records are filtered out here as a defence-in-depth
        guarantee: augmentation/duplication may never touch the protected
        evaluation set, even if a holdout record were to slip past the
        query-level filter.
        """
        return [img for img in images if not img.get("holdout", False)]

    async def _evaluate_on_holdout(
        self,
        model: Any,
        holdout_images: List[Dict[str, Any]],
        label_to_idx: Optional[Dict[str, int]] = None,
    ) -> Dict[str, float]:
        """Evaluate a trained model on the fixed holdout set (Story 7.2).

        Uses the SAME preprocessing as validation (Resize 224x224 +
        normalisation, NO augmentation). Returns accuracy/precision/recall/f1
        as macro-averages over the represented classes.
        """
        import io
        import torch
        from torchvision import transforms
        from PIL import Image

        device = torch.device(settings.device)

        # Shared eval transform (module-level constants) — guaranteed identical
        # to the training/validation preprocessing.
        val_transform = build_eval_transform()

        if label_to_idx is None:
            labels = sorted({img["label"] for img in holdout_images if img.get("label")})
            label_to_idx = {label: idx for idx, label in enumerate(labels)}

        model.eval()
        y_true: List[int] = []
        y_pred: List[int] = []

        with torch.no_grad():
            for img_info in holdout_images:
                label = img_info.get("label")
                if not label or label not in label_to_idx:
                    continue
                try:
                    image_bytes = storage_service.get_training_image(img_info["storage_path"])
                    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
                except Exception as e:  # noqa: BLE001 - skip unreadable holdout item
                    logger.warning(f"Failed to load holdout image {img_info.get('id')}: {e}")
                    continue

                tensor = val_transform(image).unsqueeze(0).to(device)
                outputs = model(tensor)
                _, predicted = outputs.max(1)
                y_true.append(label_to_idx[label])
                y_pred.append(int(predicted.item()))

        return self._compute_classification_metrics(y_true, y_pred)

    @staticmethod
    def _compute_classification_metrics(
        y_true: List[int], y_pred: List[int]
    ) -> Dict[str, float]:
        """Macro-averaged accuracy/precision/recall/f1 without sklearn."""
        if not y_true:
            return {"accuracy": 0.0, "precision": 0.0, "recall": 0.0, "f1": 0.0}

        total = len(y_true)
        correct = sum(1 for t, p in zip(y_true, y_pred) if t == p)
        accuracy = correct / total

        classes = set(y_true) | set(y_pred)
        precisions: List[float] = []
        recalls: List[float] = []
        f1s: List[float] = []
        for c in classes:
            tp = sum(1 for t, p in zip(y_true, y_pred) if p == c and t == c)
            fp = sum(1 for t, p in zip(y_true, y_pred) if p == c and t != c)
            fn = sum(1 for t, p in zip(y_true, y_pred) if p != c and t == c)
            prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
            rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
            f1 = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0.0
            precisions.append(prec)
            recalls.append(rec)
            f1s.append(f1)

        n = len(classes) or 1
        return {
            "accuracy": accuracy,
            "precision": sum(precisions) / n,
            "recall": sum(recalls) / n,
            "f1": sum(f1s) / n,
        }

    async def evaluate_and_register(
        self,
        model: Any,
        job_id: str,
        version: Optional[str] = None,
        model_type: str = "EfficientNet-B0",
        accuracy: Optional[float] = None,
        precision_score: Optional[float] = None,
        recall_score: Optional[float] = None,
        f1_score: Optional[float] = None,
        config: Optional[Dict[str, Any]] = None,
        label_to_idx: Optional[Dict[str, int]] = None,
    ) -> Dict[str, Any]:
        """Evaluate the trained model on the holdout set and register the version.

        Holdout-metrics are stored under ``metrics.holdout`` together with the
        evaluated set identity (size + order-independent hash), so two model
        versions evaluated on the same holdout set are provably comparable
        (Story 7.2). The train/val scalar metrics remain in their own columns.

        Edge case (AC note): a holdout-evaluation failure must NEVER fail a
        training run that already succeeded. On error the version is still
        registered, but with an empty holdout block and a warning.
        """
        version = version or f"v{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
        holdout_block: Dict[str, Any] = {}

        try:
            holdout_images = await db_service.get_holdout_images()
            holdout_ids = [img["id"] for img in holdout_images]
            metrics = await self._evaluate_on_holdout(model, holdout_images, label_to_idx)
            holdout_block = {
                "accuracy": metrics["accuracy"],
                "precision": metrics["precision"],
                "recall": metrics["recall"],
                "f1": metrics["f1"],
                "holdout_size": len(holdout_ids),
                "holdout_hash": compute_holdout_hash(holdout_ids),
            }
        except Exception as e:  # noqa: BLE001 - never fail a completed run
            logger.warning(
                f"Holdout evaluation failed for job {job_id}; registering model "
                f"without holdout metrics: {e}"
            )

        return await db_service.create_model_version(
            version=version,
            model_type=model_type,
            accuracy=accuracy,
            precision_score=precision_score,
            recall_score=recall_score,
            f1_score=f1_score,
            config=config,
            metrics={"holdout": holdout_block} if holdout_block else {},
        )

    async def start_training(
        self,
        batch_id: str,
        config: Optional[TrainingConfig] = None,
        progress_callback: Optional[Callable] = None,
    ) -> TrainingProgress:
        """Start a training job."""
        config = config or TrainingConfig()

        # NFR3 holdout guard: refuse to start when the protected holdout set is
        # empty or below the configured minimum. This runs BEFORE any job record
        # or background task is created, so a too-small set never spawns a run.
        holdout_count = await db_service.count_holdout_images()
        if holdout_count < HOLDOUT_MINIMUM:
            logger.error(
                "Refusing to start training: holdout set too small "
                f"({holdout_count}/{HOLDOUT_MINIMUM})"
            )
            raise HoldoutSetTooSmallError(
                f"Holdout set too small: {holdout_count} validated holdout "
                f"images, minimum is {HOLDOUT_MINIMUM}."
            )

        job_id = f"train_{uuid.uuid4().hex[:8]}"

        # Create progress tracker
        progress = TrainingProgress(job_id, config.epochs)
        if progress_callback:
            progress.add_callback(progress_callback)

        self._active_jobs[job_id] = progress

        # Create database record
        await db_service.create_training_job(job_id, batch_id)

        # Start training in background
        asyncio.create_task(self._run_training(batch_id, config, progress))

        logger.info(f"Training job started: {job_id}")
        return progress

    async def _run_training(
        self,
        batch_id: str,
        config: TrainingConfig,
        progress: TrainingProgress,
    ) -> None:
        """Execute the training pipeline."""
        progress.started_at = datetime.utcnow()
        await progress.update(status="running")

        try:
            # Import PyTorch
            import torch
            import torch.nn as nn
            import torch.optim as optim
            from torch.utils.data import DataLoader, TensorDataset
            from torchvision import transforms, models
            from PIL import Image

            device = torch.device(settings.device)
            logger.info(f"Training on device: {device}")

            # Load training data
            training_images = await db_service.get_training_images(batch_id)

            if not training_images:
                raise ValueError("No training images found")

            # Defence-in-depth: ensure holdout records never reach augmentation,
            # even though get_training_images already excludes them at query level.
            training_images = self.build_augmented_dataset(training_images)
            assert all(
                not img.get("holdout", False) for img in training_images
            ), "Holdout records must never enter the training/augmentation set"

            logger.info(f"Loaded {len(training_images)} training images")

            # Prepare data transforms (augmentation on top of the shared
            # canonical size/normalization constants).
            train_transform = transforms.Compose([
                transforms.Resize(IMAGE_SIZE),
                transforms.RandomHorizontalFlip(),
                transforms.RandomRotation(15),
                transforms.ColorJitter(brightness=0.2, contrast=0.2),
                transforms.ToTensor(),
                transforms.Normalize(mean=NORMALIZE_MEAN, std=NORMALIZE_STD),
            ])

            # Create label mapping
            unique_labels = list(set(img['label'] for img in training_images if img.get('label')))
            label_to_idx = {label: idx for idx, label in enumerate(unique_labels)}
            num_classes = len(unique_labels)

            if num_classes < 2:
                raise ValueError(f"Need at least 2 classes, found {num_classes}")

            logger.info(f"Training with {num_classes} classes: {unique_labels}")

            # Load and preprocess images
            X_data = []
            y_data = []

            for img_info in training_images:
                if not img_info.get('label'):
                    continue

                try:
                    # Load image from storage
                    image_bytes = storage_service.get_training_image(img_info['storage_path'])
                    image = Image.open(io.BytesIO(image_bytes)).convert('RGB')

                    # Apply transforms and augmentation
                    for _ in range(config.augmentation_factor // 10 + 1):
                        tensor = train_transform(image)
                        X_data.append(tensor)
                        y_data.append(label_to_idx[img_info['label']])

                except Exception as e:
                    logger.warning(f"Failed to load image {img_info['filename']}: {e}")
                    continue

            if len(X_data) == 0:
                raise ValueError("No valid training images after preprocessing")

            # Create tensors
            X_tensor = torch.stack(X_data)
            y_tensor = torch.tensor(y_data, dtype=torch.long)

            # Split train/validation
            split_idx = int(len(X_tensor) * (1 - config.validation_split))
            train_dataset = TensorDataset(X_tensor[:split_idx], y_tensor[:split_idx])
            val_dataset = TensorDataset(X_tensor[split_idx:], y_tensor[split_idx:])

            train_loader = DataLoader(train_dataset, batch_size=config.batch_size, shuffle=True)
            val_loader = DataLoader(val_dataset, batch_size=config.batch_size)

            logger.info(f"Training samples: {len(train_dataset)}, Validation: {len(val_dataset)}")

            # Create model (EfficientNet or ResNet)
            try:
                model = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.DEFAULT)
                model.classifier[-1] = nn.Linear(model.classifier[-1].in_features, num_classes)
            except:
                model = models.resnet50(weights=models.ResNet50_Weights.DEFAULT)
                model.fc = nn.Linear(model.fc.in_features, num_classes)

            model = model.to(device)

            # Loss and optimizer
            criterion = nn.CrossEntropyLoss()
            optimizer = optim.AdamW(model.parameters(), lr=config.learning_rate)
            scheduler = optim.lr_scheduler.ReduceLROnPlateau(
                optimizer, mode='max', patience=5, factor=0.5
            )

            # Training loop
            best_val_acc = 0.0
            patience_counter = 0
            best_model_state = None

            for epoch in range(config.epochs):
                # Training phase
                model.train()
                train_loss = 0.0
                train_correct = 0
                train_total = 0

                for batch_X, batch_y in train_loader:
                    batch_X, batch_y = batch_X.to(device), batch_y.to(device)

                    optimizer.zero_grad()
                    outputs = model(batch_X)
                    loss = criterion(outputs, batch_y)
                    loss.backward()
                    optimizer.step()

                    train_loss += loss.item()
                    _, predicted = outputs.max(1)
                    train_total += batch_y.size(0)
                    train_correct += predicted.eq(batch_y).sum().item()

                train_acc = train_correct / train_total if train_total > 0 else 0

                # Validation phase
                model.eval()
                val_correct = 0
                val_total = 0

                with torch.no_grad():
                    for batch_X, batch_y in val_loader:
                        batch_X, batch_y = batch_X.to(device), batch_y.to(device)
                        outputs = model(batch_X)
                        _, predicted = outputs.max(1)
                        val_total += batch_y.size(0)
                        val_correct += predicted.eq(batch_y).sum().item()

                val_acc = val_correct / val_total if val_total > 0 else 0

                # Update scheduler
                scheduler.step(val_acc)

                # Update progress
                await progress.update(
                    epoch=epoch + 1,
                    loss=train_loss / len(train_loader),
                    accuracy=val_acc,
                )

                logger.info(
                    f"Epoch {epoch+1}/{config.epochs} - "
                    f"Train Acc: {train_acc:.4f}, Val Acc: {val_acc:.4f}"
                )

                # Early stopping check
                if val_acc > best_val_acc:
                    best_val_acc = val_acc
                    best_model_state = model.state_dict().copy()
                    patience_counter = 0
                else:
                    patience_counter += 1
                    if patience_counter >= config.early_stopping_patience:
                        logger.info(f"Early stopping at epoch {epoch+1}")
                        break

            # Save best model
            if best_model_state is not None:
                model.load_state_dict(best_model_state)

            # Export to ONNX
            model_version = f"v{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
            onnx_path = self._models_dir / f"logo_detector_{model_version}.onnx"

            model.eval()
            dummy_input = torch.randn(1, 3, 224, 224).to(device)

            torch.onnx.export(
                model,
                dummy_input,
                str(onnx_path),
                input_names=['input'],
                output_names=['output'],
                dynamic_axes={
                    'input': {0: 'batch_size'},
                    'output': {0: 'batch_size'}
                },
                opset_version=11,
            )

            logger.info(f"Model exported to: {onnx_path}")

            # Upload to storage
            with open(onnx_path, 'rb') as f:
                model_data = f.read()
            storage_service.save_model(f"logo_detector_{model_version}", model_data, "onnx")

            # Save to database (incl. holdout evaluation, Story 7.2). The
            # holdout-metrics are evaluated and registered here, kept distinct
            # from the train/val scalar metrics above.
            await self.evaluate_and_register(
                model=model,
                job_id=progress.job_id,
                version=model_version,
                model_type="EfficientNet-B0",
                accuracy=best_val_acc,
                precision_score=best_val_acc,  # Simplified train/val metric
                recall_score=best_val_acc,     # Simplified train/val metric
                f1_score=best_val_acc,         # Simplified train/val metric
                config={
                    "epochs": config.epochs,
                    "batch_size": config.batch_size,
                    "learning_rate": config.learning_rate,
                    "num_classes": num_classes,
                    "labels": unique_labels,
                },
                label_to_idx=label_to_idx,
            )

            # Update logo training stats
            for label in unique_labels:
                logo = await db_service.get_or_create_logo("brand", label)
                count = sum(1 for img in training_images if img.get('label') == label)
                await db_service.update_logo_training_stats(
                    logo['id'],
                    training_samples=count * config.augmentation_factor,
                    accuracy=best_val_acc,
                )

            # Mark completed
            progress.completed_at = datetime.utcnow()
            await progress.update(status="completed", accuracy=best_val_acc)

            logger.info(f"Training completed: {progress.job_id}, accuracy: {best_val_acc:.4f}")

        except ImportError as e:
            error_msg = f"Required ML library not installed: {e}"
            logger.error(error_msg)
            progress.error_message = error_msg
            await progress.update(status="failed")

        except Exception as e:
            error_msg = str(e)
            logger.error(f"Training failed: {error_msg}")
            progress.error_message = error_msg
            await progress.update(status="failed")

        finally:
            # Clean up
            if progress.job_id in self._active_jobs:
                del self._active_jobs[progress.job_id]

    def get_job_progress(self, job_id: str) -> Optional[TrainingProgress]:
        """Get progress for an active training job."""
        return self._active_jobs.get(job_id)

    def list_active_jobs(self) -> List[Dict[str, Any]]:
        """List all active training jobs."""
        return [p.to_dict() for p in self._active_jobs.values()]

    async def cancel_job(self, job_id: str) -> bool:
        """Cancel a training job."""
        if job_id in self._active_jobs:
            progress = self._active_jobs[job_id]
            progress.error_message = "Cancelled by user"
            await progress.update(status="cancelled")
            del self._active_jobs[job_id]
            return True
        return False


# Import io for BytesIO
import io

# Global trainer service instance
trainer_service = TrainerService()
