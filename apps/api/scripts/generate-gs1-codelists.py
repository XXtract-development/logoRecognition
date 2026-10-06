#!/usr/bin/env python3
"""Genereert src/services/gs1-codelists/gs1-codelists-<release>.json uit de GS1 Benelux datamodel-xlsx (alleen codewaarden).

Gebruik: uv run --with openpyxl python apps/api/scripts/generate-gs1-codelists.py <xlsx> <gegenereerdOp YYYY-MM-DD>
De xlsx wordt nooit gecommit; het script controleert de sha256.
"""
import datetime, hashlib, json, sys
from pathlib import Path
import openpyxl

RELEASE = "3.1.37.1"
SHA256 = "16151350f71a47be2c6b65f6c370752c05cfbe4f3198feb6558ba507aa0f562e"
LISTS = ["PackagingMarkedLabelAccreditationCode", "DietTypeCode", "GHSSymbolDescriptionCode",
         "EU_consumerUsageLabelCodeList", "NutritionalProgramCode"]
DEFAULT_XLSX = Path(__file__).resolve().parents[3] / "_bmad-output/planning-artifacts/research/bronnen/benelux-fmcg-data-model-31371-nederlands.xlsx"
OUT = Path(__file__).resolve().parent.parent / "src/services/gs1-codelists" / f"gs1-codelists-{RELEASE}.json"

EXPECTED = {"PackagingMarkedLabelAccreditationCode": 919, "DietTypeCode": 35, "GHSSymbolDescriptionCode": 10,
            "EU_consumerUsageLabelCodeList": 20, "NutritionalProgramCode": 10}
if len(sys.argv) < 3:
    sys.exit("gebruik: generate-gs1-codelists.py <xlsx> <gegenereerdOp YYYY-MM-DD>  (datum verplicht: zelfde invoer = byte-gelijk bestand)")
xlsx = DEFAULT_XLSX if sys.argv[1] == "-" else Path(sys.argv[1])
datum = sys.argv[2]
datetime.date.fromisoformat(datum)
digest = hashlib.sha256(xlsx.read_bytes()).hexdigest()
if digest != SHA256:
    sys.exit(f"sha256 wijkt af: {digest} (verwacht {SHA256}); werk RELEASE/SHA256 bij voor een nieuwe release")

lijsten = {n: [] for n in LISTS}
wb = openpyxl.load_workbook(xlsx, read_only=True)
leeg = dubbel = 0
for naam, code, *_ in wb["Codelijsten"].iter_rows(min_row=2, values_only=True):
    if naam not in lijsten:
        continue
    code = None if code is None else str(code).strip()
    if not code:
        leeg += 1
    elif code in lijsten[naam]:
        dubbel += 1
    else:
        lijsten[naam].append(code)
wb.close()
if leeg or dubbel:
    print(f"let op: {leeg} lege en {dubbel} dubbele codes overgeslagen", file=sys.stderr)
for n, v in lijsten.items():
    if len(v) != EXPECTED[n]:
        sys.exit(f"{n}: {len(v)} codes, verwacht {EXPECTED[n]} voor release {RELEASE} (tabblad of kolom gewijzigd?)")

out = {
    "release": RELEASE, "bronSha256": SHA256, "gegenereerdOp": datum, "lijsten": lijsten,
    "nutritionalScore": {"waarden": ["A", "B", "C", "D", "E", "EXEMPT"],
                         "bron": "Attributen rij 411; NutritionalProgramCode rij 4963"},
}
OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"{OUT}: " + ", ".join(f"{k}={len(v)}" for k, v in lijsten.items()))
