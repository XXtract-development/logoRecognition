# Story 20.13: Voorbeeldlogo kiezen op HERKOMST, niet op alfabet

Status: review

<!-- Live gevonden door Friso, 2026-07-27: bij RECYCLABLE_GENERAL_CLAIM toont het
review-deck een leeg/onbruikbaar voorbeeldlogo. Diagnose: het endpoint kiest op
variantLabel-alfabet. Raakt 9 codes. -->

## Story

Als **reviewer**
wil ik **als voorbeeld het OFFICIËLE keurmerklogo zien**
zodat **ik weet waar ik op de verpakking naar zoek, in plaats van naar een korrelige of lege automatische uitsnede te kijken**.

## Reproductie

Review-deck, item met code `RECYCLABLE_GENERAL_CLAIM`: het voorbeeldvakje naast "Zoek dit keurmerk op de verpakking" is (vrijwel) leeg.

## Oorzaak

`apps/api/src/api/v1/reference-logos.ts:320-322`:

```ts
const ref = await prisma.referenceLogo.findFirst({
  where: { t3777Code: code, active: true },
  orderBy: { variantLabel: 'asc' },
});
```

De keuze valt op het **alfabetisch eerste variantLabel** — willekeurig ten opzichte van wat een reviewer moet zien. Voor `RECYCLABLE_GENERAL_CLAIM` sorteert `auto-788eeea6-4` (een vliegwiel-promotie-uitsnede) vóór `gs1-guide`, dus wordt die uitsnede getoond; die is nagenoeg wit, vandaar het lege vakje.

## Omvang (gemeten op ACC, 2026-07-27)

53 codes hebben een echt gidslogo. Daarvan tonen er **9** iets anders:

| Code | Toont nu | Herkomst |
|---|---|---|
| RECYCLABLE_GENERAL_CLAIM | `auto-788eeea6-4` | flywheel-promotion |
| TRIMAN | `auto-788eeea6-5` | flywheel-promotion |
| SEPARATE_COLLECTION | `auto-788eeea6-3` | flywheel-promotion |
| RAINFOREST_ALLIANCE_PEOPLE_NATURE | `auto-788eeea6-1` | flywheel-promotion |
| EU_ORGANIC_FARMING | `default` | wikimedia-URL |
| GREEN_DOT | `default` | wikimedia-URL |
| FOREST_STEWARDSHIP_COUNCIL_MIX | `default` | wikimedia-URL |
| EUROPEAN_V_LABEL_VEGAN | `default` | wikimedia-URL |
| RAINFOREST_ALLIANCE | `default` | wikimedia-URL |

Twee patronen: `a…` sorteert vóór `g…` (vliegwiel-uitsneden) en `default` sorteert vóór `gs1-guide` (oude wikimedia-plaatjes). Voor die laatste vijf is dat extra zuur — het officiële GS1-logo is op 2026-07-26 juist geseed, maar wordt niet getoond.

## Waarom dit meer kost dan cosmetiek

Het voorbeeldlogo vertelt de reviewer *waar hij naar zoekt*. Een leeg vakje maakt die hulp waardeloos; een willekeurige uitsnede is erger, want die kan de reviewer op het verkeerde been zetten — hij gaat zoeken naar wat hij in het voorbeeld ziet in plaats van naar het echte keurmerk. Juist bij `RECYCLABLE_GENERAL_CLAIM`, de code met een mislabel-verleden en 0 mens-bevestigde referenties, is dat een reëel risico.

## Afbakening

- Alleen de SELECTIE in `GET /reference-logos/code/:code/image`. Geen wijziging aan de 20.8-fallback (`reference-examples/<code>.png` bij géén actieve referentie), de rate-limit-override, de traversal-guard, de sharp-normalisatie of de caching-headers.
- **Geen wijziging aan de herkenning.** Dit endpoint is weergave-only; `reference_logos` en de embeddings blijven ongemoeid.

## Acceptatiecriteria

1. **Voorkeursvolgorde op herkomst.** Given een code met meerdere actieve referenties, when het voorbeeldbeeld wordt opgevraagd, then wordt gekozen in deze volgorde:
   1. **officieel zaadlogo** — `source = 'gs1-packaging-label-guide'`, en voor Nutri-Score `'synthetic-nutriscore-bootstrap'`;
   2. **door een mens bevestigde crop** — `source = 'review-confirmed'`;
   3. **overige echte crops** — `realref-live-poc`, `flywheel-promotion`;
   4. **de rest** (o.a. de oude wikimedia-`default`-rijen).
   Binnen dezelfde categorie blijft de keuze deterministisch (bv. `variantLabel asc`), zodat herhaalde aanroepen hetzelfde beeld geven.
