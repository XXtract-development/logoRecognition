"""Few-shot learning implementation using Prototypical Networks."""

import logging
from typing import Dict, List, Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import models

logger = logging.getLogger(__name__)


class EmbeddingNetwork(nn.Module):
    """EfficientNet-based embedding network for feature extraction."""

    def __init__(self, embedding_dim: int = 512, pretrained: bool = True):
        """Initialize embedding network with EfficientNet backbone."""
        super().__init__()

        # Use EfficientNet-B0 as backbone
        self.backbone = models.efficientnet_b0(pretrained=pretrained)

        # Get the number of features from the classifier
        num_features = self.backbone.classifier[1].in_features

        # Replace classifier with embedding layers
        self.backbone.classifier = nn.Sequential(
            nn.Dropout(p=0.2, inplace=True),
            nn.Linear(num_features, embedding_dim),
            nn.BatchNorm1d(embedding_dim),
            nn.ReLU(inplace=True),
            nn.Linear(embedding_dim, embedding_dim),
        )

        # Initialize weights
        self._initialize_weights()

    def _initialize_weights(self):
        """Initialize network weights."""
        for m in self.backbone.classifier.modules():
            if isinstance(m, nn.Linear):
                nn.init.kaiming_normal_(m.weight, mode="fan_out", nonlinearity="relu")
                if m.bias is not None:
                    nn.init.constant_(m.bias, 0)
            elif isinstance(m, nn.BatchNorm1d):
                nn.init.constant_(m.weight, 1)
                nn.init.constant_(m.bias, 0)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass to extract embeddings."""
        return F.normalize(self.backbone(x), p=2, dim=1)


class PrototypicalNetwork(nn.Module):
    """Prototypical Networks for few-shot learning."""

    def __init__(
        self,
        n_classes: int,
        n_support: int = 5,
        n_query: int = 5,
        embedding_dim: int = 512,
    ):
        """Initialize Prototypical Network."""
        super().__init__()

        self.n_classes = n_classes
        self.n_support = n_support
        self.n_query = n_query
        self.embedding_dim = embedding_dim

        # Embedding network
        self.encoder = EmbeddingNetwork(embedding_dim=embedding_dim)

        # Temperature scaling for metric learning
        self.temperature = nn.Parameter(torch.tensor(1.0))

    def compute_prototypes(
        self,
        support_embeddings: torch.Tensor,
        support_labels: torch.Tensor,
    ) -> torch.Tensor:
        """Compute class prototypes from support set."""
        n_classes = support_labels.unique().size(0)
        prototypes = torch.zeros(n_classes, self.embedding_dim).to(support_embeddings.device)

        for class_idx in range(n_classes):
            mask = support_labels == class_idx
            class_embeddings = support_embeddings[mask]
            prototypes[class_idx] = class_embeddings.mean(dim=0)

        return prototypes

    def euclidean_distance(
        self,
        query_embeddings: torch.Tensor,
        prototypes: torch.Tensor,
    ) -> torch.Tensor:
        """Compute euclidean distance between queries and prototypes."""
        n_query = query_embeddings.size(0)
        n_prototypes = prototypes.size(0)

        # Expand dimensions for broadcasting
        query_embeddings = query_embeddings.unsqueeze(1).expand(n_query, n_prototypes, -1)
        prototypes = prototypes.unsqueeze(0).expand(n_query, n_prototypes, -1)

        # Compute squared euclidean distance
        distances = torch.sum((query_embeddings - prototypes) ** 2, dim=-1)

        return distances

    def forward(
        self,
        support_images: torch.Tensor,
        support_labels: torch.Tensor,
        query_images: Optional[torch.Tensor] = None,
        query_labels: Optional[torch.Tensor] = None,
    ) -> Tuple[torch.Tensor, Optional[torch.Tensor]]:
        """Forward pass for training or inference."""
        # Extract embeddings for support set
        support_embeddings = self.encoder(support_images)

        # Compute prototypes
        prototypes = self.compute_prototypes(support_embeddings, support_labels)

        # If no query set (inference mode)
        if query_images is None:
            return prototypes, None

        # Extract embeddings for query set
        query_embeddings = self.encoder(query_images)

        # Compute distances
        distances = self.euclidean_distance(query_embeddings, prototypes)

        # Convert distances to logits with temperature scaling
        logits = -distances / self.temperature

        # Compute loss if labels provided
        loss = None
        if query_labels is not None:
            loss = F.cross_entropy(logits, query_labels)

        return logits, loss


class TripletLoss(nn.Module):
    """Triplet loss for metric learning."""

    def __init__(self, margin: float = 1.0):
        """Initialize triplet loss."""
        super().__init__()
        self.margin = margin

    def forward(
        self,
        anchor: torch.Tensor,
        positive: torch.Tensor,
        negative: torch.Tensor,
    ) -> torch.Tensor:
        """Compute triplet loss."""
        distance_positive = F.pairwise_distance(anchor, positive, p=2)
        distance_negative = F.pairwise_distance(anchor, negative, p=2)

        loss = torch.relu(distance_positive - distance_negative + self.margin)
        return loss.mean()


class FewShotLearner:
    """High-level few-shot learning interface."""

    def __init__(
        self,
        n_way: int = 5,
        k_shot: int = 5,
        device: str = None,
    ):
        """Initialize few-shot learner."""
        self.n_way = n_way  # Number of classes per task
        self.k_shot = k_shot  # Number of examples per class
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")

        # Initialize model
        self.model = PrototypicalNetwork(
            n_classes=n_way,
            n_support=k_shot,
            n_query=k_shot,
        ).to(self.device)

        # Loss functions
        self.triplet_loss = TripletLoss(margin=1.0)

    def create_episode(
        self,
        data_loader,
        n_episodes: int = 1,
    ) -> List[Dict[str, torch.Tensor]]:
        """Create training episodes for few-shot learning."""
        episodes = []

        for _ in range(n_episodes):
            # Sample n_way classes
            selected_classes = torch.randperm(self.n_way)[:self.n_way]

            support_images = []
            support_labels = []
            query_images = []
            query_labels = []

            for class_idx, class_id in enumerate(selected_classes):
                # Get samples for this class
                class_samples = []  # This would come from data_loader

                # Split into support and query
                support = class_samples[:self.k_shot]
                query = class_samples[self.k_shot:2*self.k_shot]

                support_images.extend(support)
                support_labels.extend([class_idx] * len(support))
                query_images.extend(query)
                query_labels.extend([class_idx] * len(query))

            episode = {
                "support_images": torch.stack(support_images),
                "support_labels": torch.tensor(support_labels),
                "query_images": torch.stack(query_images),
                "query_labels": torch.tensor(query_labels),
            }
            episodes.append(episode)

        return episodes

    def train_episode(
        self,
        episode: Dict[str, torch.Tensor],
        optimizer: torch.optim.Optimizer,
    ) -> Dict[str, float]:
        """Train on a single episode."""
        self.model.train()

        # Move data to device
        support_images = episode["support_images"].to(self.device)
        support_labels = episode["support_labels"].to(self.device)
        query_images = episode["query_images"].to(self.device)
        query_labels = episode["query_labels"].to(self.device)

        # Forward pass
        optimizer.zero_grad()
        logits, loss = self.model(
            support_images,
            support_labels,
            query_images,
            query_labels,
        )

        # Backward pass
        loss.backward()
        optimizer.step()

        # Calculate accuracy
        with torch.no_grad():
            predictions = logits.argmax(dim=1)
            accuracy = (predictions == query_labels).float().mean().item()

        return {
            "loss": loss.item(),
            "accuracy": accuracy,
        }

    def adapt(
        self,
        support_images: torch.Tensor,
        support_labels: torch.Tensor,
        adaptation_steps: int = 5,
        adaptation_lr: float = 0.01,
    ) -> None:
        """Adapt model to new classes using support set."""
        self.model.train()

        # Create adaptation optimizer
        adaptation_optimizer = torch.optim.SGD(
            self.model.parameters(),
            lr=adaptation_lr,
        )

        # Adapt for specified steps
        for _ in range(adaptation_steps):
            # Split support set for self-supervised adaptation
            perm = torch.randperm(len(support_images))
            adapt_support = support_images[perm[:len(perm)//2]]
            adapt_query = support_images[perm[len(perm)//2:]]
            adapt_support_labels = support_labels[perm[:len(perm)//2]]
            adapt_query_labels = support_labels[perm[len(perm)//2:]]

            # Forward pass
            adaptation_optimizer.zero_grad()
            logits, loss = self.model(
                adapt_support,
                adapt_support_labels,
                adapt_query,
                adapt_query_labels,
            )

            # Backward pass
            if loss is not None:
                loss.backward()
                adaptation_optimizer.step()

    def predict(
        self,
        support_images: torch.Tensor,
        support_labels: torch.Tensor,
        query_images: torch.Tensor,
    ) -> torch.Tensor:
        """Predict labels for query images given support set."""
        self.model.eval()

        with torch.no_grad():
            support_images = support_images.to(self.device)
            support_labels = support_labels.to(self.device)
            query_images = query_images.to(self.device)

            logits, _ = self.model(
                support_images,
                support_labels,
                query_images,
            )

            predictions = logits.argmax(dim=1)

        return predictions