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

_APP_PKG = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "app"))

import numpy as np
import pytest

_HERE = os.path.dirname(__file__)
_MODULE_PATH = os.path.abspath(
    os.path.join(_HERE, "..", "..", "app", "services", "bootstrap_search.py")
)


def _load_bootstrap_search():
    # 12.23: snapshot vóór het laden — deze functie draait op MODULE-niveau
    # (collectie-tijd); zonder herstel overschaduwen de submodule-stubs
    # (app.services.database e.d.) de ECHTE modules voor alle later
    # gecollecteerde testbestanden (ImportError "unknown location"). De eigen
    # tests herinstalleren hun stubs per test via de autouse-fixture, dus
    # herstellen is veilig.
    _touched = ("app", "app.core", "app.services", "app.core.logging", "app.services.bootstrap_search")
    _prev = {k: sys.modules.get(k) for k in _touched}
    """Laad bootstrap_search.py geïsoleerd met gestubde app-pakketten."""
    # Stub app / app.core / app.core.logging zodat de top-level import slaagt
    # zonder structlog/config, en app.services zodat het geen asyncpg trekt.
    for name in ("app", "app.core", "app.services"):
        if name not in sys.modules:
            mod = types.ModuleType(name)
            mod.__path__ = [os.path.join(_APP_PKG, *name.split(".")[1:])]  # echte pkg-paden: stubs mogen imports van andere tests niet vergiftigen (12.23)
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
    for _k, _v in _prev.items():
        if _v is not None:
            sys.modules[_k] = _v
        else:
            sys.modules.pop(_k, None)
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
    sys.modules["app.ml"].__path__ = [os.path.join(_APP_PKG, "ml")]
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


# ---------------------------------------------------------------------------
# Story 19.6 — bootstrap-gescoped keurmerk-gate (RODE FASE, ATDD).
# De gedeelde GATE_THRESHOLD (0,5) wordt OOK door de live classificatie gebruikt
# (classification.py) en MOET daar 0,5 blijven. De go-live-investigate bewees
# (visueel) dat de gate echte keurmerken met kp 0,25-0,39 ten onrechte afwijst.
# Fix = een APARTE bootstrap-gate-drempel op search_with_seed, zonder de live gate
# te raken. Deze test faalt nu (search_with_seed kent geen gate_threshold-param).
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bootstrap_gate_threshold_scoped_19_6(patched):
    """Een echte keurmerk-regio met kp tussen 0,2 en de live-gate 0,5 passeert de
    bootstrap-gate wanneer die op 0,2 staat. De MATCH-regio (cosine ~0,99) krijgt
    kp 0,3: met de gedeelde 0,5 zou hij vallen; met de bootstrap-gate 0,2 komt hij
    door en levert een match. Faalt nu: search_with_seed heeft nog geen
    gate_threshold-parameter (het bootstrap-pad gebruikt de gedeelde 0,5)."""
    sys.modules["app.services.keurmerk_gate"].keurmerk_probability = lambda emb: 0.3
    result = await bs.search_with_seed(
        seed_path="reference-logos/X/default.png",
        gtin_pages=[{"gtin": "111", "page_key": "artwork/111/p.png"}],
        threshold=0.60,
        gate_threshold=0.2,
    )
    assert len(result["matches"]) == 1
    assert result["matches"][0]["seed_cosine"] >= 0.60


@pytest.mark.asyncio
async def test_bootstrap_gate_default_onder_live_gate_19_6(patched):
    """Zonder expliciete gate_threshold hanteert het bootstrap-pad een default die
    LAGER is dan de live-gate 0,5, zodat een echt keurmerk met kp 0,3 ook standaard
    door de bootstrap-gate komt. Faalt nu (default = gedeelde 0,5)."""
    sys.modules["app.services.keurmerk_gate"].keurmerk_probability = lambda emb: 0.3
    result = await bs.search_with_seed(
        seed_path="reference-logos/X/default.png",
        gtin_pages=[{"gtin": "111", "page_key": "artwork/111/p.png"}],
        threshold=0.60,
    )
    assert len(result["matches"]) == 1


def test_gedeelde_gate_default_blijft_05_19_6():
    """Regressie (19.6): de GEDEELDE keurmerk-gate-default blijft 0,5. Die wordt OOK
    door de live classificatie (classification.py:118-133) gebruikt en mag NIET
    meebewegen met de bootstrap-gate. De 19.6-fix scopet de gate op search_with_seed,
    niet globaal. Deze test moet groen zijn EN blijven na de fix."""
    import importlib.util as _ilu

    path = os.path.abspath(
        os.path.join(_HERE, "..", "..", "app", "services", "keurmerk_gate.py")
    )
    prev = sys.modules.pop("app.services.keurmerk_gate", None)
    old_env = os.environ.pop("KEURMERK_GATE_THRESHOLD", None)
    try:
        spec = _ilu.spec_from_file_location("real_keurmerk_gate_19_6", path)
        mod = _ilu.module_from_spec(spec)
        spec.loader.exec_module(mod)
        assert mod.GATE_THRESHOLD == 0.5
    finally:
        if prev is not None:
            sys.modules["app.services.keurmerk_gate"] = prev
        if old_env is not None:
            os.environ["KEURMERK_GATE_THRESHOLD"] = old_env


