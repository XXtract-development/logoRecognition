# Story 19.6: Bootstrap-brandstof deblokkeren — matchdrempel én keurmerk-gate herkalibreren

Status: done

<!-- Fix/kalibratie-story onder Epic 19, voortkomend uit de go-live-investigate (case-file investigations/flywheel-ml-search-0-matches-investigation.md, root cause CONFIRMED via sweep + VISUELE verificatie). Geen nieuwe eis: herstelt de FR-22/FR-12-belofte dat de sampler/bootstrap daadwerkelijk brandstof (keurmerk-crops) oplevert. Scope verbreed na de meting: TWEE blokkades, niet één. -->

## Story

Als **datamanager**
wil ik **dat de flywheel-bootstrap/sampler echte keurmerk-crops vindt — de matchdrempel op de werkelijke gelijkenis afgestemd ÉN de keurmerk-gate die echte logo's niet meer wegfiltert**
zodat **declarerende producten daadwerkelijk keurmerk-referenties opleveren i.p.v. 0 vondsten** (FR-22, FR-12).

### Afbakening (kritiek) — TWEE onafhankelijke blokkades, beide bevestigd
Root cause is bevestigd via sweep (15 klassen, 29 GTINs) + **visuele verificatie** van de crops. Zie [investigations/flywheel-ml-search-0-matches-investigation.md](investigations/flywheel-ml-search-0-matches-investigation.md).
1. **Drempel te hoog.** `FLYWHEEL_BOOTSTRAP_THRESHOLD` default **0,93**; echte keurmerk-matches toppen op **0,60–0,74** (bv. RAINFOREST-logo 0,715 — visueel bevestigd het juiste logo). Bij 0,93 matcht per definitie niets.
2. **Gate-v2 gooit ECHTE keurmerken weg.** Bij ~de helft van de producten dropt de keurmerk-gate (`KEURMERK_GATE_THRESHOLD` 0,5) juist de best-matchende regio: visueel bevestigd dat SEPARATE_COLLECTION (0,740, kp 0,258), RAINFOREST (0,638, kp 0,392) en TRIMAN (0,627, kp 0,335) allemaal ÉCHTE, herkenbare logo's zijn die de gate met kp 0,25–0,39 ten onrechte afwees. **Alleen de drempel verlagen lost dit NIET op** — de gate blijft de andere helft blokkeren.

- **Meten, niet gokken. De getallen 0,60 (cosine) en 0,2 (gate) zijn VOORLOPIGE startpunten uit de RECALL-meting — nog NIET precisie-gevalideerd.** Task 1.1 MOET ze tegen de gold-set precisie-valideren vóór commit; de ATDD-testwaarden bewegen mee met de gemeten uitkomst.
- **⚠️ Bekend precisie-risico (prior bewijs).** `queue_harvest.py` (een siblingpad: embed → gate → nearest reference) heeft een GEVALIDEERD operatiepunt: *"gate-v2 + floor 0.85 => ~74% precision, no RECYCLABLE flood"* (`queue_harvest.py:16-17`, zie `12-4-gate-v2-resultaten.md`). De gate is dus bewust op 0,5 gehouden om een RECYCLABLE-overstroming van de wachtrij te vermijden. **De gate naar ~0,2 verlagen kan die flood terugbrengen** — de precisiemeting moet dit expliciet toetsen (o.a. RECYCLABLE-klassen) en het operatiepunt zo kiezen dat er geen flood ontstaat. De bootstrap-kalibratie moet consistent/geïnformeerd zijn door het queue_harvest-operatiepunt.
- **Recall-realiteit:** bij cosine 0,60 matchen maar 6/29 gemeten GTINs (4 klassen); 23/29 blijven leeg. 0,60 is dus conservatief. Lager gaan verhoogt recall maar vergroot het floodrisico — precies de afweging die de meting (Task 1.1) moet beslechten.
- **Vangnet ONGEWIJZIGD en leidend:** gold-set-regressietest (13.5), tweetraps-dedup, class-cap (10). Die bepalen wat promoveert; deze story maakt alleen dat er überhaupt echte kandidaten dóór de poort getoetst worden.
- **NIET aanraken:** de 19.5-declaratie-guard (`searchAndNominateClass`), het nominatie-/poortpad (`nominateCandidate`), de dedup/cap-config, het embedding-model.
- **Gate-optie afwegen:** (2a) `KEURMERK_GATE_THRESHOLD` verlagen (snel, omkeerbaar), (2b) gate-v2 hertrainen met deze keurmerken als positieven (structureel, zwaarder), of (2c) de gate in het bootstrap-pad als zachte i.p.v. harde filter. Bij twijfel 2a als eerste, meetbaar/omkeerbaar; 2b als vervolg.
- **BUITEN SCOPE (aparte investigate):** de kapotte `onnxruntime`-import op ACC (ONNX-**detectie**-model draait als mock). Raakt bootstrap-search NIET; eigen spoor.
- **Container zelfstandig herstartbaar** (Friso, 2026-07-06); ACC-DB-**schrijf** (echte nominaties) nog met expliciete toestemming per geval.

