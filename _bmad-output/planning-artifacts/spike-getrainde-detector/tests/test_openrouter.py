"""ATDD gedeelde OpenRouter-client (randvoorwaarden §1-§3; contract `openrouter.py` in de ATDD-checklist).
Rode fase: `openrouter` bestaat nog niet. Geen netwerk (nagebootst `transport`), geen wachttijd (`slaap` registreert).
Verzonnen beelden en een nepsleutel; geen klantdata."""
import base64
import importlib
import io
import json
import logging

import pytest
from PIL import Image

KEY = "NEP-SLEUTEL-proef-0123456789abcdef"
URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL_PER_ROL = {
    "voorinvulling": "anthropic/claude-sonnet-5.5",
    "voorlabels": "google/gemini-3.8-flash",
    "beoordelaar": "google/gemini-3.8-flash",
}
SCHEMA = {
    "type": "object",
    "properties": {"antwoord": {"type": "string", "enum": ["ja", "nee", "twijfel"]}},
    "required": ["antwoord"],
    "additionalProperties": False,
}


def png(kleur=(30, 120, 60), maat=(16, 12)):
    buf = io.BytesIO()
    Image.new("RGB", maat, kleur).save(buf, "PNG")
    return buf.getvalue()


LOGO = png((0, 128, 0))  # niet-klantbeeld voor de zdr-proef


def envelop(inhoud, finish="stop", cost=0.0021):
    tekst = inhoud if isinstance(inhoud, str) else json.dumps(inhoud)
    return {
        "choices": [{"finish_reason": finish, "message": {"content": tekst}}],
        "usage": {"prompt_tokens": 1200, "completion_tokens": 30, "cost": cost},
        "model": "nep",
    }


def voorbeeld(schema):
    """Minimale waarde die aan een eenvoudig JSON-schema voldoet (voor de zdr-proef, waarvan de client het schema kiest)."""
    if "enum" in schema:
        return schema["enum"][0]
    t = schema.get("type", "object")
    if t == "object":
        return {k: voorbeeld(v) for k, v in schema.get("properties", {}).items()}
    return {"array": [], "string": "x", "boolean": True, "integer": 0, "number": 0}.get(t)


class Nep:
    """Nagebootste transport: elk antwoord is (status, body), een uitzondering, of 'auto' (geldig antwoord op het schema)."""

    def __init__(self, *antwoorden):
        self.antwoorden, self.calls = list(antwoorden), []

    def __call__(self, url, body, headers, timeout):
        self.calls.append({"url": url, "body": body, "headers": headers, "timeout": timeout})
        a = self.antwoorden.pop(0) if self.antwoorden else "auto"
        if isinstance(a, Exception):
            raise a
        if a == "auto":
            schema = body.get("response_format", {}).get("json_schema", {}).get("schema", {"type": "object"})
            return 200, envelop(voorbeeld(schema))
        return a


@pytest.fixture
def orq():
    return importlib.import_module("openrouter")


@pytest.fixture
def maak(orq):
    """Client per rol met nagebootste transport en vastgelegde wachttijden; zdr-proef al geslaagd."""

    def _maak(rol="beoordelaar", *antwoorden, proef=True, **kw):
        nep, slaap = Nep("auto", *antwoorden) if proef else Nep(*antwoorden), []
        c = orq.Client(MODEL_PER_ROL[rol], rol, sleutel=KEY, transport=nep, slaap=slaap.append, **kw)
        if proef:
            c.zdr_proef(LOGO)
        return c, nep, slaap

    return _maak


def test_openrouter_constanten(orq):
    assert orq.URL == URL
    assert orq.PROVIDER == {"zdr": True, "data_collection": "deny"}
    assert orq.K4AA_MODEL == "google/gemini-3.8-flash"
    assert tuple(orq.ROLLEN) == ("voorinvulling", "voorlabels", "beoordelaar")


@pytest.mark.parametrize("rol", list(MODEL_PER_ROL))
def test_openrouter_verzoekvorm_per_rol_elk_beeld_een_eigen_deel(orq, maak, rol):
    c, nep, _ = maak(rol, (200, envelop({"antwoord": "ja"}, cost=0.0042)))
    b1, b2 = png((200, 0, 0)), png((0, 0, 200), (20, 20))
    antwoord, kosten = c.vraag("Staat hier een keurmerk?", [b1, b2], SCHEMA)
    assert antwoord == {"antwoord": "ja"} and kosten == pytest.approx(0.0042)
    call = nep.calls[-1]
    assert call["url"] == URL
    assert call["headers"]["Authorization"] == "Bearer " + KEY
    assert isinstance(call["timeout"], (int, float)) and call["timeout"] > 0
    body = call["body"]
    assert body["model"] == MODEL_PER_ROL[rol] and body["temperature"] == 0
    assert body["provider"] == {"zdr": True, "data_collection": "deny"}
    assert body["usage"] == {"include": True}
    assert body["response_format"] == {
        "type": "json_schema",
        "json_schema": {"name": "antwoord", "strict": True, "schema": SCHEMA},
    }
    assert len(body["messages"]) == 1 and body["messages"][0]["role"] == "user"
    delen = body["messages"][0]["content"]
    assert delen[0] == {"type": "text", "text": "Staat hier een keurmerk?"}
    assert [d["type"] for d in delen[1:]] == ["image_url", "image_url"]
    assert [d["image_url"]["url"] for d in delen[1:]] == [
        "data:image/png;base64," + base64.b64encode(b).decode() for b in (b1, b2)
    ]


