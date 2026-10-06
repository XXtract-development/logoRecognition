---
story: "1.2 Scan aanvragen en resultaat opvragen"
branch: feat/logo-scan-service-key
date: 2026-10-06
gate: CONCERNS
---

# Traceability: Verhaal 1.2

Gate: **CONCERNS**. Vier van vijf criteria zijn gedekt door tests met gemockte Redis, queue en ML-service; het criterium "looptijd p50/p95 op ACC vastgelegd" is alleen als metric-veld gebouwd en nog niet op ACC gemeten (gat G1).

Testrun (VERIFIED): `pnpm --filter @logo-recognition/api exec vitest run`: 112 bestanden, 1423 tests groen (9 bestanden overgeslagen, bestaand). Nieuw: 22 tests in logo-scans-flow.test.ts; logo-scans-auth.test.ts 8 (1 aangepast: 501-stub is nu 400). Type-check: 119 fouten voor en na de wijziging, geen nieuwe in de aangeraakte bestanden.

| # | Criterium | Dekking | Tests (logo-scans-flow tenzij anders) |
|---|---|---|---|
| AC1 | Geldige sleutel + png/jpeg: 202 met `scanId`; GET geeft pending, running, done of failed | VOLLEDIG | "202 + scanId ... unique jobId; hash of original bytes"; "accepts a jpeg"; "walks pending -> running -> done"; "failed with reason when the ML service errors"; 401 zonder sleutel (POST en GET); 404 onbekend id |
| AC2 | Ongeldig of te groot beeld: duidelijke fout, geen time-out | VOLLEDIG | "400 without a file, non-image, mimetype lies (magic bytes)"; "400 for two files"; "413 above byte limit"; "400 too many pixels"; "400 valid header, corrupt body"; auth: niet-multipart is 400 |
| AC3 | Bezet: afwijzing met wachttijdadvies, niets stil verloren (10 gelijktijdig) | VOLLEDIG (gemockt) | "503 with Retry-After when queue full"; "503 when enqueueing fails"; "10 concurrent requests ... none lost"; "503 (not a hang) when Redis stalls" |
| AC4 | Elke scan eindigt binnen 300 s in done of failed | VOLLEDIG (gemockt) | "failed/timeout when waiting longer than LOGO_SCAN_MAX_MS"; "failed/timeout when recognition hangs"; "dead worker reported failed/timeout on read"; "late timeout cannot overwrite done / late worker cannot resurrect failed" |
| AC5 | Looptijd (p50, p95) per beeld op ACC wordt vastgelegd | DEELS: GAT | "done" toont numeriek `processingTimeMs`; het veld wordt gelogd. Geen aggregatie en geen ACC-meting |
| Reg. | `/detect`, `/recognize`, verify-declared, `/ghs/review` ongewijzigd | GEDEKT | legacy-detect 75, recognition.routes 15, verify-declared.routes 7, ghs-review 27 groen; in legacy-detect.ts alleen `export` toegevoegd aan bestaande hulpfuncties |

## Gaten

- **G1 (AC5, open):** `processingTimeMs` is de looptijd van de worker (zonder wachttijd in de queue) en wordt alleen gelogd en per scan 24 uur bewaard. p50/p95 op ACC vraagt een echte meting op ACC (bijvoorbeeld 20 scans en percentielen uit de logregels). Niet uitgevoerd: geen toegang tot ACC in dit verhaal.
- **G2:** alle flow-tests draaien tegen een in-memory Redis en een nepqueue. De Lua-compare-and-set, de echte BullMQ-worker met concurrency en het gedrag bij verlopen status (24 uur) zijn niet tegen een echte Redis bewezen.
- **G3:** de capaciteitsgrens is per API-instantie (bij meerdere instanties bij benadering).
- **G4:** de test "too many pixels" bouwt een echt beeld van ruim 80 miljoen pixels (circa 1 s); geen test op het opstarten van de echte app met de worker (alleen tekstmatch op registratie in de bestaande wiring-test, niet voor de worker).

## Besluit

CONCERNS: bouwen en samenvoegen mogen door; G1 sluit na een meting op ACC, G2 bij de eerste ACC-run met echte Redis.
