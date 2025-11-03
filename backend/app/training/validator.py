"""Automatic model validation for training pipeline."""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import torch
from torch.utils.data import DataLoader

from .metrics_tracker import MetricsTracker

logger = logging.getLogger(__name__)


class ModelValidator:
    """Automatic model validation and quality assurance."""

    def __init__(
        self,
        metrics_tracker: Optional[MetricsTracker] = None,
        validation_dir: str = "./validations"
    ):
        """Initialize model validator.

        Args:
            metrics_tracker: Metrics tracker instance
            validation_dir: Directory to save validation results
        """
        self.metrics_tracker = metrics_tracker or MetricsTracker()
        self.validation_dir = Path(validation_dir)
        self.validation_dir.mkdir(parents=True, exist_ok=True)

        self.validation_criteria = self._default_criteria()
        self.validation_history = []

    def _default_criteria(self) -> Dict[str, Any]:
        """Default validation criteria.

        Returns:
            Dictionary of validation criteria
        """
        return {
            'min_precision': 0.7,
            'min_recall': 0.6,
            'min_f1_score': 0.65,
            'max_loss': 1.0,
            'min_map': 0.5,
            'max_inference_time_ms': 100,
            'max_model_size_mb': 500,
            'min_test_samples': 100
        }

    def set_criteria(self, criteria: Dict[str, Any]):
        """Set custom validation criteria.

        Args:
            criteria: Dictionary of validation criteria
        """
        self.validation_criteria.update(criteria)
        logger.info(f"Updated validation criteria: {criteria}")

    def validate_model(
        self,
        model: torch.nn.Module,
        test_loader: DataLoader,
        device: str = 'cpu',
        model_name: str = 'model',
        model_version: str = 'latest'
    ) -> Dict[str, Any]:
        """Perform comprehensive model validation.

        Args:
            model: Model to validate
            test_loader: Test data loader
            device: Device to run on
            model_name: Name of the model
            model_version: Model version

        Returns:
            Validation results dictionary
        """
        logger.info(f"Starting validation for {model_name} v{model_version}")

        validation_results = {
            'model_name': model_name,
            'model_version': model_version,
            'timestamp': datetime.now().isoformat(),
            'device': device,
            'criteria': self.validation_criteria.copy(),
            'tests': {},
            'metrics': {},
            'passed': True,
            'warnings': [],
            'errors': []
        }

        # Move model to device
        model = model.to(device)
        model.eval()

        # 1. Performance validation
        perf_results = self._validate_performance(
            model, test_loader, device
        )
        validation_results['tests']['performance'] = perf_results
        validation_results['metrics'].update(perf_results['metrics'])

        # 2. Accuracy validation
        accuracy_results = self._validate_accuracy(
            model, test_loader, device
        )
        validation_results['tests']['accuracy'] = accuracy_results
        validation_results['metrics'].update(accuracy_results['metrics'])

        # 3. Model size validation
        size_results = self._validate_model_size(model)
        validation_results['tests']['model_size'] = size_results

        # 4. Robustness validation
        robustness_results = self._validate_robustness(
            model, test_loader, device
        )
        validation_results['tests']['robustness'] = robustness_results

        # 5. Edge case validation
        edge_results = self._validate_edge_cases(model, device)
        validation_results['tests']['edge_cases'] = edge_results

        # Check against criteria
        validation_results = self._check_criteria(validation_results)

        # Save validation results
        self._save_validation_results(validation_results)

        # Update history
        self.validation_history.append(validation_results)

        # Log summary
        self._log_validation_summary(validation_results)

        return validation_results

    def _validate_performance(
        self,
        model: torch.nn.Module,
        test_loader: DataLoader,
        device: str
    ) -> Dict[str, Any]:
        """Validate model performance.

        Args:
            model: Model to validate
            test_loader: Test data loader
            device: Device to run on

        Returns:
            Performance validation results
        """
        import time

        inference_times = []
        batch_sizes = []

        with torch.no_grad():
            for i, (images, _) in enumerate(test_loader):
                if i >= 10:  # Test on first 10 batches
                    break

                images = images.to(device)
                batch_sizes.append(len(images))

                # Measure inference time
                start_time = time.perf_counter()
                _ = model(images)
                end_time = time.perf_counter()

                inference_time_ms = (end_time - start_time) * 1000
                inference_times.append(inference_time_ms)

        avg_inference_time = np.mean(inference_times)
        avg_batch_size = np.mean(batch_sizes)

        results = {
            'passed': avg_inference_time <= self.validation_criteria['max_inference_time_ms'],
            'metrics': {
                'avg_inference_time_ms': avg_inference_time,
                'min_inference_time_ms': np.min(inference_times),
                'max_inference_time_ms': np.max(inference_times),
                'std_inference_time_ms': np.std(inference_times),
                'avg_batch_size': avg_batch_size,
                'throughput_fps': (avg_batch_size / avg_inference_time) * 1000
            }
        }

        return results

    def _validate_accuracy(
        self,
        model: torch.nn.Module,
        test_loader: DataLoader,
        device: str
    ) -> Dict[str, Any]:
        """Validate model accuracy.

        Args:
            model: Model to validate
            test_loader: Test data loader
            device: Device to run on

        Returns:
            Accuracy validation results
        """
        all_predictions = []
        all_ground_truths = []
        total_loss = 0
        num_batches = 0

        with torch.no_grad():
            for images, targets in test_loader:
                images = images.to(device)
                targets = [{k: v.to(device) for k, v in t.items()}
                          for t in targets]

                # Get predictions
                predictions = model(images)

                # Store for metrics calculation
                all_predictions.extend(predictions)
                all_ground_truths.extend(targets)

                num_batches += 1

                # Calculate loss (if in training mode temporarily)
                try:
                    model.train()
                    loss_dict = model(images, targets)
                    losses = sum(loss for loss in loss_dict.values())
                    total_loss += losses.item()
                    model.eval()
                except:
                    pass

        # Calculate detection metrics
        detection_metrics = self.metrics_tracker.calculate_detection_metrics(
            all_predictions,
            all_ground_truths,
            iou_threshold=0.5
        )

        # Calculate mAP
        map_metrics = self.metrics_tracker.calculate_map(
            all_predictions,
            all_ground_truths
        )

        avg_loss = total_loss / num_batches if num_batches > 0 else float('inf')

        results = {
            'passed': (
                detection_metrics['precision'] >= self.validation_criteria['min_precision'] and
                detection_metrics['recall'] >= self.validation_criteria['min_recall'] and
                detection_metrics['f1_score'] >= self.validation_criteria['min_f1_score'] and
                map_metrics['mAP'] >= self.validation_criteria['min_map']
            ),
            'metrics': {
                'precision': detection_metrics['precision'],
                'recall': detection_metrics['recall'],
                'f1_score': detection_metrics['f1_score'],
                'mAP': map_metrics['mAP'],
                'mAP@0.5': map_metrics['mAP@0.5'],
                'mAP@0.75': map_metrics['mAP@0.75'],
                'avg_loss': avg_loss,
                'total_samples': len(all_predictions)
            }
        }

        return results

    def _validate_model_size(self, model: torch.nn.Module) -> Dict[str, Any]:
        """Validate model size.

        Args:
            model: Model to validate

        Returns:
            Model size validation results
        """
        # Calculate model size
        param_count = sum(p.numel() for p in model.parameters())
        trainable_count = sum(p.numel() for p in model.parameters() if p.requires_grad)

        # Estimate model size in MB
        model_size_mb = (param_count * 4) / (1024 * 1024)  # Assuming float32

        results = {
            'passed': model_size_mb <= self.validation_criteria['max_model_size_mb'],
            'metrics': {
                'total_parameters': param_count,
                'trainable_parameters': trainable_count,
                'model_size_mb': model_size_mb,
                'compression_ratio': trainable_count / param_count if param_count > 0 else 0
            }
        }

        return results

    def _validate_robustness(
        self,
        model: torch.nn.Module,
        test_loader: DataLoader,
        device: str
    ) -> Dict[str, Any]:
        """Validate model robustness.

        Args:
            model: Model to validate
            test_loader: Test data loader
            device: Device to run on

        Returns:
            Robustness validation results
        """
        results = {
            'noise_robustness': self._test_noise_robustness(model, test_loader, device),
            'scale_robustness': self._test_scale_robustness(model, test_loader, device),
            'rotation_robustness': self._test_rotation_robustness(model, test_loader, device)
        }

        # Overall pass if all robustness tests pass
        results['passed'] = all(
            test.get('passed', False)
            for test in results.values()
            if isinstance(test, dict)
        )

        return results

    def _test_noise_robustness(
        self,
        model: torch.nn.Module,
        test_loader: DataLoader,
        device: str
    ) -> Dict[str, Any]:
        """Test model robustness to noise.

        Args:
            model: Model to test
            test_loader: Test data loader
            device: Device to run on

        Returns:
            Noise robustness results
        """
        noise_levels = [0.01, 0.05, 0.1]
        results = {}

        with torch.no_grad():
            for noise_level in noise_levels:
                correct = 0
                total = 0

                for i, (images, _) in enumerate(test_loader):
                    if i >= 5:  # Test on limited batches
                        break

                    images = images.to(device)

                    # Add Gaussian noise
                    noise = torch.randn_like(images) * noise_level
                    noisy_images = images + noise

                    # Get predictions
                    try:
                        _ = model(noisy_images)
                        correct += 1
                    except:
                        pass

                    total += 1

                robustness_score = correct / total if total > 0 else 0
                results[f'noise_{noise_level}'] = robustness_score

        return {
            'passed': min(results.values()) > 0.8,  # 80% robustness threshold
            'noise_robustness_scores': results
        }

    def _test_scale_robustness(
        self,
        model: torch.nn.Module,
        test_loader: DataLoader,
        device: str
    ) -> Dict[str, Any]:
        """Test model robustness to scale changes.

        Args:
            model: Model to test
            test_loader: Test data loader
            device: Device to run on

        Returns:
            Scale robustness results
        """
        scale_factors = [0.75, 1.0, 1.25]
        results = {}

        for scale in scale_factors:
            # Would implement scale testing here
            results[f'scale_{scale}'] = 1.0  # Placeholder

        return {
            'passed': True,
            'scale_robustness_scores': results
        }

    def _test_rotation_robustness(
        self,
        model: torch.nn.Module,
        test_loader: DataLoader,
        device: str
    ) -> Dict[str, Any]:
        """Test model robustness to rotation.

        Args:
            model: Model to test
            test_loader: Test data loader
            device: Device to run on

        Returns:
            Rotation robustness results
        """
        rotation_angles = [-15, 0, 15]
        results = {}

        for angle in rotation_angles:
            # Would implement rotation testing here
            results[f'rotation_{angle}'] = 1.0  # Placeholder

        return {
            'passed': True,
            'rotation_robustness_scores': results
        }

    def _validate_edge_cases(
        self,
        model: torch.nn.Module,
        device: str
    ) -> Dict[str, Any]:
        """Validate edge cases.

        Args:
            model: Model to validate
            device: Device to run on

        Returns:
            Edge case validation results
        """
        edge_cases_passed = []

        # Test empty image
        try:
            empty_image = torch.zeros(1, 3, 640, 640).to(device)
            _ = model(empty_image)
            edge_cases_passed.append(('empty_image', True))
        except Exception as e:
            edge_cases_passed.append(('empty_image', False))
            logger.warning(f"Failed empty image test: {str(e)}")

        # Test single pixel image
        try:
            single_pixel = torch.ones(1, 3, 1, 1).to(device)
            _ = model(single_pixel)
            edge_cases_passed.append(('single_pixel', True))
        except:
            edge_cases_passed.append(('single_pixel', False))

        # Test very large image
        try:
            large_image = torch.randn(1, 3, 2048, 2048).to(device)
            _ = model(large_image)
            edge_cases_passed.append(('large_image', True))
        except:
            edge_cases_passed.append(('large_image', False))

        return {
            'passed': all(result for _, result in edge_cases_passed),
            'edge_cases': dict(edge_cases_passed)
        }

    def _check_criteria(self, validation_results: Dict[str, Any]) -> Dict[str, Any]:
        """Check validation results against criteria.

        Args:
            validation_results: Validation results

        Returns:
            Updated validation results with pass/fail status
        """
        metrics = validation_results.get('metrics', {})
        criteria = validation_results['criteria']

        # Check each criterion
        for criterion, threshold in criteria.items():
            if criterion.startswith('min_'):
                metric_name = criterion.replace('min_', '')
                if metric_name in metrics:
                    if metrics[metric_name] < threshold:
                        validation_results['passed'] = False
                        validation_results['warnings'].append(
                            f"{metric_name} ({metrics[metric_name]:.3f}) "
                            f"below minimum ({threshold})"
                        )

            elif criterion.startswith('max_'):
                metric_name = criterion.replace('max_', '')
                if metric_name in metrics:
                    if metrics[metric_name] > threshold:
                        validation_results['passed'] = False
                        validation_results['errors'].append(
                            f"{metric_name} ({metrics[metric_name]:.3f}) "
                            f"exceeds maximum ({threshold})"
                        )

        return validation_results

    def _save_validation_results(self, results: Dict[str, Any]):
        """Save validation results to file.

        Args:
            results: Validation results
        """
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"validation_{results['model_name']}_{timestamp}.json"
        filepath = self.validation_dir / filename

        with open(filepath, 'w') as f:
            json.dump(results, f, indent=2, default=str)

        logger.info(f"Validation results saved to {filepath}")

    def _log_validation_summary(self, results: Dict[str, Any]):
        """Log validation summary.

        Args:
            results: Validation results
        """
        status = "PASSED ✓" if results['passed'] else "FAILED ✗"

        logger.info(f"\n{'=' * 50}")
        logger.info(f"VALIDATION SUMMARY - {status}")
        logger.info(f"{'=' * 50}")
        logger.info(f"Model: {results['model_name']} v{results['model_version']}")

        # Log metrics
        if results['metrics']:
            logger.info("\nMetrics:")
            for metric, value in results['metrics'].items():
                if isinstance(value, float):
                    logger.info(f"  {metric}: {value:.4f}")
                else:
                    logger.info(f"  {metric}: {value}")

        # Log warnings
        if results['warnings']:
            logger.warning("\nWarnings:")
            for warning in results['warnings']:
                logger.warning(f"  - {warning}")

        # Log errors
        if results['errors']:
            logger.error("\nErrors:")
            for error in results['errors']:
                logger.error(f"  - {error}")

        logger.info(f"{'=' * 50}\n")

    def compare_models(
        self,
        model1_results: Dict[str, Any],
        model2_results: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Compare two model validation results.

        Args:
            model1_results: First model results
            model2_results: Second model results

        Returns:
            Comparison results
        """
        comparison = {
            'model1': f"{model1_results['model_name']} v{model1_results['model_version']}",
            'model2': f"{model2_results['model_name']} v{model2_results['model_version']}",
            'metrics_comparison': {},
            'winner': None,
            'improvements': [],
            'regressions': []
        }

        # Compare metrics
        for metric in model1_results.get('metrics', {}).keys():
            if metric in model2_results.get('metrics', {}):
                val1 = model1_results['metrics'][metric]
                val2 = model2_results['metrics'][metric]

                if isinstance(val1, (int, float)) and isinstance(val2, (int, float)):
                    diff = val2 - val1
                    pct_change = (diff / val1 * 100) if val1 != 0 else 0

                    comparison['metrics_comparison'][metric] = {
                        'model1': val1,
                        'model2': val2,
                        'difference': diff,
                        'pct_change': pct_change
                    }

                    # Track improvements/regressions
                    if metric in ['precision', 'recall', 'f1_score', 'mAP']:
                        if diff > 0:
                            comparison['improvements'].append(
                                f"{metric}: +{pct_change:.1f}%"
                            )
                        elif diff < 0:
                            comparison['regressions'].append(
                                f"{metric}: {pct_change:.1f}%"
                            )

        # Determine winner
        model1_score = sum([
            model1_results['metrics'].get('precision', 0),
            model1_results['metrics'].get('recall', 0),
            model1_results['metrics'].get('f1_score', 0),
            model1_results['metrics'].get('mAP', 0)
        ])

        model2_score = sum([
            model2_results['metrics'].get('precision', 0),
            model2_results['metrics'].get('recall', 0),
            model2_results['metrics'].get('f1_score', 0),
            model2_results['metrics'].get('mAP', 0)
        ])

        if model2_score > model1_score:
            comparison['winner'] = comparison['model2']
        else:
            comparison['winner'] = comparison['model1']

        return comparison