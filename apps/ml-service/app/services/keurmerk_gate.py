"""
Keurmerk-vs-not gate (Story 12.4 — interim before the trained detector).

The classic region proposer surfaces many NON-keurmerk regions (nutrition tables,
text, pictograms, partial crops) which the classifier then labels as keurmerken at
moderate confidence — flooding the review queue (diagnosed 2026-06-13). This gate is
a tiny binary classifier on the SAME effb0 embedding the classify path already
computes: P(this crop is a keurmerk). Below a threshold the crop is treated as
non-keurmerk → UNKNOWN, so it never becomes a keurmerk proposal.

Spike-validated (12-4-spike-resultaten.md): effb0 + logistic regression separates
keurmerk from the hard moderate-confidence negatives at ROC-AUC ~0.96. The model is
persisted as plain weights (coef + intercept) in storage so serving needs no sklearn.

Fail-OPEN by design: if the model is missing/unreadable, the gate passes everything
(probability None → caller does not block). A broken gate must never silently drop
all detections.

Configuration (env):
  KEURMERK_GATE_ENABLED    — master switch (default "true")
  KEURMERK_GATE_THRESHOLD  — P(keurmerk) below which a crop is non-keurmerk (default 0.5)
  KEURMERK_GATE_KEY        — storage key of the weights (default keurmerk-gate/gate-v1.json)
"""

import json
import os
from typing import Optional

import numpy as np

from app.core.logging import logger

GATE_ENABLED: bool = os.environ.get("KEURMERK_GATE_ENABLED", "true").lower() == "true"
GATE_THRESHOLD: float = float(os.environ.get("KEURMERK_GATE_THRESHOLD", "0.5"))
GATE_KEY: str = os.environ.get("KEURMERK_GATE_KEY", "keurmerk-gate/gate-v1.json")

# Cached weights: (coef ndarray, intercept float, l2_normalize bool) or False if a
# load was attempted and failed (so we do not retry on every crop).
_GATE: Optional[object] = None


def _load_gate() -> Optional[object]:
    global _GATE
    if _GATE is not None:
        return _GATE if _GATE is not False else None
    try:
        from app.services.storage import storage_service

        data = storage_service.get_training_image(GATE_KEY)
        m = json.loads(data.decode("utf-8"))
        coef = np.asarray(m["coef"], dtype=np.float32)
        gate = (coef, float(m["intercept"]), bool(m.get("l2_normalize", True)))
        _GATE = gate
        logger.info(
            "Keurmerk gate loaded",
            extra={"key": GATE_KEY, "version": m.get("version"), "auc": m.get("auc"), "dim": coef.shape[0]},
        )
        return gate
    except Exception as exc:  # fail-open: no gate → never block
        logger.warning("Keurmerk gate unavailable — passing all crops", extra={"key": GATE_KEY, "error": str(exc)})
        _GATE = False
        return None


def keurmerk_probability(embedding: np.ndarray) -> Optional[float]:
    """P(crop is a keurmerk) from its effb0 embedding, or None if the gate is
    disabled/unavailable (fail-open → caller does not block)."""
    if not GATE_ENABLED:
        return None
    gate = _load_gate()
    if gate is None:
        return None
    coef, intercept, l2 = gate  # type: ignore[misc]
    e = np.asarray(embedding, dtype=np.float32).ravel()
    if e.shape[0] != coef.shape[0]:
        return None  # dimension mismatch → fail-open
    if l2:
        n = float(np.linalg.norm(e))
        if n > 0:
            e = e / n
    z = float(np.dot(e, coef) + intercept)
    return float(1.0 / (1.0 + np.exp(-z)))


def is_non_keurmerk(embedding: np.ndarray) -> bool:
    """True only when the gate is active AND confidently says non-keurmerk."""
    p = keurmerk_probability(embedding)
    return p is not None and p < GATE_THRESHOLD
