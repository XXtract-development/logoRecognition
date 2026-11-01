"""Gedeelde testopzet: de modules van de proef staan plat in de specmap (zoals fase-b/tel.py)."""
import sys
from pathlib import Path

HIER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HIER))


def wacht_klaar(page):
    """Wacht op het klaar-teken van de invulpagina (toetsset §6): `#keuzes` zonder `inert`, dus eerste `toon()` en
    `koppel()` gedaan. Niet op het antwoord van `/stand` wachten: `items.json` kan later binnenkomen."""
    page.wait_for_selector("#keuzes:not([inert])", state="attached")


def laad_klaar(page, url=None):
    """Open `url` (of herlaad zonder `url`) en wacht op het klaar-teken. Elke browserfixture en elk herladen gebruikt dit."""
    if url is None:
        page.reload()
    else:
        page.goto(url)
    wacht_klaar(page)
