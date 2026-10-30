"""Gedeeld voor fase B: laadt artwork_proposals.py van deze worktree (b6a0857) met minimale vervangers voor
provider_config/strict_blocking/_iou, zodat VTF en de K1-vensters exact de productiecode gebruiken.
Sleutel: alleen uit de omgeving (OPENROUTER_KEY), nooit op schijf."""
import asyncio, base64, hashlib, importlib.util, json, os, sys, time, types
from pathlib import Path
import cv2, numpy as np

REPO = Path(__file__).resolve().parents[4]
ML = REPO / "apps/ml-service/app"
BASE = Path.home() / "logo-meetset-20261018/ontwikkelmeting-20261028"
FASEB = BASE / "fase-b"
OPENROUTER = "https://openrouter.ai/api/v1"
TOP15 = sorted(["RAINFOREST_ALLIANCE_PEOPLE_NATURE", "WEIDEMELK", "EU_ORGANIC_FARMING", "RECYCLABLE_GENERAL_CLAIM",
                "BETER_LEVEN_1_STER", "PREGNANCY_WARNING", "GREEN_DOT", "VEGAN", "NUTRISCORE_A", "EUROPEAN_V_LABEL_VEGAN",
                "FOREST_STEWARDSHIP_COUNCIL_MIX", "MARINE_STEWARDSHIP_COUNCIL_LABEL", "NUTRISCORE_C", "NUTRISCORE_B",
                "VEGAN_SOCIETY_VEGAN_LOGO"])
TARIEF = {"anthropic/claude-sonnet-5.5": (2e-6, 10e-6), "google/gemini-3.8-flash": (0.825e-6, 4.125e-6)}  # OpenRouter-API 30-10-2026

def _iou(a, b):
    ix = max(0, min(a["x"] + a["width"], b["x"] + b["width"]) - max(a["x"], b["x"]))
    iy = max(0, min(a["y"] + a["height"], b["y"] + b["height"]) - max(a["y"], b["y"]))
    i = ix * iy
    return 0.0 if i == 0 else i / (a["width"] * a["height"] + b["width"] * b["height"] - i)

def load_proposals(model="anthropic/claude-sonnet-5.5"):
    """artwork_proposals.py uit de worktree, met vervangers (geen app-instellingen, geen container)."""
    async def strict_blocking(f, *a, **k):
        return await asyncio.to_thread(f, *a, **k)
    stubs = {"app": types.ModuleType("app"), "app.ghs_review": types.ModuleType("app.ghs_review"),
             "app.api": types.ModuleType("app.api"), "app.api.artwork": types.ModuleType("app.api.artwork"),
             "app.services": types.ModuleType("app.services"), "app.services.localization": types.ModuleType("app.services.localization")}
    stubs["app.ghs_review"].provider_config = lambda: (OPENROUTER, os.environ["OPENROUTER_KEY"], [model, model])
    stubs["app.api.artwork"].strict_blocking = strict_blocking
    stubs["app.services.localization"]._iou = _iou
    sys.modules.update(stubs)
    spec = importlib.util.spec_from_file_location("artwork_proposals", ML / "services/artwork_proposals.py")
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    return mod

def selectie():
    return json.loads((BASE / "voorlopige-selectie.json").read_text())

def lees_beeld(pad, verwachte_sha=None):
    data = Path(pad).read_bytes(); sha = hashlib.sha256(data).hexdigest()
    if verwachte_sha and sha != verwachte_sha:
        raise ValueError(f"sha256 wijkt af voor {pad}")
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"onleesbaar beeld {pad}")
    return img, sha

def vensters(mod, img):
    h, w = img.shape[:2]
    return [(0, 0, w, h)] + mod.tile_windows(w, h, 6)

def jpeg_b64(img, max_side=1500, q=85):
    h, w = img.shape[:2]; r = min(1.0, max_side / max(h, w))
    small = cv2.resize(img, (max(1, round(w * r)), max(1, round(h * r))), interpolation=cv2.INTER_AREA) if r < 1 else img
    ok, enc = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, q])
    assert ok
    return base64.b64encode(enc).decode("ascii"), small.shape[1], small.shape[0]

def kosten(model, tin, tout):
    a, b = TARIEF[model]
    return None if tin is None or tout is None else tin * a + tout * b
