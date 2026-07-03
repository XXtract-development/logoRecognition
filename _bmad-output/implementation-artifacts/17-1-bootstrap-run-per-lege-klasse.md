# Story 17.1: Bootstrap-run per lege klasse

Status: done

<!-- Aangemaakt via create-story workflow, 2026-07-02. Epic 17 — Seed-bootstrap voor lege klassen. -->

## Story

As a **datamanager**,
I want **dat een klasse zonder referenties zichzelf vult met echte crops uit declarerende producten**,
So that **ook onbediende keurmerken herkenbaar worden zonder handwerk (UJ-2)**.

### Afbakening

- De bootstrap **nomineert alleen**: vondsten worden kandidaat-referenties (herkomst `bootstrap`) die exact dezelfde kwaliteitspoort doorlopen als reguliere kandidaten (Epic 13). Deze story activeert nooit zelf een referentie.
- Het gids-logo is **uitsluitend zoekzaad** (NFR-6): het komt nooit als referentie in de bibliotheek, nooit in exports/responses/rapporten.
- Wachtrij-prioritering en beheer-UI zijn Story 17.2; deze story verwerkt wat er in `bootstrap_queue` (Story 16.2) staat.
- **Afhankelijkheden:** Epic 13 (nominatieservice + `/ml/phash` + queue `flywheel` + kwaliteitspoort + pauze-mechanisme 13.6), Story 16.2 (`bootstrap_queue`). Zonder deze fundamenten kan deze story niet draaien.

## Acceptatiecriteria

1. **Gerichte zoektocht binnen declarerende GTINs.**
   **Given** een T3777-code zonder actieve referenties en met het gids-logo als zoekzaad
   **When** de job `flywheel-bootstrap` draait (queue `flywheel`, on-demand/gequeued)
   **Then** zoekt hij uitsluitend binnen GTINs die de code declareren en nomineert vondsten ≥ `FLYWHEEL_BOOTSTRAP_THRESHOLD` (default 0,93) als kandidaat met herkomst `bootstrap` (FR-12, AD-8, AD-9)
   **And** doorlopen bootstrap-kandidaten exact dezelfde kwaliteitspoort als reguliere kandidaten (FR-12).
   "Uitsluitend declarerende GTINs" is hard: per GTIN wordt de declaratie geverifieerd (declaratieprovider, reason `ok` en code ∈ declaratie) vóór er ook maar iets genomineerd wordt — een GTIN-lijst uit oudere events is een kándidatenlijst, geen vrijbrief.

2. **Zaad wordt nooit referentie (NFR-6).**
   **Given** het gids-logo
   **When** de run afrondt
   **Then** komt het zaad zelf nooit als referentie in de bibliotheek en blijft het beperkt tot het zoekpad (FR-12, NFR-6).
   Concreet: het zaad wordt nooit als `reference_candidates`-rij, `ReferenceLogo`-rij of crop-upload aangemaakt; alleen echte artwork-crops (dedup via inhouds-hash sluit een per ongeluk meegelift zaadbeeld bovendien uit).

3. **Lege run → terug in wachtrij.**
   **Given** een run zonder vondsten
   **When** de run afrondt
   **Then** wordt hij vastgelegd als `leeg` en keert de klasse terug in de wachtrij (FR-12).
   Concreet: `bootstrap_queue.status='leeg'`, `lastRunAt` gezet; de klasse blijft opneembaar in een volgende run (16.2-statusmodel). Synthetische context-expansie is expliciet géén v1-gedrag (PRD FR-12-consequence).

4. **Run-budget en time-box.**
   **Given** een bootstrap-run met veel wachtende klassen
   **When** de job draait
   **Then** verwerkt hij per run maximaal `FLYWHEEL_BOOTSTRAP_RUN_BUDGET` GTINs (default 200) binnen een time-box; het restant blijft in de wachtrij voor een volgende run (run-budget; FR-12, AD-6, NFR-3).

5. **Pauze-scope.**
   **Given** de pauzestand actief
   **When** de job start
   **Then** draait hij niet (AD-11 pauze-scope).

