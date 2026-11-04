"""ATDD ronde 6 (02-11-2026): Open Food Facts-logo's (OFF) als bron van de generator (SPEC CAP-4/6/10/16/17, stoppunt 9;
trainingsset §2/§3/§5/§11, randvoorwaarden §4; interfacecontract ronde 6 in de ATDD-checklist; besluit Friso 02-11-2026).
Rode fase: `off.py` (klassetabel, GTIN-14, recordredenen, trekking, beleefd ophalen, hervatten, schijfgrens, index,
rapport en opdrachtregel), `genereer(..., off=...)` met `tegels --off`, de OFF-grens, `_off` en de herkomstlijst in
`echt.py dataset`, het wegfilteren van NutriGreen-foto's met een toets-GTIN, het ontdubbelen van `data_herkomst` in
`train.py` en het bijgewerkte draaiplan (stap 10, "Snelheid") bestaan nog niet. Verzonnen logo-id's, GLN's, GTIN's,
gebruikersnamen en beelden; geen netwerk (de OFF-aanbieder, de opener, de klok en het slapen worden nagebootst); alles
in `tmp_path`; de meetmap wordt nooit gelezen."""
import collections
import email.message
import hashlib
import inspect
import io
import json
import re
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import numpy as np
import pytest
from PIL import Image

from test_besluiten_20261101 import HIER, stap
from test_cap04_generator import TEGEL, TRAIN_GTINS, achtergrond, bedekt, lees, logos, schijf
from test_review_20261101 import TOETS_GLN, echt_pm, mod, png, schrijf
from test_ronde4_20261101 import opdrachten
from test_ronde5_20261101 import (EU, GD, MSC, NSA, PW, RC, V, VG, VV, WM, coco_map, is_ng, ng_pm, rc,
                                  train_resultaat)

REDENEN = ("verwijderd", "vakje_ongeldig", "te_klein", "geen_gtin", "toets_gtin", "toetsleverancier", "niet_op_te_halen",
           "dubbel", "bijna_gelijk")
ZOEK = {  # trainingsset §11
    EU: (("label", "en:eu-organic"),),
    GD: (("label", "en:green-dot"),),
    **{f"NUTRISCORE_{x}": (("label", f"en:nutriscore-grade-{x.lower()}"),) for x in "ABCDE"},
    V: (("label", "en:european-vegetarian-union-vegan"), ("label", "en:european-vegetarian-union-vegetarian"),
        ("label", "en:european-vegetarian-union")),
    MSC: (("label", "en:sustainable-seafood-msc"),),
    VG: (("label", "en:the-vegan-society"),),
    PW: (("label", "en:not-advised-for-pregnant-women"),),
    WM: (("label", "fr:lait-de-paturage"),),
}
ROBOTOFF, ZOEK_PAD, CROP_PAD = "robotoff.openfoodfacts.org", "/api/v1/images/logos/search", "/api/v1/images/crop"
PRODUCTEN = "https://images.openfoodfacts.org/images/products"
POOL_GD = ("label", "en:green-dot")
# verzonnen barcodes: toets-GTIN (13 cijfers), GTIN van een toetsleverancier, cijfers 2–8 = GLN-voorvoegsel 8744444
TOETS_BC, LEV_BC, GLN7_BC = "8766666666664", "8722222999992", "8744444123458"
TOETS_GTINS, LEV_GTINS, LEV_GLN7 = {"08766666666664"}, {"08722222999992"}, {"8744444"}
GROOT = 10 ** 13  # vrije schijf in de tests: nooit die van de testmachine
MAGENTA = (255, 0, 255)
VARIANTEN4 = {"kleur", "zwartwit", "lijn", "negatief"}


def attributie_off():
    """De OFF-attributie uit randvoorwaarden §4 (tweede "Attributie (zelfde tekst …)"; off.ATTRIBUTIE volgt hem letterlijk)."""
    tekst = (HIER / "randvoorwaarden.md").read_text(encoding="utf-8")
    alle = re.findall(r'Attributie \(zelfde tekst in `train-resultaat\.json`\): "([^"]+)"', tekst)
    return next(a for a in alle if "Open Food Facts" in a)


# --- nagebootste OFF-aanbieder ---------------------------------------------------------------------------------------

def barcode_van(i):
    return f"8790000{i:06d}"


def rec(i, barcode=None, box=(0.1, 0.2, 0.5, 0.6), breedte=1000, hoogte=1000, verwijderd=False, annotator="annotator-a",
        image=True):
    """Logo-record in de vorm van Robotoff `logos/search` (gemeten 02-11-2026): `bounding_box` = [y_min, x_min, y_max,
    x_max] genormaliseerd; `source_image` per id uniek, zodat de nep-aanbieder de uitsnede terugvindt."""
    r = {"id": i, "barcode": barcode_van(i) if barcode is None else barcode, "bounding_box": list(box),
         "source_image": f"/{i}/1.jpg", "username": annotator}
    if image:
        r["image"] = {"width": breedte, "height": hoogte, "deleted": verwijderd}
    return r


def schone(ids):
    return [rec(i, annotator=("annotator-a", "annotator-b")[i % 2]) for i in ids]


def afvallers(start):
    """Negen records met een recordreden: verwijderd 2, vakje_ongeldig 2, te_klein 1, geen_gtin 1, toets_gtin 1,
    toetsleverancier 2 (de laatste is verwijderd én toets-GTIN: verwijderd gaat voor)."""
    return [rec(start, verwijderd=True), rec(start + 1, box=(0.1, 0.5, 0.4, 0.5)), rec(start + 2, image=False),
            rec(start + 3, box=(0.1, 0.1, 0.15, 0.15)), rec(start + 4, barcode="1234567"),
            rec(start + 5, barcode=TOETS_BC), rec(start + 6, barcode=LEV_BC), rec(start + 7, barcode=GLN7_BC),
            rec(start + 8, verwijderd=True, barcode=TOETS_BC)]


def uitsnede(i, maat=24):
    """Kleine JPEG per logo-id (ruis met seed i): elke uitsnede andere bytes en een andere dHash."""
    im = Image.fromarray(np.random.default_rng(i).integers(0, 255, (maat, maat, 3), dtype=np.uint8))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=90)
    return buf.getvalue()


def op_volgorde(ids, seed="20261102"):
    return sorted(ids, key=lambda i: hashlib.sha256((seed + str(i)).encode()).hexdigest())


class NepHaler:
    """Nagebootste aanbieder met `get(url) -> bytes`: zoekopdrachten geven een pool `{"count", "logos"}`, crop-verzoeken
    een kleine JPEG; `fouten` = {logo-id of (type, waarde): uitzonderingsklasse}. Legt elke URL vast."""

    def __init__(self, pools, uitsneden=None, fouten=None, aantal=None):
        self.pools, self.uitsneden, self.fouten, self.aantal = pools, uitsneden or {}, fouten or {}, aantal or {}
        self.urls = []

    def antwoord(self, sleutel):
        recs = self.pools.get(sleutel, [])
        return json.dumps({"count": self.aantal.get(sleutel[1], 10 * len(recs) + 3), "logos": recs}).encode()

    def get(self, url):
        self.urls.append(url)
        u = urlsplit(url)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        if u.path == ZOEK_PAD:
            sleutel = (q["type"], q.get("taxonomy_value") or q.get("value"))
            if sleutel in self.fouten:
                raise self.fouten[sleutel]("pool niet op te halen (nagebootst)")
            return self.antwoord(sleutel)
        assert u.path == CROP_PAD, url
        i = int(q["image_url"].split("/")[-2])
        if i in self.fouten:
            raise self.fouten[i](f"uitsnede {i} niet op te halen (nagebootst)")
        return self.uitsneden.get(i) or uitsnede(i)


def soort(url):
    p = urlsplit(url).path
    return "pool" if p == ZOEK_PAD else "crop" if p == CROP_PAD else url


def crop_ids(h):
    return [int(parse_qs(urlsplit(u).query)["image_url"][0].split("/")[-2]) for u in h.urls if soort(u) == "crop"]


def pool_urls(h):
    return [u for u in h.urls if soort(u) == "pool"]


def haal(off, uit, haler, klassen, toets_gtins=(), lev_gtins=(), lev_gln7=(), toets_hashes=None, **kw):
    kw.setdefault("vrij", lambda: GROOT)
    return off.ophalen(uit, haler, set(toets_gtins), set(lev_gtins), set(lev_gln7), toets_hashes or {},
                       klassen={k: off.ZOEK[k] for k in klassen}, **kw)


def bewaard(uit, klasse):
    return {int(p.stem) for p in (uit / "uitsneden" / klasse).glob("*.jpg")}


def index(uit):
    return json.loads((uit / "bronnen.json").read_text(encoding="utf-8"))


def status(uit):
    pad = uit / "status.json"
    return {str(k): v for k, v in json.loads(pad.read_text()).items()} if pad.exists() else {}


def bestand(uit, e):
    p = Path(e["pad"])
    return p if p.is_file() else uit / p  # absoluut of ten opzichte van de OFF-map


def grootte(map_):
    return sum(p.stat().st_size for p in map_.rglob("*") if p.is_file())


# --- off.py: constanten, klassetabel, GTIN-14, URL's (CAP-17) -------------------------------------------------------------

