---
stepsCompleted: ['step-01-document-discovery', 'step-02-prd-analysis', 'step-03-epic-coverage-validation', 'step-04-ux-alignment', 'step-05-epic-quality-review', 'step-06-final-assessment']
documentsIncluded:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/implementation-artifacts/ (story-files, sprint-status.yaml)
  - _bmad-output/test-artifacts/ (ATDD-checklists)
mode: yolo (autonoom, akkoord Friso 2026-06-06)
---

# Implementation Readiness Assessment Report

**Date:** 2026-06-06
**Project:** logoRecognition

## Document Inventory

| Type | Document | Status |
|---|---|---|
| PRD | `prd.md` (24,8 KB, gewijzigd 2026-06-04) | ✅ whole, geen duplicaat |
| PRD-validatie | `prd-validation-report.md` (2026-04-01) | ℹ️ context |
| Architecture | `architecture.md` (25,7 KB, 2026-04-01) | ✅ whole, geen duplicaat |
| Epics | `epics.md` (32,5 KB, 2026-06-03) | ✅ whole, geen duplicaat |
| Stories | implementation-artifacts: 7.x/8.x/9.x done · 8-3R + 8-N1 ready-for-dev · 8-3O backlog · 10.x/11.x backlog | ✅ |
| UX | — | ⚠️ ontbreekt; XXtract Design System geldt als UI-kader (geaccepteerd in assessment 2026-06-03) |
| Vorig rapport | `implementation-readiness-report-2026-06-03.md` | ℹ️ baseline (Epic 7–9-voorwerk) |

Geen duplicaat-conflicten (whole + sharded) gevonden.

## PRD Analysis

### Functional Requirements

**Origineel MVP (Epic 1–6, status PRD: "nagenoeg compleet" → afgerond, zie docs/sprint-artifacts):**

- FR1–FR4: Beeldbeheer — multi-upload drag&drop (JPG/PNG/WEBP, max 10MB), bekijken/filteren/zoeken, verwijderen per categorie, formaat/grootte-validatie
- FR5–FR8: Categoriebeheer — CRUD, hiërarchie (max 3 niveaus), bulk-operaties, overzicht met aantallen + trainingsstatus
- FR9–FR14: Annotatie — smart click detection, handmatige bounding boxes, correctie/verwijdering, keyboard shortcuts, zoom/pan, voortgang per categorie
- FR15–FR20: Model Training — start per categorie/dataset, auto-augmentation, real-time voortgang (push), annuleren, versies + metadata, versie-vergelijking
- FR21–FR24: Model Beheer — activeren, rollback, versies inzien, export naar inference-formaat
- FR25–FR29: Logo Herkenning — upload, resultaten met boxes/labels/confidence, Top-K, export JSON/CSV, afwijkingen markeren
- FR30–FR33: API & Integratie — REST multipart, token-auth, async batch via job queue, JSON response
- FR34–FR37: Gebruikersbeheer — login, sessies via tokens, RBAC, audit logging
- FR38–FR40: Monitoring — health checks, metrics endpoint, training-jobstatus

**Addendum Geautomatiseerde Modeltraining (2026-06-03, Epic 7–11):**

- FR41: Vaste holdout-set — markering + technische uitsluiting van training/augmentatie
- FR42: Automatische evaluatie van elk model op de holdout-set; metrics bij modelversie
- FR43: Beheerbare keurmerk-referentiebibliotheek (officiële beeldmerken + varianten)
- FR44: Artwork-import via xxtractdbmedia.media (PACKAGING_ARTWORK) + mediaserver, caching in MinIO
- FR45: PDF-rasterization naar hoogresolutie vóór verwerking
- FR46: Keurmerk-lokalisatie via template-matching en tiling
- FR47: Classificatie gelokaliseerde regio's (crop-classifier en/of embedding-similarity)
- FR48: Kruischeck detectie vs T3777-declaratie; matches auto-accept, discrepanties → review-queue
- FR49: Auto-geaccepteerde crops geregistreerd als trainingsdata met label + herkomst
- FR50: Synthetische trainingsdata (composits referenties op artwork-achtergronden) met auto-labels
- FR51: Periodieke retraining-conditie-check met configureerbare drempels
- FR52: Notificatie "retraining aanbevolen" incl. reden
- FR53: Persistente job-queue (BullMQ/Redis) met retries + zichtbare jobstatus
- FR54: Trainingspipeline als job-flow (incorporate → batch → train → evaluate → goedkeuring)
- FR55: Training-jobstatus persistent en crash-bestendig
- FR56: Challenger alleen ter goedkeuring na kwaliteitsgate (≥ champion op holdout)
- FR57: Evaluatierapport inzien + één-handeling-activatie
- FR58: Periodieke realworld-accuracy-monitoring van het actieve model
- FR59: Automatische rollback bij accuracy-daling boven drempel binnen meetvenster, met notificatie
- FR60: Onveranderbare audit-trail van elke promotie en rollback
- FR61: Annotatie-QA-agent voor twijfelgevallen (optioneel)
- FR62: Trainingsrun-analyse-agent met leesbare aanbeveling (optioneel)
- FR63: Periodieke rapportage-agent (optioneel)

