"""ATDD CAP-1 scheiding training/toets op leverancier (toetsset §1-§2; contract `scheiding.py`).
Rode fase: `scheiding` bestaat nog niet. Verzonnen GLN's/GTIN's met bekende uitkomst; de `lokaal`-test leest de echte
invoer (PROEF_MAP/invoer of de oorspronkelijke paden) en slaat alleen over als die ontbreekt."""
import importlib
import json
import os
import subprocess
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

RIJEN = (
    "EU_ORGANIC_FARMING", "GREEN_DOT", "RECYCLABLE_GENERAL_CLAIM", "NUTRISCORE_A", "NUTRISCORE_B", "NUTRISCORE_C",
    "PREGNANCY_WARNING", "MARINE_STEWARDSHIP_COUNCIL_LABEL", "WEIDEMELK", "VEGAN_SOCIETY_VEGAN_LOGO",
)
EU, GD = RIJEN[0], RIJEN[1]
GLN = {k: f"100000000000{i}" for i, k in enumerate("ABCDE", 1)}  # verzonnen leveranciers


def wereld(aantallen, uitgesloten_bij=None):
    """{rij: {letter: n}} -> (rijen met alle 10 rijen, uitgesloten GTIN's). Uitgesloten GTIN's tellen mee in de rij."""
    rijen, uit = {r: {} for r in RIJEN}, set()
    for bron, prefix in ((aantallen, "2"), (uitgesloten_bij or {}, "9")):
        for rij, per in bron.items():
            r = RIJEN.index(rij)
            for letter, n in per.items():
                gtins = {f"{prefix}{'ABCDE'.index(letter) + 1}{r}{i:011d}" for i in range(n)}
                rijen[rij].setdefault(GLN[letter], set()).update(gtins)
                uit |= gtins if prefix == "9" else set()
    return rijen, uit


@pytest.fixture
def sch():
    return importlib.import_module("scheiding")


def test_cap01_tien_rijen_in_vaste_volgorde(sch):
    assert tuple(sch.RIJEN) == RIJEN


def test_cap01_declaraties_lezen_codes_samengevoegd_ongeldige_regels_overgeslagen(sch, tmp_path):
    p = tmp_path / "declaraties.tsv"
    p.write_text(
        "doc_id\tt3777\tdieet\tnutriscore\tnutriprogramma\tnutricategorie\tghs\n"
        "1000000000001-10000000000017-528\tGREEN_DOT;EU_ORGANIC_FARMING\tPLANT_BASED\tB\t\t\t\n"
        "#gevonden\t\t\t\t\t\t\n"
        "1000000000002-10000000000024\tGREEN_DOT\t\t\t\t\t\n"
        "1000000000002-10000000000031-056\tWEIDEMELK\t\tA\t\t\t\n"
    )
    assert list(sch.lees_declaraties(p)) == [
        ("1000000000001-10000000000017-528", "1000000000001", "10000000000017",
         frozenset({"GREEN_DOT", "EU_ORGANIC_FARMING", "PLANT_BASED", "NUTRISCORE_B"})),
        ("1000000000002-10000000000031-056", "1000000000002", "10000000000031", frozenset({"WEIDEMELK", "NUTRISCORE_A"})),
    ]


def test_cap01_alcoholkandidaten_lezen(sch, tmp_path):
    p = tmp_path / "alcohol.tsv"
    p.write_text("1000000000003\t10000000000048\t10000263\tJenever X\n1000000000003\t10000000000055\t10000263\tWhisky Y\n")
    assert list(sch.lees_alcohol(p)) == [("1000000000003", "10000000000048"), ("1000000000003", "10000000000055")]


def test_cap01_gtins_uit_referentiepaden_en_training_data(sch):
    regels = [
        "artwork-crops/10000000000017/12_12_NUTRISCORE_C__1_4623_4629.png",
        "8fcd\tAGRICULTURE_BIOLOGIQUE\tartwork-crops/10000000000024/a.png\tartwork/10000000000031/b_converted.png\thuman",
        "artwork-crops/1000000000003/dertien-cijfers.png",
        "artwork/100000000000489/vijftien-cijfers.png",
        "10000000000055/zonder-schuine-streep-ervoor.png",
    ]
    assert sch.gtins_uit_paden(regels) == {"10000000000017", "10000000000024", "10000000000031"}


