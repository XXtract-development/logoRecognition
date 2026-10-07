---
story: "LOGO_SCAN_MAX_MS van 300000 naar 240000"
branch: fix/logo-scan-max-240s
date: 2026-10-07
gate: CONCERNS
---

# Traceability: logo-scan maximumduur 240 s

Gate: **CONCERNS**. Alle vier criteria hebben een test; twee kleine gaten (G1, G2), geen blokkerend. Testrun niet uitgevoerd in deze trace (INFERENCE: tests zijn alleen gelezen, niet gedraaid).

| # | Criterium | Dekking | Test (bestand) |
|---|---|---|---|
| AC1 | Constante `LOGO_SCAN_MAX_MS` is 240000 | VOLLEDIG | "are named and match the agreed limits" (logo-scans-flow.test.ts:145, `toBe(240000)`) |
| AC2a | Scan wachtte langer dan 240 s in de queue: failed/timeout, herkenning start niet | VOLLEDIG | "failed/timeout when a scan was waiting longer than LOGO_SCAN_MAX_MS before it started" (flow :297, literal 240000+1000) |
| AC2b | Hangende herkenning na 240 s: failed/timeout | VOLLEDIG | "failed/timeout when recognition hangs past the deadline" (flow :307, literal 240000+1000) |
| AC2c | Dode worker: bij lezen failed/timeout | VOLLEDIG | "a pending/running scan older than the limit (dead worker) is reported failed/timeout on read" (flow :318); "a table row still pending past the maximum time reads as failed/timeout" (dedupe :390) |
| AC2d | Late timeout overschrijft `done` niet | VOLLEDIG | "a late timeout-on-read cannot overwrite done, and a late worker cannot resurrect failed" (flow :338); "a done result stored by the worker is not overwritten by a read-time timeout" (dedupe :345) |
| AC3 | ml-service-budget blijft 1..165000 | DEELS | "ml-service contract: remaining_budget_ms stays within 1..165000 although a scan may run 240 s" (flow :109); start met ~240000 resterend, dus de bovengrens-cap wordt echt geraakt |
| AC4 | Geen oude verwijzingen (300/330 s) voor logo-scan | VOLLEDIG (grep) | geen test; `git grep` op 300000/330000/300 s/330 s in logo-scan-context: 0 treffers over; meet-zoekruimte.ts DEADLINE_MS 270000, api-specification.md, logo-1-2-trace.md bijgewerkt |

## Gaten

- **G1 (AC3):** alleen de bovengrens wordt getoetst; de ondergrens 1 (bijna op de deadline) niet. Voorstel: test met resterend < 1 s.
- **G2 (AC1/AC2):** drie tests hardcoden 240000 in plaats van `LOGO_SCAN_MAX_MS`. Dat pint de waarde, maar de dedupe-tests en twee flow-tests (:344, :348) gebruiken de constante; gemengd. Nit.
- **G3:** de 420 s mediaserver-timeout (n8n) staat nergens in een test of in de repo; de marge 240 s versus 420 s is een aanname (AANNAME, bron: opdracht).
