# Story 15.4: Drempelbeheer en pauzebediening

Status: ready-for-dev

<!-- Aangemaakt via create-story workflow, 2026-07-02. Bron: epics-vliegwiel.md Epic 15. -->

## Story

As a **datamanager**,
I want **drempels wijzigen met verplichte reden en het vliegwiel kunnen pauzeren en hervatten**,
so that **ik de lus bestuur in plaats van hem te moeten vertrouwen**.

### Afbakening (kritiek)

- Deze story bevat de **enige schemawijziging van Epic 15**: de tabel `threshold_changes` (patroon `model_activation_logs`). Conform ARCH-2 wordt de Prisma-migratie als expliciete taak ter goedkeuring aan de gebruiker voorgelegd — **nooit automatisch uitvoeren** — mét gedocumenteerd terugdraaipad (down-script).
- De pauze-**backend** (persistente pauzestand in `system_settings`, automatische stilstand K=2, pauze-scope in hooks en jobs) bestaat al uit Story 13.6. Deze story levert de **bediening en zichtbaarheid**: endpoints `thresholds` en `pause`, modals, banners en historie-weergave.
- Hervatten **blokkeert niet** op openstaande quarantaines — de hervat-modal waarschuwt alleen (FR-19 eist uitsluitend een expliciete actie; de batches blijven veilig in quarantaine, niets ervan is actief).

## Acceptatiecriteria

_(1-op-1 uit epics-vliegwiel.md, Story 15.4)_

1. **Given** de nieuwe Prisma-migratie voor `threshold_changes` (patroon `model_activation_logs`)
   **When** de migratie wordt voorbereid
   **Then** wordt deze ter expliciete goedkeuring voorgelegd (ARCH-2).

2. **Given** het drempelbeheer (endpoint `thresholds`)
   **When** de datamanager een drempel wijzigt
   **Then** is een redenveld verplicht, wordt oude+nieuwe waarde+gebruiker+reden gelogd in `threshold_changes`, en is de wijzigingshistorie zichtbaar in de UI (FR-5, AD-13, UX-DR7)
   **And** toont het drempelbeheer de per-methode-drempels (template/embedding/classifier) elk afzonderlijk (FR-5).

3. **Given** de pauzeknop (endpoint `pause`)
   **When** de datamanager pauzeert
   **Then** volgt een bevestigingsmodal, daarna een persistente amber pauzebanner; hervatten is een expliciete actie (FR-19, UX-DR6).

4. **Given** een gepauzeerd vliegwiel
   **When** de datamanager hervat
   **Then** wordt de hervatting gelogd met gebruiker en tijdstempel (patroon `threshold_changes`) (NFR-5, AD-13)
   **And** toont de hervat-modal eventuele openstaande quarantaines als waarschuwing, zonder de hervatting te blokkeren (FR-19).

5. **Given** een automatische stilstand (K=2, Story 13.6)
   **When** het dashboard laadt
   **Then** toont het een rode stilstand-banner met de aanleiding (enige rode toestand naast regressie-alarm) die linkt naar de betrokken batches, en is de notificatie via het bestaande patroon zichtbaar (FR-19, UX-DR5, UX-DR6).

## Tasks / Subtasks

- [ ] 1. Prisma-migratie `threshold_changes` (AC: 1) — **ARCH-2-toestemmingstaak**
  - [ ] 1.1 Model `ThresholdChange` exact naar het `ModelActivationLog`-patroon (schema.prisma:492-503): `id @db.Uuid gen_random_uuid()`, `thresholdKey @db.VarChar` , `oldValue`, `newValue`, `reason`, `userId @db.VarChar(255)`, `changedAt @db.Timestamptz @default(now())`; `@@map("threshold_changes")`, kolommen camelCase + `@map` snake_case, `@@index([changedAt(sort: Desc)])` (Structural Seed + Consistency Conventions).
  - [ ] 1.2 Migratie genereren met `prisma migrate dev --create-only`; **STOP: expliciet ter goedkeuring aan de gebruiker voorleggen; de gebruiker keurt goed en draait zelf / geeft per geval toestemming** — nooit auto-migrate, nooit via container-startup (teamregel databaseveiligheid).
  - [ ] 1.3 Down-script (documenteren in de migratiemap of story-file): `DROP TABLE IF EXISTS threshold_changes;` — gedocumenteerd terugdraaipad conform ARCH-2.
