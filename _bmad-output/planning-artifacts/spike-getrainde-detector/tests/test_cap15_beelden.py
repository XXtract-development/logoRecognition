"""ATDD CAP-15 beelden ophalen en bouwen (toetsset §1, §3; regels van ~/logo-meetset-20261018/bouw.py; contract `beelden.py`).
Rode fase: `beelden` bestaat nog niet. Netwerkstappen alleen als opdracht of via een nagebootste uitvoerder; kleine
verzonnen beelden in tmp_path. Vastgelegd: ongeldige GLN/GTIN/doelmarkt in de ophaalquery is een ValueError."""
import importlib
import re
import subprocess
from pathlib import Path

import hashlib
import math

import numpy as np
import pytest
from PIL import Image

HIER = Path(__file__).resolve().parents[1]
PAREN = [("1000000000001", "10000000000017"), ("1000000000002", "10000000000024")]
SCHRIJVEND = r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|GRANT|REVOKE|RENAME|LOAD|CALL|HANDLER|LOCK|SET)\b"


@pytest.fixture
def bl():
    return importlib.import_module("beelden")


@pytest.fixture
def repo(tmp_path):
    r = tmp_path / "repo"
    r.mkdir()
    subprocess.run(["git", "init", "-q", str(r)], check=True)
    return r


def test_cap15_doel_buiten_een_git_werkboom_mag(bl, tmp_path):
    doel = tmp_path / "buiten" / "uitslag.json"
    assert Path(bl.veilig_doel(doel)).resolve() == doel.resolve()


@pytest.mark.parametrize("deel", ["nieuw/diep/bestand.json", "bestand.json", ""])
def test_cap15_doel_in_een_git_werkboom_wordt_geweigerd_ook_als_het_nog_niet_bestaat(bl, repo, deel):
    with pytest.raises(bl.BinnenRepo):
        bl.veilig_doel(repo / deel)


def test_cap15_doel_in_deze_repository_wordt_geweigerd(bl):
    with pytest.raises(bl.BinnenRepo):
        bl.veilig_doel(HIER / "toets" / "uitslag.json")
    assert issubclass(bl.BinnenRepo, Exception)


def test_cap15_ophaalquery_is_alleen_een_select(bl):
    q = bl.ophaalquery(PAREN)
    zonder_slot = q.strip().rstrip(";")
    assert re.match(r"^\s*SELECT\b", q, re.I) and ";" not in zonder_slot
    assert not re.search(SCHRIJVEND, q, re.I) and "INTO OUTFILE" not in q.upper() and "INTO DUMPFILE" not in q.upper()
    assert "xxtractdbmedia.media" in q and "xxtractdbmedia.converted" in q


def test_cap15_ophaalquery_zoals_de_pijplijn(bl):
    q = bl.ophaalquery(PAREN, doelmarkt="056")
    assert all(gln in q and gtin in q for gln, gtin in PAREN)
    assert "'056'" in q and "'528'" not in q
    assert re.search(r"active\s*=\s*'1'", q) and re.search(r"storageType\s*=\s*'nas'", q)
    assert "'528'" in bl.ophaalquery(PAREN)


@pytest.mark.parametrize("paren,doelmarkt", [
    ([("1000000000001", "1'); DROP TABLE media; --")], "528"),
    ([("1000000000001'", "10000000000017")], "528"),
    ([("1000000000001", "10000000000017")], "528' OR '1'='1"),
])
def test_cap15_ophaalquery_weigert_ongeldige_invoer(bl, paren, doelmarkt):
    with pytest.raises(ValueError):
        bl.ophaalquery(paren, doelmarkt=doelmarkt)


def waarde(cmd, optie):
    for i, a in enumerate(cmd):
        if a.startswith(optie + "="):
            return a.split("=", 1)[1]
        if a == optie:
            return cmd[i + 1]
    return None


def test_cap15_rsync_alleen_lezen_met_nice_en_files_from(bl, tmp_path):
    lijst, doel = tmp_path / "ophaal-paden.txt", tmp_path / "bron-raw"
    cmd = bl.rsync_opdracht(lijst, doel)
    assert isinstance(cmd, list) and all(isinstance(a, str) for a in cmd) and "rsync" in cmd[:3]
    assert "--rsync-path=nice -n 19 rsync" in cmd
    assert waarde(cmd, "--files-from") == str(lijst)
    assert "banana:/media/Xmedia/" in cmd and cmd[-1].rstrip("/") == str(doel).rstrip("/")
    assert not any(a.startswith(("--delete", "--remove")) or a in ("--del", "--force") for a in cmd)


