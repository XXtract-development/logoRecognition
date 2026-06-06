# Handmatige acceptatietest Epic 9 (+ Epic 8-restpunten) — ACC

**Omgeving:** Logorecognition op ACC (Vanilla, poort 8010) · acc @ 3f1f211 · DB-schema up-to-date (0001–0008) · workers + retraining-cron (06:00) actief
**Context:** de ACC-database is leeg na de restore-kwestie — fase A is direct uitvoerbaar, fase B vereist de minimale data die je in de stappen zelf opbouwt.

> **STATUS 2026-06-05: FASE A VOLLEDIG GESLAAGD ✅** (A1–A8 afgevinkt door Friso + orchestrator).
> Vier bevindingen tijdens de test, alle opgelost en gedeployed:
> 1. Geen logout/login-ingang → auth-menu in header (`ad229c3`)
> 2. Goedkeuringsscherm onbereikbaar én crashte (ontbrekende QueryClientProvider) → gefixt + banner/ModelsPage-navigatie (`ad229c3`)
> 3. Centrale login faalde altijd ($2y$-bcrypt uit Laravel) → genormaliseerd (`b08f829`); rol 3 → ADMIN-mapping (besluit Friso)
> 4. /training/pipeline crashte (pre-existing response-shape-bug) → gefixt (`5bdc4f0`)
> Fase B/C: uit te voeren zodra de data-heropbouw start.

## Fase A — Direct testbaar (lege omgeving)

| # | Stap | Verwacht resultaat | ✓ |
|---|------|--------------------|---|
| A1 ✅ | Log in op de ACC-app | Inloggen werkt (er is 1 user-account; zo niet: registreer/seed eerst een ADMIN) | ☐ |
| A2 ✅ | Open de **Models-pagina** | Approval-queue-sectie toont een nette lege staat ("geen challengers ter goedkeuring") — geen errors, geen NaN | ☐ |
| A3 ✅ | Open **Artwork review** (`/artwork-review`) | Lege review-queue met nette empty state; ook de feedback-uncertain-sectie leeg | ☐ |
| A4 ✅ | Open de **Image Library** (Training-pagina) | Leeg, géén spookkaarten, géén "NaN MB / Invalid Date" | ☐ |
| A5 ✅ | **Notificatiebanner** | Geen banner zichtbaar (er is nog geen trigger geweest) — en geen console-errors | ☐ |
| A6 ✅ | **NFR5-guard, anoniem** (terminal): `curl -s -o /dev/null -w "%{http_code}" -X POST http://10.100.0.5:8010/api/v1/models/test-id/activate` | **401** (anonieme activatie geweigerd) | ☐ |
| A7 ✅ | **NFR5-guard, service-account**: zelfde curl + `-H "x-api-key: <PIPELINE_SERVICE_KEY uit Coolify-env>"` | **403** met menselijke-goedkeuring-melding | ☐ |
| A8 ✅ | **Pipeline-API bereikbaar**: `GET /api/v1/pipeline/notifications` | 200 met lege lijst | ☐ |

## Fase B — De keten (bouwt zijn eigen testdata op)

> **STATUS 2026-06-06: FASE B VOLLEDIG GESLAAGD ✅** (op `acc @ fda84d5`, deploy onafhankelijk geverifieerd: SOURCE_COMMIT-match + alle 9 crop-streams 200/PNG).
> - B1–B3: uitgevoerd en geverifieerd door orchestrator 2026-06-05/06 (5 referenties + embeddings, 12 imports incl. PDF-rasterization, dedup 12/12 skipped). Detectieketen end-to-end bewezen via composiet-validatie; bevindingen incl. 8.3-kalibratiegaps: `fase-b-bevindingen-2026-06-05.md`.
> - B4–B7: handmatig uitgevoerd en akkoord bevonden door Friso (2026-06-06): crops/labels/confidence/herkomst zichtbaar, accept → trainingsdata met provenance, reject → geen trainingsdata, niet-ADMIN-knoppen disabled met tooltip.
> - B8–B9: uitgevoerd door orchestrator (2026-06-06, ADMIN-token, akkoord Friso): start → **202** met flowId + 4 step-jobIds; directe tweede start → **409** `TRAINING_FLOW_ACTIVE`; jobstatussen via API zichtbaar — `incorporate-feedback` + `build-batch` completed, `train-model` failed mét failedReason ("Holdout set too small: 0 validated holdout images, minimum is 25" — verwacht: ACC heeft nog geen holdout-data op schaal, zie fase C). Concurrency-lock komt correct vrij na de gefaalde train-stap (geen deadlock).
> - Observatie (cosmetisch, geen blocker): de flow-parent blijft na een gefaalde child in `waiting-children` staan; past bij de al gedeferde fase-F-bevindingen (PipelineJobsPanel/retry-endpoint).

