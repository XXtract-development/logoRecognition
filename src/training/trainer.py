import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from torch.optim.lr_scheduler import CosineAnnealingLR, ReduceLROnPlateau
import numpy as np
from tqdm import tqdm
from typing import Dict, List, Optional, Tuple, Any
import wandb
import os
from pathlib import Path


class LogoTrainer:
    def __init__(
        self,
        model: nn.Module,
        device: str = 'cuda' if torch.cuda.is_available() else 'cpu',
        checkpoint_dir: str = './checkpoints',
        use_wandb: bool = False
    ):
        self.model = model.to(device)
        self.device = device
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        self.use_wandb = use_wandb

        self.best_val_loss = float('inf')
        self.best_val_acc = 0.0
        self.current_epoch = 0

    def train(
        self,
        train_loader: DataLoader,
        val_loader: DataLoader,
        num_epochs: int = 100,
        learning_rate: float = 1e-3,
        weight_decay: float = 1e-4,
        scheduler_type: str = 'cosine',
        early_stopping_patience: int = 10,
        gradient_clip_val: float = 1.0
    ) -> Dict[str, List[float]]:

        # Setup optimizer
        optimizer = optim.AdamW(
            self.model.parameters(),
            lr=learning_rate,
            weight_decay=weight_decay
        )

        # Setup scheduler
        if scheduler_type == 'cosine':
            scheduler = CosineAnnealingLR(
                optimizer,
                T_max=num_epochs,
                eta_min=learning_rate * 0.01
            )
        elif scheduler_type == 'plateau':
            scheduler = ReduceLROnPlateau(
                optimizer,
                mode='min',
                factor=0.5,
                patience=5,
                verbose=True
            )
        else:
            scheduler = None

        # Loss functions
        classification_loss_fn = nn.CrossEntropyLoss()
        bbox_loss_fn = nn.SmoothL1Loss()

        # Training history
        history = {
            'train_loss': [],
            'train_acc': [],
            'val_loss': [],
            'val_acc': []
        }

        # Early stopping
        patience_counter = 0

        # Training loop
        for epoch in range(num_epochs):
            self.current_epoch = epoch + 1

            # Training phase
            train_loss, train_acc = self._train_epoch(
                train_loader,
                optimizer,
                classification_loss_fn,
                bbox_loss_fn,
                gradient_clip_val
            )

            # Validation phase
            val_loss, val_acc = self._validate(
                val_loader,
                classification_loss_fn,
                bbox_loss_fn
            )

            # Update history
            history['train_loss'].append(train_loss)
            history['train_acc'].append(train_acc)
            history['val_loss'].append(val_loss)
            history['val_acc'].append(val_acc)

            # Learning rate scheduling
            if scheduler:
                if scheduler_type == 'plateau':
                    scheduler.step(val_loss)
                else:
                    scheduler.step()

            # Logging
            print(f"Epoch {epoch+1}/{num_epochs}")
            print(f"Train Loss: {train_loss:.4f}, Train Acc: {train_acc:.4f}")
            print(f"Val Loss: {val_loss:.4f}, Val Acc: {val_acc:.4f}")

            if self.use_wandb:
                wandb.log({
                    'train_loss': train_loss,
                    'train_acc': train_acc,
                    'val_loss': val_loss,
                    'val_acc': val_acc,
                    'learning_rate': optimizer.param_groups[0]['lr'],
                    'epoch': epoch + 1
                })

            # Save checkpoint
            if val_loss < self.best_val_loss:
                self.best_val_loss = val_loss
                self.save_checkpoint('best_loss.pth', optimizer, scheduler, history)
                patience_counter = 0
            else:
                patience_counter += 1

            if val_acc > self.best_val_acc:
                self.best_val_acc = val_acc
                self.save_checkpoint('best_acc.pth', optimizer, scheduler, history)

            # Early stopping
            if patience_counter >= early_stopping_patience:
                print(f"Early stopping triggered at epoch {epoch+1}")
                break

            # Regular checkpoint
            if (epoch + 1) % 10 == 0:
                self.save_checkpoint(f'epoch_{epoch+1}.pth', optimizer, scheduler, history)

        return history

    def _train_epoch(
        self,
        train_loader: DataLoader,
        optimizer: optim.Optimizer,
        classification_loss_fn: nn.Module,
        bbox_loss_fn: nn.Module,
        gradient_clip_val: float
    ) -> Tuple[float, float]:

        self.model.train()
        total_loss = 0
        correct = 0
        total = 0

        progress_bar = tqdm(train_loader, desc='Training')

        for batch in progress_bar:
            images = batch['image'].to(self.device)
            labels = batch['label'].to(self.device)
            bboxes = batch.get('bbox', None)

            optimizer.zero_grad()

            # Forward pass
            outputs = self.model(images)
            logits = outputs['logits']

            # Calculate losses
            cls_loss = classification_loss_fn(logits, labels)
            loss = cls_loss

            if bboxes is not None:
                bboxes = bboxes.to(self.device)
                bbox_pred = outputs['bbox']
                bbox_loss = bbox_loss_fn(bbox_pred, bboxes)
                loss = loss + 0.5 * bbox_loss

            # Backward pass
            loss.backward()

            # Gradient clipping
            if gradient_clip_val > 0:
                torch.nn.utils.clip_grad_norm_(
                    self.model.parameters(),
                    gradient_clip_val
                )

            optimizer.step()

            # Update metrics
            total_loss += loss.item()
            _, predicted = torch.max(logits.data, 1)
            total += labels.size(0)
            correct += (predicted == labels).sum().item()

            # Update progress bar
            progress_bar.set_postfix({
                'loss': loss.item(),
                'acc': 100. * correct / total
            })

        avg_loss = total_loss / len(train_loader)
        accuracy = 100. * correct / total

        return avg_loss, accuracy

    def _validate(
        self,
        val_loader: DataLoader,
        classification_loss_fn: nn.Module,
        bbox_loss_fn: nn.Module
    ) -> Tuple[float, float]:

        self.model.eval()
        total_loss = 0
        correct = 0
        total = 0

        with torch.no_grad():
            for batch in tqdm(val_loader, desc='Validation'):
                images = batch['image'].to(self.device)
                labels = batch['label'].to(self.device)
                bboxes = batch.get('bbox', None)

                # Forward pass
                outputs = self.model(images)
                logits = outputs['logits']

                # Calculate losses
                cls_loss = classification_loss_fn(logits, labels)
                loss = cls_loss

                if bboxes is not None:
                    bboxes = bboxes.to(self.device)
                    bbox_pred = outputs['bbox']
                    bbox_loss = bbox_loss_fn(bbox_pred, bboxes)
                    loss = loss + 0.5 * bbox_loss

                # Update metrics
                total_loss += loss.item()
                _, predicted = torch.max(logits.data, 1)
                total += labels.size(0)
                correct += (predicted == labels).sum().item()

        avg_loss = total_loss / len(val_loader)
        accuracy = 100. * correct / total

        return avg_loss, accuracy

    def save_checkpoint(
        self,
        filename: str,
        optimizer: Optional[optim.Optimizer] = None,
        scheduler: Optional[Any] = None,
        history: Optional[Dict] = None
    ):
        checkpoint = {
            'epoch': self.current_epoch,
            'model_state_dict': self.model.state_dict(),
            'best_val_loss': self.best_val_loss,
            'best_val_acc': self.best_val_acc
        }

        if optimizer:
            checkpoint['optimizer_state_dict'] = optimizer.state_dict()

        if scheduler:
            checkpoint['scheduler_state_dict'] = scheduler.state_dict()

        if history:
            checkpoint['history'] = history

        torch.save(checkpoint, self.checkpoint_dir / filename)
        print(f"Checkpoint saved: {filename}")

    def load_checkpoint(
        self,
        filename: str,
        optimizer: Optional[optim.Optimizer] = None,
        scheduler: Optional[Any] = None
    ) -> Dict:
        checkpoint_path = self.checkpoint_dir / filename

        if not checkpoint_path.exists():
            raise FileNotFoundError(f"Checkpoint not found: {checkpoint_path}")

        checkpoint = torch.load(checkpoint_path, map_location=self.device)

        self.model.load_state_dict(checkpoint['model_state_dict'])
        self.current_epoch = checkpoint['epoch']
        self.best_val_loss = checkpoint.get('best_val_loss', float('inf'))
        self.best_val_acc = checkpoint.get('best_val_acc', 0.0)

        if optimizer and 'optimizer_state_dict' in checkpoint:
            optimizer.load_state_dict(checkpoint['optimizer_state_dict'])

        if scheduler and 'scheduler_state_dict' in checkpoint:
            scheduler.load_state_dict(checkpoint['scheduler_state_dict'])

        print(f"Checkpoint loaded: {filename}")
        return checkpoint.get('history', {})