def test_r6_off_constanten_attributie_en_licentie():  # P1, CAP-17 (randvoorwaarden §4)
    off = mod("off")
    assert (off.SEED, off.GRENS, off.POOL, off.MIN_PX, off.PAUZE, off.WACHT, off.MAX_RETRY_AFTER, off.NOODSTOP) == \
        ("20261102", 1000, 2000, 64, 0.6, (2, 4, 8, 16, 32), 300, 20)
    assert (off.MAX_BYTES, off.MIN_VRIJ) == (3_000_000_000, 5_000_000_000)  # stoppunt 9, GB = 10⁹ bytes
    assert "ict@xxtract.com" in off.UA and off.BRON == "https://world.openfoodfacts.org"
    assert off.ATTRIBUTIE == attributie_off() and attributie_off().startswith("Trained in part on logo crops from Open Food")
    assert "CC-BY-SA-3.0" in off.LICENTIE and "ODbL" in off.LICENTIE
    assert tuple(off.REDENEN) == REDENEN


def test_r6_off_klassetabel_alleen_trainklassen_v_label_drie_ids_geen_recyclebaar():  # P1, CAP-17 (trainingsset §11)
    off, klassen = mod("off"), mod("train").KLASSEN
    assert {k: tuple(tuple(p) for p in v) for k, v in off.ZOEK.items() if k in ZOEK} == ZOEK
    assert set(off.ZOEK) - set(ZOEK) == {"FOREST_STEWARDSHIP_COUNCIL_LABEL", "TRIMAN", "SOCIETY_PLASTICS_INDUSTRY",
                                         "ON_THE_WAY_TO_PLANETPROOF", "DIET_FREE_FROM_GLUTEN"}  # ronde 9 (de vier staan in test_ronde9); ronde 10: glutenvrij
    assert set(off.ZOEK) <= set(klassen) and RC not in off.ZOEK and VV not in off.ZOEK
    assert [w for _, w in off.ZOEK[V]] == ["en:european-vegetarian-union-vegan", "en:european-vegetarian-union-vegetarian",
                                          "en:european-vegetarian-union"]


def test_r6_off_haler_standaard_echte_opener_slaap_en_klok():  # P1, CAP-17
    p = inspect.signature(mod("off").Haler).parameters
    assert (p["opener"].default, p["slaap"].default, p["klok"].default) == (urllib.request.urlopen, time.sleep, time.monotonic)


@pytest.mark.parametrize("barcode, verwacht", [
    ("87654321", "00000087654321"), ("123456789012", "00123456789012"), ("8712345678906", "08712345678906"),
    ("08712345678906", "08712345678906"), ("18712345678903", "18712345678903"), (" 8712345678906\n", "08712345678906"),
    ("1234567", None), ("123456789", None), ("12345678901", None), ("123456789012345", None), ("1234567890123456", None),
    ("87123456789O6", None), ("8712 345678906", None), ("-871234567890", None), ("", None)],
    ids=["8", "12", "13", "14", "14-indicator", "witruimte-rond", "7", "9", "11", "15", "16", "letter-O", "spatie-binnen",
         "minteken", "leeg"])
def test_r6_gtin14_alleen_8_12_13_14_cijfers_met_voorloopnullen(barcode, verwacht):  # P0, CAP-17
    assert mod("off").gtin14(barcode) == verwacht


@pytest.mark.parametrize("type_, waarde, sleutel", [("label", "en:eu-organic", "taxonomy_value"),
                                                    ("packaging", "en:recyclable-material", "value")])
def test_r6_zoek_url_robotoff_logos_search_met_type_waarde_annotated_random_count(type_, waarde, sleutel):  # P0, CAP-17
    off = mod("off")
    for url, n in ((off.zoek_url(type_, waarde), "2000"), (off.zoek_url(type_, waarde, n=40), "40")):
        u = urlsplit(url)
        assert (u.scheme, u.netloc, u.path) == ("https", ROBOTOFF, ZOEK_PAD)
        assert parse_qs(u.query) == {"type": [type_], sleutel: [waarde], "annotated": ["true"], "random": ["true"],
                                     "count": [n]}


def test_r6_uitsnede_url_crop_met_image_url_en_vakje_in_recordvolgorde():  # P0, CAP-17 (alleen uitsneden)
    r = rec(7, box=(0.11, 0.22, 0.55, 0.66))  # [y_min, x_min, y_max, x_max]
    r["source_image"] = "/879/000/000/0007/3.jpg"
    u = urlsplit(mod("off").uitsnede_url(r))
    q = parse_qs(u.query)
    assert (u.scheme, u.netloc, u.path) == ("https", ROBOTOFF, CROP_PAD)
    assert set(q) == {"image_url", "y_min", "x_min", "y_max", "x_max"}
    assert q["image_url"] == [f"{PRODUCTEN}/879/000/000/0007/3.jpg"]
    assert {k: float(q[k][0]) for k in ("y_min", "x_min", "y_max", "x_max")} == \
        {"y_min": 0.11, "x_min": 0.22, "y_max": 0.55, "x_max": 0.66}


# --- record_reden en volgorde: lekpreventie en trekking (CAP-17) --------------------------------------------------------

K = 1024
REDEN_GEVALLEN = [  # (kenmerken van het record, verwachte reden)
    ({}, None),
    ({"verwijderd": True}, "verwijderd"),
    ({"image": False}, "vakje_ongeldig"),
    ({"breedte": 0}, "vakje_ongeldig"),
    ({"hoogte": None}, "vakje_ongeldig"),
    ({"box": (0.1, 0.2, 1.2, 0.6)}, "vakje_ongeldig"),
    ({"box": (-0.1, 0.2, 0.5, 0.6)}, "vakje_ongeldig"),
    ({"box": (0.1, 0.6, 0.5, 0.6)}, "vakje_ongeldig"),  # x_max = x_min
    ({"box": (0.5, 0.2, 0.1, 0.6)}, "vakje_ongeldig"),  # y_max < y_min
    ({"box": (0.0, 0.0, 1.0, 1.0)}, None),  # rand van [0, 1] mag
    ({"box": (0.0, 0.0, 63 / K, 63 / K), "breedte": K, "hoogte": K}, "te_klein"),
    ({"box": (0.0, 0.0, 64 / K, 64 / K), "breedte": K, "hoogte": K}, None),  # precies 64 px
    ({"box": (0.0, 0.0, 0.5, 10 / K), "breedte": K, "hoogte": K}, None),  # de langste zijde telt
    ({"box": (0.0, 0.0, 0.125, 48 / 2048), "breedte": 2048, "hoogte": 256}, "te_klein"),  # 48 × 32 px; verwisseld 256
    ({"box": (0.0, 0.0, 0.01, 64 / 2048), "breedte": 2048, "hoogte": 256}, None),  # x = 64 px; verwisseld 8 en 20 px
    ({"barcode": "1234567"}, "geen_gtin"),
    ({"barcode": "87ABC12345678"}, "geen_gtin"),
    ({"barcode": TOETS_BC}, "toets_gtin"),  # staat ook bij de leveranciers-GTIN's: toets_gtin gaat voor
    ({"barcode": LEV_BC}, "toetsleverancier"),
    ({"barcode": GLN7_BC}, "toetsleverancier"),  # gtin14[1:8] = 8744444
    ({"barcode": "87444441234561"}, None),  # 14 cijfers: de eerste 7 zijn 8744444, cijfers 2–8 niet
    ({"verwijderd": True, "barcode": TOETS_BC}, "verwijderd"),
    ({"box": (0.1, 0.6, 0.5, 0.6), "barcode": TOETS_BC}, "vakje_ongeldig"),
    ({"box": (0.0, 0.0, 63 / K, 63 / K), "breedte": K, "hoogte": K, "barcode": "123"}, "te_klein"),
]


@pytest.mark.parametrize("kenmerken, verwacht", REDEN_GEVALLEN,
                         ids=["schoon", "verwijderd", "zonder-image", "breedte-0", "hoogte-leeg", "vak-boven-1",
                              "vak-onder-0", "x-zonder-breedte", "y-omgekeerd", "vak-tot-1", "63-px", "64-px",
                              "langste-zijde", "x-met-breedte", "y-met-hoogte", "geen-gtin-7", "geen-gtin-letters",
                              "toets-gtin", "leverancier-gtin", "leverancier-gln7", "gln7-op-cijfers-1-7-telt-niet",
                              "volgorde-verwijderd", "volgorde-ongeldig", "volgorde-te-klein"])
def test_r6_record_reden_eerste_passende_reden_in_vaste_volgorde(kenmerken, verwacht):  # P0, CAP-17
    r = rec(5, **kenmerken)
    assert mod("off").record_reden(r, TOETS_GTINS, LEV_GTINS | TOETS_GTINS, LEV_GLN7) == verwacht


def test_r6_volgorde_op_sha256_van_seed_plus_logo_id():  # P0, CAP-17
    off = mod("off")
    ids = [5, 17, 3, 42, 8, 1001, 77, 12, 9, 640]
    recs = [rec(i) for i in ids]
    assert [r["id"] for r in off.volgorde(recs)] == op_volgorde(ids) != ids
    assert [r["id"] for r in off.volgorde(recs, seed="7")] == op_volgorde(ids, seed="7") != op_volgorde(ids)


