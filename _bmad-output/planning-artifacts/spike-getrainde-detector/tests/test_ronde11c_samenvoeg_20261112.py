"""CAP-20 ronde 11c (ATDD): samenvoeging van de glutenvrij-oordelen in `toets/uitslag.json` (SPEC CAP-20, toetsset §6b,
besluiten Friso 12-11-2026). Alleen verzonnen etiketcodes en bestanden in `tmp_path`; nooit de echte uitslag.

Contract: `samenvoeg_glutenvrij.samenvoeg(uitslag, export, voorinvulling, droog=False) -> rapport` met
`rapport["categorieen"]` (mens_toegepast, mens_ouder, ai_toegepast, ai_aanwezig_zonder_mens, al_gelijk,
niet_bevestigd, export_ingetrokken), `verwacht_ai`, `gate_c` {"voor","na"} met met, zonder_mens, zonder_ai, open,
`geschreven`, `reservekopie`; een weigering is een ValueError en schrijft niets; `main(argv)` geeft 0 of 1.
"""
import json
import shutil

import pytest

from ronde11_hulp import GV, LOS12, eid, keuzes12

AI = {"bron": "ai-r10"}


def mod():
    import samenvoeg_glutenvrij
    return samenvoeg_glutenvrij


def rec(tijd="2026-11-11T10:00:00+01:00", gv=None, herkomst=None, status="bevestigd"):
    """Uitslagrecord in de vorm van de echte uitslag (sleutelvolgorde zoals daar)."""
    k = keuzes12(GREEN_DOT="aanwezig")
    bc = sorted(LOS12)
    if gv is not None:
        k[GV] = gv
        bc = sorted(bc + [GV])
    r = {"bevestigde_codes": bc, "keurmerken": k, "nutriscore": ["C"], "opmerking": "x", "status": status,
         "tijd": tijd, "veranderd": ["GREEN_DOT"]}
    if herkomst:
        r["herkomst_codes"] = {GV: herkomst}
    return r


def exp(gv=None, bijgewerkt="2026-11-12T09:00:00.000Z", status="bevestigd"):
    """Exportrecord van de artefactpagina; met `gv` een menselijk bevestigd glutenvrij-oordeel. De overige keuzes en
    Nutri-Score wijken bewust af van `rec()`: de samenvoeging mag alleen glutenvrij overnemen."""
    k = keuzes12(GREEN_DOT="afwezig", WEIDEMELK="aanwezig")
    bc = sorted(LOS12)
    if gv is not None:
        k[GV] = gv
        bc = sorted(bc + [GV])
    return {"status": status, "keurmerken": k, "veranderd": [], "opmerking": "", "bijgewerkt": bijgewerkt,
            "nutriscore": ["A"], "bevestigde_codes": bc}


def schrijf(tmp_path, uitslag, export, voor, indent=1, ensure_ascii=False):
    u = tmp_path / "uitslag.json"
    u.write_text(json.dumps(uitslag, indent=indent, ensure_ascii=ensure_ascii), encoding="utf-8")
    e = tmp_path / "export.json"
    e.write_text(json.dumps({"gedownload": "2026-11-12T12:00:00Z", "aantal": len(export), "beoordelingen": export}))
    v = tmp_path / "r10.json"
    v.write_text(json.dumps({i: {"keurmerken": {GV: b}, "model": "nep"} for i, b in voor.items()}))
    return u, e, v


def lees(pad):
    return json.loads(pad.read_text(encoding="utf-8"))


def backups(tmp_path):
    return sorted(tmp_path.glob("uitslag.json.voor-glutenvrij-*.json"))


# Basisgeval: 6 etiketten.
# M1: getoond (AI true), mens bevestigt aanwezig        -> mens_toegepast
# M2: getoond (AI true), geen menselijk oordeel         -> ai_aanwezig_zonder_mens (niets)
# A1, A2: niet getoond (AI false), geen menselijk        -> ai_toegepast (afwezig, ai-r10)
# H1: niet getoond (AI false), mens zegt aanwezig       -> mens_toegepast (mens gaat voor)
# O1: AI false, uitslag onleesbaar                       -> niet_bevestigd (niets)
M1, M2, A1, A2, H1, O1 = (eid(n) for n in range(21, 27))
VOOR = {M1: True, M2: True, A1: False, A2: False, H1: False, O1: False}


