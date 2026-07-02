"""Green-phase tests voor Story 13.1 — canonieke inhouds-hash-service.

Deze tests vervangen de red-phase skips voor 13.1 in
``apps/ml-service/tests/test_flywheel_atdd.py`` (die blijven staan als
ATDD-scaffold, zie de comment daar). CI-conventie: ``pytest tests/unit/``.

AC→test-mapping staat in ``_bmad-output/implementation-artifacts/review-13-1.md``.
"""

import base64
import io
import re
from pathlib import Path

import pytest
from PIL import Image

from app.services import phash as phash_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_image(color=(200, 30, 60), size=(64, 48)) -> Image.Image:
    """Een klein, niet-triviaal beeld (gradient) voor stabiele hashes."""
    img = Image.new("RGB", size, color)
    px = img.load()
    for y in range(size[1]):
        for x in range(size[0]):
            px[x, y] = ((x * 3) % 256, (y * 5) % 256, (x + y) % 256)
    return img


def _encode(image: Image.Image, fmt: str) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format=fmt)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# AC2 — Determinisme (AD-14)
# ---------------------------------------------------------------------------


def test_13_1_ac2_content_hash_is_deterministisch():
    """Zelfde afbeelding → byte-identieke content_hash bij herhaalde aanroep."""
    img = _make_image()
    h1 = phash_service.content_hash(img)
    h2 = phash_service.content_hash(img.copy())
    assert h1 == h2
    assert re.fullmatch(r"[0-9a-f]{64}", h1)  # SHA-256 hex


def test_13_1_ac2_perceptual_hash_is_deterministisch():
    """Zelfde afbeelding → identieke pHash bij herhaalde aanroep."""
    img = _make_image()
    assert phash_service.perceptual_hash(img) == phash_service.perceptual_hash(
        img.copy()
    )


# ---------------------------------------------------------------------------
# AC1/normalisatie — RGB-conversie + formaat-invariantie
# ---------------------------------------------------------------------------


def test_13_1_normalisatie_zelfde_pixels_ander_formaat_zelfde_content_hash():
    """PNG vs. BMP van dezelfde pixels → identieke content_hash (formaat-invariant)."""
    img = _make_image()
    png = phash_service.load_image_from_bytes(_encode(img, "PNG"))
    bmp = phash_service.load_image_from_bytes(_encode(img, "BMP"))
    assert phash_service.content_hash(png) == phash_service.content_hash(bmp)


def test_13_1_normalisatie_rgba_bron_normaliseert_naar_rgb():
    """Een RGBA-bron met volledig opake alpha hasht gelijk aan zijn RGB-equivalent."""
    rgb = _make_image()
    rgba = rgb.convert("RGBA")  # alpha=255 overal
    assert phash_service.content_hash(rgba) == phash_service.content_hash(rgb)


def test_13_1_onderscheidend_vermogen_verschillende_crops_verschillende_hash():
    """Twee visueel verschillende crops → verschillende content_hash."""
    a = _make_image(color=(200, 30, 60))
    b = Image.new("RGB", (64, 48), (10, 220, 15))
    assert phash_service.content_hash(a) != phash_service.content_hash(b)


# ---------------------------------------------------------------------------
# Foutpad — onleesbaar beeld → ValueError (aanroeper maakt er HTTP-fout van)
# ---------------------------------------------------------------------------


def test_13_1_onleesbare_bytes_geven_valueerror_geen_fallback_hash():
    with pytest.raises(ValueError):
        phash_service.load_image_from_bytes(b"dit is geen afbeelding")


# ---------------------------------------------------------------------------
# AC3 — Gepinde dependency + code onder app/
# ---------------------------------------------------------------------------

_ML_ROOT = Path(__file__).resolve().parents[2]  # apps/ml-service


def test_13_1_ac3_imagehash_gepind_op_4_3_2():
    reqs = (_ML_ROOT / "requirements.txt").read_text()
    assert "ImageHash==4.3.2" in reqs


def test_13_1_ac3_nieuwe_code_staat_onder_app():
    assert (_ML_ROOT / "app" / "services" / "phash.py").is_file()
    assert (_ML_ROOT / "app" / "api" / "flywheel.py").is_file()


def test_13_1_ac3_normalisatie_constantes_zijn_vastgelegd():
    """Het hash-contract (N, interpolatie, kleurmodel) is expliciet gepind."""
    assert phash_service.NORMALIZE_MODE == "RGB"
    assert isinstance(phash_service.NORMALIZE_SIZE, int)
    assert phash_service.NORMALIZE_RESAMPLE is not None