**Totaal FRs: 63** (40 MVP + 23 addendum)

### Non-Functional Requirements

**Performance (origineel):** NFR-P: accuracy >99% mAP@0.5 · inference P95 <100ms · training-start <5s · doorlooptijd <30min/1000 afb. · annotatie <5s/afb. · ONNX <50MB · canvas 60fps@1000 boxes · LCP <2.5s · WS <50ms · 100+ concurrent users · 1000 req/s

**Beveiliging:** HTTPS/TLS1.2+ · JWT + refresh · bcrypt cost ≥12 · RBAC ≥3 rollen · rate limiting · upload-inputvalidatie · audit logging mutaties · CORS-restrictie

**Schaalbaarheid:** horizontale ML-scaling · 10.000+ categorieën (post-MVP) · queue-concurrency-limits · S3-compatibele storage · connection pooling

**Accessibility:** WCAG 2.1 AA · keyboard-navigatie · screen reader · contrast 4.5:1 · focus-indicatoren · aria op canvas

**Betrouwbaarheid:** uptime 99,9% · durability 99,999% · graceful degradation ML-uitval · auto-retry training (max 3) · migraties zonder downtime

**Addendum (Epic 7–11):**
- NFR-A1: Geen verloren training-jobs bij crash (queue-state persistent)
- NFR-A2: Trainingsruns buiten kantooruren planbaar; concurrency 1
- NFR-A3: Holdout-lekkage technisch afgedwongen op query-niveau
- NFR-A4: CI-smoke-test volledige pipeline op mini-dataset
- NFR-A5: Menselijke goedkeuring verplicht vóór productie-activatie (geen autonome activatie)
- NFR-A6: Service-account/API-key voor geautomatiseerde callers; activatie ge-audit
- NFR-A7: Externe bestanden gecachet; geen runtime-afhankelijkheid externe bronnen
- NFR-A8: KPI's — feedback → actief model <1 week · ≤1 menselijke handeling per modelversie · 0 verloren jobs na crash

### Additional Requirements

- Domein: modelreproduceerbaarheid (seeds + dataset versioning), IoU-validatie bij annotatie, volledige traceability dataset→run→versie→deployment, GPU-training/CPU-inference (ONNX)
- Data/privacy: IP in logo-afbeeldingen (MinIO access control), retentiebeleid, multi-tenancy-scheiding
- UX-constraints in PRD zelf (canvas ≥70%, undo/redo ≥20, zoom 25–400%, voortgang epoch/loss/ETA, bevestiging destructieve acties, specifieke foutmeldingen)
- Scope-besluit addendum: menselijke goedkeuringsgate (geen volledige autonomie — Fase 3); mediaserver/media-tabel alleen-lezen
- Web app: React 18 SPA + Fastify API + FastAPI ML; desktop-first 1280px+; Socket.IO voor voortgang

### PRD Completeness Assessment

✅ Sterk: heldere FR/NFR-nummering; addendum herstelt expliciet de traceability-keten PRD→epics voor Epic 7–11 (n.a.v. readiness-issue 1+5 van 2026-06-03); scope-afbakening en autonomie-besluit expliciet vastgelegd; KPI's meetbaar.
⚠️ Aandachtspunt: het addendum verwijst naar "Epic 6: Self-Learning System" als Growth-fase maar de epics-nummering springt naar 7–11 (Epic 6 bestaat in docs/sprint-artifacts als afgerond MVP-werk) — cosmetisch, geen blokkade.