def test_cap01_rijen_per_leverancier_en_zwangerschap_uit_alcohol(sch):
    decl = [
        ("1000000000001-10000000000017-528", "1000000000001", "10000000000017", frozenset({"GREEN_DOT", "NUTRISCORE_B"})),
        ("1000000000002-10000000000031-528", "1000000000002", "10000000000031", frozenset({"NUTRISCORE_A", "PLANT_BASED"})),
        ("1000000000002-10000000000031-056", "1000000000002", "10000000000031", frozenset({"NUTRISCORE_A"})),
    ]
    rijen = sch.bouw_rijen(decl, [("1000000000003", "10000000000048"), ("1000000000003", "10000000000055")])
    assert set(rijen) == set(RIJEN) | {"NUTRISCORE_D", "NUTRISCORE_E", "EUROPEAN_V_LABEL_VEGAN"}  # ronde 5: 3 extra rijen
    assert dict(rijen["GREEN_DOT"]) == {"1000000000001": {"10000000000017"}}
    assert dict(rijen["NUTRISCORE_B"]) == {"1000000000001": {"10000000000017"}}
    assert dict(rijen["NUTRISCORE_A"]) == {"1000000000002": {"10000000000031"}}  # twee doelmarkten, één GTIN
    assert dict(rijen["PREGNANCY_WARNING"]) == {"1000000000003": {"10000000000048", "10000000000055"}}
    assert not rijen["MARINE_STEWARDSHIP_COUNCIL_LABEL"]


def test_cap01_uitputtende_zoektocht_wint_van_gulzige_keuze(sch):
    # Gulzig kiest eerst B (rij [4, 5]) en verbetert daarna niet meer; uitputtend vindt {A, D} met [4,5; 5,5].
    rijen, uit = wereld({EU: {"A": 1, "B": 9, "D": 7}, GD: {"A": 4, "B": 8, "C": 3, "D": 3}}, {EU: {"E": 1}})
    k = sch.kies(rijen, uit)
    assert k["trainingsleveranciers"] == [GLN["A"], GLN["D"]]
    assert k["score"] == [0.0] * 8 + [4.5, 5.5]
    assert (k["per_rij"][EU]["train"], k["per_rij"][EU]["toets"]) == (8, 9)
    assert (k["per_rij"][GD]["train"], k["per_rij"][GD]["toets"]) == (7, 11)


def test_cap01_geen_leverancier_aan_beide_kanten(sch):
    rijen, uit = wereld({EU: {"A": 1, "B": 9, "D": 7}, GD: {"A": 4, "B": 8, "C": 3, "D": 3}}, {EU: {"E": 1}})
    k = sch.kies(rijen, uit)
    gd = k["per_rij"][GD]
    assert (gd["train_glns"], gd["toets_glns"]) == (2, 2)  # A, D tegenover B, C
    assert (k["per_rij"][EU]["train_glns"], k["per_rij"][EU]["toets_glns"]) == (2, 1)  # E heeft alleen een uitgesloten GTIN
    for rij in RIJEN:
        assert k["per_rij"][rij]["train_glns"] + k["per_rij"][rij]["toets_glns"] <= len(rijen[rij])
    assert set(k["trainingsleveranciers"]) <= {GLN["A"], GLN["B"], GLN["C"], GLN["D"]}


def test_cap01_referentie_training_data_en_fase_b_gtins_nooit_in_de_toets(sch):
    rijen, _ = wereld({EU: {"A": 8, "B": 6, "C": 2}})
    ref_gtin, td_gtin, fase_b_gtin = "93200000000001", "93200000000002", "93200000000003"
    rijen[EU][GLN["C"]] |= {ref_gtin, fase_b_gtin}  # C: 4 GTIN's, waarvan 2 uitgesloten
    regels = [f"artwork-crops/{ref_gtin}/x.png", f"id\tCODE\tartwork-crops/{td_gtin}/y.png\tartwork/{td_gtin}/z.png\thuman"]
    fase_b_doc = f"{GLN['C']}-{fase_b_gtin}-528"  # doc uit de fase-B-meetset
    uitgesloten = sch.gtins_uit_paden(regels) | {fase_b_doc.split("-")[1]}
    k = sch.kies(rijen, uitgesloten)
    assert k["trainingsleveranciers"] == [GLN["B"]]
    assert (k["per_rij"][EU]["train"], k["per_rij"][EU]["toets"]) == (6, 10)  # 8 van A + 2 van C, zonder de 2 uitgesloten
    assert k["per_rij"][EU]["toets_glns"] == 2
    assert k["uitgesloten_gtins"] == 2  # td_gtin staat in geen enkele rij en telt niet


def test_cap01_nul_uitgesloten_gtins_is_een_fout(sch):
    rijen, _ = wereld({EU: {"A": 5, "B": 5}})
    with pytest.raises(ValueError):
        sch.kies(rijen, set())
    with pytest.raises(ValueError):
        sch.kies(rijen, {"99999999999999"})  # uitgesloten, maar komt in geen rij voor


