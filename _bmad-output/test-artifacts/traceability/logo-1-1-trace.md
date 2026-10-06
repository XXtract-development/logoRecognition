---
story: "1.1 Beveiligde aanvraag met servicesleutel"
branch: feat/logo-scan-service-key
commit: 27c7d26
date: 2026-10-06
gate: CONCERNS
---

# Traceability: Verhaal 1.1

Gate: **CONCERNS**. Drie van vier criteria zijn gedekt door een test; het criterium "ml-service niet rechtstreeks bereikbaar" is maar deels gedekt (zie gat G1).

Testrun (VERIFIED): 6 bestanden, 139 tests, alle groen. `pnpm --filter @logo-recognition/api exec vitest run` op logo-scans-auth, logo-scans-wiring, legacy-detect, recognition.routes, verify-declared.routes, ghs-review.

| # | Criterium | Dekking | Tests |
|---|---|---|---|
| AC1 | Zonder of met onbekende sleutel: 401, sleutel nooit gelogd | VOLLEDIG | logo-scans-auth: "401 without key, unknown key, lr_ shaped, shared API_KEY, PIPELINE_SERVICE_KEY, prefix"; "401 duplicated/comma-joined header"; "fails closed when LOGO_PIPELINE_KEYS missing/empty"; "never logs key values" |
| AC2 | Sleutels in `LOGO_PIPELINE_KEYS`, naam per consument, timing-safe | GEDEKT VIA GEDRAG | parsing (name:key, eerste dubbele punt, malformed), exact-match resolve (geen prefix, hoofdletter, langere sleutel), naam in log bij succes. Timing-safe zelf is niet te toetsen in een test: alleen bevestigd door code te lezen (sha256-digests + `crypto.timingSafeEqual`, logo-pipeline-keys.ts r.28-38) |
| AC3 | ml-service niet rechtstreeks van buiten bereikbaar (gecontroleerd) | DEELS: GAT | logo-scans-wiring leest de compose-bestanden: prod, acc, test publiceren geen poorten en hebben geen proxy-router; prod zit alleen op private/ml-egress |
| AC4 | `/detect`, `/recognize`, verify-declared, `/ghs/review` reageren als voorheen | GEDEKT (met kanttekening) | legacy-detect (75), recognition.routes (15), verify-declared.routes (7), ghs-review (27) groen; wiring: logo-scans-sleutel opent `/ghs/review` niet |

## Gaten

- **G1 (AC3, open): niet bewezen dat ml-service van buiten onbereikbaar is.** In `docker-compose.acc.yml` en `docker-compose.test.yml` draait ml-service met `network_mode: host`. Dan bepaalt de hostfirewall de bereikbaarheid, en geen enkele test of bestand in de repo toont dat. De test controleert alleen dat de compose-tekst geen poorten publiceert, en legt het hostrisico vast als marker. Er is geen runtime-controle (poortscan van buitenaf op ACC) uitgevoerd. Dit is een gat, geen geslaagd criterium. Sluiten: poortscan vanaf een extern netwerk op de ACC-host, plus firewallregel vastleggen.
- **G2 (AC4, kanttekening):** de regressietests zijn de bestaande suites; ze zijn niet vóór/na vergeleken. De enige wijziging buiten de nieuwe route is twee regels in main.ts. De wiring-test controleert die registratie met een tekstmatch op main.ts, niet door de echte app op te starten.
- **G3 (AC1/AC2):** geen test op de echte app-opstart met `LOGO_PIPELINE_KEYS` uit de omgeving; alleen via een los opgebouwde Fastify-instantie.
- Geen gat: "sleutel nooit gelogd" is getoetst op de logger (info/warn/error/debug) voor een onbekende en een geldige sleutel.

## Besluit

CONCERNS: bouwen mag door; G1 moet vóór uitrol naar ACC met een echte poortcontrole worden gesloten, anders blijft AC3 onbewezen.