@pytest.fixture
def basis(tmp_path):
    uitslag = {i: rec() for i in VOOR}
    uitslag[O1] = {"keurmerken": {}, "opmerking": "", "status": "onleesbaar", "tijd": "2026-11-11T10:00:00+01:00",
                   "veranderd": []}
    export = {i: exp() for i in VOOR}
    export[M1] = exp(gv="aanwezig")
    export[H1] = exp(gv="aanwezig")
    return schrijf(tmp_path, uitslag, export, VOOR)


# --- P0: regels ---------------------------------------------------------------------------------------------------------
def test_regels_mens_gaat_voor_ai_afwezig_ai_aanwezig_telt_niet(tmp_path, basis):
    u, e, v = basis
    origineel = lees(u)
    r = mod().samenvoeg(u, e, v)
    na = lees(u)
    assert r["categorieen"] == {"mens_toegepast": 2, "mens_ouder": 0, "ai_toegepast": 2, "ai_aanwezig_zonder_mens": 1,
                                "al_gelijk": 0, "niet_bevestigd": 1, "export_ingetrokken": 0}
    assert sum(r["categorieen"].values()) == len(origineel)
    assert r["verwacht_ai"] == 2
    for i in (A1, A2):
        assert na[i]["keurmerken"][GV] == "afwezig" and GV in na[i]["bevestigde_codes"]
        assert na[i]["herkomst_codes"] == {GV: AI}
    for i in (M1, H1):
        assert na[i]["keurmerken"][GV] == "aanwezig" and GV in na[i]["bevestigde_codes"]
        assert na[i]["herkomst_codes"] == {GV: {"bron": "artefact", "bijgewerkt": "2026-11-12T09:00:00.000Z"}}
    assert na[M2] == origineel[M2] and na[O1] == origineel[O1]


def test_alle_andere_velden_en_volgorde_blijven(tmp_path, basis):
    u, e, v = basis
    origineel = lees(u)
    mod().samenvoeg(u, e, v)
    na = lees(u)
    assert list(na) == list(origineel)
    for i in (A1, M1):
        o, n = origineel[i], na[i]
        assert list(n) == list(o) + ["herkomst_codes"]
        assert list(n["keurmerken"]) == list(o["keurmerken"]) + [GV]
        assert {c: n["keurmerken"][c] for c in o["keurmerken"]} == o["keurmerken"]
        assert n["bevestigde_codes"] == sorted(o["bevestigde_codes"] + [GV])
        for veld in ("nutriscore", "opmerking", "status", "tijd", "veranderd"):
            assert n[veld] == o[veld]
    assert u.read_text(encoding="utf-8") == json.dumps(na, indent=1, ensure_ascii=False)  # zelfde formaat, geen slotregel


def test_ouder_exportrecord_overschrijft_latere_bevestiging_niet(tmp_path):
    """Lokale pagina bevestigde glutenvrij afwezig om 12-11 10:00 (+01:00); de export van 11-11 zegt aanwezig."""
    a, b = eid(31), eid(32)
    uitslag = {a: rec(tijd="2026-11-12T10:00:00+01:00", gv="afwezig"),
               b: rec(tijd="2026-11-12T10:00:00+01:00", gv="afwezig")}
    export = {a: exp(gv="aanwezig", bijgewerkt="2026-11-11T09:00:00.000Z"),   # ouder: blijft afwezig
              b: exp(gv="aanwezig", bijgewerkt="2026-11-12T09:30:00.000Z")}   # 10:30 lokale tijd: nieuwer
    u, e, v = schrijf(tmp_path, uitslag, export, {a: False, b: False})
    r = mod().samenvoeg(u, e, v)
    na = lees(u)
    assert na[a] == uitslag[a]
    assert na[b]["keurmerken"][GV] == "aanwezig"
    assert r["categorieen"]["mens_ouder"] == 1 and r["categorieen"]["mens_toegepast"] == 1