## Epic Coverage Validation

### Scope-context

`epics.md` dekt bewust alleen het addendum (FR41–FR63, `epicNumberingStart: 7`). FR1–FR40 horen bij het afgeronde MVP (Epic 1–6, brownfield-baseline; PRD-scope-tabel: "Geïmplementeerd", administratie in `docs/sprint-artifacts/`). Die zijn geen onderdeel van deze readiness-check.

### Coverage Matrix (FR41–FR63)

| FR | Epic-dekking | Implementatiestatus (2026-06-06) | Status |
|---|---|---|---|
| FR41 | Epic 7 / Story 7.1 | done | ✓ |
| FR42 | Epic 7 / Story 7.2 | done | ✓ |
| FR43 | Epic 7 / Story 7.3 | done | ✓ |
| FR44 | Epic 8 / Story 8.1 | done | ✓ |
| FR45 | Epic 8 / Story 8.2 | done (remediatie 93ee5bb) | ✓ |
| FR46 | Epic 8 / Story 8.3 | done **+ remediatie 8-3R ready-for-dev** (single-scale-facade, fase B-bevinding 1+2) | ✓⚠️ |
| FR47 | Epic 8 / Story 8.4 | done (API-inconsistentie localize → 8-3R AC3) | ✓⚠️ |
| FR48 | Epic 8 / Story 8.5 | done; acceptatie B4–B7 ✅ | ✓ |
| FR49 | Epic 8 / Story 8.6 | done; acceptatie B5 ✅ | ✓ |
| FR50 | Epic 8 / Story 8.7 | done (batch-hook → 9.3) | ✓ |
| FR51 | Epic 9 / Story 9.2 | done | ✓ |
| FR52 | Epic 9 / Story 9.2 | done | ✓ |
| FR53 | Epic 9 / Story 9.1 | done | ✓ |
| FR54 | Epic 9 / Story 9.3 | done; acceptatie B8 ✅ | ✓ |
| FR55 | Epic 9 / Story 9.1+9.3 | done; acceptatie B9 ✅ | ✓ |
| FR56 | Epic 9 / Story 9.4 | done | ✓ |
| FR57 | Epic 9 / Story 9.5 | done; acceptatie A-fase ✅ | ✓ |
| FR58 | Epic 10 / Story 10.1 | backlog — story in epics.md, géén story-file | ✓ (epic) |
| FR59 | Epic 10 / Story 10.2 | backlog — idem | ✓ (epic) |
| FR60 | Epic 10 / Story 10.3 | backlog — idem | ✓ (epic) |
| FR61 | Epic 11 / Story 11.1 | backlog (optioneel) | ✓ (epic) |
| FR62 | Epic 11 / Story 11.2 | backlog (optioneel) | ✓ (epic) |
| FR63 | Epic 11 / Story 11.3 | backlog (optioneel) | ✓ (epic) |

### Missing Requirements

**Geen ontbrekende FR-dekking.** Alle 23 addendum-FR's zijn getraceerd naar een epic + story in `epics.md`.

Aanvullende traceability-observaties (geen gaten, wel relevant):
1. **FR46/FR47 — remediatiespoor buiten epics.md:** de fase-B-acceptatie legde bloot dat 8.3 als facade was opgeleverd (single-scale). De remediatie leeft in story-files `8-3R` (ready-for-dev, adversarial gereviewd, ATDD red-phase aanwezig) + backlog-items `8-3O`/`8-N1` in sprint-status.yaml — maar epics.md zelf is er niet op bijgewerkt. Aanbeveling: nazorg-items als addendum-notitie in epics.md opnemen bij de eerstvolgende epics-wijziging (lage prioriteit; sprint-status.yaml is de werkende bron).
2. **NFR-dekking:** map aanwezig (NFR1/2→9.1+9.3 · NFR3→7.1 · NFR4→9.6 · NFR5→9.5+11.2 · NFR6→9.1+9.5 · NFR7→8.1 · NFR8→9.5+10.1). NFR-A2-trainingsvenster is bewust deferred (fase-F-bevinding, gedocumenteerd); concurrency=1 is wél live bewezen (acceptatie B8: 409).

### Coverage Statistics

