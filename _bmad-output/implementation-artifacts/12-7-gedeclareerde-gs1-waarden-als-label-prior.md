# Story 12.7: Gedeclareerde GS1-waarden van de GTIN als label-prior (spike → implementatie)

Status: **Fase B geïmplementeerd 2026-06-10** (spike GO → `12-7-spike-resultaten.md`). Idee van de PO,
bewezen op echte prod-data.

> **Fase B (gebouwd):** `resolveDeclaredMarks(gtin)` in `t3777-declarations.ts` — hergebruikt het
> bestaande catalog `tradeitemxml`-pad (Redis-cache, GLN-lookup, fail-safe), uitgebreid naar álle sporen
> (T3777 + DietTypeCode + NutritionalScore). Endpoint `GET /artwork/declared-marks/:gtin` (lazy/on-view).
> Review-deck: prior-badge op de kaart ("✓ gedeclareerd op verpakking" / "⚠ niet gedeclareerd op deze
> GTIN", alleen als er een declaratie ís — graceful fallback) + gedeclareerde codes bovenaan in de picker
> met "gedeclareerd"-tag. 20 service-tests + 292 API-tests groen; web typecheck + build groen.
> Eind-tot-eind geverifieerd: de live catalog-XML levert T3777 én dietTypeCode (incl. lactose-free).

> **Spike-uitkomst (kort):** op de gelabelde gold-set is **0% van de valse detecties gedeclareerd** en
> **97% van de echte wél** → schone scheiding; precisie 96%→100% op records mét declaratie, 0% recall-verlies.
> Onder de aanbevolen graceful fallback vangt de prior **3/16 valse** (de overige 13 valse zitten op GTINs
> zónder declaratie → geen signaal). Live queue: **~54% dekking**; van de hoog-conf detecties dáár is
> **65% out-of-set** (incl. de bekende RECYCLABLE@1.00-degeneraties). → **dekking is de bepalende variabele;
> re-ranker/auto-flag met graceful fallback, geen harde filter.**
Hoort bij Epic 12 (brede keurmerk-dekking) als **precisie-hefboom** die het embedding-knelpunt
(Story 12.2/12.3: zwakke discriminatie over honderden klassen) grotendeels omzeilt.

## Kernidee (in één zin)

We weten per review-item van **welke GTIN** de gedetecteerde crop komt. De GS1-declaratie van die
GTIN (in prod `tradeItems`) vertelt **welke keurmerken/claims daadwerkelijk op de verpakking staan**.
Gebruik die gedeclareerde set als **prior**: rangschik de relabel-kandidaten erop, pin ze in de picker,
en flag detecties **buiten** de gedeclareerde set automatisch als waarschijnlijk-vals.

## Bewijs op echte data (GTIN `05060925294569`, prod `application.tradeItems`, key `8717903950005-05060925294569-528`)

Gedeclareerd en **als logo op de verpakking** (`isDietTypeMarkedOnPackage=TRUE`):

| GS1-veld | Gedeclareerde waarden |
|---|---|
| `packagingMarkedLabelAccreditationCode` (T3777) | `CERTIFIED_B_CORPORATION`, `VEGAN_SOCIETY_VEGAN_LOGO`, `LONDON_BETH_DIN_KOSHER`, `RETURNABLE_PET_BOTTLE_NL`, `RECYCLABLE_GENERAL_CLAIM` |
| `dietTypeCode` (marked on pack) | `VEGAN`, `FREE_FROM_GLUTEN`, `KOSHER` |

**Effect:** de voorgestelde `BETER_LEVEN_1_STER @0,70` zit hier **niet** tussen → meteen te flaggen als
vals. De kandidatenset krimpt van ~920 codes naar **~8**; de embedding hoeft alleen daarbinnen te
discrimineren. Dit is precies de ontsnapping aan het 17 %-embedding-knelpunt uit 12.2.

## GDSN-extractiepaden (geverifieerd op bovenstaande tradeItem)

De prod-`tradeItems` is het XXtract-veldboom-formaat: knopen met `meta.gdsn` (GS1-veldnaam) + `value`.
Relevante modules/velden:

- **`packagingMarkingModule`** → herhaalde `packagingMarkedLabelAccreditationCode` (T3777-marks).
  Ook `isTradeItemMarkedAsRecyclable`, `isPackagingMarkedReturnable` als booleaanse hints.
- **`dietInformationModule`** → herhaalde paren `dietTypeCode` + `isDietTypeMarkedOnPackage`
  (filter op `TRUE` = staat écht als pictogram op pack).
- **`nutritionalInformationModule`** → `nutritionalScore` (Nutri-Score A–E, spoor `NutritionalScore`).
- **`dangerousSubstanceInformationModule` / regulated** → GHS-symbolen (spoor `GHSSymbolDescriptionCode`).
- **`consumerInstructionsModule`** → consumenten-/AISE-pictogrammen (spoor `EU_consumerUsageLabelCodeList`).

Mapping spoor↔veld is al vastgelegd in `12-gs1-veld-codelijst-mapping.md` en `spoor-codes.ts`.

## Story

Als review-eigenaar/annotator,
wil ik dat het systeem bij elk review-item de **gedeclareerde GS1-marks van die GTIN** ophaalt en als
prior gebruikt voor het labelvoorstel, zodat (a) het voorgestelde label vaker meteen klopt, (b) de
relabel-keuzelijst de juiste kandidaten bovenaan zet, en (c) detecties die niemand op die verpakking
heeft gedeclareerd automatisch als twijfel/vals worden gemarkeerd — i.p.v. te raden over ~920 klassen.

## Probleem

- Het detectievoorstel raadt nu **class-agnostisch** over de volledige code-universe; bij zwakke
  embedding (12.2: ~17 % op echte crops) levert dat veel valse voorstellen (bv. `BETER_LEVEN @0,70` op
  een verpakking waar Beter Leven niet eens gedeclareerd is).
- We hebben een **sterke, gratis prior** ongebruikt liggen: de GS1-declaratie per GTIN. Die is al de
  bron van de bestaande T3777-**crosscheck ná** detectie (`t3777-declarations`), maar wordt nog niet
  ingezet **vóór/tijdens** het voorstel.

## Doel / niet-doel

- **Doel:** declared-values per GTIN ophalen, normaliseren naar (spoor, code), en gebruiken als
  (1) re-ranker van de relabel-kandidaten, (2) pin-met-badge "gedeclareerd op verpakking" in de picker,
  (3) confidence-boost voor in-set detecties en auto-flag (twijfel) voor out-of-set detecties.
- **Niet-doel:** een **harde filter** maken (undeclared/ongemodelleerde marks zoals de Weggooiwijzer
  moeten mogelijk blijven → prior, geen poort); de detectie-/embedding-pijplijn vervangen; declaraties
  schrijven/corrigeren in de catalogus.

## Acceptatiecriteria

1. **Ophalen:** voor een review-item met GTIN levert de service de gedeclareerde marks op als lijst van
   `{spoor (fieldType), code, markedOnPack?}`, uit prod `tradeItems` (of het bestaande catalogus-datapad),
   gecachet per GTIN. Robuust bij ontbrekende GTIN/module (geen crash → lege prior).
2. **Re-rank + UI:** in de relabel-picker staan de gedeclareerde codes **bovenaan** met badge
   "gedeclareerd op verpakking"; de rest van het universe blijft doorzoekbaar eronder (mobile + desktop).
3. **Auto-flag:** een detectie waarvan de code **niet** in de gedeclareerde set zit, wordt gemarkeerd
   (badge/reason "niet gedeclareerd op deze GTIN") en telt niet als hoog-confident; in-set detecties
   krijgen een zichtbare bevestiging. Drempelgedrag configureerbaar, default = re-rank + flag (geen filter).
4. **Meetbaar effect (spike-uitkomst):** op een steekproef uit de huidige review-queue (≥30 items met
   gevulde declaratie) rapporteren we precisie/again-rate mét vs zónder prior; de prior mag de recall op
   ware marks **niet** verlagen (out-of-set blijft labelbaar).
5. **Eerlijke dekkingsrapportage:** log/rapporteer welk deel van de queue-GTIN's **geen** bruikbare
   declaratie heeft (lege prior) en hoe vaak de ware mark ongemodelleerd/ongedeclareerd is (bv.
   Weggooiwijzer) — geen stille aanname dat de prior altijd dekt.

## Technisch ontwerp (voorstel)

- **Service:** `declared-marks.ts` (API) — `getDeclaredMarks(gtin) → DeclaredMark[]`, leest prod
  `tradeItems` via de bestaande catalogus-route (`tradeitemxml`-API / Mongo-baseline) en mapt GDSN-velden
  → spoor/code met de extractiepaden hierboven. Per-GTIN cache (TTL).
- **Hergebruik:** dezelfde declaratie-bron als `t3777-declarations` (crosscheck) — één extractor, twee
  gebruikers (prior vóór, crosscheck ná).
- **API:** review-queue/relabel-endpoints verrijken items met `declaredMarks` + per-detectie
  `inDeclaredSet: boolean`.
- **Frontend:** `MobileReviewDeck` + (desktop) picker: declared codes pinnen/badgen (hergebruik
  `spoor-codes.ts` + Benelux-tag-patroon), out-of-set reason tonen.
- **Connectiviteit:** API-service heeft toegang tot prod-`tradeItems` nodig — via de bestaande
  catalog/tradeitemxml-API (X-API-Key) of een Mongo-read. **Spike-vraag:** welk datapad is het robuustst
  vanaf de ACC-app (geen VPN-afhankelijkheid, zoals bij de Postgres-route).

## Spike-vragen (eerst beantwoorden, ~½–1 dag)

1. **Datapad:** tradeitemxml-API vs directe Mongo-read — latency, auth, beschikbaarheid vanaf ACC-app.
2. **Veld-volledigheid:** in welk % van de queue-GTIN's zijn de mark-velden gevuld én `markedOnPack=TRUE`?
   (Meet op een queue-steekproef.)
3. **Precisie-lift:** hoeveel daalt de valse-voorstel-rate met prior re-rank op die steekproef?
4. **Out-of-set frequentie:** hoe vaak is de ware mark ongedeclareerd/ongemodelleerd (Weggooiwijzer-achtig)?

## Fasering

- **Fase A (spike):** `getDeclaredMarks` als los script tegen prod-`tradeItems`; meet AC4/AC5 op een
  queue-steekproef; beslis datapad. **Go/no-go** op de precisie-lift.
- **Fase B (implementatie):** service + API-verrijking + picker-UI (pin/badge/flag); config voor
  re-rank-vs-filter; dekkingsrapportage.

## Afhankelijkheden / eigenaar

- **Hergebruikt:** `t3777-declarations` (declaratie-extractie), `spoor-codes.ts` (spoor↔code), Epic 8
  review-UI/relabel-picker, catalogus-datapad (tradeitemxml/Mongo-baseline).
- **Raakt:** `12-gs1-veld-codelijst-mapping.md` (spoor-definities), Story 12.5 (acceptatienorm — prior
  kan precisie-bar helpen halen), 12.6 (label-wachtrij wordt schoner → minder ruis voor de PO).
- **Kanttekening:** ongemodelleerde marks (Weggooiwijzer = geen T3777-code) blijven buiten de prior →
  prior is een re-ranker, geen poort; dit is bewust (zie niet-doel + AC3/AC5).
