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
    cfg = tr.config(fase, "S", tmp_path / "dataset", tmp_path / "modellen", epochs=12, seed=20261031)
    assert (cfg["fase"], cfg["maat"], cfg["epochs"], cfg["seed"]) == (fase, "S", 12, 20261031)
    tekst = json.dumps(cfg, default=str)
    assert "RFDETRSmall" in tekst and str(tmp_path / "dataset") in tekst and str(tmp_path / "modellen") in tekst
    assert tr.config(fase, "S", tmp_path / "dataset", tmp_path / "modellen", epochs=12, seed=20261031) == cfg


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
    """train/valid/test met elk n beelden en één vakje van klasse GREEN_DOT."""
    for split in ("train", "valid", "test"):
        d = map_ / split
        d.mkdir(parents=True)
        images, annotations = [], []
        for i in range(n):
            im = Image.new("RGB", (maat, maat), (210, 210, 210))
            ImageDraw.Draw(im).ellipse((100, 100, 180, 180), fill=(0, 110, 40))
            im.save(d / f"t{i}.jpg", quality=92)
            images.append({"id": i, "file_name": f"t{i}.jpg", "width": maat, "height": maat})
            annotations.append({"id": i, "image_id": i, "category_id": 1, "bbox": [100, 100, 80, 80], "area": 6400, "iscrowd": 0})
        coco = {"images": images, "annotations": annotations, "categories": [{"id": 1, "name": "GREEN_DOT", "supercategory": "keurmerk"}]}
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
    assert {x["code"] for x in kandidaten} <= {"GREEN_DOT"}  # alleen klassen uit de trainingsset


@pytest.mark.zwaar
def test_cap06_snelheidsmeting_geeft_seconden_per_iteratie_en_verwachte_duur(tr, tmp_path):
    pytest.importorskip("rfdetr")
    mini_coco(tmp_path / "dataset")
    meting = tr.snelheid("N", tmp_path / "dataset", tmp_path / "snelheid", iteraties=2)
    assert meting["s_per_iteratie"] > 0 and meting["verwacht_uur"] > 0
