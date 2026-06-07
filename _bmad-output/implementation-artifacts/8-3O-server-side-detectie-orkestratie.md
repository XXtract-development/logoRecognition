# Story 8-3O: Server-side detectie-orkestratie (localize → classify → crosscheck)

Status: ready-for-dev (adversarial review verwerkt — zie `review-8-3POD-voorwerk.md`, bevindingen O1–O8/S3); implementeren NÁ 8-3P

## Story

As a datamanager,
I want dat geïmporteerd artwork automatisch door de volledige detectieketen loopt,
so that de review-queue en trainingsdata zich vullen zonder ad-hoc scripts en de 39k-voorraad planbaar verwerkt kan worden.

## Waarom

- Fase-B-bevinding 4: er is **geen enkele server-side caller** van `/ml/artwork/localize` — de keten localize→classify→crosscheck draaide alleen via ad-hoc scripts (orchestrator-sessies). FR46–FR48 zijn daardoor niet end-to-end in productie.
- Alle bouwstenen bestaan: localize (8.3R, gekalibreerd via 8-3P), classify (8.4), crosscheck-route (8.5), registratie (8.6), BullMQ-queue-infra (9.1), import+rasterize-flow (8.1/8.2).

## Ontwerpbeslissingen (te bevriezen ná adversarial review)

1. **Orkestratie aan de Node-kant als BullMQ-queue** `artwork-detection` (architectuurregel: BullMQ uitsluitend Node; ML blijft REST). Eén job per artwork-afbeelding (storage-key), enqueue per afgeronde import-run; concurrency default 2 (env `DETECTION_CONCURRENCY`), retries/backoff conform bestaande queue-defaults (9.1).
2. **Templates uit de referentiebibliotheek, ML-side geladen:** `/ml/artwork/localize` krijgt `templates` als OPTIONEEL veld; indien afwezig laadt de ML-service zelf de actieve referenties (db_service.get_active_reference_logos + storage_service — beide bestaan, geverifieerd) met een in-proces **TTL-cache** (default 15 min, env) plus een expliciet `POST /ml/artwork/reload-templates`-endpoint (O4-fix: een mutatie-hook "via bestaand rebuild-pad" bestaat NIET — rebuild draait alleen bij startup en de Node-mutatieroutes triggeren niets; de Node-kant roept reload-templates aan ná bibliotheek-mutaties, best-effort). Caller-supplied templates blijven werken (tests/meetscripts). Per-klasse drempels komen ML-side uit `LOCALIZE_CLASS_THRESHOLDS` (8-3P) — geen koppeling met de templates-payload.
3. **Crop-persistentie = expliciete classify-uitbreiding (O1-fix — dit is NIEUW ML-werk, geen bestaand contract):** `ClassifyRequest` krijgt optionele velden `gtin` en `persist_crops` (default false); bij true slaat de ML-service per kandidaat-regio de crop op in MinIO (`artwork-crops/{gtin}/{sha1(bron+bbox)[:12]}.png`, idempotente sleutel) en retourneert `crop_path` per resultaat. Bestaande callers (zonder de velden) ongewijzigd. Vereist voor review-items én 8.6-registratie (`RegisterTrainingDataItem.cropPath` is verplicht — geverifieerd).
4. **Crosscheck-logica refactoren naar een service-functie** (`apps/api/src/services/artwork-crosscheck.ts`): de bestaande route (artwork-pipeline.ts:702) wordt een dunne wrapper; de detection-worker roept de service direct aan (geen interne HTTP). Gedrag byte-voor-byte gelijk (incl. declared=[]-veiligheidsregel en review-item-persistentie). **Idempotentie leeft NIET in de service maar als pre-filter in de worker (O2-fix — anders tegenspraak met byte-gelijk gedrag):** vóór de crosscheck-aanroep filtert de worker detecties weg waarvoor al een review-item of registratie bestaat met sleutel (sourceFile, t3777Code, gequantiseerde bbox — afgerond op 8px-raster, O3-fix); "declared but not found"-items dedupen op (gtin, t3777Code, reason-type) omdat bbox/sourceFile daar null zijn. Herdraai-semantiek gedocumenteerd: ná template-/drempelwijziging of truncated-runs kunnen bewust nieuwe items ontstaan.
5. **Declaraties:** de worker gebruikt een pluggable provider met default **lege declaratie** (→ alles naar review, bestaand veilig gedrag). De echte bron (catalog tradeitemxml-API) is story 8-3D.
6. **Auto-accept → registratie:** autoAccepted-detecties gaan direct door naar het bestaande 8.6-registratiepad (service-aanroep, zelfde provenance-velden, method uit classify).
7. **Trigger + handmatige start (O5-fix):** automatische enqueue per succesvol geïmporteerd BEELD ongeacht type — JPG/PNG direct op `storage_path`; PDFs per gerasterde pagina uit `pages.pages[].imagePath` (vorm geverifieerd) — én `POST /artwork-detection/runs { gtins?|importRunId? }` (ADMIN) voor handmatig/herstart. **Jobstatus (O6-fix):** `getJobStatus` is hardcoded op de `training`-queue — parametriseren op queue-naam (expliciete taak) zodat het bestaande jobs-endpoint ook detection-jobs toont.
8. **gln-sourcing (S3/D1-prerequisite voor 8-3D):** de import schrijft voortaan `gln` weg in `artwork_imports` (de mediaserver-client levert het veld al — geverifieerd); bestaande records zonder gln blijven NULL (declared=[]-fallback) tot her-import.
9. **Breaking-change-check `image_path`:** vóór deploy van deze story een cross-repo zoektocht (GitHub org) naar `/ml/artwork/localize`-callers buiten deze repo; uitkomst vastleggen in het story-record.

