---
story: "1.6 Codes tegen de GS1-lijst"
branch: feat/logo-scan-service-key
date: 2026-10-06
gate: PASS
---

# Traceability: Verhaal 1.6

Gate: **PASS** (alle drie de criteria volledig gedekt; gaten G1 t/m G4 hieronder).

Testrun (VERIFIED): `pnpm --filter @logo-recognition/api exec vitest run gs1 logo-scans legacy-detect recognition verify-declared ghs-review`: 11 bestanden, 250 tests groen (was 229). Nieuw: 21 in `gs1-codelists.test.ts`. Type-check: 119 fouten voor en na, geen in de nieuwe of gewijzigde bestanden.

| # | Criterium (Verhaal 1.6) | Dekking | Tests (gs1-codelists.test.ts) |
|---|---|---|---|
| AC1 | Vastgepinde lijst 3.1.37.1 met hash en versienummer; CI faalt bij code buiten de lijst tenzij `uit` met reden | VOLLEDIG | "AC1 vastgepinde lijst" (4: release, hash, tijdstip, alleen codewaarden, aantallen 919/35/10/20/10, Nutri-Score-constante met bronverwijzing); "AC1 elke niet-uit-regel" (4, incl. negatieve test en reden bij elke uit-regel); "Aanvullend" (3: EXEMPT, enumerationValue, GHS) |
| AC2 | 52 afwijkende keurmerkcodes (CMA, ELVI, HALAL_AHF) staan op `uit` | VOLLEDIG | "AC2" (1): 52 codes, niet in lijst, regel `uit` met reden |
| AC3 | NUTRISCORE_A..E -> A..E, GHS02 -> FLAME, aliassen opgenomen en getest; interne codes nooit als waarde; boolean-vorm | VOLLEDIG | "AC3" (6) |
| FR-12/c | Runtime `isValidGs1Value` in blokbouwer: ongeldig item weglaten en loggen | VOLLEDIG | "Runtime" (3: weglaten + eenmalige waarschuwing, geldig door, groep als geheel) |

## Gaten

- **G1:** het generatiescript (Python, vereist de xlsx) heeft geen test; de CI toetst alleen het gecommitte bestand. Handmatig geverifieerd: heruitvoering gaf een byte-gelijk bestand en 919/35/10/20/10.
- **G2:** `bronSha256` in het afgeleide bestand is een constante; de test bindt hem aan de verwachte waarde, niet aan de xlsx (die staat bewust niet in git).
- **G3:** een weggelaten item staat niet in `logoResults` (geen `reden`, schema ongewijzigd); consumenten zien het verschil tussen "ongeldig" en "buiten tabel" alleen in de log. Het bevat de afwijking pas na een foute tabelwijziging, die de CI vooraf vangt.
- **G4:** een nieuwe release vraagt drie handmatige bewerkingen (script, `index.ts`, test); beschreven in `apps/api/README.md`.
