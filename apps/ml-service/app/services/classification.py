"""
Crop classification service — Epic 8, Story 8.4.

Classifies a localised crop as a specific T3777 certification mark code.

Two routes, in priority order:

  1. Embedding route (PRIMARY):
     The crop is embedded with the shared PyTorch embedding backbone
     (model_manager.generate_embedding, architecture: "ONNX detection +
     PyTorch embeddings") and matched against the reference keurmerk library
     via pgvector cosine similarity (db_service.find_similar_references — the
     SAME vector-search pattern as find_similar_logos; we do NOT reimplement
     vector search in Python). confidence = similarity of the best match.
     method = "embedding".

  2. Classifier route (SECONDARY, only when an active trained model exists):
     The crop is run through the active crop-classifier (ONNX) and the
     softmax-max class is returned. method = "classifier". When no active model
     exists, this route is silently skipped — that is NOT an error.

Per-method thresholds: template-score, cosine-similarity and classifier-softmax
are incomparable scales, so a single generic threshold is meaningless. The
caller may pass an explicit ``confidence_threshold`` (which always wins); when
it does not, the per-method default applies:
    CLASSIFY_THRESHOLD_EMBEDDING   (default 0.75, cosine)
    CLASSIFY_THRESHOLD_CLASSIFIER  (default 0.85, softmax)
The result always carries ``method`` so the cross-check (Story 8.5) can weigh
each method independently.

Fail-closed: any DB/model/embedding failure returns
``{t3777_code: UNKNOWN, confidence: 0.0, method: "embedding", uncertain: True}``.
We deliberately never fabricate a plausible T3777 label — inventing labels would
poison the downstream training data. ``uncertain`` is a MARKING (input for the
8.5 routing), not a filter: the crop still flows through with its result.

Public API:
  classify_crop(crop, confidence_threshold=None) → dict
    { "t3777_code": str, "confidence": float ∈ [0,1], "method": str, "uncertain"?: bool }

Configuration (env vars):
  CLASSIFY_THRESHOLD_EMBEDDING   — default cosine threshold (default 0.75)
  CLASSIFY_THRESHOLD_CLASSIFIER  — default softmax threshold (default 0.85)
  CLASSIFY_UNKNOWN_CODE          — code when classification is impossible (default "UNKNOWN")
"""

import os
from typing import Any, Dict, Optional

import numpy as np

from app.core.logging import logger

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CLASSIFY_THRESHOLD_EMBEDDING: float = float(
    os.environ.get("CLASSIFY_THRESHOLD_EMBEDDING", "0.75")
)
CLASSIFY_THRESHOLD_CLASSIFIER: float = float(
    os.environ.get("CLASSIFY_THRESHOLD_CLASSIFIER", "0.85")
)
CLASSIFY_UNKNOWN_CODE: str = os.environ.get("CLASSIFY_UNKNOWN_CODE", "UNKNOWN")

