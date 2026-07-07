# Investigation: Flywheel bootstrap-search levert 0 matches op ACC go-live

## Hand-off Brief

1. **Wat is er.** Na de 19.5 guard-fix passeren GTINs de declaratie-guard correct (bewezen live), maar elke `POST /ml/bootstrap-search` geeft `matches: 0`. **Root cause CONFIRMED:** de bootstrap cosine-drempel **0,93** ligt ver boven de werkelijke zaad↔regio-gelijkenis die het (generieke ImageNet-)embedding-model oplevert — gemeten **max 0,49–0,72** per kandidaat-product. Bij 0,93 matcht per definitie niets.
2. **Waar de zaak staat.** Concluded. Beeldlaad/render-hypothese weerlegd; gate-v2 is niet de bindende beperking (7–23 regio's/pagina passeren de gate, maar toppen op ~0,6–0,72 cosine). Side-finding: het ONNX-**detectie**-model draait op ACC als mock (onnxruntime-import kapot) — red herring voor dit pad, maar een echt defect voor de live detectie-pijplijn (apart opvolgen).
3. **Wat er nu nodig is.** BMAD-story: herkalibreer de bootstrap-drempel naar de echte verdeling (of stap over op top-1/ranking i.p.v. een absolute hoge lat), mét gate + gold-set als vangnet tegen valse positieven. NIET ad-hoc de drempel omzetten.

## Case Info

| Field            | Value |
| ---------------- | ----- |
| Ticket           | N/A (go-live-bevinding, aansluitend op Story 19.5) |
| Date opened      | 2026-07-06 |
| Status           | Active |
| System           | ACC (Vanilla), image `8a8289a`, ml-service container; Route A (media/catalog van prod .stage) |
| Evidence sources | ml-service docker-logs (run 11:55–11:56Z), app-log (sampler), broncode ml-service + api |

## Problem Statement

Na de guard-fix (19.5) leverde de eerste bewaakte sampler-run (3/keurmerk) 29 GTINs de ml-search in maar **0 nominaties, 0 crops**. De guard is niet langer de blokkade; de vraag is waarom de ml-crop-search 0 keurmerk-crops terugvindt op de artwork.

## Evidence Inventory

| Source | Status | Notes |
| ------ | ------ | ----- |
| ml-service logs (run-periode) | Available | 15 `bootstrap-search`-calls, allemaal `matches:0`, `gtins_processed==gtins_total` (1–3), `timed_out:false`, `seconds` 0,4–7,8, HTTP 200, **geen warnings** |
| app-log (sampler) | Available | 17 klassen "geen zaad — overgeslagen"; `offered:29`; 0 "declareert de code niet" (guard OK) |
| `bootstrap_search.py` | Available | volledige pijplijn gelezen (`apps/ml-service/app/services/bootstrap_search.py:95-263`) |
| `keurmerk_gate.py` | Available | `GATE_THRESHOLD=0.5` (`:37`) |
| `region_proposer.py` | Available | MSER + adaptieve-contour-proposals (`:62-108`) |
| per-regio cosine-scores | **Missing** | de service logt alleen de match-samenvatting, niet de max-cosine per GTIN → vereist een probe/instrumentatie om H-a vs H-c te scheiden |

## Confirmed Findings

### Finding 1: Elke bootstrap-search geeft 0 matches, foutloos, ná embed-fase
**Evidence:** ml-service log, run 2026-07-06T11:55–11:56Z — o.a. `seed_path: artwork-crops/08437019906214/12_6_PREGNANCY_WARNING…png, matches: 0, gtins_processed: 3, timed_out: false, seconds: 7.8`. Herhaald voor 15 zaden (echte-crop én gids-logo).
**Detail:** `seconds` van 0,4–7,8 en het ontbreken van elke laad-/regio-warning bewijzen dat de pagina's decodeerden en regio's voorgesteld+geëmbed werden. De 0 ontstaat in de filterstap, niet bij I/O.

### Finding 2: De search is een ABSOLUTE cosine-drempel (0,93) tegen één zaad-embedding
**Evidence:** `bootstrap_search.py:205-207` — `sim = cosine(emb, seed_emb); if sim < threshold: continue`; drempel = `FLYWHEEL_BOOTSTRAP_THRESHOLD` default 0,93 (live geen override, geverifieerd via container-env).
**Detail:** Geen top-1/ranking maar een harde absolute drempel. Elke voorgestelde regio moet ≥0,93 cosine met het zaad scoren.

### Finding 3: Gate-v2 draait als voorfilter op elke regio (drempel 0,5)
**Evidence:** `bootstrap_search.py:201-203` — `kp = keurmerk_probability(emb); if kp is not None and kp < GATE_THRESHOLD: continue`; `keurmerk_gate.py:37` `GATE_THRESHOLD=0.5`.
**Detail:** Regio's met keurmerk-waarschijnlijkheid < 0,5 vallen vóór de cosine-check al af.

## Deduced Conclusions

### Deduction 1: De blokkade zit in gate+drempel, niet in beeldlaad/PDF-render
**Based on:** Finding 1 (geen warnings, `seconds`>0) + de pijplijnvolgorde in `bootstrap_search.py`.
**Reasoning:** Een niet-decodeerbare (PDF-)pagina → `img is None` → warning + skip in <0,1s; een regio-fout → warning. Geen van beide in de logs, en de tijd per GTIN is te hoog voor een instant-skip.
**Conclusion:** Hypothese (b) "PDF niet gerenderd/onleesbaar" is **weerlegd** voor deze run. De pagina's zijn doorzoekbare beelden; de nul ontstaat bij gate (0,5) en/of cosine (0,93).

## Hypothesized Paths

### H-a (CONFIRMED): drempel 0,93 te streng voor absolute cross-product-cosine
**Status:** CONFIRMED via lees-alleen probe (2026-07-06, `scratchpad/probe.py`, geen writes).
**Bewijs (per kandidaat-product, beste regio-cosine tegen het zaad, echt embedding-model):**
- PREGNANCY_WARNING (zaad = echte crop 98x98): GTIN …342009 maxcos **0,491** (94 regio's, 21 gate-pass); …677989 **0,612**; …213277 **0,595**. Regio's ≥0,93: **0**.
- RAINFOREST_ALLIANCE (zaad = echte crop 102x102): …172058 **0,616**; …172072 **0,638**; …172126 **0,715** (kp 0,733). Regio's ≥0,93: **0**.
**Conclusie:** de beste échte matches toppen op 0,49–0,72 — ruim onder 0,93. De drempel is de bindende beperking. Sluit aan op [[project_123_realref_pivot]] (winst kwam van echte-crop-refs bij top-1-**ranking**, niet bij een absolute 0,93-lat) en [[project_124_detector_spike]].

### H-c (BIJGESTELD → CONFIRMED als TWEEDE blokkade): gate-v2 filtert ECHTE keurmerken weg
**Eerste lezing (2 klassen): Refuted als hoofdoorzaak.** Maar de volledige sweep (15 klassen, 29 GTINs) + visuele verificatie stelt dit bij:
- Sweep: bij ~de helft van de GTINs is `max_all` (beste regio vóór de gate) veel hoger dan `max_gated` (na de gate) — bv. SEPARATE_COLLECTION 0,740→0,220; RAINFOREST 172072 0,638→0,176; TRIMAN 201698 0,627→0,379; CONFORMITE_EUROPEENNE 0,545→0,205. De gate dropt dus juist de best-matchende regio.
- **Visuele verificatie (4 gevallen, crops + zaad bekeken):** de beste-cosine-regio ÍS telkens het echte keurmerk. RAINFOREST 172126 (0,715, kp 0,733 → PASS) = kikker-logo, correct. SEPARATE_COLLECTION (0,740, kp 0,258 → GEDROPT) = afvalcontainer-symbool. RAINFOREST 172072 (0,638, kp 0,392 → GEDROPT) = kikker-logo. TRIMAN 201698 (0,627, kp 0,335 → GEDROPT) = Triman-symbool. **De gate geeft duidelijke, echte keurmerken kp 0,25–0,39 (< drempel 0,5) → fout-negatief.**
**Conclusie:** gate-v2 (AUC 0,8476, getraind op 212 PO-rejected hard-negs, [[project_124_gate_v2]]) is onderfit voor deze keurmerktypen en blokkeert echte positieven — een TWEEDE, onafhankelijke blokkade náást de drempel. Alleen de drempel verlagen lost het NIET op.

### H-d (Open, secundair): region-proposer mist de kleine keurmerk-regio's
**Status:** Open, lagere prioriteit. De proposer levert 22–152 regio's/pagina; niet bevestigd of de exacte keurmerk-regio erbij zit. Ondergeschikt aan H-a (zelfs met de juiste regio zou 0,93 niet gehaald worden).

### H-b (WEERLEGD): PDF-artwork niet gerenderd naar doorzoekbaar beeld
**Resolution:** Refuted — zie Deduction 1 (geen laad-/regio-warnings, `seconds`>0; probe bevestigt leesbare pagina's van 314×363 t/m 4269×875).

## Side-finding (buiten scope, apart opvolgen): ONNX-detectie-model draait als MOCK op ACC
**Evidence:** ml-service startup-log 2026-07-06T07:13:27Z (4× workers) `ONNX runtime not available, using mock model`; `import onnxruntime` faalt in de container (`/opt/venv/.../onnxruntime/__init__.py`, broken import — waarschijnlijk ontbrekende system-lib/arch). `model_manager.py:49-73` = detectie-model (ONNX) → MockDetectionModel bij import-fout. **Raakt bootstrap-search NIET** (die gebruikt klassieke `propose_regions` + het torch-embedding-model, dat wél echt laadt: `efficientnet_b0` ImageNet-gewichten, `model_manager.py:88-101`). **Maar** de live detectie-crosscheck (`/ml/detect`) draait hierdoor mogelijk op een mock-detector — potentieel significant, apart te onderzoeken.

## Source Code Trace

- **Search-kern:** `apps/ml-service/app/services/bootstrap_search.py:150-241` — per GTIN: `get_training_image(page_key)` → `imdecode` → `propose_regions` → per box: crop → `generate_embedding` → gate (`:201`) → cosine≥drempel (`:206`) → upload + match.
- **Drempel-bron:** api `apps/api/src/services/flywheel/bootstrap-run.ts:267` `getBootstrapThreshold()` → meegegeven aan `mlClient.bootstrapSearch`.
- **Pagina-bron:** `bootstrap-run.ts:147-154` `resolveArtworkPage` → `artworkImport.storagePath` (nieuwste import met storage-path). Te verifiëren: is dat een geconverteerde PNG-pagina of de rauwe bron? (Finding 1 suggereert doorzoekbaar, maar niet expliciet bevestigd welk objecttype.)

## Fix direction (voor Story 19.6 — TWEE blokkades, NIET ad-hoc)

**Beide moeten aangepakt; alleen de drempel verlagen lost het niet op (de gate blokkeert de andere helft).**
1. **Herkalibreer de bootstrap-drempel (`FLYWHEEL_BOOTSTRAP_THRESHOLD`, default 0,93 → ~0,60–0,70).** Echte matches toppen op 0,72; realistische lat rond 0,60–0,70. Empirisch tegen de gold-set (precisie vs recall).
2. **Herstel de gate-v2 fout-negatieven.** Opties: `KEURMERK_GATE_THRESHOLD` verlagen (0,5→~0,2, snel/omkeerbaar), gate-v2 hertrainen met deze keurmerken als positieven, of de gate in het bootstrap-pad als zachte in plaats van harde filter gebruiken. Visueel bevestigd dat de gate echte logo's (kp 0,25–0,39) dropt.
3. **Overweeg top-1/ranking i.p.v. een absolute lat** (sluit aan op de 12.3-real-ref-pivot). Ontwerpkeuze voor de story.
4. **Apart spoor (side-finding):** repareer de kapotte `onnxruntime`-import in het ml-image (live detectie draait op mock-detector). Eigen investigate/story.
**Vangnet tegen valse positieven bij een lagere lat/soepelere gate:** gold-set-regressietest + tweetraps-dedup + class-cap blijven leidend en ongewijzigd.

## Reproductie / verificatie
- Lees-alleen probe: `scratchpad/probe.py` + `probe_input.json` (in ml-container `/tmp/`), `docker exec -w /app -e PYTHONPATH=/app <ml> python /tmp/probe.py`. Print per regio (cos, kp, gate_ok). Geen uploads.
- Verificatie na een drempel-fix: dezelfde 6 GTINs → verwacht ≥1 match zodra de lat onder ~0,72 zakt (mits de gate de regio doorlaat).

## Status
**Concluded** — root cause **CONFIRMED** (drempel 0,93 >> werkelijke max-cosine 0,49–0,72), confidence **High**. Vervolg = BMAD-story voor drempel-kalibratie/ranking + apart spoor voor de onnxruntime-breuk.