@pytest.mark.parametrize("rol", list(MODEL_PER_ROL))
def test_openrouter_altijd_vaste_url_nooit_batch_of_bestanden(maak, rol):
    c, nep, _ = maak(rol)
    for _ in range(3):
        c.vraag("vraag", [png()], SCHEMA)
    assert len(nep.calls) == 4  # zdr-proef + 3 vragen
    assert {x["url"] for x in nep.calls} == {URL}
    assert not any("batch" in x["url"] or "files" in x["url"] for x in nep.calls)
    assert all(x["body"]["provider"] == {"zdr": True, "data_collection": "deny"} for x in nep.calls)


@pytest.mark.parametrize("rol", list(MODEL_PER_ROL))
def test_openrouter_404_stopt_de_run_geen_zdr_zonder_herhaling(orq, maak, rol):
    c, nep, slaap = maak(rol, (404, {"error": {"message": "No endpoints found matching your data policy"}}))
    with pytest.raises(orq.RunStop) as e:
        c.vraag("vraag", [png()], SCHEMA)
    assert e.value.reden == "geen_zdr"
    assert len(nep.calls) == 2 and slaap == []


@pytest.mark.parametrize("status,reden", [(401, "auth"), (402, "tegoed"), (403, "rechten")])
def test_openrouter_401_402_403_stoppen_de_run(orq, maak, status, reden):
    c, nep, slaap = maak("voorinvulling", (status, {"error": {"code": status}}))
    with pytest.raises(orq.RunStop) as e:
        c.vraag("vraag", [png()], SCHEMA)
    assert e.value.reden == reden and len(nep.calls) == 2 and slaap == []


@pytest.mark.parametrize("status", [400, 413, 422])
def test_openrouter_andere_4xx_is_etiketfout_geweigerd(orq, maak, status):
    c, nep, _ = maak("voorlabels", (status, {"error": {"code": status}}))
    with pytest.raises(orq.EtiketFout) as e:
        c.vraag("vraag", [png()], SCHEMA)
    assert e.value.klasse == "geweigerd" and len(nep.calls) == 2


@pytest.mark.parametrize("rol", list(MODEL_PER_ROL))
@pytest.mark.parametrize("fout", [(429, None), (500, None), (503, {"error": "x"}), OSError("verbinding weg"), TimeoutError("tijd op")])
def test_openrouter_429_5xx_oserror_hoogstens_twee_keer_opnieuw(orq, maak, rol, fout):
    c, nep, slaap = maak(rol, fout, fout, fout, (200, envelop({"antwoord": "ja"})))
    with pytest.raises(orq.EtiketFout) as e:
        c.vraag("vraag", [png()], SCHEMA)
    assert e.value.klasse == "aanbieder"
    assert len(nep.calls) == 1 + 3  # zdr-proef + eerste poging + 2 herhalingen
    assert slaap == [2, 4]


def test_openrouter_herstelt_na_een_herhaling(maak):
    c, nep, slaap = maak("beoordelaar", (503, None), (200, envelop({"antwoord": "nee"}, cost=0.001)))
    assert c.vraag("vraag", [png()], SCHEMA) == ({"antwoord": "nee"}, pytest.approx(0.001))
    assert slaap == [2] and len(nep.calls) == 3


ONGELDIG = {
    "geen_json": (200, envelop("ja, dat is hetzelfde keurmerk")),
    "afgekapt": (200, envelop({"antwoord": "ja"}, finish="length")),
    "inhoudsfilter": (200, envelop({"antwoord": "ja"}, finish="content_filter")),
    "weigering": (200, {"choices": [{"finish_reason": "stop", "message": {"content": None, "refusal": "Dat kan ik niet"}}], "usage": {"cost": 0.001}}),
    "geen_keuzes": (200, {"choices": [], "usage": {"cost": 0.0}}),
    "lege_body": (200, None),
    "verplicht_veld_ontbreekt": (200, envelop({})),
}


@pytest.mark.parametrize("geval", list(ONGELDIG))
def test_openrouter_ongeldig_200_is_etiketfout_nooit_nee(orq, maak, geval):
    c, nep, slaap = maak("beoordelaar", ONGELDIG[geval])
    with pytest.raises(orq.EtiketFout) as e:
        c.vraag("vraag", [png()], SCHEMA)
    assert e.value.klasse == "antwoord_ongeldig"
    assert len(nep.calls) == 2 and slaap == []  # niet opnieuw geprobeerd


