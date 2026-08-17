# Adversariële CODE-review — Story 20.13 (voorbeeldlogo op herkomst kiezen)

```yaml
reviewed_commit: a114ea4
baseline: 6ec4a87
branch: acc
scope: apps/api/src/api/v1/reference-logos.ts + reference-logos-example-rank-20-13.test.ts
       + de mock-aanpassingen in reference-logos-example-fallback.20-8.test.ts en rate-limit.routes.test.ts
verdict: PASS-met-voorbehoud
severity_count: { high: 0, medium: 4, low: 5 }
```

De fix zelf is klein, juist en goed onderbouwd. De rangorde klopt regel-voor-regel met AC1, de
tiebreak is aantoonbaar deterministisch (uniek `(t3777Code, variantLabel)` + `orderBy` in de
query + strikte `<` in de `reduce`), en álle 20.8-garanties staan onaangeroerd overeind:
traversal-guard, rate-limit-override, sharp-normalisatie, caching-headers en de
`reference-examples/<code>.png`-fallback zijn byte-identiek. De keuze om te **sorteren i.p.v.
filteren** is de goede keuze en de `NULL NOT IN`-motivatie is correct.

Wat er ontbreekt is bewijs, niet code. Twee dingen wegen: de tests pinnen de sorteerfunctie
vast maar niet de sélectie (de suite herimplementeert die zelf), en de fix maakt het gidslogo
voor **alle 53 codes** onvoorwaardelijk hét beeld dat de reviewer ziet — terwijl dat gidslogo
uit een geautomatiseerde PDF-extractie komt die nergens is nagelopen, en task 4 (ACC-controle)
nog open staat en maar 3 van die 53 codes dekt.

---

## Bevindingen

### M1 — geen enkele test raakt de sélectie; de suite herimplementeert die
`apps/api/src/__tests__/api/reference-logos-example-rank-20-13.test.ts:22-26` en `:97-104`,
tegenover `apps/api/src/api/v1/reference-logos.ts:89-100` — **medium**

De nieuwe suite importeert alléén `exampleSourceRank` (de pure rangfunctie) en bouwt daarnaast
zijn **eigen** keuze-implementatie:

```ts
/** Kies zoals het endpoint doet: laagste rang wint, bij gelijkspel de eerste. */
function pick<T extends { source: string | null }>(refs: T[]): T {
  return refs.reduce((best, r) =>
    exampleSourceRank(r.source) < exampleSourceRank(best.source) ? r : best
  );
}
```

Dat is een kopie van de `reduce` in `pickExampleReference`. Gevolg: de drie regels die de
selectie écht bepalen — `where: { t3777Code, active: true }`, `orderBy: { variantLabel: 'asc' }`
en de richting van de vergelijking — zijn door **geen enkele test** afgedekt. Concreet blijft
de hele suite groen als iemand:

- `orderBy: { variantLabel: 'asc' }` weghaalt → Postgres levert rijen in fysieke volgorde,
  gelijke-rang-tiebreaks worden willekeurig, **AC5 breekt in productie**;
- `<` naar `<=` verandert → binnen dezelfde rang wint dan de láátste i.p.v. de eerste;
- `active: true` uit de `where` haalt → gedeactiveerde varianten kunnen weer getoond worden.

De test die het determinisme heet te dekken (`:97-104`) test dus de eigen `pick()`-helper, niet
het endpoint. De AC6-eis "determinisme" en de AC1-slotzin "binnen dezelfde categorie blijft de
keuze deterministisch (bv. `variantLabel asc`)" zijn daarmee **niet vastgepind**.

Wat wél goed zit en krediet verdient: dat het endpoint `findMany` gebruikt is indirect wél
vastgelegd, doordat `reference-logos-example-fallback.20-8.test.ts:52-70` de `findMany`-mock
zet en `x-reference-source: reference` verwacht — met een teruggedraaide `findFirst` zou die
test op het fallback-pad uitkomen en falen.

**Wat moet wijzigen:** één endpoint-test via `app.inject` met drie gemockte `findMany`-rijen
(zaad, mens, auto) in gehusselde volgorde, die assert dat `downloadTrainingObject` met het
zaad-`storagePath` wordt aangeroepen; plus één assertie op de doorgegeven query-args
(`where.active === true` en `orderBy.variantLabel === 'asc'`).