def test_cap01_zelfde_invoer_geeft_dezelfde_indeling_ook_in_andere_volgorde(sch):
    rijen, uit = wereld({EU: {"A": 1, "B": 9, "D": 7}, GD: {"A": 4, "B": 8, "C": 3, "D": 3}}, {EU: {"E": 1}})
    omgekeerd = {r: dict(reversed(list(rijen[r].items()))) for r in reversed(RIJEN)}
    eerste = sch.kies(rijen, uit)
    assert sch.kies(rijen, uit) == eerste
    assert sch.kies(omgekeerd, set(sorted(uit))) == eerste


def test_cap01_gelijkspel_kleinste_verzameling_wint_ook_boven_lagere_glns(sch):
    # {B} en {A, C} geven allebei [3,5; 4]; de kleinste verzameling wint, ook al is (A, C) lexicografisch lager.
    rijen, uit = wereld({EU: {"A": 1, "B": 6, "C": 5, "D": 1}, GD: {"A": 5, "B": 5, "D": 3}}, {EU: {"E": 1}})
    k = sch.kies(rijen, uit)
    assert k["trainingsleveranciers"] == [GLN["B"]]
    assert k["score"] == [0.0] * 8 + [3.5, 4.0]


def test_cap01_gelijkspel_daarna_laagste_gesorteerde_gln_rij(sch):
    rijen, uit = wereld({EU: {"A": 5, "B": 5}}, {EU: {"E": 1}})
    k = sch.kies(rijen, uit)
    assert k["trainingsleveranciers"] == [GLN["A"]]
    assert k["score"] == [0.0] * 9 + [2.5]


def verloop(omgekeerd=False, maat=(90, 80), helderder=0):
    x = np.linspace(0, 255, maat[0])[None, :].repeat(maat[1], 0)
    x = 255 - x if omgekeerd else x
    return Image.fromarray(np.clip(x + helderder, 0, 255).astype(np.uint8), "L").convert("RGB")


def test_cap01_dhash_is_64_bit_en_deterministisch(sch):
    h = sch.dhash(verloop())
    assert isinstance(h, int) and 0 <= h < 2**64
    assert sch.dhash(verloop()) == h


def test_cap01_dhash_gelijkend_dichtbij_tegengesteld_ver_weg(sch):
    h = sch.dhash(verloop())
    assert sch.hamming(h, sch.dhash(verloop(maat=(180, 160)))) <= 6  # zelfde beeld, andere schaal
    assert sch.hamming(h, sch.dhash(verloop(helderder=12))) <= 6
    assert sch.hamming(h, sch.dhash(verloop(omgekeerd=True))) > 6


def test_cap01_hamming(sch):
    assert sch.hamming(0, 0) == 0
    assert sch.hamming(0b1011, 0) == 3
    assert sch.hamming(2**64 - 1, 0) == 64


def test_cap01_bijna_gelijke_trainings_en_validatiebeelden_gaan_eruit(sch):
    toets = {"toets-1": 0}
    train = {"gelijk": 0, "zes-bits": 0b111111, "zeven-bits": 0b1111111, "ver": 2**64 - 1}
    assert sch.bijna_gelijk(train, toets) == {"gelijk", "zes-bits"}
    assert sch.bijna_gelijk(train, toets, max_afstand=0) == {"gelijk"}
    beeld = {"toets-2": sch.dhash(verloop())}
    assert sch.bijna_gelijk({"kopie": sch.dhash(verloop(helderder=8)), "ander": sch.dhash(verloop(omgekeerd=True))}, beeld) == {"kopie"}


def test_cap01_schrijf_scheiding_json_met_regel_aantallen_en_invoerhashes(sch, tmp_path):
    rijen, uit = wereld({EU: {"A": 1, "B": 9, "D": 7}, GD: {"A": 4, "B": 8, "C": 3, "D": 3}}, {EU: {"E": 1}})
    k = sch.kies(rijen, uit)
    hashes = {"declaraties-prod-basiseenheden-20261008.tsv": "a" * 64, "alcohol-kandidaten.tsv": "b" * 64}
    pad = Path(sch.schrijf(k, tmp_path / "scheiding.json", hashes))
    data = json.loads(pad.read_text())
    assert pad == tmp_path / "scheiding.json"
    assert {"regel", "trainingsleveranciers", "per_rij", "score", "uitgesloten_gtins", "invoer"} <= set(data)
    assert isinstance(data["regel"], str) and data["regel"]
    assert data["trainingsleveranciers"] == [GLN["A"], GLN["D"]] and data["score"] == [0.0] * 8 + [4.5, 5.5]
    assert data["per_rij"] == json.loads(json.dumps(k["per_rij"])) and data["uitgesloten_gtins"] == 1
    assert data["invoer"] == hashes