def test_cap15_rsync_doel_in_een_git_werkboom_wordt_geweigerd(bl, tmp_path, repo):
    with pytest.raises(bl.BinnenRepo):
        bl.rsync_opdracht(tmp_path / "lijst.txt", repo / "bron-raw")


def opslaan(pad, im):
    im.save(pad)
    return pad


def test_cap15_lagen_onder_elkaar_op_wit_links_uitgelijnd(bl, tmp_path):
    a = opslaan(tmp_path / "a.png", Image.new("RGB", (100, 50), (255, 0, 0)))
    b = opslaan(tmp_path / "b.png", Image.new("RGB", (80, 30), (0, 0, 255)))
    uit = bl.samenvoegen([a, b])
    assert uit.mode == "RGB" and uit.size == (100, 80)
    assert uit.getpixel((5, 5)) == (255, 0, 0) and uit.getpixel((5, 60)) == (0, 0, 255)
    assert uit.getpixel((95, 60)) == (255, 255, 255)  # rechts naast de smallere laag: wit


def test_cap15_laag_boven_4096_px_eerst_verkleind_alfa_plat_op_wit(bl, tmp_path):
    breed = opslaan(tmp_path / "breed.png", Image.new("RGBA", (5000, 10), (255, 0, 0, 0)))  # volledig transparant rood
    uit = bl.samenvoegen([breed])
    assert uit.size[0] == 4096 and uit.size[1] in (8, 9)
    assert all(c >= 245 for c in uit.getpixel((2000, 3)))  # plat op wit, niet rood


def test_cap15_boven_250_megapixel_weigert(bl, tmp_path):
    breed = opslaan(tmp_path / "breed.png", Image.new("RGB", (4096, 1), "white"))
    hoog = opslaan(tmp_path / "hoog.png", Image.new("RGB", (1, 4096), "white"))
    with pytest.raises(bl.TeGroot):
        bl.samenvoegen([breed] + [hoog] * 15)  # 4096 x 61.441 = 251,7 MP


@pytest.mark.parametrize("mode,kleur,verwacht", [
    ("RGBA", (255, 0, 0, 0), (255, 255, 255)),
    ("RGBA", (0, 0, 255, 255), (0, 0, 255)),
    ("CMYK", (0, 0, 0, 0), (255, 255, 255)),
    ("CMYK", (0, 255, 255, 0), (255, 0, 0)),
    ("L", 128, (128, 128, 128)),
    ("RGB", (1, 2, 3), (1, 2, 3)),
])
def test_cap15_naar_rgb(bl, mode, kleur, verwacht):
    uit = bl.naar_rgb(Image.new(mode, (4, 4), kleur))
    assert uit.mode == "RGB" and uit.getpixel((1, 1)) == verwacht


def test_cap15_naar_rgb_halve_alfa_en_palet(bl):
    half = bl.naar_rgb(Image.new("RGBA", (4, 4), (0, 0, 0, 128))).getpixel((0, 0))
    assert all(abs(c - 127) <= 1 for c in half)
    p = Image.new("RGB", (4, 4), (10, 200, 30)).convert("P")
    assert bl.naar_rgb(p).mode == "RGB" and bl.naar_rgb(p).getpixel((0, 0)) == p.convert("RGB").getpixel((0, 0))


class NepPdftoppm:
    """Bootst `pdftoppm -r 150 -png <pdf> <voorvoegsel>` na: schrijft <voorvoegsel>-1.png en -2.png."""

    def __init__(self, pdf):
        self.pdf, self.calls = str(pdf), []

    def __call__(self, args):
        self.calls.append(list(args))
        voorvoegsel = Path(args[args.index(self.pdf) + 1])
        Image.new("RGB", (120, 170), (255, 0, 0)).save(f"{voorvoegsel}-1.png")
        Image.new("RGB", (120, 170), (0, 0, 255)).save(f"{voorvoegsel}-2.png")
        return b""


def test_cap15_pdf_paginas_via_pdftoppm_op_150_dpi(bl, tmp_path):
    pdf = tmp_path / "origineel.pdf"
    pdf.write_bytes(b"%PDF-1.4 verzonnen")
    uitvoerder = NepPdftoppm(pdf)
    paginas = bl.render_pdf(pdf, uitvoerder)
    assert len(uitvoerder.calls) == 1
    assert uitvoerder.calls[0][:4] == ["pdftoppm", "-r", "150", "-png"] and str(pdf) in uitvoerder.calls[0]
    assert [p.convert("RGB").getpixel((5, 5)) for p in paginas] == [(255, 0, 0), (0, 0, 255)]
    assert all(p.size == (120, 170) for p in paginas)


