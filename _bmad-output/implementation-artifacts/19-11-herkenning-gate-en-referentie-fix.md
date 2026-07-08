---
baseline_commit: b2b291f578abdb44b89fbc21a37221a511cce5af
---

# Story 19.11: Herkenning ontstoppen — classify-gate, match-drempel & bevestigde crop → actieve referentie

Status: review

<!-- Fix-story uit de investigate `classify-gate-blocks-recognition-investigation.md` (2026-07-07, confidence HIGH). Door mensen bevestigde keurmerk-crops (19.8) worden NIET herkend: de gedeelde keurmerk-gate (0,5) in het CLASSIFY-pad dropt ze vóór de referentie-zoektocht — hetzelfde gate-v2-defect als 19.6, maar de 19.6-fix (gate 0,2) is alléén op het bootstrap-ontdekpad toegepast, niet op het herkenningspad. PRIORITEIT boven 19.9. -->

## Story

Als **datamanager**
wil ik **dat door mensen bevestigde keurmerk-crops daadwerkelijk door de live-herkenning worden herkend**
zodat **het vullen van keurmerk-vakken (19.8) de herkenning écht verbetert — de kern van de vliegwiel-belofte, die nu stukloopt op een filter en een drempel**.

### Afbakening (kritiek — bewezen root cause)
- **Root cause (investigate, read-only op ACC, HIGH):** het herkenningspad `_classify_via_embedding` (`apps/ml-service/app/services/classification.py:125-134`) past de **keurmerk-gate** toe VÓÓR de referentie-zoektocht en retourneert UNKNOWN bij `keurmerk_probability < GATE_THRESHOLD` (**0,5**). Gemeten: RAINFOREST kp 0,392 (refs matchen 0,70!), TRIMAN kp 0,335 (refs 0,71!) → beide gegatet → UNKNOWN. Dit is EXACT het gate-v2-defect uit de 19.6-investigate; de 19.6-fix (bootstrap-gescopede gate 0,2, `FLYWHEEL_BOOTSTRAP_GATE_THRESHOLD`) raakte ALLEEN het bootstrap-ontdekpad — het classify-pad gebruikt nog de gedeelde 0,5-gate.
- **Drie lagen (allemaal in scope):**
  1. **Classify-gate herstellen** (primair): het herkenningspad mag echte keurmerk-crops niet meer wegfilteren. Opties (dev kiest meet-gedreven): een classify-gescopede lagere gate (bv. `CLASSIFY_GATE_THRESHOLD` ~0,2, patroon van de bootstrap-gate), óf gate-v2 hertrainen met deze keurmerken als positieven, óf de gate "zacht" maken (markeren i.p.v. droppen) in het classify-pad.
  2. **Match-drempel kalibreren:** `CLASSIFY_THRESHOLD_EMBEDDING` (0,75) ligt boven de reële echte-crop-cosine (~0,70) → correcte matches worden "uncertain". Kalibreer (~0,65) tegen de gold-set.
  3. **Bevestigde crop → actieve referentie borgen:** met `FLYWHEEL_NOMINATION_ENABLED` loopt een review-accept via nominatie (herkomst `review`) → de 0,60–0,74-crop haalt de 0,90-promotielat niet → wordt géén actieve referentie. Een MENS heeft de crop al bevestigd (review-accept) → die hoort betrouwbaar een actieve referentie mét embedding te worden.
- **Vangnet leidend:** elke wijziging is meet-gedreven tegen de **gold-set** — de gate-verlaging/drempel-verlaging mag de precisie NIET verlagen (geen niet-keurmerken of verkeerde codes binnenlaten). Gold-set-regressie-gate blijft.
- **Geen wijziging aan:** het embedding-model, de region-proposer, de 19.8-review-routering, of de crosscheck/kruischeck-paden.
- **Prioriteit:** vóór 19.9 (19.9 = discovery-ranking; deze story = de daadwerkelijke herkenningswaarde). De uitrol (vakken vullen) blijft gepauzeerd tot dit gefixt is.
- **Elke ACC-schrijf/deploy/eval met expliciete toestemming per geval.**