def test_cap01_schrijf_is_byte_gelijk_bij_dezelfde_invoer(sch, tmp_path):
    rijen, uit = wereld({EU: {"A": 5, "B": 5}}, {EU: {"E": 1}})
    hashes = {"x.tsv": "c" * 64}
    a = Path(sch.schrijf(sch.kies(rijen, uit), tmp_path / "a.json", hashes)).read_bytes()
    b = Path(sch.schrijf(sch.kies(rijen, set(sorted(uit))), tmp_path / "b.json", dict(hashes))).read_bytes()
    assert a == b


def test_cap01_schrijf_weigert_binnen_een_git_werkboom(sch, tmp_path):
    beelden = importlib.import_module("beelden")
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    rijen, uit = wereld({EU: {"A": 5, "B": 5}}, {EU: {"E": 1}})
    with pytest.raises(beelden.BinnenRepo):
        sch.schrijf(sch.kies(rijen, uit), repo / "scheiding.json", {})
    assert not (repo / "scheiding.json").exists()


# --- lokale controle op de echte invoer (toetsset §1-§2, tabel 31-10-2026) ---------------------------------------

TABEL = {  # rij: (train GTIN's, train leveranciers, toets GTIN's, toets leveranciers)
    "EU_ORGANIC_FARMING": (49, 3, 127, 14), "GREEN_DOT": (112, 5, 272, 46), "RECYCLABLE_GENERAL_CLAIM": (229, 5, 648, 54),
    "NUTRISCORE_A": (121, 1, 171, 15), "NUTRISCORE_B": (79, 1, 106, 13), "NUTRISCORE_C": (184, 1, 199, 12),
    "PREGNANCY_WARNING": (525, 5, 878, 52), "MARINE_STEWARDSHIP_COUNCIL_LABEL": (19, 1, 33, 7),
    "WEIDEMELK": (71, 1, 98, 3), "VEGAN_SOCIETY_VEGAN_LOGO": (24, 1, 35, 3),
}


def oorspronkelijk():
    """Oorspronkelijke paden uit toetsset §1; de hoofdrepo is de map van de gedeelde git-map (niet deze werkboom)."""
    hier = Path(__file__).resolve().parents[1]
    git = subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], cwd=hier,
                         capture_output=True, text=True, check=True).stdout.strip()
    eindtest = Path(git).parent / "_bmad-output/planning-artifacts/eindtest-logo-pijplijn"
    meet = Path.home() / "logo-meetset-20261018"
    return {
        "declaraties-prod-basiseenheden-20261008.tsv": eindtest / "declaraties-prod-basiseenheden-20261008.tsv",
        "alcohol-kandidaten.tsv": meet / "alcohol-kandidaten.tsv",
        "voorlopige-selectie.json": meet / "ontwikkelmeting-20261028/voorlopige-selectie.json",
        "momentopname/actieve-refs.json": meet / "ontwikkelmeting-20261028/fase-b/momentopname/actieve-refs.json",
        "momentopname/training-data-actief.tsv": meet / "ontwikkelmeting-20261028/fase-b/momentopname/training-data-actief.tsv",
    }


@pytest.mark.lokaal
def test_cap01_lokaal_echte_invoer_reproduceert_de_tabel(sch):
    pm = os.environ.get("PROEF_MAP")
    paden = {n: (Path(pm) / "invoer" / n if pm else p) for n, p in oorspronkelijk().items()}
    ontbreekt = sorted(n for n, p in paden.items() if not p.exists())
    if ontbreekt:
        pytest.skip(f"echte invoer ontbreekt: {ontbreekt}")
    rijen = sch.bouw_rijen(sch.lees_declaraties(paden["declaraties-prod-basiseenheden-20261008.tsv"]),
                           sch.lees_alcohol(paden["alcohol-kandidaten.tsv"]))
    refs = json.loads(paden["momentopname/actieve-refs.json"].read_text())
    regels = [r.get("path") or "" for r in refs] + paden["momentopname/training-data-actief.tsv"].read_text().splitlines()
    fase_b = json.loads(paden["voorlopige-selectie.json"].read_text())["etiketten"]
    uitgesloten = sch.gtins_uit_paden(regels) | {e["doc_id"].split("-")[1] for e in fase_b}
    k = sch.kies(rijen, uitgesloten)
    assert len(k["trainingsleveranciers"]) == 5
    assert k["score"][0] == 16.5
    assert {r: (v["train"], v["train_glns"], v["toets"], v["toets_glns"]) for r, v in k["per_rij"].items()
            if r in TABEL} == TABEL  # ronde 5: de extra rijen buiten de keuze staan ook in per_rij
    assert k["uitgesloten_gtins"] > 0
