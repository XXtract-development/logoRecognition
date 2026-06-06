# Story 8.1: Artwork-import via mediaserver met caching

Status: ready-for-dev

## Story

As a datamanager,
I want dat het systeem etiket-artwork automatisch ophaalt uit de media-tabel via het mediaserver-endpoint en lokaal cachet,
so that de detectie-pipeline een betrouwbare, eigen voorraad artwork heeft zonder afhankelijkheid van de NAS op verwerkingsmoment.

## Acceptance Criteria

1. **Import met caching (FR44, NFR7):** Given media-records met typeInfo=PACKAGING_ARTWORK, When de import-job draait voor een batch GTINs, Then worden bestanden opgehaald via het mediaserver-endpoint en opgeslagen in MinIO met metadata (gtin, gln, orderNumber, fileName, hash) And worden reeds geïmporteerde media-items **op mediaId/sourceLocation overgeslagen vóór de download** (de sha256 wordt ná download berekend en dient als integriteitsverificatie van de cache — niet als download-besparing, want een hash ken je pas na het downloaden).
2. **Zacht falen:** Given een onbeschikbaar bestand of endpoint-fout, When de import dit detecteert, Then wordt het item gemarkeerd met foutreden en gaat de batch verder And zijn mislukte items zichtbaar in de jobstatus en herstartbaar.
3. **Traceerbare verwerkingsstatus:** Given een succesvol geïmporteerd bestand, Then wordt de status vastgelegd in een eigen tabel (de media-tabel wordt NIET gemuteerd zonder afstemming met het mediaserver-team).

## Tasks / Subtasks

- [ ] Task 1: Datamodel `ArtworkImport` (AC: 1, 3)
  - [ ] Prisma-model: id, gtin, gln, mediaId (extern id uit media-tabel), fileName, sourceLocation, sha256Hash, storagePath (MinIO), status (imported/failed/skipped), failureReason?, importRunId, createdAt; `@@unique([mediaId])`, indexes op gtin + importRunId
  - [ ] Migratie `0005_add_artwork_imports` + init.sql synchroon (⛔ nooit migrate op containers; zie deploy-les hieronder)
- [ ] Task 2: Mediaserver-bron ontsluiten (AC: 1)
  - [ ] **GEVERIFIEERD CONTRACT (2026-06-04, live getest op acc):**
    - Discovery per GTIN: `GET {MEDIASERVER_DOMAIN}/uploaded?gtin={gtin}` → `{ gln, gtin, active: [{id, fileName, previewUrl, typeInfo, active, createdAt}], inactive: [...] }`; endpoint filtert intern op `service='LABEL'` — PACKAGING_ARTWORK-records hébben service LABEL, dus dit dekt onze use-case
    - Bestand: `GET {MEDIASERVER_DOMAIN}{previewUrl}` → het bestand (getest: 200, image/jpeg 5,9MB). previewUrl = sourceLocation-pad: `/{gln}/PACKAGING_ARTWORK/{ts}/.../{sha256}.{ext}`
    - Domeinen: acc `https://media.acc.xxtract.com`, prod via env `MEDIASERVER_DOMAIN`
  - [ ] Voor bulk-GTIN-lijsten: lees de GTIN-set uit `xxtractdbmedia.media` (alleen-lezen MySQL, zie env `MEDIASERVER_URL`-conventie in mediaserver-repo) óf accepteer een aangeleverde GTIN-lijst in de request-body — implementeer het laatste eerst (geen extra DB-koppeling), documenteer het eerste als vervolgoptie
  - [ ] Filter response-items op `typeInfo === 'PACKAGING_ARTWORK'` (het endpoint geeft ook andere LABEL-typen terug)
