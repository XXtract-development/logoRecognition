"""CAP-22 ronde 13 (ATDD): samenvoeging van de nieuwe etiketten van ronde 12 in `toets/uitslag.json` (SPEC CAP-22,
toetsset §6c, besluit Friso 15-11-2026). Alleen verzonnen etiketcodes en bestanden in `tmp_path`; nooit de echte uitslag.

Contract: `samenvoeg_r12.samenvoeg(uitslag, export, items, droog=False) -> rapport` met
`rapport["categorieen"]` (toegevoegd_bevestigd, toegevoegd_onleesbaar, vervangen, al_gelijk, ouder, ingetrokken,
export_open, anders_gewijzigd, ontbreekt, al_samengevoegd_ontbreekt; samen het aantal items),
`rapport["per_keurmerk"]` {"voor", "na"} = `uitslag.stand` vóór en na, `rapport["gate_c"]` {"voor", "na"} zoals
`samenvoeg_glutenvrij._gate`, `geschreven`, `reservekopie`. Een weigering is een ValueError en schrijft niets.
`main(argv)` geeft 0 of 1. Het schrijfblok is gedeeld met `samenvoeg_glutenvrij` (daar `_herlees`).

Categorieën voor een etiket dat al met `herkomst_etiket` artefact-r12 in de uitslag staat: gelijk record -> al_gelijk;
strikt nieuwer -> vervangen, behalve onleesbaar of open over bevestigd -> ingetrokken; niet strikt nieuwer -> ouder;
open over onleesbaar -> export_open; record met sleutels die het script niet schrijft -> anders_gewijzigd.
"""
import json
import re

import pytest

from conftest import HIER
from ronde11_hulp import GV, LOS12, eid, keuzes12

CODES13 = sorted(LOS12 + (GV,))
SLEUTELS_BEVESTIGD = ["status", "keurmerken", "veranderd", "opmerking", "tijd", "bevestigde_codes", "nutriscore",
                      "herkomst_etiket"]


def mod():
    import samenvoeg_r12
    return samenvoeg_r12


def sg():
    import samenvoeg_glutenvrij
    return samenvoeg_glutenvrij


def oud_rec(opmerking="x", gv="afwezig"):
    """Bestaand uitslagrecord in de vorm van 316 van de 352 echte records."""
    k = keuzes12(GREEN_DOT="aanwezig")
    k[GV] = gv
    return {"status": "bevestigd", "keurmerken": k, "veranderd": ["GREEN_DOT"], "opmerking": opmerking,
            "tijd": "2026-11-04T10:39:02+01:00", "bevestigde_codes": CODES13, "nutriscore": ["C"],
            "herkomst_codes": {GV: {"bron": "ai-r10"}}}


def bev(gv="aanwezig", bijgewerkt="2026-11-15T09:00:00.123Z", ns=("B",), opmerking="", **anders):
    """Exportrecord zoals `slaNu` het na Bevestigen schrijft (13 codes, gesorteerde bevestigde_codes)."""
    k = keuzes12(**anders)
    k[GV] = gv
    return {"status": "bevestigd", "keurmerken": k, "veranderd": [GV], "opmerking": opmerking,
            "bijgewerkt": bijgewerkt, "nutriscore": list(ns), "bevestigde_codes": sorted(k)}


def onl(bijgewerkt="2026-11-15T09:01:00.000Z"):
    """Exportrecord 'onleesbaar' (keuzes zoals op het scherm stonden; geen bevestigde_codes)."""
    k = keuzes12()
    k[GV] = "afwezig"
    return {"status": "onleesbaar", "keurmerken": k, "veranderd": [], "opmerking": "te klein",
            "bijgewerkt": bijgewerkt}


def opn(bijgewerkt="2026-11-15T09:02:00.000Z"):
    """Tussenstand 'open': een losse keuze zonder Bevestigen."""
    return {"status": "open", "keurmerken": {"GREEN_DOT": "aanwezig"}, "veranderd": ["GREEN_DOT"], "opmerking": "",
            "bijgewerkt": bijgewerkt}