6. **Hoofdvlag-scope (AD-8).**
   **Given** `FLYWHEEL_NOMINATION_ENABLED=false`
   **When** een bootstrap-run gepland of gestart zou worden
   **Then** draait hij niet en nomineert hij niets (AD-8).

7. **Tests.**
   - Unit (vitest, apps/api): declaratie-verificatie-guard (niet-declarerende GTIN wordt overgeslagen, geteld en gelogd), drempel-randgevallen rond 0,93, statusovergangen `wachtend→gedraaid→gevuld|leeg`, budget-afkap + restant-in-wachtrij, pauze- en vlag-checks bij job-start.
   - Pytest (ml-service): zaad-zoek-endpoint — matches boven/onder drempel, lege pagina/onleesbaar beeld faalt zacht per GTIN, zaadbeeld verschijnt nooit in de output-crops.
   - Integratie: run over gemockte ml-antwoorden ⇒ nominaties met herkomst `bootstrap` via de 13.2-service (incl. `/ml/phash`-hash), géén directe referentie-writes.
   - E2E: NIET aan de stable-subset-gate toevoegen.

## Tasks / Subtasks

- [ ] 1. ml-service zaad-zoek-endpoint in `apps/ml-service/app/api/flywheel.py` (prefix `/ml`, geregistreerd in `main.py`) + service onder `apps/ml-service/app/services/` (bijv. `bootstrap_search.py`) (AC: 1, 2)
  - [ ] 1.1 Pipeline per GTIN-pagina: `propose_regions` → embed → cosine tegen de zaad-embedding (gids-logo, als payload/storage-path meegegeven) → matches ≥ drempel retourneren met bbox + crop; hergebruik het assemble-patroon van `queue_harvest.py` (page-pick, crop-guards, per-code cap)
  - [ ] 1.2 Gate-v2 (`keurmerk_gate`) als voorfilter behouden (ruisreductie), drempelvergelijking op de zaad-cosine
- [ ] 2. API-job `flywheel-bootstrap` (queue `flywheel`, on-demand/gequeued per klasse) in `apps/api/src/services/pipeline/` + flow in `apps/api/src/services/flywheel/bootstrap-run.ts` (AC: 1, 3, 4)
  - [ ] 2.1 Kandidaat-GTINs verzamelen: `mismatch_events` type `declared-not-found` voor de code (16.1) als primaire bron; per GTIN declaratie verifiëren vóór verwerking (harde guard AC1)
  - [ ] 2.2 Zaadbeeld resolven: gids-logo van de code uit de referentiebibliotheek-opslag (`reference-logos/{code}/...`, ook als de rij inactief is) of uit de 12.1-guide-extractie; ontbreekt elk zaad → run vastleggen als `leeg` met reden `geen-zaad` en klasse terug in wachtrij
  - [ ] 2.3 Vondsten nomineren via de 13.2-nominatieservice (herkomst `bootstrap`, synchrone `/ml/phash`, fail-closed bij hash-uitval) — nooit rechtstreeks `reference_candidates` inserten buiten die service om
  - [ ] 2.4 Budget (`FLYWHEEL_BOOTSTRAP_RUN_BUDGET`, default 200) + time-box (wall-clock-env, patroon `HARVEST_MAX_SECONDS`); afgekapt restant blijft `wachtend`
  - [ ] 2.5 Statusadministratie op `bootstrap_queue`: `gedraaid` bij start, `gevuld` (≥1 nominatie) of `leeg` bij einde, `lastRunAt`
- [ ] 3. Pauze- en hoofdvlag-check bij job-start (13.6 `system_settings`; `FLYWHEEL_NOMINATION_ENABLED`) (AC: 5, 6)
- [ ] 4. MLClient-methode voor het zoek-endpoint (`apps/api/src/services/ml-client.ts` — uitsluitend via MLClient, spine-conventie) (AC: 1)
- [ ] 5. Unit-/pytest-/integratietests (AC: 7)
- [ ] 6. versions.md (NL) in DEZELFDE commit; Engelse commit; ghcr-build afwachten (ml-image rebuildt bij `app/`-wijziging) vóór Coolify-deploy; volgorde ml → api

## Dev Notes — Developer Context

### Wat er AL bestaat (geverifieerd 2026-07-02, hergebruiken)

