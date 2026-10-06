---
story: "1.4 Omzettabel en soortbeleid"
branch: feat/logo-scan-service-key
date: 2026-10-06
gate: PASS
---

# Traceability: Verhaal 1.4

Gate: **PASS** (regel 4 van het gate-schema: alle zes criteria volledig gedekt door geautomatiseerde tests, P0 100%, overall 100%). Twee beperkingen staan als gat G1 en G2 hieronder; geen ervan laat een criterium onbedekt.

Testrun (VERIFIED): `pnpm --filter @logo-recognition/api exec vitest run gs1-mapping legacy-detect recognition verify-declared ghs-review logo-scans field-type`: 10 bestanden, 212 tests groen. Nieuw: 35 tests in `gs1-mapping.test.ts`. Type-check: 119 fouten voor en na, geen in de nieuwe bestanden. CI draait deze suite via `ci-cd.yml` regel 82 (`test:coverage`), dus een overtreding laat de CI falen.

| # | Criterium (Verhaal 1.4) | Dekking | Tests (gs1-mapping.test.ts) |
|---|---|---|---|
| AC1 | Elke soort heeft een regel of is bewust uitgesloten | VOLLEDIG | "AC1" (4: reference-code-mapping, keurmerk-codes incl. laatste regel, reden bij uitsluiting, uniek); "elke code ... ook de laatste regel"; "uitgesloten soort is te onderscheiden" |
| AC2 | Velden, waarden, opnamestand, categorieen, validFor..., besluitdatum, rapportverwijzing | VOLLEDIG | "AC2" (2); "FR-9..FR-11" (7: Nutri-Score, keurmerk, dieet, gebruikslabel, alias, onbekend) |
| AC3 | Start op voorstel of uit; gevaarsymbolen in code op voorstel | VOLLEDIG | "AC3" (4); "de echte GHS-regels staan op voorstel en blijven dat" |
| AC4 | Standwijziging zonder rapportverwijzing laat CI falen | VOLLEDIG | "AC4" (2 op echt bestand); "het echte bestand is geldig, een kapot bestand wordt afgekeurd" (negatief: automatisch, standwijziging, typfout, startstand) |
| AC5 | Andere model-/referentieversie: effectieve stand voorstel, `policyVersion` toont dat | VOLLEDIG (op resolverniveau) | "AC5" (5); "voorstel met afwijkende of ontbrekende versie meldt beperktDoor versie" |
| AC6 | Herhaald draaien geeft byte-gelijke uitvoer | VOLLEDIG | "AC6" (omzetting); "ingecheckte bestand is byte-gelijk aan de uitvoer van het script" |
| Bron | 61 actieve codes op voorstel, 52 buiten GS1 op uit, rest op uit | VOLLEDIG | "Soortbeleid" (3) |
| Reg. | legacy-detect 75, recognition 15, verify-declared 7, ghs-review 27, logo-scans | GEDEKT | allemaal groen in dezelfde run |

## Gaten

- **G1 (AC5):** `policyVersion` is alleen op resolverniveau getest; er is nog geen API-antwoord dat hem toont. Dat komt met verhaal 1.5 (GS1-blok en schema).
- **G2 (AC4):** de poort controleert de regels in het bestand en dat het bestand gelijk is aan de scriptuitvoer. Een wijziging van `stand-overrides.json` zonder `rapportverwijzing` wordt dus gevangen, maar niemand dwingt af dat die verwijzing naar een bestaand rapport wijst (inhoud wordt niet getoetst).
- **G3:** `categorieen` is overal leeg (= overal zinvol); de test dekt het veld, niet de inhoud. Vulling hoort bij verhaal 1.7.
- **G4:** de 52 en de 61 komen uit vastgelegde meetbronnen (`scripts/gs1-mapping-sources`); de sha256 van de GS1-Excel is vastgelegd maar niet bij elke run geverifieerd (verhaal 1.6 pint de lijst).

## Besluit

PASS: samenvoegen mag. G1 sluit in 1.5, G3 in 1.7, G4 in 1.6.
