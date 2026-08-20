#!/usr/bin/env bash
# Story 20.20 (AC7) — wekelijkse herbouw van de declaratie-oogst-kaart.
#
# Zonder deze herbouw komen de codes die op hun eerste actieve referentie wachten
# nooit in de kaart zodra ze die referentie krijgen, en staat de declaratie-oogst
# over een maand weer stil op precies dezelfde manier als in augustus 2026: een
# met de hand gemaakte kaart van 16 juli naast een index die doorgroeide.
#
#   7 0 * * 0 /usr/local/bin/build-declared-harvest-map.sh
#
# Zondagnacht, dus vóór de nachten waarin de oogst hem leest.
#
# --apply is nodig omdat de droogloop de standaard is. Krimpt de kaart met meer
# dan 10% in paren, dan schrijft de bouwer NIET maar meldt hij; een mens beslist
# dan of --force op zijn plaats is. Die keuze hoort niet in een cron-regel.
#
# PLAATSING: dit script hoort op `vanilla` in /usr/local/bin/. Het plaatsen is
# een schrijfactie op de acceptatie-omgeving en wacht op expliciete toestemming.
set -euo pipefail

CONTAINER="${API_CONTAINER:-logo-recognition-api}"

docker exec "$CONTAINER" \
  npx tsx src/scripts/build-declared-harvest-map.ts --apply