def test_mens_vervangt_ai_en_nieuwere_export_vervangt_oudere_export(tmp_path):
    a, b, c = eid(41), eid(42), eid(43)
    uitslag = {a: rec(gv="afwezig", herkomst=AI),
               b: rec(gv="afwezig", herkomst={"bron": "artefact", "bijgewerkt": "2026-11-12T09:00:00.000Z"}),
               c: rec(gv="afwezig", herkomst={"bron": "artefact", "bijgewerkt": "2026-11-12T09:00:00.000Z"})}
    export = {a: exp(gv="onzeker", bijgewerkt="2026-11-01T00:00:00.000Z"),  # mens gaat voor op AI, ook als oud
              b: exp(gv="aanwezig", bijgewerkt="2026-11-12T11:00:00.000Z"),  # nieuwer: vervangt
              c: exp(gv="afwezig", bijgewerkt="2026-11-12T09:00:00.000Z")}   # zelfde keuze en tijd: al gelijk
    u, e, v = schrijf(tmp_path, uitslag, export, {a: False, b: False, c: False})
    r = mod().samenvoeg(u, e, v)
    na = lees(u)
    assert na[a]["keurmerken"][GV] == "onzeker" and na[a]["herkomst_codes"][GV]["bron"] == "artefact"
    assert na[b]["keurmerken"][GV] == "aanwezig"
    assert na[c] == uitslag[c]
    assert r["categorieen"]["mens_toegepast"] == 2 and r["categorieen"]["al_gelijk"] == 1


def test_ingetrokken_oordeel_haalt_niets_weg(tmp_path):
    a = eid(51)
    uitslag = {a: rec(gv="aanwezig", herkomst={"bron": "artefact", "bijgewerkt": "2026-11-12T09:00:00.000Z"})}
    u, e, v = schrijf(tmp_path, uitslag, {a: exp(status="open")}, {a: True})
    r = mod().samenvoeg(u, e, v)
    assert lees(u) == uitslag and r["categorieen"]["export_ingetrokken"] == 1 and r["geschreven"] is False


def test_mens_op_niet_bevestigd_uitslagrecord_verandert_niets(tmp_path):
    a = eid(52)
    uitslag = {a: rec(status="onleesbaar")}
    u, e, v = schrijf(tmp_path, uitslag, {a: exp(gv="aanwezig")}, {a: True})
    r = mod().samenvoeg(u, e, v)
    assert lees(u) == uitslag and r["categorieen"]["niet_bevestigd"] == 1


# --- P0: herhaalbaar, droog, reservekopie --------------------------------------------------------------------------------
def test_tweede_run_verandert_niets_en_maakt_geen_reservekopie(tmp_path, basis):
    u, e, v = basis
    eerste = mod().samenvoeg(u, e, v)
    assert eerste["geschreven"] is True and len(backups(tmp_path)) == 1
    tekst = u.read_bytes()
    tweede = mod().samenvoeg(u, e, v)
    assert u.read_bytes() == tekst and tweede["geschreven"] is False and len(backups(tmp_path)) == 1
    assert tweede["categorieen"]["al_gelijk"] == 4 and tweede["categorieen"]["ai_toegepast"] == 0


def test_droogloop_telt_en_schrijft_niets(tmp_path, basis):
    u, e, v = basis
    voor = u.read_bytes()
    droog = mod().samenvoeg(u, e, v, droog=True)
    assert u.read_bytes() == voor and backups(tmp_path) == [] and droog["geschreven"] is False
    echt = mod().samenvoeg(u, e, v)
    assert droog["categorieen"] == echt["categorieen"] and droog["gate_c"] == echt["gate_c"]


def test_reservekopie_is_bytekopie_van_het_origineel(tmp_path, basis):
    u, e, v = basis
    voor = u.read_bytes()
    r = mod().samenvoeg(u, e, v)
    (kopie,) = backups(tmp_path)
    assert kopie.read_bytes() == voor and str(kopie) == str(r["reservekopie"])


