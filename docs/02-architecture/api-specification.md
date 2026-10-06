# API Specification

**Laatst bijgewerkt:** 2025-11-03

---

## Base URL

**Development:** `http://localhost:3000`
**Production:** `https://api.your-domain.com`

---

## Authentication

### JWT Bearer Token
```http
Authorization: Bearer <token>
```

### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password"
}
```

**Response:**
```json
{
  "token": "eyJhbGc...",
  "refreshToken": "refresh...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name"
  }
}
```

---

## Training API

### Upload Images
```http
POST /api/training/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

{
  "files": [<File>, <File>, ...],
  "category": "logo-category-name"
}
```

### Start Training
```http
POST /api/training/start
Authorization: Bearer <token>
Content-Type: application/json

{
  "categoryId": "uuid",
  "config": {
    "epochs": 50,
    "batchSize": 32,
    "learningRate": 0.001
  }
}
```

### Get Training Status
```http
GET /api/training/status/:jobId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "jobId": "uuid",
  "status": "running|completed|failed",
  "progress": 75,
  "currentEpoch": 38,
  "totalEpochs": 50,
  "metrics": {
    "loss": 0.023,
    "accuracy": 0.987
  }
}
```

---

## Recognition API

### Recognize Image
```http
POST /api/recognition/predict
Authorization: Bearer <token>
Content-Type: multipart/form-data

{
  "image": <File>,
  "topK": 5
}
```

**Response:**
```json
{
  "predictions": [
    {
      "category": "Logo A",
      "confidence": 0.95,
      "boundingBox": {
        "x": 100,
        "y": 150,
        "width": 200,
        "height": 180
      }
    }
  ],
  "processingTime": 45
}
```

### Batch Recognition
```http
POST /api/recognition/batch
Authorization: Bearer <token>
Content-Type: multipart/form-data

{
  "images": [<File>, <File>, ...]
}
```

---

## Category Management

### List Categories
```http
GET /api/categories
Authorization: Bearer <token>
```

### Create Category
```http
POST /api/categories
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "New Logo Category",
  "description": "Description..."
}
```

### Update Category
```http
PUT /api/categories/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name"
}
```

### Delete Category
```http
DELETE /api/categories/:id
Authorization: Bearer <token>
```

---

## WebSocket Events

### Connection
```javascript
import io from 'socket.io-client';

const socket = io('ws://localhost:3000', {
  auth: {
    token: '<jwt-token>'
  }
});
```

### Training Updates
```javascript
socket.on('training:progress', (data) => {
  console.log(data);
  // {
  //   jobId: 'uuid',
  //   progress: 75,
  //   epoch: 38,
  //   loss: 0.023
  // }
});

socket.on('training:completed', (data) => {
  console.log('Training completed:', data);
});

