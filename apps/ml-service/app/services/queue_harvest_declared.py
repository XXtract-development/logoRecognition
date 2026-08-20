"""Story 20.2 — Generieke declaratie-gedreven oogst (categorie-3-uitrol en verder).

Generalisatie van het bewezen 12.15-patroon (``queue_harvest_nutriscore_declared``):
de kandidaat-bron is een code->GTIN-lijst-map in MinIO — gebouwd uit een
declaratie-METING (20.1: prod-Mongo als bron van waarheid) — en dus NIET de
mismatch-events. Dat dicht het 20.2-gat: de 17.1-bootstrap haalt kandidaten uit
``declared-not-found``-events, die voor een nooit-eerder-herkend veld per
definitie niet bestaan ("run leeg").

Per (code, gtin)-paar wordt de beste artwork-regio gezocht met de similarity-
pool STRIKT gescoped op de eigen referenties van die code (gids-zaad en/of door
mensen bevestigde echte crops — conditie C/19.9 doet dan vanzelf zijn werk in
``find_similar_references_by_codes``). Het label komt uit de DECLARATIE, nooit
uit de match.

Kernverschillen met de Nutri-Score-variant (bewust):
  * map-formaat ``{"codes": {code: [gtin, ...]}}`` — een GTIN mag onder
    meerdere codes staan (alcohol declareert zwangerschap + niet-rijden + 18+);
    elk (code, gtin)-paar is een eigen werk-eenheid.
  * idempotentie-marker per code (``declared-harvest:<code>``): dezelfde pagina
    mag per gedeclareerde code één kandidaat opleveren, maar nooit twee voor
    dezelfde code (dedup via ``review_item_exists``; READ, draait ook in
    DRY_RUN zodat de telling de echte run voorspelt).
  * geen prioriteits-codes: de scope is al expliciet (env of hele map).

Env (namespace ``DECLARED_HARVEST_``):
  DECLARED_HARVEST_MAP_KEY       MinIO-sleutel van de code->GTINs map
                                  (default flywheel-index/declared-harvest-map.json)
  DECLARED_HARVEST_CODES         comma-lijst; leeg = alle codes uit de map
  DECLARED_HARVEST_FLOOR         cosine-vloer (default 0.60 — gids-zaad-niveau,
                                  patroon 12.15; declaratie is de prior)
  DECLARED_HARVEST_BATCH         (code,gtin)-paren per run (default 400)
  DECLARED_HARVEST_PER_CODE_CAP  max kandidaten per code per run (default 15)
  DECLARED_HARVEST_MAX_SECONDS   tijd-box (default 1000)
  DECLARED_HARVEST_DRY_RUN       1/true/yes -> geen crop-upload, geen INSERT,
                                  geen state-write, GEEN vastlegging; kandidaten
                                  wel geteld
  DECLARED_HARVEST_LOCK_MAX_AGE_SECONDS
                                  ONDERGRENS voor hoe lang een achtergebleven
                                  run-marker een tweede start blokkeert (default
                                  21600 = 6 uur; <= 0 laat hem nooit vervallen).
                                  Een run met een groter tijdsbudget zet zijn
                                  eigen, ruimere vervaltijd in de marker.
  DECLARED_HARVEST_LOCK_GRACE_SECONDS
                                  marge bovenop MAX_SECONDS voor die vervaltijd
                                  (default 1800)

Story 20.20 — wat deze oogst sinds 20.20 ONTHOUDT (AC4/AC5):
  De ontdubbeling via ``review_item_exists`` onthield alleen paren die een item
  OPLEVERDEN. De paren die zijn nagekeken en niets opleverden stonden nergens en
  werden elke ronde opnieuw doorgerekend (~28 s per paar). De tabel
  ``declared_harvest_checks`` vult dat gat, met onderscheid tussen een BLIJVEND
  oordeel (kandidaat aangemaakt, keyline-pagina) en een VOORLOPIG oordeel (onder
  de drempel, cross-code afgewezen) dat alleen telt zolang de referentiepool van
  de code niet veranderd is. "Cap bereikt" is een runbudget en wordt nooit
  vastgelegd.

  De controle staat VOOR het dure werk en filtert de HELE paginagroep: de pagina
  wordt per groep één keer geladen en gelokaliseerd, dus een overslag per paar
  zou het decoderen niet besparen.

EIGENAARSCHAP VAN BESTANDEN (AC5): deze module — de ml-service — is de enige
schrijver van ``keurmerk-harvest/declared-harvest-state.json``. De kaartbouwer
(``apps/api/src/scripts/build-declared-harvest-map.ts``) schrijft uitsluitend de
kaart en LEEST dit bestand alleen om te melden wat er staat te gebeuren.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import time
from collections import defaultdict

import cv2
import numpy as np

from app.core.logging import logger

STATE_KEY = "keurmerk-harvest/declared-harvest-state.json"
# Story 20.20 (AC5) — vastgelegd eigenaarschap: dit bestand wordt door de
# ml-service geschreven, nooit door de kaartbouwer aan de api-kant.
STATE_OWNER = "ml-service (app.services.queue_harvest_declared)"
DECLARED_MAP_KEY = os.environ.get(
    "DECLARED_HARVEST_MAP_KEY", "flywheel-index/declared-harvest-map.json"
)
FLOOR = float(os.environ.get("DECLARED_HARVEST_FLOOR", "0.60"))
BATCH = int(os.environ.get("DECLARED_HARVEST_BATCH", "400"))
PER_CODE_CAP = int(os.environ.get("DECLARED_HARVEST_PER_CODE_CAP", "15"))
MAX_SECONDS = float(os.environ.get("DECLARED_HARVEST_MAX_SECONDS", "1000"))
DRY_RUN = os.environ.get("DECLARED_HARVEST_DRY_RUN", "").lower() in ("1", "true", "yes")
# Story 20.7 — cross-code-discriminatie: verwerp een regio die ONgescopet op een
# ANDERE (naast-liggende, gelijkende) code met minstens deze marge beter lijkt dan
# op de gedeclareerde code. De scoped floor-match garandeert alleen dat de regio
# OP de code lijkt, niet dat hij niet nóg meer op een buur-icoon lijkt (auto/18+/
# zwangerschap staan naast elkaar en lijken ~0,6 op elkaar in de grove embedding).
CROSS_CODE_MARGIN = float(os.environ.get("DECLARED_HARVEST_CROSS_CODE_MARGIN", "0.03"))
# Story 20.9 — keyline-guard: een technische snijlijn-/cutter-pagina (nauwelijks
# bedrukte inhoud, lege panelen) mag geen kandidaten opleveren. Detail-maat =
# gecomprimeerde-PNG-bytes-per-pixel; keyline-sheets liggen ~0,01-0,02, echt
# bedrukt artwork ~0,10-0,29 (gemeten). Env-drempel; <= 0 schakelt de guard uit.
KEYLINE_MAX_BPP = float(os.environ.get("DECLARED_HARVEST_KEYLINE_MAX_BPP", "0.03"))
HARVEST_CODES = {
    c.strip().upper()
    for c in os.environ.get("DECLARED_HARVEST_CODES", "").split(",")
    if c.strip()
}


def _marker(code: str) -> str:
    """Idempotentie-reason per code — zie moduledoc (AC2)."""
    return f"declared-harvest:{code}"


def _page_detail_bpp(img) -> float:
    """Detail-maat van een pagina: gecomprimeerde-PNG-bytes per pixel (Story 20.9).
    Vlakke keyline-/cutter-sheets comprimeren extreem (lage bpp); echt bedrukt
    artwork heeft veel detail (hoge bpp). Retourneert 0.0 bij een lege pagina."""
    h, w = img.shape[:2]
    if h * w == 0:
        return 0.0
    ok, buf = cv2.imencode(".png", img)
    if not ok:
        return 0.0
    return len(buf) / float(h * w)


def _is_keyline(detail: float, threshold: float) -> bool:
    """True als de pagina onder de detail-drempel ligt (technische keyline-sheet).
    threshold <= 0 schakelt de guard uit (Story 20.9, AC4). Strikt `<` zodat een
    pagina precies op de drempel als 'genoeg detail' telt."""
    if threshold <= 0:
        return False
    return detail < threshold


def _cross_code_rejected(declared_code, declared_sim, open_matches, margin) -> bool:
    """True als een ANDERE code de regio (ongescopet) met >= marge beter matcht
    dan de gedeclareerde code — dan is het een look-alike buur-icoon (Story 20.7).

    Pure beslissing, exhaustief getest. `open_matches` = ongescopete nearest-
    reference-resultaten ({t3777_code, similarity}). Leeg / geen sterkere rivaal
    (o.a. cold-start van andere codes) -> False (behouden).
    """
    for m in open_matches:
        if (
            m.get("t3777_code") != declared_code
            and float(m.get("similarity", 0.0)) >= declared_sim + margin
        ):
            return True
    return False


# ---------------------------------------------------------------------------
# Story 20.20 — onthouden wat er is nagekeken, en één oogst tegelijk
# ---------------------------------------------------------------------------

# De uitkomsten die vastgelegd worden. "Cap bereikt" staat er bewust NIET bij:
# dat is een runbudget en geen oordeel — vastleggen zou het paar voorgoed
# uitsluiten omdat er die nacht toevallig genoeg andere waren, en daarom telt zo'n
# paar ook niet als afgehandeld.
OUTCOME_CANDIDATE = "candidate"
OUTCOME_KEYLINE = "keyline"
# Een paar waarvoor er AL een review-item stond. Dezelfde houdbaarheid als
# "kandidaat aangemaakt", maar bewust een eigen waarde: "er stond al iets" en "ik
# heb zojuist iets aangemaakt" zijn verschillende herkomsten, en met één gedeelde
# waarde is later niet meer te verklaren waar een rij vandaan komt.
OUTCOME_EXISTING_ITEM = "existing_item"
OUTCOME_BELOW_FLOOR = "below_floor"
OUTCOME_CROSS_CODE = "cross_code"

# BLIJVEND: een aangemaakte kandidaat staat al in de wachtrij (opnieuw aanmaken
# is een duplicaat), een paar dat al een item had staat er per definitie ook, en
# of een pagina een technische keyline-sheet is (20.9) is een eigenschap van die
# pagina zelf — geen van drieën draait ooit om.
PERMANENT_OUTCOMES = frozenset(
    {OUTCOME_CANDIDATE, OUTCOME_EXISTING_ITEM, OUTCOME_KEYLINE}
)
# VOORLOPIG: allebei oordelen tegen de referentiepool van DAT moment. Het hele
# punt van het vliegwiel is dat die pool groeit — een menselijk akkoord levert een
# nieuwe referentie op — dus een paar dat vandaag onder de drempel blijft kan
# morgen wél matchen. Blijvend onthouden zou de oogst afsluiten voor precies de
# verbetering die hij zelf voortbrengt.
PROVISIONAL_OUTCOMES = frozenset({OUTCOME_BELOW_FLOOR, OUTCOME_CROSS_CODE})

# Story 20.20 (AC8) — hoe lang een achtergebleven run-marker een tweede start
# tegenhoudt. SIGKILL kent geen handler, dus een OOM laat de marker staan; zonder
# verval zou één gesneuvelde run de oogst voorgoed stoppen. <= 0 laat de marker
# nooit vervallen.
LOCK_MAX_AGE_SECONDS = float(
    os.environ.get("DECLARED_HARVEST_LOCK_MAX_AGE_SECONDS", "21600")
)

# Marge bovenop het eigen tijdsbudget van een run. Het budget begrenst alleen het
# starten van een nieuwe paginagroep; de groep die al bezig is loopt af, en de
# slot-flush erna schrijft nog crops en rijen weg.
LOCK_GRACE_SECONDS = float(
    os.environ.get("DECLARED_HARVEST_LOCK_GRACE_SECONDS", "1800")
)


def _lock_max_age_for_run() -> float:
    """Vervaltijd die DEZE run in zijn eigen marker legt (AC8).

    De standaardvervaltijd is zes uur, maar de eenmalige inhaalronde krijgt een
    tijdsbudget van tien uur mee. Met een vaste constante verviel de marker dus
    midden in die inhaalronde en startte de nachtelijke cron een TWEEDE
    declaratie-oogst in dezelfde 8 GiB-container — exact het OOM-recept dat AC8
    moet uitsluiten, en met de zwaarste run als slachtoffer.

    De vervaltijd hoort daarom bij de run die de marker zet, niet bij de run die
    hem léést: de lezer heeft zijn eigen (kleine) budget en weet niets van dat
    van de ander. Vandaar dat de marker zijn eigen vervaltijd draagt, afgeleid
    uit het tijdsbudget van deze run plus een marge voor de afronding.

    ``LOCK_MAX_AGE_SECONDS <= 0`` betekent bewust "nooit vervallen"; dat blijft
    ongemoeid.
    """
    if LOCK_MAX_AGE_SECONDS <= 0:
        return 0.0
    return max(LOCK_MAX_AGE_SECONDS, MAX_SECONDS + LOCK_GRACE_SECONDS)


def _is_permanent(outcome: str) -> bool:
    """True als deze uitkomst blijvend waar is (Story 20.20, AC4)."""
    return outcome in PERMANENT_OUTCOMES


def _already_checked(record, current_fingerprint) -> bool:
    """Telt een eerder oordeel nog, gegeven de referentiepool van nu?

    Geen vastlegging -> nooit overslaan. Blijvend -> altijd overslaan. Voorlopig
    -> alleen overslaan zolang de vingerafdruk van de referentiepool ongewijzigd
    is; is hij veranderd (of onbekend), dan wordt het paar opnieuw bekeken.
    """
    if not record:
        return False
    if record.get("permanent"):
        return True
    fp = record.get("fingerprint")
    return bool(fp) and bool(current_fingerprint) and fp == current_fingerprint


def _lock_held(state: dict, now: float, max_age: float) -> bool:
    """True als er een oogstrun loopt die een tweede start moet weigeren (AC8).

    De twee oogsters delen één ml-service-container van 8 GiB en de declaratie-
    oogst breekt zichzelf af boven 75% daarvan; twee tegelijk is dus een
    OOM-recept. Een run die het slot niet krijgt STOPT — hij wacht niet.

    Een marker zonder leesbaar starttijdstip telt als "vast": liever een run te
    veel geweigerd dan twee tegelijk gedraaid.

    De marker draagt zijn EIGEN vervaltijd (``lock_max_age_seconds``, gezet door
    de run die hem schreef); die gaat vóór de constante van de lezer. Zonder dat
    beoordeelt een nachtelijke run met een budget van 1000 seconden de marker van
    een inhaalronde van tien uur met zijn eigen zes-uursgrens — en start hij er
    dus alsnog een tweede naast.
    """
    if not state.get("in_progress"):
        return False
    recorded = state.get("lock_max_age_seconds")
    if recorded is not None:
        try:
            max_age = float(recorded)
        except (TypeError, ValueError):
            pass
    if max_age <= 0:
        return True
    started = state.get("run_started_at")
    if not started:
        return True
    try:
        import calendar

        epoch = calendar.timegm(time.strptime(str(started), "%Y-%m-%dT%H:%M:%SZ"))
    except Exception:
        return True
    return (now - epoch) < max_age


def _counter_reset_needed(state: dict, map_signature: str) -> bool:
    """Moet de teller terug omdat de parenlijst in de KAART veranderd is? (AC5)

    Vastgesteld op de paren in de KAART en niet op de door artwork gefilterde
    paren: die tweede hangt af van wat er die nacht in de opslag staat en zou de
    teller om niets laten terugspringen.

    Op de PARENLIJST en niet op een telling. Twee kaarten met evenveel maar
    andere paren — bij een wekelijkse herbouw uit een levende index geen
    uitzondering: één product eruit, één erin — lieten de teller staan, terwijl
    de offset daarna in een ándere lijst wees: alles vóór de offset werd nooit
    bekeken en de run meldde gewoon ``complete``. Stil, en niet zelfherstellend
    zolang de telling toevallig gelijk bleef.

    Draagt het voortgangsbestand nog geen vingerafdruk, dan doet deze oogst geen
    uitspraak — dat is de eerste run ná 20.20, en het eenmalig terugzetten van de
    teller is daar een bewuste, toestemmingsplichtige handeling (deel B).
    """
    recorded = state.get("map_signature")
    if recorded is None:
        return False
    return str(recorded) != str(map_signature)


# ---------------------------------------------------------------------------
# Story 20.11 — geheugenbewaking (AC4)
# ---------------------------------------------------------------------------

# Stop gecontroleerd zodra het cgroup-geheugen boven deze fractie van de limiet
# komt. Bewust de CGROUP meten en niet de eigen RSS: de limiet wordt gedeeld met
# de draaiende ml-service, dus "mijn eigen RSS is nog laag" zegt niets over de
# ruimte die er nog is. 0 of leeg schakelt de bewaking uit.
MEM_STOP_FRACTION = float(os.environ.get("DECLARED_HARVEST_MEM_STOP_FRACTION", "0.75"))

# Elke N verwerkte paren: eerst flushen (crops + rijen), dan pas checkpointen.
FLUSH_EVERY = int(os.environ.get("DECLARED_HARVEST_FLUSH_EVERY", "25"))


def _read_int(path: str):
    try:
        with open(path) as fh:
            v = fh.read().strip()
        return None if v in ("max", "") else int(v)
    except Exception:
        return None


def cgroup_memory() -> tuple:
    """
    (gebruik, limiet) in bytes uit de cgroup, of (None, None) als het niet leesbaar
    is. Ondersteunt cgroup v2 (memory.current/memory.max) én v1
    (memory.usage_in_bytes/memory.limit_in_bytes). Geen extra dependency.
    """
    use = _read_int("/sys/fs/cgroup/memory.current")
    lim = _read_int("/sys/fs/cgroup/memory.max")
    if use is None:
        use = _read_int("/sys/fs/cgroup/memory/memory.usage_in_bytes")
        lim = _read_int("/sys/fs/cgroup/memory/memory.limit_in_bytes")
    # v1 zonder limiet zet een absurd hoog getal; behandel dat als "geen limiet".
    if lim is not None and lim > (1 << 62):
        lim = None
    return use, lim


def memory_pressure(fraction: float = None) -> bool:
    """True zodra het cgroup-gebruik boven de drempel komt (AC4)."""
    frac = MEM_STOP_FRACTION if fraction is None else fraction
    if frac <= 0:
        return False
    use, lim = cgroup_memory()
    if not use or not lim:
        return False
    return (use / lim) >= frac


def _crop_bgr(img, b):
    """
    Identiek aan queue_harvest*(.py)'s helper (bewust lokaal).

    Story 20.11 — geeft een LOSGEKOPPELDE kopie terug, geen numpy-view. Een view
    houdt de VOLLEDIGE pagina-array in leven zolang de crop bestaat; omdat crops tot
    de insert in `queue` blijven staan, hield één batch daardoor tot ~105 hele
    artworks tegelijk vast (OOM-kill op ACC, 7,03 GB bij een limiet van 8 GiB die
    gedeeld wordt met de draaiende service). Een crop is enkele KB's, de pagina vele
    MB's — de kopie is dus verwaarloosbaar en snijdt de koppeling door.
    Invariant: `crop.base is None`.
    """
    x, y, w, h = b
    x, y = max(0, x), max(0, y)
    c = img[y : y + h, x : x + w]
    if not (c.size and c.shape[0] >= 4 and c.shape[1] >= 4):
        return None
    return c.copy()


def _pick_page(keys):
    """Identiek aan queue_harvest*(.py)'s helper (bewust lokaal)."""
    ks = sorted(k for k in keys if k.lower().endswith((".png", ".jpg", ".jpeg")))
    for k in ks:
        if "converted-0" in k:
            return k
    for k in ks:
        if re.search(r"_0*1\.(png|jpe?g)$", k, re.I):
            return k
    return ks[0] if ks else None