# Story 19.11 (classify-gate): het herkenningspad gebruikt een EIGEN, lagere
# keurmerk-gate dan de gedeelde `keurmerk_gate.GATE_THRESHOLD` (0,5). Die gedeelde
# gate wees echte keurmerken (kp 0,25–0,39, gemeten: RAINFOREST 0,39 / TRIMAN 0,34)
# ten onrechte af vóór de referentie-zoektocht → UNKNOWN. Dit is hetzelfde gate-v2-
# defect als in 19.6, waar het bootstrap-ONTDEKpad al een lagere gate (0,2) kreeg;
# het CLASSIFY-herkenningspad bleef op 0,5. Default 0,2 (patroon
# `FLYWHEEL_BOOTSTRAP_GATE_THRESHOLD`); raakt de gedeelde 0,5-gate elders NIET.
# Meet-gedreven tegen de gold-set kalibreerbaar via `CLASSIFY_GATE_THRESHOLD`.
CLASSIFY_GATE_THRESHOLD: float = float(
    os.environ.get("CLASSIFY_GATE_THRESHOLD", "0.2")
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _to_pil(crop: Any):
    """Convert a crop (numpy BGR ndarray, as produced by cv2/OpenCV) to a PIL
    RGB Image, which is what model_manager.generate_embedding and the eval
    transform expect. Passes PIL images through unchanged.
    """
    from PIL import Image

    if isinstance(crop, np.ndarray):
        arr = crop
        # OpenCV crops are BGR; the backbone expects RGB.
        if arr.ndim == 3 and arr.shape[2] == 3:
            arr = arr[:, :, ::-1]
        return Image.fromarray(np.ascontiguousarray(arr.astype("uint8")))
    return crop  # assume already a PIL image


def _softmax(x: np.ndarray) -> np.ndarray:
    x = x.astype(np.float64).flatten()
    x = x - np.max(x)
    e = np.exp(x)
    s = e.sum()
    return (e / s) if s > 0 else np.full_like(e, 1.0 / max(len(e), 1))


# ---------------------------------------------------------------------------
# Embedding route (primary)
# ---------------------------------------------------------------------------


async def _classify_via_embedding(
    crop: Any, threshold: float
) -> Optional[Dict[str, Any]]:
    """Embedding-similarity route. Returns a result dict, or None if the route
    could not run (backbone/db unavailable) so the caller can fail closed.
    """
    from app.ml.model_manager import model_manager  # may be mocked in tests
    from app.services.database import db_service  # may be mocked in tests

    image = _to_pil(crop)
    raw_embedding = await model_manager.generate_embedding(image)

    if not isinstance(raw_embedding, np.ndarray) or raw_embedding.size == 0:
        raise ValueError("embedding backbone returned a non-array embedding")

    embedding = raw_embedding.astype(np.float32)

    # Keurmerk-vs-not gate (Story 12.4 interim): the proposer surfaces non-keurmerk
    # regions (text, tables, pictograms) that otherwise get a keurmerk label at
    # moderate confidence and flood the review queue. Score the SAME embedding; if
    # it is confidently non-keurmerk, return UNKNOWN before the reference search.
    # Fail-open: a disabled/missing gate returns None and never blocks.
    #
    # Story 19.11: gebruik de CLASSIFY-gescopede gate (default 0,2), NIET de gedeelde
    # `keurmerk_gate.GATE_THRESHOLD` (0,5). Die gedeelde gate wees echte keurmerken
    # (kp 0,25–0,39) ten onrechte af vóór de match (investigate classify-gate-blocks-
    # recognition). De 0,5-gate blijft elders ongewijzigd gelden.
    from app.services.keurmerk_gate import keurmerk_probability

    kp = keurmerk_probability(embedding)
    if kp is not None and kp < CLASSIFY_GATE_THRESHOLD:
        return {
            "t3777_code": CLASSIFY_UNKNOWN_CODE,
            "confidence": 0.0,
            "method": "embedding",
            "uncertain": True,
            "keurmerk_prob": round(kp, 3),
            "gated": True,
        }

    # pgvector cosine search against the reference library — reuse the existing
    # vector-search pattern (find_similar_logos), no Python-side vector search.
    matches = await db_service.find_similar_references(
        embedding=embedding,
        limit=1,
        threshold=0.0,  # threshold applied below so we can mark, not drop
    )

    if not matches:
        # No reference embeddings present (or none above floor) → fail closed.
        return {
            "t3777_code": CLASSIFY_UNKNOWN_CODE,
            "confidence": 0.0,
            "method": "embedding",
            "uncertain": True,
        }

    best = matches[0]
    confidence = float(best.get("similarity", 0.0))
    confidence = max(0.0, min(1.0, confidence))

    result: Dict[str, Any] = {
        "t3777_code": best.get("t3777_code", CLASSIFY_UNKNOWN_CODE),
        "confidence": confidence,
        "method": "embedding",
    }
    if confidence < threshold:
        result["uncertain"] = True
    return result


# ---------------------------------------------------------------------------
# Classifier route (secondary — only when an active model exists)
# ---------------------------------------------------------------------------


async def _classify_via_classifier(
    crop: Any, threshold: float
) -> Optional[Dict[str, Any]]:
    """Active-crop-classifier route. Returns a result dict, or None when there
    is no active model (route silently skipped — NOT an error).
    """
    from app.services.database import db_service

    active_model = await db_service.get_active_model()
    if not active_model:
        return None  # no active model → embedding route only, no error

    labels = None
    config = active_model.get("config")
    if isinstance(config, dict):
        labels = config.get("labels")
    elif isinstance(config, str):
        import json

        try:
            labels = json.loads(config).get("labels")
        except Exception:
            labels = None

    if not labels:
        logger.debug("Active model has no label map; skipping classifier route")
        return None

    # Load the active ONNX classifier from storage and run inference.
    import onnxruntime as ort  # lazy: keep heavy deps out of import time
    import torch

    from app.services.storage import storage_service
    from app.services.trainer import build_eval_transform

    version = active_model.get("version")
    model_bytes = storage_service.load_model(f"logo_detector_{version}", "onnx")
    session = ort.InferenceSession(model_bytes)

    # Preprocess with the SAME canonical eval transform as training (224×224 +
    # ImageNet normalize) — otherwise classifier confidences are meaningless.
    image = _to_pil(crop)
    transform = build_eval_transform()
    tensor = transform(image).unsqueeze(0)
    input_array = (
        tensor.numpy().astype(np.float32)
        if isinstance(tensor, torch.Tensor)
        else np.asarray(tensor)
    )

    input_name = session.get_inputs()[0].name
    outputs = session.run(None, {input_name: input_array})
    logits = np.asarray(outputs[0])
    probs = _softmax(logits)

    best_idx = int(np.argmax(probs))
    confidence = float(probs[best_idx])
    confidence = max(0.0, min(1.0, confidence))
    code = labels[best_idx] if best_idx < len(labels) else CLASSIFY_UNKNOWN_CODE

    result: Dict[str, Any] = {
        "t3777_code": code,
        "confidence": confidence,
        "method": "classifier",
    }
    if confidence < threshold:
        result["uncertain"] = True
    return result


# ---------------------------------------------------------------------------
# Core classification function
# ---------------------------------------------------------------------------


async def classify_crop(
    crop: Any,  # numpy ndarray (H, W, 3) BGR, or PIL Image
    confidence_threshold: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Classify a crop as a T3777 certification mark.

    Routing:
      1. Embedding route (primary): pgvector cosine vs. the reference library.
      2. Classifier route (secondary): only when an active trained model exists;
         used as a fallback when the embedding route is unavailable/UNKNOWN.

    ``confidence_threshold`` always wins when provided. Otherwise the per-method
    default applies (EMBEDDING vs CLASSIFIER env defaults).

    Fail-closed: on any error the function returns UNKNOWN / 0.0 / method
    "embedding" / uncertain True. It never fabricates a label.
    """
    explicit = confidence_threshold is not None
    ns_head_no_read = False  # Story 12.25: lezer geconsulteerd maar geen lezing

    # --- Story 12.22: Nutri-Score-familie-head (vóór de embedding-route) -----
    # Deterministische balk-lezer (kleurgeometrie, ~ms op CPU): leest hij een
    # letter, dan beslist de head — de embedding kan de bijna-identieke letters
    # niet scheiden (spike 12.21: 1/6; head 12.21b: 97,8% precisie). Geen
    # lezing (geen gestandaardiseerde 5-vakjes-balk) → byte-identiek legacy-pad.
    # Fail-open: een reader-fout mag de classificatie nooit breken (AC3/AC5f).
    try:
        # Alleen 3-kanaals uint8 BGR-ndarrays (adversarial-review L2): PIL,
        # BGRA, float- of 1-kanaals-arrays gaan stil langs de head naar legacy
        # (geen warning-ruis per crop).
        if (
            getattr(crop, "ndim", 0) == 3
            and getattr(crop, "shape", (0, 0, 0))[2] == 3
            and str(getattr(crop, "dtype", "")) == "uint8"
        ):
            from app.services.nutriscore_reader import read_nutriscore

            ns_letter, ns_info = read_nutriscore(crop)
            if ns_letter is None:
                # Story 12.25 — kandidaat voor het A2-vangnet (verderop, ná de
                # embedding-route: de familie-poort heeft de embedding-buur nodig).
                ns_head_no_read = True
            if ns_letter is not None:
                ratio = float(ns_info.get("ratio", 1.12))
                # confidence monotoon in de ratio: gemeten bereik [1,12–1,45]
                # afgebeeld op [0,80–0,99] (12.21b), geclamped.
                ns_confidence = round(
                    min(0.99, max(0.80, 0.80 + (ratio - 1.12) * (0.19 / 0.33))), 3
                )
                # Adversarial-review M2: een expliciet meegegeven
                # confidence_threshold wint ook van de head ("always wins",
                # docstring-contract) — daaronder is het resultaat uncertain.
                ns_uncertain = bool(explicit and ns_confidence < confidence_threshold)
                logger.info(
                    "Nutri-Score-head besliste de letter",
                    extra={
                        "t3777_code": f"NUTRISCORE_{ns_letter}",
                        "ratio": ratio,
                        "rotatie": ns_info.get("rotatie"),
                        "confidence": ns_confidence,
                        "uncertain": ns_uncertain,
                    },
                )
                return {
                    "t3777_code": f"NUTRISCORE_{ns_letter}",
                    "confidence": ns_confidence,
                    "method": "nutriscore-head",
                    "uncertain": ns_uncertain,
                }
    except Exception as exc:
        logger.warning(
            "Nutri-Score-head faalde — door naar de legacy-route",
            extra={"error": str(exc)},
        )

    # --- Primary: embedding route -------------------------------------------
    embedding_threshold = (
        confidence_threshold if explicit else CLASSIFY_THRESHOLD_EMBEDDING
    )
    try:
        embedding_result = await _classify_via_embedding(crop, embedding_threshold)
    except Exception as exc:
        logger.warning(
            "Embedding classification route failed — falling back",
            extra={"error": str(exc)},
        )
        embedding_result = None

    # --- Story 12.25: A2-vangnet, uitsluitend achter de familie-poort -------
    # Alleen wanneer (a) de deterministische lezer niets las (12.22), (b) de
    # embedding-buur al NUTRISCORE_* zegt (poort: blokkeert gemeten 197/199
    # andere keurmerken) én (c) dat embedding-resultaat ONZEKER is, beslist het
    # A2-model de letter — bewezen dekking van de gaten van de kleur-lezer
    # (monochrome drukken, onleesbare uitvergroting). Adversarial-review M1:
    # een CONFIDENT embedding-antwoord (>= drempel; sinds 12.3 zijn echte-crop-
    # refs wél letter-onderscheidend voor herhaal-gevallen) wordt NOOIT
    # overschreven — het vangnet vult gaten, het overruled geen zekerheid.
    # NB (review L3, bewust): een gate-geblokkeerd/UNKNOWN embedding-resultaat
    # opent de poort niet — positieve familie-evidentie is vereist.
    # Geen letter of onder de vloer -> byte-identiek legacy. Fail-open: elke
    # A2-fout laat het bestaande resultaat ongemoeid.
    if (
        ns_head_no_read
        and embedding_result is not None
        and embedding_result.get("uncertain", False)
        and str(embedding_result.get("t3777_code", "")).startswith("NUTRISCORE_")
    ):
        try:
            from app.services.nutriscore_a2 import min_conf, predict_letter

            a2_letter, a2_conf, a2_info = predict_letter(crop)
            if a2_letter is not None and a2_conf >= min_conf():
                a2_confidence = round(float(a2_conf), 3)
                a2_uncertain = bool(explicit and a2_confidence < confidence_threshold)
                logger.info(
                    "Nutri-Score-A2-vangnet besliste de letter",
                    extra={
                        "t3777_code": f"NUTRISCORE_{a2_letter}",
                        "confidence": a2_confidence,
                        "gate_nearest": embedding_result.get("t3777_code"),
                        "uncertain": a2_uncertain,
                    },
                )
                return {
                    "t3777_code": f"NUTRISCORE_{a2_letter}",
                    "confidence": a2_confidence,
                    "method": "nutriscore-a2",
                    "uncertain": a2_uncertain,
                }
            else:
                logger.info(
                    "Nutri-Score-A2-vangnet: poort open maar geen claim",
                    extra={"a2": a2_info, "gate_nearest": embedding_result.get("t3777_code")},
                )
        except Exception as exc:
            logger.warning(
                "Nutri-Score-A2-vangnet faalde — legacy-resultaat blijft staan",
                extra={"error": str(exc)},
            )

    # A confident embedding match is the answer.
    if (
        embedding_result is not None
        and embedding_result.get("t3777_code") != CLASSIFY_UNKNOWN_CODE
        and not embedding_result.get("uncertain", False)
    ):
        return embedding_result

    # --- Secondary: classifier route (only when an active model exists) ------
    classifier_threshold = (
        confidence_threshold if explicit else CLASSIFY_THRESHOLD_CLASSIFIER
    )
    try:
        classifier_result = await _classify_via_classifier(crop, classifier_threshold)
    except Exception as exc:
        logger.warning(
            "Classifier classification route failed",
            extra={"error": str(exc)},
        )
        classifier_result = None

    if classifier_result is not None:
        # Prefer a confident classifier result over an uncertain embedding one.
        if not classifier_result.get("uncertain", False):
            return classifier_result
        if embedding_result is None:
            return classifier_result

    # --- Fail closed ---------------------------------------------------------
    if embedding_result is not None:
        return embedding_result

    return {
        "t3777_code": CLASSIFY_UNKNOWN_CODE,
        "confidence": 0.0,
        "method": "embedding",
        "uncertain": True,
    }
