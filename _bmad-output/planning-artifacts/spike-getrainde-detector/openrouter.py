"""Eén OpenRouter-client voor voorinvulling, voorlabels/achtergrondscreening en beoordelaar (randvoorwaarden §1-§3).

Elke aanroep gaat naar chat/completions met zdr (`provider = PROVIDER`), nooit naar een batch- of bestands-API. Vóór de
eerste aanroep met klantartwork moet `zdr_proef` met een niet-klantbeeld slagen. Statustabel (§2): 404 en 401/402/403
stoppen de hele run (`RunStop`), 429/5xx/verbindingsfout worden hoogstens 2 keer herhaald, een ongeldig 200-antwoord
is een fout voor dit etiket (`EtiketFout`), nooit een stille "nee". Beelden gaan als PNG of JPEG (type uit de eerste
bytes; elk ander type is een ValueError vóór verzenden); `delen` verdeelt tegels over aanroepen (§5). De sleutel komt
alleen uit de omgeving; logs bevatten nooit sleutel, prompt, beeld of antwoordinhoud. Alleen standaardbibliotheek."""
import base64
import http.client
import json
import logging
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

import kosten

URL = "https://openrouter.ai/api/v1/chat/completions"
PROVIDER = {"zdr": True, "data_collection": "deny"}
K4AA_MODEL = "google/gemini-3.8-flash"
ROLLEN = ("voorinvulling", "voorlabels", "beoordelaar")
TIMEOUT_S = 120
MAX_HERHALINGEN = 2
PROEF_SCHEMA = {"type": "object", "properties": {"zichtbaar": {"type": "boolean"}}, "required": ["zichtbaar"],
                "additionalProperties": False}
STOP = {404: "geen_zdr", 401: "auth", 402: "tegoed", 403: "rechten"}
MAX_BEELD_BYTES = 20_000_000  # beeldbytes per verzoek, overzicht meegeteld, vóór base64 (randvoorwaarden §5)
BEELDTYPE = {b"\xff\xd8\xff": "jpeg", b"\x89PNG\r\n\x1a\n": "png"}  # eerste bytes → type in de data-URL

log = logging.getLogger("proef.openrouter")


class RunStop(Exception):
    """De hele run stopt (geen_zdr, auth, tegoed, rechten, zdr_proef_ontbreekt, zdr_proef_mislukt, budget)."""

    def __init__(self, reden):
        super().__init__(reden)
        self.reden = reden


class EtiketFout(Exception):
    """Fout voor dit etiket; telt als geen melding (meetregels §5)."""

    def __init__(self, klasse, kosten=0.0):
        super().__init__(klasse)
        self.klasse = klasse
        self.kosten = kosten  # al gefactureerde kosten van een ongeldig antwoord (R26)


def delen(groottes, vast=0, max_aantal=16):
    """Verdeel beelden van `groottes` bytes op volgorde over aanroepen (lijst van ranges): per aanroep hoogstens
    `max_aantal` beelden en `vast` (het overzicht) + hun bytes ≤ MAX_BEELD_BYTES. Lege invoer → één aanroep zonder
    tegels. Past het overzicht plus één beeld niet → EtiketFout("te_groot"), dan wordt niets verstuurd."""
    grens, uit, begin, som = MAX_BEELD_BYTES, [], 0, vast
    for i, g in enumerate(groottes):
        if vast + g > grens:
            raise EtiketFout("te_groot")
        if i - begin == max_aantal or som + g > grens:
            uit.append(range(begin, i))
            begin, som = i, vast
        som += g
    return uit + [range(begin, len(groottes))]


def _data_url(beeld):
    for kop, soort in BEELDTYPE.items():
        if beeld.startswith(kop):
            return f"data:image/{soort};base64," + base64.b64encode(beeld).decode()
    raise ValueError("beeld is geen PNG of JPEG; niets verstuurd")


