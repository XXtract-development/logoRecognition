# ATDD-checklist verhaal 1.5 (GS1-blok in het antwoord)

Stack: backend (vitest). Rode fase: `gs1-block.test.ts` en `logo-scans-gs1.test.ts` falen omdat `pipeline/gs1-block.ts` en `schemas/logoResults.v1.json` ontbreken.

| AC | Tests |
|---|---|
| AC1 NUTRISCORE_C in één groep, geen interne code | gs1-block AC1 (2) |
| AC2 EU_ORGANIC_FARMING, GHS02 -> FLAME | AC2 (2) |
| AC3 soort buiten tabel / uit: geen item | AC3 (2) |
| AC4 drempel per methode, twijfel, GHS 0,99, versie | AC4 (9) |
| AC5 tegenstrijdig, dubbele detecties | AC5 (3) |
| FR-8/signaalwoord | AC6 (4) + route-test signalWord |
| AC7 schema, sha256, geldig/ongeldig | AC7 (4) |
| AC8 byte-gelijk | AC8 (1) + route-test |
| Worker: ok, partial, failed, regressie ruwe detecties | logo-scans-gs1 (5) |