### M2 — het endpoint heeft een tweede consument die de story niet noemt, en daar wordt de gekozen afbeelding een beslisanker
`apps/web/src/components/flywheel/EvidencePanel.tsx:151` en `:218-223` — **medium**

De Afbakening zegt "weergave-only, raakt de herkenning niet". Voor het codepad is dat juist:
er wordt niets geschreven, `resolveSeedPath` en de embeddings blijven ongemoeid, en
`git grep` op `reference-logos/code` vindt geen enkele consument in `apps/ml-service`. Maar het
endpoint heeft **twee** frontend-consumenten, en de story onderzoekt er één:

| Consument | Wat de afbeelding daar doet |
|---|---|
| `MobileReviewDeck.tsx:117`, `:986` | "Zoek dit keurmerk op de verpakking" — het geval uit de story |
| `EvidencePanel.tsx:151` via `flywheelService.fetchReferenceCodeImageBlob` | het rechter beeldvak van de **promotie-quarantaine**, caption `Referentie {code}` / alt `Actieve referentie {code}`, náást de kandidaat-crop, met de knoppen Afkeuren/Vrijgeven eronder |

In dat tweede paneel beslist een mens of een kandidaat-crop de referentiebibliotheek in mag —
een beslissing die wél `reference_logos` en dus de embeddings vult. De afbeelding die deze
wijziging daar verandert is precies het vergelijkingsanker van die beslissing. "Weergave-only"
klopt dus mechanisch, maar niet in gevolg.

En de richting is daar niet evident dezelfde. Voor het review-deck is "toon het officiële logo"
onbetwist beter. In de quarantaine vergelijkt de beoordelaar een **echte artwork-crop** met wat
er al in de bibliotheek zit; die vergelijking wordt door een geïdealiseerd, vlak gidslogo
mogelijk *moeilijker* dan door de zuster-crops die de kandidaat gaat vervoegen. Geen enkele AC,
geen enkele test en task 4 raken dit paneel.

**Wat moet wijzigen:** de Afbakening en task 4 uitbreiden met `EvidencePanel`, en expliciet
vaststellen (product-keuze) of de quarantaine hetzelfde rangorde wil of juist "de echte crops
eerst". Wordt het antwoord "anders", dan hoort dat een eigen parameter te zijn en niet een
tweede endpoint.

### M3 — rang 0 vertrouwt de PDF-extractie onvoorwaardelijk; het lege vakje kan terugkomen, nu bovenaan
`apps/api/src/api/v1/reference-logos.ts:78-87` samen met
`apps/api/scripts/extract_gs1_label_guide.py:31`, `:82`, `:190`, `:198` — **medium**

De fix verandert *welke rij* wordt gekozen, niet *of het gekozen beeld bruikbaar is*. Nergens
in het endpoint (oud noch nieuw) staat een leegte- of contrastcheck. Twee dingen maken dat
relevant voor juist de kopzaak van deze story:

1. **De gidsseeds zijn niet mensgecontroleerd en kunnen bijna-wit zijn.** De extractie plakt
   elke gids-afbeelding opaque op wit (`:190` "white is the right neutral bg", `:198`
   "opaque-on-white"). Een keurmerk dat als witte omtrek voor donkere verpakking is getekend
   wordt daarmee onzichtbaar — exact het symptoom ("nagenoeg wit, vandaar het lege vakje") dat
   deze story bestrijdt, één rang hoger.
