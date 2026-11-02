"""ATDD CAP-4 nagemaakte trainingsbeelden (trainingsset-en-herkenning §2-§3; contract `generator.py`).
Rode fase: `generator` bestaat nog niet. Verzonnen bronnen met bekende uitkomst: egaal grijze achtergronden (200) en logo's
op een transparante achtergrond, zodat elke sterk afwijkende pixel in een tegel van een geplakt object komt.
Vastgelegd (contract laat het open): een achtergrond mag een sleutel "meldingen" (codes uit de AI-screening) dragen."""
import hashlib
import importlib
import itertools
import json
import subprocess

import numpy as np
import pytest
from PIL import Image, ImageDraw

KLASSEN = {"EU_ORGANIC_FARMING", "GREEN_DOT", "RECYCLABLE_GENERAL_CLAIM", "NUTRISCORE_A", "NUTRISCORE_B", "NUTRISCORE_C",
           "PREGNANCY_WARNING", "MARINE_STEWARDSHIP_COUNCIL_LABEL", "WEIDEMELK", "VEGAN_SOCIETY_VEGAN_LOGO",
           "NUTRISCORE_D", "NUTRISCORE_E", "EUROPEAN_V_LABEL_VEGAN",  # ronde 5: 13 klassen
           "FOREST_STEWARDSHIP_COUNCIL_LABEL", "TRIMAN", "SOCIETY_PLASTICS_INDUSTRY", "ON_THE_WAY_TO_PLANETPROOF"}  # ronde 9: 17
TEGEL, GRIJS = 256, 200
TRAIN_GTINS = {"10000000000017", "10000000000024", "10000000000031"}


def achtergrond(kleur=(GRIJS, GRIJS, GRIJS), gtin="10000000000017", **extra):
    return {"beeld": Image.new("RGB", (512, 512), kleur), "gtin": gtin, **extra}