- [ ] Task 3: API-routes `apps/api/src/api/v1/artwork-pipeline.ts` (AC: 1, 2)
  - [ ] **Nieuw bestand**, export `artworkPipelineRoutes`, registreren in `main.ts` (zelfde patroon als reference-logos.ts uit Epic 7)
  - [ ] **RBAC:** muterende endpoints (POST runs) vereisen rol ADMIN via bestaande `requireRole`-middleware → 403 voor anderen (ATDD-test aanwezig); GET-status mag elke ingelogde gebruiker
  - [ ] `POST /artwork-import/runs` body `{ gtins?: string[] }` → **202** `{ runId }` — verwerking via een **DB-persistente run** (ArtworkImportRun-record met heartbeat-timestamp; elke item-statuswijziging direct persistent). ⚠️ Bewuste beperking: de uitvoerende loop is in deze story nog een in-proces async-taak; daarom verplicht: **stale-run-detectie** (run zonder heartbeat > `IMPORT_RUN_STALE_MINUTES`, default 10 → status 'failed' met reden 'stale') zodat een API-crash nooit een eeuwige 'running' achterlaat, en een re-POST met dezelfde GTINs pakt ontbrekende/gefaalde items op (hervatbaar by design). Epic 9 verplaatst de uitvoering naar de BullMQ-flow — interface ongewijzigd
  - [ ] `GET /artwork-import/runs/:runId` → `{ status: 'running'|'completed'|'failed', imported, skipped, failed: [{gtin, reason}] }`; **onbekende runId → 404** (ATDD-test aanwezig); `skipped` is een verplicht veld
  - [ ] **Dedup vóór fetch:** per /uploaded-item: bestaat ArtworkImport met dat mediaId (status imported) → `skipped++`, géén download. Na download: sha256 berekenen en opslaan; wijkt de hash af van een eerder record met zelfde mediaId → opnieuw importeren (bestand gewijzigd aan de bron)
  - [ ] **Delta-strategie (throughput):** default verwerkt een run alleen GTINs/media-items zonder imported-record; `{ force: true }` in de body dwingt re-check af. Concurrency env `ARTWORK_IMPORT_CONCURRENCY` (default 3). Verwachte volumes documenteren in de run-log: 12.498 GTINs ≈ 12,5k discovery-calls — een volledige eerste import is een meerdaagse/nachtelijke operatie; plan via het Epic 9-venster zodra beschikbaar
  - [ ] MinIO-opslag via storage-service: nieuw `uploadArtwork(buffer, path, mime)` naast bestaand `uploadReferenceLogo` (storage.ts:309) — zelfde TRAINING-bucket, prefix `artwork/{gtin}/{fileName}`. **Retentie:** prefix-conventie vastleggen in deploy-notes (artwork/ = cache, herproduceerbaar vanaf de bron; mag bij nood geleegd; nooit prefix-delete buiten artwork/)
- [ ] Task 4: Tests groen (alle ACs)
  - [ ] `.skip` weg: **5** tests in `apps/api/src/__tests__/api/artwork-pipeline.routes.test.ts` (describe 'POST /artwork-import/runs': start/failures/dedup-rerun/404/403) — mock de mediaserver-HTTP-calls (vi.mock op mediaserver-client), nooit echte calls; de tests hebben een arrange-fase (startRun-helper) en zijn zelfstandig uitvoerbaar
  - [ ] mock-data.ts uitbreiden met artworkImport-mock; `prisma generate` na schema-wijziging

## Dev Notes

### ⚠️ Epic 7-learnings (verplicht toepassen)

1. **Dubbele schema-bron:** Prisma-schema ÉN `infrastructure/docker/postgres/init.sql` beide bijwerken — de ML-service leest via asyncpg raw SQL
2. **Deploy-les van 2026-06-04:** het deployproces draait GEEN Prisma-migraties. Na merge: migratie handmatig op Cherry (`ssh cherry, sudo -u postgres psql -d logo_recognition`) én **GRANT niet vergeten**: `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE artwork_imports TO logorecognition;` (Epic 7 faalde hier eerst op: "permission denied")
3. **JSONB:** altijd `json.dumps`/Prisma-Json — nooit `str()` (Epic 7 review-finding #1)
4. **ATDD = contract:** response-shapes exact volgens artwork-pipeline.routes.test.ts; error-teksten route-level `{ error: '...' }`
5. **Externe caller-conventie:** mediaserver-calls in een eigen service-module (`apps/api/src/services/mediaserver-client.ts`) met timeout + nette foutafhandeling — volg het ml-client.ts-patroon (axios, logging, MLServiceError-equivalent)

### Bestaande code als referentie

| Referentie | Waarvoor |
|-----------|----------|
| `apps/api/src/services/ml-client.ts` | extern-service-client-patroon (axios, timeouts, errors) |
| `apps/api/src/api/v1/reference-logos.ts` (Epic 7) | nieuw routebestand + registratie + storage-gebruik + 409/400-afhandeling |
| `apps/api/src/services/storage.ts:309-323` | uploadReferenceLogo als sjabloon voor uploadArtwork |
| `~/Documents/projects/mediaserver/src/routes/routes.js:603-668` | het /uploaded-endpoint (bron-contract) |

### Beveiliging & operations

- `MEDIASERVER_DOMAIN` als env (acc-default `https://media.acc.xxtract.com`); /uploaded bleek zonder API-key bereikbaar — geen auth-handshake nodig, wel rate-bewust importeren (sequentieel per GTIN, configureerbare concurrency, default 3)
- NFR7: na import is de pipeline MinIO-only; geen runtime-afhankelijkheid van de mediaserver

### Project Structure Notes

- Route + service zijn nieuw (nieuwe resource); geen wijzigingen aan bestaande routes
- Conflict-check: tabelnaam `artwork_imports` vrij (gegrept in schema + init.sql)

### References

- [Source: epics.md#Story 8.1] · [Source: atdd-checklist-epic-8-9.md — module-contract] · [Source: research-rapport Bevinding 4/6 — media-tabel & naamconventies] · [Source: architecture.md#API & Communicatie]

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
