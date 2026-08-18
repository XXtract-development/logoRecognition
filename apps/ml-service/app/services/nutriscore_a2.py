"""Story 12.25 — A2-vangnet: klein 5-klasse Nutri-Score-model (NutriGreen).

Rol: TWEEDE kans, uitsluitend wanneer (a) de deterministische balk-lezer
(12.22) GEEN lezing gaf én (b) de embedding-buurt al NUTRISCORE_* zegt (de
familie-poort in classify_crop — blokkeert gemeten 197/199 andere keurmerken).
Dekt de bewezen gaten van de kleur-lezer: monochrome drukken en varianten
zonder leesbare uitvergroting (ACC-held-out: A_24→A, A_25→A, D_40→D).

Model: MobileNetV3-small (6 klassen: A-E + none), getraind op de publieke
NutriGreen-dataset. Ontwerpbesluit 2026-07-15: de v1-gewichten (zónder
ACC-hard-negatives) — de hard-negative-variant (v2) verloor de monochrome
dekking; de familie-poort neemt de vals-positief-beheersing over (v1 open
gemeten: 17/199 claims; mét poort: rest-oppervlak 2/199, in productie kleiner
omdat vreemde crops hun eigen familie als embedding-buur hebben).

Gewichten staan in MinIO (training-bucket) en worden lazy geladen (singleton).
Elke fout propageert als exception: de router vangt 'm en valt byte-identiek
terug op het legacy-pad (fail-open).

Env:
  NUTRISCORE_A2_MODEL_KEY  MinIO-sleutel state_dict
                           (default models/nutriscore-a2/v1/a2_mobilenetv3s.pt)
  NUTRISCORE_A2_META_KEY   MinIO-sleutel metadata/klassen
                           (default models/nutriscore-a2/v1/a2_meta.json)
  NUTRISCORE_A2_MIN_CONF   confidence-vloer voor een letter-claim (default 0.5;
                           geclamped >= 0.2)

Attributie (CC-BY-SA 4.0): getraind op de NutriGreen Image Dataset,
Zenodo 10.5281/zenodo.8374047.
"""

from __future__ import annotations

import io
import json
import os
import threading
from typing import Any, Dict, Optional, Tuple

import numpy as np

from app.core.logging import logger

DEFAULT_MIN_CONF = 0.5
_MODEL_KEY_DEFAULT = "models/nutriscore-a2/v1/a2_mobilenetv3s.pt"
_META_KEY_DEFAULT = "models/nutriscore-a2/v1/a2_meta.json"

_lock = threading.Lock()
_model = None
_classes: Optional[list] = None
# review M3: mislukte loads kort cachen — anders doet élke poort-passer in een
# omgeving zonder artefact opnieuw een MinIO-roundtrip + warning.
_fail_until = 0.0
_FAIL_COOLDOWN_S = 60.0

# ImageNet-normalisatie — identiek aan de training (train_a2.py).
_MEAN = np.array([0.485, 0.456, 0.406], np.float32)
_STD = np.array([0.229, 0.224, 0.225], np.float32)


def min_conf() -> float:
    raw = os.environ.get("NUTRISCORE_A2_MIN_CONF")
    if raw:
        try:
            return max(0.2, float(raw))
        except ValueError:
            logger.warning(
                "Ongeldige NUTRISCORE_A2_MIN_CONF — default gebruikt",
                extra={"raw": raw, "default": DEFAULT_MIN_CONF},
            )
    return DEFAULT_MIN_CONF


def _load():
    """Lazy singleton-load van model + klassen uit MinIO. Raise bij elke fout;
    een mislukte load wordt _FAIL_COOLDOWN_S niet opnieuw geprobeerd (M3).
    De load is synchroon (~2-4 s eenmalig per worker, consistent met de
    bestaande sync-inferentiepatronen); daarna ~tientallen ms per aanroep."""
    global _model, _classes, _fail_until
    if _model is not None:
        return
    import time as _time

    if _time.monotonic() < _fail_until:
        raise RuntimeError("A2-model eerder niet laadbaar (cooldown actief)")
    with _lock:
        if _model is not None:
            return
        import torch
        import torch.nn as nn
        from torchvision import models

        from app.services.storage import storage_service

        try:
            model_key = os.environ.get("NUTRISCORE_A2_MODEL_KEY", _MODEL_KEY_DEFAULT)
            meta_key = os.environ.get("NUTRISCORE_A2_META_KEY", _META_KEY_DEFAULT)
            meta_raw = storage_service.get_training_image(meta_key)
            meta = json.loads(
                meta_raw.decode("utf-8")
                if isinstance(meta_raw, (bytes, bytearray))
                else meta_raw
            )
            classes = list(meta["classes"])
            state_raw = storage_service.get_training_image(model_key)
            state = torch.load(
                io.BytesIO(bytes(state_raw)), map_location="cpu", weights_only=True
            )
            m = models.mobilenet_v3_small()
            m.classifier[-1] = nn.Linear(m.classifier[-1].in_features, len(classes))
            m.load_state_dict(state)
            m.eval()
            # review L1: classes vóór model zetten (fast-path-check kijkt naar _model)
            _classes = classes
            _model = m
            logger.info(
                "Nutri-Score A2-vangnetmodel geladen",
                extra={"model_key": model_key, "classes": classes},
            )
        except Exception:
            _fail_until = _time.monotonic() + _FAIL_COOLDOWN_S
            raise


def predict_letter(img_bgr: np.ndarray) -> Tuple[Optional[str], float, Dict[str, Any]]:
    """Voorspel de Nutri-Score-letter van een BGR-crop.

    Returns (letter|None, confidence, info): letter is None wanneer het model
    "none" voorspelt (geen Nutri-Score) — de aanroeper past de vloer toe.
    Fouten propageren (router = fail-open).
    """
    _load()
    # Beide zwaar, daarom pas hier geladen. De onderlinge volgorde maakt niets uit: `cv2`
    # staat al op bestandsniveau in vijf andere services (o.a. nutriscore_reader.py), dus
    # tegen de tijd dat deze functie draait staat hij allang in sys.modules en is dit enkel
    # nog een opzoekactie.
    import cv2
    import torch

    # BGR ndarray -> RGB float32 [0,1] -> 224x224 -> genormaliseerd NCHW
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    rgb = cv2.resize(rgb, (224, 224), interpolation=cv2.INTER_AREA)
    x = (rgb.astype(np.float32) / 255.0 - _MEAN) / _STD
    tensor = torch.from_numpy(x.transpose(2, 0, 1)).unsqueeze(0)
    with torch.no_grad():
        prob = torch.softmax(_model(tensor), 1)[0].numpy()
    idx = int(prob.argmax())
    pred, conf = _classes[idx], float(prob[idx])
    info = {
        "pred": pred,
        "conf": round(conf, 3),
        "probs": {c: round(float(p), 3) for c, p in zip(_classes, prob)},
    }
    if pred not in {"A", "B", "C", "D", "E"}:
        return None, conf, info
    return pred, conf, info
