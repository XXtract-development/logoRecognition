"""Licentiecontrole (CAP-13; randvoorwaarden §4). Alleen standaardbibliotheek.

Per geïnstalleerd pakket de licentie uit de metadata (License-Expression, License, classifiers); is die leeg, dan de
eerste regels van het meegeleverde licentiebestand. Toegestaan: Apache-2.0, MIT, BSD, MPL-2.0, en als exacte SPDX-id
BSL-1.0 en CNRI-Python (besluit Friso 01-11-2026, voor elk pakket; BUSL-1.1, BSL-1.1 en CNRI-Jython blijven een
overtreding); even ruim (vermeld): ISC, PSF, HPND, Unlicense, CC0, zlib. Bij AND moeten alle delen mogen, bij OR
minstens één. Verboden pakketten stoppen ongeacht hun metadata. Elke andere of onbekende licentie is een overtreding (stoppunt 4).

  python licenties.py        rapport over de huidige omgeving; niet-nul bij een overtreding
"""
import importlib.metadata as md
import json
import re
import sys

VERBODEN = ("ultralytics", "pymupdf", "fitz", "albumentationsx", "rfdetr_plus", "rfdetr-plus", "deimv2", "yoloe", "dinov3")
EXTERN = {"pdftoppm", "pdftotext", "rsync", "ssh"}
RANG = {"toegestaan": 0, "ruim": 1, "onbekend": 2, "verboden": 3}
_NIET = re.compile(r"gpl|sspl|eupl|\bosl\b|cddl|\bepl\b|-nc\b|noncommercial|proprietary|licenseref", re.I)
_TOEGESTAAN = re.compile(r"apache|\bmit\b|mit-|bsd|mpl-2\.0|mozilla public license 2", re.I)
_EXACT = {"BSL-1.0", "CNRI-PYTHON"}  # alleen als hele SPDX-id (hoofdletterongevoelig), besluit Friso 01-11-2026
_RUIM = re.compile(r"\bisc\b|psf|python software foundation|python-2\.0|hpnd|historical permission|unlicense|cc0|zlib", re.I)
_TEKST = [  # eerste regels van een licentiebestand → licentie
    (re.compile(r"GNU (AFFERO |LESSER )?GENERAL PUBLIC LICENSE", re.I), "GPL"),
    (re.compile(r"Apache License", re.I), "Apache-2.0"),
    (re.compile(r"Permission is hereby granted, free of charge", re.I), "MIT"),
    (re.compile(r"^\s*MIT License", re.I | re.M), "MIT"),
    (re.compile(r"Redistribution and use in source and binary forms", re.I), "BSD"),
    (re.compile(r"BSD \d-Clause|BSD License", re.I), "BSD"),
    (re.compile(r"Mozilla Public License,? (Version |v\.? ?)?2\.0", re.I), "MPL-2.0"),
    (re.compile(r"Permission to use, copy, modify, and/or distribute", re.I), "ISC"),
    (re.compile(r"PYTHON SOFTWARE FOUNDATION LICENSE", re.I), "PSF-2.0"),
]


def _norm(naam):
    return naam.lower().replace("_", "-")


def _uit_tekst(tekst):
    """Licentie uit de eerste 20 regels van een licentietekst: het patroon dat het eerst in de tekst staat."""
    kop = "\n".join((tekst or "").splitlines()[:20])
    treffers = [(m.start(), licentie) for patroon, licentie in _TEKST for m in [patroon.search(kop)] if m]
    return min(treffers)[1] if treffers else ""


def _blad(term):
    term = re.split(r"\s+WITH\s+", term.strip(), flags=re.I)[0].strip()
    if not term:
        return "onbekend"
    if _NIET.search(term):
        return "verboden"
    if term.upper() in _EXACT or _TOEGESTAAN.search(term):
        return "toegestaan"
    if _RUIM.search(term):
        return "ruim"
    return "onbekend"