- [ ] 2. Endpoint `GET/PUT /api/v1/flywheel/thresholds` (AC: 2)
  - [ ] 2.1 GET: per-methode-drempels (template/embedding/classifier) elk afzonderlijk, met huidige waarde, vorige waarde en bron; plus de wijzigingshistorie (nieuwste boven) uit `threshold_changes`.
  - [ ] 2.2 PUT: `{ thresholdKey, newValue, reason }` — **reden server-side verplicht** (400 zonder); schrijft de effectieve waarde en logt atomair een `threshold_changes`-rij met oude+nieuwe waarde, `request.user` en tijdstempel.
  - [ ] 2.3 **Effectieve-waarde-ontwerp (documenteren in Dev Agent Record):** de runtime-drempels zijn env-gedefinieerd (`FLYWHEEL_PROMOTION_THRESHOLD_<METHODE>`, default 0,90 — Story 13.2). Een UI-wijziging moet zonder deploy effect hebben → persisteer de override in `system_settings` (key bijv. `flywheel.promotionThreshold.template`) en laat de poort-/nominatielogica lezen als `system_settings-override ?? env ?? 0.90`. Stem de lees-helper af met de 13.x-services zodat er precies één resolutiefunctie bestaat. `threshold_changes` is uitsluitend de audittrail, nooit de bron van de actuele waarde.
  - [ ] 2.4 Validatie: stap 0,01, bereik per methode (redelijk venster, bijv. 0,50–0,99); buiten bereik → 400.
- [ ] 3. Drempelbeheer-UI (AC: 2)
  - [ ] 3.1 Knop "Drempels" in de pagina-header van `/flywheel` → modal (`{components.threshold-input}`): per methode één antd `InputNumber` (stap 0,01) met huidige én vorige waarde zichtbaar; verplicht redenveld (opslaan disabled zolang leeg); vaste hint onder het veld: "Wijzigingen worden gelogd met oude en nieuwe waarde" (FR-5).
  - [ ] 3.2 Wijzigingshistorie zichtbaar in de UI (UX-DR7): lijst/tabel in de modal of een historie-sectie — datum, gebruiker, drempel, oud → nieuw, reden.
- [ ] 4. Pauze-endpoint + bediening (AC: 3, 4)
  - [ ] 4.1 `POST /api/v1/flywheel/pause` (`{ action: 'pause' | 'resume' }`): muteert de bestaande persistente pauzestand in `system_settings` (13.6) en logt élke overgang met gebruiker en tijdstempel volgens het `threshold_changes`-patroon (rij met bijv. `thresholdKey='flywheel.paused'`, oldValue/newValue `'true'`/`'false'`, reden optioneel) — herstart heft de pauze niet op (AD-11).
  - [ ] 4.2 Pauzeschakelaar in de pagina-header (`{components.pause-switch}`: antd Switch + label "Vliegwiel actief" / "Gepauzeerd"); omzetten opent **altijd** de bevestigingsmodal die de consequenties benoemt: "Nominatie en promotie stoppen; detectie en trainingsdata-registratie lopen door." (pauze-scope AD-11 — het dashboard toont deze scope expliciet).
  - [ ] 4.3 Gepauzeerd: persistente **amber** pauzebanner onder de pagina-header (`role="alert"`): "Vliegwiel gepauzeerd door {naam} op {datum} — nominatie en promotie staan stil."; schakelaar toont Hervatten (neutraal grijs met amber statuslabel — de schakelaar wordt nooit rood).
  - [ ] 4.4 Hervat-modal: zelfde expliciete bevestiging; toont eventuele openstaande quarantaines als waarschuwing ("2 batches wachten nog op jouw beoordeling.") **zonder te blokkeren**; na bevestigen verdwijnt de banner en kleurt de KPI-tegel terug naar neutraal (Key Flow 2).