O1, O2, O3 = (eid(n) for n in range(61, 64))
N1, N2, N3, N4, N5 = (eid(n) for n in range(71, 76))
ITEMS = [N1, N2, N3, N4, N5]


def schrijf(tmp_path, uitslag, export, items=ITEMS, indent=1, ensure_ascii=False, aantal=None):
    u = tmp_path / "uitslag.json"
    u.write_text(json.dumps(uitslag, indent=indent, ensure_ascii=ensure_ascii), encoding="utf-8")
    e = tmp_path / "export.json"
    e.write_text(json.dumps({"gedownload": "2026-11-15T12:00:00.000Z",
                             "aantal": len(export) if aantal is None else aantal, "beoordelingen": export}, indent=1))
    it = tmp_path / "items-r12.json"
    it.write_text(json.dumps([{"id": i, "beeld": f"beelden/{i}.png", "hint": [], "voorinvulling": {}} for i in items]
                             if isinstance(items, list) else items))
    return u, e, it


def lees(pad):
    return json.loads(pad.read_text(encoding="utf-8"))


def backups(tmp_path):
    return sorted(tmp_path.glob("uitslag.json.voor-r12-*.json"))


def oude_uitslag():
    return {O1: oud_rec(opmerking="café"), O2: oud_rec(gv="aanwezig"), O3: oud_rec()}


def oude_export():
    return {O1: bev(), O2: bev(), O3: opn()}  # oude records in de opslag: onaangeroerd


@pytest.fixture
def basis(tmp_path):
    export = oude_export()
    export.update({N1: bev(gv="aanwezig"), N2: onl(), N3: opn(), N5: bev(gv="afwezig", ns=())})  # N4 ontbreekt
    return schrijf(tmp_path, oude_uitslag(), export)


def cats(r):
    return {k: v for k, v in r["categorieen"].items() if v}


# --- P0: opnemen ----------------------------------------------------------------------------------------------------
def test_bevestigd_en_onleesbaar_achteraan_in_items_volgorde_open_en_ontbrekend_niet(tmp_path, basis):
    u, e, it = basis
    r = mod().samenvoeg(u, e, it)
    na = lees(u)
    assert list(na) == [O1, O2, O3, N1, N2, N5]
    assert cats(r) == {"toegevoegd_bevestigd": 2, "toegevoegd_onleesbaar": 1, "export_open": 1, "ontbreekt": 1}
    assert sum(r["categorieen"].values()) == len(ITEMS)
    assert r["geschreven"] is True


def test_bevestigd_record_heeft_alle_velden_in_de_vaste_volgorde(tmp_path, basis):
    u, e, it = basis
    mod().samenvoeg(u, e, it)
    x = lees(u)[N1]
    assert list(x) == SLEUTELS_BEVESTIGD
    exp = bev(gv="aanwezig")
    assert x["status"] == "bevestigd" and x["keurmerken"] == exp["keurmerken"]
    assert x["veranderd"] == [GV] and x["opmerking"] == "" and x["nutriscore"] == ["B"]
    assert x["tijd"] == "2026-11-15T09:00:00.123Z"
    assert x["bevestigde_codes"] == CODES13
    assert x["herkomst_etiket"] == {"bron": "artefact-r12", "bijgewerkt": "2026-11-15T09:00:00.123Z"}
    assert "bijgewerkt" not in x and "herkomst_codes" not in x