# --- Haler: beleefd ophalen (CAP-17) --------------------------------------------------------------------------------------

class Tijd:
    def __init__(self):
        self.nu, self.slapen = 1000.0, []

    def klok(self):
        return self.nu

    def slaap(self, s):
        self.slapen.append(s)
        self.nu += max(0.0, s)


class Antwoord:
    def __init__(self, data):
        self.data, self.headers, self.status = data, email.message.Message(), 200

    def read(self, *a):
        return self.data

    def getcode(self):
        return 200

    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def http_fout(code, retry=None):
    h = email.message.Message()
    if retry is not None:
        h["Retry-After"] = str(retry)
    return urllib.error.HTTPError(f"https://{ROBOTOFF}{CROP_PAD}", code, "fout (nagebootst)", h, io.BytesIO(b""))


class NepOpener:
    """`opener(request, timeout=…)`; uitkomsten per verzoek: bytes, een HTTP-code (int of (code, Retry-After)) of een
    uitzondering (factory). De laatste uitkomst herhaalt zich. Elk verzoek duurt 0,05 s op de nagebootste klok."""

    def __init__(self, tijd, uitkomsten, duur=0.05):
        self.tijd, self.uitkomsten, self.duur, self.verzoeken = tijd, list(uitkomsten), duur, []

    def __call__(self, req, *a, **kw):
        self.verzoeken.append((self.tijd.nu, req, a, kw))
        self.tijd.nu += self.duur
        u = self.uitkomsten.pop(0) if len(self.uitkomsten) > 1 else self.uitkomsten[0]
        if isinstance(u, bytes):
            return Antwoord(u)
        if isinstance(u, (int, tuple)):
            raise http_fout(*(u if isinstance(u, tuple) else (u,)))
        raise u()


def haler(off, uitkomsten):
    t = Tijd()
    o = NepOpener(t, uitkomsten)
    return off.Haler(opener=o, slaap=t.slaap, klok=t.klok), o, t


def starts(o):
    return [v[0] for v in o.verzoeken]


def gaten(o):
    s = starts(o)
    return [b - a for a, b in zip(s, s[1:])]


def controleer_verzoeken(off, o, url):
    for _, req, a, kw in o.verzoeken:
        assert isinstance(req, urllib.request.Request) and req.full_url == url
        assert req.get_header("User-agent") == off.UA
        t = kw.get("timeout", a[0] if a else None)
        assert t is not None and t > 0  # opener(request, timeout=…)


def test_r6_haler_user_agent_en_minstens_pauze_tussen_het_begin_van_verzoeken():  # P0, CAP-17
    off = mod("off")
    h, o, _ = haler(off, [b"een", b"twee", b"drie"])
    url = f"https://{ROBOTOFF}{CROP_PAD}?x=1"
    assert [h.get(url) for _ in range(3)] == [b"een", b"twee", b"drie"]
    assert len(o.verzoeken) == 3 and all(g >= off.PAUZE - 1e-9 for g in gaten(o))
    controleer_verzoeken(off, o, url)


@pytest.mark.parametrize("fout", [500, 503, 429, lambda: urllib.error.URLError("verbinding weg"),
                                  lambda: TimeoutError("tijd op")], ids=["500", "503", "429", "urlerror", "timeout"])
def test_r6_haler_tijdelijke_fout_opnieuw_na_2_4_8_16_32_daarna_tijdelijk(fout):  # P0, CAP-17
    off = mod("off")
    h, o, _ = haler(off, [fout])
    url = f"https://{ROBOTOFF}{CROP_PAD}?x=2"
    with pytest.raises(off.Tijdelijk):
        h.get(url)
    assert len(o.verzoeken) == 1 + len(off.WACHT)
    for g, w in zip(gaten(o), (2, 4, 8, 16, 32)):
        assert w - 1e-9 <= g <= w + off.PAUZE + 0.05 + 1e-6, (gaten(o))
    controleer_verzoeken(off, o, url)


@pytest.mark.parametrize("retry_after, wacht", [(7, 7), (1000, 300)], ids=["7-s", "plafond-300"])
def test_r6_haler_retry_after_gaat_voor_met_plafond_300(retry_after, wacht):  # P0, CAP-17
    off = mod("off")
    for code in (503, 429):
        h, o, _ = haler(off, [(code, retry_after), b"goed"])
        assert h.get(f"https://{ROBOTOFF}{CROP_PAD}?x=3") == b"goed"
        assert len(o.verzoeken) == 2 and wacht - 1e-9 <= gaten(o)[0] <= wacht + off.PAUZE + 0.05 + 1e-6, gaten(o)


@pytest.mark.parametrize("code", [400, 403, 404])
def test_r6_haler_andere_4xx_direct_blijvend_met_een_verzoek(code):  # P0, CAP-17
    off = mod("off")
    h, o, t = haler(off, [code, b"nooit"])
    with pytest.raises(off.Blijvend):
        h.get(f"https://{ROBOTOFF}{CROP_PAD}?x=4")
    assert len(o.verzoeken) == 1 and sum(t.slapen) < off.WACHT[0]


def test_r6_haler_500_dan_200_geeft_de_bytes():  # P0, CAP-17
    off = mod("off")
    h, o, _ = haler(off, [500, b"uitsnede"])
    assert h.get(f"https://{ROBOTOFF}{CROP_PAD}?x=5") == b"uitsnede"
    assert len(o.verzoeken) == 2 and gaten(o)[0] >= 2 - 1e-9


# --- ophalen: trekking, redenen, index, rapport, hervatten, noodstop, schijf (CAP-17) ------------------------------------

def test_r6_ophalen_grens_per_klasse_in_volgorde_redenen_index_en_rapport(tmp_path):  # P0, CAP-17
    off = mod("off")
    pool_wm = ("label", "fr:lait-de-paturage")
    gd, wm = schone(range(1, 13)) + afvallers(101), schone(range(201, 204))
    h = NepHaler({POOL_GD: gd, pool_wm: wm}, aantal={"en:green-dot": 119_623, "fr:lait-de-paturage": 608})
    uit = tmp_path / "off"
    r = haal(off, uit, h, (GD, WM), TOETS_GTINS, LEV_GTINS, LEV_GLN7, grens=5)
    verwacht = {GD: op_volgorde(range(1, 13))[:5], WM: op_volgorde(range(201, 204))}  # WM: minder dan de grens, dus alles
    assert [i for i in crop_ids(h) if i < 200] == verwacht[GD] and [i for i in crop_ids(h) if i > 200] == verwacht[WM]
    for u in h.urls:  # alleen de zoek- en de crop-endpoint, nooit een hele foto
        assert urlsplit(u).netloc == ROBOTOFF and soort(u) in ("pool", "crop"), u
        if soort(u) == "crop":
            assert parse_qs(urlsplit(u).query)["image_url"][0].startswith(PRODUCTEN + "/")
    assert sorted(parse_qs(urlsplit(u).query)["count"][0] for u in pool_urls(h)) == ["2000", "2000"]
    for k in (GD, WM):
        assert bewaard(uit, k) == set(verwacht[k])
        for i in verwacht[k]:
            assert (uit / "uitsneden" / k / f"{i}.jpg").read_bytes() == uitsnede(i)
    gd_r, wm_r = r["klassen"][GD], r["klassen"][WM]
    assert (gd_r["off"], gd_r["pool"], gd_r["behouden"], wm_r["off"], wm_r["pool"], wm_r["behouden"]) == \
        (119_623, 21, 5, 608, 3, 3)
    assert gd_r["afgevallen"] == {**dict.fromkeys(REDENEN, 0), "verwijderd": 2, "vakje_ongeldig": 2, "te_klein": 1,
                                  "geen_gtin": 1, "toets_gtin": 1, "toetsleverancier": 2}  # over de hele pool
    assert wm_r["afgevallen"] == dict.fromkeys(REDENEN, 0)
    for k in (GD, WM):
        n = collections.Counter(("annotator-a", "annotator-b")[i % 2] for i in verwacht[k])
        assert {a: c for a, c in r["klassen"][k]["annotatoren"].items() if c} == dict(n)
        assert r["klassen"][k]["bytes"] == sum(len(uitsnede(i)) for i in verwacht[k])
    assert r["bytes"] >= gd_r["bytes"] + wm_r["bytes"] and r["vrij"] == GROOT
    pools = {Path(b).name: s for b, s in r["pools"].items()}
    for sleutel, naam in ((POOL_GD, "label-en_green-dot.json"), (pool_wm, "label-fr_lait-de-paturage.json")):
        assert (uit / "pools" / naam).read_bytes() == h.antwoord(sleutel)  # het ruwe antwoord
        assert pools[naam] == hashlib.sha256(h.antwoord(sleutel)).hexdigest()
    assert (r["seed"], r["grens"], r["bron"], r["attributie"], r["licentie"]) == \
        (off.SEED, 5, off.BRON, off.ATTRIBUTIE, off.LICENTIE)
    assert json.loads((uit / "rapport.json").read_text(encoding="utf-8")) == json.loads(json.dumps(r))
    idx = {e["logo_id"]: e for e in index(uit)}
    assert set(idx) == set(verwacht[GD]) | set(verwacht[WM])
    for k in (GD, WM):
        for i in verwacht[k]:
            e = idx[i]
            assert (e["klasse"], e["gtin14"], e["source_image"], e["annotator"]) == \
                (k, "0" + barcode_van(i), f"/{i}/1.jpg", ("annotator-a", "annotator-b")[i % 2])
            assert e["sha256"] == hashlib.sha256(uitsnede(i)).hexdigest() == \
                hashlib.sha256(bestand(uit, e).read_bytes()).hexdigest()


