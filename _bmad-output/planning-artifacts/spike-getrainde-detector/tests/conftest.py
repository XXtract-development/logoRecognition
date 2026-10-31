"""Gedeelde testopzet: de modules van de proef staan plat in de specmap (zoals fase-b/tel.py)."""
import sys
from pathlib import Path

HIER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HIER))