socket.on('training:failed', (error) => {
  console.error('Training failed:', error);
});
```

### Recognition Updates
```javascript
socket.on('recognition:result', (result) => {
  console.log('Recognition result:', result);
});
```

---

## Error Responses

### Standard Error Format
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

### Common Error Codes
- `UNAUTHORIZED` (401): Invalid or missing authentication
- `FORBIDDEN` (403): Insufficient permissions
- `NOT_FOUND` (404): Resource not found
- `VALIDATION_ERROR` (400): Invalid request data
- `RATE_LIMIT_EXCEEDED` (429): Too many requests
- `INTERNAL_ERROR` (500): Server error

---

## Rate Limits

- **Anonymous:** 10 requests/minute
- **Authenticated:** 100 requests/minute
- **Training:** 5 concurrent jobs per user
- **Recognition:** 50 requests/minute per user

---

## Pagination

Standard pagination format:
```http
GET /api/categories?page=1&limit=20&sort=-createdAt
```

**Response:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

---

Voor gedetailleerde specs en voorbeelden, zie: `_archive/old-structure/architecture/5-api-specification.md`

---

## Update 2026-06-03 — Epic 7: Betrouwbaar Evaluatiefundament

### Nieuwe/uitgebreide endpoints

| Endpoint | Methode | Beschrijving |
|----------|---------|--------------|
| `/api/v1/training/data/:id/holdout` | PATCH | Markeer/demarkeer trainingsdata als holdout (`{ holdout: boolean }` → `{ id, holdout }`; 404 bij onbekend id) |
| `/api/v1/training/data?holdout=true` | GET | Lijst gefilterd op holdout-status |
| `/api/v1/training/start` | POST | **Uitgebreid:** weigert nu met 422 wanneer de holdout-set leeg is of onder `HOLDOUT_MINIMUM` (env, default 25) |
| `/api/v1/models/:modelId` | GET | **Uitgebreid:** response bevat `holdoutMetrics { accuracy, precision, recall, f1, holdoutSize, holdoutHash }` |
| `/api/v1/feedback/model-comparison` | GET | **Uitgebreid:** per vergeleken versie `holdoutMetrics` |
| `/api/v1/reference-logos` | POST | Multipart upload keurmerk-referentie (`t3777Code`, `variantLabel`, `source` + PNG/SVG-bestand) → 201; 400 bij fout formaat of resolutie < `REFERENCE_MIN_RESOLUTION` (default 200px) |
| `/api/v1/reference-logos?code=X` | GET | Varianten per T3777-code, inclusief inactieve (historie) + preview-URL |
| `/api/v1/reference-logos/:id/deactivate` | PATCH | Soft delete (active=false); records worden nooit verwijderd |

ML-service (intern): `get_holdout_images()`, `count_holdout_images()`, holdout-uitsluiting op query-niveau in `get_training_images()`, `compute_holdout_hash()` en holdout-evaluatie bij modelregistratie (`metrics.holdout`).

---

## Update 2026-06-04 — Epic 8: Automatische Trainingsdata uit Etiket-Artwork

### Nieuwe endpoints (API gateway, `apps/api`)

Routes in `apps/api/src/api/v1/artwork-pipeline.ts`, geregistreerd onder prefix `/api/v1`.

| Endpoint | Methode | RBAC | Beschrijving |
|----------|---------|------|--------------|
| `/api/v1/artwork-import/runs` | POST | ADMIN | Start een artwork-importrun. Body `{ gtins?: string[], force?: boolean }`. Antwoordt direct met `202 { runId }`; de import draait op de achtergrond (in-process async; verplaatst naar BullMQ in Epic 9). Reeds geïmporteerde media (zelfde `mediaId`, status `imported`) worden overgeslagen tenzij `force: true`. |
| `/api/v1/artwork-import/runs/:runId` | GET | auth | Status van een importrun → `200 { status, imported, skipped, failed: [{ gtin, reason }] }`; `404` bij onbekend `runId`. |
| `/api/v1/artwork/:gtin/crosscheck` | POST | ADMIN | Vergelijkt gedetecteerde keurmerken met de GS1 T3777-declaratie. Body `{ detections: [{ t3777Code, confidence, bbox, method? }], declared: string[] }` → `200 { autoAccepted, reviewItems }`. Auto-accept alleen wanneer detectie in `declared` zit én `confidence ≥ drempel-per-methode` (`template` 0.85, `embedding` 0.80, `classifier`/onbekend 0.90; env-configureerbaar). Lege `declared` → alles naar review (geen onafhankelijke bevestiging). Niet-gedeclareerde of niet-gevonden codes komen met reden in `reviewItems` (gepersisteerd in `artwork_review_items`). |
| `/api/v1/artwork/review-queue` | GET | auth | Alle openstaande review-items (`status='open'`), nieuwste eerst. |
| `/api/v1/artwork/review-items/:id/accept` | PATCH | ADMIN | Accepteert een open review-item en zet het direct door naar trainingsdata-registratie (Story 8.6 "doorzet", method `human`). Het item wordt eerst op `accepted` gezet; bij aanwezige crop/source-referenties wordt het via de 8.6-registratiepad geregistreerd en op `registered` gezet → `200 { status, registered, skipped }`. Ontbreekt crop/source, dan blijft het `accepted` (skipped, geen fabricage) voor latere aanvulling. `404` bij onbekend id; `409` als het al `registered` is. |
| `/api/v1/artwork/review-items/:id/reject` | PATCH | ADMIN | Verwerpt een open review-item (`status='rejected'`); er wordt geen trainingsdata aangemaakt. `404` bij onbekend id. |
| `/api/v1/artwork/review-items/process-accepted` | POST | ADMIN | Catch-up "doorzet": registreert alle `accepted` review-items die nog niet geregistreerd zijn (bv. eerder geskipt wegens ontbrekende crop, intussen aangevuld). Idempotent — `registered` items worden op status uitgesloten → `200 { processed, registered, skipped }`. |
| `/api/v1/artwork/:gtin/register-training-data` | POST | ADMIN | Registreert auto-geaccepteerde of handmatig goedgekeurde crops als trainingsdata. Body `{ items: [{ t3777Code, cropPath, sourceFile, bbox, method, confidence }] }` → `201 { registered, ids }`; `400` bij lege items. Maakt per item een `LogoImage` (`metadata.artworkSource=true`), upsert het `Logo` (category `keurmerk`) en een `TrainingData`-record met volledige provenance. De hele batch loopt in één transactie (atomair). |
| `/api/v1/training/data/deactivate-by-source` | PATCH | ADMIN | Deactiveert (soft delete, `active=false`) in bulk alle trainingsdata afkomstig van één bronbestand. Body `{ sourceFile }` → `200 { deactivated }`; `400` zonder `sourceFile`. Filtert via JSON-path op `provenance.sourceFile`; records worden nooit verwijderd. |
| `/api/v1/artwork/synthesize` | POST | ADMIN | Genereert synthetische trainingscomposieten voor één keurmerkklasse en registreert ze via het 8.6-pad (`method='synthetic'`, altijd `holdout=false` — NFR3). Body `{ t3777Code, count, seed? }`. Roept de ML-service `/ml/artwork/synthesize` aan en registreert de teruggegeven crop-descriptors atomair via `registerCropsTx` → `201 { generated, registered, ids }`. `400` bij ontbrekende `t3777Code`/`count < 1`; `200 { generated: 0, registered: 0, ids: [] }` wanneer er geen bruikbare referenties/achtergronden zijn (open-input gate, geen fout); `502` als de ML-aanroep faalt. |

### Gewijzigd endpoint (Epic 7-holdout)

| Endpoint | Methode | Beschrijving |
|----------|---------|--------------|
| `/api/v1/training/data/:id/holdout` | PATCH | **Uitgebreid (NFR3):** weigert nu met `422` wanneer `{ holdout: true }` wordt gezet op een record waarvan `provenance.method === 'synthetic'` — synthetische data mag de holdout-set nooit binnenkomen (de holdout blijft 100% echt). Provenance wordt gelezen via de gedeelde `mapProvenance`-mapper. Het bestaande `404`-gedrag bij onbekend id blijft ongewijzigd. |

### Nieuwe/uitgebreide endpoints (ML-service, `apps/ml-service`)

Routes in `apps/ml-service/app/api/artwork.py`, geregistreerd onder prefix `/ml`.

| Endpoint | Methode | Beschrijving |
|----------|---------|--------------|
| `/ml/artwork/rasterize` | POST | **(Story 8.2)** Rastert elke pagina van een gecachte PDF-artwork naar PNG. Body `{ storage_path, dpi? }` (dpi 36–1200, default `ARTWORK_RASTER_DPI`) → `{ storage_path, dpi, pages: [{ source_file, page, image_path, dpi }], error? }`. De PNG's worden naast de bron in MinIO geschreven (`{dir}/{base}.page-{n}.png`). Soft-fail (AC2): een corrupte/beveiligde PDF geeft een lege `pages`-lijst + `error`-reden met HTTP `200`; alleen een storage-/fetchfout geeft `422`. |
| `/ml/artwork/localize` | POST | **(8.3R multi-scale)** Lokaliseert keurmerken via een schaal-ladder (referenties van elke resolutie; alpha-geneutraliseerd) + tiling + beste-schaal-collapse per (code, tegel) + NMS. Body `{ storage_path? \| image_b64?, templates: [{ t3777_code, image_b64 }], tile_size?, overlap?, min_score?, scale_min_px?, scale_max_px?, scale_step? }` → `{ detections: [{ t3777_code, bbox, score }], truncated }`. Metric: TM_CCOEFF_NORMED [0,1] (degenerate-fallback < std 1.0); gekalibreerd: `min_score=0.55` bij `scale_step=1.10` (zie 8-3R-meetrapport). `422` bij storage-fetchfout/onleesbaar beeld of ontbrekende bron; `400` bij onleesbare `image_b64`. **Breaking (8.3R): `image_path` (bestandssysteem) is verwijderd.** Time-budget `LOCALIZE_TIME_BUDGET_S` (soft cap, `truncated=true` bij afkap). |
| `/ml/artwork/reload-templates` | POST | **(8-3O)** Herlaadt de ML-side referentie-template-cache (TTL default 900 s, env `TEMPLATE_CACHE_TTL_S`). Geen auth (intern netwerk); Node roept dit best-effort aan na bibliotheek-mutaties. |
| `/api/v1/artwork-detection/runs` | POST | **(8-3O, ADMIN)** Start/herstart server-side detectie: enqueue’t één `artwork-detection`-job per geïmporteerd beeld (JPG/PNG) of PDF-pagina. Body `{ gtins? \| importRunId? }`. Keten per job: localize (8-3P-kalibratie) → classify (`persist_crops`) → dedup-pre-filter → crosscheck-service → auto-accept-registratie. Jobstatus via het jobs-endpoint met `queue=artwork-detection`. |
| `/ml/artwork/classify` | POST | **(8-3O: + optionele `gtin`/`persist_crops` → `crop_path` per resultaat, idempotente MinIO-crops `artwork-crops/{gtin}/…`)**  **(Story 8.4)** Classificeert gelokaliseerde regio's naar een T3777-keurmerkcode via embedding-similariteit tegen de referentiebibliotheek (pgvector cosine), met fallback. Body `{ storage_path? \| image_b64?, crops?: [{ x, y, width, height }], confidence_threshold? }` (zonder `crops` → de hele afbeelding als één regio) → `{ results: [{ bbox?, t3777_code, confidence, method, uncertain }] }`. `uncertain` markeert lage-confidence-regio's voor 8.5-routing (geen filter). `422` bij ophaal-/decodeerfout of ontbrekende invoer; `400` bij ongeldige `image_b64`. |
| `/ml/artwork/synthesize` | POST | **(Story 8.7)** Genereert `count` synthetische composieten voor `t3777_code`. Body `{ t3777_code, count, seed? }` (count 1–500). Laadt actieve referentievarianten + echte cached artwork-achtergronden, componeert deterministische samples (scale/rotatie/HSV/blur via seeded `RandomState`), schrijft elke PNG naar MinIO (`synthetic/{t3777_code}/{seed}.png`) en geeft crop-descriptors terug → `{ t3777_code, generated, samples: [{ t3777_code, crop_path, source_file, bbox, method, confidence, seed }] }`. Geen bruikbare invoer → `generated: 0` met lege `samples` (geen 5xx). Deze service schrijft zelf geen `training_data`: persistentie van records gebeurt in `apps/api` via het 8.6-pad. |

---

## Update 2026-06-05 — Epic 9: Automatische Retraining

Epic 9 voegt een crash-bestendige retraining-pipeline toe (BullMQ + Redis). De Node-routes voor jobstatus, trigger-notificaties, handmatige flow-start en de approval-queue staan in `apps/api/src/api/v1/pipeline.ts` (nieuw) en `apps/api/src/api/v1/training.ts` (uitgebreid), beide geregistreerd onder prefix `/api/v1`. De ML-service krijgt één extra endpoint voor synthetische batch-planning.

### Auth-context (belangrijk)

`apps/api/src/main.ts` registreert **geen** globale auth-hook; RBAC wordt per route afgedwongen via `requireRole(...)`-preHandlers. In de tabel hieronder betekent de RBAC-kolom:
- **ADMIN** → route heeft een expliciete `requireRole('ADMIN')`-preHandler. ADMIN is in deze codebase de data-manager-equivalent (er is geen aparte `DATA_MANAGER`-rol).
- **— (geen guard)** → de routehandler heeft geen role-/auth-preHandler. De activatie-route vormt de uitzondering met eigen, inline 403/401-guards (zie onder).

### Logo-scan aanvraag en resultaat (Verhaal 1.1 en 1.2)

`POST /api/v1/pipeline/logo-scans` — route in `apps/api/src/api/v1/logo-scans.ts`, sleutelcontrole in `apps/api/src/services/pipeline/logo-pipeline-keys.ts`.

- **Authenticatie:** header `x-api-key` moet exact één sleutel uit `LOGO_PIPELINE_KEYS` zijn (`naam:sleutel,naam2:sleutel2`; zie `.env.example`). Timing-safe vergelijking (SHA-256-digests, alle sleutels doorlopen), geen voorvoegsel-controle, nooit de gedeelde `API_KEY`, `PIPELINE_SERVICE_KEY` of een `lr_…`-sleutel. Ontbrekende of lege variabele = elke aanvraag `401`.
- **Antwoorden:** `401 {error:{code:'UNAUTHORIZED',message,requestId}}`; alle foutvormen zijn `{error:{code,message,requestId}}`.
- **Aanvragen:** `POST` multipart met één bestand in veld `file` (png of jpeg, magic bytes beslissen, niet het mimetype) en optionele velden `productId`, `pipelineId`, `gpcCategoryCode`, `rescan` (alleen de waarde `true` dwingt een nieuwe poging af) en `requestedAt` (ISO-8601; bepaalt welk beeld van een product het nieuwste is; onleesbaar of meer dan 60 s vooruit wordt genegeerd en dan geldt de servertijd). Antwoord `202 {scanId}`, of `202 {scanId, deduplicated: true}` als een eerdere `done`-scan is hergebruikt (zie Verhaal 1.3 hieronder). Fouten: `400 INVALID_IMAGE` (geen/meer dan één bestand, geen png/jpeg, onleesbaar, meer dan `LOGO_SCAN_MAX_PIXELS` = 80 miljoen pixels), `413 IMAGE_TOO_LARGE` (> `LOGO_SCAN_MAX_IMAGE_BYTES` = 10 MB, gelijk aan de multipart-limiet in `main.ts`), `503 BUSY` met header `Retry-After` (queue vol of niet te plaatsen; er wordt niets stil verwerkt of verloren).
- **Opvragen:** `GET /api/v1/pipeline/logo-scans/:scanId` (zelfde sleutel) geeft `{scanId, status: pending|running|done|failed|superseded, reason?, logoResults?, processingTimeMs?}`; onbekend of verlopen id geeft `404 NOT_FOUND`. `reason` bij `failed`: `timeout`, `invalid_image`, `recognition_unavailable`, `result_invalid`. `logoResults` is het GS1-antwoord, zie "logoResults v1" hieronder (Verhaal 1.5). Optioneel POST-veld `signalWord`: alleen `DANGER` of `WARNING` (uit de OCR van n8n) wordt ongewijzigd overgenomen in `logoResults.signaalwoord`; elke andere of ontbrekende waarde wordt weggelaten.
- **Werking:** eigen BullMQ-queue `logo-scan` (jobId = scanId, 1 poging), worker hergebruikt lokaliseren + classificeren zoals `/detect` (`mlClient`). Status en beeld staan in Redis (status 24 uur, beeld 1 uur en na afloop verwijderd); sinds Verhaal 1.3 wordt elke scan daarnaast in Postgres bewaard (zie hieronder) en leest opvragen eerst Redis, dan de tabel. Elke scan eindigt binnen `LOGO_SCAN_MAX_MS` = 300000 in `done` of `failed`/`timeout` (ook bij wachttijd in de queue of een gestorven worker: bij opvragen wordt dat vastgesteld). `processingTimeMs` (looptijd van de worker, zonder wachttijd) wordt bewaard en gelogd voor p50/p95.
- **Zoekruimte (Verhaal 1.7):** met een geldige `gpcCategoryCode` (precies 8 cijfers; segment/family/class/brick = eerste 2/4/6/8) laat de worker soorten weg die voor die categorie niet zinvol zijn, via de kolom `categorieen` (GPC-prefixen) in `gs1-mapping.json`; de lokaliseer- en classificeeraanroepen blijven gelijk, alleen de lijst `codes` wordt kleiner. Soorten met lege `categorieen` of zonder regel in de omzettabel vallen nooit af. Gevuld is alleen Nutri-Score (`["50"]`, segment Voeding/Drank/Tabak); dieetsoorten, GHS en alle keurmerken blijven leeg (dieet pas na meting op ACC), omdat een gemist gevaarsymbool onaanvaardbaar is en de GPC-dekking niet bewezen is. Zonder of met een ongeldige code wordt de volledige set gezocht. De gebruikte beperking staat in `logoResults.zoekruimte {gpcCategoryCode?, beperkt, aantalSoorten}` (optioneel veld, `schemaVersion` blijft `"1"`).
- **Instellingen (optioneel):** `LOGO_SCAN_CONCURRENCY` (standaard 2) en `LOGO_SCAN_MAX_QUEUED` (standaard 20 wachtend of actief; daarboven 503).
- **Logging:** alleen de consumentnaam en `requestId`, nooit een sleutelwaarde.
- **Herhaalbaar en herleidbaar (Verhaal 1.3):** tabel `logo_scans` (Prisma `LogoScan`, migratie `0022_add_logo_scans` met `down.sql`) bewaart elke scan 12 maanden met versies en ruwe detecties; sleutel `(product_id, image_hash, model_version, reference_version, attempt)` is uniek, `scanId` is tevens het jobId. `model_version` = `LOGO_MODEL_VERSION`; `reference_version` = poolhandtekening `<aantal>:<laatste createdAt>` van de actieve `reference_logos` op het moment van de aanvraag (plafond: een wissel van één referentie met gelijk aantal en gelijke laatste datum wordt gemist).
  - **Dedupe:** alleen met `productId`, binnen 24 uur, voor een `done`-scan van dezelfde afnemer met gelijke `model_version` en `reference_version`; antwoord `202 {scanId (oude), deduplicated: true}` en geen job. `pending`, `running`, `failed` en `superseded` worden nooit hergebruikt (na `failed` volgt dus een nieuwe poging). Is `LOGO_MODEL_VERSION` niet gezet, dan volgt geen dedupe. `rescan=true` slaat dedupe over; `attempt` is de hoogste bestaande poging voor dezelfde sleutel + 1.
  - **Huidig beeld:** tabel `logo_current_image` (per `productId` één rij) schuift alleen vooruit op aanvraagtijdstip (bij gelijke tijd blijft de bestaande staan). Wint een nieuwe hash, dan krijgen `pending`/`running`-scans van de oude hash status `superseded` (eindstatus, ook in Redis; de worker controleert vóór het starten en vóór het opslaan); een scan die al `done` is blijft `done`. Een aanvraag met een oudere hash dan de huidige krijgt direct `202` met status `superseded`: geen job, geen herkenning, geen `logoResults`. Zonder `productId`: geen dedupe, geen supersede en geen `logo_current_image`-rij; de scan staat wel in `logo_scans`.
  - **Opruimen:** BullMQ Job Scheduler op eigen queue `logo-scan-cleanup`, dagelijks 03:40 Europe/Amsterdam, verwijdert rijen met `created_at` ouder dan 12 maanden.
  - **Tolerantie:** ontbreekt de tabel (P2021) of faalt de database, dan valt alles terug op het gedrag van Verhaal 1.2 (Redis, geen dedupe), met één waarschuwing voor een ontbrekende tabel en nooit een 500.
  - **Uitrolvolgorde (vast):** migratie `0022` moet VÓÓR de uitrol van deze code op ACC gecontroleerd zijn toegepast, want een push naar `acc` rolt automatisch uit; zonder tabel draait de code op Verhaal-1.2-gedrag. Om dedupe aan te zetten moet `LOGO_MODEL_VERSION` op ACC gezet zijn.
- **ml-service niet publiek (gecontroleerd 2026-10-06, vastgelegd in `logo-scans-wiring.test.ts`):** in `docker-compose.prod.yml` heeft ml-service geen `ports`, geen proxy-router en zit alleen op de netwerken `private` (intern) en `ml-egress`. In `docker-compose.acc.yml` en `.test.yml` heeft ml-service geen `ports` en geen Traefik-router (dus niet via de gateway gepubliceerd), maar draait met `network_mode: host` en luistert op `0.0.0.0:8011`; bereikbaarheid van buiten hangt daar af van de firewall van de host. Dat is NIET in de repository te bewijzen en is een open controlepunt voor de beheerder. `docker-compose.yml` en `.full.yml` zijn lokale ontwikkelstacks en publiceren poorten bewust.

#### logoResults v1 (Verhaal 1.5, AD-6)

Schema: `apps/api/src/schemas/logoResults.v1.json` (JSON Schema draft-07, `schemaVersion` `"1"`). Elke afnemer (n8n-controle, AI-Service, contracttest XML-dienst) bewaart een kopie met gelijke sha256 en weigert een onbekende hoofdversie. sha256: `3a9cb34efa69d3c10e4c63ddbb99062fbacae2df5d96af2ffce760d1f156a47c` (ook in `logoResults.v1.sha256` en `LOGO_RESULTS_SCHEMA_SHA256`; een test faalt als het bestand wijzigt zonder dat `.sha256` en de constante meegaan; werk deze regel dan ook bij). De worker valideert elke uitvoer tegen het schema (ajv); een ongeldige uitvoer wordt `failed` met reden `result_invalid`.

`logoResults = {schemaVersion, scanId, productId?, imageHash, status: ok|partial|failed|skipped, reason?, modelVersion, referenceVersion, policyVersion, signaalwoord?, zoekruimte?, detections[], items[]}`

- `status`: `ok` = scan klaar; `partial` (dan is geen enkel item `automatisch`, reden `classificatie_onvolledig`) = een deel van de regio's kreeg geen classificatie (`reason` `classification_incomplete`, de rest staat er wel in); `failed` = fout (`reason` `timeout|invalid_image|recognition_unavailable|result_invalid`, lege `items`); `skipped` wordt in dit verhaal niet gebruikt.
- `detections`: de ruwe classificatie-uitkomsten onveranderd (soortcode `t3777_code`, `confidence`, `method`, `bbox` in pixels, `evidence`, `reference_version`, ...).
- `item = {soort, uitkomststand: automatisch|voorstel|afgewezen, zekerheid, bbox:[x1,y1,x2,y2] (0-1), gs1:[{module,pad,veld,waarde}], groep?, bewijs}`. Alleen soorten uit de omzettabel (`gs1-mapping.json`) met stand niet `uit` krijgen een item; waarden zijn GS1-waarden, nooit interne codes (`NUTRISCORE_C` -> `nutritionalScore` `C` + `nutritionalProgramCode` `8`, samen in `groep` `nutritionalProgram`).
- GS1-waarden worden bij het bouwen getoetst aan de gecommitte codelijsten van GS1 Benelux datamodel 3.1.37.1 (`apps/api/src/services/gs1-codelists/`, Verhaal 1.6). Een soort met een waarde buiten die lijst krijgt geen item (de ruwe detectie blijft) en wordt gelogd als `ongeldige_gs1_waarde`. Regenereren: zie `apps/api/README.md`.
- Per soort een item (hoogste zekerheid); de andere detecties blijven alleen in `detections`. `bewijs = {methode, zekerheidssoort?, drempel, referentieversie, detectie (index in detections), redenen[], markeringen[]}`.
- `uitkomststand` = effectieve stand uit de omzettabel, maar `voorstel` bij zekerheid onder de drempel van de methode (sjabloon 0,85; embedding 0,80; classifier 0,90; nutriscore-head 0,80; nutriscore-a2 0,50 — dezelfde constanten als de kruischeck), bij `uncertain`/`requires_review`, bij gevaarsymbolen (ook op 0,99) en bij tegenstrijdigheid (twee items met dezelfde `groep` en hetzelfde `veld` maar een andere waarde, bv. twee Nutri-Score-letters). `redenen` noemt waarom (`tabelstand_voorstel`, `onder_drempel`, `twijfelachtig`, `ghs_plafond`, `versie_wijkt_af`, `tegenstrijdig`).
- `signaalwoord` komt alleen uit het POST-veld; een GHS-item zonder signaalwoord heeft in `bewijs.markeringen` `signaalwoord ontbreekt`.
- `modelVersion` komt uit de omgevingsvariabele `LOGO_MODEL_VERSION` (de ml-service geeft nu geen modelversie mee); ontbreekt die dan staat er `unknown` en geldt voor elk item `voorstel`. **Beperking:** wie een soort op `automatisch` zet moet `LOGO_MODEL_VERSION` bij elke modelwissel mee verversen; een verouderde waarde laat de versiecontrole van de omzettabel (AD-5) niets vangen. Echte oplossing: de ml-service de modelversie laten meesturen. `referenceVersion` = de verschillende `reference_version`-waarden uit de detecties, gesorteerd en met komma gescheiden (`unknown` zonder).
- De uitvoer is deterministisch: `detections` staan op zekerheid aflopend (dan bbox en code), items op soort; dezelfde detecties geven byte-gelijke uitvoer, ook bij een andere invoervolgorde. Per soort wint de hoogste ruwe zekerheid (AC), ook als een andere methode met lagere zekerheid wel boven haar eigen drempel zit.

Voorbeeld (Nutri-Score C, GHS02 met signaalwoord):

```json
{
  "schemaVersion": "1", "scanId": "6c1f…", "productId": "P1", "imageHash": "a67e…", "status": "ok",
  "modelVersion": "unknown", "referenceVersion": "r1", "policyVersion": "7dc7…", "signaalwoord": "DANGER",
  "detections": [ { "t3777_code": "NUTRISCORE_C", "confidence": 0.97, "method": "nutriscore-head", "bbox": {"x":100,"y":50,"width":200,"height":100}, "reference_version": "r1" } ],
  "items": [ {
    "soort": "NUTRISCORE_C", "uitkomststand": "voorstel", "zekerheid": 0.97, "bbox": [0.1, 0.1, 0.3, 0.3],
    "gs1": [
      {"module":"healthRelatedInformationModule","pad":"healthRelatedInformation/nutritionalProgram","veld":"nutritionalScore","waarde":"C"},
      {"module":"healthRelatedInformationModule","pad":"healthRelatedInformation/nutritionalProgram","veld":"nutritionalProgramCode","waarde":"8"}
    ],
    "groep": "nutritionalProgram",
    "bewijs": {"methode":"nutriscore-head","drempel":0.8,"referentieversie":"r1","detectie":0,"redenen":["tabelstand_voorstel","versie_wijkt_af"],"markeringen":[]}
  } ]
}
```

### Nieuwe endpoints (API gateway, `apps/api`)

Routes in `apps/api/src/api/v1/pipeline.ts`.

| Endpoint | Methode | RBAC | Beschrijving |
|----------|---------|------|--------------|
| `/api/v1/pipeline/notifications` | GET | — (geen guard) | Lijst retraining-trigger-notificaties, ongelezen eerst (`status` oplopend — `'read'` < `'unread'` alfabetisch, dus ongelezen bovenaan), dan `createdAt` aflopend. Gepolld door de frontend bij mount zodat ook offline managers eerder verstuurde triggers nog zien (Story 9.2, AC3) → `200 { data: RetrainingNotification[] }`; `500` bij DB-fout. |
| `/api/v1/pipeline/notifications/:id/read` | PATCH | — (geen guard) | Markeert één notificatie als gelezen (`status='read'`, `readAt=now`) → `200` met het bijgewerkte record; `404` bij onbekend id; `500` bij DB-fout. |
| `/api/v1/pipeline/jobs/:jobId` | GET | — (geen guard) | Status van een BullMQ-pipelinejob via `getJobStatus(jobId)`. Geeft o.a. `state`, en voor gefaalde jobs `failedReason` + een `retryable`-vlag (Story 9.1, AC2) → `200 { ... }`; `404` met code `JOB_NOT_FOUND` wanneer de `jobId` onbekend is (state `not_found`); `500` bij interne fout. |
| `/api/v1/pipeline/training/start` | POST | ADMIN | Start handmatig een volledige training-flow (Story 9.3). Body `{ triggerId?, batchId? }` (default `triggerId = manual-{timestamp}`). Idempotentie/concurrency=1 (AC3): wanneer er al een flow actief is (`getActiveTrainingFlowJobId()`) volgt `409` met code `TRAINING_FLOW_ACTIVE` + `activeJobId`. Anders draait `submitTrainingFlow()` de FlowProducer-keten (incorporate-feedback → build-batch → train-model → evaluate-model) → `202` met het flow-resultaat; `500` bij fout. **Let op:** de route in de code heet `/pipeline/training/start` (niet `/pipeline/training-flow`). |

Routes in `apps/api/src/api/v1/training.ts` (Models-tag).

| Endpoint | Methode | RBAC | Beschrijving |
|----------|---------|------|--------------|
| `/api/v1/models/approval-queue` | GET | — (geen guard) | Lijst challengers die de quality-gate haalden en op menselijke goedkeuring wachten (Story 9.5, AC1/AC2). Filter: `isActive === false` **en** `metrics.gate.passed === true` (Prisma JSONB-path-filter), nieuwste eerst. Per challenger wordt een `evaluationReport` opgebouwd t.o.v. de actieve champion: `{ challenger: { holdoutAccuracy, holdoutHash }, champion: { holdoutAccuracy } \| null, diff: { accuracy } \| null, datasetGrowth: null, triggerReasons: string[] }` → `200 { data: [...] }`; `500` bij DB-fout. (`datasetGrowth` is bewust `null` — gepland voor een volgende iteratie.) |
| `/api/v1/models/:modelId/activate` | POST | menselijk vereist | **Uitgebreid (Story 9.5, NFR5/NFR6).** Activatie vereist altijd een menselijke beslissing. **Service-accounts** (geldige `x-api-key` t.o.v. `PIPELINE_SERVICE_KEY`, gecontroleerd met `isServiceRequest()` / `crypto.timingSafeEqual`) krijgen `403` (AC3, NFR5). **Anonieme** aanroepen zonder geauthenticeerde gebruiker (`request.user.userId` ontbreekt) krijgen `401 UNAUTHORIZED` — dit voorkomt een audit-rij met `userId:'unknown'`, omdat `main.ts` geen globale auth-hook mount. Bij succes roept de route `mlClient.activateModel(modelId)` aan en schrijft een **ModelActivationLog** (`modelVersionId`, `userId`, `triggeredBy: 'manual-approval'`, `activatedAt`) (AC4, NFR6) → `200 { message, model_id }`. |

### Nieuw endpoint (ML-service, `apps/ml-service`)

Route in `apps/ml-service/app/api/pipeline.py`, geregistreerd onder prefix `/ml`.

| Endpoint | Methode | Beschrijving |
|----------|---------|--------------|
| `/ml/pipeline/build-synthetic-batch` | POST | **(Story 9.3, AC4)** Plant een synthetische batch-fill voor ondervertegenwoordigde keurmerkklassen — de wiring van de uitgestelde 8.7-hook. Body `{ min_per_class, real_synthetic_ratio }` (`min_per_class` 1–10000, `real_synthetic_ratio` >0–10). Thin REST-wrapper rond `build_synthetic_batch(..., persist=False)` — **compute-only**: een planningsaanroep schrijft nooit PNG's (echte generatie + MinIO-persistentie loopt via `/ml/artwork/synthesize`). De platte planner-output wordt gesplitst in `{ batches: [...], shortfall_reported: { "<label>": <count> } }`: shortfall-entries worden per label gesommeerd, alle overige crop-descriptors gaan naar `batches`. De ratio-cap wint van `min_per_class` (residueel tekort wordt gerapporteerd, nooit met synthetische ruis opgevuld — conflict-resolutie 2026-06-04). "Niets te vullen" is een `200` met lege resultaten; alleen een echte fout geeft `500`. Aangeroepen door de Node-pipeline via `mlClient.buildSyntheticBatch()` in de build-batch-stap. |