def test_cap15_ssh_met_nice_aan_de_serverkant(bl):
    assert bl.ssh_opdracht(["ls", "/media/Xmedia/1000000000001/PACKAGING_ARTWORK"]) == \
        ["ssh", "banana", "nice", "-n", "19", "ls", "/media/Xmedia/1000000000001/PACKAGING_ARTWORK"]
    assert bl.ssh_opdracht(["pdftotext", "-", "-"], host="replica-db")[:5] == ["ssh", "replica-db", "nice", "-n", "19"]


def test_cap15_grenzen_van_bouw_py(bl):
    assert (bl.MAX_ZIJDE, bl.MAX_LAAG_BYTES, bl.MAX_PNG_BYTES, bl.MAX_PIXELS) == (4096, 20 * 1024 * 1024, 10 * 1024 * 1024, 250_000_000)


def ruis(maat, alfa, seed=1):
    rgb = np.random.default_rng(seed).integers(0, 256, (maat[1], maat[0], 3), dtype=np.uint8)
    a = np.full((maat[1], maat[0], 1), alfa, dtype=np.uint8)
    return Image.fromarray(np.concatenate([rgb, a], axis=2), "RGBA")


def test_cap15_laag_groter_dan_20_mb_wordt_plat_op_wit_gezet(bl, tmp_path, monkeypatch):
    laag = opslaan(tmp_path / "laag.png", ruis((300, 200), alfa=0))  # transparante ruis, ~180 kB
    klein = np.asarray(bl.samenvoegen([laag])).astype(int)
    assert klein.mean() < 200  # onder de grens: zoals bouw.py alleen naar RGB, alfa valt weg zonder wit
    monkeypatch.setattr(bl, "MAX_LAAG_BYTES", 1000)
    groot = bl.samenvoegen([laag])
    assert groot.size == (300, 200) and np.asarray(groot).astype(int).mean() >= 245  # plat op wit (JPEG q85)


def test_cap15_laag_boven_max_zijde_verkleind_en_max_pixels(bl, tmp_path, monkeypatch):
    monkeypatch.setattr(bl, "MAX_ZIJDE", 100)
    laag = opslaan(tmp_path / "laag.png", Image.new("RGB", (300, 200), (0, 0, 255)))
    assert bl.samenvoegen([laag]).size in ((100, 66), (100, 67))
    monkeypatch.setattr(bl, "MAX_PIXELS", 10_000)
    a = opslaan(tmp_path / "a.png", Image.new("RGB", (100, 60), "white"))
    b = opslaan(tmp_path / "b.png", Image.new("RGB", (100, 50), "white"))
    with pytest.raises(bl.TeGroot):
        bl.samenvoegen([a, b])  # 100 x 110 = 11.000 > 10.000
    assert bl.samenvoegen([b]).size == (100, 50)  # 5.000 <= 10.000 mag


def test_cap15_opslaan_onder_de_grens_ongewijzigd(bl, tmp_path):
    pad = tmp_path / "gecombineerd" / "etiket.png"
    pad.parent.mkdir()
    m = bl.opslaan(Image.new("RGB", (120, 80), (200, 10, 10)), pad)
    assert (m["w"], m["h"], m["verkleind_procent"]) == (120, 80, None)
    assert m["bytes"] == pad.stat().st_size and m["sha256"] == hashlib.sha256(pad.read_bytes()).hexdigest()
    assert Image.open(pad).format == "PNG"


def test_cap15_opslaan_boven_max_png_bytes_verkleind_met_wortelfactor(bl, tmp_path, monkeypatch):
    monkeypatch.setattr(bl, "MAX_PNG_BYTES", 20_000)
    pad = tmp_path / "etiket.png"
    m = bl.opslaan(ruis((200, 200), alfa=255).convert("RGB"), pad)  # ~120 kB als PNG
    assert m["verkleind_procent"] is not None and 0 < m["verkleind_procent"] < 100
    assert (m["w"], m["h"]) == (round(200 * m["verkleind_procent"] / 100),) * 2
    assert Image.open(pad).size == (m["w"], m["h"])
    assert m["bytes"] == pad.stat().st_size and m["sha256"] == hashlib.sha256(pad.read_bytes()).hexdigest()
    assert m["verkleind_procent"] == pytest.approx(math.sqrt(20_000 / 120_000) * 100, rel=0.2)


def test_cap15_opslaan_weigert_binnen_een_git_werkboom(bl, repo):
    with pytest.raises(bl.BinnenRepo):
        bl.opslaan(Image.new("RGB", (4, 4)), repo / "etiket.png")
    assert not (repo / "etiket.png").exists()