2. **De negen gemeten codes tonen daarna het gidslogo.** Aantoonbaar voor minimaal `RECYCLABLE_GENERAL_CLAIM`, `TRIMAN` en `EU_ORGANIC_FARMING`.
3. **Codes zonder gidslogo blijven werken.** Given een code met alleen echte crops (bv. `PREGNANCY_WARNING`, `VEGAN` — die hebben géén gidslogo), then wordt een mens-bevestigde crop getoond (categorie 2), niet een 404.
4. **20.8-fallback ongewijzigd.** Given géén actieve referentie, then blijft het gedrag exact zoals nu: `reference-examples/<code>.png`, header `X-Reference-Source: guide-example`, anders 404.
5. **Deterministisch.** Twee identieke aanroepen leveren hetzelfde beeld; geen afhankelijkheid van rij-volgorde in de database.
6. **Tests.** Voorkeursvolgorde per categorie (incl. het `auto-…` vs `gs1-guide`-geval en het `default` vs `gs1-guide`-geval), determinisme, en de bestaande 20.8-fallbacktest blijft groen.

## Tasks / Subtasks

- [x] 1. Selectie herschrijven: haal de actieve referenties op en kies met een expliciete herkomst-rangorde (AC1). Let op: één query met een CASE-ordering is netter dan meerdere `findFirst`-rondes.
- [x] 2. Tests voor de rangorde + determinisme (AC6).
- [x] 3. Verifiëren dat de 20.8-fallback en de rate-limit/traversal-guards onaangeroerd zijn (AC4).
- [ ] 4. Na deploy: op ACC controleren dat de 9 codes het gidslogo tonen (AC2).

## Dev Notes

- De constante `REAL_CROP_SOURCES` bestaat al elders in de codebase (o.a. `resolveSeedPath`, Story 19.15) voor het onderscheid gids vs echte crop — hergebruik die notie in plaats van een nieuwe lijst te verzinnen, anders lopen de definities uiteen.
- `synthetic-nutriscore-bootstrap` telt als zaadlogo: voor Nutri-Score bestaat geen GS1-gidslogo, maar wel een synthetisch zaad dat dezelfde rol vervult (zie de matrix-conventie).
- De `default`-variantrijen met een wikimedia-URL als `source` zijn historisch; die horen onderaan de voorkeur, niet bovenaan.
- [Source: apps/api/src/api/v1/reference-logos.ts:307-360; meting ACC 2026-07-27]

### Dev Agent Record — implementatie 2026-07-27
- `exampleSourceRank()` + `pickExampleReference()` in `reference-logos.ts`: één `findMany` per code, daarna kiezen op herkomst-rang (zaad → mens → overige echt → rest). `REAL_CROP_SOURCES` uit `bootstrap-run.ts` hergebruikt i.p.v. een nieuwe lijst.
- **Bewust sorteren i.p.v. filteren.** Een `notIn`-filter op de wikimedia-/`null`-rijen zou die stilzwijgend WEGgooien — `NULL NOT IN (...)` is `UNKNOWN`, niet `true` (dezelfde valkuil die 19.15 al eens raakte). Nu vallen ze onderaan, maar blijven ze beschikbaar als een code niets beters heeft.
- **Twee bestaande testsuites raakten stuk** (20.8-fallback en de 12.13-rate-limit-test): beide mocken `prisma.referenceLogo.findFirst`, en de selectie gebruikt nu `findMany`. Alleen de **mock-opzet** is aangepast (waarde → array); **geen enkele assertie is gewijzigd**, zodat beide hun functie als regressiepoort volledig houden. In beide bestanden staat een toelichting waarom.
- **RED-bewijs**: de zaad-voorkeur uitschakelen maakt exact 4 tests rood (AC1-zaad + de drie productiegevallen RECYCLABLE/EU_ORGANIC/TRIMAN); daarna hersteld, geen resten.
- **Verificatie**: tsc 0. Nieuwe suite 11/11, samen met de 20.8-fallback 14/14. **Volledige api-suite: 1014 passed / 0 failed.**
- **Resteert**: ACC-verificatie ná deploy dat de 9 gemeten codes het gidslogo tonen (AC2, task 4).

## Change Log
- 2026-07-27: Geïmplementeerd; status → review.
- 2026-07-27: Story aangemaakt na live-melding van Friso (leeg voorbeeldlogo bij RECYCLABLE_GENERAL_CLAIM).