def test_weigert_als_uitslag_tussen_lezen_en_schrijven_verandert(tmp_path, basis, monkeypatch):
    u, e, v = basis
    m = mod()
    echt_herlees = m._herlees

    def tussendoor(pad):
        pad.write_text(pad.read_text(encoding="utf-8").replace('"x"', '"y"'), encoding="utf-8")
        return echt_herlees(pad)

    monkeypatch.setattr(m, "_herlees", tussendoor)
    with pytest.raises(ValueError, match="veranderd"):
        m.samenvoeg(u, e, v)
    assert '"y"' in u.read_text(encoding="utf-8") and GV not in u.read_text(encoding="utf-8")
    assert list(tmp_path.glob(".uitslag-*.tmp")) == []
    assert backups(tmp_path) == []


# --- P0: weigeringen -----------------------------------------------------------------------------------------------------
@pytest.mark.parametrize("geval", ["aantal", "export_onbekend_id", "voor_onbekend_id", "voor_ontbreekt", "voor_geen_bool",
                                   "status_onbekend", "keuze_ongeldig", "tijd_zonder_zone", "export_geen_object",
                                   "formaat_anders", "export_zonder_beoordelingen", "export_status_onbekend",
                                   "uitslag_geen_object", "tijd_geen_iso", "uitslag_tijd_onleesbaar",
                                   "keurmerken_geen_object"])
def test_weigert_en_schrijft_niets(tmp_path, geval):
    a, b = eid(61), eid(62)
    uitslag = {a: rec(), b: rec()}
    export = {a: exp(gv="aanwezig"), b: exp()}
    voor = {a: True, b: False}
    indent = 1
    if geval == "export_onbekend_id":
        export[eid(99)] = exp()
    elif geval == "voor_onbekend_id":
        voor[eid(99)] = False
    elif geval == "voor_ontbreekt":
        del voor[b]
    elif geval == "voor_geen_bool":
        voor[b] = "nee"
    elif geval == "status_onbekend":
        uitslag[b]["status"] = "half"
    elif geval == "keuze_ongeldig":
        export[a]["keurmerken"][GV] = "misschien"
    elif geval == "tijd_zonder_zone":
        export[a]["bijgewerkt"] = "2026-11-12T09:00:00"
        uitslag[a] = rec(gv="afwezig")
    elif geval == "formaat_anders":
        indent = 2
    elif geval == "export_status_onbekend":
        export[b]["status"] = "half"
    elif geval == "tijd_geen_iso":
        export[a]["bijgewerkt"] = "gisteren"
    elif geval == "uitslag_tijd_onleesbaar":
        uitslag[a] = rec(gv="afwezig", tijd="gisteren")
    elif geval == "keurmerken_geen_object":
        uitslag[a]["keurmerken"] = ["GREEN_DOT"]
    u, e, v = schrijf(tmp_path, uitslag, export, voor, indent=indent)
    if geval == "aantal":
        e.write_text(json.dumps({"gedownload": "x", "aantal": 5, "beoordelingen": export}))
    elif geval == "export_geen_object":
        e.write_text(json.dumps([1, 2]))
    elif geval == "export_zonder_beoordelingen":
        e.write_text(json.dumps({"gedownload": "x", "aantal": 0}))
    elif geval == "uitslag_geen_object":
        u.write_text("[1, 2]", encoding="utf-8")
    voor_bytes = u.read_bytes()
    with pytest.raises(ValueError):
        mod().samenvoeg(u, e, v)
    assert u.read_bytes() == voor_bytes and backups(tmp_path) == []


