"""Green-phase tests voor de bootstrap-zaad-zoekservice (Story 17.1).

Twee lagen:
  1. De PURE ``cosine``-drempelvergelijking (numpy-only) — de kern van de
     zaad-match. Deterministisch, geen cv2/torch/storage.
  2. Het ``search_with_seed``-recept met VOLLEDIG gemockte zware collaborators
     (model_manager, storage_service, region_proposer, keurmerk_gate, cv2) —
     bewijst het drempelgedrag (boven/onder), zacht falen per GTIN en het
     NFR-6-contract (zaadbeeld verschijnt nooit in de output-crops) zonder een
     echt model of OpenCV te laden.

De module importeert ``app.core.logging`` en ligt onder ``app.services`` (waarvan
``__init__`` asyncpg/structlog binnenhaalt). Om puur te blijven laden we het
bronbestand rechtstreeks met een gestubde ``app.core.logging`` en een stub-
``app.services``-pakket — geen echte ml-service-afhankelijkheden.
"""

import importlib.util
import os
import sys
import types

import numpy as np
import pytest

_HERE = os.path.dirname(__file__)
_MODULE_PATH = os.path.abspath(
    os.path.join(_HERE, "..", "..", "app", "services", "bootstrap_search.py")
)


def _load_bootstrap_search():
    """Laad bootstrap_search.py geïsoleerd met gestubde app-pakketten."""
    # Stub app / app.core / app.core.logging zodat de top-level import slaagt
    # zonder structlog/config, en app.services zodat het geen asyncpg trekt.
    for name in ("app", "app.core", "app.services"):
        if name not in sys.modules:
            mod = types.ModuleType(name)
            mod.__path__ = []  # markeer als package
            sys.modules[name] = mod
    logging_stub = types.ModuleType("app.core.logging")
    logging_stub.logger = types.SimpleNamespace(
        info=lambda *a, **k: None,
        warning=lambda *a, **k: None,
        error=lambda *a, **k: None,
    )
    sys.modules["app.core.logging"] = logging_stub

    spec = importlib.util.spec_from_file_location(
        "app.services.bootstrap_search", _MODULE_PATH
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules["app.services.bootstrap_search"] = module
    spec.loader.exec_module(module)
    return module


bs = _load_bootstrap_search()


# ---------------------------------------------------------------------------
# Pure cosine — de zaad-drempelvergelijking (AD-9)
# ---------------------------------------------------------------------------


def test_cosine_identieke_vector_is_1():
    v = np.array([1.0, 2.0, 3.0], dtype=np.float32)
    assert bs.cosine(v, v) == pytest.approx(1.0)


def test_cosine_orthogonaal_is_0():
    assert bs.cosine(np.array([1.0, 0.0]), np.array([0.0, 1.0])) == pytest.approx(0.0)


def test_cosine_nulvector_is_0_geen_match():
    # Een nulvector heeft geen richting → nooit een match (geen deling door nul).
    assert bs.cosine(np.array([0.0, 0.0, 0.0]), np.array([1.0, 2.0, 3.0])) == 0.0


def test_cosine_is_schaal_invariant():
    a = np.array([1.0, 2.0, 3.0])
    assert bs.cosine(a, a * 10.0) == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# search_with_seed — recept met gemockte zware collaborators
# ---------------------------------------------------------------------------


class _FakeModelManager:
    """Levert per beeld een gepinde embedding zodat de cosine deterministisch is."""

    is_loaded = True

    def __init__(self, emb_by_tag):
        self._emb = emb_by_tag

    async def load_models(self):  # pragma: no cover - nooit nodig (is_loaded)
        pass

    async def generate_embedding(self, pil_img):
        # De fake _to_pil geeft de tag (een int) door als "beeld".
        return np.asarray(self._emb[pil_img], dtype=np.float32)


class _FakeStorage:
    def __init__(self):
        self.uploaded = {}

    def connect(self):
        pass

    def get_training_image(self, key):
        # Zaad + pagina's bestaan; alles levert dezelfde dummy-bytes (de fake
        # imdecode negeert de inhoud en mapt op de key via een teller).
        return key.encode()

    def put_training_image(self, key, data, content_type="image/png"):
        self.uploaded[key] = data
        return key


@pytest.fixture()
def patched(monkeypatch):
    """Patch cv2, _to_pil, region_proposer, keurmerk_gate en de model/storage-
    services in de al-geladen bootstrap_search-module + zijn lazy imports."""
    # Embeddings: zaad = [1,0,0]; regio 'match' = [0.98,0.2,0] (cosine>0.93 met zaad);
    # regio 'miss' = [0,1,0] (cosine 0). We taggen "beelden" met een int-id.
    SEED, MATCH, MISS = 0, 1, 2
    emb = {
        SEED: [1.0, 0.0, 0.0],
        MATCH: [0.99, 0.14, 0.0],  # ~0.99 cosine met zaad
        MISS: [0.0, 1.0, 0.0],     # 0 cosine
    }
    fake_mm = _FakeModelManager(emb)
    fake_storage = _FakeStorage()

    # Stub de zware app-modules die search_with_seed lazy importeert.
    mm_mod = types.ModuleType("app.ml.model_manager")
    mm_mod.model_manager = fake_mm
    sys.modules["app.ml"] = types.ModuleType("app.ml")
    sys.modules["app.ml"].__path__ = []
    sys.modules["app.ml.model_manager"] = mm_mod

    cls_mod = types.ModuleType("app.services.classification")
    cls_mod._to_pil = lambda crop: crop  # crop IS al de int-tag/np-array
    sys.modules["app.services.classification"] = cls_mod

    gate_mod = types.ModuleType("app.services.keurmerk_gate")
    gate_mod.GATE_THRESHOLD = 0.5
    gate_mod.keurmerk_probability = lambda emb: None  # gate laat alles door
    sys.modules["app.services.keurmerk_gate"] = gate_mod

    rp_mod = types.ModuleType("app.services.region_proposer")
    # Twee regio's per pagina: één match-crop (tag MATCH), één miss-crop (tag MISS).
    rp_mod.propose_regions = lambda img: ([(10, 20, 30, 40), (50, 60, 30, 40)], {})
    sys.modules["app.services.region_proposer"] = rp_mod

    st_mod = types.ModuleType("app.services.storage")
    st_mod.storage_service = fake_storage
    sys.modules["app.services.storage"] = st_mod

    # Fake cv2: imdecode mapt op de "tag" van het beeld; _crop_bgr snijdt de tag
    # in een 4x4-array (geldig); imencode slaagt altijd. Het zaad-beeld krijgt tag
    # SEED, de eerste regio MATCH, de tweede MISS.
    fake_cv2 = types.ModuleType("cv2")
    fake_cv2.IMREAD_COLOR = 1
    fake_cv2.COLOR_BGR2RGB = 4
    fake_cv2.INTER_AREA = 3

    def _imdecode(buf, flag):
        # Het zaad wordt als eerste gedecodeerd → geef een 8x8x3-array met marker 0.
        arr = np.zeros((8, 8, 3), dtype=np.uint8)
        return arr

    fake_cv2.imdecode = _imdecode
    fake_cv2.cvtColor = lambda a, code: a
    fake_cv2.resize = lambda a, size, interpolation=None: np.zeros((64, 64, 3), np.uint8)

    def _imencode(ext, crop):
        return True, np.frombuffer(b"png", np.uint8)

    fake_cv2.imencode = _imencode
    sys.modules["cv2"] = fake_cv2

    # De module heeft numpy top-level; cv2 wordt lazy geïmporteerd (uit sys.modules).
    # _crop_bgr en _content_digest zijn module-functies — patch ze zodat crops de
    # juiste tag dragen (region 0 → MATCH-embedding, region 1 → MISS-embedding).
    region_tags = {0: MATCH, 1: MISS}

    def fake_crop_bgr(img, b):
        # b[0]==10 → eerste (match) regio; b[0]==50 → tweede (miss) regio.
        return MATCH if b[0] == 10 else MISS

    monkeypatch.setattr(bs, "_crop_bgr", fake_crop_bgr)
    # generate_embedding wordt aangeroepen met _to_pil(crop) == crop == de int-tag,
    # en met _to_pil(seed_img) == seed_img (de 8x8-array). Map de array op SEED.
    orig_gen = fake_mm.generate_embedding

    async def gen(pil):
        if isinstance(pil, np.ndarray):
            return np.asarray(emb[SEED], np.float32)
        return np.asarray(emb[pil], np.float32)

    fake_mm.generate_embedding = gen
    # _content_digest: zaad-array → 'seed'; MATCH/MISS tags → uniek per tag.
    monkeypatch.setattr(
        bs,
        "_content_digest",
        lambda crop: "seed" if isinstance(crop, np.ndarray) else f"crop-{crop}",
    )

    return {"storage": fake_storage, "MATCH": MATCH, "MISS": MISS}


@pytest.mark.asyncio
async def test_matches_boven_en_onder_drempel(patched):
    """Vondsten ≥ drempel (0,93) worden geretourneerd; regio's eronder niet."""
    result = await bs.search_with_seed(
        seed_path="reference-logos/X/default.png",
        gtin_pages=[{"gtin": "111", "page_key": "artwork/111/p.png"}],
        threshold=0.93,
    )
    # Precies één match (de MATCH-regio ~0.99); de MISS-regio (cosine 0) valt af.
    assert len(result["matches"]) == 1
    m = result["matches"][0]
    assert m["gtin"] == "111"
    assert m["seed_cosine"] >= 0.93
    assert m["crop_path"].startswith("artwork-crops/111/")


@pytest.mark.asyncio
async def test_hogere_drempel_sluit_alles_uit(patched):
    """Een drempel boven de match-cosine levert geen vondsten (leeg)."""
    result = await bs.search_with_seed(
        seed_path="reference-logos/X/default.png",
        gtin_pages=[{"gtin": "111", "page_key": "artwork/111/p.png"}],
        threshold=0.999,
    )
    assert result["matches"] == []


@pytest.mark.asyncio
async def test_faalt_zacht_per_gtin(patched, monkeypatch):
    """Een onleesbare pagina (imdecode → None) laat de run doorgaan met de volgende GTIN."""
    calls = {"n": 0}
    real_imdecode = sys.modules["cv2"].imdecode

    def flaky_imdecode(buf, flag):
        calls["n"] += 1
        # 1e call = zaad (geldig). 2e call = pagina GTIN 111 (None → onleesbaar).
        # 3e call = pagina GTIN 222 (geldig).
        if calls["n"] == 2:
            return None
        return real_imdecode(buf, flag)

    monkeypatch.setitem(sys.modules, "cv2", sys.modules["cv2"])
    sys.modules["cv2"].imdecode = flaky_imdecode

    result = await bs.search_with_seed(
        seed_path="reference-logos/X/default.png",
        gtin_pages=[
            {"gtin": "111", "page_key": "artwork/111/p.png"},
            {"gtin": "222", "page_key": "artwork/222/p.png"},
        ],
        threshold=0.93,
    )
    # Beide GTINs zijn 'processed' (de eerste faalde zacht), en er is ≥1 match uit 222.
    assert result["gtins_processed"] == 2
    assert all(m["gtin"] == "222" for m in result["matches"])


@pytest.mark.asyncio
async def test_zaadbeeld_verschijnt_nooit_in_output_crops(patched, monkeypatch):
    """NFR-6: een regio die inhoudelijk het zaadbeeld is, wordt uit de output geweerd."""
    # Forceer dat de MATCH-regio dezelfde inhouds-digest heeft als het zaad.
    monkeypatch.setattr(
        bs,
        "_content_digest",
        lambda crop: "seed",  # ALLES (incl. de match-crop) == zaad-digest
    )
    result = await bs.search_with_seed(
        seed_path="reference-logos/X/default.png",
        gtin_pages=[{"gtin": "111", "page_key": "artwork/111/p.png"}],
        threshold=0.93,
    )
    assert result["matches"] == []
    assert result["seed_leaks_skipped"] >= 1
    # Het zaadpad is nooit als crop geüpload.
    assert all(
        not k.startswith("reference-logos/") for k in patched["storage"].uploaded
    )


@pytest.mark.asyncio
async def test_onleesbaar_zaad_gooit_valueerror(patched, monkeypatch):
    """Een onleesbaar zaadbeeld (imdecode → None) gooit ValueError (API → run leeg)."""
    sys.modules["cv2"].imdecode = lambda buf, flag: None
    with pytest.raises(ValueError):
        await bs.search_with_seed(
            seed_path="reference-logos/X/default.png",
            gtin_pages=[{"gtin": "111", "page_key": "artwork/111/p.png"}],
            threshold=0.93,
        )