- Totaal addendum-FRs: **23** · gedekt in epics: **23** · dekking: **100%**
- Geïmplementeerd + geaccepteerd: FR41–FR57 (17) · backlog met epic-dekking: FR58–FR63 (6)
- Openstaande remediatie op gedekte FR's: FR46/FR47-kwaliteit via 8-3R (+8-3O/8-N1)

## UX Alignment Assessment

### UX Document Status

**Niet gevonden** — en dat is een gedocumenteerd besluit, geen omissie. `epics.md` bevat een expliciete sectie "UX Design Requirements": geen apart UX-document; UI-werk beperkt tot (a) goedkeuringsscherm (uitbreiding models-pagina), (b) review-queue met herkomst (uitbreiding uncertainty-UI), (c) beheerscherm referentiebibliotheek — alles conform het XXtract Design System (team-breed kader: Navy/Teal/Groen-palet, Inter, Shadcn/ui + Tailwind).

### Alignment-validatie

| Toets | Bevinding |
|---|---|
| PRD ↔ UI-kader | ✅ PRD bevat eigen sectie "UX Constraints & Interactiepatronen" (canvas, voortgang, resultaatweergave, navigatie/feedback) — gedekt door bestaande MVP-UI |
| Epics ↔ UI-realisatie | ✅ De drie benoemde UI-stukken zijn geïmplementeerd én functioneel geaccepteerd: referentiebibliotheek (7.3, acceptatie B1), review-UI met herkomst (8.5, acceptatie B4–B7), goedkeuringsscherm (9.5, acceptatie fase A) |
| Architecture ↔ UX | ✅ React 18 SPA + Socket.IO ondersteunt de real-time eisen (voortgang, notificatiebanner — fase A geverifieerd) |
| Epic 10/11 UI-implicaties | ⚠️ Beperkt: 10.1 (accuracy-tijdreeks op models-pagina), 10.3 (audit-trail raadpleegbaar + filterbaar), 11.x (advies/rapport in bestaande kanalen). Zelfde patroon als 7–9: uitbreiding bestaande pagina's, geen nieuw UX-document nodig — wel expliciet meenemen in de story-files bij het Epic 10-voorwerk |

### Warnings

- Geen blokkerende warnings. Aandachtspunt voor het Epic 10-voorwerk: de UI-elementen van 10.1/10.3 (tijdreeks-weergave, audit-filterview) hebben geen wireframe/spec — leg de verwachte presentatie vast in de story-AC's (zoals bij 9.5 gedaan is), anders ontstaat interpretatieruimte bij implementatie.
- Bekende deferred UI-bevinding (fase F, Epic 9): PipelineJobsPanel bewust ongemount; jobstatus via API. Gedocumenteerd, geen readiness-blokkade.

## Epic Quality Review

Getoetst tegen de create-epics-and-stories-standaarden. Focus: Epic 10/11 (het eerstvolgende implementatiewerk) + de nazorg-story-files; Epic 7–9 zijn done & functioneel geaccepteerd en alleen retrospectief beoordeeld.

### Epic-structuur

| Toets | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|
| User value (geen technische milestone) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Onafhankelijkheid (geen forward deps) | ✅ standalone | ✅ ← 7 | ✅ ← 7 | ✅ ← 9 | ✅ ← 8+9, optioneel |
| Stories juist gesized | ✅ | ✅ | ✅ | ✅ | ✅ |
| AC's in Given/When/Then, testbaar, incl. foutpaden | ✅ | ✅ | ✅ | ✅ (zie 🟠1) | ✅ |
| FR-traceability | ✅ | ✅ | ✅ | ✅ | ✅ |

Alle afhankelijkheden wijzen achterwaarts (7→8/9→10→11). Binnen Epic 10 is de volgorde 10.1→10.2→10.3 consistent (10.2 gebruikt de 10.1-tijdreeks; 10.3 logt o.a. 10.2-rollbacks). Brownfield-integratiepunten zijn benoemd (bestaande activatieflow, uncertainty-queue, Socket.IO, model-comparison endpoint). Geen "create all tables upfront"-antipatroon: elke story maakt wat hij nodig heeft.

### Bevindingen

**🔴 Kritiek:** geen.