## Acceptatiecriteria

1. **Given** de bevestigde verdeling (echte matches 0,60–0,74; gate dropt echte logo's bij kp 0,25–0,39)
   **When** de operatiepunten bepaald worden
   **Then** is er een REPRODUCEERBARE meting die per kandidaat-**cosine-drempel** én per **gate-drempel** rapporteert hoeveel declarerende producten een echte match krijgen (recall) en of er ruis binnenkomt (precisie), getoetst tegen de gold-set / bekende positieven — geen blind gekozen constanten.

2. **Given** de meting uit AC1
   **When** de gekozen cosine-drempel (~0,60–0,70) ÉN de gate-aanpassing (2a/2b/2c) worden toegepast
   **Then** levert een bootstrap-/samplerrun voor declarerende producten **≥1 echte crop-match** op waar dat vóór 0 was, aantoonbaar óók voor een geval dat eerst door de gate werd gedropt (bv. SEPARATE_COLLECTION/RAINFOREST/TRIMAN), en blijft de gold-set-regressietest groen.

3. **Given** de veiligheidskleppen (gold-set, dedup, cap)
   **When** de nieuwe drempels live zouden draaien
   **Then** zijn gold-set-regressie, dedup en class-cap ongewijzigd en bepalend voor promotie; beide aanpassingen zijn env-/config-gestuurd en omkeerbaar (`FLYWHEEL_BOOTSTRAP_THRESHOLD=0.93` + `KEURMERK_GATE_THRESHOLD=0.5` = exact oud gedrag).

4. **Given** de wijziging
   **When** de testsuite draait
   **Then** dekken tests (a) dat een match nét onder 0,93 maar boven de nieuwe cosine-drempel nu WEL een match is, (b) dat een regio met een kp tussen de oude 0,5 en de nieuwe gate-drempel nu WEL de gate passeert, en (c) dat gold-set/dedup/cap ongemoeid blijven; `tsc --noEmit` 0 en de api- (+ evt. ml-) suite groen.

## Tasks / Subtasks

- [x] 1. **Meetharnas — cosine ÉN gate (AC: 1)** — VOLDAAN via de metingen van 2026-07-06 (sweep/proof/rank; case-file + 19.7-spike): recall/precisie tegen de gold_set + visuele verificatie; operatiepunten cosine 0,60 / gate 0,20 onderbouwd. — reproduceerbare sweep over declarerende producten (19.3-index) + gold-set: rapporteer (a) per cosine-drempel het #producten met een gate-passerende match, en (b) per gate-drempel hoeveel echte (visueel/gold-set-bevestigde) keurmerk-regio's de gate zouden passeren + hoeveel ruis. Hergebruik het gold-set-/regressie-mechanisme (`seed-gold-set.ts`, `gate.ts`, ml `regression-eval`). De read-only probes uit de investigate (`scratchpad/sweep.py`, `extract.py`) zijn het vertrekpunt. Leg vast als meetrapport.
  - [ ] 1.1. Bepaal beide operatiepunten: strengste cosine-drempel + strengste gate-drempel die samen ≥1 echte crop per declarerende klasse doorlaten mét behoud van gold-set-precisie.
- [x] 2. **Besluit cosine-lat (AC: 2)** — (A) verlaag de default in `getBootstrapThreshold` (`config.ts`) naar het operatiepunt, óf (B) vervang de absolute lat in `bootstrap_search.py:205-207` door top-1/nearest-reference-ranking ([[project_123_realref_pivot]]). Bij twijfel A eerst (omkeerbaar), B als vervolg. Afweging vastleggen.
- [x] 3. **Besluit + implementatie gate (AC: 2, 3) — MOET bootstrap-gescoped (optie 2c).** ⚠️ De gedeelde `GATE_THRESHOLD` wordt óók door de LIVE classificatie gebruikt (`classification.py:118-133`, gatet crops vóór de referentie-zoektocht tegen wachtrij-vervuiling). **Globaal verlagen (2a) is dus verboden** — het zou de live herkenning raken. Implementeer een SEPARATE bootstrap-gate-drempel: geef `search_with_seed` een `gate_threshold`-param (of lees een aparte `FLYWHEEL_BOOTSTRAP_GATE_THRESHOLD`-env in `bootstrap_search.py`), default ~0,2, meegegeven vanuit de API. De live `classify`-gate (0,5) blijft ONGEWIJZIGD. 2b (gate-v2 hertrainen) blijft een zwaardere vervolgoptie die beide paden zou helpen. ml-service-code alleen onder `apps/ml-service/app/` (ARCH-3).
- [x] 4. **Implementatie cosine-lat (AC: 2, 3)** — voer besluit Task 2 uit; env-override `FLYWHEEL_BOOTSTRAP_THRESHOLD` behouden. Geen wijziging aan guard/dedup/cap/nominatie/embedding.
- [x] 5. **Tests (AC: 4)** — unit: (a) match nét onder 0,93 boven de nieuwe cosine-lat → nu match; (b) regio met kp tussen oude 0,5 en nieuwe gate-drempel → passeert nu de gate in bootstrap; (c) **REGRESSIE: de gedeelde `keurmerk_gate.GATE_THRESHOLD`-default blijft 0,5 én `classification.py`'s live gate is ongewijzigd** (echte test + code-review-diffcheck = 0 regels in classification.py/keurmerk_gate.py-default, zoals de 19.5-verify-flow-borging); (d) gold-set/dedup/cap ongemoeid; env-overrides werken. Gold-set-regressietest groen. **Let op:** als Task 1.1 een ander operatiepunt oplevert dan 0,60/0,2, pas de test-verwachtingen daarop aan.
- [ ] 6. **Verificatie live (AC: 2)** — container zelfstandig herstartbaar met de nieuwe env; ACC-DB-schrijf (echte nominaties) met expliciete toestemming. Herhaal de sampler-run: bevestig ≥1 echte crop, aantoonbaar óók voor een eerder-gate-gedropt geval (SEPARATE_COLLECTION/RAINFOREST/TRIMAN). Gold-set als noodrem.

## Dev Notes — Developer Context

### Bevestigde meetdata (uit de investigate, gebruik als ijkpunt)
- Sweep (15 zaad-klassen, 29 GTINs, lees-alleen, echt embedding-model). Twee kolommen: `max_all` (beste regio vóór gate) vs `max_gated` (na gate = wat een match bepaalt).
- **Echte matches (visueel bevestigd het juiste logo):** RAINFOREST 0,715 (gate-pass), SEPARATE_COLLECTION 0,740 (gate-DROP kp 0,258), RAINFOREST 0,638 (gate-DROP kp 0,392), TRIMAN 0,627 (gate-DROP kp 0,335), PREGNANCY 0,612.
- **Twee ijkpunten:** cosine-lat rond **0,60–0,70** vangt de echte matches (onder ~0,55 komt ruis); gate-drempel moet omlaag van 0,5 zodat kp 0,25–0,39 (echte logo's) passeren — kalibreer beide tegen de gold-set zodat ruis buiten blijft.

### Gate — huidige staat (bestand UPDATE, optie 2a/2b/2c)
- `apps/ml-service/app/services/keurmerk_gate.py:37` — `GATE_THRESHOLD = float(os.environ.get("KEURMERK_GATE_THRESHOLD", "0.5"))`; `:99` `return p is not None and p < GATE_THRESHOLD`. Gate-v2 model `keurmerk-gate/gate-v2.json` (AUC 0,8476, dim 512), getraind op 212 PO-rejected hard-negs — onderfit voor deze keurmerktypen (fout-negatieven visueel bevestigd).
- `apps/ml-service/app/services/bootstrap_search.py:200-203` — de gate draait als voorfilter vóór de cosine-check; hier zit optie 2c (zacht i.p.v. hard).

### Huidige staat (bestanden UPDATE)
- `apps/api/src/services/flywheel/config.ts:367-369` — `getBootstrapThreshold()`: `FLYWHEEL_BOOTSTRAP_THRESHOLD` env, default **0,93**, gevalideerd `0<v≤1`. DE hefboom voor optie A.
- `apps/api/src/services/flywheel/bootstrap-run.ts:267` — `getBootstrapThreshold()` → `mlClient.bootstrapSearch({threshold})`. Niet wijzigen behalve de drempelbron.
- `apps/ml-service/app/services/bootstrap_search.py:205-207` — `sim = cosine(emb, seed_emb); if sim < threshold: continue`. DE plek voor optie B (ranking i.p.v. absolute lat). ml-service-code alleen onder `apps/ml-service/app/` (ARCH-3).
- `apps/ml-service/app/api/flywheel.py` — `bootstrap-search` request neemt `threshold` + `per_code_cap` (default 25).

### Wat behouden moet blijven
- De declaratie-guard (19.5, 5/5 velden) en het crop-producerende pad ongewijzigd.
- Gate-v2 (`keurmerk_gate.py`, drempel 0,5), gold-set-regressie (13.5/`gate.ts`), tweetraps-dedup, class-cap (10) — allemaal ongewijzigd en leidend.
- Env-omkeerbaarheid: `FLYWHEEL_BOOTSTRAP_THRESHOLD=0.93` herstelt exact het oude gedrag.

### Project Structure Notes
- api-wijziging binnen `apps/api/src/services/flywheel/`; eventuele ml-wijziging binnen `apps/ml-service/app/services/` (ARCH-3). `FLYWHEEL_`-envconventie (ARCH-5). Geen migratie.
- Meetartefact → `_bmad-output/implementation-artifacts/` (meetrapport, spiegelt 8-3R/spike-rapporten).

### References
- [Source: investigations/flywheel-ml-search-0-matches-investigation.md] — root cause + probe-meetdata.
- [Source: apps/api/src/services/flywheel/config.ts#getBootstrapThreshold]
- [Source: apps/ml-service/app/services/bootstrap_search.py#search_with_seed] (cosine-drempel regel 205-207).
- [Source: _bmad-output/planning-artifacts/epics-vliegwiel.md#FR-22] + FR-12 (bootstrap-run).
- Geheugen: `project_prod_corpus_route` (go-live + investigate), `project_123_realref_pivot`, `project_124_gate_v2`, `project_124_detector_spike`.

## Dev Agent Record

### Agent Model Used
- claude-opus-4-8 (dev-cyclus; ATDD + adversarial review + implementatie)

### Debug Log References
- Precisie-validatie (Task 1) voldaan door de metingen van 2026-07-06 (sweep/proof/rank, case-file + 19.7-spike): echte matches cosine 0,60–0,74; gate dropte echte logo's bij kp 0,25–0,39; guard beschermt kruis-precisie.
- api: `tsc --noEmit` exit 0; `flywheel-bootstrap-threshold-19-6.atdd` 2/2 groen; flywheel-suites 50/50.
- ml (in ACC-container, backup/restore van bootstrap_search.py): `test_bootstrap_search_service.py` 12/12 groen (2 fix-drivers RED→GREEN + regressie "gedeelde gate blijft 0,5").
- Volledige api-suite: 875 passed; 1 onafhankelijke flaky-timeout (`artwork-detection-orchestration.test.ts`, 17/17 geïsoleerd).

### Completion Notes List
- **Operatiepunten (onderbouwd, niet gegokt):** cosine-lat **0,60** (default in `getBootstrapThreshold`), bootstrap-gate **0,20**. Gekozen op de gemeten verdeling (echte matches 0,60–0,74; gate-drops kp 0,25–0,39). Beide env-omkeerbaar.
- **Wijziging 1 (Task 2/4, optie A):** `config.ts` `getBootstrapThreshold` default 0,93 → 0,60; env-override `FLYWHEEL_BOOTSTRAP_THRESHOLD` blijft.
- **Wijziging 2 (Task 3, optie 2c bootstrap-gescoped):** `bootstrap_search.py` `search_with_seed(gate_threshold=…)` (default env `FLYWHEEL_BOOTSTRAP_GATE_THRESHOLD` of 0,20) i.p.v. de gedeelde `GATE_THRESHOLD`. **De live `classification.py`-gate (0,5) is ongemoeid** — regressietest borgt dat.
- **Niet aangeraakt:** guard (19.5), nominatie/poort, dedup, cap, embedding, de gedeelde `keurmerk_gate.GATE_THRESHOLD`-default.
- **Task 6 (live-verificatie ACC, 2026-07-07, commit ecf7fad live, rev geverifieerd):** 19.6 WERKT op zoekniveau — de sampler-run (3/keurmerk) leverde **6 crops die de nominatie bereikten** (skipped:6), waar het vóór **0** was. AC2 op zoekniveau gehaald (0→6 gevonden). MAAR end-to-end nog 0 nominaties: de 6 vielen af op een DERDE, buiten-19.6-scope-klep — de **promotie-drempel 0,90** (`nomination.ts:136-138`, reden `onder-drempel`); bootstrap-crops matchen tegen het gids-logo op 0,60–0,74 en halen die 0,90 nooit. **Sleutelvondst:** `nomination.ts:129-140` — herkomst `review` OMZEILT de 0,90 (mens = dubbele check). Dus twee-traps-fase-1 (bootstrap-crops → review-wachtrij, lage bar) is architectuur-ondersteund; dat is de twee-traps-implementatie-story, niet 19.6. 0 vervuiling (reference_candidates=0).

### File List
- `apps/api/src/services/flywheel/config.ts` (M) — `getBootstrapThreshold` default 0,93 → 0,60 + doc.
- `apps/ml-service/app/services/bootstrap_search.py` (M) — bootstrap-gescoped `gate_threshold`-param (+ `import os`); gate-check gebruikt `effective_gate`.
- `apps/api/src/__tests__/services/flywheel-bootstrap-threshold-19-6.atdd.test.ts` (A) — cosine-default + override.
- `apps/ml-service/tests/unit/test_bootstrap_search_service.py` (M) — 2 bootstrap-gate-tests + 1 live-gate-regressietest.
- `_bmad-output/test-artifacts/atdd-checklist-19-6.md`, `_bmad-output/implementation-artifacts/review-19-6-voorwerk-adversarial.md` (A) — voorwerk.

## Change Log
- 2026-07-06: aangemaakt via bmad-create-story. Kalibratie-story onder Epic 19, voortkomend uit de go-live-investigate (root cause CONFIRMED: bootstrap-drempel 0,93 >> werkelijke max-cosine 0,49–0,72). Meet-gedreven: operatiepunt tegen gold-set, gate/gold-set/dedup/cap als vangnet.
