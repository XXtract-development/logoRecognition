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

import numpy as np
import pytest
from PIL import Image

from app.ml.model_manager import ModelManager

torch = pytest.importorskip("torch")
# Importeer torchvision eager op collection-tijd (vóór enige test draait). De
# echte ``generate_embedding`` doet ``from torchvision import transforms`` lazy;
# zou torchvision pas tijdens onze test voor het eerst geladen worden, dan trapt
# die import over een door een ándere test in ``sys.modules`` geïnjecteerde
# nep-``cv2`` (zonder ``__spec__``) -> volgorde-afhankelijke flakiness. Eager
# laden cachet torchvision schoon, ongeacht testvolgorde.
pytest.importorskip("torchvision")


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