def test_onleesbaar_record_zonder_bevestigde_codes_en_telt_nergens(tmp_path, basis):
    u, e, it = basis
    r = mod().samenvoeg(u, e, it)
    x = lees(u)[N2]
    assert x["status"] == "onleesbaar" and "bevestigde_codes" not in x
    assert x["opmerking"] == "te klein" and x["tijd"] == "2026-11-15T09:01:00.000Z"
    assert x["herkomst_etiket"] == {"bron": "artefact-r12", "bijgewerkt": "2026-11-15T09:01:00.000Z"}
    import uitslag as us
    assert N2 not in set().union(*(v["met"] | v["zonder"] for v in us.per_keurmerk(lees(u)).values()))
    assert r["per_keurmerk"]["na"]["GREEN_DOT"]["zonder"] == r["per_keurmerk"]["voor"]["GREEN_DOT"]["zonder"] + 2


def test_oude_records_byte_gelijk_en_nieuwe_tekst_begint_met_het_origineel(tmp_path, basis):
    u, e, it = basis
    voor = u.read_text(encoding="utf-8")
    mod().samenvoeg(u, e, it)
    na = u.read_text(encoding="utf-8")
    assert voor.endswith("\n}") and na.startswith(voor[:-2] + ",\n")
    assert all(lees(u)[i] == oude_uitslag()[i] for i in (O1, O2, O3))
    assert "café" in na  # ensure_ascii False blijft


def test_ensure_ascii_uitslag_blijft_ascii(tmp_path):
    export = oude_export()
    export[N1] = bev()
    u, e, it = schrijf(tmp_path, oude_uitslag(), export, ensure_ascii=True)
    voor = u.read_text(encoding="utf-8")
    mod().samenvoeg(u, e, it)
    na = u.read_text(encoding="utf-8")
    assert na.isascii() and na.startswith(voor[:-2] + ",\n")


def test_per_keurmerk_en_gate_c_voor_en_na(tmp_path, basis):
    u, e, it = basis
    import uitslag as us
    voor_stand = us.stand(lees(u))
    r = mod().samenvoeg(u, e, it)
    assert r["per_keurmerk"]["voor"] == voor_stand and r["per_keurmerk"]["na"] == us.stand(lees(u))
    assert r["per_keurmerk"]["na"][GV] == {"met": voor_stand[GV]["met"] + 1, "zonder": voor_stand[GV]["zonder"] + 1}
    assert r["per_keurmerk"]["na"]["NUTRISCORE"]["met"] == voor_stand["NUTRISCORE"]["met"] + 1
    assert r["per_keurmerk"]["na"]["NUTRISCORE"]["zonder"] == voor_stand["NUTRISCORE"]["zonder"] + 1
    g0, g1 = r["gate_c"]["voor"], r["gate_c"]["na"]
    assert g0 == sg()._gate(oude_uitslag())
    assert (g1["met"], g1["zonder_mens"], g1["zonder_ai"]) == (g0["met"] + 1, g0["zonder_mens"] + 1, g0["zonder_ai"])


# --- P0: veiligheid -------------------------------------------------------------------------------------------------
def test_droogloop_schrijft_niets(tmp_path, basis):
    u, e, it = basis
    voor = u.read_bytes()
    r = mod().samenvoeg(u, e, it, droog=True)
    assert u.read_bytes() == voor and backups(tmp_path) == [] and r["geschreven"] is False
    assert r["categorieen"]["toegevoegd_bevestigd"] == 2
    assert r["gate_c"]["na"]["met"] == r["gate_c"]["voor"]["met"] + 1  # het rapport toont wat er zou gebeuren


def test_reservekopie_met_de_originele_bytes(tmp_path, basis):
    u, e, it = basis
    voor = u.read_bytes()
    r = mod().samenvoeg(u, e, it)
    (kopie,) = backups(tmp_path)
    assert kopie.read_bytes() == voor and str(kopie) == str(r["reservekopie"])
    assert list(tmp_path.glob(".uitslag-*.tmp")) == []


def test_tweede_run_verandert_niets(tmp_path, basis):
    u, e, it = basis
    mod().samenvoeg(u, e, it)
    na1 = u.read_bytes()
    r = mod().samenvoeg(u, e, it)
    assert u.read_bytes() == na1 and len(backups(tmp_path)) == 1 and r["geschreven"] is False
    assert cats(r) == {"al_gelijk": 3, "export_open": 1, "ontbreekt": 1}