| Bouwsteen | Waar | Relevantie |
|---|---|---|
| Oogst-/assemble-patroon (12.3-POC-lijn) | `apps/ml-service/app/services/queue_harvest.py` (217 regels): page-pick `_pick_page` :57, crop-guard `_crop_bgr` :50, `propose_regions` :134, embed :139, gate :141, cosine-zoek :143, per-code cap :149, time-box :120, crop-upload `artwork-crops/{gtin}/...` :174 | Het bewezen recept "artwork → regio's → embedding → drempel". Verschil: hier cosine tegen de **zaad-embedding** i.p.v. `find_similar_references` (een lege klasse hééft geen actieve referenties om tegen te zoeken). |
| Region proposer + gate | `apps/ml-service/app/services/region_proposer.py` (110 regels), `keurmerk_gate.py` (gate-v2, 12.4) | Bouwstenen van de zoektocht; onder `app/` dus in het Docker-image (constraint 2-les). |
| Embedding-backbone | `model_manager.generate_embedding` (patroon `queue_harvest.py` :139, `similarity.py` :365) | Zaad én crops door dezelfde backbone. |
| Gids-logo-bron | GS1 Label Guide-extractie (Story 12.1: `_bmad-output/implementation-artifacts/12-1-keurmerk-dekking-uit-gs1-label-guide.md`); opslagcontract `reference-logos/{code}/{variant}.{ext}` (`apps/api/src/api/v1/reference-logos.ts` :105; `apps/api/seeds/reference-logos/README.md`) | Zaadbeeld per code. Let op: guide-referenties kunnen inactief zijn (12.3-real-ref-pivot) — het zaad mag ook uit een inactieve rij of seed-asset komen; controleer op ACC welke bron per lege klasse bestaat (`SELECT ... FROM reference_logos WHERE t3777_code=...`). |
| Declaratieprovider | `apps/api/src/services/t3777-declarations.ts` (468 regels) — `resolveDeclarations()` :213, Redis-cache, reason-codes | De AC1-guard "uitsluitend declarerende GTINs". |
| Kandidaat-GTIN-bron | `mismatch_events` type `declared-not-found` (16.1) — herleidbaar naar GTINs (16.2) | Efficiënte kandidatenlijst; declaratie-verificatie per GTIN blijft verplicht. |
| Nominatieservice + hash | Story 13.2 (`services/flywheel/`, `/ml/phash` AD-14, herkomst-enum incl. `bootstrap`) | Het enige nominatiepad. Fail-closed bij hash-uitval. |
| Wachtrij-tabel | `bootstrap_queue` (Story 16.2-migratie) — statusset wachtend/gedraaid/gevuld/leeg/uitgesloten | Deze story zet de run-statussen; `uitgesloten` (17.2) nooit verwerken. |
| Queue + worker-patroon | `apps/api/src/services/pipeline/queue.ts` :98–108 (`createPipelineQueues`), workers.ts | Job aanhaken op queue `flywheel` (Epic 13; concurrency 1 sluit promotie/bootstrap/audit wederzijds uit — AD-6). |
| Legacy-registratiepad (NIET gebruiken) | `apps/ml-service/app/services/similarity.py` :316 `register_crop_as_reference` (12.3, source `review-confirmed`) | Alleen leesvoorbeeld voor guards (near-dup :371–385, idempotentie :346). Bootstrap schrijft NOOIT rechtstreeks referentie-tabellen (AD-1/AD-2). |

### Wat er NIEUW is

1. ml-service: zaad-zoek-endpoint (`app/api/flywheel.py`, `/ml/...`) + `app/services/bootstrap_search.py` — stateless compute: zaadbeeld + GTIN-artworkpaden in, matches (bbox, crop-verwijzing, zaad-cosine) uit (AD-9).
2. API: job `flywheel-bootstrap` + `services/flywheel/bootstrap-run.ts` (orkestratie, guards, statusadministratie, nominatie via 13.2).
3. MLClient-methode.
4. Env: `FLYWHEEL_BOOTSTRAP_THRESHOLD` (default 0,93), `FLYWHEEL_BOOTSTRAP_RUN_BUDGET` (default 200), time-box-env — documenteren in het env-voorbeeldbestand.
5. Geen migratie: `bootstrap_queue` bestaat (16.2), kandidaten landen in `reference_candidates` (13.2).