class DeclaredMapUnavailable(Exception):
    """De kaart is niet te lezen, of hij is leeg (Story 20.20, AC5).

    Bewust een storing en géén "kaart van nul paren". De oude fail-safe gaf bij
    een leesfout een lege dict terug; sinds de teller op de parenlijst let liep
    dat door in een lege vingerafdruk, zette de oogst zijn teller op 0 en meldde
    hij ``complete`` — hetzelfde woord als een geslaagde volledige ronde. Eén
    hikje in de objectopslag gooide zo de voortgang weg. Nu stopt de run met een
    eigen status en blijft de teller ongemoeid.
    """

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def _load_declared_map(storage_service) -> dict:
    """Laad de code->GTIN-lijst map.

    Fail-LOUD: onleesbaar, misvormd of leeg -> ``DeclaredMapUnavailable``. Er is
    geen zinnige run zonder kaart, en stil doorgaan zou de voortgang wissen.
    """
    try:
        raw = storage_service.get_training_image(DECLARED_MAP_KEY)
        data = json.loads(
            raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else raw
        )
    except Exception as exc:
        logger.error(
            "Declaratie-oogst-map niet leesbaar — de run stopt",
            extra={"key": DECLARED_MAP_KEY, "error": str(exc)},
        )
        raise DeclaredMapUnavailable("unreadable") from exc
    codes = data.get("codes") if isinstance(data, dict) else None
    if not isinstance(codes, dict):
        raise DeclaredMapUnavailable("malformed")
    out: dict = {}
    for code, gtins in codes.items():
        code_u = str(code).strip().upper()
        if not code_u or not isinstance(gtins, list):
            continue
        clean = sorted({str(g).strip() for g in gtins if str(g).strip()})
        if clean:
            out[code_u] = clean
    if not out:
        raise DeclaredMapUnavailable("empty")
    return out