def test_r6_ophalen_v_label_drie_pools_samen_ontdubbeld_op_id(tmp_path):  # P0, CAP-17
    off = mod("off")
    pools = dict(zip(ZOEK[V], (schone(range(300, 306)), schone(range(304, 308)), schone([308, 300]))))
    h = NepHaler(pools, aantal={"en:european-vegetarian-union-vegan": 14_410,
                                "en:european-vegetarian-union-vegetarian": 1_628, "en:european-vegetarian-union": 3_430})
    r = haal(off, tmp_path / "off", h, (V,), grens=100)
    assert len(pool_urls(h)) == 3 and sorted(crop_ids(h)) == list(range(300, 309))  # elk id één keer opgehaald
    assert crop_ids(h) == op_volgorde(range(300, 309))
    k = r["klassen"][V]
    assert (k["off"], k["pool"], k["behouden"]) == (14_410 + 1_628 + 3_430, 9, 9)
    assert bewaard(tmp_path / "off", V) == set(range(300, 309))


def test_r6_ophalen_dubbel_bijna_gelijk_en_blijvend_in_status_niet_weggeschreven(tmp_path):  # P0, CAP-17
    off, sch = mod("off"), mod("scheiding")
    ids = op_volgorde(range(1, 7))
    r0, r1, r2, r3, r4, r5 = ids
    data = {i: uitsnede(i) for i in ids}
    data[r1] = data[r0]  # zelfde bytes als een eerder behouden uitsnede: dubbel
    toets = {"toets/etiket-hint-3.png": sch.dhash(Image.open(io.BytesIO(data[r3])))}
    for i in (r0, r2, r4, r5):  # voorwaarde: alleen r3 lijkt op het toetsbeeld
        assert sch.hamming(sch.dhash(Image.open(io.BytesIO(data[i]))), next(iter(toets.values()))) > 6
    h = NepHaler({POOL_GD: schone(ids)}, uitsneden=data, fouten={r2: off.Blijvend})
    uit = tmp_path / "off"
    r = haal(off, uit, h, (GD,), toets_hashes=toets, grens=3)
    assert crop_ids(h) == ids  # afvallers bij het ophalen tellen niet voor de grens: door tot 3 behouden
    assert bewaard(uit, GD) == {r0, r4, r5} and {e["logo_id"] for e in index(uit)} == {r0, r4, r5}
    assert status(uit) == {str(r1): "dubbel", str(r2): "niet_op_te_halen", str(r3): "bijna_gelijk"}
    k = r["klassen"][GD]
    assert (k["afgevallen"]["dubbel"], k["afgevallen"]["niet_op_te_halen"], k["afgevallen"]["bijna_gelijk"],
            k["behouden"]) == (1, 1, 1, 3)


def test_r6_ophalen_hervat_zonder_nieuwe_verzoeken_en_probeert_alleen_tijdelijke_fouten_opnieuw(tmp_path):  # P0, CAP-17
    off = mod("off")
    ids = op_volgorde(range(1, 7))
    pools, uit = {POOL_GD: schone(ids)}, tmp_path / "off"
    h1 = NepHaler(pools, fouten={ids[1]: off.Tijdelijk, ids[3]: off.Blijvend})
    r1 = haal(off, uit, h1, (GD,), grens=10)
    assert (r1["klassen"][GD]["behouden"], r1["klassen"][GD]["afgevallen"]["niet_op_te_halen"]) == (4, 2)
    assert status(uit) == {str(ids[3]): "niet_op_te_halen"}  # een tijdelijke fout is geen blijvende uitkomst
    h2 = NepHaler(pools)
    r2 = haal(off, uit, h2, (GD,), grens=10)
    assert pool_urls(h2) == [] and crop_ids(h2) == [ids[1]]  # bewaarde pool, bestaande uitsneden, blijvende afvaller
    assert (r2["klassen"][GD]["behouden"], r2["klassen"][GD]["afgevallen"]["niet_op_te_halen"]) == (5, 1)
    assert bewaard(uit, GD) == set(ids) - {ids[3]} and {e["logo_id"] for e in index(uit)} == set(ids) - {ids[3]}
    assert r2["pools"] == r1["pools"]


def test_r6_ophalen_hervat_met_een_nieuwe_toets_gtin_verwijdert_de_uitsnede_en_haalt_de_volgende(tmp_path):  # P0, CAP-17
    off = mod("off")
    ids = op_volgorde(range(1, 6))
    pools, uit = {POOL_GD: schone(ids)}, tmp_path / "off"
    haal(off, uit, NepHaler(pools), (GD,), grens=3)
    assert bewaard(uit, GD) == set(ids[:3])
    h2 = NepHaler(pools)
    r = haal(off, uit, h2, (GD,), toets_gtins={"0" + barcode_van(ids[1])}, grens=3)  # de toetsset is intussen gegroeid
    assert pool_urls(h2) == [] and crop_ids(h2) == [ids[3]]
    assert not (uit / "uitsneden" / GD / f"{ids[1]}.jpg").exists()
    assert bewaard(uit, GD) == {ids[0], ids[2], ids[3]} and {e["logo_id"] for e in index(uit)} == {ids[0], ids[2], ids[3]}
    assert (r["klassen"][GD]["afgevallen"]["toets_gtin"], r["klassen"][GD]["behouden"]) == (1, 3)


def test_r6_ophalen_hervat_met_een_bijna_gelijk_toetsbeeld_verwijdert_de_uitsnede_en_haalt_de_volgende(tmp_path):  # P0, CAP-17
    off, sch = mod("off"), mod("scheiding")
    ids = op_volgorde(range(1, 6))
    pools, uit = {POOL_GD: schone(ids)}, tmp_path / "off"
    haal(off, uit, NepHaler(pools), (GD,), grens=3)
    assert bewaard(uit, GD) == set(ids[:3])
    x = ids[1]
    toets = {"toets/nieuw.png": sch.dhash(Image.open(io.BytesIO(uitsnede(x))))}  # de toetsbeelden zijn intussen gegroeid
    for i in (ids[0], ids[2], ids[3]):  # voorwaarde: alleen x lijkt op het toetsbeeld
        assert sch.hamming(sch.dhash(Image.open(io.BytesIO(uitsnede(i)))), toets["toets/nieuw.png"]) > 6
    h2 = NepHaler(pools)
    r = haal(off, uit, h2, (GD,), toets_hashes=toets, grens=3)
    assert pool_urls(h2) == [] and crop_ids(h2) == [ids[3]]
    assert not (uit / "uitsneden" / GD / f"{x}.jpg").exists() and status(uit) == {str(x): "bijna_gelijk"}
    assert bewaard(uit, GD) == {ids[0], ids[2], ids[3]} and {e["logo_id"] for e in index(uit)} == {ids[0], ids[2], ids[3]}
    assert (r["klassen"][GD]["afgevallen"]["bijna_gelijk"], r["klassen"][GD]["behouden"]) == (1, 3)


def test_r6_ophalen_kapot_zoekantwoord_of_geen_beeld_is_tijdelijk_en_wordt_niet_bewaard(tmp_path):  # P0, CAP-17
    off = mod("off")
    uit = tmp_path / "off"

    class Html(NepHaler):
        def get(self, url):
            return b"<html>onderhoud</html>" if soort(url) == "pool" else super().get(url)

    with pytest.raises(off.Tijdelijk):
        haal(off, uit, Html({POOL_GD: schone(range(1, 4))}), (GD,))
    assert not (uit / "pools").exists()  # niets weggeschreven: een hervatting haalt de pool opnieuw
    ids = op_volgorde(range(1, 5))
    h = NepHaler({POOL_GD: schone(ids)}, uitsneden={ids[0]: b"<html>geen beeld</html>"})
    r = haal(off, uit, h, (GD,), toets_hashes={"t.png": 0})
    assert bewaard(uit, GD) == set(ids[1:]) and status(uit) == {}  # tijdelijk: de volgende run probeert hem opnieuw
    assert r["klassen"][GD]["afgevallen"]["niet_op_te_halen"] == 1


def test_r6_ophalen_met_een_deel_van_de_klassen_houdt_index_en_rapport_van_de_andere(tmp_path):  # P0, CAP-17
    off = mod("off")
    pool_wm = ("label", "fr:lait-de-paturage")
    pools, uit = {POOL_GD: schone(range(1, 4)), pool_wm: schone(range(201, 203))}, tmp_path / "off"
    haal(off, uit, NepHaler(pools), (GD, WM))
    r = haal(off, uit, NepHaler(pools), (WM,))
    assert set(r["klassen"]) == {GD, WM} and r["klassen"][GD]["behouden"] == 3
    assert {e["logo_id"] for e in index(uit)} == {1, 2, 3, 201, 202}
    with pytest.raises(off.Noodstop):  # een run die vroeg stopt, laat geen index achter
        haal(off, tmp_path / "b", NepHaler({POOL_GD: schone(range(1, 30))}, fouten=dict.fromkeys(range(1, 30), off.Tijdelijk)),
             (GD,))
    assert not (tmp_path / "b" / "bronnen.json").exists()