def test_weigert_als_uitslag_tussen_lezen_en_schrijven_verandert(tmp_path, basis, monkeypatch):
    u, e, it = basis
    m = sg()
    echt = m._herlees

    def tussendoor(pad):
        pad.write_text(pad.read_text(encoding="utf-8").replace('"x"', '"y"'), encoding="utf-8")
        return echt(pad)

    monkeypatch.setattr(m, "_herlees", tussendoor)
    with pytest.raises(ValueError, match="veranderd"):
        mod().samenvoeg(u, e, it)
    assert N1 not in lees(u) and list(tmp_path.glob(".uitslag-*.tmp")) == []


# --- P0: herhalen ---------------------------------------------------------------------------------------------------
def herhaal(tmp_path, nieuw_n1):
    """Eerste run met N1 bevestigd (aanwezig), tweede run met `nieuw_n1` als exportrecord van N1."""
    export = oude_export()
    export[N1] = bev(gv="aanwezig")
    u, e, it = schrijf(tmp_path, oude_uitslag(), export)
    mod().samenvoeg(u, e, it)
    export[N1] = nieuw_n1
    e.write_text(json.dumps({"gedownload": "x", "aantal": len(export), "beoordelingen": export}))
    tekst = u.read_text(encoding="utf-8")
    return u, e, it, tekst, mod().samenvoeg(u, e, it)


def test_strikt_nieuwer_vervangt_op_dezelfde_plek(tmp_path):
    u, e, it, _, r = herhaal(tmp_path, bev(gv="afwezig", bijgewerkt="2026-11-15T10:00:00.000Z"))
    x = lees(u)
    assert list(x) == [O1, O2, O3, N1]
    assert x[N1]["keurmerken"][GV] == "afwezig" and x[N1]["herkomst_etiket"]["bijgewerkt"] == "2026-11-15T10:00:00.000Z"
    assert r["categorieen"]["vervangen"] == 1 and len(backups(tmp_path)) == 2


@pytest.mark.parametrize("nieuw, cat", [
    (bev(gv="afwezig", bijgewerkt="2026-11-15T08:00:00.000Z"), "ouder"),
    (bev(gv="afwezig", bijgewerkt="2026-11-15T09:00:00.123Z"), "ouder"),  # gelijk tijdstip, andere inhoud
    (onl(bijgewerkt="2026-11-15T11:00:00.000Z"), "ingetrokken"),
    (opn(bijgewerkt="2026-11-15T11:00:00.000Z"), "ingetrokken"),
])
def test_ouder_en_ingetrokken_laten_staan(tmp_path, nieuw, cat):
    u, e, it, tekst, r = herhaal(tmp_path, nieuw)
    assert u.read_text(encoding="utf-8") == tekst and r["categorieen"][cat] == 1 and r["geschreven"] is False


def test_eerder_samengevoegd_maar_niet_meer_in_de_export(tmp_path):
    export = oude_export()
    export[N1] = bev()
    u, e, it = schrijf(tmp_path, oude_uitslag(), export)
    mod().samenvoeg(u, e, it)
    export = oude_export()
    export[N2] = onl()
    e.write_text(json.dumps({"gedownload": "x", "aantal": len(export), "beoordelingen": export}))
    r = mod().samenvoeg(u, e, it)
    assert r["categorieen"]["al_samengevoegd_ontbreekt"] == 1 and r["categorieen"]["ontbreekt"] == 3
    assert N1 in lees(u)


