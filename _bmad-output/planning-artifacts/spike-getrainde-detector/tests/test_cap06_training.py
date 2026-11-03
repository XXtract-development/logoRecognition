"""ATDD CAP-6 training van de detector (trainingsset-en-herkenning §5; contract `train.py`, `herken.laad_model`/`voorspel`).
Rode fase: `train` bestaat nog niet. Configuratietests zonder rfdetr; de rooktest (`zwaar`) importeert eerst `train` en slaat
pas daarna over als `rfdetr` ontbreekt (uv sync --group detector). Verzonnen mini-COCO-set in tmp_path."""
import hashlib
import importlib
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from PIL import Image, ImageDraw


@pytest.fixture
def tr():
    return importlib.import_module("train")


def test_cap06_maten_n_s_m_l(tr):
    assert tr.MATEN == {"N": "RFDETRNano", "S": "RFDETRSmall", "M": "RFDETRMedium", "L": "RFDETRLarge"}


@pytest.mark.parametrize("fase", ["nagemaakt", "echt"])
def test_cap06_configuratie_legt_fase_maat_seed_epochs_en_mappen_vast(tr, tmp_path, fase):
    besluit = "besluit Friso 2026-11-08 (verzonnen)"  # maat S alleen met besluitverwijzing (besluit Friso 01-11-2026)
    cfg = tr.config(fase, "S", tmp_path / "dataset", tmp_path / "modellen", epochs=12, seed=20261031, besluit=besluit)
    assert (cfg["fase"], cfg["maat"], cfg["epochs"], cfg["seed"], cfg["besluit"]) == (fase, "S", 12, 20261031, besluit)
    tekst = json.dumps(cfg, default=str)
    assert "RFDETRSmall" in tekst and str(tmp_path / "dataset") in tekst and str(tmp_path / "modellen") in tekst
    assert tr.config(fase, "S", tmp_path / "dataset", tmp_path / "modellen", epochs=12, seed=20261031, besluit=besluit) == cfg


@pytest.mark.parametrize("fase,maat", [("nagemaakt", "XL"), ("nagemaakt", "s"), ("toets", "S"), ("", "N")])
def test_cap06_andere_maat_of_fase_is_een_fout(tr, tmp_path, fase, maat):
    with pytest.raises(ValueError):
        tr.config(fase, maat, tmp_path / "dataset", tmp_path / "modellen", epochs=1, seed=1)


def test_cap06_uitvoermap_binnen_een_git_werkboom_wordt_geweigerd(tr, tmp_path):
    beelden = importlib.import_module("beelden")
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    with pytest.raises(beelden.BinnenRepo):
        tr.config("nagemaakt", "N", tmp_path / "dataset", repo / "modellen", epochs=1, seed=1)


def mini_coco(map_, n=2, maat=320):
    """train/valid/test met elk n beelden en één vakje van klasse GREEN_DOT; categorieën = de 13 klassen (ronde 5: `train`
    weigert een set met andere categorieën)."""
    tr = importlib.import_module("train")
    for split in ("train", "valid", "test"):
        d = map_ / split
        d.mkdir(parents=True)
        images, annotations = [], []
        for i in range(n):
            im = Image.new("RGB", (maat, maat), (210, 210, 210))
            ImageDraw.Draw(im).ellipse((100, 100, 180, 180), fill=(0, 110, 40))
            im.save(d / f"t{i}.jpg", quality=92)
            images.append({"id": i, "file_name": f"t{i}.jpg", "width": maat, "height": maat})
            annotations.append({"id": i, "image_id": i, "category_id": tr.KLASSEN.index("GREEN_DOT") + 1,
                                "bbox": [100, 100, 80, 80], "area": 6400, "iscrowd": 0})
        coco = {"images": images, "annotations": annotations, "categories": tr.CATEGORIEEN}
        (d / "_annotations.coco.json").write_text(json.dumps(coco))


@pytest.mark.zwaar
def test_cap06_rooktest_paar_iteraties_geeft_laadbaar_checkpoint_met_herkomst(tr, tmp_path):
    hk = importlib.import_module("herken")
    pytest.importorskip("rfdetr")
    mini_coco(tmp_path / "dataset")
    cfg = tr.config("nagemaakt", "N", tmp_path / "dataset", tmp_path / "modellen", epochs=1, seed=7)
    uit = tr.train(cfg)
    ckpt = Path(uit["checkpoint"])
    assert ckpt.exists() and str(ckpt).startswith(str(tmp_path / "modellen"))
    assert uit["sha256"] == hashlib.sha256(ckpt.read_bytes()).hexdigest()
    assert uit["seed"] == 7 and Path(uit["log"]).exists()
    tekst = json.dumps(uit, default=str)
    assert "Apache-2.0" in tekst  # licentie van de voorgetrainde gewichten
    model = hk.laad_model(ckpt, "N")
    tegel = Image.new("RGB", (320, 320), (210, 210, 210))
    ImageDraw.Draw(tegel).ellipse((100, 100, 180, 180), fill=(0, 110, 40))
    kandidaten = hk.voorspel(model, tegel, drempel=0.0)
    assert isinstance(kandidaten, list)
    assert all({"code", "box", "score"} <= set(x) and 0.0 <= x["score"] <= 1.0 and len(x["box"]) == 4 for x in kandidaten)
    assert {x["code"] for x in kandidaten} <= set(tr.KLASSEN)  # alleen klassen uit de trainingsset (de 13 categorieën)