def _urllib(url, body, headers, timeout):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={**headers, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = r.read()
            status = r.status
    except urllib.error.HTTPError as e:
        data, status = e.read(), e.code
    try:
        return status, json.loads(data or b"null")
    except ValueError:
        return status, None


def _antwoord(env, schema):
    """Het JSON-antwoord uit een 200-envelop, of None als het ongeldig, afgekapt of geweigerd is."""
    try:
        keuze = env["choices"][0]
        if keuze.get("finish_reason") != "stop":
            return None
        antwoord = json.loads(keuze["message"]["content"])
    except (TypeError, KeyError, IndexError, ValueError):
        return None
    if not isinstance(antwoord, dict) or any(k not in antwoord for k in schema.get("required", ())):
        return None
    for k, p in schema.get("properties", {}).items():
        if k in antwoord and "enum" in p and antwoord[k] not in p["enum"]:
            return None
    return antwoord


class Client:
    def __init__(self, model, rol, sleutel=None, transport=None, bewaker=None, slaap=time.sleep):
        if rol not in ROLLEN:
            raise ValueError(f"onbekende rol {rol}")
        if rol == "voorinvulling" and model == K4AA_MODEL:
            raise ValueError("de voorinvulling mag niet het taalmodel van K4-aa gebruiken")
        if model not in kosten.TARIEF:  # zonder tarief kan een antwoord zonder usage.cost niet geboekt worden
            raise ValueError(f"model {model} heeft geen tarief in kosten.TARIEF")
        sleutel = sleutel or os.environ.get("OPENROUTER_API_KEY")
        if not sleutel:
            raise RunStop("auth")
        self.model, self.rol, self._sleutel = model, rol, sleutel
        self.transport, self.bewaker, self.slaap = transport or _urllib, bewaker, slaap
        self.proef = None

    def _body(self, tekst, beelden, schema):
        inhoud = [{"type": "text", "text": tekst}] + [{"type": "image_url", "image_url": {"url": _data_url(b)}} for b in beelden]
        return {"model": self.model, "temperature": 0, "messages": [{"role": "user", "content": inhoud}],
                "response_format": {"type": "json_schema", "json_schema": {"name": "antwoord", "strict": True, "schema": schema}},
                "provider": PROVIDER, "usage": {"include": True}}

    def _verstuur(self, body, schema, boek=True):
        headers = {"Authorization": "Bearer " + self._sleutel}
        for poging in range(MAX_HERHALINGEN + 1):
            try:
                status, env = self.transport(URL, body, headers, TIMEOUT_S)
            except (OSError, http.client.HTTPException) as e:  # o.a. IncompleteRead: verbindingsfout, opnieuw
                status, env = None, type(e).__name__
            log.info("aanroep rol=%s model=%s poging=%d status=%s", self.rol, self.model, poging + 1, status)
            if status is None or status == 429 or status >= 500:
                if poging < MAX_HERHALINGEN:
                    self.slaap(2 * (poging + 1))
                    continue
                log.warning("aanbieder faalt na %d pogingen (rol=%s)", poging + 1, self.rol)
                raise EtiketFout("aanbieder")
            if status in STOP:
                log.error("run stopt: status=%s reden=%s", status, STOP[status])
                raise RunStop(STOP[status])
            if status != 200:
                raise EtiketFout("geweigerd")
            prijs = kosten.kosten_uit(env, self.model) if isinstance(env, dict) else 0.0
            if boek and self.bewaker is not None:
                self.bewaker.boek(prijs)
            antwoord = _antwoord(env, schema)
            log.info("antwoord rol=%s geldig=%s kosten=%.5f", self.rol, antwoord is not None, prijs)
            if antwoord is None:
                raise EtiketFout("antwoord_ongeldig", kosten=prijs)
            return antwoord, prijs

    def zdr_proef(self, beeld_png):
        """Proefaanroep met een niet-klantbeeld (een officieel logo); pas daarna mag `vraag` klantartwork sturen."""
        try:  # buiten de post: de proef kost een fractie van een cent en telt niet tegen de grens
            _, prijs = self._verstuur(self._body("Is in deze afbeelding een logo zichtbaar?", [beeld_png], PROEF_SCHEMA),
                                      PROEF_SCHEMA, boek=False)
        except EtiketFout as e:
            log.error("zdr-proef mislukt: %s", e.klasse)
            raise RunStop("zdr_proef_mislukt") from None
        self.proef = {"model": self.model, "tijd": datetime.now(timezone.utc).isoformat(timespec="seconds"), "ok": True,
                      "kosten": prijs}
        return dict(self.proef)

    def vraag(self, tekst, beelden, schema, verwacht=0.0):
        """(antwoord, kosten). Zonder geslaagde zdr-proef of boven de uitgavengrens wordt niets verstuurd."""
        if not self.proef:
            raise RunStop("zdr_proef_ontbreekt")
        if self.bewaker is not None and not self.bewaker.mag(verwacht):
            log.error("uitgavengrens: post=%s uitgegeven=%.4f", self.bewaker.post, self.bewaker.uitgegeven)
            raise RunStop("budget")
        return self._verstuur(self._body(tekst, beelden, schema), schema)
