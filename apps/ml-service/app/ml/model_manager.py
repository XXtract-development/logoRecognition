"""
ML Model Manager - Handles loading, caching, and inference of ML models.
"""

from typing import Any, Optional

import numpy as np
from PIL import Image

from app.core.config import settings
from app.core.logging import logger


class ModelManager:
    """
    Manages ML models for detection and embedding generation.
    Supports ONNX and PyTorch models.
    """

    def __init__(self):
        self.detection_model: Optional[Any] = None
        self.embedding_model: Optional[Any] = None
        self.is_loaded: bool = False
        self.model_version: str = "1.0.0"
        self._device: str = settings.device

    async def load_models(self) -> None:
        """Load all required models."""
        logger.info("Loading ML models", device=self._device)

        try:
            # Load detection model (EfficientDet or similar)
            await self._load_detection_model()

            # Load embedding model
            await self._load_embedding_model()

            self.is_loaded = True
            logger.info("All models loaded successfully")

        except Exception as e:
            logger.error("Failed to load models", error=str(e))
            self.is_loaded = False
            raise

    async def _load_detection_model(self) -> None:
        """Load the object detection model."""
        try:
            # Try ONNX first
            import onnxruntime as ort

            model_path = settings.ONNX_MODEL_PATH
            logger.info("Loading ONNX detection model", path=model_path)

            # Check if model file exists
            import os

            if os.path.exists(model_path):
                providers = (
                    ["CUDAExecutionProvider", "CPUExecutionProvider"]
                    if settings.ENABLE_GPU
                    else ["CPUExecutionProvider"]
                )
                self.detection_model = ort.InferenceSession(
                    model_path, providers=providers
                )
                logger.info("ONNX detection model loaded")
            else:
                logger.warning("Detection model not found, using mock", path=model_path)
                self.detection_model = MockDetectionModel()

        except ImportError:
            logger.warning("ONNX runtime not available, using mock model")
            self.detection_model = MockDetectionModel()
        except Exception as e:
            logger.error("Failed to load detection model", error=str(e))
            self.detection_model = MockDetectionModel()

    async def _load_embedding_model(self) -> None:
        """Load the embedding generation model."""
        try:
            import torch
            import torchvision.models as models

            logger.info("Loading embedding model", model=settings.EMBEDDING_MODEL)

            # Use EfficientNet for embeddings
            if settings.EMBEDDING_MODEL == "efficientnet_b0":
                model = models.efficientnet_b0(
                    weights=models.EfficientNet_B0_Weights.DEFAULT
                )
                # Remove classifier to get embeddings
                model.classifier = torch.nn.Identity()
            else:
                model = models.resnet50(weights=models.ResNet50_Weights.DEFAULT)
                model.fc = torch.nn.Identity()

            model.eval()
            model.to(self._device)

            self.embedding_model = model
            logger.info("Embedding model loaded")

        except ImportError:
            logger.warning("PyTorch not available, using mock embedding model")
            self.embedding_model = MockEmbeddingModel()
        except Exception as e:
            logger.error("Failed to load embedding model", error=str(e))
            self.embedding_model = MockEmbeddingModel()

    async def unload_models(self) -> None:
        """Unload all models and free memory."""
        logger.info("Unloading models")

        self.detection_model = None
        self.embedding_model = None
        self.is_loaded = False

        # Clear CUDA cache if available
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except ImportError:
            pass

        logger.info("Models unloaded")

    async def detect(self, image: Image.Image) -> list:
        """
        Run object detection on an image.

        Args:
            image: PIL Image

        Returns:
            List of detections with bounding boxes and confidence scores
        """
        if self.detection_model is None:
            raise RuntimeError("Detection model not loaded")

        # Preprocess image
        img_array = self._preprocess_image(image, size=(640, 640))

        # Run inference
        if hasattr(self.detection_model, "run"):
            # ONNX model
            input_name = self.detection_model.get_inputs()[0].name
            outputs = self.detection_model.run(None, {input_name: img_array})
            return self._postprocess_detections(outputs, image.size)
        else:
            # Mock or PyTorch model
            return self.detection_model.detect(img_array)

    async def generate_embedding(self, image: Image.Image) -> np.ndarray:
        """
        Generate embedding vector for an image.

        Args:
            image: PIL Image

        Returns:
            Numpy array of shape (512,) or (embedding_dim,)
        """
        if self.embedding_model is None:
            raise RuntimeError("Embedding model not loaded")

        # Normaliseer naar RGB vóór preprocessing. Een niet-RGB-beeld (RGBA/LA/P/
        # CMYK) levert via ToTensor een N!=3-kanaals tensor die botst met de
        # 3-kanaals Normalize (mean/std van 3) -> "tensor a (N) must match tensor
        # b (3)". Bv. menselijk-geannoteerde gold-set-crops worden als RGBA
        # opgeslagen. Eén centrale cast dekt alle aanroepers (regression-eval,
        # similarity, bootstrap, harvest, detection); convert("RGB") is een no-op
        # op een reeds-RGB-beeld (bit-identiek resultaat).
        if image.mode != "RGB":
            image = image.convert("RGB")

        try:
            import torch
            from torchvision import transforms

            # Preprocessing
            preprocess = transforms.Compose(
                [
                    transforms.Resize(256),
                    transforms.CenterCrop(224),
                    transforms.ToTensor(),
                    transforms.Normalize(
                        mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]
                    ),
                ]
            )

            input_tensor = preprocess(image).unsqueeze(0).to(self._device)

            with torch.no_grad():
                embedding = self.embedding_model(input_tensor)

            # Reduce to 512 dimensions if needed
            embedding = embedding.cpu().numpy().flatten()
            if len(embedding) > 512:
                embedding = embedding[:512]
            elif len(embedding) < 512:
                embedding = np.pad(embedding, (0, 512 - len(embedding)))

            return embedding

        except ImportError:
            # Mock embedding
            return np.random.randn(512).astype(np.float32)

    def _preprocess_image(
        self, image: Image.Image, size: tuple = (640, 640)
    ) -> np.ndarray:
        """Preprocess image for detection model."""
        image = image.resize(size)
        img_array = np.array(image).astype(np.float32)
        img_array = img_array / 255.0  # Normalize to [0, 1]
        img_array = np.transpose(img_array, (2, 0, 1))  # CHW format
        img_array = np.expand_dims(img_array, axis=0)  # Add batch dimension
        return img_array

    def _postprocess_detections(self, outputs: list, original_size: tuple) -> list:
        """Postprocess detection outputs."""
        # This depends on the specific model output format
        # Placeholder implementation
        return []


class MockDetectionModel:
    """Mock detection model for development/testing."""

    def detect(self, image_array: np.ndarray) -> list:
        """Return mock detections."""
        return [
            {
                "bbox": {"x": 100, "y": 100, "width": 200, "height": 200},
                "confidence": 0.95,
                "category": "brand",
                "value": "mock_logo",
            }
        ]


class MockEmbeddingModel:
    """Mock embedding model for development/testing."""

    def __call__(self, x):
        """Return mock embeddings."""
        import numpy as np

        return np.random.randn(1, 512).astype(np.float32)


# Global model manager instance
model_manager = ModelManager()