## Acceptance Criteria

1. **Keten-job:** Given een geïmporteerd artwork (afbeelding of gerasterde PDF-pagina), When de detection-job draait, Then voert deze localize (met 8-3P-kalibratie) → classify (mét crop-persistentie) → crosscheck-service uit And ontstaan review-items en/of auto-geaccepteerde registraties met volledige provenance (bron, bbox, methode, confidence, crop) And is de job idempotent (herdraai maakt geen duplicaat-reviewitems voor dezelfde (bron, bbox, code)).
2. **Templates ML-side:** Given een localize-aanroep zónder templates, When de ML-service draait, Then laadt deze de actieve referenties zelf (cache in-proces) And blijft caller-supplied templates ondersteund And een lege bibliotheek geeft een lege detectielijst plus warning (open-input-gate, zelfde patroon als 8.7).
3. **Run-beheer:** Given een afgeronde import-run, When de import afrondt, Then worden detection-jobs automatisch ge-enqueued per succesvol geïmporteerde afbeelding And kan een ADMIN een run handmatig starten/herstarten per GTIN-set of importRunId And zijn jobstatussen (incl. failedReason) zichtbaar via het bestaande jobs-endpoint And faalt één artwork zonder de run te breken (per-item fouten, 8.1-patroon).
4. **Crash-bestendigheid:** Given een API-herstart midden in een detection-run, When de containers terugkomen, Then hervatten wachtende jobs zonder verlies (NFR1-patroon) — **bewezen via test (verplicht, O7-fix)**; ACC-demonstratie optioneel als aanvulling.
5. **Empirische validatie (done-criterium):** Given de keten op ACC, When een detection-run draait over de bestaande imports (read-only m.u.v. de bedoelde review-items/registraties — dit zijn bestaande applicatiepaden), Then ontstaan review-items voor de natuurlijke detecties die 8-3P overhield, zonder ad-hoc scripts And rapporteert het story-record: aantal jobs, doorlooptijd/job, queue-gedrag bij een geforceerde item-fout And wordt de 39k-extrapolatie geactualiseerd (met DETECTION_CONCURRENCY-advies).
6. **Tests:** vitest: worker-flow met gemockte mlClient/prisma (keten-volgorde, dedup-pre-filter incl. gequantiseerde bbox + declared-not-found-sleutel, per-item-fout, auto-accept→registratie via registerCropsTx-pad), crosscheck-service-refactor byte-gelijk gedrag (bestaande 8.5-route-tests blijven groen), enqueue-hook per beeld/page (JPG/PNG én PDF-multi-page), queue-status-parametrisering, gln-wegschrijven bij import; pytest: ML-side template-loading (TTL-cache + reload-endpoint + open-input-gate) en classify-crop-persistentie (gtin/persist_crops/crop_path, idempotente sleutel).

## Expliciet buiten scope

