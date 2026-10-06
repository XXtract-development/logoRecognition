---
story: "1.7 Zoekruimte beperken op productcategorie"
branch: feat/logo-scan-service-key
date: 2026-10-06
gate: CONCERNS
---

# Traceability: Verhaal 1.7

Gate: **CONCERNS**. AC1 en AC2 zijn volledig gedekt door tests; AC3 (meting op minstens 30 echte beelden) is bewust niet lokaal uit te voeren en staat open als gat G1. Het meetscript is geleverd maar nooit gedraaid.

Testrun (VERIFIED): `pnpm --filter @logo-recognition/api exec vitest run src/__tests__`: 108 bestanden, 1542 tests groen, 0 rood. Nieuw: 27 in `services/zoekruimte.test.ts` en 3 in `routes/logo-scans-flow.test.ts` ("Story 1.7"). Type-check: geen nieuwe fouten in de gewijzigde bestanden (de bestaande Prisma-fouten blijven).

| # | Criterium (Verhaal 1.7) | Dekking | Tests |
|---|---|---|---|
| AC1a | Aanvraag met `gpcCategoryCode` beperkt de zoekruimte via `categorieen` (prefixmatch segment/family/class/brick) | VOLLEDIG | zoekruimte.test.ts: "AC1 gevulde categorieen" (4), "AC2 voedsel / niet-voedsel / prefixen" (8+ rijen); flow: niet-voedselcode laat Nutri-Score/dieet vallen |
| AC1b | Soorten die overal voorkomen (Green Dot, FSC, recycling, alle keurmerken, GHS) vallen nooit af | VOLLEDIG | "lege categorieen valt nooit af", "code buiten de tabel valt nooit af", "alles overig blijft leeg", validatie weigert gevulde GHS |
| AC2 | Zonder of met onbekende code: volledige set | VOLLEDIG | "zonder code", ongeldige codes (4), flow: voedselcode/geen/`onzin` geven de volledige set |
| AC3a | `zoekruimte` vastgelegd in `logoResults`, schema optioneel, `schemaVersion` 1 | VOLLEDIG | "AC3 zoekruimte in logoResults" (5: opnemen, weglaten, ongeldig, patroon, sha); flow: zoekruimte op `done`, afwezig bij `failed` |
| AC3 | Meting op minstens 30 echte beelden: looptijd niet slechter, niet méér valse treffers, niet méér gemiste logo's | **NIET GEDEKT** | geen test mogelijk; zie G1 |

## Gaten

- **G1 (open, vereist ACC):** de meting op minstens 30 echte pijplijnbeelden en de eindtest zijn niet uitgevoerd. `apps/api/scripts/meet-zoekruimte.ts` is klaar (twee scans per beeld, met en zonder code; weigert zonder `--bevestig` en zonder ACC/stage/lokale host; schrijft per beeld status, looptijd en verschillen). Het script heeft geen grondwaarheid: "valse treffers" en "gemiste logo's" zijn te beoordelen via de kolommen `alleenZonder` (kandidaat gemist) en `alleenMet`, handmatig.
- **G2 (inhoudelijk risico):** de keuze dieetsoorten en Nutri-Score op `["50"]` is gegeven als uitgangspunt maar niet gemeten. Dieetlogo's (vegan, halal, glutenvrij, ...) kunnen ook op producten buiten segment 50 staan (supplementen, dierenvoeding, verzorging) en vallen dan af. De ACC-meting moet dit beslissen; Nutri-Score op 50 is minder omstreden.
- **G3:** een code die geen enkele soort uitsluit geeft `beperkt: false`; een niet-bestaande GPC-brick wordt niet herkend (geen bricklijst). Gekozen uitleg van "past op geen enkele regel".
- **G4:** het meetscript zelf heeft geen test (alleen geschreven en op type gecontroleerd).
- **G5:** `policyVersion` verandert door de gevulde `categorieen`; afnemers die de hash pinnen moeten hem bijwerken (staat in de README).