## Acceptatiecriteria

1. **Given** een echte keurmerk-crop met `keurmerk_probability` < 0,5 (bv. RAINFOREST kp 0,39, TRIMAN kp 0,34) waarvan de eigen referenties op ~0,70 matchen
   **When** het classify-pad de crop verwerkt
   **Then** wordt de crop NIET meer door de gate als UNKNOWN gedropt, maar herkend als de juiste keurmerkcode (RAINFOREST → RAINFOREST, TRIMAN → TRIMAN).

2. ~~**Given** een echte-crop-match op ~0,70 telt als zeker (drempel ~0,65)~~ **INGETROKKEN na code-review** — verkeerde knop. De bindende auto-bevestig-drempel op het live-pad is de **crosscheck-vloer `CROSSCHECK_THRESHOLD_EMBEDDING` (0,80)** (`artwork-crosscheck.ts:30,123-131`), niet `CLASSIFY_THRESHOLD_EMBEDDING` (die alleen een door verify-flow GENEGEERDE `uncertain`-vlag zet). Herzien gedrag: een real-crop-match (~0,70) op een gedeclareerd keurmerk komt door de gate-fix binnen en wordt een **review-item** (mens bevestigt) i.p.v. gemist. Auto-bevestiging (crosscheck-vloer 0,80 verlagen) is een APARTE, precisie-gevoelige beslissing — gold-set-gevalideerd, buiten deze story.

3. **Given** een mens-bevestigde crop (review-accept, herkomst `review`)
   **When** de accept verwerkt wordt
   **Then** wordt de crop betrouwbaar een ACTIEVE referentie mét embedding (ook onder de 0,90-promotielat — de mens heeft al bevestigd), zodat het classify-pad 'm gebruikt. Een RECYCLABLE-accept levert dus voortaan een RECYCLABLE-referentie op.

4. **Given** de gold-set (ECHT + VALS)
   **When** de eval-meting draait ná de fixes
   **Then** is er **geen precisie-daling** t.o.v. de baseline (de gate-/drempel-verlaging laat geen niet-keurmerken of verkeerde codes door) — meetbaar vastgelegd; de gold-set-regressie-gate blijft het vangnet.

5. **Given** de wijziging
   **When** de testsuite draait
   **Then** dekt een test: (a) een keurmerk-crop met kp < 0,5 → herkend (faalt op het oude gate-gedrag: UNKNOWN); (b) een ~0,70-match → zeker (niet uncertain); (c) een review-accept → actieve referentie mét embedding; `tsc --noEmit` 0, api-vitest + ml-pytest groen.

## Tasks / Subtasks

