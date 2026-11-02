"""ATDD CAP-6 training van de detector (trainingsset-en-herkenning §5; contract `train.py`, `herken.laad_model`/`voorspel`).
Rode fase: `train` bestaat nog niet. Configuratietests zonder rfdetr; de rooktest (`zwaar`) importeert eerst `train` en slaat
pas daarna over als `rfdetr` ontbreekt (uv sync --group detector). Verzonnen mini-COCO-set in tmp_path."""
import hashlib
import importlib
import json
import subprocess
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
def test_cap06_rooktest_hervatten_sigterm_midden_in_epoch_2_via_nacht(tr, tmp_path):
    """CAP-6/CAP-18 (bouw ronde 9): drie epochs; `nacht.draai` stuurt om "07:30" SIGTERM midden in epoch 2, de volgende
    nacht hervat hij vanaf `checkpoint_0.ckpt` (het eerste epoch) tot `train-resultaat.json`. Echte rfdetr op MPS/CPU,
    echt proces; alleen de klok is nagebootst (het venster loopt op de echte tijd vanaf 22:00)."""
    import sys
    import time as _t
    import zipfile
    from datetime import datetime, timedelta

    pytest.importorskip("rfdetr")
    nacht = importlib.import_module("nacht")
    mini_coco(tmp_path / "dataset", n=40)  # ±10 iteraties per epoch: lang genoeg om midden in een epoch te stoppen
    uit = tmp_path / "modellen" / "N-1"
    opdracht = [sys.executable, "train.py", "train", "--fase", "nagemaakt", "--maat", "N", "--dataset",
                str(tmp_path / "dataset"), "--uit", str(uit), "--epochs", "3", "--seed", "7"]
    nacht.plan(uit, opdracht, 3, "nagemaakt")
    eerste = uit / "checkpoint_0.ckpt"

    t0, stop = _t.monotonic(), {}

    def nacht1():  # 07:30 valt 2 s nadat het eerste epoch zijn checkpoint schreef, dus midden in epoch 2
        if "t" not in stop and eerste.exists() and zipfile.is_zipfile(eerste):
            stop["t"] = _t.monotonic() + 2
        if "t" in stop and _t.monotonic() >= stop["t"]:
            return datetime(2026, 11, 3, 7, 30)
        return datetime(2026, 11, 2, 22, 0) + timedelta(seconds=_t.monotonic() - t0)

    assert nacht.draai(uit, nu=nacht1, poll_s=0.5) == "gepauzeerd"
    assert zipfile.is_zipfile(eerste) and not (uit / "checkpoint_1.ckpt").exists()  # epoch 2 ging verloren, niet meer
    assert not (uit / "train-resultaat.json").exists()
    s = nacht.status(uit, datetime(2026, 11, 3, 8, 0))
    assert (s["uitkomst"], s["epochs_klaar"], s["stoppunt_1"]) == ("gepauzeerd", 1, None)

    gestart, t1 = [], _t.monotonic()

    def popen(cmd, *a, **kw):
        gestart.append([str(c) for c in cmd])
        return subprocess.Popen(cmd, *a, **kw)

    nacht2 = lambda: datetime(2026, 11, 3, 22, 0) + timedelta(seconds=_t.monotonic() - t1)  # noqa: E731
    assert nacht.draai(uit, nu=nacht2, popen=popen, poll_s=0.5) == "afgerond"
    assert gestart[0] == opdracht + ["--hervat", str(eerste)]
    resultaat = json.loads((uit / "train-resultaat.json").read_text())
    assert resultaat["config"]["hervat"] == str(eerste) and Path(resultaat["checkpoint"]).exists()
    assert sorted(p.name for p in uit.glob("checkpoint_*.ckpt")) == ["checkpoint_1.ckpt", "checkpoint_2.ckpt"]
    assert nacht.status(uit, datetime(2026, 11, 4, 8, 0))["epochs_klaar"] == 3
