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
# HET GECOMPILEERDE BESTAND, NIET `npx tsx src/...`. Het beeld dat op acceptatie
# draait komt uit de root-Dockerfile en die runtime-laag kopieert alleen `dist`,
# `package.json`, `prisma`, `node_modules` en `public` — er zit GEEN `src/` in.
# En `tsx` staat in geen enkele package.json van deze repository, dus `npx` zou
# het tijdens de cron-run van het net moeten halen, als `appuser`, met
# NODE_ENV=production. De eerste uitvoering zou dus gefaald hebben. Lokaal, waar
# de bronbestanden er wél zijn, is `npx tsx src/scripts/…` nog steeds de route.
#
# DE CONTAINERNAAM WORDT OPGEZOCHT, NIET GERADEN. Op acceptatie draait de
# api-container onder een door Coolify gegenereerde naam met een tijdstempel
# erachter (`app-<uuid>-<tijdstempel>`), dus een vaste naam klopt na elke deploy
# niet meer. Matchen gebeurt op het onveranderlijke voorste deel.
#
# PLAATSING: dit script hoort op `vanilla` in /usr/local/bin/. Het plaatsen is
# een schrijfactie op de acceptatie-omgeving en wacht op expliciete toestemming.
set -euo pipefail

# Het cron-proces heeft geen terminal: zonder logbestemming verdwijnt de melding
# van de krimpbescherming in het niets, en dan is een geblokkeerde herbouw een
# geluidloze mislukking. `tee` houdt de uitvoer óók op stdout, zodat de cron-mail
# hem meekrijgt, en `pipefail` (hierboven) laat de exitcode van de bouwer staan.
LOG_FILE="${DECLARED_HARVEST_MAP_LOG:-/var/log/declared-harvest-map.log}"
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

CONTAINER_PREFIX="${API_CONTAINER_PREFIX:-app-qsookwow8koko0kwg00g0cwk-}"
CONTAINER="${API_CONTAINER:-}"
if [ -z "$CONTAINER" ]; then
  CONTAINER="$(docker ps --filter "name=^${CONTAINER_PREFIX}" --format '{{.Names}}' | head -n 1)"
fi
if [ -z "$CONTAINER" ]; then
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] GEEN api-container gevonden met prefix '${CONTAINER_PREFIX}' — kaart NIET herbouwd." \
    | tee -a "$LOG_FILE" >&2
  exit 1
fi

{
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] kaartherbouw start in ${CONTAINER}"
  docker exec "$CONTAINER" node dist/scripts/build-declared-harvest-map.js --apply
} 2>&1 | tee -a "$LOG_FILE"