# ---------------------------------------------------------------------------
# Story 19.9 — conditie C (nearest-reference-ranking bij ≥ k echte crop-refs).
#
# Eigen fixture (los van `patched`): de fake `cv2.imdecode` levert voor élk
# gedecodeerd beeld dezelfde lege array, dus we kunnen embeddings niet op
# beeld-inhoud onderscheiden. In plaats daarvan onthoudt de fake storage de
# laatst-opgevraagde object-key (`get_training_image` wordt synchroon vóór
# `generate_embedding` aangeroepen, altijd sequentieel binnen één async-taak)
# en levert de fake model-manager de bijbehorende embedding op basis van die
# key. Regio-crops zijn STRINGS (geen ints) zodat ze nooit met een storage-key
# verward worden.
# ---------------------------------------------------------------------------

SEED_KEY_C = "reference-logos/X/seed.png"
REF1_KEY_C = "reference-logos/X/real1.png"
REF2_KEY_C = "reference-logos/X/real2.png"
REF3_KEY_C = "reference-logos/X/real3.png"
BAD_REF_KEY_C = "reference-logos/X/onleesbaar.png"

NEAR_REF_TAG = "near-ref"  # regio dicht bij de echte refs, ver van het zaad
NEAR_SEED_TAG = "near-seed"  # regio dicht bij het zaad, ver van de refs
FAR_TAG = "far"  # regio ver van alles (zaad én refs)

_EMB_BY_KEY_C = {
    SEED_KEY_C: [0.0, 0.0, 1.0],  # zaad — orthogonaal aan de refs (cosine 0)
    REF1_KEY_C: [1.0, 0.0, 0.0],
    REF2_KEY_C: [1.0, 0.05, 0.0],
    REF3_KEY_C: [1.0, -0.05, 0.0],
}
_REGION_EMB_C = {
    NEAR_REF_TAG: [1.0, 0.0, 0.0],  # cosine ~1.0 met de refs, 0.0 met het zaad
    NEAR_SEED_TAG: [0.0, 0.0, 1.0],  # cosine ~1.0 met het zaad, 0.0 met de refs
    FAR_TAG: [0.0, 1.0, 0.0],  # cosine 0 met alles
}


@pytest.fixture()
def patched_c(monkeypatch):
    """Patch cv2/model/storage voor de conditie-C-tests (key-bewuste fake decode)."""
    state = {"last_key": None, "gate_kp": None}

    class _FakeStorageC:
        def connect(self):
            pass

        def get_training_image(self, key):
            if key == BAD_REF_KEY_C:
                raise FileNotFoundError(key)
            state["last_key"] = key
            return key.encode()

        def put_training_image(self, key, data, content_type="image/png"):
            pass

    class _FakeModelManagerC:
        is_loaded = True

        async def load_models(self):  # pragma: no cover - nooit nodig (is_loaded)
            pass

        async def generate_embedding(self, pil_img):
            if isinstance(pil_img, str):
                return np.asarray(_REGION_EMB_C[pil_img], np.float32)
            return np.asarray(_EMB_BY_KEY_C[state["last_key"]], np.float32)

    fake_storage = _FakeStorageC()
    fake_mm = _FakeModelManagerC()

    mm_mod = types.ModuleType("app.ml.model_manager")
    mm_mod.model_manager = fake_mm
    sys.modules["app.ml"] = types.ModuleType("app.ml")
    sys.modules["app.ml"].__path__ = [os.path.join(_APP_PKG, "ml")]
    sys.modules["app.ml.model_manager"] = mm_mod

    cls_mod = types.ModuleType("app.services.classification")
    cls_mod._to_pil = lambda crop: crop  # identity
    sys.modules["app.services.classification"] = cls_mod

    gate_mod = types.ModuleType("app.services.keurmerk_gate")
    gate_mod.GATE_THRESHOLD = 0.5
    gate_mod.keurmerk_probability = lambda emb: state["gate_kp"]
    sys.modules["app.services.keurmerk_gate"] = gate_mod

    rp_mod = types.ModuleType("app.services.region_proposer")
    rp_mod.propose_regions = lambda img: ([(10, 20, 30, 40)], {})  # één regio/pagina
    sys.modules["app.services.region_proposer"] = rp_mod

    st_mod = types.ModuleType("app.services.storage")
    st_mod.storage_service = fake_storage
    sys.modules["app.services.storage"] = st_mod

    fake_cv2 = types.ModuleType("cv2")
    fake_cv2.IMREAD_COLOR = 1
    fake_cv2.COLOR_BGR2RGB = 4
    fake_cv2.INTER_AREA = 3
    fake_cv2.imdecode = lambda buf, flag: np.zeros((8, 8, 3), dtype=np.uint8)
    fake_cv2.cvtColor = lambda a, code: a
    fake_cv2.resize = lambda a, size, interpolation=None: np.zeros((64, 64, 3), np.uint8)
    fake_cv2.imencode = lambda ext, crop: (True, np.frombuffer(b"png", np.uint8))
    sys.modules["cv2"] = fake_cv2

    # _content_digest: het zaad (ndarray) -> "seed"; regio-crops (strings) -> uniek
    # per tag, zodat NFR-6 alleen slaat als een test dat expliciet forceert.
    monkeypatch.setattr(
        bs, "_content_digest", lambda crop: "seed" if isinstance(crop, np.ndarray) else f"crop-{crop}"
    )
    # Eén regio per pagina; de tag wordt per test ingesteld via _crop_bgr.
    monkeypatch.setattr(bs, "_crop_bgr", lambda img, b: NEAR_REF_TAG)

    return {"state": state}


