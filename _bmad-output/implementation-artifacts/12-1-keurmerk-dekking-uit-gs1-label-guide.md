# Story 12.1: Brede keurmerk-dekking — referentiebibliotheek seeden uit de GS1 Packaging Label Guide

Status: ready-for-dev (scope: proof-slice + top-20 «tientallen»). Honderden = aparte architectuur-story (zie §Adversariële review).

## Story

Als datamanager / ML-eigenaar,
wil ik de keurmerk-referentiebibliotheek breed vullen vanuit de **officiële GS1-bronnen** (Packaging Label
Guide + codelijsten), geprioriteerd op wat onze artwork-producten daadwerkelijk declareren,
zodat het detectiesysteem **tientallen** keurmerken kan herkennen (proof-slice → top-20) — met officiële
logo's als grondwaarheid en validatie op echt artwork.

> Opschalen naar **honderden** klassen is met de huidige localize-architectuur (template-matching, kosten
> lineair in #templates) **niet haalbaar** — dat vergt een class-agnostische region-proposer en is afgesplitst
> naar Story 12.2 (zie §Adversariële review, Risico A).

## Context & bevindingen (2026-06-09)

**Probleem:** het systeem modelleert nu **5** keurmerk-klassen (reference_logos: GREEN_DOT, FSC_MIX,
EU_ORGANIC, V_LABEL_VEGAN, RAINFOREST_ALLIANCE). De gold-set toonde voor díé 5 een goede precisie
(≥0,7 = 100%, ≥0,5 = 82%), maar de **dekking** van het totale keurmerk-universum is minimaal.

**De te detecteren types komen uit 6 GS1-velden** (codelijsten in `benelux-fmcg-data-model-31353-nederlands.xlsx`):

| GS1-veld (gdsn) | Codelijst | # codes | Relatieve aanwezigheid (5k-sample) |
|---|---|---|---|
| `packagingMarkedLabelAccreditationCode` (T3777) | PackagingMarkedLabelAccreditationCode | 894 | 1622 (dominant) |
| `dietTypeCode` (+ `isDietTypeMarkedOnPackage`) | DietTypeCode | 34 | 457 (371 op verpakking) |
| `nutritionalScore` / `nutritionalProgramCode` | NutritionalProgramCode | 10 | 186 (Nutri-Score A–E) |
| `gHSSymbolDescriptionCode` | GHSSymbolDescriptionCode | 10 | 115 (GHS-pictogrammen) |
| `gHSSignalWordsCode` | GHSSignalWordsCode | 4 | 112 (tekst-signaalwoorden) |
| `enumerationValue` (logo-gebruik) | EU_consumerUsageLabelCodeList | 20 | AISE-instructiepictogrammen |

**Officiële referentielogo's:** `Packaging_label_guide_January2026_3_1_35.xlsx` (GS1) bevat per code een
embedded logo-plaatje. Geverifieerd: sheet `Labels_Packaging` ≈ **945 codes / 1026 embedded images**,
elk geankerd op een rij waarvan kolom A de GDS-code is. Plus `Labels_Regulator` (17, o.a. CE) en
`Labels_Instructions` (12, AISE). → de logo's zijn **automatisch te extraheren en aan codes te koppelen**.

**Prioriteringsdata:** declaratie-frequentie op de 131 artwork-leverancier-GLN's
(zie `tests/validation/keurmerk-declaratie-frequentie.md`): top = GREEN_DOT, RECYCLABLE_GENERAL_CLAIM,
TRIMAN, hars-recyclingcodes, FSC, EU_ORGANIC, BETER_LEVEN, V-Label, RAINFOREST_ALLIANCE_PEOPLE_NATURE
(nieuw logo — wij hebben het oude), MSC, PEFC, Fairtrade, B-Corp, PETA, kosher/halal, …

**Bouwt voort op Story 7.3** (ReferenceLogo-model, upload-API, overzicht-UI, MinIO `reference-logos/`-prefix).
Deze story voegt **bulk-seeding + brede dekking + prioritering + validatie** toe; hergebruikt 7.3's datamodel
en opslagcontract (niet afwijken).

## Adversariële review (2026-06-09) — kernbevindingen, verwerkt

Onafhankelijke review tegen de codebase (file:line geverifieerd) bracht drie dragende problemen aan het licht;
de ACs hierboven zijn erop aangepast.

- **Risico A — CRITICAL (her-scope, niet op te lossen binnen deze story).** Localize = `for tmpl in templates: cv2.matchTemplate`
  (`localization.py:347`), kosten ≈ `tiles × templates × ~10 scales`, dus **strikt lineair in het aantal codes**.
  5→50 = ×10, 5→500 = ×100 werk. Bij gemeten ~28s/beeld @ 5 templates is "honderden" **architecturaal onhaalbaar**.
  → Deze story is begrensd tot **proof-slice + top-20 (tientallen)** met een **harde cap op #templates + latency-budget**.
  Honderden vergt een **class-agnostische region-proposer** (regio detecteren → embedden → classificeren, kosten
  ontkoppeld van #klassen) → **afgesplitst naar Story 12.2**.
- **Risico AC4-defect — HIGH.** De aanname "hergebruik 8-N1 reindex-hook voor embeddings" is **onjuist**: `reloadTemplates`
  bust alleen de localize-cache; `rebuild_reference_embeddings()` is **startup-only** (`main.py:62`), geen endpoint,
  geen Node-aanroep; 8-N1 = pgvector REINDEX (index-DDL, niet de vectoren). → AC4 herschreven: **nieuwe ML-endpoint bouwen**.
- **Risico AC5-defect — HIGH.** Classify gebruikt een **globale** drempel (`CLASSIFY_THRESHOLD_EMBEDDING=0.75`); er is
  géén per-klasse classify-drempel. Precisie daalt bij meer verwarbare klassen en AC5-oud (alleen localize-drempel)
  zag dat niet. → AC5 herschreven naar **classify-precisie/recall + confusion-matrix + her-baseline 5 klassen**.
- **MEDIUM — extractie:** mapping ~93% exact, maar 52 buur-ankers + 96 multi-image-rijen = ~6% stille-mislabel-risico;
  243 JPEG (transcode), 46 EMF (skip), <200px-collisie met upload-eis. → AC1 gehard.
- **HIGH — Risico E:** localize is rigide `TM_CCOEFF_NORMED` zónder rotatie/kleur/occlusie-invariantie; één officieel
  logo geeft **zwakke recall** op echt artwork. De fix (meer varianten/klasse) **vergroot Risico A** → varianten-budget
  begrenzen en in het latency-budget verrekenen.
- **OK:** 7.3-model/route/opslagcontract kloppen; proof-slice-codes hebben alle 5 bruikbare raster-logo's;
  top-30 gedeclareerde codes goed gedekt in de guide; fieldType-migratie correct afgehandeld (lokaal, geen container-migrate).

## Acceptance Criteria

1. **Extractie uit de GS1 Label Guide:** Given het xlsx `Packaging_label_guide_*.xlsx`, When het seed-extractie-
   script draait, Then worden per GDS-code de embedded logo-afbeelding(en) geëxtraheerd, ge-normaliseerd naar PNG,
   gefilterd op placeholders (bv. 1×1) en minimale resolutie, en gekoppeld aan de exacte GDS-code.
   **WMF/EMF (geverifieerd: 46 in Labels_Packaging) wordt in batch 1 overgeslagen-met-rapportage** (niet blokkerend).
   **Mapping-correctheid is blokkerend (een fout-gelabelde referentie vergiftigt localize én classify):** het script
   moet de geverifieerde randgevallen afhandelen — **52 codes met alleen een buur-anker, 96 rijen met meerdere
   afbeeldingen, 9 codes zonder afbeelding**. Ambigue rijen → manifest-vlag "needs human review", niet stil koppelen.
   **243 JPEG's** (incl. proof-slice `BETER_LEVEN_1_STER`) → transcoderen naar PNG. Verzoen met de 7.3-uploadeis
   `REFERENCE_MIN_RESOLUTION=200` (veel guide-logo's < 200px → upscalen of de drempel voor seeds verlagen; 7.3-upload
   accepteert bovendien alleen PNG/SVG, geen JPEG).
   Het script produceert een **manifest** (code → bestand(en) → bron/release/veldtype + review-vlag) en draait
   read-only op het xlsx.
2. **Codelijst-validatie:** Given de officiële codelijsten uit `benelux-fmcg-data-model-*.xlsx`, When een code
   geëxtraheerd wordt, Then wordt gevalideerd dat de code in de juiste codelijst voorkomt (T3777 / DietType /
   GHSSymbol / NutritionalProgram / consumerUsageLabel) en wordt het **veldtype** vastgelegd op het referentierecord
   (zodat detectie/classificatie weet uit welk veld het logo komt). Onbekende/vervallen codes → gerapporteerd, niet stil gedropt.
3. **Geprioriteerde vulling (proof-slice → top-20 → kleine velden):** Given de declaratie-frequentie op de
   artwork-producten, When de bibliotheek gevuld wordt, Then start de eerste batch met de **proof-slice van 5**
   hoogst-gedeclareerde ontbrekende keurmerken (`RECYCLABLE_GENERAL_CLAIM`, `TRIMAN`, `BETER_LEVEN_1_STER`,
   `EUROPEAN_V_LABEL_VEGETARIAN`, `MARINE_STEWARDSHIP_COUNCIL_LABEL`) — volledige keten geverifieerd (AC1→AC5) —
   waarna uitgebreid wordt naar de top-20, en als afronding de kleine afgebakende velden (Nutri-Score,
   GHS-pictogrammen, AISE). Er is een meetbaar dekkingsrapport ("N van de top-M gedeclareerde keurmerken heeft nu
   ≥1 referentie").
   **Uitsluiting is datagedreven:** een code zónder bruikbare afbeelding in de guide wordt automatisch uitgesloten
   (de guide is scheidsrechter). Daarnaast een kleine harde blocklist voor per-definitie-tekst-codes:
   GHS-signaalwoorden (`DANGER`/`WARNING`) en als "no image" gemarkeerde wordmarks (bv. `SWISS_MADE`).
   Visuele pictogrammen die toevallig waarschuwingen zijn (`PREGNANCY_WARNING`, `NIX18`) worden **niet** uitgesloten.
4. **Embeddings opnieuw opbouwen (NIEUWE ML-endpoint — geen bestaande hook!):** Given nieuwe referentielogo's,
   When ze zijn opgeslagen, Then worden via een **nieuw toe te voegen** ML-endpoint de reference-embeddings
   opnieuw opgebouwd (`similarity_service.rebuild_reference_embeddings()` is nu **alleen startup**, `main.py:62` —
   geen HTTP, geen Node-aanroep), gevolgd door `reloadTemplates()` (localize-cache) en `reindex_reference_embeddings()`
   (pgvector ivfflat REINDEX = alleen index-DDL). **Acceptatiecheck:** een net geseede code is **classificeerbaar
   zonder ML-service-herstart**. ⚠️ Verificatie wees uit: `reloadTemplates` maakt een code alleen *localiseerbaar*,
   niet *classificeerbaar* — zonder de nieuwe rebuild-endpoint valt elke nieuwe crop op de embedding-route weg of
   snapt naar een verkeerde buur. Bestaande 5 klassen mogen niet breken.
5. **Validatie op echt artwork — op de CLASSIFY-stap, niet alleen localize:** Given de uitgebreide bibliotheek,
   When een detectie-run over een gold-set-steekproef draait, Then wordt per nieuw keurmerk **classify**-precisie
   én -recall gemeten met een **confusion-matrix** (welke klassen worden met elkaar verward), niet alleen een
   localize-drempel. ⚠️ Verificatie: classify gebruikt nu een **globale** `CLASSIFY_THRESHOLD_EMBEDDING` (0.75,
   `classification.py:42`) — er is **geen per-klasse classify-drempel**; `LOCALIZE_CLASS_THRESHOLDS` geldt alleen
   localize. Daarom: óf een per-klasse classify-drempelmechanisme toevoegen, óf AC5 levert per-klasse metrics +
   confusion-matrix. **Her-baseline de bestaande 5 klassen na uitbreiding** (de 82%/100%-cijfers gelden bij 5
   klassen en dalen naarmate er meer verwarbare buren bijkomen). Geen auto-accept zonder gemeten classify-precisie per klasse.

## Tasks / Subtasks

- [ ] **Task 1 — Seed-extractie uit de Label Guide (AC1, AC2)**
  - [ ] Script `apps/api/scripts/extract-gs1-label-guide.ts` (of py): lees `Labels_Packaging`/`_Regulator`/`_Instructions`,
        map embedded image-anchor → GDS-code (kolom A), schrijf PNG's naar `apps/api/seeds/reference-logos/{code}/{n}.png`
        + `manifest.json` (code, veldtype, bron-URL, release, land/type/functie).
  - [ ] WMF/EMF-conversie (bv. via ImageMagick/inkscape) of nette skip-rapportage; filter 1×1-placeholders en
        < `REFERENCE_MIN_RESOLUTION`.
  - [ ] Codelijst-cross-check tegen `Codelijsten`-tab (T3777=894, DietType=34, GHSSymbol=10, NutritionalProgram=10,
        consumerUsageLabel=20); rapporteer mismatches.
- [ ] **Task 2 — Bulk-import naar ReferenceLogo (AC2, AC3)**
  - [ ] Seed-runner hergebruikt 7.3 upload-flow (`reference-logos`-route / storage-service); idempotent per
        (t3777Code, variantLabel). Variantlabel uit volgorde/bron (bv. `gs1-guide`, `mono`, `nl`).
  - [ ] **Veldtype-uitbreiding op datamodel:** voeg `fieldType` toe aan `ReferenceLogo` (enum: ACCREDITATION |
        DIET | NUTRITIONAL | GHS_SYMBOL | CONSUMER_USAGE) — migratie lokaal genereren (⛔ nooit migrate op containers;
        per-geval toestemming). init.sql synchroon.
  - [ ] Prioriteitsvolgorde uit `keurmerk-declaratie-frequentie.md`. **Batch 1 = proof-slice van 5** (RECYCLABLE_GENERAL_CLAIM,
        TRIMAN, BETER_LEVEN_1_STER, EUROPEAN_V_LABEL_VEGETARIAN, MARINE_STEWARDSHIP_COUNCIL_LABEL) → volledig door AC4/AC5;
        pas daarna top-20, daarna kleine velden. Datagedreven uitsluiting (geen afbeelding = eruit) + harde blocklist
        GHS-signaalwoorden / "no image"-wordmarks.
- [ ] **Task 3 — NIEUWE ML-endpoint voor embedding-rebuild + herindexering (AC4)**
  - [ ] **Nieuw** ML-endpoint (bv. `POST /ml/artwork/rebuild-reference-embeddings`) dat
        `similarity_service.rebuild_reference_embeddings()` aanroept (nu startup-only, `main.py:62`).
  - [ ] Node-zijde: bulk-seed-runner roept na import achtereenvolgens aan: rebuild-embeddings → `reloadTemplates()`
        → `reindex_reference_embeddings()`. Acceptatie: nieuwe code classificeerbaar **zonder ML-herstart**.
  - [ ] Regressie: bestaande 5 klassen — localize én **classify** — niet verslechterd (her-baseline gold-set).
- [ ] **Task 3b — Latency-budget & template-cap (Risico A)**
  - [ ] Harde cap op aantal actieve localize-templates (incl. varianten) + gemeten per-beeld-latency-budget;
        run faalt/waarschuwt bij overschrijding. Documenteer de meetbare grens waarboven 12.2 (region-proposer) nodig is.
- [ ] **Task 4 — Dekkings- & validatierapport (AC3, AC5)**
  - [ ] Dekkingsrapport: top-M gedeclareerde codes vs aanwezige referenties.
  - [ ] Gold-set-validatie-run per nieuwe klasse (detectie + labelronde-HTML, hergebruik bestaande tooling);
        **classify-precisie én -recall + confusion-matrix per klasse** (welke klassen verwarren); drempel-advies.
  - [ ] Per-klasse classify-drempelmechanisme toevoegen, óf — indien uitgesteld — expliciet rapporteren dat
        classify op een globale drempel draait en wat dat per klasse kost.
- [ ] **Task 5 — Tests**
  - [ ] Unit: extractie-mapping (anchor→code), placeholder-filter, codelijst-validatie, manifest-vorm.
  - [ ] Integratie: idempotente bulk-import; `fieldType` correct; reindex aangeroepen.
  - [ ] De 4 beschermde tests in `tests/test_artwork_processing.py` blijven byte-identiek.

## Tests / ATDD

Drie categorieën (red-phase vóór implementatie):

1. **Nieuwe ATDD-tests voor de nieuwe ACs:**
   - Extractie/mapping (AC1): anker→code, **buur-anker (52) + multi-image-rij (96) afhandeling met review-vlag**,
     placeholder-/JPEG-/min-res-normalisatie, manifest-vorm, codelijst-validatie (AC2).
   - Bulk-import (AC3): idempotent per (code, variant); `fieldType` correct; datagedreven uitsluiting.
   - **Nieuwe embedding-rebuild-endpoint (AC4): een net geseede code is classificeerbaar zónder ML-herstart.**
   - Validatie (AC5): per-klasse classify-precisie/recall + **confusion-matrix**; her-baseline 5 klassen.
2. **Bestaande tests aanpassen waar het contract wijzigt:**
   - `apps/api/src/__tests__/api/reference-logos.routes.test.ts` + `mock-data.ts`: `fieldType` in de
     `referenceLogo`-mock; nieuwe test voor de rebuild-embeddings-side-effect (assert nu alléén dat `delete`
     niet wordt aangeroepen — de bestaande asserts breken niet, maar dekken de nieuwe side-effect niet).
3. **Beschermde tests ongemoeid:** de 4 tests in `tests/test_artwork_processing.py` (regels 142–206) blijven
   byte-identiek; 12.1 raakt `match_templates`/`tile_image`/`merge_detections` niet (alleen bibliotheek + embeddings).

## Dev Notes

### Bronbestanden (door gebruiker aangeleverd)
- `Packaging_label_guide_January2026_3_1_35.xlsx` — officiële logo's per code (945 codes / 1026 embedded images;
  sheets Labels_Packaging/_Regulator/_Instructions). **Autoritaire referentie-beeldbron.**
- `benelux-fmcg-data-model-31353-nederlands.xlsx` — tab *Codelijsten*: officiële veldnamen + codewaarden per veld.
- `nieuwe keurmerken.pdf` — subset "nieuwe keurmerken" (release 3.1.32), zelfde structuur (handige steekproef).

### Aanpak-rationale
- "Detecteer crop → mens labelt → referentie" schaalt niet naar ~900 codes. De Label Guide geeft per code het
  **officiële logo** → seed daarmee; gebruik detectie+labeling alleen nog voor **validatie/drempelbepaling**,
  niet voor ontdekking.
- Declaratie ≠ logo-positie en slechts ~18% declareert (bevestigd-FSC-product zónder FSC-declaratie gezien):
  declaratie is **prioriterings- en zwak-ground-truth-signaal**, niet de trainingsset.
- **Variant-bewustzijn:** veel keurmerken hebben meerdere GS1-codes/varianten (FSC_MIX/_LABEL/_100/_RECYCLED;
  Rainforest oud vs PEOPLE_NATURE — wij modelleren nu het oude terwijl het nieuwe vaker voorkomt). Behandel als
  varianten onder dezelfde visuele klasse waar zinnig.

### Hergebruik (volgen, niet herbouwen)
| Referentie | Waarvoor |
|---|---|
| Story 7.3 / `reference_logos` + `apps/api/src/api/v1/reference-logos.ts` | datamodel, upload, opslagcontract `reference-logos/{code}/{variant}.{ext}` |
| Story 8-N1 reindex-hook | herindexering reference-embeddings na bulk-mutatie |
| Story 8-3P `LOCALIZE_CLASS_THRESHOLDS` | per-klasse drempel-kalibratie |
| gold-set-loop (`tests/validation/`, labelronde-HTML, ingest-mechaniek) | validatie per nieuwe klasse |

### Besluiten (vastgesteld 2026-06-09)
1. **Volgorde:** proof-slice van 5 hoog-gedeclareerde keurmerken (de-risk + waarde) → top-20 → kleine velden als afronding.
2. **WMF/EMF:** batch 1 overslaan-met-rapportage; conversie/bron-link als aparte follow-up.
3. **Uitsluiting:** datagedreven (geen bruikbare afbeelding in de guide = uitgesloten) + harde blocklist
   GHS-signaalwoorden en "no image"-wordmarks; visuele waarschuwingspictogrammen blijven in scope.
