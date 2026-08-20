#!/usr/bin/env bash
# Story 20.20 (AC7) — nachtelijke DECLARATIE-oogst.
#
# Tegenhanger van het bestaande /usr/local/bin/keurmerk-harvest.sh, dat de
# VOLUME-oogst (app.services.queue_harvest) start. Die twee zijn verschillende
# oogsters en mogen elkaar niet in de weg lopen: ze draaien in dezelfde
# ml-service-container van 8 GiB en de declaratie-oogst breekt zichzelf af boven
# 75% van dat gedeelde geheugen.
#
#   volume-oogst      : 37 3 * * *  (bestaand, niet aankomen)
#   declaratie-oogst  : 17 1 * * *  (deze)
#
# Met het standaard tijdsbudget van 1000 seconden is deze run rond 01:34 klaar —
# ruim twee uur voordat de volume-oogst begint. Loopt hij toch uit, dan weigert
# het slot in queue_harvest_declared.py een tweede start; die stopt met een
# melding en wacht niet.
#
# PLAATSING: dit script hoort op `vanilla` in /usr/local/bin/. Het plaatsen is
# een schrijfactie op de acceptatie-omgeving en wacht op expliciete toestemming.
set -euo pipefail

# De containernaam draagt een deploy-tijdstempel en verandert dus bij ELKE uitrol
# (gemeten: `ml-service-qsookwow8koko0kwg00g0cwk-203251989081`). Een vaste naam
# raden levert "no such container" op — precies de fout die de code review in het
# kaartherbouwscript vond, en die daar een week lang als "er gebeurt niets" zou
# hebben gelezen. Zoek daarom op prefix, net als het bestaande
# `/usr/local/bin/keurmerk-harvest.sh` op vanilla al doet.
CONTAINER_PREFIX="${ML_CONTAINER_PREFIX:-ml-service-qsookwow8koko0kwg00g0cwk-}"
CONTAINER="${ML_CONTAINER:-}"

# Het cron-proces heeft geen terminal. AC6 wil dat een geblokkeerde krimp
# "gemeld" wordt en AC8 dat een geweigerde run "stopt met een melding" — zonder
# logbestemming zijn `status: locked`, `map_unavailable` en `checks_unavailable`
# geen melding maar een geluidloze mislukking. `tee` houdt de uitvoer óók op
# stdout zodat de cron-mail hem meekrijgt; `pipefail` (hierboven) laat de
# exitcode van de oogst staan.
LOG_FILE="${DECLARED_HARVEST_LOG:-/var/log/declared-harvest.log}"
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

if [ -z "$CONTAINER" ]; then
  # Bewust NIET `head -n 1`. Tijdens een blauw/groen-uitrol draaien er twee
  # containers met dezelfde prefix; dan pakt `head` er willekeurig één en draait
  # dit werk mogelijk in de container die net wordt weggehaald. Twee treffers is
  # geen keuze maar een fout: stoppen en melden, en met ML_CONTAINER kan een mens
  # er bewust één aanwijzen.
  MATCHES="$(docker ps --filter "name=^${CONTAINER_PREFIX}" --format '{{.Names}}')"
  AANTAL="$(printf '%s' "$MATCHES" | grep -c . || true)"
  if [ "$AANTAL" -gt 1 ]; then
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] MEER DAN EEN ml-container met prefix '${CONTAINER_PREFIX}' ($(echo "$MATCHES" | tr '\n' ' ')) — oogst NIET gedraaid. Wijs er een aan met ML_CONTAINER=." \
      | tee -a "$LOG_FILE" >&2
    exit 1
  fi
  CONTAINER="$(printf '%s' "$MATCHES" | head -n 1)"
fi
if [ -z "$CONTAINER" ]; then
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] GEEN ml-container gevonden met prefix '${CONTAINER_PREFIX}' — oogst NIET gedraaid." \
    | tee -a "$LOG_FILE" >&2
  exit 1
fi

# Het tijdsbudget staat hier en niet in de container-omgeving: de eenmalige
# inhaalronde gebruikt een heel ander budget (36000) en die twee mogen elkaar
# niet overschrijven.
# De exitcode van HET WERK telt, niet die van `tee`. Met `pipefail` (hierboven)
# bepaalt de laatste falende schakel de uitkomst, en `tee` faalt zodra het
# logpad niet schrijfbaar is — het kopieert dan gewoon door naar stdout, het werk
# draait, en tóch eindigt de pijplijn op 1. Een geslaagde run rapporteerde zo een
# mislukking, in de enige richting die telt. `PIPESTATUS` haalt de twee uit
# elkaar; een onschrijfbaar log is een waarschuwing, geen mislukking.
set +e
{
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] declaratie-oogst start in ${CONTAINER}"
  docker exec \
    -e DECLARED_HARVEST_MAX_SECONDS="${DECLARED_HARVEST_MAX_SECONDS:-1000}" \
    -e DECLARED_HARVEST_BATCH="${DECLARED_HARVEST_BATCH:-400}" \
    "$CONTAINER" \
    python -m app.services.queue_harvest_declared
} 2>&1 | tee -a "$LOG_FILE"
# In één keer overnemen: elke volgende opdracht overschrijft PIPESTATUS, dus
# twee losse regels lezen de tweede waarde uit een array die er niet meer is.
pipe_status=("${PIPESTATUS[@]}")
set -e
status=${pipe_status[0]}
log_status=${pipe_status[1]:-0}
if [ "$log_status" -ne 0 ]; then
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] WAARSCHUWING: ${LOG_FILE} is niet schrijfbaar — de uitvoer stond alleen op stdout." >&2
fi
exit "$status"