def _scoped_pairs(declared_map: dict) -> list:
    """Deterministische (code, gtin)-parenlijst binnen de env-scope."""
    pairs = []
    for code in sorted(declared_map):
        if HARVEST_CODES and code not in HARVEST_CODES:
            continue
        for gtin in declared_map[code]:
            pairs.append((code, gtin))
    return pairs


def _all_pairs(declared_map: dict) -> list:
    """Deterministische (code, gtin)-parenlijst over de HELE kaart.

    LOS van ``DECLARED_HARVEST_CODES``. De vingerafdruk van de kaart hoort niet
    van de scope van de draaiende run af te hangen: één handmatige debugrun met
    ``DECLARED_HARVEST_CODES=FSC`` legde anders de vingerafdruk van dat ene
    stukje vast, waarna de eerstvolgende nachtelijke run zijn teller om niets
    terugzette — en de nacht daarna opnieuw.
    """
    return [
        (code, gtin) for code in sorted(declared_map) for gtin in declared_map[code]
    ]


def _map_signature(declared_map: dict) -> str:
    """Exacte vingerafdruk van de parenlijst in de kaart (AC5).

    Vorm ``"<aantal>|<md5 over de paren>"``: het aantal blijft leesbaar in de
    logs, het digest maakt "verandert" exact in plaats van benaderd.
    """
    pairs = _all_pairs(declared_map)
    digest = hashlib.md5(
        "\n".join(f"{c}\t{g}" for c, g in pairs).encode("utf-8")
    ).hexdigest()
    return f"{len(pairs)}|{digest}"