- [x] 1. **Classify-gate herstellen (AC: 1, 4)** — GEKOZEN: classify-gescopede drempel `CLASSIFY_GATE_THRESHOLD` (default 0,2, patroon `FLYWHEEL_BOOTSTRAP_GATE_THRESHOLD`) in `classification.py`; `_classify_via_embedding` gebruikt die i.p.v. de gedeelde `keurmerk_gate.GATE_THRESHOLD` (0,5). De 0,5-gate blijft elders ongewijzigd. Env-configureerbaar (gold-set-kalibratie in Task 4/live).
- [~] 2. **Match-drempel kalibreren — INGETROKKEN na code-review.** De 0,75→0,65-wijziging was op de verkeerde knop: verify-flow negeert de classify-`uncertain`-vlag; de bindende drempel is de crosscheck-vloer 0,80. Teruggedraaid naar 0,75. De crosscheck-vloer-beslissing is apart (precisie, gold-set).
- [x] 3. **Accept → actieve referentie borgen (AC: 3)** — AD-conforme route: herkomst `review` omzeilt de promotie-DREMPELfase (`runThresholdPhase`, `guardrails.ts`) — net als bij de nominatie-drempel (mens = dubbele check). Een review-accept-crop (0,60–0,74) wordt zo bij de eerstvolgende promotielus een ACTIEVE referentie i.p.v. eeuwig vrijgegeven onder 0,90. `GuardrailCandidate` + `loadBatchCandidates` dragen nu `origin`. Cap/dedup/outlier/regressie blijven gelden.
- [ ] 4. **Gold-set-eval (AC: 4)** — LIVE, wacht op deploy-toestemming: reproduceerbare precisie-meting vóór/na (ECHT-herkenning ↑, VALS niet omhoog).
- [x] 5. **Tests (AC: 5)** — ml-pytest `test_classify_gate_19_11.py` (5 tests: kp-0,39-keurmerk door de gate; kp-0,10 nog gedropt; drempel-kalibratie; zwakke match uncertain) — 5/5 groen, 45 passed geen regressie. api-vitest: guardrails review-bypass-test — 30 passed. Faalt op het oude gedrag.
- [x] 6. **Gates** — `tsc --noEmit` 0; api-vitest 885 passed/0 failed; ml-pytest 45 passed (4 pre-existing collection-errors = image-mismatch `phash`-module, niet deze wijziging).
- [ ] 7. **Live-verificatie (AC: 1, 3)** — LIVE, wacht op deploy-toestemming: RAINFOREST/TRIMAN opnieuw door `/ml/artwork/classify` → verwacht de juiste codes; een RECYCLABLE-accept → actieve referentie na promotielus. Gold-set als vangnet.

## Dev Notes — Developer Context

### Huidige staat (bestanden UPDATE)
- `apps/ml-service/app/services/classification.py:118-164` — `_classify_via_embedding`: berekent de embedding, past de gate toe (`kp = keurmerk_probability(emb); if kp < GATE_THRESHOLD (0,5): return UNKNOWN, 0.0, gated=True`), dán pas `db_service.find_similar_references(threshold=0.0, limit=1)`; markeert `uncertain` als `confidence < CLASSIFY_THRESHOLD_EMBEDDING`. **De gate (regel 125-134) is de primaire blokker.**
- `apps/ml-service/app/services/keurmerk_gate.py` — `GATE_THRESHOLD` (0,5, gedeeld). De bootstrap gebruikt al een aparte lagere waarde (`bootstrap_search.py:137-141`, env `FLYWHEEL_BOOTSTRAP_GATE_THRESHOLD` 0,2). Voeg een classify-gescopede variant toe (raak de gedeelde 0,5 NIET aan als die elders nodig is).
- `apps/api/src/api/v1/artwork-pipeline.ts:~1079-1120` — de accept-handler: met `FLYWHEEL_NOMINATION_ENABLED` → `recordAcceptDecision` (gold-set ECHT) + `enqueueNominations(..., 'review')`; ZONDER de vlag → legacy 12.3 `registerReference` (directe actieve referentie). De nominatie-route promoveert de 0,60–0,74-crop niet (0,90-lat) → geen actieve referentie. Fix: een mens-bevestigde crop moet actief-referentie worden ongeacht de promotielat.

### Waarom dit klopt (bewijs)
- Investigate `classify-gate-blocks-recognition-investigation.md`: read-only probe (echte embedding) → RAINFOREST kp 0,392 / refs 0,70; TRIMAN kp 0,335 / refs 0,71; RECYCLABLE kp 0,744 / geen goede ref. Live classify → UNKNOWN/UNKNOWN/FAIRTRADE. Bevestigt gate-drop + drempel + referentie-gat. Sluit aan op de 19.6-investigate (zelfde kp-getallen) en [[project_124_gate_v2]].