def schijf(maat=64):
    im = Image.new("RGBA", (maat, maat), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((2, 2, maat - 3, maat - 3), fill=(0, 110, 40, 255))
    d.rectangle((maat // 3, maat // 3, 2 * maat // 3, 2 * maat // 3), fill=(255, 255, 255, 255))
    return im


def vierkant(maat=64):
    im = Image.new("RGBA", (maat, maat), (0, 40, 120, 255))
    ImageDraw.Draw(im).line((0, maat // 2, maat, maat // 2), fill=(255, 255, 255, 255), width=6)
    return im


def balk():  # gelijkend keurmerk, langwerpig 4:1
    return Image.new("RGBA", (120, 30), (130, 0, 0, 255))


def logos():
    return {"GREEN_DOT": [{"beeld": schijf(), "gtin": None}], "EU_ORGANIC_FARMING": [{"beeld": vierkant(), "gtin": "10000000000024"}]}


def op_wit(im):
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    bg.alpha_composite(im.convert("RGBA"))
    return bg.convert("RGB")


def lees(uit):
    coco = json.loads((uit / "train" / "_annotations.coco.json").read_text())
    namen = {c["id"]: c["name"] for c in coco["categories"]}
    per = {im["id"]: [] for im in coco["images"]}
    for a in coco["annotations"]:
        per[a["image_id"]].append(a)
    beelden = {im["id"]: np.asarray(Image.open(uit / "train" / im["file_name"]).convert("RGB")).astype(int) for im in coco["images"]}
    return coco, namen, per, beelden


def afwijkend(arr, drempel=40):
    return np.abs(arr - GRIJS).max(axis=2) > drempel


def bedekt(vorm, annotaties, marge=8):
    m = np.zeros(vorm, bool)
    for a in annotaties:
        x, y, w, h = a["bbox"]
        m[max(0, int(y) - marge):int(y + h) + marge + 1, max(0, int(x) - marge):int(x + w) + marge + 1] = True
    return m


def overlap(a, b):
    w = min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0])
    h = min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1])
    return max(0, w) * max(0, h)


@pytest.fixture
def gen():
    return importlib.import_module("generator")


def test_cap04_varianten_kleur_zwartwit_lijn_negatief(gen):
    logo = schijf()
    v = gen.varianten(logo)
    assert set(v) == {"kleur", "zwartwit", "lijn", "negatief"} and all(im.size == logo.size for im in v.values())
    plat = {k: np.asarray(op_wit(im).convert("L")).astype(int) for k, im in v.items()}
    assert len({p.tobytes() for p in plat.values()}) == 4
    zw = v["zwartwit"].convert("RGBA")
    assert len(np.unique(np.asarray(zw.convert("L"))[np.asarray(zw)[:, :, 3] > 0])) <= 2
    inkt = {k: int((p < 200).sum()) for k, p in plat.items()}
    assert inkt["lijn"] < 0.6 * inkt["kleur"]  # omtrek in plaats van vlak
    vorm = (np.asarray(logo)[:, :, 3] > 0) & (np.asarray(logo.convert("L")) < 128)  # de groene schijf
    assert plat["negatief"][vorm].mean() > plat["kleur"][vorm].mean() + 50  # wit op donker


def test_cap04_coco_elk_geplakt_exemplaar_gelabeld_en_niet_overlappend(gen, tmp_path):
    uit = tmp_path / "gen"
    manifest = gen.genereer([achtergrond()], logos(), [], TRAIN_GTINS, n_tegels=20, seed=1, uit=uit, tegel=TEGEL)
    coco, namen, per, beelden = lees(uit)
    assert len(coco["images"]) == 20 and set(namen.values()) <= KLASSEN
    for iid, arr in beelden.items():
        assert arr.shape[:2] == (TEGEL, TEGEL) and len(per[iid]) <= 3
        for a in per[iid]:
            x, y, w, h = a["bbox"]
            assert w > 0 and h > 0 and x >= 0 and y >= 0 and x + w <= TEGEL + 0.5 and y + h <= TEGEL + 0.5
            assert namen[a["category_id"]] in {"GREEN_DOT", "EU_ORGANIC_FARMING"}
        for a, b in itertools.combinations(per[iid], 2):
            assert overlap(a["bbox"], b["bbox"]) == 0
        assert not (afwijkend(arr) & ~bedekt(arr.shape[:2], per[iid])).any()  # niets geplakt zonder label
    tekst = json.dumps(manifest, default=str)
    assert all(v in tekst for v in ("kleur", "zwartwit", "lijn", "negatief"))


def test_cap04_lege_tegels_tussen_0_en_10_procent(gen, tmp_path):
    for fractie, n, max_leeg in ((0.0, 20, 0), (0.1, 20, 2), (0.05, 40, 4)):
        uit = tmp_path / f"leeg-{fractie}"
        gen.genereer([achtergrond()], logos(), [], TRAIN_GTINS, n_tegels=n, seed=2, uit=uit, tegel=TEGEL, leeg_fractie=fractie)
        _, _, per, beelden = lees(uit)
        leeg = {iid for iid, arr in beelden.items() if not afwijkend(arr).any()}
        assert len(leeg) <= max_leeg
        assert all(per[iid] == [] for iid in leeg)
        assert all(1 <= len(per[iid]) <= 3 for iid in set(beelden) - leeg)
    with pytest.raises(ValueError):
        gen.genereer([achtergrond()], logos(), [], TRAIN_GTINS, n_tegels=5, seed=2, uit=tmp_path / "te-veel", tegel=TEGEL, leeg_fractie=0.2)


def test_cap04_gelijkende_keurmerken_worden_geplakt_maar_nooit_gelabeld(gen, tmp_path):
    gelijkend = [{"beeld": balk(), "gtin": None}, {"beeld": balk(), "gtin": "10000000000031"}]
    uit = tmp_path / "gelijkend"
    gen.genereer([achtergrond()], {"GREEN_DOT": [{"beeld": schijf(), "gtin": None}]}, gelijkend, TRAIN_GTINS,
                 n_tegels=30, seed=3, uit=uit, tegel=TEGEL)
    coco, namen, per, beelden = lees(uit)
    assert {namen[a["category_id"]] for a in coco["annotations"]} == {"GREEN_DOT"}
    assert all(max(a["bbox"][2:]) / min(a["bbox"][2:]) < 2.0 for a in coco["annotations"])  # een balk (4:1) is nooit gelabeld
    onbedekt = sum(int((afwijkend(arr) & ~bedekt(arr.shape[:2], per[iid])).sum()) for iid, arr in beelden.items())
    assert onbedekt > 0  # de balken staan er wel, ongelabeld


@pytest.mark.parametrize("waar", ["achtergrond", "logo", "gelijkend"])
def test_cap04_elke_bron_met_gtin_hoort_bij_een_trainingsleverancier(gen, tmp_path, waar):
    vreemd = "10000000000999"  # GTIN van een toetsleverancier
    ag = [achtergrond(gtin=vreemd if waar == "achtergrond" else "10000000000017")]
    lg = {"GREEN_DOT": [{"beeld": schijf(), "gtin": vreemd if waar == "logo" else None}]}
    gl = [{"beeld": balk(), "gtin": vreemd if waar == "gelijkend" else None}]
    with pytest.raises(ValueError):
        gen.genereer(ag, lg, gl, TRAIN_GTINS, n_tegels=4, seed=1, uit=tmp_path / "x", tegel=TEGEL)


def test_cap04_achtergrond_met_gemeld_keurmerk_valt_af(gen, tmp_path):
    goed = achtergrond(meldingen=set())
    fout = achtergrond(kleur=(0, 0, 255), gtin="10000000000031", meldingen={"GREEN_DOT"})
    uit = tmp_path / "screening"
    gen.genereer([fout, goed], logos(), [], TRAIN_GTINS, n_tegels=12, seed=4, uit=uit, tegel=TEGEL)
    _, _, _, beelden = lees(uit)
    for arr in beelden.values():
        blauw = (arr[:, :, 2] > 200) & (arr[:, :, 0] < 60) & (arr[:, :, 1] < 60)
        assert blauw.mean() < 0.01


def test_cap04_vaste_seed_geeft_identieke_uitvoer_en_manifest_met_sha256(gen, tmp_path):
    manifesten = {}
    for naam, seed in (("a", 5), ("b", 5), ("c", 6)):
        manifesten[naam] = gen.genereer([achtergrond()], logos(), [{"beeld": balk(), "gtin": None}], TRAIN_GTINS,
                                        n_tegels=10, seed=seed, uit=tmp_path / naam, tegel=TEGEL)

    def inhoud(naam):
        m = tmp_path / naam / "train"
        return {p.relative_to(m).as_posix(): p.read_bytes() for p in sorted(m.rglob("*")) if p.is_file()}

    assert inhoud("a") == inhoud("b")
    assert inhoud("a") != inhoud("c")
    tekst = json.dumps(manifesten["a"], default=str)
    beelden = [b for n, b in inhoud("a").items() if not n.endswith(".json")]
    assert len(beelden) == 10 and all(hashlib.sha256(b).hexdigest() in tekst for b in beelden)


def test_cap04_schrijft_niet_binnen_een_git_werkboom(gen, tmp_path):
    beelden = importlib.import_module("beelden")
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    with pytest.raises(beelden.BinnenRepo):
        gen.genereer([achtergrond()], logos(), [], TRAIN_GTINS, n_tegels=2, seed=1, uit=repo / "gen", tegel=TEGEL)
    assert not (repo / "gen").exists()