2. **De code-toewijzing is een heuristiek.** `NEIGHBOR_WINDOW = 2` scant tot twee rijen omhoog
   naar de "nearest non-empty code above" (`:31`, `:82`). Een mistreffer koppelt het logo van
   een buur-code — en recycling-codes staan in de gids bij elkaar
   (`RECYCLABLE_GENERAL_CLAIM`, `SEPARATE_COLLECTION`, `TRIMAN` zijn alle drie in de gemeten
   negen). Ook is de 200px-vloer bij het seeden bewust omzeild
   (`seed-reference-logos-from-guide.js:6-9`: 79% van de officiële logo's zit eronder).

Vóór deze commit deed de kwaliteit van een gidsrij voor 9 codes niet mee, want hij werd niet
getoond. Nú is hij voor **alle 53** codes onvoorwaardelijk hét beeld — de blast radius van een
slechte seed gaat van "één van meerdere willekeurige keuzes" naar "altijd deze". Dat is netto
nog steeds de goede kant op, maar het is geen risicoloze wijziging en de story presenteert hem
als cosmetisch-plus.

**Wat moet wijzigen:** bij de ACC-controle (task 4) niet 3 maar **alle 53** codes visueel
langslopen — dat is één contactblad, geen 53 handelingen. Codes met een blanke of duidelijk
verkeerde gidsseed horen die rij gedeactiveerd te krijgen (dan valt de rangorde vanzelf terug
op rang 1/2), niet een uitzondering in de code.

### M4 — er zijn nu twee tegengestelde definities van "gids", en niets bij `resolveSeedPath` waarschuwt daarvoor
`apps/api/src/api/v1/reference-logos.ts:73` tegenover
`apps/api/src/services/flywheel/bootstrap-run.ts:146-156` — **medium**

De Dev Notes eisen hergebruik van de bestaande notie "gids vs echte crop", "anders lopen de
definities uiteen". De implementatie hergebruikt `REAL_CROP_SOURCES` (goed, en dat is de helft
van de notie), maar definieert "zaad" daarnaast als een **eigen allowlist van twee waarden**:

```ts
const SEED_SOURCES = ['gs1-packaging-label-guide', 'synthetic-nutriscore-bootstrap'];
```

`resolveSeedPath` — het herkenningspad — definieert "gids" precies omgekeerd, als het
**complement**: `OR: [{ source: null }, { source: { notIn: [...REAL_CROP_SOURCES] } }]`,
nieuwste eerst (`orderBy: { createdAt: 'desc' }`). De twee spreken elkaar op twee manieren tegen:

- **Andere verzameling.** Een historische wikimedia-rij is voor `resolveSeedPath` een gids (en
  dus een geldig zoekzaad), en voor het voorbeeld-endpoint "de rest" op rang 3. Meting 19.15
  toont dat dit reële codes raakt: voor `GREEN_DOT`, `EU_ORGANIC_FARMING`,
  `EUROPEAN_V_LABEL_VEGAN` en `FOREST_STEWARDSHIP_COUNCIL_MIX` was het gidszaad op 2026-07-12
  een wikimedia-URL (`19-15-eval-zaadkeuze.md:26-31`).
- **Andere tiebreak binnen dezelfde verzameling.** Het endpoint kiest rang 0 en dan het láágste
  `variantLabel`; `resolveSeedPath` kiest de **nieuwste** `createdAt`. Het seed-script maakt
  `gs1-guide`, `gs1-guide-1`, `gs1-guide-2`, … (`seed-reference-logos-from-guide.js:25-27`), dus
  bij een code met meerdere gidsvarianten toont het endpoint `gs1-guide` terwijl de bootstrap
  tegen de laatst geseede variant heeft gezocht. Reviewer en zoekmachine kijken dan naar
  verschillende beelden, zonder dat iets dat zegt.

Dat wikimedia onderaan valt is hier de **gewenste** uitkomst — maar het is precies de divergentie
die de Dev Notes wilden voorkomen, en er staat niets bij `resolveSeedPath` dat een volgende lezer
erop wijst dat er nu twee begrippen "gids" bestaan. Tweede orde: `SEED_SOURCES` is hard gecodeerd,
dus een derde zaadbron (een volgende synthetische bootstrap) landt stilzwijgend op rang 3 in
plaats van rang 0.

**Wat moet wijzigen:** `SEED_SOURCES` naar `bootstrap-run.ts` verhuizen naast
`REAL_CROP_SOURCES`, met één regel commentaar bij `resolveSeedPath` die de twee definities
tegenover elkaar zet. Eén plek, één keer lezen.

