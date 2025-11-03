"""Metrics tracking for model training and evaluation."""

import json
import logging
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score
)

logger = logging.getLogger(__name__)


class MetricsTracker:
    """Track and analyze training metrics."""

    def __init__(self, save_dir: Optional[str] = None):
        """Initialize metrics tracker.

        Args:
            save_dir: Directory to save metrics
        """
        self.save_dir = Path(save_dir) if save_dir else None
        if self.save_dir:
            self.save_dir.mkdir(parents=True, exist_ok=True)

        self.metrics_history = defaultdict(list)
        self.best_metrics = {}
        self.current_metrics = {}
        self.experiment_info = {}

    def start_experiment(
        self,
        experiment_name: str,
        config: Dict[str, Any],
        description: Optional[str] = None
    ):
        """Start a new experiment.

        Args:
            experiment_name: Name of the experiment
            config: Experiment configuration
            description: Optional description
        """
        self.experiment_info = {
            'name': experiment_name,
            'config': config,
            'description': description,
            'start_time': datetime.now().isoformat(),
            'status': 'running'
        }

        logger.info(f"Started experiment: {experiment_name}")

        # Save initial experiment info
        if self.save_dir:
            self._save_experiment_info()

    def update_metrics(
        self,
        phase: str,
        metrics: Dict[str, float],
        epoch: Optional[int] = None
    ):
        """Update metrics for a phase.

        Args:
            phase: Phase name (train, validation, test)
            metrics: Dictionary of metric values
            epoch: Optional epoch number
        """
        # Add timestamp
        metrics['timestamp'] = datetime.now().isoformat()
        if epoch is not None:
            metrics['epoch'] = epoch

        # Store in history
        self.metrics_history[phase].append(metrics)
        self.current_metrics[phase] = metrics

        # Update best metrics
        for key, value in metrics.items():
            if key in ['loss', 'error']:  # Lower is better
                best_key = f"best_{phase}_{key}"
                if best_key not in self.best_metrics or value < self.best_metrics[best_key]:
                    self.best_metrics[best_key] = value
                    self.best_metrics[f"{best_key}_epoch"] = epoch
            elif key in ['accuracy', 'precision', 'recall', 'f1']:  # Higher is better
                best_key = f"best_{phase}_{key}"
                if best_key not in self.best_metrics or value > self.best_metrics[best_key]:
                    self.best_metrics[best_key] = value
                    self.best_metrics[f"{best_key}_epoch"] = epoch

        logger.debug(f"Updated {phase} metrics: {metrics}")

    def calculate_detection_metrics(
        self,
        predictions: List[Dict],
        ground_truths: List[Dict],
        iou_threshold: float = 0.5
    ) -> Dict[str, float]:
        """Calculate object detection metrics.

        Args:
            predictions: List of prediction dictionaries
            ground_truths: List of ground truth dictionaries
            iou_threshold: IOU threshold for matching

        Returns:
            Dictionary of detection metrics
        """
        true_positives = 0
        false_positives = 0
        false_negatives = 0

        for pred, gt in zip(predictions, ground_truths):
            pred_boxes = pred.get('boxes', [])
            gt_boxes = gt.get('boxes', [])

            # Match predictions to ground truth
            matched_gt = set()
            for pred_box in pred_boxes:
                matched = False
                for i, gt_box in enumerate(gt_boxes):
                    if i not in matched_gt:
                        iou = self._calculate_iou(pred_box, gt_box)
                        if iou >= iou_threshold:
                            true_positives += 1
                            matched_gt.add(i)
                            matched = True
                            break

                if not matched:
                    false_positives += 1

            # Unmatched ground truths are false negatives
            false_negatives += len(gt_boxes) - len(matched_gt)

        # Calculate metrics
        precision = true_positives / (true_positives + false_positives) if (true_positives + false_positives) > 0 else 0
        recall = true_positives / (true_positives + false_negatives) if (true_positives + false_negatives) > 0 else 0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0

        metrics = {
            'precision': precision,
            'recall': recall,
            'f1_score': f1,
            'true_positives': true_positives,
            'false_positives': false_positives,
            'false_negatives': false_negatives,
            'iou_threshold': iou_threshold
        }

        return metrics

    def _calculate_iou(self, box1: List[float], box2: List[float]) -> float:
        """Calculate Intersection over Union.

        Args:
            box1: First box [x1, y1, x2, y2]
            box2: Second box [x1, y1, x2, y2]

        Returns:
            IOU value
        """
        # Calculate intersection
        x1 = max(box1[0], box2[0])
        y1 = max(box1[1], box2[1])
        x2 = min(box1[2], box2[2])
        y2 = min(box1[3], box2[3])

        if x2 < x1 or y2 < y1:
            return 0.0

        intersection = (x2 - x1) * (y2 - y1)

        # Calculate areas
        area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
        area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])

        # Calculate union
        union = area1 + area2 - intersection

        return intersection / union if union > 0 else 0.0

    def calculate_classification_metrics(
        self,
        y_true: List[int],
        y_pred: List[int],
        class_names: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Calculate classification metrics.

        Args:
            y_true: True labels
            y_pred: Predicted labels
            class_names: Optional class names

        Returns:
            Dictionary of classification metrics
        """
        metrics = {
            'accuracy': accuracy_score(y_true, y_pred),
            'precision': precision_score(y_true, y_pred, average='weighted', zero_division=0),
            'recall': recall_score(y_true, y_pred, average='weighted', zero_division=0),
            'f1_score': f1_score(y_true, y_pred, average='weighted', zero_division=0),
            'confusion_matrix': confusion_matrix(y_true, y_pred).tolist(),
            'classification_report': classification_report(
                y_true, y_pred,
                target_names=class_names,
                output_dict=True,
                zero_division=0
            )
        }

        return metrics

    def calculate_map(
        self,
        predictions: List[Dict],
        ground_truths: List[Dict],
        iou_thresholds: Optional[List[float]] = None
    ) -> Dict[str, float]:
        """Calculate Mean Average Precision (mAP).

        Args:
            predictions: Predictions with confidence scores
            ground_truths: Ground truth annotations
            iou_thresholds: IOU thresholds for mAP calculation

        Returns:
            Dictionary with mAP values
        """
        if iou_thresholds is None:
            iou_thresholds = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]

        average_precisions = []

        for iou_threshold in iou_thresholds:
            detection_metrics = self.calculate_detection_metrics(
                predictions,
                ground_truths,
                iou_threshold
            )
            average_precisions.append(detection_metrics['precision'])

        map_value = np.mean(average_precisions)

        return {
            'mAP': map_value,
            'mAP@0.5': average_precisions[0] if average_precisions else 0,
            'mAP@0.75': average_precisions[5] if len(average_precisions) > 5 else 0,
            'iou_thresholds': iou_thresholds,
            'average_precisions': average_precisions
        }

    def plot_training_curves(self, save_path: Optional[str] = None):
        """Plot training curves.

        Args:
            save_path: Optional path to save plot
        """
        try:
            import matplotlib.pyplot as plt

            fig, axes = plt.subplots(2, 2, figsize=(12, 10))

            # Plot loss curves
            if 'train' in self.metrics_history:
                train_losses = [m.get('train_loss', m.get('loss', 0))
                               for m in self.metrics_history['train']]
                epochs = list(range(1, len(train_losses) + 1))
                axes[0, 0].plot(epochs, train_losses, label='Train Loss')

            if 'validation' in self.metrics_history:
                val_losses = [m.get('val_loss', m.get('loss', 0))
                             for m in self.metrics_history['validation']]
                epochs = list(range(1, len(val_losses) + 1))
                axes[0, 0].plot(epochs, val_losses, label='Val Loss')

            axes[0, 0].set_xlabel('Epoch')
            axes[0, 0].set_ylabel('Loss')
            axes[0, 0].set_title('Loss Curves')
            axes[0, 0].legend()
            axes[0, 0].grid(True)

            # Plot accuracy curves
            if 'train' in self.metrics_history:
                train_acc = [m.get('accuracy', 0)
                            for m in self.metrics_history['train']
                            if 'accuracy' in m]
                if train_acc:
                    epochs = list(range(1, len(train_acc) + 1))
                    axes[0, 1].plot(epochs, train_acc, label='Train Accuracy')

            if 'validation' in self.metrics_history:
                val_acc = [m.get('accuracy', 0)
                          for m in self.metrics_history['validation']
                          if 'accuracy' in m]
                if val_acc:
                    epochs = list(range(1, len(val_acc) + 1))
                    axes[0, 1].plot(epochs, val_acc, label='Val Accuracy')

            axes[0, 1].set_xlabel('Epoch')
            axes[0, 1].set_ylabel('Accuracy')
            axes[0, 1].set_title('Accuracy Curves')
            axes[0, 1].legend()
            axes[0, 1].grid(True)

            # Plot learning rate
            if 'train' in self.metrics_history:
                lrs = [m.get('learning_rate', 0)
                      for m in self.metrics_history['train']
                      if 'learning_rate' in m]
                if lrs:
                    epochs = list(range(1, len(lrs) + 1))
                    axes[1, 0].plot(epochs, lrs)
                    axes[1, 0].set_xlabel('Epoch')
                    axes[1, 0].set_ylabel('Learning Rate')
                    axes[1, 0].set_title('Learning Rate Schedule')
                    axes[1, 0].grid(True)

            # Plot F1 scores
            if 'validation' in self.metrics_history:
                f1_scores = [m.get('f1_score', 0)
                            for m in self.metrics_history['validation']
                            if 'f1_score' in m]
                if f1_scores:
                    epochs = list(range(1, len(f1_scores) + 1))
                    axes[1, 1].plot(epochs, f1_scores)
                    axes[1, 1].set_xlabel('Epoch')
                    axes[1, 1].set_ylabel('F1 Score')
                    axes[1, 1].set_title('F1 Score Progress')
                    axes[1, 1].grid(True)

            plt.tight_layout()

            if save_path:
                plt.savefig(save_path, dpi=100, bbox_inches='tight')
                logger.info(f"Training curves saved to {save_path}")
            else:
                plt.show()

        except ImportError:
            logger.warning("Matplotlib not available for plotting")

    def get_summary(self) -> Dict[str, Any]:
        """Get metrics summary.

        Returns:
            Dictionary with metrics summary
        """
        summary = {
            'experiment': self.experiment_info,
            'current_metrics': self.current_metrics,
            'best_metrics': self.best_metrics,
            'history_length': {
                phase: len(history)
                for phase, history in self.metrics_history.items()
            }
        }

        # Add final metrics
        if 'train' in self.metrics_history and self.metrics_history['train']:
            summary['final_train_metrics'] = self.metrics_history['train'][-1]

        if 'validation' in self.metrics_history and self.metrics_history['validation']:
            summary['final_val_metrics'] = self.metrics_history['validation'][-1]

        return summary

    def save_metrics(self, filename: Optional[str] = None):
        """Save metrics to file.

        Args:
            filename: Optional filename (defaults to timestamp)
        """
        if not self.save_dir:
            logger.warning("No save directory specified")
            return

        if filename is None:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"metrics_{timestamp}.json"

        save_path = self.save_dir / filename

        data = {
            'experiment': self.experiment_info,
            'metrics_history': dict(self.metrics_history),
            'best_metrics': self.best_metrics,
            'summary': self.get_summary()
        }

        with open(save_path, 'w') as f:
            json.dump(data, f, indent=2, default=str)

        logger.info(f"Metrics saved to {save_path}")

    def _save_experiment_info(self):
        """Save experiment information."""
        if not self.save_dir:
            return

        info_path = self.save_dir / 'experiment_info.json'
        with open(info_path, 'w') as f:
            json.dump(self.experiment_info, f, indent=2, default=str)

    def end_experiment(self, status: str = 'completed'):
        """End the current experiment.

        Args:
            status: Final status of experiment
        """
        if self.experiment_info:
            self.experiment_info['end_time'] = datetime.now().isoformat()
            self.experiment_info['status'] = status

            # Save final metrics
            self.save_metrics()

            # Generate and save plots
            if self.save_dir:
                plot_path = self.save_dir / 'training_curves.png'
                self.plot_training_curves(str(plot_path))

            logger.info(f"Experiment ended with status: {status}")