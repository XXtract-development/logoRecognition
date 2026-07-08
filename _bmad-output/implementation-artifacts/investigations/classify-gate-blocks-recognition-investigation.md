# Investigate — bevestigde keurmerk-crops worden niet herkend (classify-gate blokkeert)

Datum: 2026-07-07 · Confidence: **HIGH** (read-only gemeten op ACC + code-bevestigd) · Status: root cause bevestigd, fix-story nodig

## Aanleiding
Na de 19.8-uitrol-pilot zijn 10 keurmerk-crops door mensen bevestigd (gold-set ECHT + `registered`). De herkennings-test toonde echter dat **geen** ervan door de live-herkenning (`/ml/artwork/classify`) herkend wordt — RAINFOREST/TRIMAN → UNKNOWN (0,0), RECYCLABLE → FAIRTRADE_COCOA (0,40, fout). Dit weerlegt de aanname dat bevestigde crops de herkenning automatisch verbeteren.

## Root cause (bevestigd)
Het herkenningspad `_classify_via_embedding` (`apps/ml-service/app/services/classification.py:125-134`) past **eerst de keurmerk-gate toe** en retourneert UNKNOWN vóór de referentie-zoektocht wanneer `keurmerk_probability(emb) < GATE_THRESHOLD` (**0,5**, `keurmerk_gate.GATE_THRESHOLD`). Read-only probe (ml-container, echte embedding + `find_similar_references`):

| Crop | gate-kp | Gegatet? (0,5) | Beste referentie-match |
|---|---|---|---|
| RAINFOREST (GTIN 00000087172072) | **0,392** | **JA** | RAINFOREST 0,696 / 0,673 / 0,638 |
| TRIMAN (GTIN 00044738201698) | **0,335** | **JA** | TRIMAN 0,708 / 0,693 / 0,687 |
| RECYCLABLE (GTIN 00731509919691) | 0,744 | nee | FAIRTRADE_COCOA 0,396 |

**Conclusie:** RAINFOREST en TRIMAN matchen hun eigen (actieve, embedded) referenties uitstekend (~0,70), maar de **gate (0,5) gooit ze weg vóór de match** → UNKNOWN. Dit is EXACT het gate-v2-defect dat het 19.6-onderzoek al vastlegde (`flywheel-ml-search-0-matches-investigation.md`: "RAINFOREST 0,638/kp0,392, TRIMAN 0,627/kp0,335"). De 19.6-fix (bootstrap-gescoped gate 0,2, env `FLYWHEEL_BOOTSTRAP_GATE_THRESHOLD`) is **alléén op het bootstrap-ontdekpad** toegepast (`bootstrap_search.py:137-141`); het **classify-herkenningspad gebruikt nog de gedeelde 0,5-gate**. Vandaar: de bootstrap víndt de crop, de herkenning wíjst 'm af.

## Secundaire lagen (bevestigd, kleiner)
1. **Match-drempel te hoog voor echte-crop-matches:** zelfs voorbij de gate ligt de nearest-reference-cosine (~0,70) onder `CLASSIFY_THRESHOLD_EMBEDDING` (0,75) → resultaat "uncertain" (maar wél de juiste code). Reële keurmerk-cosines toppen op 0,60–0,74 (bevestigd in 19.6 + hier).
2. **Bevestigde crops worden niet betrouwbaar actieve referenties:** RECYCLABLE/SEPARATE_COLLECTION hebben na accept géén nieuwe actieve referentie (alleen het gids-zaad + inactieve realref-poc). Met `FLYWHEEL_NOMINATION_ENABLED` loopt accept via nominatie (herkomst `review`) → de 0,60–0,74-crop haalt de 0,90-promotielat niet → geen actieve referentie. RAINFOREST/TRIMAN hadden hun actieve refs al uit ouder 12.6-werk. RECYCLABLE mist daardoor een goede referentie → matcht FAIRTRADE.

## Impact
Het vliegwiel sluit niet bij de herkenning: vakken vullen (19.8) levert brandstof (gold-records) maar **geen betere live-herkenning** zolang (1) de gate de crops blokkeert en (2) bevestigde crops geen actieve referentie worden. De uitrol (vakken vullen) is prematuur tot dit gefixt is.

## Aanbevolen fix (voor de fix-story — meet-gedreven, vangnet blijft)
1. **Gate in het classify-pad herstellen** (primair): dezelfde behandeling als het bootstrap-pad — een lagere/gescopede gate voor keurmerk-herkenning (bijv. classify-gescopede `CLASSIFY_GATE_THRESHOLD` ~0,2), óf gate-v2 hertrainen met deze keurmerken als positieven, óf de gate zacht maken (markeren i.p.v. droppen) in het classify-pad. Meet tegen de gold-set (precisie mag niet dalen).
2. **Match-drempel kalibreren** (0,75 → ~0,65) tegen de gold-set, zodat echte-crop-matches (~0,70) "zeker" worden zonder valse positieven.
3. **Bevestigde crops → actieve referentie borgen**: het accept→referentie-pad zo dat een mens-bevestigde crop betrouwbaar een actieve referentie mét embedding wordt (ook onder de 0,90-promotielat, want de mens heeft al bevestigd) — sluit aan op de 19.8-`review-accept`-bron.

## Read-only bewijs
- Probe: `$CLAUDE_JOB_DIR/tmp/probe_classify.py` (ml-container, geen writes; echte efficientnet-embedding).
- Code: `classification.py:125-134` (gate vóór search), `keurmerk_gate.GATE_THRESHOLD=0,5`, `bootstrap_search.py:137-141` (gate 0,2 alleen bootstrap).
- Geheugen: [[project_124_gate_v2]], [[project_124_detector_spike]], 19.6-investigate.