### Wat behouden moet blijven
- Gold-set-regressie-gate + precisie (de fixes mogen geen niet-keurmerken/verkeerde codes binnenlaten).
- De gedeelde gate (0,5) waar die elders (niet-keurmerk-classify) nodig is — gebruik een classify-keurmerk-gescopede drempel.
- De 19.8-review-routering en de dedup/hard-negative-kleppen.

### References
- [Source: investigations/classify-gate-blocks-recognition-investigation.md] — root cause + read-only bewijs.
- [Source: classification.py#118-164] — de gate + match in het classify-pad.
- [Source: bootstrap_search.py#137-141] — het gate-0,2-precedent (bootstrap).
- Geheugen: `project_flywheel_recall_research`, `project_124_gate_v2`, `project_124_detector_spike`.

## Senior Developer Review (AI)

Datum: 2026-07-07. Drie parallelle lagen (Blind Hunter, Edge Case Hunter, Acceptance Auditor). **Verdict: Task 1 + Task 3 solide; Task 2 ingetrokken na een geverifieerde bevinding.**

### 🔴 Geverifieerd (Blind Hunter #1/#2) — Task 2 raakte de verkeerde drempel
De bindende auto-bevestig-drempel op het live verify/crosscheck-pad is **`CROSSCHECK_THRESHOLD_EMBEDDING` (0,80)** (`artwork-crosscheck.ts:30`, verdict-logica `:123-131`: `confidence ≥ drempel → autoAccept, anders → reviewItem`), NIET `CLASSIFY_THRESHOLD_EMBEDDING`. Verify-flow (`verify-flow.ts:459`) houdt elke non-UNKNOWN classify-uitkomst en gate't op de crosscheck-vloer; de classify-`uncertain`-vlag wordt niet gelezen. Gevolg: de 0,75→0,65-wijziging was **inert** op het live-pad, en een real-crop-match (~0,70) haalt 0,80 niet → **review-item**, niet auto-CONFIRMED. **Actie:** Task 2 teruggedraaid (0,75). De gate-fix (Task 1) blijft de echte winst: gemiste keurmerken (UNKNOWN) komen nu als review-item binnen. Auto-bevestiging (crosscheck-vloer verlagen) is een aparte, gold-set-gevalideerde precisie-beslissing.

### ✅ Bevestigd solide
- **Task 1 (gate):** correct; unblokt gemiste keurmerken → review. De 0,80-crosscheck-vloer **buffert** het precisie-risico van de gate-verlaging: zwakke/foute matches (<0,80) gaan naar review, niet naar auto-bevestiging (Edge/Blind precisie-zorg gemitigeerd; gold-set-meting blijft het definitieve vangnet).
- **Task 3 (review-promotie):** alle drie lagen bevestigen veilig + mens-gated. Enige producers van `origin='review'` zijn de admin-accept-handlers (`artwork-pipeline.ts:1106,1267`); geen auto-promote-lek. Cap/dedup/outlier/regressie blijven gelden; `flywheel-promotion`-bron telt consistent mee voor de 19.8-`classHasConfirmedRealFuel`-poort én de class-cap. Restricht: de crop-KWALITEIT is ongegated (bewuste mens-in-de-lus-tradeoff).

### Kleine punten
- Env-parse van de float-drempels kan bij een niet-numerieke waarde crashen bij import — consistent met het bestaande patroon (alle `float(os.environ.get(...))`-reads); niet apart afgevangen (Laag, Edge #1).
- Config-gelijkheid-tests versoepeld naar de invariant (`< 0,5`) i.p.v. `== 0,2` (Blind #5).

## Dev Agent Record

### Agent Model Used
claude-opus-4-8 (bmad-dev-story)

### Completion Notes List
- **Task 1 (classify-gate):** nieuwe `CLASSIFY_GATE_THRESHOLD` (default 0,2) in `classification.py`; `_classify_via_embedding` gate't op die classify-gescopede drempel i.p.v. de gedeelde 0,5. Bewijs: de gedeelde 0,5 dropte RAINFOREST kp 0,39 / TRIMAN kp 0,34 (refs 0,70) → UNKNOWN. De 0,5-gate blijft elders (niet-keurmerk-classify) ongewijzigd.
- **Task 2 (match-drempel):** `CLASSIFY_THRESHOLD_EMBEDDING` default 0,75 → 0,65 (reële crop-cosine ~0,70). Zwakke/foute matches (0,40) blijven uncertain.
- **Task 3 (accept → referentie, AD-conform):** i.p.v. de accept-handler direct te laten `registerReference` (schendt AD-1/2), omzeilt herkomst `review` nu de promotie-DREMPELfase (`runThresholdPhase`) — mens = dubbele check, net als bij de nominatie-drempel. Zo promoveert een review-accept-crop tot ACTIEVE referentie via de bestaande governance-pijplijn. `GuardrailCandidate` + `loadBatchCandidates` dragen `origin`. Effect is bij de eerstvolgende nachtelijke promotielus (niet instant) — betrouwbaar, AD-conform.
- **Testen:** ml-pytest gedraaid in een WEGWERP-container van de ml-image (pytest bij-geïnstalleerd; GEEN mutatie van de live-service) → 5/5 groen, 45 passed geen regressie. api-vitest lokaal → 885 passed/0 failed.
- **Live-taken (4, 7) open:** gold-set-precisiemeting + live-classify-herverificatie vereisen ACC-deploy → wachten op expliciete toestemming per geval.
- **Precisie-vangnet:** de gate-/drempel-verlaging is env-configureerbaar; de gold-set-regressie-gate + de live-meting (Task 4) borgen dat de precisie niet daalt vóór definitieve acceptatie.

### File List
- apps/ml-service/app/services/classification.py (gewijzigd) — `CLASSIFY_GATE_THRESHOLD` (0,2) + gate-wiring. (`CLASSIFY_THRESHOLD_EMBEDDING` weer 0,75 — Task 2 ingetrokken na review.)
- apps/api/src/services/flywheel/guardrails.ts (gewijzigd) — `GuardrailCandidate.origin` + review-bypass in `runThresholdPhase`.
- apps/api/src/services/flywheel/promotion-batch.ts (gewijzigd) — `origin` in `loadBatchCandidates` select + mapping.
- apps/ml-service/tests/unit/test_classify_gate_19_11.py (nieuw) — 5 gate/drempel-tests.
- apps/api/src/__tests__/services/flywheel-guardrails.test.ts (gewijzigd) — review-bypass-test + `origin` in helper.

## Change Log
- 2026-07-07: aangemaakt uit de investigate (classify-gate blokkeert herkenning). Fix-story, 3 lagen: classify-gate herstellen + match-drempel kalibreren + bevestigde crop → actieve referentie. Meet-gedreven tegen gold-set. Prioriteit vóór 19.9.
- 2026-07-07: dev-story Tasks 1, 3 geïmplementeerd + getest (ml-pytest wegwerp-container, api-vitest 885 passed, tsc 0). Task 1 = classify-gate 0,2 (ml); Task 3 = herkomst `review` omzeilt de promotie-drempelfase (AD-conform, API).
- 2026-07-07: code-review (3 adversariële lagen) → **Task 2 ingetrokken** (Blind Hunter #1/#2, geverifieerd): de 0,65-classify-drempel was inert; de bindende auto-bevestig-drempel is de crosscheck-vloer 0,80. `CLASSIFY_THRESHOLD_EMBEDDING` teruggedraaid naar 0,75; AC2 herzien (real-crop-matches → review, niet auto-bevestigd). Task 1 (gate) + Task 3 (review-promotie) bevestigd solide. Crosscheck-vloer-verlaging = aparte, gold-set-gevalideerde beslissing. Tasks 4/7 (gold-set-eval + live-verificatie) wachten op deploy-toestemming.