def test_record_met_vreemde_sleutels_blijft_staan(tmp_path):
    export = oude_export()
    export[N1] = bev(gv="aanwezig")
    u, e, it = schrijf(tmp_path, oude_uitslag(), export)
    mod().samenvoeg(u, e, it)
    x = lees(u)
    x[N1]["herkomst_codes"] = {GV: {"bron": "artefact"}}
    u.write_text(json.dumps(x, indent=1, ensure_ascii=False), encoding="utf-8")
    export[N1] = bev(gv="afwezig", bijgewerkt="2026-11-15T10:00:00.000Z")
    e.write_text(json.dumps({"gedownload": "x", "aantal": len(export), "beoordelingen": export}))
    tekst = u.read_text(encoding="utf-8")
    r = mod().samenvoeg(u, e, it)
    assert r["categorieen"]["anders_gewijzigd"] == 1 and u.read_text(encoding="utf-8") == tekst


# --- P0: weigeren ---------------------------------------------------------------------------------------------------
def _zonder(r, veld):
    r = dict(r)
    del r[veld]
    return r


WEIGERINGEN = {
    "aantal": lambda: ({N1: bev()}, {"aantal": 99}),
    "vreemd-id": lambda: ({N1: bev(), eid(99): bev()}, {}),
    "geen-items-id": lambda: (oude_export(), {}),
    "onbekend-veld": lambda: ({N1: {**bev(), "extra": 1}}, {}),
    "glutenvrij-ontbreekt": lambda: ({N1: {**bev(), "keurmerken": keuzes12(),
                                           "bevestigde_codes": sorted(LOS12)}}, {}),
    "bevestigde-codes-onvolledig": lambda: ({N1: {**bev(), "bevestigde_codes": sorted(LOS12)}}, {}),
    "nutriscore-ontbreekt": lambda: ({N1: _zonder(bev(), "nutriscore")}, {}),
    "nutriscore-ongeldig": lambda: ({N1: bev(ns=("F",))}, {}),
    "keuze-ongeldig": lambda: ({N1: bev(GREEN_DOT="misschien")}, {}),
    "tijd-zonder-zone": lambda: ({N1: bev(bijgewerkt="2026-11-15T09:00:00")}, {}),
    "tijd-onleesbaar": lambda: ({N1: bev(bijgewerkt="gisteren")}, {}),
    "status-onbekend": lambda: ({N1: {**bev(), "status": "klaar"}}, {}),
    "oud-record-status-onbekend": lambda: ({N1: bev(), O1: {**bev(), "status": "klaar"}}, {}),
    "oud-record-geen-object": lambda: ({N1: bev(), O1: "x"}, {}),
}


@pytest.mark.parametrize("naam", sorted(WEIGERINGEN))
def test_weigering_schrijft_niets(tmp_path, naam):
    nieuw, opties = WEIGERINGEN[naam]()
    export = oude_export()
    if naam == "geen-items-id":
        export = nieuw
    else:
        export.update(nieuw)
    u, e, it = schrijf(tmp_path, oude_uitslag(), export, **opties)
    voor = u.read_bytes()
    with pytest.raises(ValueError):
        mod().samenvoeg(u, e, it)
    assert u.read_bytes() == voor and backups(tmp_path) == [] and list(tmp_path.glob(".uitslag-*.tmp")) == []


@pytest.mark.parametrize("items", [
    {"id": "x"},                                   # geen lijst
    [{"beeld": "b.png"}],                          # geen id
    [{"id": N1}, {"id": N1}],                      # dubbel
])
def test_weigert_vreemde_itemslijst(tmp_path, items):
    export = oude_export()
    export[N1] = bev()
    u, e, it = schrijf(tmp_path, oude_uitslag(), export, items=items)
    voor = u.read_bytes()
    with pytest.raises(ValueError):
        mod().samenvoeg(u, e, it)
    assert u.read_bytes() == voor


