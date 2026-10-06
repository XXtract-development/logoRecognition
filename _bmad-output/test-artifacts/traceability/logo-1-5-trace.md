---
story: "1.5 GS1-blok in het antwoord"
branch: feat/logo-scan-service-key
date: 2026-10-06
gate: PASS
---

# Traceability: Verhaal 1.5

Gate: **PASS** (alle zes criteria volledig gedekt door geautomatiseerde tests; geen onbedekt criterium; gaten G1 t/m G4 hieronder).

Testrun (VERIFIED): `pnpm --filter @logo-recognition/api exec vitest run gs1 logo-scans legacy-detect recognition verify-declared ghs-review`: 10 bestanden, 229 tests groen. Nieuw: 33 (28 in `gs1-block.test.ts`, 5 in `logo-scans-gs1.test.ts`). Type-check: 119 fouten voor en na, geen in de nieuwe bestanden.

| # | Criterium (Verhaal 1.5) | Dekking | Tests |
|---|---|---|---|
| AC1 | NUTRISCORE_C: `nutritionalScore C` + `nutritionalProgramCode 8` in één groep, nooit de interne code | VOLLEDIG | gs1-block "AC1" (2, incl. alle tabelregels op interne waarden) |
| AC2 | EU_ORGANIC_FARMING met GS1-waarde; GHS02 -> FLAME | VOLLEDIG | "AC2" (2) |
| AC3 | Soort buiten tabel of `uit`: geen item, ruwe detectie blijft | VOLLEDIG | "AC3" (2); route-test "done-scan" (soort buiten tabel) |
| AC4 | Onder drempel per methode of twijfelachtig: voorstel; GHS ook 0,99 | VOLLEDIG | "AC4" (5 drempels boven/onder, uncertain/requires_review, GHS 0,99, versie, partial, bewijsvelden) |
| AC5 | Tegenstrijdig (twee Nutri-Score-letters) en dubbele detecties | VOLLEDIG | "AC5" (3) |
| AC6 | `/detect` ongewijzigd; schema `logoResults.v1.json` in repo met `schemaVersion` | VOLLEDIG | "AC7" (4: hash, geldig, ongeldig, failed); regressie legacy-detect 75, recognition 15, verify-declared 7, ghs-review 27 groen |
| FR-8/c | `signalWord` passthrough en markering | VOLLEDIG | "AC6" (4); route-test signalWord |
| e | status ok / partial / failed | VOLLEDIG | route-tests "done", "partial", "failed"; "AC7 failed" |
| AC8 | Byte-gelijke uitvoer | VOLLEDIG | "AC8" (ook omgekeerde invoervolgorde); route-test herhaling |

## Gaten

- **G1:** `modelVersion` komt uit `LOGO_MODEL_VERSION`; de ml-service levert geen modelversie. Er is dus geen test die een echte modelwissel vangt; zonder variabele is elk item `voorstel` (getest).
- **G2:** per soort wint de hoogste ruwe zekerheid (AC), ook als een andere methode met lagere zekerheid boven haar eigen drempel zit. Niet getest als keuze; staat als open vraag.
- **G3:** `skipped` is gedefinieerd in het schema maar wordt niet uitgegeven (buiten dit verhaal).
- **G4:** de kopiehash-controle in andere repo's (n8n, AI-Service, XML-dienst) bestaat nog niet; hier staat alleen de hash en de test die hem aan het bestand bindt.
