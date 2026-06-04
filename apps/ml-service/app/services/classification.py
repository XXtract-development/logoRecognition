"""
Crop classification service — Epic 8, Story 8.4.

Classifies a localised crop as a specific T3777 certification mark code using
embedding-based similarity search against the reference library, with an
optional fallback to a lightweight pixel-histogram classifier.

Public API:
  classify_crop(crop, confidence_threshold=CLASSIFY_MIN_CONFIDENCE) → dict
    Returns:
      { "t3777_code": str, "confidence": float, "method": str }
    When confidence < confidence_threshold:
      { ..., "uncertain": True }

Configuration (env vars):
  CLASSIFY_MIN_CONFIDENCE  — default confidence threshold (default 0.70)
  CLASSIFY_UNKNOWN_CODE    — code returned when classification is impossible (default "UNKNOWN")
"""

import os
from typing import Any, Dict, Optional

import numpy as np

from app.core.logging import logger

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CLASSIFY_MIN_CONFIDENCE: float = float(os.environ.get("CLASSIFY_MIN_CONFIDENCE", "0.70"))
CLASSIFY_UNKNOWN_CODE: str = os.environ.get("CLASSIFY_UNKNOWN_CODE", "UNKNOWN")


# ---------------------------------------------------------------------------
# Embedding extraction helpers
# ---------------------------------------------------------------------------


def _extract_simple_embedding(crop: Any) -> np.ndarray:
    """
    Produce a compact, model-free embedding from a crop image.

    Strategy: 8x8 grid of mean pixel values per channel.  This is fast,
    differentiable-free, and sufficient for similarity comparison in tests.
    The production path replaces this with model_manager.generate_embedding.
    """
    import cv2

    resized = cv2.resize(crop, (64, 64))
    # 8x8 block means: reshape to (8, 8, 8, 8, c) and average over the inner dims
    h, w, c = resized.shape
    blocks = resized.reshape(8, 8, 8, 8, c).mean(axis=(2, 3))  # (8, 8, c)
    embedding = blocks.flatten().astype(np.float32)
    norm = np.linalg.norm(embedding)
    return embedding / norm if norm > 0 else embedding


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Return cosine similarity between two 1-D numpy arrays."""
    dot = float(np.dot(a, b))
    denom = float(np.linalg.norm(a)) * float(np.linalg.norm(b))
    return dot / denom if denom > 0 else 0.0


# ---------------------------------------------------------------------------
# Core classification function
# ---------------------------------------------------------------------------


async def classify_crop(
    crop: Any,  # numpy ndarray (H, W, 3)
    confidence_threshold: float = CLASSIFY_MIN_CONFIDENCE,
) -> Dict[str, Any]:
    """
    Classify a crop as a T3777 certification mark.

    Pipeline:
      1. Generate embedding for the crop (via model_manager if available,
         else fall back to the simple 8x8 grid embedding).
      2. Retrieve reference embeddings from the database.
      3. Compute cosine similarity against all references.
      4. Return the highest-similarity match.
      5. If confidence < threshold, add "uncertain": True to the result.

    All database / model errors are caught; on failure the function returns
    CLASSIFY_UNKNOWN_CODE with confidence 0.0 (which will be marked uncertain
    unless the threshold is 0.0).
    """
    crop_embedding: Optional[np.ndarray] = None
    method = "embedding"

    # --- Step 1: Generate embedding ------------------------------------------
    try:
        from app.ml.model_manager import model_manager  # may be mocked in tests

        raw_embedding = await model_manager.generate_embedding(crop)

        # Accept the embedding only if it is a real numpy array
        if isinstance(raw_embedding, np.ndarray) and raw_embedding.size > 0:
            norm = np.linalg.norm(raw_embedding)
            crop_embedding = raw_embedding / norm if norm > 0 else raw_embedding
        else:
            raise ValueError("model_manager returned non-array embedding")
    except Exception as exc:
        logger.debug(
            "model_manager unavailable, using simple embedding",
            extra={"error": str(exc)},
        )
        method = "classifier"
        try:
            import cv2  # noqa: F401 — imported for _extract_simple_embedding
            crop_embedding = _extract_simple_embedding(crop)
        except Exception as embed_exc:
            logger.warning("Simple embedding extraction failed", extra={"error": str(embed_exc)})

    # --- Step 2: Retrieve reference embeddings --------------------------------
    best_code: str = CLASSIFY_UNKNOWN_CODE
    best_score: float = 0.0

    if crop_embedding is not None:
        try:
            from app.services.database import db_service  # may be mocked in tests

            references = await db_service.get_reference_embeddings()

            if isinstance(references, list) and references:
                for ref in references:
                    ref_vec = ref.get("embedding")
                    if not isinstance(ref_vec, np.ndarray) or ref_vec.size == 0:
                        continue
                    ref_norm = np.linalg.norm(ref_vec)
                    ref_normalized = ref_vec / ref_norm if ref_norm > 0 else ref_vec
                    sim = _cosine_similarity(crop_embedding, ref_normalized)
                    if sim > best_score:
                        best_score = sim
                        best_code = ref.get("t3777_code", CLASSIFY_UNKNOWN_CODE)
        except Exception as db_exc:
            logger.warning(
                "Reference embedding lookup failed — returning UNKNOWN/uncertain",
                extra={"error": str(db_exc)},
            )

        # No reference match (no references available, or lookup failed) →
        # return UNKNOWN with confidence 0.0 so the result is marked uncertain
        # and routed to human review (Story 8.5). We deliberately do NOT
        # fabricate a plausible-looking T3777 label here: inventing labels would
        # poison the training data downstream. Failing closed is correct.

    result: Dict[str, Any] = {
        "t3777_code": best_code,
        "confidence": float(best_score),
        "method": method,
    }

    if float(best_score) < confidence_threshold:
        result["uncertain"] = True

    return result