def page_order(groups: dict) -> list:
    """
    Story 20.11 — volgorde van de pagina-groepen: op de KLEINSTE oorspronkelijke
    paar-index, NIET op de paginasleutel.

    Dat is geen cosmetiek. De offset is een aaneengesloten prefix over de
    OORSPRONKELIJKE parenlijst, dus de groep die `next_offset` bevat moet als
    eerste verwerkt worden. Sorteren op paginasleutel gaf een LIVELOCK: brak de
    run vroeg af (timebox of geheugenstop), dan bleef `to_offset == from_offset`
    en deed de volgende run exact hetzelfde werk opnieuw — stil, want dedup
    blokkeert dubbele rijen. Op ACC is de timebox het NORMALE pad (173 paren,
    ~28 s/paar tegen MAX_SECONDS=1000), geen randgeval.

    Deterministisch: paar-indices zijn uniek, dus de sleutel is een totale orde.
    """
    return sorted(groups, key=lambda src: min(groups[src]))


async def _flush(queue: dict, db_service, storage_service) -> int:
    """
    Story 20.11 (AC3) — schrijf de opgebouwde kandidaten weg en LEEG de queue.

    Wordt tussentijds aangeroepen (elke FLUSH_EVERY paren) én aan het eind. Het
    legen is essentieel: de queue houdt crop-arrays vast, en zonder legen zou het
    geheugen alsnog met de batch meegroeien. Retourneert het aantal ingevoegde rijen.
    In DRY_RUN wordt niets geschreven en blijft de queue staan (de telling moet de
    echte run blijven voorspellen).
    """
    if DRY_RUN:
        return 0
    n = 0
    async with db_service.pool.acquire() as conn:
        for code, items in queue.items():
            for r in items:
                ok, buf = cv2.imencode(".png", r["crop"])
                if not ok:
                    continue
                crop_key = f"artwork-crops/{r['gtin']}/20_2_{r['cid']}.png"
                storage_service.put_training_image(crop_key, buf.tobytes())
                await conn.execute(
                    """
                    INSERT INTO artwork_review_items
                      (gtin, t3777_code, crop_path, bbox, confidence, method, reason, source_file, status, updated_at)
                    VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, 'open', now())
                    """,
                    r["gtin"],
                    code,
                    crop_key,
                    json.dumps(r["bbox"]),
                    r["confidence"],
                    "embedding-declared",
                    _marker(code),
                    r["sourceFile"],
                )
                n += 1
    queue.clear()
    return n