def test_weigert_items_id_in_uitslag_zonder_markering(tmp_path):
    export = oude_export()
    export[N1] = bev()
    u, e, it = schrijf(tmp_path, oude_uitslag(), export, items=[O1, O2, N1])
    voor = u.read_bytes()
    with pytest.raises(ValueError, match="markering") as fout:
        mod().samenvoeg(u, e, it)
    assert O1 in str(fout.value) and O2 in str(fout.value) and u.read_bytes() == voor


def test_weigert_export_zonder_beoordelingen(tmp_path, basis):
    u, e, it = basis
    e.write_text(json.dumps({"gedownload": "x", "aantal": 0}))
    with pytest.raises(ValueError):
        mod().samenvoeg(u, e, it)


def test_weigert_uitslag_in_ander_formaat(tmp_path):
    export = oude_export()
    export[N1] = bev()
    u, e, it = schrijf(tmp_path, oude_uitslag(), export, indent=2)
    voor = u.read_bytes()
    with pytest.raises(ValueError, match="byte"):
        mod().samenvoeg(u, e, it)
    assert u.read_bytes() == voor


def test_alle_fouten_in_een_melding(tmp_path):
    export = oude_export()
    export.update({N1: bev(ns=("F",)), N5: bev(bijgewerkt="gisteren")})
    u, e, it = schrijf(tmp_path, oude_uitslag(), export)
    with pytest.raises(ValueError) as fout:
        mod().samenvoeg(u, e, it)
    assert N1 in str(fout.value) and N5 in str(fout.value)


# --- P1: opdrachtregel en bewaking ----------------------------------------------------------------------------------
def test_main_droog_en_weigering(tmp_path, basis, capsys):
    u, e, it = basis
    voor = u.read_bytes()
    assert mod().main(["--uitslag", str(u), "--export", str(e), "--items", str(it), "--droog"]) == 0
    uit = capsys.readouterr().out
    assert "droogloop" in uit and "toegevoegd_bevestigd 2" in uit and "gate C" in uit and GV in uit
    assert u.read_bytes() == voor
    e.write_text("{")
    assert mod().main(["--uitslag", str(u), "--export", str(e), "--items", str(it)]) == 1
    assert "geweigerd" in capsys.readouterr().err


def test_main_echt_meldt_reservekopie(tmp_path, basis, capsys):
    u, e, it = basis
    assert mod().main(["--uitslag", str(u), "--export", str(e), "--items", str(it)]) == 0
    assert "reservekopie" in capsys.readouterr().out and len(backups(tmp_path)) == 1


def test_geen_klantcodes_in_het_script():
    tekst = (HIER / "samenvoeg_r12.py").read_text(encoding="utf-8")
    assert not re.search(r"\d{13,}", tekst) and "/_blob/" not in tekst


def test_samenvoeg_glutenvrij_houdt_zijn_achtervoegsel():
    tekst = (HIER / "samenvoeg_glutenvrij.py").read_text(encoding="utf-8")
    assert "voor-glutenvrij-" in tekst


# --- na review: herhalen over een samengevoegd onleesbaar record, byte-garantie, schrijffout -------------------------
def herhaal_van(tmp_path, eerst, daarna):
    export = oude_export()
    export[N1] = eerst
    u, e, it = schrijf(tmp_path, oude_uitslag(), export)
    mod().samenvoeg(u, e, it)
    export[N1] = daarna
    e.write_text(json.dumps({"gedownload": "x", "aantal": len(export), "beoordelingen": export}))
    tekst = u.read_text(encoding="utf-8")
    return u, tekst, mod().samenvoeg(u, e, it)


def test_open_over_onleesbaar_blijft_staan(tmp_path):
    u, tekst, r = herhaal_van(tmp_path, onl(), opn(bijgewerkt="2026-11-15T12:00:00.000Z"))
    assert r["categorieen"]["export_open"] == 1 and u.read_text(encoding="utf-8") == tekst
    assert lees(u)[N1]["status"] == "onleesbaar"