### Bindende AD's

- **AD-8** — bootstrap-nominaties vallen onder de hoofdvlag `FLYWHEEL_NOMINATION_ENABLED` (default `false`); vlag uit ⇒ job draait niet en nomineert niets.
- **AD-9** — beeld-/vectorwerk (regio's, embeddings, cosine) uitsluitend in ml-service; de API beslist op scores. Drempel 0,93 als env met PRD-startwaarde.
- **AD-6** — queue `flywheel`, concurrency 1; geen nieuwe scheduler; on-demand/gequeued per klasse.
- **AD-11** — pauze-check bij job-start; gepauzeerd = niet draaien.
- **AD-14 / AD-12** — nominatie via synchrone `/ml/phash`; uniciteit `(contentHash, t3777Code)`; herverwerking levert geen duplicaten.
- **NFR-6 / Consistency Convention** — gidsbeelden uitsluitend in het bootstrap-zoekpad.
- **ARCH-3 (constraint 2)** — alle nieuwe ml-code onder `apps/ml-service/app/` (queue-harvester-les: Docker kopieert alléén `app/`).

### Guardrails (voorkom bekende fouten)

- **28s/beeld-lokalisatiekosten — budget bewaken:** de klassieke localize-keten kost ~28s per beeld (ACC-meting). 200 GTINs × ~28s ≈ 1,5+ uur. Daarom: run-budget hard, time-box hard (patroon `HARVEST_MAX_SECONDS`), draaien buiten het harvest-venster (~03:23) en nooit ongebudgetteerd de hele wachtrij in één run.
- **Nooit buiten declarerende GTINs zoeken** (PRD FR-12-consequence, testbaar): de declaratie-check per GTIN is geen optimalisatie maar een contract.
- **Zaad-lek is een NFR-6-schending:** zaadbeeld nooit uploaden naar `artwork-crops/`, nooit nomineren, nooit in respons-payloads richting web.
- **Eén nominatiepad:** alles via de 13.2-service; directe inserts in `reference_candidates`/`reference_logos` zijn een review-finding (AD-1/AD-2; het 12.3-pad is de gedocumenteerde legacy-uitzondering, niet het voorbeeld).
- **Zelfde poort, geen kortere route:** bootstrap-kandidaten krijgen geen eigen promotieregels; de 13.4/13.5-poort behandelt ze identiek (alleen herkomst verschilt).
- Deploy-volgorde **ml → api** (nieuw ml-endpoint vóór zijn aanroeper); ghcr-workflow "Build and Push Docker Images" laten slagen vóór Coolify-deploy.
- Commits/PRs Engels; `versions.md` (NL) in DEZELFDE commit.
- E2E buiten de stable-subset-gate.

### Testrichtlijnen

- Pytest ml-service: zoek-service met synthetische beelden (zaad + geplakte logo-regio) — drempelgedrag deterministisch maken; zacht falen per corrupt beeld.
- Vitest API: guards (declaratie, pauze, vlag, budget) elk als geïsoleerde test; statusmachine-overgangen op `bootstrap_queue`; nominatie-aanroep gemockt en geverifieerd op herkomst `bootstrap`.
- Geen tests die op ACC-containers `RefreshDatabase`-achtig gedrag of migraties draaien (teamregel databaseveiligheid).

### Project context reference

- `_bmad-output/planning-artifacts/epics-vliegwiel.md` — Story 17.1 (AC-bron), Epic 17-doel (UJ-2, ~15 lege klassen).
- `ARCHITECTURE-SPINE.md` — AD-6, AD-8, AD-9, AD-11, AD-14, constraint 2, Structural Seed (job `flywheel-bootstrap`).
- PRD §4.4 FR-12 (+ consequences; drempel-assumptie 0,93; synthetische expansie is vervolgoptie, geen v1).
- `_bmad-output/implementation-artifacts/12-1-keurmerk-dekking-uit-gs1-label-guide.md` — gids-logo-extractie en opslagcontract.
- `tests/validation/keurmerk-declaratie-frequentie.md` — GS1 Label Guide als autoritaire logo-bron (§4), declaratie = prioriteringssignaal (§5-kanttekening).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (implement-sprint, epic/vliegwiel-17).

### Debug Log References

- API vitest volledig: 754 passed | 2 skipped | 37 todo (DATABASE_URL lokaal).
- ml pytest (zaad-match): 9 passed (pure `cosine` + `search_with_seed` met gemockte
  model/storage/region/gate/cv2 — geen torch/OpenCV nodig).
- tsc --noEmit + eslint changed files: schoon.

### Completion Notes

- Job `flywheel-bootstrap` (queue `flywheel`, concurrency 1) on-demand/gequeued;
  gerouteerd in `pipeline/workers.ts::processFlywheelJob`, enqueue via
  `bootstrap-run.ts::enqueueBootstrapRun`. Job-start-guards: hoofdvlag (AD-8) +
  pauze (AD-11, gedeelde `shouldSkipForPause`).
- ml-service `/ml/bootstrap-search` (stateless, AD-9): zaad embedden → per GTIN-
  pagina `propose_regions` → gate-v2 voorfilter → cosine tegen de ZAAD-embedding →
  matches ≥ drempel als geüploade crops (`artwork-crops/{gtin}/...`). Zaad wordt
  nooit geüpload; inhouds-digest-guard weert een meegelift zaadbeeld uit de output
  (NFR-6). Zacht falen per GTIN.
- Declaratie-guard per GTIN is HARD (AC1): `resolveDeclarations` reason `ok` én
  code ∈ declaratie vóór nominatie. Kandidaat-GTINs uit `mismatch_events`
  (declared-not-found, cohort uitgesloten).
- Nominatie uitsluitend via de 13.2-service (herkomst `bootstrap`, synchrone
  `/ml/phash`); nooit directe referentie-writes. Bootstrap-kandidaten doorlopen
  exact dezelfde kwaliteitspoort.
- Zaad ook uit een INACTIEVE `reference_logos`-rij (12.3-pivot). Geen zaad → run
  `leeg` (reden `geen-zaad`), klasse blijft opneembaar.
- Run-budget `FLYWHEEL_BOOTSTRAP_RUN_BUDGET` (200) + time-box
  `FLYWHEEL_BOOTSTRAP_MAX_SECONDS` (1800s); restant blijft `wachtend`. Drempel
  `FLYWHEEL_BOOTSTRAP_THRESHOLD` (0,93). Alle drie in `.env.example`.
- MIGRATIE-VRIJ: `bootstrap_queue` (16.2) + `reference_candidates` (13.2) bestaan.

### File List

- apps/ml-service/app/services/bootstrap_search.py (nieuw)
- apps/ml-service/app/api/flywheel.py (endpoint `/ml/bootstrap-search`)
- apps/api/src/services/flywheel/bootstrap-run.ts (nieuw)
- apps/api/src/services/flywheel/config.ts (drempel/budget/time-box)
- apps/api/src/services/ml-client.ts (`bootstrapSearch`)
- apps/api/src/services/pipeline/workers.ts (job-route)
- .env.example (3 env-vars)
- apps/api/src/__tests__/services/flywheel-bootstrap-run.test.ts (nieuw, 18)
- apps/ml-service/tests/unit/test_bootstrap_search_service.py (nieuw, 9)
- apps/api/src/__tests__/setup.ts (mlClient-mock `bootstrapSearch`)
- _bmad-output/implementation-artifacts/review-17-1.md, ac-trace-17-1.md

## Change Log

- 2026-07-02: Story aangemaakt (create-story workflow) op basis van epics-vliegwiel.md Story 17.1, PRD FR-12 en codebase-verificatie van het 12.3/12.6-oogstpatroon (queue_harvest.py) als zoekfundament.
- 2026-07-03: Geïmplementeerd (implement-sprint, epic/vliegwiel-17). ml-zaad-zoek-endpoint + API-job `flywheel-bootstrap`; migratie-vrij. 18 vitest + 9 pytest, volledige API-suite 754 groen. Zelf-review PASS (1 medium + 2 low gefixt).