@pytest.mark.zwaar
def test_cap06_snelheidsmeting_geeft_seconden_per_iteratie_en_verwachte_duur(tr, tmp_path):
    pytest.importorskip("rfdetr")
    mini_coco(tmp_path / "dataset")
    meting = tr.snelheid("N", tmp_path / "dataset", tmp_path / "snelheid", iteraties=2)
    assert meting["s_per_iteratie"] > 0 and meting["verwacht_uur"] > 0


@pytest.mark.zwaar
def test_cap06_rooktest_hervatten_sigterm_midden_in_epoch_2_via_nacht(tr, tmp_path, monkeypatch):
    """CAP-6/CAP-18 (bouw ronde 9): drie epochs; `nacht.draai` stuurt SIGTERM midden in epoch 2 (het einde van de run, start + 9 uur), de volgende
    nacht hervat hij vanaf `checkpoint_0.ckpt` (het eerste epoch) tot `train-resultaat.json`. Echte rfdetr op MPS/CPU,
    echt proces. De klok is de echte klok (dezelfde als de bestandstijden); venster en einde van de run zijn vastgezet
    (spec-rooktest-klok-20261103): het venster is altijd open en het einde ligt 9 uur na de start."""
    import time as _t
    import zipfile
    from datetime import timedelta

    pytest.importorskip("rfdetr")
    nacht = importlib.import_module("nacht")
    mini_coco(tmp_path / "dataset", n=40)  # ±10 iteraties per epoch: lang genoeg om midden in een epoch te stoppen
    uit = tmp_path / "modellen" / "N-1"
    opdracht = [sys.executable, "train.py", "train", "--fase", "nagemaakt", "--maat", "N", "--dataset",
                str(tmp_path / "dataset"), "--uit", str(uit), "--epochs", "3", "--seed", "7"]
    nacht.plan(uit, opdracht, 3, "nagemaakt")
    eerste = uit / "checkpoint_0.ckpt"

    monkeypatch.setattr(nacht, "in_venster", lambda t: True)  # het venster is geen onderwerp van deze test
    monkeypatch.setattr(nacht, "einde", lambda t: t + timedelta(hours=9))  # het einde van de run: 9 uur na de start
    stop = {}

    def nacht1():  # de stop valt 2 s nadat het eerste epoch zijn checkpoint schreef, dus midden in epoch 2
        if "t" not in stop and eerste.exists() and zipfile.is_zipfile(eerste):
            stop["t"] = _t.monotonic() + 2
        if "t" in stop and _t.monotonic() >= stop["t"]:
            return datetime.now() + timedelta(hours=9)  # na het einde van de run: de stop
        return datetime.now()  # de echte klok, dezelfde als de bestandstijden

    assert nacht.draai(uit, nu=nacht1, poll_s=0.5) == "gepauzeerd"
    assert zipfile.is_zipfile(eerste) and not (uit / "checkpoint_1.ckpt").exists()  # epoch 2 ging verloren, niet meer
    assert not (uit / "train-resultaat.json").exists()
    s = nacht.status(uit, datetime.now())
    assert (s["uitkomst"], s["epochs_klaar"], s["stoppunt_1"]) == ("gepauzeerd", 1, None)

    gestart = []

    def popen(cmd, *a, **kw):
        gestart.append([str(c) for c in cmd])
        return subprocess.Popen(cmd, *a, **kw)

    assert nacht.draai(uit, nu=datetime.now, popen=popen, poll_s=0.5) == "afgerond"
    assert gestart[0] == opdracht + ["--hervat", str(eerste)]
    resultaat = json.loads((uit / "train-resultaat.json").read_text())
    assert resultaat["config"]["hervat"] == str(eerste) and Path(resultaat["checkpoint"]).exists()
    assert sorted(p.name for p in uit.glob("checkpoint_*.ckpt")) == ["checkpoint_1.ckpt", "checkpoint_2.ckpt"]
    assert nacht.status(uit, datetime.now())["epochs_klaar"] == 3


# --- negatieve controle: de planner vangt een échte te lange epoch af (spec-rooktest-klok-20261103) -----------------
# De echte klok van de bestanden en de echte starttijd van draai() zijn hier dezelfde klok. Het venster is open gezet
# (dat is geen onderwerp van deze controle). Het trainingsproces is een stub die checkpoints met vaste bestandstijden
# schrijft en daarna met 0 eindigt; geen rfdetr, geen training.