def test_r6_haler_retry_after_negatief_of_nan_en_afgebroken_read_zijn_tijdelijk():  # P0, CAP-17
    import http.client
    off = mod("off")
    for retry in (-5, "nan"):
        h, o, t = haler(off, [(503, retry), b"goed"])
        assert h.get(f"https://{ROBOTOFF}{CROP_PAD}?x=6") == b"goed" and all(s >= 0 for s in t.slapen)
    for fout in (lambda: ConnectionResetError("weg"), lambda: http.client.IncompleteRead(b"")):
        h, o, _ = haler(off, [fout, b"goed"])
        assert h.get(f"https://{ROBOTOFF}{CROP_PAD}?x=7") == b"goed" and len(o.verzoeken) == 2


def test_r6_ophalen_noodstop_na_20_tijdelijke_fouten_op_rij(tmp_path):  # P0, CAP-17
    off = mod("off")
    ids = op_volgorde(range(1, 26))
    h = NepHaler({POOL_GD: schone(ids)}, fouten={i: off.Tijdelijk for i in ids})
    with pytest.raises(off.Noodstop):
        haal(off, tmp_path / "a", h, (GD,), grens=100)
    assert len(crop_ids(h)) == 20
    ids2 = op_volgorde(range(101, 140))  # 19 mislukt, 1 gelukt, 19 mislukt: nooit 20 op rij
    h2 = NepHaler({POOL_GD: schone(ids2)}, fouten={i: off.Tijdelijk for n, i in enumerate(ids2) if n != 19})
    r = haal(off, tmp_path / "b", h2, (GD,), grens=100)
    assert (r["klassen"][GD]["behouden"], r["klassen"][GD]["afgevallen"]["niet_op_te_halen"]) == (1, 38)


def test_r6_ophalen_stopt_bij_de_bytegrens_zonder_erboven_te_schrijven(tmp_path):  # P0, CAP-17 (stoppunt 9)
    off = mod("off")
    ids = op_volgorde(range(1, 11))
    h = NepHaler({POOL_GD: schone(ids)})
    grens = len(h.antwoord(POOL_GD)) + int(2.5 * max(len(uitsnede(i)) for i in ids))  # pool + 2,5 uitsnede
    uit = tmp_path / "off"
    with pytest.raises(off.Schijfvol):
        haal(off, uit, h, (GD,), grens=100, max_bytes=grens)
    assert 1 <= len(list(uit.rglob("*.jpg"))) <= 2 and grootte(uit) <= grens


@pytest.mark.parametrize("vrij, gestopt", [(4_999_999_999, True), (5_000_000_000, False)], ids=["onder-5-gb", "precies-5-gb"])
def test_r6_ophalen_stopt_bij_minder_dan_5_gb_vrij(tmp_path, vrij, gestopt):  # P0, CAP-17 (stoppunt 9)
    off = mod("off")
    h, uit = NepHaler({POOL_GD: schone(range(1, 5))}), tmp_path / "off"
    if gestopt:
        with pytest.raises(off.Schijfvol):
            haal(off, uit, h, (GD,), vrij=lambda: vrij)
        assert not list(uit.rglob("*.jpg"))
    else:
        assert haal(off, uit, h, (GD,), vrij=lambda: vrij)["klassen"][GD]["behouden"] == 4


@pytest.mark.parametrize("fout", ["Tijdelijk", "Blijvend"])
def test_r6_ophalen_pool_niet_op_te_halen_stopt_met_de_uitzondering(tmp_path, fout):  # P1, CAP-17
    off = mod("off")
    h = NepHaler({}, fouten={POOL_GD: getattr(off, fout)})
    with pytest.raises(getattr(off, fout)):
        haal(off, tmp_path / "off", h, (GD,))
    assert crop_ids(h) == []


def test_r6_ophalen_schrijft_nooit_in_een_git_werkboom(tmp_path):  # P0, CAP-17
    off, repo = mod("off"), tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    with pytest.raises(mod("beelden").BinnenRepo):
        haal(off, repo / "off", NepHaler({POOL_GD: schone(range(1, 4))}), (GD,))
    assert not (repo / "off").exists()


# --- opdrachtregel off.py ophalen (CAP-17) ---------------------------------------------------------------------------------

def vang_ophalen(monkeypatch, off, vrij=GROOT):
    """De echte `ophalen`, met een vaste vrije schijf; legt de argumenten van de opdrachtregel vast."""
    echt, gezien = off.ophalen, {}

    def ophalen(*a, **k):
        b = inspect.signature(echt).bind(*a, **k)
        b.apply_defaults()
        gezien.update(b.arguments)
        b.arguments["vrij"] = lambda: vrij
        return echt(*b.args, **b.kwargs)

    monkeypatch.setattr(off, "ophalen", ophalen)
    return gezien


def test_r6_cli_ophalen_leest_toetsset_toetsleveranciers_en_toetsbeelden_uit_de_proefmap(tmp_path, monkeypatch, capsys):  # P1, CAP-17
    off, sch = mod("off"), mod("scheiding")
    pm, glns, gtins = ng_pm(tmp_path)  # toetsleveranciers 8722222000004 (declaraties) en 8744444000001 (alcohol)
    schrijf(pm / "toets" / "toets-docs.json", [f"8722222000004-{TOETS_BC}-528", "8722222000004-08700000000013-528"])
    (pm / "toets" / "beelden").mkdir()
    (pm / "toets" / "beelden" / "etiket.png").write_bytes(png((64, 64), ruis=3))
    nep = NepHaler({POOL_GD: schone(range(1, 5)) + [rec(106, barcode=TOETS_BC), rec(107, barcode=LEV_BC),
                                                     rec(108, barcode=GLN7_BC), rec(109, barcode="08711111111117")]})
    monkeypatch.setattr(off, "Haler", lambda *a, **k: nep)
    gezien = vang_ophalen(monkeypatch, off)
    assert rc(lambda: off.main(["ophalen", "--proef-map", str(pm), "--klasse", GD])) in (0, None)
    assert set(gezien["toets_gtins"]) == {"08766666666664", "08700000000013"}  # GTIN uit het doc-id, als GTIN-14
    assert set(gezien["lev_gtins"]) == {g.zfill(14) for g in gtins} and set(gezien["lev_gln7"]) == {g[:7] for g in glns}
    assert dict(gezien["toets_hashes"]) == sch._hashes(pm / "toets" / "beelden")
    assert Path(gezien["uit"]) == pm / "off"
    rapport = json.loads((pm / "off" / "rapport.json").read_text(encoding="utf-8"))
    assert json.loads(capsys.readouterr().out) == rapport and set(rapport["klassen"]) == {GD}
    af = rapport["klassen"][GD]["afgevallen"]
    assert (af["toets_gtin"], af["toetsleverancier"], rapport["klassen"][GD]["behouden"]) == (1, 3, 4)


@pytest.mark.parametrize("geval", ["noodstop", "schijfvol", "pool"])
def test_r6_cli_ophalen_noodstop_schijfvol_of_mislukte_pool_exit_3(tmp_path, monkeypatch, capsys, geval):  # P1, CAP-17
    off = mod("off")
    pm, _, _ = ng_pm(tmp_path)
    schrijf(pm / "toets" / "toets-docs.json", [])
    ids = list(range(1, 26))
    fouten = {"noodstop": {i: off.Tijdelijk for i in ids}, "pool": {POOL_GD: off.Tijdelijk}}.get(geval, {})
    nep = NepHaler({POOL_GD: schone(ids)}, fouten=fouten)
    monkeypatch.setattr(off, "Haler", lambda *a, **k: nep)
    vang_ophalen(monkeypatch, off, vrij=0 if geval == "schijfvol" else GROOT)
    assert rc(lambda: off.main(["ophalen", "--proef-map", str(pm), "--klasse", GD])) == 3
    assert capsys.readouterr().err.strip()


@pytest.mark.parametrize("klasse", [RC, "ONZIN"], ids=["recyclebaar", "onzin"])
def test_r6_cli_ophalen_onbekende_klasse_exit_2(tmp_path, monkeypatch, klasse):  # P1, CAP-17
    off = mod("off")
    pm, _, _ = ng_pm(tmp_path)
    schrijf(pm / "toets" / "toets-docs.json", [])
    nep = NepHaler({})
    monkeypatch.setattr(off, "Haler", lambda *a, **k: nep)
    assert rc(lambda: off.main(["ophalen", "--proef-map", str(pm), "--klasse", klasse])) == 2
    assert nep.urls == [] and not (pm / "off" / "rapport.json").exists()


# --- generator: OFF als logobron, alleen in train (CAP-17/CAP-4) -------------------------------------------------------

def magenta(maat=48):
    return Image.new("RGB", (maat, maat), MAGENTA)


def is_magenta(arr):
    return (arr[:, :, 0] > 150) & (arr[:, :, 1] < 100) & (arr[:, :, 2] > 150)