def beoordeel(uitdrukking):
    """'toegestaan' | 'ruim' | 'verboden' | 'onbekend' voor een (SPDX-)uitdrukking met AND/OR en haakjes."""
    tokens = re.findall(r"\(|\)|[^\s()]+", uitdrukking or "")
    if not tokens:
        return "onbekend"
    pos = 0

    def of():  # OR bindt het zwakst
        nonlocal pos
        delen = [en()]
        while pos < len(tokens) and tokens[pos].upper() == "OR":
            pos += 1
            delen.append(en())
        return min(delen, key=RANG.get)

    def en():
        nonlocal pos
        delen = [blad()]
        while pos < len(tokens) and tokens[pos].upper() == "AND":
            pos += 1
            delen.append(blad())
        return max(delen, key=RANG.get)

    def blad():
        nonlocal pos
        if pos < len(tokens) and tokens[pos] == "(":
            pos += 1
            r = of()
            pos += pos < len(tokens) and tokens[pos] == ")"
            return r
        woorden = []
        while pos < len(tokens) and tokens[pos] not in ("(", ")") and tokens[pos].upper() not in ("AND", "OR"):
            woorden.append(tokens[pos])
            pos += 1
        return _blad(" ".join(woorden))

    try:
        oordeel = of()
    except IndexError:
        return "onbekend"
    return oordeel if pos == len(tokens) else "onbekend"  # niet-gelezen rest ("(MIT) GPL-3.0"): niet te beoordelen


def _versie(v):
    return tuple(int(x) for x in re.findall(r"\d+", v or "")[:3])


def controleer(pakketten):
    overtredingen, ruim = [], []
    for p in pakketten:
        naam, versie = p["naam"], p.get("versie", "")
        if _norm(naam) in {_norm(v) for v in VERBODEN} or (_norm(naam) == "albumentations" and _versie(versie) >= (2, 0, 9)):
            overtredingen.append({"naam": naam, "versie": versie, "reden": "verboden pakket"})
            continue
        licentie = (p.get("licentie") or "").strip()
        if not licentie or licentie.upper() == "UNKNOWN":
            licentie = _uit_tekst(p.get("tekst", ""))
        elif "\n" in licentie or len(licentie) > 200:  # hele licentietekst in het License-veld
            licentie = _uit_tekst(licentie) or licentie
        oordeel = beoordeel(licentie)
        if oordeel == "ruim":
            ruim.append({"naam": naam, "versie": versie, "licentie": licentie})
        elif oordeel != "toegestaan":
            overtredingen.append({"naam": naam, "versie": versie, "licentie": licentie, "reden": oordeel})
    return {"overtredingen": overtredingen, "ruim": ruim}


def _licentiebestand(dist):
    for f in dist.files or []:
        if re.match(r"(licen[cs]e|copying|notice)", f.name, re.I):
            try:
                return "\n".join(f.locate().read_text(encoding="utf-8", errors="replace").splitlines()[:20])
            except OSError:
                continue
    return ""


def pakketten_uit_omgeving():
    uit = []
    for dist in md.distributions():
        m = dist.metadata
        klassen = [c.split("::")[-1].strip() for c in m.get_all("Classifier") or [] if c.startswith("License ::")]
        uit_klassen = " AND ".join(f"({k})" for k in klassen if k != "OSI Approved")  # streng: alle classifiers samen
        veld = (m.get("License") or "").strip()
        if "\n" in veld or len(veld) > 200:  # hele licentietekst in het veld
            veld = _uit_tekst(veld)
        if veld.upper() == "UNKNOWN" or (veld and beoordeel(veld) == "onbekend" and uit_klassen):
            veld = ""  # vaag veld ("Dual License"): de classifiers zeggen meer
        licentie = m.get("License-Expression") or veld or uit_klassen
        uit.append({"naam": m["Name"], "versie": dist.version, "licentie": licentie, "tekst": _licentiebestand(dist)})
    return sorted(uit, key=lambda x: x["naam"].lower())


def main(argv=None):
    pakketten = pakketten_uit_omgeving()
    r = controleer(pakketten)
    r["pakketten"] = len(pakketten)
    r["extern"] = sorted(EXTERN)
    print(json.dumps(r, indent=1, ensure_ascii=False))
    return 1 if r["overtredingen"] else 0


if __name__ == "__main__":
    sys.exit(main())