@pytest.mark.asyncio
async def test_c_ge_k_refs_matcht_ondanks_lage_gids_cosine(patched_c):
    """(a) AC1/AC4a: >= k (3) echte refs -> een regio met een gids-cosine ONDER de
    drempel (0,0 < 0,6) matcht via nearest-reference-ranking (ref_sim ~1,0 >= 0,6).
    Faalt op het oude gids-only-gedrag (dat zou deze regio afwijzen)."""
    result = await bs.search_with_seed(
        seed_path=SEED_KEY_C,
        gtin_pages=[{"gtin": "111", "page_key": "artwork/111/p.png"}],
        threshold=0.6,
        real_ref_paths=[REF1_KEY_C, REF2_KEY_C, REF3_KEY_C],
        ranking_threshold=0.6,
        min_refs=3,
    )
    assert result["ranking_active"] is True
    assert result["real_refs_used"] == 3
    assert len(result["matches"]) == 1
    m = result["matches"][0]
    assert m["seed_cosine"] < 0.6  # de gids-cosine zelf haalt de drempel niet
    assert m["ranking_cosine"] is not None
    assert m["ranking_cosine"] >= 0.6


@pytest.mark.asyncio
async def test_c_onder_k_refs_ongewijzigd_gids_pad(patched_c):
    """(b) AC2/AC4b: < k (hier 2, default k=3) echte refs -> conditie C schakelt NIET
    in; dezelfde regio (lage gids-cosine) matcht dan ook niet — ongewijzigd gedrag."""
    result = await bs.search_with_seed(
        seed_path=SEED_KEY_C,
        gtin_pages=[{"gtin": "111", "page_key": "artwork/111/p.png"}],
        threshold=0.6,
        real_ref_paths=[REF1_KEY_C, REF2_KEY_C],
    )
    assert result["ranking_active"] is False
    assert result["real_refs_used"] == 2
    assert result["matches"] == []


@pytest.mark.asyncio
async def test_c_onleesbare_ref_telt_niet_mee_voor_k(patched_c):
    """Zacht falen per ref (NFR-3-patroon): een onleesbare/ontbrekende echte-crop-
    referentie wordt overgeslagen en telt niet mee voor de k-drempel — 2 leesbare
    refs + 1 kapotte blijft dus < k=3, conditie C schakelt niet in."""
    result = await bs.search_with_seed(
        seed_path=SEED_KEY_C,
        gtin_pages=[{"gtin": "111", "page_key": "artwork/111/p.png"}],
        threshold=0.6,
        real_ref_paths=[REF1_KEY_C, BAD_REF_KEY_C, REF2_KEY_C],
    )
    assert result["ranking_active"] is False
    assert result["real_refs_used"] == 2
    assert result["matches"] == []


@pytest.mark.asyncio
async def test_c_gate_blijft_gelden_ondanks_conditie_c(patched_c):
    """(c) AC3/AC4c: de keurmerk-gate-voorfilter blijft vóór conditie C gelden — een
    regio die de gate niet haalt wordt geweerd, ook al zou de ranking-cosine matchen."""
    patched_c["state"]["gate_kp"] = 0.05  # ruim onder de bootstrap-gate (default 0,2)
    result = await bs.search_with_seed(
        seed_path=SEED_KEY_C,
        gtin_pages=[{"gtin": "111", "page_key": "artwork/111/p.png"}],
        threshold=0.6,
        real_ref_paths=[REF1_KEY_C, REF2_KEY_C, REF3_KEY_C],
        ranking_threshold=0.6,
        min_refs=3,
    )
    assert result["matches"] == []