- Declaratie-bron (catalog-API) → **8-3D** · UI voor detection-runs (jobstatus via API; PipelineJobsPanel is een bestaand deferred punt) · bulk-run over de volledige 39k (aparte beheeractie ná 8-3D, met PO-akkoord)

## Dev Notes

- Volgt 9.1-patronen: queue-naam + worker in `apps/api/src/services/pipeline/` (queue.ts/workers.ts), service-key-auth voor interne callers (NFR6)
- mlClient uitbreiden met `localizeArtwork()` en `classifyArtwork()` (bestaat nog niet — alleen rasterize/synthesize/detect)
- Hergebruik geverifieerd (O8): `registerCropsTx`/`processAcceptedReviewItems` (artwork-pipeline.ts:904/1010) als registratiepad; `get_active_reference_logos` (db_service) voor ML-side templates
- Idempotentie-sleutel reviewitems: uniqueness op (sourceFile, t3777Code, bbox-hash) afdwingen in de service (geen migratie; query-check vóór insert), tenzij Friso een unique-index wil (migratie → expliciete toestemming)
- Let op de 8-3R-beperkingenlijst (story-file): top-1→top-k zit in 8-3P; soft-cap-budget blijft
- ML-side DB-toegang voor templates: db_service heeft `get_active_reference_logos` al (gebruikt door rebuild) — hergebruiken

### Referenties

- `8-3R`-story (bekende beperkingen) + `8-3R-meetrapport.md` · `8-3P` (kalibratie-input) · `artwork-pipeline.ts` (crosscheck:702, import-flow:404–486, register-training-data) · `services/pipeline/queue.ts`+`workers.ts` (9.1-patronen) · `services/ml-client.ts`

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMAD Story Implementation Agent)

### Completion Notes List

Implemented per the 9 frozen design decisions. Bottom-up: shared registration
module → crosscheck service → mlClient methods → detection-flow → queue/worker →
routes/import-hook/gln → ML localize/classify.

**AC-bewijs (tests):**
- **AC1 (keten-job + provenance + idempotentie):** vitest `runDetectionJob` keten-test
  (localize→classify(persist_crops)→crosscheck→registratie), dedup-pre-filter-test
  (gequantiseerde 8px-bbox, `Math.floor`), auto-accept→`registerCropsTx`-test (crop_path +
  provenance, géén interne HTTP), "no double-register on retry"-test (dedup vs bestaande
  registratie). Alle groen.
- **AC2 (templates ML-side):** pytest `test_detection_support.py` — TTL-cache laadt 1×
  binnen TTL, reload-templates invalidatie → herlaadt, open-input-gate (lege bibliotheek →
  lege detecties, geen error). Caller-supplied templates pad ongewijzigd
  (`test_localization_precision` byte-gelijk groen).
- **AC3 (run-beheer):** enqueue-per-beeld + per-PDF-page-test (O5), JPG/PNG-single-job-test,
  `getJobStatus(jobId, 'artwork-detection')`-test (O6 parametrisering), `POST
  /artwork-detection/runs` (ADMIN), per-item soft-fail enqueue-hook in de import-flow.
- **AC4 (crash-bestendigheid, VERPLICHT):** vitest crash-resilience-test (BullMQ-mock):
  ge-enqueude job blijft opvraagbaar via `getJobStatus` ná worker-herregistratie (singleton,
  geen dubbele consumers); jobstate leeft in Redis, niet in-proces. Volgt 9.1-patroon.
- **AC6 (gln):** vitest gln-persistentie-assertie via `POST /artwork-import/runs` →
  `artworkImport.upsert` create+update krijgen gln uit de mediaserver-respons.

**classify crop-persistentie (O1):** `gtin`+`persist_crops`→`crop_path`, idempotente sleutel
`artwork-crops/{gtin}/{sha1(bron+bbox)[:12]}.png`; bestaande callers ongewijzigd
(`test_classify_without_persist_flag_writes_nothing`).

**Method-mapping:** classify levert `method='embedding'|'classifier'`; de provenance-union
(`ProvenanceMethod`) kent geen `embedding` — `embedding`/`classifier`→`classifier` voor de
registratie-provenance, `template` blijft behouden. Crosscheck-drempel gebruikt de echte
method (embedding-drempel 0.80).

**Cross-repo-check (besluit 9):** `gh api "search/code?q=org:XXtract-development+artwork/localize"`
→ `total_count: 0` — geen externe callers van `/ml/artwork/localize`. `image_path`-breaking-change
is veilig (geen externe consumenten).

