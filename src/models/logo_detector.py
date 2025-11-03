import torch
import torch.nn as nn
import torchvision.models as models
from typing import Optional, Tuple, Dict, Any
import numpy as np


class LogoDetector(nn.Module):
    def __init__(
        self,
        num_classes: int = 1000,
        backbone: str = 'resnet50',
        pretrained: bool = True,
        feature_dim: int = 2048
    ):
        super(LogoDetector, self).__init__()

        self.num_classes = num_classes
        self.feature_dim = feature_dim

        # Initialize backbone
        if backbone == 'resnet50':
            self.backbone = models.resnet50(pretrained=pretrained)
            self.backbone.fc = nn.Identity()
            backbone_output_dim = 2048
        elif backbone == 'efficientnet_b0':
            self.backbone = models.efficientnet_b0(pretrained=pretrained)
            self.backbone.classifier = nn.Identity()
            backbone_output_dim = 1280
        elif backbone == 'mobilenet_v3':
            self.backbone = models.mobilenet_v3_large(pretrained=pretrained)
            self.backbone.classifier = nn.Identity()
            backbone_output_dim = 1280
        else:
            raise ValueError(f"Unsupported backbone: {backbone}")

        # Feature projection head
        self.feature_head = nn.Sequential(
            nn.Linear(backbone_output_dim, feature_dim),
            nn.ReLU(inplace=True),
            nn.BatchNorm1d(feature_dim),
            nn.Dropout(0.5)
        )

        # Classification head
        self.classifier = nn.Linear(feature_dim, num_classes)

        # Detection head (for bounding box regression)
        self.detector = nn.Sequential(
            nn.Linear(feature_dim, 256),
            nn.ReLU(inplace=True),
            nn.Linear(256, 4)  # x, y, width, height
        )

    def forward(
        self,
        x: torch.Tensor,
        return_features: bool = False
    ) -> Dict[str, torch.Tensor]:
        # Extract features from backbone
        backbone_features = self.backbone(x)

        # Project features
        features = self.feature_head(backbone_features)

        # Classification
        logits = self.classifier(features)

        # Detection (bounding box)
        bbox = self.detector(features)
        bbox = torch.sigmoid(bbox)  # Normalize to [0, 1]

        output = {
            'logits': logits,
            'bbox': bbox
        }

        if return_features:
            output['features'] = features

        return output

    def extract_features(self, x: torch.Tensor) -> torch.Tensor:
        with torch.no_grad():
            backbone_features = self.backbone(x)
            features = self.feature_head(backbone_features)
        return features


class LogoSimilarityModel(nn.Module):
    def __init__(
        self,
        embedding_dim: int = 128,
        backbone: str = 'resnet50',
        pretrained: bool = True
    ):
        super(LogoSimilarityModel, self).__init__()

        # Use base detector as feature extractor
        self.feature_extractor = LogoDetector(
            num_classes=1,  # Not used for similarity
            backbone=backbone,
            pretrained=pretrained,
            feature_dim=embedding_dim * 2
        )

        # Projection to embedding space
        self.projection = nn.Sequential(
            nn.Linear(embedding_dim * 2, embedding_dim),
            nn.BatchNorm1d(embedding_dim)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        features = self.feature_extractor.extract_features(x)
        embeddings = self.projection(features)
        # L2 normalize embeddings
        embeddings = nn.functional.normalize(embeddings, p=2, dim=1)
        return embeddings

    def compute_similarity(
        self,
        embeddings1: torch.Tensor,
        embeddings2: torch.Tensor
    ) -> torch.Tensor:
        return torch.cosine_similarity(embeddings1, embeddings2, dim=1)