async def _flush_checks(pending: list, db_service) -> int:
    """Story 20.20 (AC4) — leg de nagekeken paren vast en LEEG de lijst.

    Meelopend met ``_flush`` zodat de vastlegging nooit ver voor of achter de
    ingevoegde rijen aan loopt. In DRY_RUN wordt er niets geschreven: een
    droogloop moet de echte run voorspellen, niet veranderen.
    """
    if DRY_RUN or not pending:
        return 0
    n = await db_service.record_declared_harvest_checks(list(pending))
    pending.clear()
    return n


def _checkpoint(
    state: dict, storage_service, reached: int, total: int, done: bool = False
) -> None:
    """
    Story 20.11 (AC3) — offset wegschrijven. ALTIJD ná een flush aanroepen, nooit
    ervoor: de offset mag nooit voorlopen op de daadwerkelijk ingevoegde rijen.
    `done=True` ruimt de run-marker op — blijft die staan, dan is de vorige run hard
    afgebroken.
    """
    if DRY_RUN:
        return
    state["next_offset"] = reached
    state["total_pairs"] = total
    if done:
        _clear_lock_fields(state)
    storage_service.put_training_image(
        STATE_KEY, json.dumps(state).encode("utf-8"), "application/json"
    )


def _clear_lock_fields(state: dict) -> None:
    """Haal de run-marker uit de stand (in-memory; schrijven doet de aanroeper)."""
    state.pop("in_progress", None)
    state.pop("run_started_at", None)
    state.pop("lock_max_age_seconds", None)


