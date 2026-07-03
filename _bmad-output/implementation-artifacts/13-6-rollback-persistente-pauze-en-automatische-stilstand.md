# Story 13.6: Rollback, persistente pauze en automatische stilstand

Status: done

<!-- Aangemaakt via create-story workflow, 2026-07-02. Bron: epics-vliegwiel.md Epic 13 / Story 13.6 + ARCHITECTURE-SPINE (AD-3, AD-5, AD-11, AD-13, AD-15; ARCH-2, ARCH-4). Vereist: 13.2 (kandidaten/hard_negatives/events), 13.4 (batches/worker), 13.5 (poort/baseline) afgerond. Sluit Epic 13 backend-compleet af. -->

## Story

Als **datamanager**
wil ik **een gepromoveerde batch als geheel kunnen terugdraaien en de zekerheid dat het vliegwiel zichzelf stillegt bij herhaald falen**
zodat **geen enkele fout onomkeerbaar of onopgemerkt is**.

### Afbakening (kritiek)

- **Backend-only**: rollback-endpoint, pauze-state en stilstand-logica. De UI (Historie-tab, pauzeknop, banners) is Epic 15 (Stories 15.2/15.4); notificaties lopen via het bestaande patroon zodat het vliegwiel ook zónder dashboard veilig is (epic-doel).
- **Rollback is géén poort-executie** (AD-15-verduidelijking): het is een toegestane, gelogde statusmutatie via endpoint. Soft-delete, nooit DELETE.
- De pauze-scope is precies (AD-11): nominatie-inserts en batch-verwerking stoppen; live-detectie, trainingsdata-registratie, outlier-audit (read-only) en dashboard-reads lopen door. Onderdelen outlier-audit en `flywheel-bootstrap` van AC 5 zijn pas volledig testbaar zodra Story 14.3 resp. 17.1 bestaan — bouw de check zó dat die jobs hem bij hun geboorte alleen hoeven aan te roepen (bewuste vooruitverwijzing uit de epics).

## Acceptatiecriteria

1. **Migratie met toestemming (ARCH-2).** Given de nieuwe Prisma-migratie voor `system_settings` (key/value, persistente pauze), when de migratie wordt voorbereid, then wordt deze ter expliciete goedkeuring voorgelegd (met gedocumenteerd terugdraaipad/down-script).
2. **Batch-rollback.** Given een gepromoveerde batch, when de datamanager rollback uitvoert (service + endpoint `batches/:id/rollback` — een toegestane, gelogde statusmutatie conform de AD-15-verduidelijking, géén poort-executie; UI volgt in Epic 15), then worden alle referenties van de batch `active=false` (soft-delete; nooit DELETE), matcht geen detectie er meer tegen, krijgt de batch status `rolled_back`, en valt de vergelijkings-baseline automatisch terug op de laatst overgebleven `passed`-batch (FR-4, AD-3, AD-5), **en** is de rollback herleidbaar in het evidence-contract (wie, wanneer, waarom) (NFR-1, AD-13).
3. **Baseline-invalidatie bij elke buiten-promotie-mutatie.** Given élke mutatie van de actieve referentieset buiten batch-promotie om (handmatige curatie/upload, outlier-deactivatie, rollback — óók van een niet-recente batch — of legacy-12.3-registratie zolang de hoofdvlag uit staat), when de mutatie plaatsvindt, then wordt de baseline als verouderd gemarkeerd, zodat de eerstvolgende poortrun met een verse nulmeting op de actuele actieve set begint (Story 13.5; AD-5).
4. **Automatische stilstand (K=2).** Given K=2 opeenvolgende gequarantaineerde batches, when de tweede quarantaine valt, then pauzeert het systeem zichzelf (persistent in `system_settings`; een herstart heft de pauze niet op) en ontstaat een notificatie met de aanleiding (FR-19, AD-11).
5. **Pauze-scope.** Given de pauzestand actief, when nominatie-hooks of de jobs `flywheel-promotion`/`flywheel-bootstrap` draaien, then ontstaan er geen nieuwe kandidaten en promoveert niets, terwijl live-detectie, trainingsdata-registratie, outlier-audit (read-only) en dashboard-reads gewoon doorlopen; hervatten vereist een expliciete actie (FR-19, AD-11). *(Noot uit de epics: de onderdelen outlier-audit en `flywheel-bootstrap` zijn pas volledig testbaar zodra Story 14.3 resp. 17.1 bestaan — bewuste vooruitverwijzing.)*
6. **Hard-negative-export, uitsluitend menselijke categorie.** Given de verzameling hard-negatives, when de datamanager exporteert, then is de set exporteerbaar als trainingsmateriaal voor de gate en filtert de export uitsluitend op de menselijk afgewezen categorie (quarantaine-afkeuring, reviewstation-reject wegens "geen keurmerk") — zacht afgewezen kandidaten (cap/duplicaat/outlier) zitten er per definitie niet in, want die krijgen geen hard-negative-rij (FR-9, AD-12).