**Zelf-review bevindingen (gefixt):**
- dedup-quantisatie: `Math.floor` (niet `round`) zodat x=9 en x=12 op 8px-raster colliden;
  declared-not-found (null bbox) keyt op (sourceFile, code) via 'null'-bboxKey.
- worker-error-semantiek: `runDetectionJob` throwt op harde ML/DB-fout → BullMQ-retry; per-item
  isolatie (sibling-job onafhankelijk).
- geen dubbele registratie bij retry ná partial success: `loadExistingDetectionKeys` queryt
  ZOWEL open review-items ALS actieve trainingData-registraties; geverifieerd via test.
- reload-endpoint auth: GEEN (interne service, zelfde posture als overige /ml/*-endpoints) —
  gedocumenteerd in de endpoint-docstring.
- TTL-cache thread-safety: plain module-global; uvicorn-workers zijn aparte processen, asyncio
  single-threaded binnen één worker → race hooguit dubbele recompute, nooit corruptie —
  gedocumenteerd.
- ongebruikte `ProvenanceMethod`-import uit de route verwijderd na de extractie.

### AC5 — ACC-validatie (POST-DEPLOY, NIET in deze story uitgevoerd)

De Node detection-worker draait pas ná deploy. Verificatiestappen voor ACC (met ADMIN-token):

1. **Run starten** (per GTIN-set of importRunId):
   `POST /api/v1/artwork-detection/runs` body `{ "gtins": ["<gtin>", ...] }` of
   `{ "importRunId": "<run-uuid>" }` → 202 `{ enqueued, candidates }`. Noteer `enqueued`
   (= aantal jobs; PDFs tellen per pagina).
2. **Jobstatus-check** via het bestaande jobs-endpoint met de `artwork-detection`-queue-naam
   (getJobStatus is geparametriseerd, O6) — controleer `state` (completed/failed) +
   `failedReason` per job.
3. **Review-items-telling:** `GET /api/v1/artwork/review-queue` (vóór/ná) of een DB-count op
   `artwork_review_items WHERE status='open'` voor de betrokken GTIN's → bevestig dat de
   natuurlijke 8-3P-detecties review-items opleveren zonder ad-hoc scripts.
4. **Geforceerde item-fout:** verwijder/blokkeer tijdelijk één bron-key (of mock ML-down) →
   bevestig dat die ene job faalt (zichtbaar via failedReason) terwijl de run doorloopt
   (8.1 per-item-isolatie).
5. **39k-extrapolatie + DETECTION_CONCURRENCY-advies** actualiseren op basis van doorlooptijd/job.

Geen ssh nodig; alles via de API met ADMIN-token. NIET zelf op ACC gedraaid (post-deploy).

### File List

**Node (apps/api):**
- `src/services/artwork-registration.ts` (NEW — registerCropsTx/processAcceptedReviewItems extractie)
- `src/services/artwork-crosscheck.ts` (NEW — crosscheckDetections + thresholds)
- `src/services/pipeline/detection-flow.ts` (NEW — runDetectionJob/dedupDetections/enqueueDetectionForImport/declaration-provider)
- `src/services/pipeline/queue.ts` (artwork-detection queue + getJobStatus parametrisering)
- `src/services/pipeline/workers.ts` (registerDetectionWorker)
- `src/services/ml-client.ts` (localizeArtwork/classifyArtwork/reloadTemplates)
- `src/services/mediaserver-client.ts` (gln per-item)
- `src/api/v1/artwork-pipeline.ts` (crosscheck thin wrapper, gln-write, enqueue-hook, POST /artwork-detection/runs)
- `src/main.ts` (registerDetectionWorker bij startup)
- `src/__tests__/setup.ts` (mlClient mock localize/classify/reload)
- `src/__tests__/services/artwork-detection-orchestration.test.ts` (9 ontskipt + 3 extra)

**ML (apps/ml-service):**
- `app/api/artwork.py` (templates Optional + TTL-cache + reload-templates + open-input-gate; classify gtin/persist_crops→crop_path idempotente sleutel; _decode_image_bytes helper)

**Tests (root):**
- `tests/test_detection_support.py` (NEW — TTL-cache, reload, open-input-gate, classify-crop-persistentie)