### L1 — `findMany` zonder `select` en zonder `take` op een ongeauthenticeerde burst-route
`reference-logos.ts:90-93` — **low**. Waar `findFirst` één rij ophaalde, haalt dit alle actieve
rijen van de code met **alle** kolommen op, terwijl de route via `optionalAuth` niemand weigert
en per picker-open ~80 keer wordt geraakt (de override op `:361` staat op 300/60s en de
docstring `:348-357` noemt resource-exhaustion expliciet als zorg). De cap in
`guardrails.ts:228-235` geldt uitsluitend `source='flywheel-promotion'`; `review-confirmed`-rijen
(`artwork-pipeline.ts:1482`) zijn ongecapt en groeien met elke menselijke accept. Praktisch nu
tientallen rijen, dus onschadelijk — `select: { storagePath: true, source: true }` maakt het
gratis. Task 1 stelde een `CASE`-ordering in SQL voor; die had dit meteen opgelost.

### L2 — `OTHER_REAL_SOURCES` is afgeleid, en die afleiding gaat één kant op goed
`reference-logos.ts:76` — **low**. `REAL_CROP_SOURCES.filter(s => s !== HUMAN_SOURCE)` doet
automatisch het juiste voor een nieuwe *machine*-bron (rang 2), en stilzwijgend het verkeerde
voor een nieuwe *mens*-bron: die belandt op rang 2 in plaats van rang 1. Dat is de prijs van het
gevraagde hergebruik; een regel commentaar bij `REAL_CROP_SOURCES` volstaat.

### L3 — "Nieuwe suite 11/11" klopt niet; het zijn 9 testgevallen
Dev Agent Record, regel 92 — **low**. Het bestand bevat 9 `it()`-blokken (3 + 3 + 2 + 1). De
20.8-suite heeft 5, en 9 + 5 = 14 — dus de "samen 14/14" in dezelfde regel is juist en de
"11/11" ernaast intern tegenstrijdig. Bookkeeping, geen gedrag.

### L4 — `source` is vrij tekstveld van de aanroeper en bepaalt nu de rang
`reference-logos.ts:121` (upload) + `:79` (rang) — **low**. De POST accepteert elke
`source`-waarde zonder allowlist, en `optionalAuth` weigert niemand. Een upload met
`source='gs1-packaging-label-guide'` en een variantlabel dat vóór `gs1-guide` sorteert wordt
dus hét voorbeeldlogo. Niet erger dan vóór deze commit (toen won hetzelfde label puur
alfabetisch), en `active`-curatie is de bestaande rem — maar `source` is nu een
vertrouwenssignaal en zou een allowlist verdienen.

### L5 — rangfunctie geëxporteerd uit een route-module, puur voor de test
`reference-logos.ts:78` — **low**. `exampleSourceRank` is publiek gemaakt zodat de unit-test
hem kan importeren; die test sleept daardoor de hele route-module mee (bullmq, prisma,
ml-client, sharp) voor een functie van vier regels. Hoort in een klein helper-bestand, of —
zie M1 — de test hoort het endpoint te draaien in plaats van de helper.

---

## AC-audit

