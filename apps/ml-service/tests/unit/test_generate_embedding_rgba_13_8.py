"""Story 13.8 — ``generate_embedding`` moet niet-RGB-beelden (RGBA e.d.) veilig
inbedden.

RED vóór de fix: een RGBA-beeld levert via ``ToTensor`` een 4-kanaals tensor die
botst met de 3-kanaals ``Normalize`` -> RuntimeError "The size of tensor a (4)
must match the size of tensor b (3)". Dit is precies de fout die de regressiepoort
op ACC fail-closed quarantaineerde (menselijk-geannoteerde gold-set-crops zijn
RGBA). GREEN ná de fix: ``generate_embedding`` converteert eerst naar RGB.

Deze test draait de ECHTE torch-preprocessing (mockt ``generate_embedding`` niet),
daarom is torch vereist; zonder torch valt de functie terug op de mock-tak en is
er niets te toetsen -> skip. Het embedding-model zelf is een lichte stub: de fout
zit in de preprocessing (vóór het model), dus echte gewichten zijn niet nodig.
"""

import importlib.util

import numpy as np
import pytest
from PIL import Image

from app.ml.model_manager import ModelManager

torch = pytest.importorskip("torch")
# BEWUST GEEN eager torchvision-IMPORT: de echte ``generate_embedding`` doet
# ``from torchvision import transforms`` LAZY. Deze test is daarmee tegelijk de
# regressieprobe voor Story 13.10 — zou een andere test opnieuw een nep-``cv2``
# zónder ``__spec__`` in ``sys.modules`` achterlaten, dan crasht die lazy import
# hier op ``cv2.__spec__ is None`` en wordt deze test rood. (13.8 had hier
# tijdelijk een eager-import-workaround; 13.10 nam de oorzaak weg.)
#
# We checken de aanwezigheid van torchvision daarom met ``find_spec`` — dat
# RESOLVET de module zonder 'm te IMPORTEREN. Zo blijft de skip-vriendelijkheid
# behouden in een omgeving zónder torchvision, zonder de lazy import (= de probe)
# te ondermijnen.
if importlib.util.find_spec("torchvision") is None:  # pragma: no cover
    pytest.skip("torchvision niet beschikbaar", allow_module_level=True)

# NB (probe-dekking): deze test vangt de cv2-pollutie alleen als hij ná de
# injecterende tests draait. pytest collecteert per bestand alfabetisch en
# ``test_bootstrap_search_service.py`` < ``test_generate_embedding_rgba_13_8.py``,
# dus die volgorde geldt vandaag. Draait de suite ooit gerandomiseerd of parallel,
# dan is de probe niet meer gegarandeerd dekkend — de échte bescherming blijft de
# fix in 13.10 (geldige ``__spec__`` + ``monkeypatch.setitem``).


def _stub_embedding_model(input_tensor):
    """Neemt de 3-kanaals preprocessing-tensor aan, retourneert een 512-vector."""
    return torch.zeros((input_tensor.shape[0], 512))


def _mm() -> ModelManager:
    mm = ModelManager()
    mm._device = "cpu"
    mm.embedding_model = _stub_embedding_model
    return mm


@pytest.mark.asyncio
async def test_generate_embedding_accepts_rgba():
    """RGBA-crop wordt naar RGB geconverteerd en levert een 512-vector (geen 4≠3)."""
    rgba = Image.new("RGBA", (64, 64), (200, 30, 30, 128))
    vec = await _mm().generate_embedding(rgba)
    assert isinstance(vec, np.ndarray)
    assert vec.shape[0] == 512


@pytest.mark.asyncio
async def test_generate_embedding_accepts_palette_and_grayscale():
    """Ook andere niet-RGB-modes (P, L) mogen niet breken."""
    for mode in ("P", "L", "LA"):
        img = Image.new(mode, (48, 48))
        vec = await _mm().generate_embedding(img)
        assert vec.shape[0] == 512, mode


@pytest.mark.asyncio
async def test_generate_embedding_rgb_unchanged():
    """RGB-invoer blijft werken (conversie is een no-op op RGB)."""
    rgb = Image.new("RGB", (64, 64), (200, 30, 30))
    vec = await _mm().generate_embedding(rgb)
    assert isinstance(vec, np.ndarray)
    assert vec.shape[0] == 512
