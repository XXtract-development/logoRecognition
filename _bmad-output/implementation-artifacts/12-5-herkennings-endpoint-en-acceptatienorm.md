# Story 12.5: Herkennings-endpoint (twee-traps, geserveerd) + acceptatie-norm — HET einddoel

Status: **richtinggevend, nog niet bevriezen** (gated op 12.3-stap-0). Dit is de **eigenlijke deliverable
van Epic 12**: de endpoint die het projectdoel realiseert. Gated op 12.3 (embedding), gevoed door 12.4
(detector-A), **niet toetsbaar zonder 12.6** (acceptatie-dataset). Scope = **gefaseerd: top-N nu, lange
staart later** (productbeslissing 2026-06-09). De exacte recall-bar en delen van het contract worden
bevroren ná de stap-0-meting — niet vooraf.

## Story

Als afnemer (extern systeem),
wil ik een **endpoint** waaraan ik een **PDF of afbeelding** aanlever en die de **keurmerken uit de
GS1 Packaging Label Guide** teruggeeft die op het beeld staan (met confidence + bbox, of UNKNOWN),
zodat het projectdoel — geautomatiseerde keurmerk-herkenning op aangeleverd artwork — bereikt is.

## Waarom een eigen story (gat in Epic 12)

Epic 12 leverde tot nu toe de *componenten* (12.1 seed, 12.2 architectuur, 12.3 embedding, 12.4
detector). Het **einddoel zelf — de geserveerde endpoint mét een meetbare acceptatie-norm — bestond
als geen enkele story**; het hing als vage "productie-build"-noot in 12.3. Deze story maakt het
expliciet, afdwingbaar en testbaar.

## Doel / niet-doel

- **Doel:** een endpoint (`PDF|image → [{t3777_code, confidence, bbox} | UNKNOWN]`) die het volledige
  twee-traps-pad serveert (rasterize → detector-A/proposer → embed → pgvector → open-set), **A/B náást**
  de template-match-localize, met per-klasse-cutover en terugval. Hergebruikt de bestaande rasterize-
  (8.2) en classify-paden.
- **Niet-doel:** de lange staart van ~850 zelden-gedeclareerde codes betrouwbaar krijgen (fase 2);
  de monitoring/rollback (Epic 10) — die volgt ná werkende herkenning.

## Acceptatie-norm (gefaseerd)

**Fase 1 (MVP, nu afdwingbaar) — top-N meest gedeclareerd:**
- **Doelset:** de **top-N (≈20–30) meest-gedeclareerde** T3777-keurmerken (GREEN_DOT, RECYCLABLE,
  TRIMAN, FSC, EU_ORGANIC, BETER_LEVEN, V-Label, RAINFOREST_ALLIANCE, MSC, …). Exacte N gepind bij
  seeden; 12.1 dekt er al 10.
- **Norm (op de 12.6-acceptatie-dataset):** per-klasse **precisie ≥ 90 %** (vast) en **recall ≥ bar**.
  *Voorlopige recall-bar = 70 %* (afdwingbaar startpunt; herzien ná de stap-0-meting — de stap-0-
  accept-cijfers bepalen of 70 % realistisch is of bijgesteld moet). Niet-keurmerk → UNKNOWN
  (open-set, 12.2-AC3).
- **Endpoint-contract (uitgewerkt — hier leeft of sterft herkenning):**
  - **Input:** PDF (multi-page → álle pagina's rasteriseren en doorzoeken; geen aanname "pagina 0") en
    losse afbeelding. **Rasterisatie-DPI is kritiek**: 804/1006 guide-logo's zijn < 200px → te lage DPI
    maakt kleine marks onvindbaar. DPI als expliciete, gemeten parameter (niet de 8.2-default aannemen).
  - **Output (drie-weg, geen binaire ja/nee):** per pagina een lijst van `{t3777_code, confidence, bbox}`
    voor zelfverzekerde top-N-treffers, **plus** expliciete markering van *kandidaat-regio's zonder
    zelfverzekerd label* als `UNKNOWN`. De afnemer moet "geen keurmerk hier" kunnen onderscheiden van
    "keurmerk dat we (nog) niet dekken" van "gedekt maar onzeker → review". Definieer dit contract
    expliciet; het is de kern van de gefaseerde-scope-UX.
  - **Niet-functioneel:** latency-budget per PDF (regio's × pagina's × ~1,2–3,6 s/beeld), kosten
    ≈constant in #klassen (12.2-AC1), auth conform de bestaande /ml-posture.

**Fase 2 (later, na go/no-go) — lange staart:**
- De resterende ~850 codes als **accept-UNKNOWN/review** i.p.v. geforceerde labels, plus een apart
  vervolgspoor (zwaardere few-shot + variant-family-disambiguatie). Niet in fase 1 afgedwongen.

## Hard go/no-go-beslispunt (vóór fase 1 gebouwd wordt)

De universe-probe (`12-universe-recognizability-probe.md`) toont dat herkenning op de huidige embedding
níét haalbaar is (collisie 50,7 %; 17 % accept op 4 echte klassen). **Bouw fase 1 pas ná** de
12.3-stap-0-meting (sterkere off-the-shelf-backbone, nul training) + zo nodig fine-tuning.

**Beslisregel (vooraf vastgelegd, anders is het geen gate):**
- **GO** als op de 12.6-acceptatie-dataset het best beschikbare embedding-/detector-pad **per-klasse
  precisie ≥ 90 % bij recall ≥ 70 %** haalt op **≥ ⅔ van de top-N** klassen.
- **VERSMAL** (GO op een kleinere set) als dat alleen lukt op een subset → endpoint dekt die subset,
  rest = accept-UNKNOWN.
- **NO-GO / aanpak herzien** als ook na fine-tuning < ⅓ van de top-N de bar haalt → niet bouwen op een
  onbewezen laag; heroverweeg (bv. per-keurmerk-specialisatie voor de paar belangrijkste, of
  human-in-the-loop-review).
- **Eigenaar van het besluit:** ML-eigenaar + Product Owner (Sasha Roest) samen, op basis van de
  stap-0/12.6-meetoutput. Drempels herzienbaar mét bewijs, niet ad hoc.

## Tests / ATDD

- **Endpoint-acceptatie:** de **12.6**-acceptatie-dataset (bevroren, menselijk gelabeld, schone bboxen) —
  NIET de oude gold-set-oogstrun (4 klassen, verdachte bboxen). Meet per-klasse precisie/recall +
  UNKNOWN-rate. Red-phase-ATDD voor het endpoint-contract.
- **Eval-gate hergebruik:** de 12.2-harnas (`spike_pipeline_eval.py`) + universe-probe blijven de
  staande capaciteitsmeting onder de norm.
- Beschermde tests (`tests/test_artwork_processing.py` 142–206) ongewijzigd; A/B-migratie.

## Afhankelijkheden

- **Gated op:** 12.3 (embedding boven de drempel) — de bindende voorwaarde; en **12.6** (acceptatie-
  dataset) — zonder die set niet toetsbaar.
- **Gevoed door:** 12.4 (detector-A, strakke localisatie), 8.2 (rasterize), 8.5 (crosscheck/routing).
- **Voorwaarde voor:** Epic 10 (monitoring/rollback wordt pas zinvol zodra de endpoint kwaliteit heeft —
  *kanttekening:* minimale accuracy-monitoring is al wenselijk tíjdens de 12.3-embedding-uitrol, niet pas erna).