- [ ] 5. Rode stilstand-banner (AC: 5)
  - [ ] 5.1 Overview-payload (15.2-compositie) uitbreiden met de pauze-/stilstandstatus: handmatig vs. automatisch, wie/wanneer, aanleiding, en de id's van de betrokken gequarantaineerde batches (13.6 legt de K=2-aanleiding vast).
  - [ ] 5.2 Bij automatische stilstand: **rode banner** (`{colors.destructive-light}`, icoon, `role="alert"`, bovenaan vóór alle content): "Automatische stilstand: 2 opeenvolgende promotiebatches in quarantaine. Hervatten kan na beoordeling." met links naar de betrokken batch-detailpagina's (`/flywheel/batches/:id`). Schakelaar toont "Gepauzeerd (automatisch)". Dit is — naast het regressie-meetpunt in de trend — de **enige** rode toestand in het hele scherm.
  - [ ] 5.3 De bestaande notificatie (RetrainingNotification-patroon, door 13.6 aangemaakt bij stilstand) blijft zichtbaar via het bestaande banner-mechanisme — hier niets herbouwen, alleen verifiëren dat beide kanalen elkaar niet dubbel melden.
- [ ] 6. Tests (zie Testrichtlijnen)
  - [ ] 6.1 API: thresholds — 400 zonder reden, atomaire log-rij met oude/nieuwe waarde+userId, resolutievolgorde override→env→default, bereik-validatie; pause — persistentie in system_settings, log-rij bij pauze én hervatting, resume blokkeert niet op openstaande quarantaines.
  - [ ] 6.2 Web: modal-tests (opslaan disabled zonder reden; consequentie-tekst in pauzemodal; waarschuwing in hervat-modal), bannerlogica (amber bij handmatig, rood uitsluitend bij automatische stilstand, banner-links naar batches), `role="alert"` op beide banners.
- [ ] 7. versions.md (NL) in DEZELFDE commit; Engelse commitmessage.

## Dev Notes — Developer Context

### Wat er AL bestaat (hergebruiken, niet herbouwen)

| Bouwsteen | Waar | Relevantie |
|---|---|---|
| Audit-log-patroon | `apps/api/prisma/schema.prisma:492-503` — `model ModelActivationLog` (`userId @db.VarChar(255)`, `activatedAt @db.Timestamptz`, `@@index([activatedAt(sort: Desc)])`, `@@map("model_activation_logs")`) | Het bindende patroon voor `threshold_changes` (AD-13: "volgt exact dat patroon i.p.v. een nieuw generiek mechanisme"). |
| Persistente pauzestand | Story 13.6 — `system_settings` (key/value Json, updatedAt, updatedBy) + pauze-checks in nominatie-hooks en jobs `flywheel-promotion`/`flywheel-bootstrap` | Endpoint muteert deze stand; de scope-handhaving (wat stopt, wat doorloopt) is al backend-gedrag — hier niet dupliceren. |
| Automatische stilstand (K=2) + aanleiding | Story 13.6 (AD-11) — zelfpauze persistent + notificatie met aanleiding | Bron voor de rode banner (5.1/5.2); deze story legt niets opnieuw vast. |
| Notificatiepatroon | `apps/api/prisma/schema.prisma:478-487` (`RetrainingNotification`) + `apps/api/src/services/pipeline/trigger.ts:141` (`notifyRetrainingRecommended`: persist vóór emit, Socket.IO via `socketIOManager.broadcastAll`, Redis-dedup) + web `apps/web/src/components/training/RetrainingNotificationBanner.tsx` | Bestaand kanaal; 13.6 gebruikt het al voor stilstand — deze story verifieert alleen zichtbaarheid (taak 5.3). |
| Per-methode-drempels (env) | Story 13.2 — `FLYWHEEL_PROMOTION_THRESHOLD_<METHODE>` (template/embedding/classifier, default 0,90); naamgevingspatroon zie `CROSSCHECK_THRESHOLD_*` in `apps/api/src/services/artwork-crosscheck.ts` | GET-endpoint toont ze elk afzonderlijk; PUT overschrijft via system_settings-override (taak 2.3). |
| Audit-identiteit | `apps/api/src/middleware/auth.ts:70,126` (`request.user`) | userId in `threshold_changes` en pauze-log. |
| Overview-compositie + banners-plek | Story 15.2 (`services/flywheel/overview/`, FlywheelPage-header) | Pauze-/stilstandstatus als extra overview-sectie; schakelaar en banners landen in de FlywheelPage-header uit 15.1/15.2. |
| v1-route + theming | Story 15.1 (`api/v1/flywheel.ts`, FlywheelThemeProvider) | `thresholds` en `pause` als extra routes in hetzelfde bestand. |

