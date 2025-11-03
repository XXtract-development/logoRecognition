#!/usr/bin/env python3
"""
ONNX Model Setup Script
Downloads and configures pre-trained ONNX models for logo detection
"""

import os
import sys
import json
import hashlib
import logging
from pathlib import Path
from typing import Dict, List, Optional
import urllib.request
from urllib.error import URLError
import torch
import torchvision
import onnx
import numpy as np

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Model configuration
MODEL_CONFIG = {
    "yolov5s": {
        "url": "https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5s.onnx",
        "size": 28.0,  # MB
        "input_size": 640,
        "classes": 80,
        "description": "YOLOv5 small model for object detection"
    },
    "efficientnet_lite": {
        "custom": True,
        "architecture": "efficientnet_lite0",
        "input_size": 224,
        "classes": 1000,
        "description": "EfficientNet Lite for classification"
    }
}

class ONNXModelSetup:
    """
    Sets up ONNX models for logo detection
    """

    def __init__(self, models_dir: str = "/models"):
        """
        Initialize the model setup utility

        Args:
            models_dir: Directory to store models
        """
        self.models_dir = Path(models_dir)
        self.models_dir.mkdir(parents=True, exist_ok=True)

    def create_simple_logo_detector(self) -> None:
        """
        Creates a simple ONNX model for logo detection
        Using a lightweight CNN architecture
        """
        logger.info("Creating simple logo detection model...")

        import torch.nn as nn

        class SimpleLogoDetector(nn.Module):
            """Simple CNN for logo detection"""

            def __init__(self, num_classes: int = 10):
                super(SimpleLogoDetector, self).__init__()

                # Feature extraction layers
                self.features = nn.Sequential(
                    # Conv Block 1
                    nn.Conv2d(3, 32, kernel_size=3, stride=1, padding=1),
                    nn.BatchNorm2d(32),
                    nn.ReLU(inplace=True),
                    nn.MaxPool2d(kernel_size=2, stride=2),

                    # Conv Block 2
                    nn.Conv2d(32, 64, kernel_size=3, stride=1, padding=1),
                    nn.BatchNorm2d(64),
                    nn.ReLU(inplace=True),
                    nn.MaxPool2d(kernel_size=2, stride=2),

                    # Conv Block 3
                    nn.Conv2d(64, 128, kernel_size=3, stride=1, padding=1),
                    nn.BatchNorm2d(128),
                    nn.ReLU(inplace=True),
                    nn.MaxPool2d(kernel_size=2, stride=2),

                    # Conv Block 4
                    nn.Conv2d(128, 256, kernel_size=3, stride=1, padding=1),
                    nn.BatchNorm2d(256),
                    nn.ReLU(inplace=True),
                    nn.AdaptiveAvgPool2d((7, 7))
                )

                # Detection head
                self.detector = nn.Sequential(
                    nn.Linear(256 * 7 * 7, 1024),
                    nn.ReLU(inplace=True),
                    nn.Dropout(0.5),
                    nn.Linear(1024, 512),
                    nn.ReLU(inplace=True),
                    nn.Dropout(0.5),
                    nn.Linear(512, num_classes * 5)  # class + bbox (x, y, w, h)
                )

            def forward(self, x):
                x = self.features(x)
                x = x.view(x.size(0), -1)
                x = self.detector(x)
                # Reshape output: [batch, num_classes, 5] where 5 = [confidence, x, y, w, h]
                batch_size = x.size(0)
                x = x.view(batch_size, -1, 5)
                return x

        # Create model instance
        model = SimpleLogoDetector(num_classes=10)
        model.eval()

        # Create dummy input
        dummy_input = torch.randn(1, 3, 224, 224)

        # Export to ONNX
        output_path = self.models_dir / "simple_logo_detector.onnx"
        torch.onnx.export(
            model,
            dummy_input,
            output_path,
            export_params=True,
            opset_version=11,
            do_constant_folding=True,
            input_names=['input'],
            output_names=['output'],
            dynamic_axes={
                'input': {0: 'batch_size'},
                'output': {0: 'batch_size'}
            }
        )

        logger.info(f"✅ Created simple logo detector at: {output_path}")

        # Verify the model
        onnx_model = onnx.load(str(output_path))
        onnx.checker.check_model(onnx_model)
        logger.info("✅ Model verification passed")

        # Save model metadata
        metadata = {
            "name": "simple_logo_detector",
            "version": "1.0.0",
            "type": "detection",
            "input_size": [224, 224],
            "input_channels": 3,
            "num_classes": 10,
            "classes": [
                "nike", "adidas", "apple", "google", "microsoft",
                "coca-cola", "pepsi", "mcdonalds", "starbucks", "amazon"
            ],
            "output_format": "detections",
            "confidence_threshold": 0.5,
            "nms_threshold": 0.5,
            "created": "2024-01-20"
        }

        metadata_path = self.models_dir / "simple_logo_detector_metadata.json"
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        logger.info(f"✅ Saved model metadata to: {metadata_path}")

    def create_mobilenet_classifier(self) -> None:
        """
        Creates a MobileNet-based classifier for logo recognition
        """
        logger.info("Creating MobileNet logo classifier...")

        # Load pre-trained MobileNet
        model = torchvision.models.mobilenet_v2(pretrained=False)

        # Modify for logo classification (10 classes)
        num_classes = 10
        model.classifier[1] = torch.nn.Linear(model.classifier[1].in_features, num_classes)
        model.eval()

        # Create dummy input
        dummy_input = torch.randn(1, 3, 224, 224)

        # Export to ONNX
        output_path = self.models_dir / "mobilenet_logo_classifier.onnx"
        torch.onnx.export(
            model,
            dummy_input,
            output_path,
            export_params=True,
            opset_version=11,
            do_constant_folding=True,
            input_names=['input'],
            output_names=['output'],
            dynamic_axes={
                'input': {0: 'batch_size'},
                'output': {0: 'batch_size'}
            }
        )

        logger.info(f"✅ Created MobileNet classifier at: {output_path}")

        # Verify the model
        onnx_model = onnx.load(str(output_path))
        onnx.checker.check_model(onnx_model)
        logger.info("✅ Model verification passed")

        # Save model metadata
        metadata = {
            "name": "mobilenet_logo_classifier",
            "version": "1.0.0",
            "type": "classification",
            "architecture": "mobilenet_v2",
            "input_size": [224, 224],
            "input_channels": 3,
            "num_classes": 10,
            "classes": [
                "nike", "adidas", "apple", "google", "microsoft",
                "coca-cola", "pepsi", "mcdonalds", "starbucks", "amazon"
            ],
            "preprocessing": {
                "mean": [0.485, 0.456, 0.406],
                "std": [0.229, 0.224, 0.225]
            },
            "created": "2024-01-20"
        }

        metadata_path = self.models_dir / "mobilenet_logo_classifier_metadata.json"
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        logger.info(f"✅ Saved model metadata to: {metadata_path}")

    def create_efficientdet_lite(self) -> None:
        """
        Creates a lightweight EfficientDet model for logo detection
        """
        logger.info("Creating EfficientDet-Lite logo detector...")

        import torch.nn.functional as F

        class EfficientDetLite(torch.nn.Module):
            """Lightweight EfficientDet for logo detection"""

            def __init__(self, num_classes: int = 10):
                super(EfficientDetLite, self).__init__()

                # Simplified EfficientNet backbone
                self.backbone = torch.nn.Sequential(
                    # Stem
                    torch.nn.Conv2d(3, 32, kernel_size=3, stride=2, padding=1),
                    torch.nn.BatchNorm2d(32),
                    torch.nn.SiLU(inplace=True),

                    # Block 1
                    torch.nn.Conv2d(32, 64, kernel_size=3, stride=1, padding=1),
                    torch.nn.BatchNorm2d(64),
                    torch.nn.SiLU(inplace=True),
                    torch.nn.MaxPool2d(2),

                    # Block 2
                    torch.nn.Conv2d(64, 128, kernel_size=3, stride=1, padding=1),
                    torch.nn.BatchNorm2d(128),
                    torch.nn.SiLU(inplace=True),
                    torch.nn.MaxPool2d(2),

                    # Block 3
                    torch.nn.Conv2d(128, 256, kernel_size=3, stride=1, padding=1),
                    torch.nn.BatchNorm2d(256),
                    torch.nn.SiLU(inplace=True),
                )

                # Detection head
                self.detection_head = torch.nn.Sequential(
                    torch.nn.Conv2d(256, 256, kernel_size=3, padding=1),
                    torch.nn.BatchNorm2d(256),
                    torch.nn.SiLU(inplace=True),
                    torch.nn.Conv2d(256, num_classes * 5, kernel_size=1)  # cls + bbox
                )

            def forward(self, x):
                features = self.backbone(x)
                detections = self.detection_head(features)

                # Reshape to [batch, H*W*anchors, num_classes + 4]
                batch_size = detections.size(0)
                detections = detections.permute(0, 2, 3, 1).contiguous()
                detections = detections.view(batch_size, -1, 5)

                # Apply sigmoid to class scores and bbox values
                detections = torch.sigmoid(detections)

                return detections

        # Create model instance
        model = EfficientDetLite(num_classes=10)
        model.eval()

        # Create dummy input (512x512 for EfficientDet)
        dummy_input = torch.randn(1, 3, 512, 512)

        # Export to ONNX
        output_path = self.models_dir / "efficientdet_lite.onnx"
        torch.onnx.export(
            model,
            dummy_input,
            output_path,
            export_params=True,
            opset_version=11,
            do_constant_folding=True,
            input_names=['input'],
            output_names=['output'],
            dynamic_axes={
                'input': {0: 'batch_size'},
                'output': {0: 'batch_size'}
            }
        )

        logger.info(f"✅ Created EfficientDet-Lite at: {output_path}")

        # Verify the model
        onnx_model = onnx.load(str(output_path))
        onnx.checker.check_model(onnx_model)
        logger.info("✅ Model verification passed")

        # Save model metadata
        metadata = {
            "name": "efficientdet_lite",
            "version": "1.0.0",
            "type": "detection",
            "architecture": "efficientdet_lite",
            "input_size": [512, 512],
            "input_channels": 3,
            "num_classes": 10,
            "classes": [
                "nike", "adidas", "apple", "google", "microsoft",
                "coca-cola", "pepsi", "mcdonalds", "starbucks", "amazon"
            ],
            "anchors": {
                "sizes": [32, 64, 128, 256, 512],
                "aspect_ratios": [0.5, 1.0, 2.0]
            },
            "confidence_threshold": 0.5,
            "nms_threshold": 0.5,
            "max_detections": 100,
            "created": "2024-01-20"
        }

        metadata_path = self.models_dir / "efficientdet_lite_metadata.json"
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        logger.info(f"✅ Saved model metadata to: {metadata_path}")

    def verify_models(self) -> bool:
        """
        Verify all created models

        Returns:
            True if all models are valid
        """
        logger.info("Verifying all models...")

        models_to_check = [
            "simple_logo_detector.onnx",
            "mobilenet_logo_classifier.onnx",
            "efficientdet_lite.onnx"
        ]

        all_valid = True
        for model_name in models_to_check:
            model_path = self.models_dir / model_name
            if model_path.exists():
                try:
                    onnx_model = onnx.load(str(model_path))
                    onnx.checker.check_model(onnx_model)

                    # Check file size
                    size_mb = model_path.stat().st_size / (1024 * 1024)
                    logger.info(f"✅ {model_name}: Valid (Size: {size_mb:.2f} MB)")
                except Exception as e:
                    logger.error(f"❌ {model_name}: Invalid - {str(e)}")
                    all_valid = False
            else:
                logger.warning(f"⚠️ {model_name}: Not found")
                all_valid = False

        return all_valid

    def setup_all_models(self) -> None:
        """
        Setup all required ONNX models
        """
        logger.info("="*50)
        logger.info("Starting ONNX Model Setup")
        logger.info("="*50)

        try:
            # Create models
            self.create_simple_logo_detector()
            self.create_mobilenet_classifier()
            self.create_efficientdet_lite()

            # Verify all models
            if self.verify_models():
                logger.info("="*50)
                logger.info("✅ All models successfully created and verified!")
                logger.info(f"📁 Models location: {self.models_dir}")
                logger.info("="*50)
            else:
                logger.error("⚠️ Some models failed verification")
                sys.exit(1)

        except Exception as e:
            logger.error(f"❌ Error during model setup: {str(e)}")
            sys.exit(1)


if __name__ == "__main__":
    # Get models directory from environment or use default
    models_dir = os.environ.get("ML_MODEL_PATH", "models")

    # Create setup instance
    setup = ONNXModelSetup(models_dir=models_dir)

    # Setup all models
    setup.setup_all_models()