| AC | Oordeel | Code-bewijs |
|----|---------|-------------|
| **AC1** — voorkeursorde op herkomst | **gedekt** | `exampleSourceRank` `:78-87` levert exact de vier categorieën uit de AC: zaad `:79` (`gs1-packaging-label-guide` + `synthetic-nutriscore-bootstrap`), mens `:80` (`review-confirmed`), overige echt `:81` (`OTHER_REAL_SOURCES` = `REAL_CROP_SOURCES` minus mens = `['realref-live-poc','flywheel-promotion']`, letterlijk de AC-lijst), rest `:86` incl. `null`/`undefined`. Gedraaide probe op een letterlijke transcriptie van `:73-99`: alle 9 testgevallen groen. Deterministische tiebreak binnen een rang: `@@unique([t3777Code, variantLabel])` (schema `reference_logos`) maakt `variantLabel` een totale orde per code, `orderBy` `:92` legt die op, strikte `<` in de `reduce` `:97-99` houdt de eerste bij gelijkspel. Voorbehoud: die drie regels zijn ongetest (**M1**), en `SEED_SOURCES` is een lokale allowlist i.p.v. de hergebruikte notie (**M4**). |
| **AC2** — de negen gemeten codes tonen het gidslogo | **niet gedekt** | Kan in deze omgeving niet worden aangetoond: het vereist de ACC-database (welke `source` elke `gs1-guide`-rij daadwerkelijk draagt) en een oogcontrole van het gerenderde beeld. Task 4 staat bewust open. Aannemelijk gemaakt: het seed-script schrijft `source: e.source \|\| 'gs1-packaging-label-guide'` (`seed-reference-logos-from-guide.js:67`, `:74`), het extractie-manifest zet die waarde zelf ook (`extract_gs1_label_guide.py:213`), en de onafhankelijke ACC-meting van 19.15 bevestigt zo'n rij voor `RECYCLABLE_GENERAL_CLAIM`, `TRIMAN` en `RAINFOREST_ALLIANCE_PEOPLE_NATURE` (`19-15-eval-zaadkeuze.md:33-34`, `:32`) — voor die codes treft rang 0. **Maar** diezelfde meting geeft voor `GREEN_DOT`, `EU_ORGANIC_FARMING`, `EUROPEAN_V_LABEL_VEGAN` en `FOREST_STEWARDSHIP_COUNCIL_MIX` als énige gidsrij een **wikimedia-URL** (`:26-31`) — dat is rang **3**. Die 4 van de 9 codes hangen dus volledig aan de bewering dat er op 2026-07-26 een `gs1-packaging-label-guide`-rij is bijgekomen; is dat voor een code niet gebeurd, dan kiest de nieuwe code opnieuw de wikimedia-`default` en ziet de reviewer **exact hetzelfde als vóór de fix**, zonder enig signaal. De 3 codes die task 4 wil controleren dekken maar 1 van die 4. En "de juiste rij wordt gekozen" is bovendien niet hetzelfde als "de reviewer ziet een bruikbaar logo" — zie **M3**. |
| **AC3** — codes zonder gidslogo blijven werken | **gedekt** | `pickExampleReference` filtert niets weg: bij afwezige rang-0-rij wint rang 1, dan 2, dan 3 (`reduce` `:97-99`); `null` retourneert het alléén bij `refs.length === 0` `:94`, en dán begint pas het 20.8-fallbackpad. Geen `notIn`, geen `where` op `source` — de `NULL NOT IN (...) = UNKNOWN`-valkuil is correct omzeild en het commentaar `:82-85` legt uit waarom. Probe: `[{auto-1, flywheel-promotion}, {crop-9, review-confirmed}, {poc-2, realref-live-poc}]` → `crop-9`; alléén-auto → `auto-1`, geen 404. Niet-gedekt-deel: dat `PREGNANCY_WARNING`/`VEGAN` inderdaad geen gidsrij hebben is een ACC-feit dat hier niet te controleren is. |
| **AC4** — 20.8-fallback ongewijzigd | **gedekt** | De diff-hunk `@@ -317,10 +369,7 @@` vervangt uitsluitend de vier `findFirst`-regels door één aanroep; alles erna is byte-identiek: traversal-guard `:369-371` intact (en getest, `reference-logos-example-fallback.20-8.test.ts:119-130` — 404 zonder storage-toegang), rate-limit-override `:361` intact, `reference-examples/${code}.png` + `X-Reference-Source: guide-example` `:380-385`, sharp-normalisatie met rauwe fallback `:388-396` en `:409-417`, `Cache-Control: private, max-age=3600` op beide takken. Alle 5 asserties van de 20.8-suite zijn ongewijzigd; alléén de mock ging van waarde naar array, met toelichting in het bestand `:11-15`. Idem voor de 12.13-rate-limit-suite. |
| **AC5** — deterministisch | **gedekt-met-voorbehoud** | Mechanisch juist: `orderBy` in de query + uniek `(code, variantLabel)` + strikte `<` → geen afhankelijkheid van rij-volgorde in de database, en twee identieke aanroepen leveren dezelfde rij. Randnoot: de tekstordening volgt de collatie van de database — deterministisch per omgeving, niet gegarandeerd identiek tussen omgevingen met een andere `LC_COLLATE`. Het voorbehoud is het bewijs: **M1** — de determinisme-test test de eigen `pick()`-helper, niet de query. |
| **AC6** — tests | **deels** | Gedekt: de rangorde per categorie op de échte `exampleSourceRank`, inclusief beide genoemde patronen (`auto-…` vs `gs1-guide` `:50-58`, `default` vs `gs1-guide` `:60-66`) en de "niet weggefilterd"-eigenschap `:39-47`. De bestaande 20.8-fallbacktest blijft groen als regressiepoort met ongewijzigde asserties. Het RED-bewijs uit de story is **bevestigd**: met de zaad-tak uitgezet vallen exact 4 van de 9 testgevallen om — AC1-zaad, RECYCLABLE, EU_ORGANIC, TRIMAN — en 5 blijven groen. Niet gedekt: determinisme van de sélectie, de `where`/`orderBy` en de tie-richting (**M1**); de tweede consument `EvidencePanel` (**M2**). |

