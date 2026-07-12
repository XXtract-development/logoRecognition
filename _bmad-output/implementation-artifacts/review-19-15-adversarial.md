# Adversarial review — Story 19.15 (resolveSeedPath prefereert het gids-zaad)

reviewed_commit: f9706fb (branch epic-19-story-19.15) — reviewlagen draaiden op de working-tree-diff vóór commit; het bestand-op-disk was byte-identiek tussen review en dit commit (geen wijziging tussen review en commit)
verdict: PASS

## Scope
- `apps/api/src/services/flywheel/bootstrap-run.ts` (`resolveSeedPath`, docstring)
- `apps/api/src/__tests__/services/flywheel-bootstrap-run.test.ts` (nieuwe tests)

## Reviewlagen (parallel, onafhankelijk)
- **Blind Hunter** (`bmad-review-adversarial-general`) — 3 bevindingen: 1 HIGH, 1 MEDIUM, 1 LOW.
- **Edge Case Hunter** (`bmad-review-edge-case-hunter`) — dezelfde 2 kernbevindingen (HIGH+MEDIUM), onafhankelijk convergerend; 3 gecontroleerde-en-schoon-bevonden randgevallen (lege storagePath, race tussen de twee queries, downstream-aannames).
- **Acceptance Auditor** (tegen het storybestand) — AC1/AC2/AC3/AC4 + Afbakening-constraints allemaal compliant; 1 documentatie-hygiëne-opmerking (story-checkboxes/Dev Agent Record nog leeg — geen AC/Afbakening-schending).

## Bevindingen + fix-log

| # | Severity | Bevinding | Fix | Status |
|---|----------|-----------|-----|--------|
| 1 | HIGH | `source: { notIn: REAL_CROP_SOURCES }` sluit rijen met `source: null` stilzwijgend uit (SQL drie-waardige logica: `NULL NOT IN (...)` = `UNKNOWN`). `reference_logos.source` is nullable (`schema.prisma:247`) en de curatie-upload `POST /reference-logos` zet `source` op `null` als het veld leeg blijft (`reference-logos.ts:68`) — een REËEL databronpad, geen hypothese. Zonder fix: een gids-referentie met `source:null` zou NOOIT door de gids-query gevonden worden en de functie zou ten onrechte doorvallen naar de fallback (die alsnog een nieuwere ECHTE crop kan kiezen) — precies de bug die deze story oplost, nu voor een subset van klassen. | Gids-query uitgebreid met expliciete `OR: [{ source: null }, { source: { notIn: [...REAL_CROP_SOURCES] } }]`. Docstring bijgewerkt met de SQL-drie-waardige-logica-uitleg. Regressietest toegevoegd (`code-review-fix (HIGH): ... source:null wordt WEL gevonden`) die faalt zodra de OR-clausule verdwijnt (geverifieerd rood tegen de niet-NULL-safe variant). | GEFIXT |
| 2 | MEDIUM | De testsuite mockt Prisma volledig (`prisma.referenceLogo.findFirst` is een `vi.fn()`); geen enkele test loopt tegen een echte Postgres-instantie, dus de SQL-niveau `NOT IN`/`NULL`-driewaardige-logica (bevinding 1) is strikt genomen niet via de suite te bewijzen — alleen de query-vorm (aanwezigheid van de `OR`-clausule) wordt geborgd. | Geaccepteerd binnen scope: dit hele testbestand (en de rest van `apps/api/src/__tests__/`) is consequent volledig Prisma-gemockt (geen DB-integratietest-harnas bestaat in dit project — architectuurkeuze, niet iets dat deze smalle bugfix-story moet oplossen). De code-vorm-fix is zelf correct volgens gedocumenteerde/bevestigde Postgres/Prisma-semantiek (bevestigd door twee onafhankelijke reviewlagen); de nieuwe test sluit de enige praktisch haalbare regressie (het weer verwijderen van de OR-clausule) af. Een DB-integratieharnas optuigen is scope-uitbreiding buiten deze story — niet uitgevoerd. | GEACCEPTEERD (gedocumenteerde restrisico, geen scope-creep) |
| 3 | LOW | Voor klassen zonder gids-referentie kost `resolveSeedPath` nu 2 sequentiële queries i.p.v. 1 (bewust, AC2-fallback-pad). | Geen fix nodig — expliciet gedocumenteerd bewust trade-off (AC2), verwaarloosbare kost (1 extra `findFirst` per klasse per run, niet per crop). | GEEN ACTIE (bewuste trade-off) |

## AC-trace
Zie `_bmad-output/implementation-artifacts/19-15-ac-trace.md` — ac_trace: 4/4.

## Afbakening-conformiteit
- Conditie C / Story 19.9 (`realRefPaths`/`min_refs`/`rankingThreshold`) — ongewijzigd (bevestigd: `git diff --stat` toont geen wijziging aan die query-opbouw; regressietest bevestigt `realRefPaths` identiek).
- `apps/ml-service/app/services/bootstrap_search.py` — NIET in de diff.
- Gate-drempels (19.6), declaratie-guard (19.5), 19.8-review-routering, region-proposer, embedding-model — allemaal ongewijzigd (geen van deze bestanden in de diff).

## Tests + gates (na fix)
- `tsc --noEmit` (apps/api): 0 errors.
- `apps/api/src/__tests__/services/flywheel-bootstrap-run.test.ts`: 34/34 groen (was 29 vóór deze story; +5 nieuw: AC1, AC2×2, NFR-6, HIGH-regressie, AC3-regressieborging).
- Volledige api-vitest-suite: zie eindrapport (Gate G, ná deze fix).

Geen open bevindingen (critical/high/medium/low) zonder gedocumenteerde reden. VERDICT: PASS.