@pytest.mark.parametrize("daarna, status", [
    (onl(bijgewerkt="2026-11-15T12:00:00.000Z"), "onleesbaar"),
    (bev(bijgewerkt="2026-11-15T12:00:00.000Z"), "bevestigd"),
])
def test_nieuwer_over_onleesbaar_vervangt(tmp_path, daarna, status):
    u, _, r = herhaal_van(tmp_path, onl(), daarna)
    x = lees(u)
    assert r["categorieen"]["vervangen"] == 1 and x[N1]["status"] == status and list(x) == [O1, O2, O3, N1]
    assert x[N1]["herkomst_etiket"]["bijgewerkt"] == "2026-11-15T12:00:00.000Z"


def test_byte_garantie_weigert_en_schrijft_niets(tmp_path, basis, monkeypatch):
    u, e, it = basis
    m = mod()
    echt = m._analyse

    def omgedraaid(*args):
        oud, fmt, rapport, na = echt(*args)
        return oud, fmt, rapport, dict(reversed(list(na.items())))

    monkeypatch.setattr(m, "_analyse", omgedraaid)
    voor = u.read_bytes()
    with pytest.raises(ValueError, match="byte-garantie"):
        m.samenvoeg(u, e, it)
    assert u.read_bytes() == voor and backups(tmp_path) == []


def test_byte_garantie_weigert_gewijzigd_oud_record(tmp_path, basis, monkeypatch):
    u, e, it = basis
    m = mod()
    echt = m._analyse

    def gewijzigd(*args):
        oud, fmt, rapport, na = echt(*args)
        na[O1]["opmerking"] = "anders"  # zelfde object, andere tekst
        return oud, fmt, rapport, na

    monkeypatch.setattr(m, "_analyse", gewijzigd)
    voor = u.read_bytes()
    with pytest.raises(ValueError, match="byte-garantie"):
        m.samenvoeg(u, e, it)
    assert u.read_bytes() == voor


@pytest.mark.parametrize("naam", ["onleesbaar-ongeldige-keuze", "uitslag-status-onbekend", "herkomst-tijd-onleesbaar"])
def test_weigeringen_na_review(tmp_path, naam):
    uitslag, export = oude_uitslag(), oude_export()
    export[N1] = bev()
    if naam == "onleesbaar-ongeldige-keuze":
        export[N2] = {**onl(), "keurmerken": {"GREEN_DOT": "misschien"}}
    elif naam == "uitslag-status-onbekend":
        uitslag[O2] = {**uitslag[O2], "status": "klaar"}
    else:
        uitslag[N1] = {**bev(), "herkomst_etiket": {"bron": "artefact-r12", "bijgewerkt": "gisteren"}}
        del uitslag[N1]["bijgewerkt"]
    u, e, it = schrijf(tmp_path, uitslag, export)
    voor = u.read_bytes()
    with pytest.raises(ValueError):
        mod().samenvoeg(u, e, it)
    assert u.read_bytes() == voor


def test_schrijffout_wordt_weigering(tmp_path, basis, monkeypatch, capsys):
    u, e, it = basis

    def faalt(*a, **k):
        raise PermissionError("geen rechten")

    monkeypatch.setattr(sg(), "schrijf", faalt)
    assert mod().main(["--uitslag", str(u), "--export", str(e), "--items", str(it)]) == 1
    assert "geweigerd" in capsys.readouterr().err


def test_main_noemt_vervangen_ids(tmp_path, capsys):
    export = oude_export()
    export[N1] = bev()
    u, e, it = schrijf(tmp_path, oude_uitslag(), export)
    mod().samenvoeg(u, e, it)
    export[N1] = bev(gv="afwezig", bijgewerkt="2026-11-15T10:00:00.000Z")
    e.write_text(json.dumps({"gedownload": "x", "aantal": len(export), "beoordelingen": export}))
    assert mod().main(["--uitslag", str(u), "--export", str(e), "--items", str(it)]) == 0
    assert f"vervangen 1: {N1}" in capsys.readouterr().out