def gen_off(gen, uit, off, n=12, seed=5, **kw):
    return gen.genereer([achtergrond()], logos(), [], TRAIN_GTINS, n_tegels=n, seed=seed, uit=uit, tegel=TEGEL, off=off, **kw)


def inhoud(map_):
    return {p.relative_to(map_).as_posix(): p.read_bytes() for p in sorted(map_.rglob("*")) if p.is_file()}


def objecten(m):
    return [o for b in m["beelden"] for o in b["objecten"]]


def niet_nul(d):
    return {k: v for k, v in d.items() if v}


def test_r6_generator_off_aandeel_half_alleen_voor_klassen_met_uitsneden_en_manifest(tmp_path):  # P0, CAP-17/CAP-4
    gen = mod("generator")
    assert gen.AANDEEL_OFF == 0.5
    m = gen_off(gen, tmp_path / "g", {GD: [magenta()]}, n=150, seed=11)
    gd = [o for o in objecten(m) if o["klasse"] == GD]
    n_off = sum(o["variant"] == "off" for o in gd)
    assert len(gd) >= 80 and 0.35 <= n_off / len(gd) <= 0.65  # kans 0,5 per geplakt GD-logo
    assert all(o["variant"] in VARIANTEN4 for o in objecten(m) if o["klasse"] != GD)  # EU heeft geen OFF-uitsneden
    assert all(o["variant"] in VARIANTEN4 | {"off"} for o in gd)
    assert niet_nul(m["off"]) == {GD: n_off}
    assert niet_nul(json.loads((tmp_path / "g" / "manifest-train.json").read_text())["off"]) == {GD: n_off}


def test_r6_generator_off_uitsnede_geplakt_zoals_hij_is_zonder_afgeleide_varianten(tmp_path):  # P0, CAP-17
    gen, uit = mod("generator"), tmp_path / "g"
    m = gen_off(gen, uit, {GD: [magenta()]}, n=40, seed=12)
    coco, _, _, beelden_ = lees(uit)
    per_naam = {im["file_name"]: im["id"] for im in coco["images"]}
    n_off = 0
    for b in m["beelden"]:
        mag = is_magenta(beelden_[per_naam[b["bestand"]]])
        offs = [o for o in b["objecten"] if o["variant"] == "off"]
        for o in b["objecten"]:
            x, y, w, h = o["bbox"]
            deel = mag[y:y + h, x:x + w].mean()
            assert deel > 0.5 if o["variant"] == "off" else deel < 0.01, (b["bestand"], o)  # magenta, geen grijs/lijn/negatief
        assert not (mag & ~bedekt(mag.shape, offs)).any()  # OFF alleen als gelabeld OFF-object
        n_off += len(offs)
    assert n_off >= 10


def test_r6_generator_zonder_off_byte_gelijk_aan_voor_ronde_6(tmp_path):  # P0, CAP-17/CAP-4
    gen = mod("generator")
    gen.genereer([achtergrond()], logos(), [], TRAIN_GTINS, n_tegels=12, seed=5, uit=tmp_path / "basis", tegel=TEGEL)
    basis = inhoud(tmp_path / "basis" / "train")
    for naam, off in (("none", None), ("leeg", {}), ("lege-lijst", {GD: []}), ("zonder-eigen-bron", {WM: [magenta()]})):
        m = gen_off(gen, tmp_path / naam, off)
        assert inhoud(tmp_path / naam / "train") == basis, naam
        assert not any(m["off"].values()) and all(o["variant"] != "off" for o in objecten(m)), naam
        assert not (tmp_path / naam / "herkomst.json").exists(), naam
    assert gen_off(gen, tmp_path / "none2", None)["off"] == {}


# sha256 over naam + bytes van train/ voor de fixture van test_cap04_generator (12 tegels, seed 5, tegel 256), gemeten op
# 953ca95 (vóór ronde 6) met dezelfde Pillow uit uv.lock; verandert Pillow, dan opnieuw meten op 953ca95.
TRAIN_VOOR_RONDE_6 = "d5f84b86730b3147382b3bab64c857689ebc6cd7c069f882d27825d2d10a6009"


def sha_train(map_):
    """sha256 over train/; in de COCO-set alleen categorie-id 1–13 (ronde 9 voegt 14–17 toe, de rest blijft byte-gelijk)."""
    h = hashlib.sha256()
    for p in sorted(map_.rglob("*")):
        h.update(p.name.encode())
        b = p.read_bytes()
        if p.name == "_annotations.coco.json":
            coco = json.loads(b)
            coco["categories"] = [c for c in coco["categories"] if c["id"] <= 13]
            b = json.dumps(coco, indent=1, sort_keys=True).encode()  # zoals generator.py schrijft
        h.update(b)
    return h.hexdigest()


@pytest.mark.parametrize("off", ["weggelaten", None, {}], ids=["zonder-argument", "none", "leeg"])
def test_r6_generator_zonder_off_train_gelijk_aan_de_uitvoer_van_953ca95(tmp_path, off):  # P0, CAP-17 (trace run 7)
    gen = mod("generator")
    kw = {} if off == "weggelaten" else {"off": off}
    gen.genereer([achtergrond()], logos(), [], TRAIN_GTINS, n_tegels=12, seed=5, uit=tmp_path / "g", tegel=TEGEL, **kw)
    assert sha_train(tmp_path / "g" / "train") == TRAIN_VOOR_RONDE_6


def test_r6_generator_off_laat_de_klassenverhouding_ongewijzigd(tmp_path):  # P0, CAP-17 (trace run 7)
    """OFF vervangt de bron, niet de klasse: met en zonder OFF voor GREEN_DOT hetzelfde aandeel GREEN_DOT onder de geplakte
    logo's (3 × 100 tegels, vaste seeds). Gemeten 02-11-2026: 0,53 zonder, 0,50 met; telde OFF als extra bron, dan ±0,67."""
    gen = mod("generator")

    def aandeel(off):
        obj = [o for s in (1, 2, 3) for o in objecten(gen_off(gen, tmp_path / f"{bool(off)}-{s}", off, n=100, seed=s))]
        return sum(o["klasse"] == GD for o in obj) / len(obj), obj

    zonder, _ = aandeel(None)
    met, obj = aandeel({GD: [magenta()]})
    assert any(o["variant"] == "off" for o in obj)  # voorwaarde: OFF is echt geplakt
    assert abs(met - zonder) <= 0.10, (zonder, met)


def test_r6_generator_off_vaste_seed_en_pad_of_beeld_gelijk(tmp_path):  # P0, CAP-17/CAP-4
    gen = mod("generator")
    pad = tmp_path / "magenta.png"
    magenta().save(pad)
    a = gen_off(gen, tmp_path / "a", {GD: [str(pad)]}, n=16)
    a2 = gen_off(gen, tmp_path / "a2", {GD: [str(pad)]}, n=16)
    gen_off(gen, tmp_path / "c", {GD: [magenta()]}, n=16)
    gen_off(gen, tmp_path / "d", {GD: [str(pad)]}, n=16, seed=6)
    t = {n: inhoud(tmp_path / n / "train") for n in ("a", "a2", "c", "d")}
    assert t["a"] == t["a2"] == t["c"] != t["d"] and a == a2
    assert any(o["variant"] == "off" for o in objecten(a))


def test_r6_generator_off_alleen_in_train_en_alleen_bekende_klassen(tmp_path):  # P0, CAP-17
    gen = mod("generator")
    for split in ("valid", "test"):
        with pytest.raises(ValueError):
            gen_off(gen, tmp_path / split, {GD: [magenta()]}, split=split)
        assert not (tmp_path / split).exists()  # geweigerd vóór er iets geschreven wordt
    for klasse in ("ONZIN", VV):  # de vegetarische variant is geen klasse
        with pytest.raises(ValueError):
            gen_off(gen, tmp_path / klasse, {klasse: [magenta()]})
    m = gen_off(gen, tmp_path / "valid-leeg", {GD: []}, split="valid")  # lege lijsten tellen niet
    assert (tmp_path / "valid-leeg" / "valid" / "_annotations.coco.json").exists() and not any(m["off"].values())


def test_r6_generator_herkomst_met_off_attributie_overschreven_en_nooit_verwijderd(tmp_path):  # P0, CAP-17
    gen, off, uit = mod("generator"), mod("off"), tmp_path / "nagemaakt"
    verwacht = [{"bron": off.BRON, "attributie": off.ATTRIBUTIE, "licentie": off.LICENTIE}]

    def herkomst():
        return json.loads((uit / "herkomst.json").read_text(encoding="utf-8"))

    assert sum(gen_off(gen, uit, {GD: [magenta()]}, n=16)["off"].values()) > 0
    assert herkomst() == verwacht and verwacht[0]["attributie"] == attributie_off()
    (uit / "herkomst.json").write_text('{"bron": "oud"}', encoding="utf-8")
    gen_off(gen, uit, {GD: [magenta()]}, n=16, seed=6)
    assert herkomst() == verwacht  # overschreven
    gen_off(gen, uit, None, n=16)
    assert herkomst() == verwacht  # een run zonder OFF verwijdert hem niet


