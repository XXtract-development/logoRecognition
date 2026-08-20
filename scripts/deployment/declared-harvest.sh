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

CONTAINER="${ML_CONTAINER:-logo-recognition-ml}"

# Het tijdsbudget staat hier en niet in de container-omgeving: de eenmalige
# inhaalronde gebruikt een heel ander budget (36000) en die twee mogen elkaar
# niet overschrijven.
docker exec \
  -e DECLARED_HARVEST_MAX_SECONDS="${DECLARED_HARVEST_MAX_SECONDS:-1000}" \
  -e DECLARED_HARVEST_BATCH="${DECLARED_HARVEST_BATCH:-400}" \
  "$CONTAINER" \
  python -m app.services.queue_harvest_declared