def test_openrouter_logt_nooit_sleutel_prompt_beeld_of_antwoord(orq, maak, caplog):
    caplog.set_level(logging.DEBUG)
    prompt, beeld = "GEHEIME-PROMPT-tekst-7f3a", png((11, 22, 33), (31, 17))
    geheim_antwoord = "twijfel"
    c, _, _ = maak("voorinvulling", (200, envelop({"antwoord": geheim_antwoord})), (500, None), (500, None), (500, None))
    c.vraag(prompt, [beeld], SCHEMA)
    with pytest.raises(orq.EtiketFout) as e:
        c.vraag(prompt, [beeld], SCHEMA)
    assert any(r.name == "proef.openrouter" for r in caplog.records)
    tekst = caplog.text + " ".join(str(r.args) for r in caplog.records)
    assert KEY not in tekst and prompt not in tekst
    assert base64.b64encode(beeld).decode()[:40] not in tekst
    assert json.dumps({"antwoord": geheim_antwoord}) not in tekst and '"twijfel"' not in tekst
    assert KEY not in str(e.value) and prompt not in str(e.value)


def test_openrouter_vraag_voor_zdr_proef_stopt_de_run_zonder_verzenden(orq, maak):
    c, nep, _ = maak("voorinvulling", proef=False)
    with pytest.raises(orq.RunStop) as e:
        c.vraag("vraag", [png()], SCHEMA)
    assert e.value.reden == "zdr_proef_ontbreekt" and nep.calls == []


def test_openrouter_zdr_proef_legt_uitkomst_vast_met_niet_klantbeeld(orq):
    nep = Nep("auto")
    c = orq.Client(MODEL_PER_ROL["voorlabels"], "voorlabels", sleutel=KEY, transport=nep, slaap=lambda s: None)
    uitkomst = c.zdr_proef(LOGO)
    assert uitkomst["model"] == MODEL_PER_ROL["voorlabels"] and uitkomst["ok"] is True
    assert isinstance(uitkomst["tijd"], str) and uitkomst["tijd"]
    body = nep.calls[0]["body"]
    assert nep.calls[0]["url"] == URL and body["provider"] == {"zdr": True, "data_collection": "deny"}
    urls = [d["image_url"]["url"] for d in body["messages"][0]["content"] if d["type"] == "image_url"]
    assert urls == ["data:image/png;base64," + base64.b64encode(LOGO).decode()]


@pytest.mark.parametrize("fout", [(200, envelop("geen json")), (500, None)])
def test_openrouter_mislukte_zdr_proef_stopt_en_verstuurt_geen_klantartwork(orq, fout):
    nep = Nep(fout, fout, fout)
    c = orq.Client(MODEL_PER_ROL["beoordelaar"], "beoordelaar", sleutel=KEY, transport=nep, slaap=lambda s: None)
    with pytest.raises(orq.RunStop) as e:
        c.zdr_proef(LOGO)
    assert e.value.reden == "zdr_proef_mislukt"
    aantal = len(nep.calls)
    with pytest.raises(orq.RunStop) as e2:
        c.vraag("klantartwork", [png()], SCHEMA)
    assert e2.value.reden == "zdr_proef_ontbreekt" and len(nep.calls) == aantal


def test_openrouter_voorinvulling_weigert_het_k4aa_model(orq):
    with pytest.raises(ValueError):
        orq.Client(orq.K4AA_MODEL, "voorinvulling", sleutel=KEY, transport=Nep())
    for rol in ("voorlabels", "beoordelaar"):
        assert orq.Client(orq.K4AA_MODEL, rol, sleutel=KEY, transport=Nep()) is not None


def test_openrouter_sleutel_alleen_uit_de_omgeving(orq, monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(orq.RunStop) as e:
        orq.Client(MODEL_PER_ROL["beoordelaar"], "beoordelaar", transport=Nep())
    assert e.value.reden == "auth"
    monkeypatch.setenv("OPENROUTER_API_KEY", "NEP-UIT-OMGEVING-42")
    nep = Nep()
    c = orq.Client(MODEL_PER_ROL["beoordelaar"], "beoordelaar", transport=nep, slaap=lambda s: None)
    c.zdr_proef(LOGO)
    assert nep.calls[0]["headers"]["Authorization"] == "Bearer NEP-UIT-OMGEVING-42"


def test_openrouter_bewaker_houdt_de_aanroep_tegen_die_de_grens_passeert(orq, maak):
    kosten = importlib.import_module("kosten")
    bewaker = kosten.Bewaker("beoordelaar", raming=1.0)  # grens 1,5
    c, nep, _ = maak("beoordelaar", (200, envelop({"antwoord": "ja"}, cost=0.03)), bewaker=bewaker)
    bewaker.boek(1.40)
    voor = len(nep.calls)
    c.vraag("vraag", [png()], SCHEMA, verwacht=0.05)  # 1,45 <= 1,5: verstuurd en geboekt
    assert len(nep.calls) == voor + 1 and bewaker.uitgegeven == pytest.approx(1.43)
    with pytest.raises(orq.RunStop) as e:
        c.vraag("vraag", [png()], SCHEMA, verwacht=0.08)  # 1,51 > 1,5: niet verstuurd
    assert e.value.reden == "budget" and len(nep.calls) == voor + 1
    assert bewaker.uitgegeven == pytest.approx(1.43)