def gen_pm(tmp_path):
    """Proefmap voor `generator.py tegels`: trainingsleverancier 8733333000007 (GTIN 08733333444449), één eigen logo,
    één achtergrond en de OFF-index met één magenta uitsnede."""
    pm, _, _ = ng_pm(tmp_path)
    ag, lg = tmp_path / "ag.png", tmp_path / "logo.png"
    Image.new("RGB", (512, 512), (200, 200, 200)).save(ag)
    schijf().save(lg)
    schrijf(pm / "logos" / "bronnen.json", [{"klasse": GD, "pad": str(lg), "gtin": None}])
    schrijf(pm / "logos" / "gelijkend.json", [])
    ach = schrijf(tmp_path / "achtergronden.json", [{"pad": str(ag), "gtin": "08733333444449", "meldingen": []}])
    mag = tmp_path / "offmap" / "uitsneden" / GD / "7.jpg"
    mag.parent.mkdir(parents=True)
    magenta().save(mag, quality=95)
    idx = schrijf(tmp_path / "offmap" / "bronnen.json", [{
        "klasse": GD, "pad": str(mag), "logo_id": 7, "gtin14": "0" + barcode_van(7), "source_image": "/7/1.jpg",
        "sha256": hashlib.sha256(mag.read_bytes()).hexdigest(), "annotator": "annotator-b"}])
    uit = pm / "train" / "nagemaakt"
    argv = ["tegels", "--proef-map", str(pm), "--achtergronden", str(ach), "--uit", str(uit), "--n", "16", "--seed", "3",
            "--tegel", str(TEGEL), "--off", str(idx)]
    return argv, uit


@pytest.mark.parametrize("split", ["valid", "test"])
def test_r6_cli_tegels_met_off_buiten_train_exit_2_en_schrijft_niets(tmp_path, capsys, split):  # P0, CAP-17
    argv, uit = gen_pm(tmp_path)
    assert rc(lambda: mod("generator").main(argv + ["--split", split])) == 2
    assert "unrecognized arguments" not in capsys.readouterr().err  # --off bestaat, de weigering is inhoudelijk
    assert not uit.exists()


def test_r6_cli_tegels_met_off_index_plakt_uitsneden_en_schrijft_herkomst(tmp_path):  # P1, CAP-17
    argv, uit = gen_pm(tmp_path)
    assert rc(lambda: mod("generator").main(argv)) in (0, None)
    m = json.loads((uit / "manifest-train.json").read_text())
    n_off = sum(o["variant"] == "off" for o in objecten(m))
    assert n_off > 0 and niet_nul(m["off"]) == {GD: n_off}
    assert attributie_off() in (uit / "herkomst.json").read_text(encoding="utf-8")


def test_r6_cli_tegels_neemt_gelijkende_keurmerken_mee(tmp_path):  # P1, CAP-4 (fout sinds e157e5f: argument ingeslikt)
    gen = mod("generator")
    argv, uit = gen_pm(tmp_path)
    gl = tmp_path / "gelijkend.png"
    Image.new("RGB", (60, 60), (0, 0, 200)).save(gl)
    schrijf(uit.parents[1] / "logos" / "gelijkend.json", [{"klasse": "TRIMAN", "pad": str(gl), "gtin": None}])
    assert rc(lambda: gen.main(argv)) in (0, None)
    m = json.loads((uit / "manifest-train.json").read_text())
    assert m["gelijkend"] == [{"gtin": None, "sha256": gen._sha_beeld(Image.open(gl))}]
    assert all("uitsnede" in o for o in objecten(m) if o["variant"] == "off")  # pad uit de index: herleidbaar


# --- echt.py dataset: OFF-grens in fase 2, _off, herkomstlijst, NutriGreen toets-GTIN (CAP-17/CAP-16) -------------------

def off_herkomst():
    return {"bron": "https://world.openfoodfacts.org", "attributie": attributie_off(), "licentie": "CC-BY-SA-3.0; ODbL"}


def meng_map(map_, off_per_tegel, herkomst=None, manifest=True):
    """Mengmap zoals generator.py hem schrijft: <map>/train (COCO), <map>/manifest-train.json met per object `variant`
    ("off" = OFF-uitsnede) en eventueel <map>/herkomst.json. Elke tegel: één eigen logo plus n OFF-logo's (GD/EU om de
    beurt)."""
    beelden, mb = [], []
    for i, n in enumerate(off_per_tegel):
        naam = f"nep-{i:03d}.jpg"
        obj = [{"klasse": GD, "variant": "kleur", "bbox": [0, 0, 16, 16], "volledig": [16, 16]}]
        obj += [{"klasse": (GD, EU)[j % 2], "variant": "off", "bbox": [0, 20 * (j + 1), 16, 16], "volledig": [16, 16]}
                for j in range(n)]
        beelden.append((naam, [o["klasse"] for o in obj], {}))
        mb.append({"bestand": naam, "objecten": obj, "gelijkend": 0})
    coco_map(map_ / "train", beelden)
    if manifest:
        schrijf(map_ / "manifest-train.json", {"split": "train", "beelden": mb, "off": off_vakjes(mb)})
    if herkomst is not None:
        schrijf(map_ / "herkomst.json", herkomst)
    return mb


def off_vakjes(mb):
    return dict(collections.Counter(o["klasse"] for b in mb for o in b["objecten"] if o["variant"] == "off"))


def tot_grens(off_per_tegel, eigen, budget):
    """Aantal nagemaakte tegels: in vaste volgorde tot het budget, stoppen vóór de tegel die de grens zou passeren."""
    k = s = 0
    for n in off_per_tegel[:budget]:
        if s + n > eigen:
            break
        s, k = s + n, k + 1
    return k


def dataset_meng(tmp_path, off_per_tegel, budget=20, nutrigreen=False, **kw):
    pm, lijst, vl, _ = echt_pm(tmp_path)  # 10 trainingsetiketten, elk één zeker vakje
    mb = meng_map(tmp_path / "mix", off_per_tegel, **kw)
    uit = tmp_path / "pm" / "train" / "echt"
    argv = ["dataset", "--lijst", str(lijst), "--voorlabels", str(vl), "--proef-map", str(pm), "--uit", str(uit),
            "--meng", str(tmp_path / "mix" / "train"), "--meng-aantal", str(budget)]
    if nutrigreen:
        coco_map(tmp_path / "ng", [(f"ngfoto-{i:02d}.jpg", [NSA], {"ng_naam": f"ngfoto-{i:02d}"}) for i in range(30)])
        argv += ["--nutrigreen", str(tmp_path / "ng")]
    return argv, uit, mb


def train_coco(uit):
    return json.loads((uit / "train" / "_annotations.coco.json").read_text())


def eigen_van(tr, nep="nep-"):
    """(eigen tegels, eigen vakjes) van train/: alles wat niet NutriGreen of nagemaakt is."""
    eigen = {im["id"] for im in tr["images"] if not is_ng(im) and not im["file_name"].startswith(nep)}
    return len(eigen), sum(a["image_id"] in eigen for a in tr["annotations"])


@pytest.mark.parametrize("manifest", [True, False], ids=["met-manifest", "zonder-manifest"])
def test_r6_dataset_meng_off_vakjes_hoogstens_eigen_vakjes_in_vaste_volgorde(tmp_path, manifest):  # P0, CAP-17/CAP-16
    patroon = [3, 0] * 15  # na de tegel die de grens zou passeren komt er een zonder OFF: stoppen, niet overslaan
    argv, uit, mb = dataset_meng(tmp_path, patroon, manifest=manifest)
    assert rc(lambda: mod("echt").main(argv)) in (0, None)
    tr = train_coco(uit)
    _, eigen = eigen_van(tr)
    k = tot_grens(patroon if manifest else [0] * 30, eigen, 20)
    assert 0 < k < 20 if manifest else k == 20  # met manifest bijt de grens echt
    assert sorted(im["file_name"] for im in tr["images"] if im["file_name"].startswith("nep-")) == \
        [f"nep-{i:03d}.jpg" for i in range(k)]
    rp = json.loads((uit / "rapport.json").read_text())
    assert rp["_nagemaakt"] == k and rp["_off"]["grens"] == eigen
    assert niet_nul(rp["_off"]["vakjes"]) == (off_vakjes(mb[:k]) if manifest else {})
    assert sum(rp["_off"]["vakjes"].values()) <= eigen


@pytest.mark.parametrize("geval", ["meng-lijst", "meng-object", "beide", "ng-zonder-mengtegel", "geen"])
def test_r6_dataset_herkomst_is_een_lijst_van_wat_echt_gemengd_is(tmp_path, geval):  # P0, CAP-17/CAP-16
    ng_mod, oh = mod("nutrigreen"), off_herkomst()
    blok = geval in ("ng-zonder-mengtegel", "geen")  # de eerste nagemaakte tegel passeert de OFF-grens: geen mengtegel
    argv, uit, _ = dataset_meng(tmp_path, ([50] if blok else [1, 0]) + [0] * 28,
                                herkomst=oh if geval == "meng-object" else [oh],
                                nutrigreen=geval in ("beide", "ng-zonder-mengtegel"))
    schrijf(uit / "herkomst.json", [{"bron": "oud (eerdere run)"}])
    assert rc(lambda: mod("echt").main(argv)) in (0, None)
    rp = json.loads((uit / "rapport.json").read_text())
    pad = uit / "herkomst.json"
    if geval == "geen":
        assert rp["_nagemaakt"] == 0 and not pad.exists()
        return
    assert pad.exists()
    h = json.loads(pad.read_text(encoding="utf-8"))
    assert isinstance(h, list) and "oud (eerdere run)" not in json.dumps(h)
    ng = [x for x in h if x.get("bron") == ng_mod.BRON]
    if geval.startswith("meng"):
        assert h == [oh] and rp["_nagemaakt"] > 0
    else:
        assert len(ng) == 1 and ng[0]["attributie"] == ng_mod.ATTRIBUTIE and ng[0]["rapport"] == rp["_nutrigreen"]
        if geval == "beide":
            assert len(h) == 2 and oh in h and rp["_nagemaakt"] > 0
        else:
            assert h == ng and rp["_nagemaakt"] == 0  # geen nagemaakte tegel gemengd: geen OFF-herkomst