**🟠 Belangrijk (te verwerken in het Epic 10-voorwerk, vóór implementatie):**
1. **Story 10.2 — "baseline" is ondefinieerd.** "daling t.o.v. de baseline groter dan de drempel (default 10%)" — wat ís de baseline (holdout-accuracy bij activatie? eerste N uur realworld? voortschrijdend gemiddelde)? En hoe wordt "realworld-accuracy" exact berekend uit feedback-data (welke feedback telt, hoe wegen onbeoordeelde voorspellingen)? Zonder definitie is de rollback-beslissing niet implementeerbaar noch testbaar. → vastleggen in story-file 10.1/10.2.
2. **Story 10.3 — overlap met bestaand `model_activation_logs` (9.5).** Epic 9 logt activaties al (acceptatie fase A). 10.3 introduceert een bredere audit-trail (promoties, gate-weigeringen, rollbacks). Specificeer in het voorwerk: uitbreiden vs. nieuwe tabel, en de migratiestrategie — anders ontstaat duplicate logging of een gat.

**🟡 Aandachtspunten:**
3. epics.md is niet bijgewerkt met het nazorg-spoor (8-3R/8-3O/8-N1 leven in sprint-status.yaml + story-files) — werkbron is op orde, documentdrift beperkt houden.
4. Claim "Epic 8 en 9 zijn onderling onafhankelijk" bleek in uitvoering genuanceerd (8.7-batch-hook bewust deferred → 9.3) — historisch, gedocumenteerd, geen actie.
5. Epic 11: "actuele Claude model-ID's" — bij implementatie verifiëren (model-aanbod wijzigt); duurzame state in Postgres is correct voorgeschreven.
6. Epic 10-voorwerk: migratienummering-les uit Epic 9 toepassen (0007/0008-volgordeprobleem) — nieuwe migraties strikt sequentieel plannen over stories heen; migraties alleen met expliciete toestemming per geval (vaste werkafspraak).
7. Epic 10-teststrategie: realworld-monitoring vereist feedback-volume dat ACC nauwelijks heeft — definieer in het voorwerk hoe 10.1/10.2 op ACC valideerbaar zijn (seed-feedback-strategie, verlaagde drempels via env), anders herhaalt de fase-C-beperking zich.

### Nazorg-story-files (kwaliteit, ter context)

`8-3R`: ontwerpbeslissingen bevroren ná adversarial review (12 bevindingen verwerkt), AC's met empirisch done-criterium, ATDD red-phase aanwezig (11 tests, geverifieerd skipped) — **voorbeeldkwaliteit**. `8-N1`: mini-fix met 3 toetsbare AC's incl. bewijs-AC op ACC — passend gesized. `8-3O`: bewust nog geen story-file (kalibratie-output van 8-3R is input) — juiste volgorde.

## Summary and Recommendations

### Overall Readiness Status

**READY** — met twee voorwaarden per spoor:

| Spoor | Status | Voorwaarde |
|---|---|---|
| **Epic 8-nazorg (8-3R → 8-N1)** | ✅ READY | Geen — story-files, adversarial review én ATDD red-phase compleet; kan direct in `/implement-sprint` |
| **8-3O (orkestratie)** | ⏸️ WACHT | Story-file pas ná het 8-3R-meetrapport (bewuste volgorde) |
| **Epic 10** | 🟠 NEEDS PREP | Voorwerk vereist: 🟠-bevindingen 1+2 (baseline-definitie, audit-overlap) + 🟡 6+7 (migratieplanning, ACC-teststrategie) verwerken in story-files; daarna zelfde recept als Epic 9 (adversarial review → TEA test-design) |
| **Epic 11** | ✅ READY (epic-niveau) | Optioneel; voorwerk pas na Epic 10; model-ID's verifiëren bij start |

### Critical Issues Requiring Immediate Action