class _Klaar:
    pid = 4242

    def poll(self):
        return 0

    def wait(self, timeout=None):
        return 0

    def terminate(self):
        pass

    def kill(self):
        pass


def _epoch_stub(uit, bestandstijden):
    def popen(cmd, *a, **kw):
        if cmd and cmd[0] == "caffeinate":
            return _Klaar()
        for n, t in enumerate(bestandstijden):
            pad = uit / f"checkpoint_{n}.ckpt"
            pad.write_bytes(b"x")
            os.utime(pad, (t, t))
        (uit / "train-resultaat.json").write_text("{}")
        return _Klaar()
    return popen


def _nacht_met_echte_klok(tmp_path, monkeypatch):
    import nacht

    monkeypatch.setattr(nacht, "in_venster", lambda t: True)
    monkeypatch.setattr(nacht, "einde", lambda t: t + timedelta(hours=9))  # eind na de start, ook overdag
    uit = tmp_path / "modellen" / "N-1"
    nacht.plan(uit, [sys.executable, "train.py"], 2, "nagemaakt")
    start = datetime.now().replace(microsecond=0)  # hele seconden: geen floatafrondingen in de grens
    return nacht, uit, start


def test_cap06_negatief_epoch_van_10_uur_geeft_stoppunt_met_echte_klok(tmp_path, monkeypatch):
    # Given: een run met echte klok waarvan het checkpoint 10 uur na de start is weggeschreven
    nacht, uit, start = _nacht_met_echte_klok(tmp_path, monkeypatch)
    # When: de run eindigt
    uitkomst = nacht.draai(uit, nu=lambda: start, popen=_epoch_stub(uit, [start.timestamp() + 10 * 3600]),
                           slaap=lambda s: None, poll_s=0)
    # Then: de run is afgerond, maar de planner zet een stoppunt op de te lange epoch
    assert uitkomst == "afgerond"
    assert nacht.status(uit, start)["stoppunt_1"] == f"een epoch duurde langer dan {nacht.MAX_EPOCH_S / 3600:.1f} uur"


@pytest.mark.parametrize("na_grens_s, stoppunt", [(0, False), (1, True)])
def test_cap06_grens_9_5_uur_precies_geen_stoppunt_plus_1_seconde_wel(tmp_path, monkeypatch, na_grens_s, stoppunt):
    # Given: een checkpoint precies 9,5 uur na de start, of 1 seconde langer
    nacht, uit, start = _nacht_met_echte_klok(tmp_path, monkeypatch)
    tijd = start.timestamp() + nacht.MAX_EPOCH_S + na_grens_s
    # When: de run eindigt
    nacht.draai(uit, nu=lambda: start, popen=_epoch_stub(uit, [tijd]), slaap=lambda s: None, poll_s=0)
    # Then: alleen boven de grens komt er een stoppunt, en dat stoppunt is de epochreden (niet een andere regel)
    reden = nacht.status(uit, start)["stoppunt_1"]
    assert reden == (f"een epoch duurde langer dan {nacht.MAX_EPOCH_S / 3600:.1f} uur" if stoppunt else None)
    assert nacht._staat(uit)["epoch_s"] == [pytest.approx(nacht.MAX_EPOCH_S + na_grens_s)]  # de epoch is wel gemeten


def test_cap06_negatief_tweede_epoch_van_10_uur_geeft_stoppunt(tmp_path, monkeypatch):
    # Given: een eerste epoch van 1 uur en een tweede van 10 uur (het pad van een latere epoch)
    nacht, uit, start = _nacht_met_echte_klok(tmp_path, monkeypatch)
    tijden = [start.timestamp() + 3600, start.timestamp() + 3600 + 10 * 3600]
    # When: de run eindigt
    nacht.draai(uit, nu=lambda: start, popen=_epoch_stub(uit, tijden), slaap=lambda s: None, poll_s=0)
    # Then: de planner ziet de tweede epoch als te lang
    assert nacht.status(uit, start)["stoppunt_1"] == f"een epoch duurde langer dan {nacht.MAX_EPOCH_S / 3600:.1f} uur"


def test_cap06_negatief_lange_epoch_gevolgd_door_een_korte_geeft_nog_stoppunt(tmp_path, monkeypatch):
    # Given: een eerste epoch van 10 uur en daarna een epoch van 1 uur in dezelfde run
    nacht, uit, start = _nacht_met_echte_klok(tmp_path, monkeypatch)
    tijden = [start.timestamp() + 10 * 3600, start.timestamp() + 11 * 3600]
    # When: de run eindigt
    nacht.draai(uit, nu=lambda: start, popen=_epoch_stub(uit, tijden), slaap=lambda s: None, poll_s=0)
    # Then: de lange epoch telt nog, ook al volgt er een korte (de check kijkt naar alle epochs van de run)
    assert nacht.status(uit, start)["stoppunt_1"] == f"een epoch duurde langer dan {nacht.MAX_EPOCH_S / 3600:.1f} uur"