## Tasks / Subtasks

- [ ] 1. **Prisma-migratie (EXPLICIETE TOESTEMMINGSTAAK, ARCH-2)** (AC: 1)
  - [ ] 1.1 Model `SystemSetting` conform Structural Seed: `key` PK (`String @db.VarChar(...)`), `value Json @default("{}")`, `updatedAt @db.Timestamptz`, `updatedBy`; `@@map("system_settings")`. Minimaal houden (AD-11: "nieuwe, minimale key/value-tabel").
  - [ ] 1.2 Down-script (drop tabel) schrijven en documenteren; migratie ter goedkeuring voorleggen; NOOIT zelf uitvoeren (handmatig `prisma migrate deploy` na akkoord — operationele envelope §2).
- [ ] 2. Rollback `apps/api/src/services/flywheel/rollback.ts` + endpoint (AC: 2)
  - [ ] 2.1 Service: in één transactie — alle `ReferenceLogo`-rijen van de batch (via `reference_candidates.referenceLogoId`, status `promoted`) op `active=false` (soft-delete; het bestaande `active`-filter in matcher-query's ml-side en API-side zorgt dat er niets meer tegen matcht, AD-3); batch-status `passed → rolled_back` als conditional update; rollback-record (wie/wanneer/waarom, verplicht redenveld) in batch-evidence/`gateResults` (AD-13).
  - [ ] 2.2 Endpoint `POST /api/v1/flywheel/batches/:id/rollback` in `apps/api/src/api/v1/flywheel.ts` (13.2-skelet): body `{ reason: string }` (verplicht), auth via bestaande middleware; 404 onbekende batch, 409 als status ≠ `passed`. Géén poort-executie in het request-pad — alleen deze statusmutatie (AD-15-verduidelijking).
  - [ ] 2.3 Baseline-terugval: geen aparte actie nodig — 13.5 selecteert de baseline als "meest recente `passed`-batch" en `rolled_back` telt nooit mee (AD-5); wél baseline-invalidatie triggeren (taak 3), want de actieve set is gemuteerd. Her-promotie-pad bewaken: her-promotie na rollback krijgt een nieuw variantLabel (AD-3) — geen schema-werk, wel een test.
  - [ ] 2.4 Best-effort template-/embedding-cache-verversing ml-side na rollback (`MLClient.reloadTemplates`, ml-client.ts:417) zodat gedeactiveerde referenties direct uit de detectie verdwijnen.
- [ ] 3. Baseline-invalidatie-triggers (AC: 3)
  - [ ] 3.1 `services/flywheel/baseline.ts` (13.5-abstractie) koppelen aan `system_settings` (key bv. `flywheel.baselineStale`: `{ stale: true, reason, at, by }`); `markBaselineStale(reason)` + `consumeBaselineStale()` (poortrun leest en reset ná de verse nulmeting).
  - [ ] 3.2 Triggers aanbrengen op alle vier de mutatiepaden: (a) rollback (taak 2); (b) handmatige curatie/upload — de schrijfpaden in `apps/api/src/api/v1/reference-logos.ts` (creatie/activatie/deactivatie van referenties); (c) outlier-deactivatie — landt in Epic 15 (`outliers/:id/decision`); exporteer de marker-functie zodat die story hem aanroept, en documenteer dit contract; (d) legacy-12.3-registratie zolang de hoofdvlag uit staat — de twee aanroepplekken `apps/api/src/api/v1/artwork-pipeline.ts:1058` en `:1165` (na een geslaagde `registerReference` met `added=true` de marker zetten).
- [ ] 4. Persistente pauze + K=2-stilstand `apps/api/src/services/flywheel/pause.ts` (AC: 4, 5)
  - [ ] 4.1 Pauze-state in `system_settings` (key bv. `flywheel.paused`: `{ paused: bool, reason, since, by }`); helpers `isPaused()` (met korte cache), `pause(reason, by)`, `resume(by)`. Herstart heft niets op — de bron is de database, nooit process-state (AD-11).
  - [ ] 4.2 K=2-detectie in het 13.5-quarantaine-pad: tweede opeenvolgende `quarantined`-batch (teller/lookup op de laatste twee afgesloten batches) → `pause(reason='automatische stilstand: 2 opeenvolgende quarantaines')` + notificatie via het RetrainingNotification-patroon (trigger.ts:141-mechaniek, reason-code `flywheel-auto-paused`) mét aanleiding (batch-ids). K als env-config `FLYWHEEL_AUTO_PAUSE_K` default 2.
  - [ ] 4.3 Pauze-checks aanbrengen: (a) nominatie-service 13.2 — `isPaused()` → weigeren mét gemiste-nominatie-event reden `pauze` (het 13.2-event-mechanisme heeft deze reden al); (b) job `flywheel-promotion` — check bij job-start, gepauzeerd → run overslaan (log + geen batch-werk); (c) job `flywheel-bootstrap` (17.1) — zelfde check-functie, contract documenteren; (d) NIET blokkeren: live-detectie, trainingsdata-registratie, outlier-audit (14.3, read-only), dashboard-reads (AD-11-scope).
  - [ ] 4.4 Service-contract voor pauze/hervatten: 13.6 levert alléén de service (`pause.ts`: `isPaused()`/`pause()`/`resume()` + `system_settings`-persistentie); hervatten is een expliciete service-actie met gebruiker+tijdstempel gelogd. Het HTTP-endpoint `POST /api/v1/flywheel/pause`/resume + de `threshold_changes`-logging zijn eigendom van Story 15.4 (die bouwt endpoint + UI op deze service); pauze-status wel opnemen in de overview-response.
- [ ] 5. Hard-negative-export (AC: 6)
  - [ ] 5.1 Export-endpoint (bv. `GET /api/v1/flywheel/hard-negatives/export`, JSON/CSV met contentHash, t3777Code, cropPath, reason, createdAt): filtert op de menselijke reden-categorie (`quarantaine-afkeuring`, `reviewstation-geen-keurmerk` — leg de reden-enum vast in `services/flywheel/`-types zodat 14.1/15.3 dezelfde waarden schrijven). Defensief filteren óók al horen er per AD-12 geen andere rijen te bestaan.
  - [ ] 5.2 Export bevat uitsluitend eigen crop-paden — nooit GS1-gidsbeelden (NFR-6/conventie GS1-gidsbeelden).
- [ ] 6. Tests (zie testrichtlijnen) (AC: 2–6)
- [ ] 7. versions.md zelfde commit; Engelse commit; ghcr-workflow vóór Coolify-deploy; deploy-volgorde ml-service → api → web (alleen api geraakt tenzij cache-verversing ml-wijziging vergt); migratie handmatig na akkoord

## Dev Notes — Developer Context

### Bindende AD's

| AD | Essentie voor deze story |
|---|---|
| **AD-3** | Rollback-mechaniek: `active=false` op de gepromoveerde referenties van de batch (bestaand soft-delete-patroon dat matcher-queries al filteren); nooit DELETE; her-promotie na rollback krijgt een nieuw variantLabel. |
| **AD-5** | Baseline-eigenaarschap: vergelijkings-baseline = meest recente `passed`-batch; `rolled_back` telt nooit mee → rollback herstelt de baseline automatisch. Baseline-invalidatie: élke mutatie buiten batch-promotie om markeert de baseline verouderd → verse nulmeting bij de eerstvolgende poortrun. |
| **AD-11** | Pauze persistent in de database (herstart heft niet op); scope: nominatie-inserts + batch-verwerking (promotion én bootstrap, check bij job-start) geblokkeerd; read-only werk (outlier-audit, dashboard) draait door; stilstand-notificatie via RetrainingNotification-patroon + dashboard-banner (banner = Epic 15). `system_settings` bestaat nog niet (geratificeerd tegen de code) — deze story maakt hem aan. |
| **AD-13** | Rollback herleidbaar: wie/wanneer/waarom in evidence; flat-audit-patroon `model_activation_logs`. |
| **AD-15** | Rollback is een toegestane, gelogde statusmutatie via endpoint — géén poort-executie in het request-pad. |
| **AD-12** | Hard-negatives ontstaan uitsluitend bij menselijke afkeuring — de export filtert op precies die categorie (FR-9). |
| **ARCH-2 / ARCH-4** | Migratie-toestemming + down-script; notificaties via het bestaande patroon. |

### Wat er AL bestaat (hergebruiken, niet herbouwen)

| Bouwsteen | Waar | Relevantie |
|---|---|---|
| Soft-delete-filter op referenties | `apps/api/prisma/schema.prisma` — `ReferenceLogo.active` :257; matcher-/template-paden filteren op `active=true` (o.a. `artwork.py:74 _load_reference_templates`, pgvector-classify) | Rollback hoeft alléén `active=false` te zetten — matching stopt vanzelf (AD-3). |
| Batch- en kandidaat-state | Stories 13.4/13.5: `promotion_batches` (status/gateResults/baselineMeasurement), `reference_candidates.referenceLogoId` (gezet bij promotie) | Bepaalt wélke referenties bij de batch horen (taak 2.1). |
| Baseline-abstractie | Story 13.5: `apps/api/src/services/flywheel/baseline.ts` (marker-lees-kant) | Deze story levert de schrijf-kant + `system_settings`-bron. |
| Gemiste-nominatie-events (reden `pauze`) | Story 13.2, nominatie-service | Pauze-check hoeft alleen de bestaande event-route met reden `pauze` te voeden. |
| Notificatie-patroon | `apps/api/src/services/pipeline/trigger.ts:141 notifyRetrainingRecommended` + `RetrainingNotification` (schema.prisma:478–487) | Stilstand-notificatie (AC 4). |
| Audit-log-patroon | `ModelActivationLog` (schema.prisma:492–502; entiteit-FK, userId, tijdstempel) | Stijlvoorbeeld voor wie/wanneer/waarom-vastlegging (AD-13). |
| Referentie-curatie-routes | `apps/api/src/api/v1/reference-logos.ts` | Invalidatie-trigger (b) — de bestaande schrijfpaden op de actieve set. |
| Legacy-12.3-plekken | `apps/api/src/api/v1/artwork-pipeline.ts:1058` en `:1165` (`mlClient.registerReference`) | Invalidatie-trigger (d), zolang de hoofdvlag uit staat. |
| Routebestand + overview | Story 13.2: `apps/api/src/api/v1/flywheel.ts`, registratie in `main.ts:125–134` | Rollback-/pause-/export-endpoints landen hier. |
| Cache-verversing | `MLClient.reloadTemplates` (ml-client.ts:417) → `artwork.py:121` | Direct effect van rollback op detectie (taak 2.4). |

### Wat er NIEUW is (de eigenlijke story)

1. Prisma-migratie `system_settings` (+ down-script; goedkeuringsflow).
2. `apps/api/src/services/flywheel/rollback.ts` + endpoint `batches/:id/rollback`.
3. `apps/api/src/services/flywheel/pause.ts` (persistente pauze-service: isPaused/pause/resume, K=2-stilstand, checks in nominatie + jobs). De HTTP-endpoints pause/resume zijn 15.4-eigendom.
4. Baseline-invalidatie-schrijfkant (`markBaselineStale`) + triggers op de vier mutatiepaden.
5. Hard-negative-export-endpoint met menselijke-categorie-filter.

### Guardrails (voorkom bekende fouten)

- **Migratie = toestemmingsmoment (ARCH-2)**: voorbereiden mag, uitvoeren alleen Friso, handmatig, met down-script; nooit `migrate` in tests tegen containers.
- **Nooit DELETE op referenties** — soft-delete is het contract; DELETE breekt herleidbaarheid én de `@@unique`-garantie voor her-promotie (AD-3).
- **Pauze-scope niet oprekken**: live-detectie en trainingsdata-registratie NOOIT blokkeren; een pauze die de verkeerde jobs raakt was adversarial finding F8 (AD-11).
- **Pauze-bron is de database**, nooit een in-memory vlag of env var — herstart-persistentie is een expliciete AC. Korte read-cache mag, met invalidatie bij pause/resume.
- **Rollback-endpoint draait geen poortwerk** — geen hermeting, geen guardrails; alleen statusmutatie + logging (AD-15). De verse nulmeting gebeurt vanzelf bij de eerstvolgende worker-run via de stale-marker.
- **Export filtert menselijk-only** én bevat nooit gids-beelden (NFR-6) — uitsluitend eigen crop-paden.
- **Vooruitverwijzingen netjes**: check-functies voor bootstrap (17.1) en outlier-decision (15.x) exporteren + contract documenteren, niet die stories half bouwen.
- Commits Engels; versions.md zelfde commit; ghcr vóór Coolify; e2e buiten de stable-subset-gate.

### Testrichtlijnen

- **Unit (vitest, apps/api)**: rollback-service (alle batch-referenties inactief; conditional update `passed → rolled_back`; 409-pad bij niet-passed; evidence bevat wie/wanneer/waarom; reason verplicht); pauze-helpers (persist/lees; resume logt gebruiker+tijd); K=2-detectie (1 quarantaine → geen pauze; 2 opeenvolgende → pauze + notificatie; passed ertussen reset de reeks); baseline-stale-marker gezet op alle vier triggerpaden; export-filter (zachte-reden-rij — kunstmatig geïnjecteerd — komt er niet doorheen; menselijke redenen wel; geen gids-paden).
- **Integratie (vitest)**: route-flow `batches/:id/rollback` (auth, 404/409, happy path incl. baseline-stale + cache-reload-aanroep op gemockte MLClient); pause/resume-endpoints; nominatie-service met pauze aan → event reden `pauze`, geen kandidaat-rij; `flywheel-promotion`-job met pauze aan → run overgeslagen, geen batch aangemaakt; baseline-terugval end-to-end met 13.5-gate (rolled_back genegeerd als baseline-bron).
- **Pytest**: n.v.t. (ml-service ongewijzigd; cache-reload is een bestaand endpoint).
- E2E: buiten de stable-subset-gate.

### Project Structure Notes

- Conform spine source-tree: `apps/api/src/services/flywheel/` (rollback.ts, pause.ts, baseline.ts-uitbreiding), endpoints in `apps/api/src/api/v1/flywheel.ts` (`batches/:id/rollback` en `pause` staan letterlijk in de Structural Seed-endpointlijst).
- Variance: het export-pad (`hard-negatives/export`) staat niet in de seed-endpointlijst — payload-/padcontracten zijn per spine-Deferred story-niveau; kies het pad binnen `/api/v1/flywheel/` en documenteer het in het Dev Agent Record.

### References

- [Source: _bmad-output/planning-artifacts/epics-vliegwiel.md#Story 13.6]
- [Source: ARCHITECTURE-SPINE.md#AD-3 (rollback-mechaniek), #AD-5 (baseline-terugval/-invalidatie), #AD-11 (pauze-scope, system_settings), #AD-12 (export-filter), #AD-13, #AD-15 (rollback-verduidelijking), #Constraints, #Operationele envelope, #Structural Seed (system_settings, endpoints)]
- [Source: prd.md#FR-4, #FR-9 (export), #FR-19 (backend); #7 Success Metrics (SM-5-context: stilstand binnen 1 werkdag opgevolgd)]
- [Source: _bmad-output/implementation-artifacts/13-2-*.md (events reden `pauze`), 13-5-*.md (baseline-abstractie, quarantaine-pad)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (implement-sprint, epic-13 worktree).

### Debug Log References

- Migratie 0015 lokaal toegepast via `prisma migrate deploy` op `localhost:5432/logo_recognition` (DB-veiligheid geverifieerd; alleen 0015 pending). Tabel `system_settings` bevestigd via `\d`.
- Volledige apps/api vitest-suite: 445 passed / 2 skipped (447), +39 t.o.v. baseline (406).

### Completion Notes List

- Rollback is een gelogde statusmutatie (AD-15) — geen poortlogica in het request-pad; soft-delete (`active=false`), nooit DELETE.
- Baseline-terugval leunt op het bestaande 13.5-gedrag (`WHERE status='passed'`, `rolled_back` telt niet mee); rollback markeert daarnaast de baseline stale.
- Pauze + baseline-stale + K=2-teller persistent in `system_settings` via de generieke `system-settings.ts`-store (korte read-cache, invalidatie bij schrijf).
- Pauze-scope precies: check alleen in nominatie-insert en `runPromotionLoop` (job-start). `shouldSkipForPause` is het gedeelde contract voor `flywheel-bootstrap` (17.1). Read-only paden ongemoeid.
- Reden-enum voor de hard-negative-export vastgelegd in `services/flywheel/types.ts` (`HUMAN_HARD_NEGATIVE_REASONS`) zodat 14.1/15.3 dezelfde waarden schrijven.
- Outlier-deactivatie-trigger (15.x): `markBaselineStale` geëxporteerd + contract gedocumenteerd in `baseline.ts` — die story roept hem bij zijn geboorte aan.
- Variance: het export-pad `GET /api/v1/flywheel/hard-negatives/export` staat niet in de seed-endpointlijst; gekozen binnen `/api/v1/flywheel/`.
- HTTP pause/resume-endpoints bewust NIET gebouwd — 15.4-eigendom; wel pauze-status in de overview-response.

### File List

Nieuw:
- apps/api/prisma/migrations/0015_add_system_settings/{migration.sql,down.sql}
- apps/api/src/services/flywheel/system-settings.ts
- apps/api/src/services/flywheel/pause.ts
- apps/api/src/services/flywheel/rollback.ts
- apps/api/src/services/flywheel/hard-negative-export.ts
- apps/api/src/__tests__/services/flywheel-pause.test.ts
- apps/api/src/__tests__/services/flywheel-pause-scope.test.ts
- apps/api/src/__tests__/services/flywheel-baseline-write.test.ts
- apps/api/src/__tests__/services/flywheel-rollback.test.ts
- apps/api/src/__tests__/services/flywheel-hard-negative-export.test.ts
- apps/api/src/__tests__/api/flywheel-rollback-export.routes.test.ts
- _bmad-output/implementation-artifacts/{review-13-6.md,ac-trace-13-6.md}

Gewijzigd:
- apps/api/prisma/schema.prisma (model SystemSetting)
- apps/api/src/services/flywheel/{baseline.ts,gate.ts,nomination.ts,promotion-batch.ts,types.ts}
- apps/api/src/api/v1/{flywheel.ts,reference-logos.ts,artwork-pipeline.ts}
- apps/api/src/__tests__/{setup.ts,services/flywheel-gate.test.ts}
- versions.md

## Change Log

- 2026-07-02: Story aangemaakt (create-story workflow); soft-delete-filterpad en legacy-12.3-triggerplekken geverifieerd; `system_settings`-afwezigheid bevestigd conform AD-11-ratificatie.