### Wat er NIEUW is (de eigenlijke story)

1. Prisma-model `ThresholdChange` + migratie (ARCH-2-toestemmingsflow + down-script) — **enige schemawijziging van Epic 15**.
2. Endpoints `GET/PUT /api/v1/flywheel/thresholds` en `POST /api/v1/flywheel/pause` + sub-services (`thresholds.ts`, `pause.ts`) onder `apps/api/src/services/flywheel/`.
3. Effectieve-drempel-resolutie (system_settings-override ?? env ?? default) als gedeelde helper, afgestemd met de 13.x-poort/nominatielogica.
4. UI: drempelmodal met verplicht redenveld + historie; pauzeschakelaar + bevestigings-/hervat-modals; amber pauzebanner; rode stilstand-banner met batch-links.

### Bindende UX-gedragsregels (DESIGN.md + EXPERIENCE.md)

- **Bannergedrag (UX-DR6, State Patterns — bindend):** handmatig gepauzeerd = **amber** banner onder de pagina-header met wie/wanneer; automatische stilstand = **rode** banner bovenaan vóór alle content met aanleiding + links naar beide batches. De rode banner is (naast het regressie-meetpunt) de enige rode toestand; de pauzeschakelaar zelf wordt **nooit** rood.
- **Modalgedrag:** omzetten van de schakelaar opent áltijd een bevestigingsmodal die de consequenties benoemt; hervatten na automatische stilstand vereist dezelfde expliciete bevestiging (Component Patterns, pause-switch). Hervat-modal waarschuwt over openstaande quarantaines, blokkeert niet (Key Flow 2-faalpad, expliciete ASSUMPTION in EXPERIENCE.md).
- **Drempelmodal:** huidige én vorige waarde zichtbaar; opslaan vereist ingevulde reden; vaste caption-hint "Wijzigingen worden gelogd met oude en nieuwe waarde"; InputNumber stap 0,01; focus-stijl teal rand + 3px zachte ring.
- **Accessibility (UX-DR9):** banners `role="alert"`; statuswijzigingen `aria-live="polite"`; status nooit via kleur alleen (banner = icoon + tekst).
- **Toon:** "Vliegwiel gepauzeerd — hervatten kan hierboven", "Automatische stilstand na 2 opeenvolgende quarantaines" — nooit "Systeem uitgeschakeld", "NOODSTOP" of alarmisme.
- Modals stapelen maximaal één niveau (IA-regel).

### Guardrails (voorkom bekende fouten)