## Wat moet wijzigen vóór PASS

1. **M1** — één endpoint-test via `app.inject` die de rangorde en het determinisme op
   `pickExampleReference` zelf vastpint, plus een assertie op `where.active` en
   `orderBy.variantLabel`. Zonder die test kan AC5 stil sneuvelen bij de eerstvolgende
   aanpassing van de query.
2. **M3 + AC2** — task 4 op ACC uitvoeren over **alle 53** codes met een gidsrij, niet 3, en
   daarbij als eerste de 4 codes waarvan 19.15 aantoonde dat hun gidsrij een wikimedia-URL was
   (`GREEN_DOT`, `EU_ORGANIC_FARMING`, `EUROPEAN_V_LABEL_VEGAN`,
   `FOREST_STEWARDSHIP_COUNCIL_MIX`): daar faalt de fix stil als de 07-26-seed niet is geland.
   Blanke of verkeerd toegewezen gidsseeds deactiveren, niet in code uitzonderen.
3. **M2** — `EvidencePanel` (promotie-quarantaine) in de Afbakening en in task 4 opnemen, en
   vaststellen of dat paneel dezelfde rangorde wil. Dit is de enige echte productvraag in deze
   review; de rest is uitvoering.
4. **M4** — `SEED_SOURCES` naast `REAL_CROP_SOURCES` in `bootstrap-run.ts`, met één regel bij
   `resolveSeedPath` die de twee definities van "gids" tegenover elkaar zet.
5. **L1–L5** — `select` op de `findMany`; commentaar bij de `OTHER_REAL_SOURCES`-afleiding;
   "11/11" in het Dev Agent Record naar 9 corrigeren.

Punten 1, 4 en 5 zijn samen ruim onder een uur. Punt 2 is een oogcontrole. Punt 3 vraagt een
beslissing van Friso en blokkeert `done`, niet de deploy.

## Verificatie-aantekening

`apps/api/node_modules` bestaat niet in deze werkkopie, dus vitest kon hier niet draaien: de
claims "nieuwe suite 11/11", "samen 14/14", "volledige api-suite 1014 passed" en "tsc 0" zijn
**niet nagelopen** (de eerste is wel weerlegd door te tellen — zie L3). De rangorde en het
RED-bewijs zijn empirisch bevestigd met een probe op een letterlijke transcriptie van
`reference-logos.ts:73-99` (alleen de TS-annotaties verwijderd), tegen exact de testdata uit
`reference-logos-example-rank-20-13.test.ts`:

```
GREEN (zaadvoorkeur AAN) -> 9/9 pass; ROOD: geen
RED   (zaadvoorkeur UIT) -> 5/9 pass; ROOD: AC1-zaad bovenaan, AC2-RECYCLABLE,
                                            AC2-EU_ORGANIC, AC2-TRIMAN
```

Alle overige bevindingen zijn code-geverifieerd. Dat het endpoint géén herkenningspad raakt is
langs twee routes bevestigd: `git grep` op `reference-logos/code` vindt nul treffers in
`apps/ml-service` en nul in `scripts/`, en `git grep` op imports van `api/v1` binnen
`apps/api/src/services/**` vindt nul treffers (geen import-cyclus door de nieuwe
`bootstrap-run`-import; `bootstrap-run.ts` heeft geen neveneffecten op module-niveau —
`new Queue(...)` staat op `:750`, binnen een functie). De twee frontend-consumenten zijn
gevonden via `git grep fetchReferenceCodeImageBlob` en de directe `<img src>` in
`MobileReviewDeck.tsx`.