def _claim_lock(state: dict, storage_service) -> None:
    """Story 20.20 (AC8) — zet de run-marker en schrijf hem METEEN weg.

    ONMIDDELLIJK ná de slotcontrole, en bewust niet ná het dure voorwerk. Tussen
    de controle en de marker zaten voorheen de volledige sleutellijst van de
    objectopslag (op acceptatie tienduizenden sleutels), de opbouw van de
    parenlijst, de groepering en twee databaserondgangen: twee runs die binnen
    dat raam van tientallen seconden startten zagen allebei geen marker en
    draaiden allebei door. Het raam is nu een lezen-en-schrijven van hetzelfde
    kleine bestand.

    Dit blijft geen ATOMAIR slot — de objectopslag krijgt hier geen
    voorwaardelijke schrijfactie — maar het raam is zo klein als het zonder
    zo'n schrijfactie kan. De prijs is dat een run die vroeg strandt een marker
    achterlaat; daarom ruimt élk pad hem op (zie ``_release_lock``), inclusief
    het pad waarop de vastlegging onleesbaar blijkt.
    """
    if DRY_RUN:
        return
    state["in_progress"] = True
    state["run_started_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    state["lock_max_age_seconds"] = _lock_max_age_for_run()
    storage_service.put_training_image(
        STATE_KEY, json.dumps(state).encode("utf-8"), "application/json"
    )


def _release_lock(state: dict, storage_service) -> None:
    """Ruim de run-marker op zonder de teller aan te raken (AC8).

    Voor de paden die vóór het eerste checkpoint bewust teruggeven: een run die
    nog niets gedaan heeft mag de volgende start niet blokkeren.

    NIET voor een onverwachte crash. Dáár hoort de marker juist te blijven
    staan — dat is zijn hele functie: een offset alleen is niet te onderscheiden
    van "er is nooit een run geweest". Zo'n achtergebleven marker vervalt vanzelf
    (``lock_max_age_seconds``), en SIGKILL kent sowieso geen handler.
    """
    if DRY_RUN:
        return
    _clear_lock_fields(state)
    try:
        storage_service.put_training_image(
            STATE_KEY, json.dumps(state).encode("utf-8"), "application/json"
        )
    except Exception:  # pragma: no cover - opruimen mag nooit de oorzaak maskeren
        logger.warning("Run-marker kon niet opgeruimd worden", extra={"key": STATE_KEY})


async def run_batch() -> dict:
    from app.ml.model_manager import model_manager
    from app.services.classification import _to_pil
    from app.services.database import db_service
    from app.services.keurmerk_gate import GATE_THRESHOLD, keurmerk_probability
    from app.services.region_proposer import propose_regions
    from app.services.storage import storage_service

    if not model_manager.is_loaded:
        await model_manager.load_models()
    storage_service.connect()
    await db_service.connect()

    # Story 20.20 (AC5) — geen kaart, geen run. Een onleesbare of lege kaart is
    # een STORING en geen kaart van nul paren: stil doorgaan zou de vingerafdruk
    # op "leeg" zetten, de teller wissen en `complete` melden — hetzelfde woord
    # als een geslaagde volledige ronde. De teller blijft hier onaangeroerd.
    try:
        declared_map = _load_declared_map(storage_service)
    except DeclaredMapUnavailable as exc:
        result = {
            "status": "map_unavailable",
            "reason": exc.reason,
            "key": DECLARED_MAP_KEY,
            "candidates": 0,
            "inserted": 0,
        }
        logger.error(
            "Declaratie-oogst gestopt: de kaart is niet bruikbaar. De teller blijft "
            "staan; er wordt niets teruggezet.",
            extra=result,
        )
        print(json.dumps(result))
        return result

    try:
        state = json.loads(
            storage_service.get_training_image(STATE_KEY).decode("utf-8")
        )
    except Exception:
        state = {"next_offset": 0}

    # Story 20.20 (AC8) — één oogst tegelijk. De volume-oogst en deze oogst delen
    # dezelfde ml-service-container van 8 GiB; twee declaratie-runs naast elkaar
    # halen die limiet gegarandeerd. Een run die het slot niet krijgt STOPT met
    # een melding — hij wacht niet en hij draait niet alsnog.
    if _lock_held(state, time.time(), LOCK_MAX_AGE_SECONDS):
        result = {
            "status": "locked",
            "run_started_at": state.get("run_started_at"),
            # De vervaltijd die de LOPENDE run in zijn marker legde — dat is de
            # grens waarop geweigerd wordt, niet de constante van deze run.
            "lock_max_age_seconds": state.get(
                "lock_max_age_seconds", LOCK_MAX_AGE_SECONDS
            ),
            "candidates": 0,
            "inserted": 0,
        }
        logger.warning("Declaratie-oogst geweigerd: er loopt er al een", extra=result)
        print(json.dumps(result))
        return result

    # Story 20.11 — stond er een marker van een hard afgebroken run? Dat moet
    # vastgelegd worden vóór deze run zijn eigen marker zet.
    stale_marker = bool(state.get("in_progress"))

    # Story 20.20 (AC8) — de marker gaat er METEEN op, vóór het dure voorwerk;
    # zie `_claim_lock` voor waarom dat raam anders tientallen seconden was.
    _claim_lock(state, storage_service)

    # Story 20.20 (AC5) — de teller draagt niet langer "al gedaan"; die rol ligt
    # bij de vastlegging. Wel moet hij terug zodra hij naar een ANDERE parenlijst
    # wijst. Gemeten op de PARENLIJST in de KAART — niet op een telling (twee
    # kaarten met evenveel maar andere paren lieten de teller staan terwijl de
    # offset in een andere lijst wees), en niet op de door artwork gefilterde
    # paren (die hangen af van wat er die nacht in de opslag staat).
    map_signature = _map_signature(declared_map)
    map_pairs = len(_all_pairs(declared_map))
    if _counter_reset_needed(state, map_signature):
        logger.info(
            "Declaratie-oogst zet de teller terug: de kaart heeft een andere parenlijst",
            extra={
                "was": state.get("map_signature"),
                "nu": map_signature,
            },
        )
        state["next_offset"] = 0
    state["map_signature"] = map_signature
    state["map_pairs"] = map_pairs

    next_offset = int(state.get("next_offset", 0))

    keys = [
        k
        for k in storage_service.list_training_images(prefix="artwork/")
        if k.lower().endswith((".png", ".jpg", ".jpeg"))
    ]
    by_gtin: dict = defaultdict(list)
    for k in keys:
        p = k.split("/")
        if len(p) > 2:
            by_gtin[p[1]].append(k)

    # Alleen paren waarvan de GTIN artwork heeft komen in aanmerking.
    pairs = [(c, g) for c, g in _scoped_pairs(declared_map) if g in by_gtin]
    total = len(pairs)

    if next_offset >= total:
        logger.info(
            "Declaratie-oogst compleet — alle scoped (code, GTIN)-paren gedekt",
            extra={"total": total},
        )
        # Story 20.11/20.20 — de eigen marker (en een eventueel achtergebleven
        # marker van een hard afgebroken run) hoort hier opgeruimd te worden;
        # anders blijft hij staan en suggereert hij ten onrechte een lopende run.
        # De verse `map_signature` gaat mee, anders vergeet de oogst waarop zijn
        # teller sloeg zodra hij klaar is.
        _release_lock(state, storage_service)
        result = {
            "status": "complete",
            "map_pairs": map_pairs,
            "map_signature": map_signature,
            "total_pairs": total,
            "next_offset": next_offset,
            "candidates": 0,
            "inserted": 0,
            "stale_marker_cleared": stale_marker,
        }
        print(json.dumps(result))
        return result

    end = min(next_offset + BATCH, total)
    queue: dict = defaultdict(list)
    skipped_below_floor = 0
    skipped_duplicate = 0
    skipped_cap = 0
    skipped_cross_code = 0  # Story 20.7 — buur-icoon tegengehouden
    skipped_keyline = 0  # Story 20.9 — technische snijlijn-/cutter-pagina tegengehouden
    # Story 20.11 — tellen over ALLE flushes heen; `queue` wordt tussentijds geleegd.
    inserted_total = 0
    candidate_total = 0
    per_code_counts: dict = defaultdict(int)
    t0 = time.perf_counter()

    # Story 20.11 (AC2) — GROEPEREN PER BRONPAGINA. Voorheen liep de lus de paren in
    # volgorde af met een onbegrensde page-cache: die groeide met het aantal unieke
    # pagina's in de batch (7 GB bij 173 paren -> OOM). Door alle codes van dezelfde
    # pagina achter elkaar te doen is er nooit meer dan ÉÉN pagina tegelijk nodig, en
    # blijft de 20.2-winst (niet herhaald decoderen/MSER/PNG-encoden voor
    # multi-code-GTINs) volledig intact. Geheugen wordt zo batch-ONafhankelijk.
    window = list(range(next_offset, end))
    groups: dict = defaultdict(list)
    src_by_idx: dict = {}
    for idx in window:
        code, gtin = pairs[idx]
        src = _pick_page(by_gtin[gtin])
        if src:
            groups[src].append(idx)
            src_by_idx[idx] = src

    # Story 20.20 (AC4/AC5) — de vastlegging IN BULK ophalen, vóór de paginalus.
    # Per paar opzoeken zou dure beeldanalyse vervangen door duizenden losse
    # database-opzoekingen; dan verplaats je de kosten in plaats van ze weg te nemen.
    #
    # En dit is een HARDE afhankelijkheid: ontbreekt de tabel of is hij onleesbaar,
    # dan stopt de run met een melding. Fail-safe terugvallen op "niets onthouden"
    # zou ~8,5 uur rekenwerk opleveren dat niemand heeft gevraagd, en het zou als
    # "traag" gelezen worden in plaats van als "kapot".
    try:
        recorded_checks = await db_service.fetch_declared_harvest_checks(
            [(pairs[i][0], pairs[i][1], src_by_idx[i]) for i in window if i in src_by_idx]
        )
        pool_fingerprints = await db_service.reference_pool_fingerprints(
            {pairs[i][0] for i in window}
        )
    except Exception as exc:
        # Story 20.20 (AC8) — de marker staat er al (hij gaat er vóór het dure
        # voorwerk op); een run die hier strandt mag er geen achterlaten die de
        # volgende start blokkeert. De teller blijft ongemoeid.
        _release_lock(state, storage_service)
        result = {
            "status": "checks_unavailable",
            "error": str(exc),
            "candidates": 0,
            "inserted": 0,
            "total_pairs": total,
            "from_offset": next_offset,
            "to_offset": next_offset,
        }
        logger.error(
            "Declaratie-oogst gestopt: de vastlegging van nagekeken paren is niet "
            "leesbaar (tabel declared_harvest_checks). De run begint NIET stil opnieuw.",
            extra=result,
        )
        print(json.dumps(result))
        return result

    # De offset slaat op de OORSPRONKELIJKE parenlijst, niet op de hergroepeerde
    # volgorde: we schuiven alleen op tot waar het aaneengesloten voorste deel af is.
    done_idx: set = set()
    # Paren zonder bruikbare pagina tellen als afgehandeld (ze werden ook voorheen
    # overgeslagen met i += 1).
    for idx in window:
        if idx not in src_by_idx:
            done_idx.add(idx)

    # Story 20.20 (AC4) — welke paren zijn al nagekeken, gegeven de referentiepool
    # van NU? Een blijvend oordeel telt altijd; een voorlopig oordeel alleen zolang
    # de vingerafdruk van de pool gelijk is.
    already_checked: set = set()
    for idx in window:
        src = src_by_idx.get(idx)
        if not src:
            continue
        code, gtin = pairs[idx]
        if _already_checked(
            recorded_checks.get((code, gtin, src)), pool_fingerprints.get(code)
        ):
            already_checked.add(idx)

    # Story 20.20 (AC4) — HELE PAGINAGROEPEN wegfilteren. De pagina wordt per groep
    # één keer opgehaald, gedecodeerd en gelokaliseerd (`page_loaded`); een overslag
    # per páár bespaart dat niet. Alleen als ELK paar van de groep al is nagekeken
    # mag de pagina ongemoeid blijven — daar komen de ~8,5 uur vandaan.
    skipped_already_checked = 0
    for src in [s for s in groups if all(i in already_checked for i in groups[s])]:
        for i in groups[src]:
            done_idx.add(i)
            skipped_already_checked += 1
        del groups[src]

    # Zie `page_order` — de volgorde is bepalend voor de offset-voortgang.
    ordered_pages = page_order(groups)

    def _reached() -> int:
        r = next_offset
        while r in done_idx:
            r += 1
        return r

    # Story 20.20 (AC4) — paren die op het runbudget (de cap) zijn afgeketst. Ze
    # worden niet vastgelegd én niet als afgehandeld geteld: de volgende run
    # biedt ze opnieuw aan.
    cap_deferred: set = set()

    # Story 20.20 (AC4) — nagekeken paren, met hun houdbaarheid, tot de eerstvolgende
    # flush. Cap-overslagen komen hier NOOIT in.
    pending_checks: list = []
    checks_recorded = 0

    def _note(code: str, gtin: str, src: str, outcome: str) -> None:
        blijvend = _is_permanent(outcome)
        pending_checks.append(
            (
                code,
                gtin,
                src,
                outcome,
                blijvend,
                None if blijvend else pool_fingerprints.get(code),
            )
        )

    stopped_reason = None
    processed_since_flush = 0

    for src in ordered_pages:
        if time.perf_counter() - t0 > MAX_SECONDS:
            stopped_reason = "timebox"
            break
        # AC4 — gecontroleerd stoppen vóór de OOM-killer toeslaat.
        if memory_pressure():
            stopped_reason = "stopped_memory"
            logger.warning(
                "Declaratie-oogst stopt op geheugendruk",
                extra={"cgroup": cgroup_memory(), "fraction": MEM_STOP_FRACTION},
            )
            break  # de slot-flush + checkpoint hieronder bewaren het werk

        img = boxes = None
        is_keyline = False
        page_loaded = False

        for i in groups[src]:
            code, gtin = pairs[i]

            # Story 20.20 (AC4) — dit paar is al nagekeken; de groep als geheel was
            # dat niet, dus de pagina komt verderop alsnog. Wel het analysewerk voor
            # dit paar overslaan, en het oordeel niet opnieuw vastleggen.
            if i in already_checked:
                done_idx.add(i)
                skipped_already_checked += 1
                continue

            # De pagina wordt per GROEP één keer geladen en gelokaliseerd — dat is
            # exact de 20.2-winst, nu zonder onbegrensde cache.
            if not page_loaded:
                page_loaded = True
                try:
                    data = storage_service.get_training_image(src)
                    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
                except Exception:
                    img = None
                if img is not None:
                    boxes, _ = propose_regions(img)
                    # Story 20.9 — beslis eenmaal per pagina of het een technische
                    # keyline-/cutter-sheet is (geldt voor alle codes van deze pagina).
                    is_keyline = _is_keyline(_page_detail_bpp(img), KEYLINE_MAX_BPP)

            if img is None:
                done_idx.add(i)
                continue

            # Het paar is vanaf hier hoe dan ook afgehandeld — elk vervolgpad is
            # ofwel een kandidaat, ofwel een bewuste overslag (floor/dedup/cap/
            # cross-code/keyline). Aan het EIND markeren zou fout zijn: de meeste
            # paden verlaten de iteratie met `continue`, en die paren zouden dan
            # nooit meetellen voor de offset — de run zou ze eindeloos herhalen.
            done_idx.add(i)
            processed_since_flush += 1

            # Story 20.9 — keyline-pagina levert geen bruikbare crops (lege panelen).
            if is_keyline:
                skipped_keyline += 1
                # Blijvend: keyline-zijn is een eigenschap van de pagina zelf, niet
                # van de referentiepool — dat oordeel draait nooit om.
                _note(code, gtin, src, OUTCOME_KEYLINE)
                continue

            # AC3: alleen de BESTE regio per paar; de declaratie garandeert de CODE,
            # niet de locatie — geen enkele regio >= floor betekent: overslaan.
            best = None  # (similarity, crop, bbox, embedding)
            for b in boxes:
                c = _crop_bgr(img, b)
                if c is None:
                    continue
                emb = np.asarray(
                    await model_manager.generate_embedding(_to_pil(c)), np.float32
                )
                kp = keurmerk_probability(emb)
                if kp is not None and kp < GATE_THRESHOLD:
                    continue
                matches = await db_service.find_similar_references_by_codes(
                    embedding=emb,
                    t3777_codes=[code],
                    limit=1,
                    threshold=FLOOR,
                )
                if not matches:
                    continue
                sim = float(matches[0]["similarity"])
                if best is None or sim > best[0]:
                    best = (sim, c, b, emb)

            if best is None:
                skipped_below_floor += 1
                # Voorlopig: geoordeeld tegen de referentiepool van dit moment. Komt
                # er een referentie bij, dan wordt dit paar opnieuw bekeken.
                _note(code, gtin, src, OUTCOME_BELOW_FLOOR)
                continue

            sim, crop, bbox, best_emb = best

            # Story 20.7 — cross-code-guard: matcht de gekozen regio ONgescopet op een
            # ANDERE code duidelijk beter, dan is het een buur-icoon → verwerpen.
            open_matches = await db_service.find_similar_references(
                embedding=best_emb, limit=3, threshold=0.0
            )
            if _cross_code_rejected(code, sim, open_matches, CROSS_CODE_MARGIN):
                skipped_cross_code += 1
                # Voorlopig: de vergelijking loopt over referenties, dus ook dit
                # oordeel kan omdraaien zodra de pool verandert.
                _note(code, gtin, src, OUTCOME_CROSS_CODE)
                continue

            # Story 20.11 — tel op `per_code_counts`, NIET op `len(queue[code])`:
            # de queue wordt tussentijds geleegd door de flush, dus daarop tellen zou
            # de cap per flush laten resetten i.p.v. per run. PER_CODE_CAP houdt
            # daarmee exact zijn oude, run-brede betekenis.
            if per_code_counts[code] >= PER_CODE_CAP:
                skipped_cap += 1
                # Story 20.20 (AC4) — BEWUST GEEN `_note`. De cap is een runbudget en
                # geen oordeel; vastleggen zou dit paar voorgoed uitsluiten omdat er
                # die nacht toevallig genoeg andere waren.
                #
                # En het paar telt ook NIET als afgehandeld. Alleen het `_note`
                # weglaten was niet genoeg: het paar zat al in `done_idx`, dus de
                # offset schoof eroverheen en de run eindigde op `complete` — waarna
                # het paar pas terugkwam als de parenlijst veranderde. Precies de
                # blijvende uitsluiting die deze regel wilde voorkomen. Door het uit
                # `done_idx` te halen stopt de offset hier en biedt de volgende run
                # dit paar opnieuw aan; de al nagekeken paren erachter zijn dan
                # goedkoop, want die staan vastgelegd.
                done_idx.discard(i)
                cap_deferred.add(i)
                continue

            # AC2/AC4 — idempotentie per code: READ, draait ook in DRY_RUN mee.
            exists = await db_service.review_item_exists(
                gtin=gtin, reason=_marker(code), source_file=src
            )
            if exists:
                skipped_duplicate += 1
                # Blijvend, en dezelfde houdbaarheid als "kandidaat aangemaakt":
                # er stáát al een item voor dit paar. Zonder deze regel zou de
                # pagina elke ronde opnieuw geladen worden voor een paar dat
                # allang af is. Wel een EIGEN uitkomstwaarde: "er stond al iets"
                # is een andere herkomst dan "ik heb zojuist iets aangemaakt", en
                # met één gedeelde waarde is dat later niet meer te verklaren.
                _note(code, gtin, src, OUTCOME_EXISTING_ITEM)
                continue

            queue[code].append(
                {
                    "gtin": gtin,
                    "bbox": {
                        "x": int(bbox[0]),
                        "y": int(bbox[1]),
                        "width": int(bbox[2]),
                        "height": int(bbox[3]),
                    },
                    "confidence": round(sim, 3),
                    "sourceFile": src,
                    "crop": crop,
                    "cid": f"{code}__{i}_{bbox[0]}_{bbox[1]}",
                }
            )
            candidate_total += 1
            per_code_counts[code] += 1
            # Blijvend: het item komt in de wachtrij; opnieuw aanmaken is een duplicaat.
            _note(code, gtin, src, OUTCOME_CANDIDATE)
        # Story 20.11 (AC2) — pagina expliciet loslaten zodra de groep klaar is.
        # Zonder dit bleef hij in de (voorheen onbegrensde) cache staan.
        img = boxes = None

        # Story 20.11 (AC3) — FLUSH-DAN-CHECKPOINT. Eerst het werk wegschrijven,
        # daarna pas de offset. Andersom (checkpointen vóór de flush) zou paren
        # stilzwijgend overslaan als de run daarna sneuvelt.
        if processed_since_flush >= FLUSH_EVERY:
            n = await _flush(queue, db_service, storage_service)
            inserted_total += n
            checks_recorded += await _flush_checks(pending_checks, db_service)
            _checkpoint(state, storage_service, _reached(), total)
            processed_since_flush = 0

    reached = _reached()

    # Slot-flush + checkpoint voor de rest van de queue.
    inserted_total += await _flush(queue, db_service, storage_service)
    checks_recorded += await _flush_checks(pending_checks, db_service)
    _checkpoint(state, storage_service, reached, total, done=True)

    candidate_count = candidate_total
    inserted = inserted_total

    # `queue` is door de flushes geleegd; tel per code apart mee.
    result = {
        "dry_run": DRY_RUN,
        # Story 20.11 (AC4) — expliciete status i.p.v. stil ophouden.
        "status": stopped_reason or "ok",
        "candidates": candidate_count,
        "inserted": inserted,
        "skipped_below_floor": skipped_below_floor,
        "skipped_duplicate": skipped_duplicate,
        "skipped_cap": skipped_cap,
        "skipped_cross_code": skipped_cross_code,
        "skipped_keyline": skipped_keyline,
        # Story 20.20 — paren die niet opnieuw doorgerekend hoefden te worden, en
        # oordelen die deze run heeft vastgelegd.
        "skipped_already_checked": skipped_already_checked,
        # Paren die op de cap afketsten en bewust opnieuw aangeboden worden.
        "cap_deferred": len(cap_deferred),
        "checks_recorded": checks_recorded,
        "map_pairs": map_pairs,
        "map_signature": map_signature,
        "total_pairs": total,
        "from_offset": next_offset,
        "to_offset": reached,
        "remaining": max(0, total - reached),
        "per_code": dict(per_code_counts),
        "seconds": round(time.perf_counter() - t0, 1),
    }
    logger.info("Declaratie-oogst batch klaar", extra=result)
    print(json.dumps(result))
    return result


if __name__ == "__main__":
    asyncio.run(run_batch())