**Geen kritieke issues.** De traceability-keten PRD → epics → stories is volledig (23/23 addendum-FR's gedekt, 100%); FR41–FR57 zijn geïmplementeerd én functioneel geaccepteerd (fase A + B volledig groen, 2026-06-06).

### Recommended Next Steps

1. **Implementeer 8-3R** (ready-for-dev) — herstelt de FR46-kwaliteit (multi-scale + score-herijking); done-criterium is het empirische meetrapport. Neem 8-N1 als mini-fix mee in dezelfde sprint.
2. **Schrijf de 8-3O-story-file zodra het 8-3R-meetrapport er is** (drempels/throughput zijn input) — daarmee wordt FR46–48 end-to-end zonder ad-hoc scripts.
3. **Epic 10-voorwerk volgens het Epic 9-recept**, met expliciete aandacht voor: baseline-/accuracy-definitie (🟠1), audit-trail-integratie met `model_activation_logs` (🟠2), migratie-volgorde + toestemmingsregel (🟡6), ACC-validatiestrategie voor monitoring (🟡7), en UI-verwachtingen in de AC's (UX-sectie).
4. Klein onderhoud bij gelegenheid: nazorg-spoor als notitie in epics.md (🟡3); planning-artifacts (epics.md, readiness-rapporten) committen — staan deels untracked in git.

### Final Note

Deze assessment vond **0 kritieke, 2 belangrijke en 5 kleine aandachtspunten** over 4 categorieën (coverage, UX, epic-kwaliteit, proces). De belangrijke punten blokkeren alleen het Epic 10-voorwerk, niet de eerstvolgende sprint (8-3R/8-N1). Vergeleken met het rapport van 2026-06-03: issues 1 en 5 (traceability) zijn aantoonbaar opgelost via het PRD-addendum; issue 4 (baseline-beslismoment 8.3) is via de fase-B-bevindingen geëvolueerd naar het 8-3R-remediatiespoor.

**Assessor:** Mary (Business Analyst, BMAD) — autonoom uitgevoerd (YOLO) in opdracht van Friso, 2026-06-06.

---

## Remediatielog (2026-06-06, zelfde dag — alle punten gefixt in opdracht van Friso)

| # | Bevinding | Fix | Locatie |
|---|---|---|---|
| 🟠1 | Baseline 10.2 ondefinieerd | Definities vastgelegd: realworld-accuracy = correct beoordeeld ÷ totaal beoordeeld (onbeoordeeld telt niet); activatie-baseline = eerste meetpunt mét volume-minimum (default 50) ná activatie, zelfde metriek (géén holdout-vergelijking); rollback-conditie = accuracy ≤ baseline − 10 procentpunt; zonder baseline geen rollback | epics.md Story 10.1 + 10.2 AC's |
| 🟠2 | Audit-overlap 10.3 ↔ model_activation_logs | Integratiebeslissing: nieuwe tabel `model_audit_events` (event_type-superset), bestaande records gemigreerd, activatieflow schrijft alleen nog daarheen, bestaand scherm via view/query — geen dubbele logging; migratie alleen met expliciete toestemming | epics.md Story 10.3 AC's |
| 🟡3 | Nazorg-spoor niet in epics.md | Nazorg-notitie toegevoegd (8-3R/8-3O/8-N1 + FR46/47-kwaliteitsstatus) | epics.md na Epic List |
| 🟡4 | 8/9-onafhankelijkheidsclaim vs batch-hook | Uitvoeringsnuance toegevoegd aan afhankelijkheden-regel | epics.md |
| 🟡5 | Claude model-ID's Epic 11 | Voorwerk-instructie: verifiëren bij start + als env-config, niet hardcoded | epics.md Epic 11-intro |
| 🟡6 | Migratie-volgorde-les Epic 10 | Voorwerk-instructie: sequentiële nummering over stories + toestemmingsregel | epics.md Epic 10-intro |
| 🟡7 | ACC-validatiestrategie monitoring | Voorwerk-instructie: seed-feedback-strategie + env-verlaagbare drempels + geforceerde rollback-demo als AC-bewijs | epics.md Epic 10-intro |
| UX | UI-verwachtingen 10.1/10.3 | In AC's vastgelegd: lijngrafiek per modelversie met laag-volume-markering + activatiemomenten (10.1); filterbare tabelweergave op event-type/versie (10.3) | epics.md AC's |
| PRD | Epic 6-nummeringsverwarring | Nummeringsnotitie in addendum (Growth-concept "Epic 6" → uitgewerkt als Epic 7–11) | prd.md addendum |
| Proces | Untracked planning-artifacts | Doc-commit voorbereid (zie sessie); push lift mee met de 8-3R-sprint | git |

**Status na remediatie: READY zonder voorbehoud voor de nazorg-sprint; Epic 10-voorwerk kan starten zodra gepland — alle ontwerpbeslissingen waar het voorwerk op wachtte zijn vastgelegd.**
