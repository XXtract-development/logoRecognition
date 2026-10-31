"""ATDD CAP-10 draaiplan (SPEC CAP-10, toetsset §4; contract `DRAAIPLAN.md`).
Rode fase: `DRAAIPLAN.md` bestaat nog niet. Controleert vorm en volgorde, en dat elk genoemd script bestaat en getest is
(of uitdrukkelijk `ongetest:` met reden draagt)."""
import re
from pathlib import Path

import pytest

HIER = Path(__file__).resolve().parents[1]
STAPPEN = ("scheiding", "kandidaten", "voorinvulling", "stoppunt 2", "bevestiging", "aanvullen", "dHash-controle",
           "scheiding bevriezen", "snelheidsmeting", "training", "bevriezen", "toetsrun D+A", "toetsrun K4-aa",
           "telling", "blind nakijken")
REGELS = ("Commando:", "Uitvoer:", "Kosten:", "Tijd:", "Stoppunt:")


@pytest.fixture
def stappen():
    tekst = (HIER / "DRAAIPLAN.md").read_text(encoding="utf-8")
    delen = re.split(r"^### Stap (\d+) — (.+)$", tekst, flags=re.M)
    return [(int(n), naam.strip(), body) for n, naam, body in zip(delen[1::3], delen[2::3], delen[3::3])]


def regel(body, sleutel):
    gevonden = [r for r in body.splitlines() if r.strip().startswith(sleutel)]
    return gevonden[0].split(sleutel, 1)[1].strip() if gevonden else None


def test_cap10_vijftien_stappen_in_de_vaste_volgorde(stappen):
    assert [n for n, _, _ in stappen] == list(range(1, 16))
    assert all(naam.lower().startswith(verwacht.lower()) for (_, naam, _), verwacht in zip(stappen, STAPPEN))


def test_cap10_elke_stap_noemt_commando_uitvoer_kosten_tijd_en_stoppunt(stappen):
    for n, naam, body in stappen:
        assert all(regel(body, s) for s in REGELS), f"stap {n} ({naam}) mist een van {REGELS}"


def test_cap10_stoppunten_staan_bij_de_juiste_stap(stappen):
    per_naam = {naam.lower(): body for _, naam, body in stappen}
    assert re.search(r"\b2\b", regel(per_naam["stoppunt 2"], "Stoppunt:"))
    assert re.search(r"\b1\b", regel(next(b for n, b in per_naam.items() if n.startswith("snelheidsmeting")), "Stoppunt:"))


def test_cap10_genoemde_scripts_bestaan_en_zijn_getest_of_ongetest_met_reden(stappen):
    tests = "\n".join(p.read_text(encoding="utf-8") for p in (HIER / "tests").glob("test_*.py"))
    for n, naam, body in stappen:
        scripts = re.findall(r"python3?\s+(?:-m\s+)?([\w/.-]+\.py)", body)
        for s in scripts:
            assert (HIER / s).is_file(), f"stap {n}: {s} bestaat niet in de specmap"
        getest = [s for s in scripts if f'"{s[:-3].replace("/", ".")}"' in tests]
        reden = regel(body, "ongetest:")
        assert getest or reden, f"stap {n} ({naam}) verwijst niet naar getest gereedschap en noemt geen reden"