# --- P0: gate C vóór en na, zelfde telling als de poort --------------------------------------------------------------------
# zonder = 1 menselijk + n_ai: (16, 34) geeft precies 35 (open), (16, 33) geeft 34 (dicht)
@pytest.mark.parametrize("n_met,n_ai,open_", [(16, 34, True), (15, 34, False), (16, 33, False)])
def test_gate_c_voor_en_na_zoals_poort_glutenvrij(tmp_path, n_met, n_ai, open_):
    import train

    ids = [eid(100 + n) for n in range(n_met + n_ai + 2)]
    uitslag = {i: rec() for i in ids}
    export = {i: exp(gv="aanwezig") for i in ids[:n_met]}
    export[ids[n_met]] = exp(gv="afwezig")  # één menselijk zonder
    voor = {i: (n < n_met or n == n_met + n_ai + 1) for n, i in enumerate(ids)}  # laatste: AI true zonder mens
    u, e, v = schrijf(tmp_path, uitslag, export, voor)
    r = mod().samenvoeg(u, e, v)
    assert r["gate_c"]["voor"] == {"met": 0, "zonder_mens": 0, "zonder_ai": 0, "open": False}
    assert r["gate_c"]["na"] == {"met": n_met, "zonder_mens": 1, "zonder_ai": n_ai, "open": open_}
    assert r["verwacht_ai"] == n_ai
    gaat = True
    try:
        train.poort_glutenvrij(u)
    except train.PoortGlutenvrij:
        gaat = False
    assert gaat is open_


# --- P1: opdrachtregel ---------------------------------------------------------------------------------------------------
def test_main_droog_drukt_rapport_af_en_schrijft_niets(tmp_path, basis, capsys):
    u, e, v = basis
    voor = u.read_bytes()
    assert mod().main(["--uitslag", str(u), "--export", str(e), "--voorinvulling", str(v), "--droog"]) == 0
    tekst = capsys.readouterr().out
    assert "droogloop" in tekst and "ai_toegepast 2" in tekst and "gate C" in tekst
    assert u.read_bytes() == voor


def test_main_weigert_met_code_1(tmp_path, basis, capsys):
    u, e, v = basis
    shutil.copy(v, tmp_path / "leeg.json")
    (tmp_path / "leeg.json").write_text("[]")
    assert mod().main(["--uitslag", str(u), "--export", str(e), "--voorinvulling", str(tmp_path / "leeg.json")]) == 1
    assert capsys.readouterr().err.startswith("geweigerd: ")


# --- Na review (bmad-build ronde 11c) ------------------------------------------------------------------------------------
def test_alleen_glutenvrij_komt_uit_de_export(tmp_path, basis):
    u, e, v = basis
    origineel = lees(u)
    mod().samenvoeg(u, e, v)
    na = lees(u)
    for i in (M1, H1):  # exportrecords hebben andere keuzes en Nutri-Score ["A"]
        assert {c: na[i]["keurmerken"][c] for c in LOS12} == origineel[i]["keurmerken"]
        assert na[i]["nutriscore"] == ["C"]


def test_ouder_dan_artefactmarkering_en_onbekende_markering_blijven_staan(tmp_path):
    a, b = eid(71), eid(72)
    uitslag = {a: rec(gv="afwezig", herkomst={"bron": "artefact", "bijgewerkt": "2026-11-12T09:00:00.000Z"}),
               b: rec(gv="afwezig", herkomst={"bron": "x"})}
    export = {a: exp(gv="aanwezig", bijgewerkt="2026-11-12T08:00:00.000Z"), b: exp(gv="aanwezig")}
    u, e, v = schrijf(tmp_path, uitslag, export, {a: False, b: False})
    r = mod().samenvoeg(u, e, v)
    assert lees(u) == uitslag and r["categorieen"]["mens_ouder"] == 2


def test_uitslagrecord_zonder_status_is_niet_bevestigd(tmp_path):
    """De lokale server bewaart een eerste tussenstand zonder status; dat mag de samenvoeging niet blokkeren."""
    a, b = eid(73), eid(74)
    zonder = {"keurmerken": {"GREEN_DOT": "aanwezig"}, "opmerking": "", "tijd": "2026-11-11T10:00:00+01:00",
              "veranderd": []}
    u, e, v = schrijf(tmp_path, {a: zonder, b: rec()}, {}, {a: False, b: False})
    r = mod().samenvoeg(u, e, v)
    assert r["categorieen"]["niet_bevestigd"] == 1 and r["categorieen"]["ai_toegepast"] == 1
    assert lees(u)[a] == zonder


