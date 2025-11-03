"""Data and concept drift detection for ML models."""

import numpy as np
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from scipy import stats
from sklearn.preprocessing import StandardScaler
import warnings

class DriftDetector:
    """Detect data and concept drift in ML pipelines"""

    def __init__(self):
        self.baseline_statistics = {}
        self.drift_history = []
        self.alert_thresholds = {
            "psi": 0.2,  # Population Stability Index
            "ks": 0.2,   # Kolmogorov-Smirnov
            "jensen_shannon": 0.3,  # Jensen-Shannon distance
            "concept_drift": 0.15  # Concept drift threshold
        }

    async def calculate_drift_score(
        self,
        current_data: np.ndarray,
        baseline_data: Optional[np.ndarray] = None,
        method: str = "combined"
    ) -> float:
        """
        Calculate drift score between current and baseline data

        Args:
            current_data: Current data distribution
            baseline_data: Baseline data distribution (if None, use stored baseline)
            method: Drift detection method (psi, ks, jensen_shannon, combined)

        Returns:
            Drift score (0-1, higher means more drift)
        """
        if baseline_data is None:
            baseline_data = await self._get_baseline_data()

        if baseline_data is None:
            # No baseline available, store current as baseline
            await self._store_baseline(current_data)
            return 0.0

        if method == "psi":
            score = self._calculate_psi(baseline_data, current_data)
        elif method == "ks":
            score = self._calculate_ks_statistic(baseline_data, current_data)
        elif method == "jensen_shannon":
            score = self._calculate_jensen_shannon(baseline_data, current_data)
        elif method == "combined":
            # Combine multiple methods
            psi = self._calculate_psi(baseline_data, current_data)
            ks = self._calculate_ks_statistic(baseline_data, current_data)
            js = self._calculate_jensen_shannon(baseline_data, current_data)
            score = np.mean([psi, ks, js])
        else:
            raise ValueError(f"Unknown drift detection method: {method}")

        # Store drift score
        await self._store_drift_score(score, method)

        return score

    def _calculate_psi(
        self,
        expected: np.ndarray,
        actual: np.ndarray,
        n_bins: int = 10
    ) -> float:
        """Calculate Population Stability Index (PSI)"""
        # Flatten arrays if multidimensional
        if len(expected.shape) > 1:
            expected = expected.reshape(-1)
        if len(actual.shape) > 1:
            actual = actual.reshape(-1)

        # Create bins based on expected distribution
        _, bins = np.histogram(expected, bins=n_bins)
        bins[0] = -float('inf')
        bins[-1] = float('inf')

        # Calculate frequencies
        expected_freq = np.histogram(expected, bins=bins)[0] / len(expected)
        actual_freq = np.histogram(actual, bins=bins)[0] / len(actual)

        # Avoid division by zero
        expected_freq = np.where(expected_freq == 0, 0.001, expected_freq)
        actual_freq = np.where(actual_freq == 0, 0.001, actual_freq)

        # Calculate PSI
        psi = np.sum((actual_freq - expected_freq) * np.log(actual_freq / expected_freq))

        return min(psi, 1.0)  # Cap at 1.0

    def _calculate_ks_statistic(
        self,
        baseline: np.ndarray,
        current: np.ndarray
    ) -> float:
        """Calculate Kolmogorov-Smirnov statistic"""
        # Flatten arrays if multidimensional
        if len(baseline.shape) > 1:
            baseline = baseline.reshape(-1)
        if len(current.shape) > 1:
            current = current.reshape(-1)

        # Perform KS test
        ks_statistic, p_value = stats.ks_2samp(baseline, current)

        return ks_statistic

    def _calculate_jensen_shannon(
        self,
        p: np.ndarray,
        q: np.ndarray,
        n_bins: int = 10
    ) -> float:
        """Calculate Jensen-Shannon divergence"""
        # Flatten arrays if multidimensional
        if len(p.shape) > 1:
            p = p.reshape(-1)
        if len(q.shape) > 1:
            q = q.reshape(-1)

        # Create histogram bins
        min_val = min(p.min(), q.min())
        max_val = max(p.max(), q.max())
        bins = np.linspace(min_val, max_val, n_bins + 1)

        # Calculate distributions
        p_hist = np.histogram(p, bins=bins)[0] / len(p)
        q_hist = np.histogram(q, bins=bins)[0] / len(q)

        # Avoid log(0)
        p_hist = np.where(p_hist == 0, 1e-10, p_hist)
        q_hist = np.where(q_hist == 0, 1e-10, q_hist)

        # Calculate average distribution
        m = 0.5 * (p_hist + q_hist)

        # Calculate KL divergences
        kl_pm = np.sum(p_hist * np.log(p_hist / m))
        kl_qm = np.sum(q_hist * np.log(q_hist / m))

        # Jensen-Shannon divergence
        js = 0.5 * (kl_pm + kl_qm)

        return min(np.sqrt(js), 1.0)  # Return JS distance (sqrt of JS divergence), capped at 1.0

    async def detect_concept_drift(
        self,
        predictions: np.ndarray,
        labels: np.ndarray,
        window_size: int = 1000
    ) -> Dict:
        """
        Detect concept drift using prediction error analysis

        Args:
            predictions: Model predictions
            labels: True labels
            window_size: Size of sliding window for drift detection

        Returns:
            Dictionary with drift detection results
        """
        errors = predictions != labels

        if len(errors) < window_size * 2:
            return {
                "drift_detected": False,
                "reason": "Insufficient data for concept drift detection"
            }

        # Calculate error rate in recent window vs historical
        recent_errors = errors[-window_size:]
        historical_errors = errors[:-window_size]

        recent_error_rate = np.mean(recent_errors)
        historical_error_rate = np.mean(historical_errors)

        # Page-Hinkley test for drift detection
        drift_detected, drift_score = self._page_hinkley_test(errors, window_size)

        # Statistical test for significant difference
        chi2_stat, p_value = stats.chisquare(
            [np.sum(recent_errors), len(recent_errors) - np.sum(recent_errors)],
            [historical_error_rate * len(recent_errors),
             (1 - historical_error_rate) * len(recent_errors)]
        )

        return {
            "drift_detected": drift_detected or p_value < 0.05,
            "recent_error_rate": recent_error_rate,
            "historical_error_rate": historical_error_rate,
            "drift_score": drift_score,
            "p_value": p_value,
            "chi2_statistic": chi2_stat
        }

    def _page_hinkley_test(
        self,
        errors: np.ndarray,
        window_size: int,
        delta: float = 0.005,
        threshold: float = 50
    ) -> Tuple[bool, float]:
        """Page-Hinkley test for drift detection"""
        m_t = 0
        s_t = 0
        drift_detected = False
        max_s = 0

        for i, error in enumerate(errors):
            m_t = m_t + (error - m_t) / (i + 1)
            s_t = s_t + (error - m_t - delta)
            max_s = max(max_s, s_t)

            if max_s - s_t > threshold:
                drift_detected = True
                break

        drift_score = max_s - s_t
        return drift_detected, drift_score

    async def monitor_feature_drift(
        self,
        features: Dict[str, np.ndarray],
        baseline_features: Optional[Dict[str, np.ndarray]] = None
    ) -> Dict:
        """
        Monitor drift for individual features

        Args:
            features: Dictionary of feature names to values
            baseline_features: Baseline feature distributions

        Returns:
            Dictionary with per-feature drift scores
        """
        if baseline_features is None:
            baseline_features = await self._get_baseline_features()

        if baseline_features is None:
            await self._store_baseline_features(features)
            return {"no_baseline": True}

        feature_drift_scores = {}
        drifted_features = []

        for feature_name, feature_values in features.items():
            if feature_name not in baseline_features:
                continue

            # Calculate drift for this feature
            drift_score = await self.calculate_drift_score(
                feature_values,
                baseline_features[feature_name],
                method="ks"
            )

            feature_drift_scores[feature_name] = drift_score

            if drift_score > self.alert_thresholds["ks"]:
                drifted_features.append(feature_name)

        return {
            "feature_drift_scores": feature_drift_scores,
            "drifted_features": drifted_features,
            "max_drift_score": max(feature_drift_scores.values()) if feature_drift_scores else 0,
            "drift_detected": len(drifted_features) > 0
        }

    async def adaptive_threshold_adjustment(
        self,
        performance_metrics: Dict,
        false_positive_rate: float = 0.05
    ):
        """
        Adaptively adjust drift detection thresholds based on model performance

        Args:
            performance_metrics: Recent model performance metrics
            false_positive_rate: Target false positive rate for drift detection
        """
        # Analyze historical drift detections vs actual performance degradation
        if len(self.drift_history) < 10:
            return  # Not enough history

        # Calculate correlation between drift scores and performance
        drift_scores = [h["score"] for h in self.drift_history[-20:]]
        performance_scores = [h.get("performance", 1.0) for h in self.drift_history[-20:]]

        correlation = np.corrcoef(drift_scores, performance_scores)[0, 1]

        # Adjust thresholds based on correlation
        if abs(correlation) < 0.3:
            # Weak correlation - increase thresholds to reduce false positives
            for key in self.alert_thresholds:
                self.alert_thresholds[key] *= 1.1
        elif abs(correlation) > 0.7:
            # Strong correlation - decrease thresholds for earlier detection
            for key in self.alert_thresholds:
                self.alert_thresholds[key] *= 0.9

        # Cap thresholds
        for key in self.alert_thresholds:
            self.alert_thresholds[key] = min(0.5, max(0.05, self.alert_thresholds[key]))

    async def _get_baseline_data(self) -> Optional[np.ndarray]:
        """Get stored baseline data"""
        # In production, this would retrieve from database
        return self.baseline_statistics.get("data")

    async def _store_baseline(self, data: np.ndarray):
        """Store baseline data"""
        self.baseline_statistics["data"] = data
        self.baseline_statistics["stored_at"] = datetime.now()

    async def _get_baseline_features(self) -> Optional[Dict[str, np.ndarray]]:
        """Get stored baseline features"""
        return self.baseline_statistics.get("features")

    async def _store_baseline_features(self, features: Dict[str, np.ndarray]):
        """Store baseline features"""
        self.baseline_statistics["features"] = features
        self.baseline_statistics["features_stored_at"] = datetime.now()

    async def _store_drift_score(self, score: float, method: str):
        """Store drift score in history"""
        self.drift_history.append({
            "score": score,
            "method": method,
            "timestamp": datetime.now(),
            "alert_triggered": score > self.alert_thresholds.get(method, 0.2)
        })

        # Keep only last 1000 entries
        if len(self.drift_history) > 1000:
            self.drift_history = self.drift_history[-1000:]