| # | Stap | Verwacht resultaat | ✓ |
|---|------|--------------------|---|
| B1 ✅ | **Referentiebibliotheek** (7.3-scherm): upload 2–3 officiële keurmerk-PNG's (bijv. EU_ORGANIC_FARMING) met T3777-code + variantlabel | Upload slaagt (PNG/SVG-validatie), varianten zichtbaar per T3777-code met preview | ☐ |
| B2 ✅ | **Artwork-import** (8.1): start een import-run voor een handvol GTINs met PACKAGING_ARTWORK | Run start (202 + runId); status toont imported/skipped/failed per item; fouten breken de run niet af | ☐ |
| B3 ✅ | Herhaal B2 met dezelfde GTINs | Items worden **geskipt** (dedup op mediaId — niet opnieuw gedownload) | ☐ |
| B4 ✅ | **Review-queue na detectie** (8.3–8.5): open `/artwork-review` | Items tonen crop-afbeelding, voorgesteld label, confidence-%, herkomst (bronbestand + bbox) en discrepantie-reden | ☑ |
| B5 ✅ | **Accepteer** één reviewitem (als ADMIN) | Succes-feedback (groen); item verdwijnt uit de queue; trainingsdata-record met provenance aangemaakt | ☑ |
| B6 ✅ | **Reject** één reviewitem | Item verdwijnt; géén trainingsdata aangemaakt | ☑ |
| B7 ✅ | Als niet-ADMIN (of uitgelogd): accept/reject-knoppen | Uitgeschakeld met tooltip-uitleg | ☑ |
| B8 ✅ | **Handmatige flow-start** (9.3): `curl -X POST .../api/v1/pipeline/training/start` met ADMIN-sessie | 202/200 met flow-jobId; tweede aanroep direct erna → **409** (concurrency 1) | ☑ |
| B9 ✅ | **Jobstatus**: `GET /api/v1/pipeline/jobs/<jobId>` | Status zichtbaar (waiting/active/completed/failed); bij falen een failedReason | ☑ |

## Fase C — Volledige cyclus (pas zinvol ná data-heropbouw op schaal)

| # | Stap | Verwacht resultaat | ✓ |
|---|------|--------------------|---|
| C1 | Na voldoende trainingsdata + holdout-set: flow draait volledig door | incorporate → batch (incl. synthetische aanvulling schaarse klassen) → training → holdout-evaluatie | ☐ |
| C2 | **Kwaliteitsgate** (9.4) | Challenger ≥ champion op dezelfde holdout → verschijnt in approval queue; anders: notificatie met vergelijkingscijfers, model wél geregistreerd | ☐ |
| C3 | **Goedkeuringsscherm** (9.5) | Holdout-metrics naast elkaar, verschil per metric, datasetgroei, trigger-reden | ☐ |
| C4 | **Eénklik-activatie** | Bevestigingsdialoog → activatie → zichtbare bevestiging; `model_activation_logs` bevat userId + tijdstip | ☐ |
| C5 | **Trigger-notificatie** (9.2): na nieuwe gevalideerde feedback wacht op de dagelijkse 06:00-check (of verlaag drempels via env) | Banner met concrete reden ("N nieuwe gevalideerde annotaties"); geen duplicaat bij herhaalde check; blijft staan na herladen (persistent) | ☐ |

## Bekende beperkingen (geen bugs — gedocumenteerd)
- Pipeline-jobs-paneel in de UI is bewust nog niet gemount (deferred review-bevinding) — jobstatus via API (B9)
- Trainingsvenster (buiten kantooruren) wordt nog niet klok-afgedwongen (deferred) — concurrency 1 geldt wél
- ACC-data moet heropgebouwd worden; fase C is pas representatief na de Epic 8-importrun op schaal