- **Migratie-toestemming is hard (ARCH-2/teamregel):** de migratie wordt voorbereid en ter goedkeuring voorgelegd; NOOIT `prisma migrate deploy/dev` zelf uitvoeren tegen een omgeving, nooit auto-migrate bij startup, ook niet in tests tegen containers. Down-script verplicht meegeleverd.
- **`threshold_changes` is audittrail, geen configuratiebron** — de actuele waarde leeft in system_settings-override/env. Twee bronnen van waarheid is een review-finding.
- **Eén resolutiefunctie** voor de effectieve drempel, gedeeld met de poort-/nominatielogica (13.2/13.4) — geen tweede leespad dat de UI-wijziging negeert.
- **Pauze-semantiek niet herbouwen:** de handhaving (welke hooks/jobs stoppen) is 13.6-gedrag; deze story schakelt en toont alleen.
- **Kleursemantiek (UX-DR5):** amber = gepauzeerd/quarantaine ≠ fout; rood uitsluitend automatische stilstand en regressie-alarm — een rode handmatige-pauzebanner is fout.
- **Glossary exact** (PRD §3): "promotiebatch", "kwaliteitspoort", "quarantaine"; NL via i18next-keys (UX-DR10).
- E2E buiten de stable-subset-gate; commits Engels; `versions.md` (NL) in DEZELFDE commit. Deploy-volgorde bij release: ghcr-workflow eerst, dan Coolify; migratie handmatig via `prisma migrate deploy` ná toestemming (operationele envelope §1–2).

### Testrichtlijnen

- API: vitest (`apps/api/src/__tests__/`) met gemockte Prisma — geen echte migraties in tests; resolutie-helper unit-testen (override/env/default-matrix); pause-endpoint idempotentie (pauzeren terwijl al gepauzeerd → no-op of 409, keuze documenteren).
- Web: vitest + jsdom, colocated tests conform bestaande web-testopzet (`apps/web/vitest.config.ts`); modal- en bannergedrag met gemockte flywheelService; assert `role="alert"` en de exacte NL-copy van consequentie- en waarschuwingsteksten.

### Project Structure Notes

- Prisma-model in `apps/api/prisma/schema.prisma` naast de andere flywheel-modellen; conventies: PascalCase-model + `@@map` snake_case, VarChar-status, `@db.Timestamptz`, index `Desc` (Consistency Conventions).
- Routes in `apps/api/src/api/v1/flywheel.ts`; services in `apps/api/src/services/flywheel/`; web-componenten in `apps/web/src/components/flywheel/` (`ThresholdModal.tsx`, `PauseSwitch.tsx`, `StandstillBanner.tsx`).

### References

- [Source: _bmad-output/planning-artifacts/epics-vliegwiel.md#Story-15.4] — AC's; bronnen FR-5 (UI), FR-19 (UI), AD-11, AD-13, NFR-5, UX-DR6, UX-DR7, ARCH-2.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-logoRecognition-2026-07-02/ARCHITECTURE-SPINE.md#AD-11] — persistente pauze, pauze-scope, stilstand-notificatie; #AD-13 — `threshold_changes` volgt exact het `model_activation_logs`-patroon; #Structural-Seed (kolomdefinities `threshold_changes`, `system_settings`); #Constraints (migratie-toestemming); #Operationele-envelope (handmatige `prisma migrate deploy`).
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-logoRecognition-2026-07-02/EXPERIENCE.md#Component-Patterns] — pause-switch en threshold-input-gedrag; #State-Patterns (amber/rode banners); #Key-Flows Flow 2 (UJ-3, incl. hervat-zonder-afhandelen-faalpad).
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-logoRecognition-2026-07-02/DESIGN.md#Components] — pause-switch, threshold-input; frontmatter-tokens (warning/destructive-varianten).
- Visuele referentie: `_bmad-output/planning-artifacts/ux-designs/ux-logoRecognition-2026-07-02/mockups/mock-overzicht.html` (header met schakelaar en banners).
- Codebase: `apps/api/prisma/schema.prisma:478-503` (RetrainingNotification + ModelActivationLog), `apps/api/src/services/pipeline/trigger.ts` (notificatiepatroon), `apps/api/src/middleware/auth.ts` (request.user).
- Story-afhankelijkheden: 13.2 (drempel-env's), 13.6 (system_settings, pauze-handhaving, K=2, stilstand-notificatie), 15.1 (casco/route), 15.2 (overview-compositie, header).

## Dev Agent Record

_(in te vullen door dev-story)_

### Agent Model Used

### Debug Log References

### Completion Notes

### File List

## Change Log

- 2026-07-02: Story aangemaakt (create-story workflow) uit epics-vliegwiel.md Epic 15, audit-patroon geverifieerd op schema.prisma:492-503.