@pytest.mark.asyncio
async def test_c_nfr6_zaadlek_guard_blijft_gelden_ondanks_conditie_c(patched_c, monkeypatch):
    """(c) AC3/AC4c/NFR-6: een regio die inhoudelijk het zaadbeeld is, wordt ook onder
    conditie C nooit als output-crop teruggegeven — de guard staat NA de match-check,
    ongeacht of de match via het gids-pad of de ranking tot stand kwam."""
    monkeypatch.setattr(bs, "_content_digest", lambda crop: "seed")  # alles == zaad-digest
    result = await bs.search_with_seed(
        seed_path=SEED_KEY_C,
        gtin_pages=[{"gtin": "111", "page_key": "artwork/111/p.png"}],
        threshold=0.6,
        real_ref_paths=[REF1_KEY_C, REF2_KEY_C, REF3_KEY_C],
        ranking_threshold=0.6,
        min_refs=3,
    )
    assert result["matches"] == []
    assert result["seed_leaks_skipped"] >= 1


@pytest.mark.asyncio
async def test_c_min_refs_kleiner_of_gelijk_aan_nul_activeert_conditie_c_niet(patched_c):
    """Code-review-fix: een misconfigureerde `min_refs<=0` mag conditie C NOOIT
    activeren met nul geëmbede refs (dat zou `max()` op een lege lijst laten
    crashen zodra een regio de gate haalt). De defense-in-depth-guard
    (`min_refs > 0 and ...`) valt terug op het gids-pad — geen crash, geen match
    via ranking. Reproduceert de "min_refs<=0 + lege real_ref_paths"-combinatie
    uit de code-review (Blind Hunter/Edge Case Hunter)."""
    result = await bs.search_with_seed(
        seed_path=SEED_KEY_C,
        gtin_pages=[{"gtin": "111", "page_key": "artwork/111/p.png"}],
        threshold=0.6,
        real_ref_paths=[],
        ranking_threshold=0.6,
        min_refs=0,
    )
    assert result["ranking_active"] is False
    assert result["real_refs_used"] == 0
    assert result["matches"] == []


@pytest.mark.asyncio
async def test_c_gids_pad_blijft_fallback_ook_met_conditie_c_actief(patched_c, monkeypatch):
    """TR-aanvulling (dekkingslacune): AC1 zegt expliciet dat het gids-zaad-pad
    'als aanvulling/fallback' blijft gelden zodra conditie C actief is — dit is een
    OR, geen vervanging. Een regio die dicht bij het ZAAD ligt (en ver van de echte
    refs) moet dus nog steeds matchen via de klassieke gids-cosine, ook al zijn er
    >= k echte refs meegegeven. Zonder deze test zou een implementatie die conditie
    C per ongeluk als AND (i.p.v. OR) codeert, of het gids-pad volledig vervangt,
    onopgemerkt blijven."""
    monkeypatch.setattr(bs, "_crop_bgr", lambda img, b: NEAR_SEED_TAG)
    result = await bs.search_with_seed(
        seed_path=SEED_KEY_C,
        gtin_pages=[{"gtin": "111", "page_key": "artwork/111/p.png"}],
        threshold=0.6,
        real_ref_paths=[REF1_KEY_C, REF2_KEY_C, REF3_KEY_C],
        ranking_threshold=0.6,
        min_refs=3,
    )
    assert result["ranking_active"] is True
    assert len(result["matches"]) == 1
    m = result["matches"][0]
    assert m["seed_cosine"] >= 0.6  # matcht via het klassieke gids-pad
    assert m["ranking_cosine"] is not None
    assert m["ranking_cosine"] < 0.6  # de ranking zelf zou dit NIET gematcht hebben


@pytest.mark.asyncio
async def test_c_regio_matcht_niet_als_beide_signalen_onder_de_drempel_blijven(patched_c, monkeypatch):
    """TR-aanvulling: een regio die ZOWEL ver van het zaad ALS ver van elke echte
    ref ligt, matcht niet — conditie C breidt de match-kans uit, maar matcht niet
    zomaar alles zodra >= k refs aanwezig zijn."""
    monkeypatch.setattr(bs, "_crop_bgr", lambda img, b: FAR_TAG)
    result = await bs.search_with_seed(
        seed_path=SEED_KEY_C,
        gtin_pages=[{"gtin": "111", "page_key": "artwork/111/p.png"}],
        threshold=0.6,
        real_ref_paths=[REF1_KEY_C, REF2_KEY_C, REF3_KEY_C],
        ranking_threshold=0.6,
        min_refs=3,
    )
    assert result["ranking_active"] is True
    assert result["matches"] == []