def test_r6_dataset_nutrigreen_foto_met_toets_gtin_valt_voor_het_mengen_af(tmp_path):  # P0, CAP-17/CAP-16
    ec = mod("echt")
    pm, lijst, vl, _ = echt_pm(tmp_path)
    schrijf(pm / "toets" / "toets-docs.json", [f"{TOETS_GLN}-08766666666664-528", f"{TOETS_GLN}-30000000000001-528"])
    ng = coco_map(tmp_path / "ng", [(f"{TOETS_BC}.jpg", [NSA], {"ng_naam": TOETS_BC}),  # GTIN-14 08766666666664: toets
                                    ("8733333444449.jpg", [NSA], {"ng_naam": "8733333444449"})]
                  + [(f"ngfoto-eu-{i}.jpg", [EU], {"ng_naam": f"ngfoto-eu-{i}"}) for i in range(6)])
    meng_map(tmp_path / "mix", [0] * 30)
    uit = tmp_path / "pm" / "train" / "echt"
    argv = ["dataset", "--lijst", str(lijst), "--voorlabels", str(vl), "--proef-map", str(pm), "--uit", str(uit),
            "--meng", str(tmp_path / "mix" / "train"), "--meng-aantal", "20", "--nutrigreen", str(tmp_path / "ng")]
    assert rc(lambda: ec.main(argv)) in (0, None)
    tr = train_coco(uit)
    n_eigen, eigen = eigen_van(tr)
    alle, _ = ec.kies_nutrigreen(ng, n_eigen, eigen, 20, nagemaakt=30)
    assert 0 in alle  # voorwaarde: zonder het filter zou de toetsfoto gemengd worden
    zonder = {**ng, "images": ng["images"][1:], "annotations": [a for a in ng["annotations"] if a["image_id"] != 0]}
    ids, verwacht = ec.kies_nutrigreen(zonder, n_eigen, eigen, 20, nagemaakt=30)
    rp = json.loads((uit / "rapport.json").read_text())["_nutrigreen"]
    assert rp == {**json.loads(json.dumps(verwacht)), "toets_gtin": 1}
    naam = {im["id"]: im["ng_naam"] for im in ng["images"]}
    assert sorted(im["ng_naam"] for im in tr["images"] if "ng_naam" in im) == sorted(naam[i] for i in ids)
    assert TOETS_BC not in {im.get("ng_naam") for im in tr["images"]}


def test_r6_dataset_nutrigreen_hoogstens_20_procent_als_de_off_grens_nagemaakte_tegels_weigert(tmp_path):  # P0, CAP-16/17
    argv, uit, _ = dataset_meng(tmp_path, [50] + [0] * 29, nutrigreen=True)
    assert rc(lambda: mod("echt").main(argv)) in (0, None)
    tr = train_coco(uit)
    n_ng = sum(is_ng(im) for im in tr["images"])
    assert json.loads((uit / "rapport.json").read_text())["_nagemaakt"] == 0
    assert 0 < n_ng <= 0.2 * len(tr["images"])


def test_r6_dataset_meng_met_tegels_van_de_generator_neemt_herkomst_en_off_grens_over(tmp_path):  # P1, CAP-17
    gen, ec, mix = mod("generator"), mod("echt"), tmp_path / "mix"
    m = gen.genereer([achtergrond()], logos(), [], TRAIN_GTINS, n_tegels=30, seed=21, uit=mix, tegel=TEGEL,
                     off={GD: [magenta()]})
    pm, lijst, vl, _ = echt_pm(tmp_path)
    uit = tmp_path / "pm" / "train" / "echt"
    argv = ["dataset", "--lijst", str(lijst), "--voorlabels", str(vl), "--proef-map", str(pm), "--uit", str(uit),
            "--meng", str(mix / "train"), "--meng-aantal", "20"]
    assert rc(lambda: ec.main(argv)) in (0, None)
    _, eigen = eigen_van(train_coco(uit), nep="train-")
    k = tot_grens([sum(o["variant"] == "off" for o in b["objecten"]) for b in m["beelden"]], eigen, 20)
    rp = json.loads((uit / "rapport.json").read_text())
    assert k > 0 and rp["_nagemaakt"] == k and rp["_off"]["grens"] == eigen
    assert niet_nul(rp["_off"]["vakjes"]) == off_vakjes(m["beelden"][:k])
    assert json.loads((uit / "herkomst.json").read_text(encoding="utf-8")) == \
        json.loads((mix / "herkomst.json").read_text(encoding="utf-8"))


# --- train.py: data_herkomst als lijst, ontdubbeld op bron (CAP-17/CAP-16) ---------------------------------------------

def test_r6_train_data_herkomst_lijst_uitgebreid_en_ontdubbeld_op_bron(tmp_path, monkeypatch):  # P0, CAP-17/CAP-16
    ng_oud = {"bron": "doi:10.5281/zenodo.10020545", "attributie": "NutriGreen (verzonnen)", "licentie": "CC-BY-SA-4.0",
              "rapport": {"tegels": 5}}
    ng_nieuw = {**ng_oud, "rapport": {"tegels": 9}}
    oh, ander = off_herkomst(), {"bron": "verzonnen bron", "licentie": "alleen intern"}
    schrijf(tmp_path / "ds1" / "herkomst.json", [ng_nieuw, oh])
    assert train_resultaat(tmp_path, monkeypatch, tmp_path / "ds1")["data_herkomst"] == [ng_nieuw, oh]  # lijst uitgebreid
    f1 = tmp_path / "f1"
    f1.mkdir()
    (f1 / "ckpt.pth").write_bytes(b"fase 1")
    schrijf(f1 / "train-resultaat.json", {"gewichten": {}, "data_herkomst": [oh, ng_oud], "klassen": list(mod("train").KLASSEN)})
    schrijf(tmp_path / "ds2" / "herkomst.json", [ng_nieuw, oh, ander])
    r = train_resultaat(tmp_path, monkeypatch, tmp_path / "ds2", start=f1 / "ckpt.pth")
    assert r["data_herkomst"] == [oh, ng_nieuw, ander]  # volgorde van het eerste voorkomen, inhoud van het laatste
    schrijf(tmp_path / "ds3" / "herkomst.json", oh)  # een los object telt als lijst van één
    assert train_resultaat(tmp_path, monkeypatch, tmp_path / "ds3")["data_herkomst"] == [oh]


# --- DRAAIPLAN: stap 10 en "Snelheid" (CAP-10) ---------------------------------------------------------------------------

def test_r6_draaiplan_stap_10_off_ophalen_voor_de_nagemaakte_tegels_en_alleen_in_train():  # P2, CAP-10/CAP-17
    s10 = stap(10)
    m = re.search(r"python3?\s+off\.py\s+ophalen\s+--proef-map\s+\$PM\b", s10)
    assert m and opdrachten(s10, r"off\.py\s+ophalen") and m.start() < s10.index("--n 5000")
    n5000 = [r for r in s10.splitlines() if "--n 5000" in r]
    assert n5000 and all("--off $PM/off/bronnen.json" in r for r in n5000)
    buiten = [r for r in s10.splitlines() if re.search(r"--split\s+(valid|test)\b", r)]
    assert buiten and not any("--off" in r for r in buiten)
    stop = [r for r in s10.splitlines() if r.strip().startswith("Stoppunt:")]
    assert stop and re.search(r"\b9\b", stop[0])
    tekst = (HIER / "DRAAIPLAN.md").read_text(encoding="utf-8")
    assert len(re.findall(r"^### Stap \d+ — ", tekst, re.M)) == 15  # vijftien stappen blijven


def test_r6_draaiplan_snelheid_33_tegels_fase_2_boven_8_uur_en_hoogstens_7_epochs():  # P2, CAP-10 (stoppunt 1)
    tekst = (HIER / "DRAAIPLAN.md").read_text(encoding="utf-8")
    s = tekst.split("## Snelheid", 1)[1].split("\n## ", 1)[0]
    assert re.search(r"\b33 tegels per etiket", s)
    assert any(re.search(r"fase 2", b, re.I) and re.search(r"\b20 epochs", b)
               and re.search(r"boven (de grens van )?8 uur|meer dan 8 uur|> ?8 uur", b) for b in re.split(r"\n\s*\n", s))
    assert "hoogstens 7 epochs" in s and re.search(r"stoppunt 1", s, re.I)