def test_reservekopie_die_al_bestaat_weigert(tmp_path, basis, monkeypatch):
    from datetime import datetime as echte_datetime

    class Vast(echte_datetime):
        @classmethod
        def now(cls, tz=None):
            return echte_datetime(2026, 11, 12, 13, 0, 0)

    u, e, v = basis
    m = mod()
    monkeypatch.setattr(m, "datetime", Vast)
    (tmp_path / "uitslag.json.voor-glutenvrij-20261112T130000.json").write_text("bezet")
    voor = u.read_bytes()
    with pytest.raises(ValueError, match="bestaat al"):
        m.samenvoeg(u, e, v)
    assert u.read_bytes() == voor


def test_mislukt_vervangen_laat_uitslag_en_geen_tijdelijk_bestand_achter(tmp_path, basis, monkeypatch):
    u, e, v = basis
    m = mod()
    voor = u.read_bytes()

    def faalt(*args):
        raise OSError("schijf vol")

    monkeypatch.setattr(m.os, "replace", faalt)
    with pytest.raises(OSError):
        m.samenvoeg(u, e, v)
    assert u.read_bytes() == voor and list(tmp_path.glob(".uitslag-*.tmp")) == []


def test_wijziging_vlak_voor_het_vervangen_wordt_geweigerd(tmp_path, basis, monkeypatch):
    """Tweede controle vlak vóór os.replace: verandert de uitslag na de eerste controle, dan weigeren."""
    u, e, v = basis
    m = mod()
    echt_herlees = m._herlees
    keer = {"n": 0}

    def tweede_keer(pad):
        keer["n"] += 1
        if keer["n"] == 2:
            pad.write_text(pad.read_text(encoding="utf-8").replace('"x"', '"z"'), encoding="utf-8")
        return echt_herlees(pad)

    monkeypatch.setattr(m, "_herlees", tweede_keer)
    with pytest.raises(ValueError, match="veranderd"):
        m.samenvoeg(u, e, v)
    assert keer["n"] == 2 and '"z"' in u.read_text(encoding="utf-8") and GV not in u.read_text(encoding="utf-8")
    assert list(tmp_path.glob(".uitslag-*.tmp")) == []


@pytest.mark.parametrize("ensure_ascii", [True, False])
def test_niet_ascii_en_rechten_blijven(tmp_path, basis, ensure_ascii):
    u, e, v = basis
    data = lees(u)
    data[A1]["opmerking"] = "geen glutenvrij-logo, wel tekst é"
    u.write_text(json.dumps(data, indent=1, ensure_ascii=ensure_ascii), encoding="utf-8")
    u.chmod(0o644)
    mod().samenvoeg(u, e, v)
    na = lees(u)
    assert na[A1]["opmerking"] == "geen glutenvrij-logo, wel tekst é"
    assert u.read_text(encoding="utf-8") == json.dumps(na, indent=1, ensure_ascii=ensure_ascii)
    assert u.stat().st_mode & 0o777 == 0o644


def test_symbolische_koppeling_blijft_een_koppeling(tmp_path, basis):
    u, e, v = basis
    koppeling = tmp_path / "via-koppeling.json"
    koppeling.symlink_to(u)
    mod().samenvoeg(koppeling, e, v)
    assert koppeling.is_symlink() and GV in lees(u)[A1]["keurmerken"]


def test_rapport_telt_ai_onwaar_onafhankelijk_en_markeringen_uit_het_bestand(tmp_path, basis):
    """Onafhankelijke controle: ai_onwaar komt uit de voorinvulling, ai_gemarkeerd uit het geschreven bestand."""
    u, e, v = basis
    r = mod().samenvoeg(u, e, v)
    assert r["ai_onwaar"] == 4  # A1, A2, H1, O1
    assert r["ai_onwaar_per_categorie"] == {"ai_toegepast": 2, "mens_toegepast": 1, "niet_bevestigd": 1}
    assert r["ai_gemarkeerd"] == sum(1 for x in lees(u).values() if x.get("herkomst_codes", {}).get(GV) == AI) == 2
    droog = mod().samenvoeg(u, e, v, droog=True)
    assert droog["ai_gemarkeerd"] == 2 and droog["ai_onwaar_per_categorie"] == {"al_gelijk": 3, "niet_bevestigd": 1}
