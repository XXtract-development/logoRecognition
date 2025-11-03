"""Hyperparameter optimization for ML models using Optuna."""

import optuna
import numpy as np
from typing import Dict, Any, Optional, Callable
from datetime import datetime
import json
import mlflow

class HyperparameterOptimizer:
    """Optimize hyperparameters using Optuna framework"""

    def __init__(self):
        self.study = None
        self.best_params = None
        self.optimization_history = []

    async def optimize(
        self,
        dataset,
        n_trials: int = 50,
        objective_metric: str = "accuracy",
        timeout: Optional[int] = None,
        parallel: bool = True
    ) -> Dict[str, Any]:
        """
        Optimize hyperparameters for model training

        Args:
            dataset: Training dataset
            n_trials: Number of optimization trials
            objective_metric: Metric to optimize (accuracy, f1, etc.)
            timeout: Maximum optimization time in seconds
            parallel: Whether to run trials in parallel

        Returns:
            Dictionary with best hyperparameters
        """
        # Create study
        self.study = optuna.create_study(
            direction="maximize" if objective_metric in ["accuracy", "f1", "auc"] else "minimize",
            sampler=optuna.samplers.TPESampler(seed=42),
            pruner=optuna.pruners.MedianPruner(n_startup_trials=5)
        )

        # Define objective function
        def objective(trial):
            return self._objective_function(trial, dataset, objective_metric)

        # Run optimization
        self.study.optimize(
            objective,
            n_trials=n_trials,
            timeout=timeout,
            n_jobs=-1 if parallel else 1,
            show_progress_bar=True
        )

        # Get best parameters
        self.best_params = self.study.best_params
        best_value = self.study.best_value

        # Log results
        await self._log_optimization_results()

        return {
            **self.best_params,
            "best_value": best_value,
            "n_trials": len(self.study.trials),
            "optimization_time": datetime.now().isoformat()
        }

    def _objective_function(
        self,
        trial: optuna.Trial,
        dataset,
        metric: str
    ) -> float:
        """Objective function for optimization"""
        # Suggest hyperparameters
        params = self._suggest_hyperparameters(trial)

        # Train model with suggested parameters
        model = self._train_model_with_params(dataset, params)

        # Evaluate model
        score = self._evaluate_model(model, dataset, metric)

        # Report intermediate value for pruning
        trial.report(score, step=0)

        # Check if trial should be pruned
        if trial.should_prune():
            raise optuna.TrialPruned()

        return score

    def _suggest_hyperparameters(self, trial: optuna.Trial) -> Dict[str, Any]:
        """Suggest hyperparameters for trial"""
        # Model architecture parameters
        params = {
            # Neural network parameters
            "learning_rate": trial.suggest_loguniform("learning_rate", 1e-5, 1e-1),
            "batch_size": trial.suggest_categorical("batch_size", [16, 32, 64, 128]),
            "num_epochs": trial.suggest_int("num_epochs", 10, 100),
            "dropout_rate": trial.suggest_uniform("dropout_rate", 0.0, 0.5),
            "weight_decay": trial.suggest_loguniform("weight_decay", 1e-6, 1e-2),

            # Optimizer parameters
            "optimizer": trial.suggest_categorical("optimizer", ["adam", "sgd", "rmsprop"]),
            "momentum": trial.suggest_uniform("momentum", 0.0, 0.99) if trial.params.get("optimizer") == "sgd" else 0.9,

            # Model architecture
            "num_layers": trial.suggest_int("num_layers", 2, 8),
            "hidden_size": trial.suggest_categorical("hidden_size", [64, 128, 256, 512]),
            "activation": trial.suggest_categorical("activation", ["relu", "tanh", "elu", "gelu"]),

            # Regularization
            "use_batch_norm": trial.suggest_categorical("use_batch_norm", [True, False]),
            "use_layer_norm": trial.suggest_categorical("use_layer_norm", [True, False]),
            "label_smoothing": trial.suggest_uniform("label_smoothing", 0.0, 0.2),

            # Data augmentation
            "augmentation_prob": trial.suggest_uniform("augmentation_prob", 0.0, 0.5),
            "mixup_alpha": trial.suggest_uniform("mixup_alpha", 0.0, 0.4),

            # Training strategy
            "gradient_clip": trial.suggest_uniform("gradient_clip", 0.5, 5.0),
            "warmup_steps": trial.suggest_int("warmup_steps", 0, 1000),
            "scheduler": trial.suggest_categorical("scheduler", ["constant", "cosine", "exponential", "step"])
        }

        # Add scheduler-specific parameters
        if params["scheduler"] == "step":
            params["step_size"] = trial.suggest_int("step_size", 5, 30)
            params["gamma"] = trial.suggest_uniform("gamma", 0.1, 0.9)
        elif params["scheduler"] == "exponential":
            params["exp_gamma"] = trial.suggest_uniform("exp_gamma", 0.9, 0.999)

        return params

    def _train_model_with_params(self, dataset, params: Dict[str, Any]):
        """Train model with specified hyperparameters"""
        # This is a simplified version - in production, this would use actual model training
        import torch
        import torch.nn as nn
        from torch.utils.data import DataLoader, TensorDataset

        # Create model based on parameters
        model = self._create_model(params)

        # Setup optimizer
        optimizer = self._create_optimizer(model, params)

        # Setup scheduler
        scheduler = self._create_scheduler(optimizer, params)

        # Create data loaders
        train_loader = self._create_dataloader(dataset, params["batch_size"])

        # Training loop (simplified)
        model.train()
        for epoch in range(params["num_epochs"]):
            for batch_idx, (data, target) in enumerate(train_loader):
                optimizer.zero_grad()

                # Forward pass
                output = model(data)
                loss = nn.CrossEntropyLoss(label_smoothing=params.get("label_smoothing", 0.0))(output, target)

                # Backward pass
                loss.backward()

                # Gradient clipping
                torch.nn.utils.clip_grad_norm_(model.parameters(), params["gradient_clip"])

                optimizer.step()

            scheduler.step()

        return model

    def _create_model(self, params: Dict[str, Any]):
        """Create model based on hyperparameters"""
        import torch.nn as nn

        layers = []
        input_size = 224 * 224 * 3  # Example input size

        for i in range(params["num_layers"]):
            if i == 0:
                layers.append(nn.Linear(input_size, params["hidden_size"]))
            else:
                layers.append(nn.Linear(params["hidden_size"], params["hidden_size"]))

            # Activation
            if params["activation"] == "relu":
                layers.append(nn.ReLU())
            elif params["activation"] == "tanh":
                layers.append(nn.Tanh())
            elif params["activation"] == "elu":
                layers.append(nn.ELU())
            elif params["activation"] == "gelu":
                layers.append(nn.GELU())

            # Normalization
            if params["use_batch_norm"]:
                layers.append(nn.BatchNorm1d(params["hidden_size"]))
            elif params["use_layer_norm"]:
                layers.append(nn.LayerNorm(params["hidden_size"]))

            # Dropout
            layers.append(nn.Dropout(params["dropout_rate"]))

        # Output layer
        layers.append(nn.Linear(params["hidden_size"], 10))  # 10 classes for example

        return nn.Sequential(*layers)

    def _create_optimizer(self, model, params: Dict[str, Any]):
        """Create optimizer based on hyperparameters"""
        import torch.optim as optim

        if params["optimizer"] == "adam":
            return optim.Adam(
                model.parameters(),
                lr=params["learning_rate"],
                weight_decay=params["weight_decay"]
            )
        elif params["optimizer"] == "sgd":
            return optim.SGD(
                model.parameters(),
                lr=params["learning_rate"],
                momentum=params["momentum"],
                weight_decay=params["weight_decay"]
            )
        elif params["optimizer"] == "rmsprop":
            return optim.RMSprop(
                model.parameters(),
                lr=params["learning_rate"],
                weight_decay=params["weight_decay"]
            )

    def _create_scheduler(self, optimizer, params: Dict[str, Any]):
        """Create learning rate scheduler"""
        import torch.optim.lr_scheduler as lr_scheduler

        if params["scheduler"] == "cosine":
            return lr_scheduler.CosineAnnealingLR(optimizer, T_max=params["num_epochs"])
        elif params["scheduler"] == "exponential":
            return lr_scheduler.ExponentialLR(optimizer, gamma=params.get("exp_gamma", 0.95))
        elif params["scheduler"] == "step":
            return lr_scheduler.StepLR(
                optimizer,
                step_size=params.get("step_size", 10),
                gamma=params.get("gamma", 0.5)
            )
        else:  # constant
            return lr_scheduler.LambdaLR(optimizer, lambda epoch: 1.0)

    def _create_dataloader(self, dataset, batch_size: int):
        """Create data loader"""
        import torch
        from torch.utils.data import DataLoader, TensorDataset

        # Convert to tensors (simplified)
        X = torch.FloatTensor(dataset.X_train.reshape(dataset.X_train.shape[0], -1))
        y = torch.LongTensor(dataset.y_train)

        tensor_dataset = TensorDataset(X, y)
        return DataLoader(tensor_dataset, batch_size=batch_size, shuffle=True)

    def _evaluate_model(self, model, dataset, metric: str) -> float:
        """Evaluate model performance"""
        import torch
        from sklearn.metrics import accuracy_score, f1_score, roc_auc_score

        model.eval()

        # Get predictions (simplified)
        X_val = torch.FloatTensor(dataset.X_val.reshape(dataset.X_val.shape[0], -1))
        y_val = dataset.y_val

        with torch.no_grad():
            outputs = model(X_val)
            predictions = torch.argmax(outputs, dim=1).numpy()

        # Calculate metric
        if metric == "accuracy":
            return accuracy_score(y_val, predictions)
        elif metric == "f1":
            return f1_score(y_val, predictions, average='weighted')
        elif metric == "auc":
            if len(np.unique(y_val)) == 2:
                # Binary classification
                probs = torch.softmax(outputs, dim=1)[:, 1].numpy()
                return roc_auc_score(y_val, probs)
            else:
                # Multi-class
                probs = torch.softmax(outputs, dim=1).numpy()
                return roc_auc_score(y_val, probs, multi_class='ovr')
        else:
            return accuracy_score(y_val, predictions)

    async def _log_optimization_results(self):
        """Log optimization results"""
        # Log to MLflow
        mlflow.log_params(self.best_params)
        mlflow.log_metric("best_value", self.study.best_value)
        mlflow.log_metric("n_trials", len(self.study.trials))

        # Create optimization report
        report = {
            "best_params": self.best_params,
            "best_value": self.study.best_value,
            "n_trials": len(self.study.trials),
            "optimization_history": [
                {
                    "trial": i,
                    "value": trial.value,
                    "params": trial.params
                }
                for i, trial in enumerate(self.study.trials)
            ]
        }

        mlflow.log_dict(report, "optimization_report.json")

        # Store in history
        self.optimization_history.append({
            "timestamp": datetime.now().isoformat(),
            "best_params": self.best_params,
            "best_value": self.study.best_value
        })

    def get_parallel_coordinates_plot(self):
        """Get parallel coordinates plot of optimization"""
        return optuna.visualization.plot_parallel_coordinate(self.study)

    def get_optimization_history_plot(self):
        """Get optimization history plot"""
        return optuna.visualization.plot_optimization_history(self.study)

    def get_param_importances(self):
        """Get parameter importance analysis"""
        return optuna.importance.get_param_importances(self.study)