# Story 12.5: Herkennings-endpoint (twee-traps, geserveerd) + acceptatie-norm — HET einddoel

Status: ready (gated). Dit is de **eigenlijke deliverable van Epic 12**: de endpoint die het projectdoel
realiseert. Gated op 12.3 (embedding) en gevoed door 12.4 (detector-A). Scope = **gefaseerd: top-N nu,
lange staart later** (productbeslissing 2026-06-09).

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
- **Norm (op een bevroren echte-PDF/artwork-testset):** per-klasse **precisie ≥ 90 %** en **recall ≥
  een vooraf vastgestelde bar** (te zetten ná de 12.3-stap-0-meting — de huidige 17 %-baseline maakt
  een harde recall-bar nu prematuur). Niet-keurmerk → UNKNOWN (open-set, 12.2-AC3).
- **Endpoint-contract:** PDF (multi-page) en afbeelding als input; gedefinieerde JSON-output; latency
  binnen budget; kosten ≈constant in #klassen (12.2-AC1).

**Fase 2 (later, na go/no-go) — lange staart:**
- De resterende ~850 codes als **accept-UNKNOWN/review** i.p.v. geforceerde labels, plus een apart
  vervolgspoor (zwaardere few-shot + variant-family-disambiguatie). Niet in fase 1 afgedwongen.

## Hard go/no-go-beslispunt (vóór fase 1 gebouwd wordt)

De universe-probe (`12-universe-recognizability-probe.md`) toont dat herkenning op de huidige embedding
níét haalbaar is (collisie 50,7 %; 17 % accept op 4 echte klassen). **Bouw fase 1 pas ná** de
12.3-stap-0-meting (sterkere off-the-shelf-backbone, nul training) + zo nodig fine-tuning, met een
expliciete beslissing: haalt de top-N de precisie/recall-bar? Zo nee → scope versmallen of aanpak
herzien vóór endpoint-bouw. Dit voorkomt bouwen op een onbewezen herkenningslaag.

## Tests / ATDD

- **Endpoint-acceptatie:** bevroren echte-PDF/artwork-testset met menselijke labels voor de top-N;
  meet per-klasse precisie/recall + UNKNOWN-rate. Red-phase-ATDD voor het endpoint-contract.
- **Eval-gate hergebruik:** de 12.2-harnas (`spike_pipeline_eval.py`) + universe-probe blijven de
  staande capaciteitsmeting onder de norm.
- Beschermde tests (`tests/test_artwork_processing.py` 142–206) ongewijzigd; A/B-migratie.

## Afhankelijkheden

- **Gated op:** 12.3 (embedding boven de drempel) — de bindende voorwaarde.
- **Gevoed door:** 12.4 (detector-A, strakke localisatie), 8.2 (rasterize), 8.5 (crosscheck/routing).
- **Voorwaarde voor:** Epic 10 (monitoring/rollback wordt pas zinvol zodra de endpoint kwaliteit heeft).
