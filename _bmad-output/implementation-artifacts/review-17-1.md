# Adversarial self-review — Story 17.1 (Bootstrap-run per lege klasse)

reviewed_commit: (pre-commit, working tree van epic/vliegwiel-17)
verdict: PASS
reviewer: dev-story self-review (adversarial, critical→low)

## Scope

Nieuwe/gewijzigde bestanden:
- `apps/ml-service/app/services/bootstrap_search.py` (nieuw) — stateless zaad-zoekservice.
- `apps/ml-service/app/api/flywheel.py` — endpoint `POST /ml/bootstrap-search`.
- `apps/api/src/services/flywheel/bootstrap-run.ts` (nieuw) — job-orkestratie.
- `apps/api/src/services/flywheel/config.ts` — drempel/budget/time-box-env.
- `apps/api/src/services/ml-client.ts` — `bootstrapSearch`-methode.
- `apps/api/src/services/pipeline/workers.ts` — job-route `flywheel-bootstrap`.
- `.env.example` — 3 nieuwe env-vars gedocumenteerd.
- Tests: `flywheel-bootstrap-run.test.ts` (vitest, 18), `test_bootstrap_search_service.py` (pytest, 9).
- `setup.ts` — mlClient-mock `bootstrapSearch`.

Migratie: NEE (`bootstrap_queue` bestaat uit 16.2; kandidaten landen in `reference_candidates` via 13.2).

## Bevindingen per severity

### Critical — geen
- NFR-6 (zaad nooit referentie): geborgd op TWEE lagen. (1) De API nomineert
  uitsluitend `matches[].crop_path` (`artwork-crops/...`), nooit het zaadpad;
  bewezen door test AC2 ("cropPath begint met artwork-crops/, nooit reference-logos/").
  (2) De ml-service uploadt het zaad nooit en sluit een als artwork-regio meegelifte
  kopie van het zaad uit via een inhouds-digest-guard; bewezen door pytest
  `test_zaadbeeld_verschijnt_nooit_in_output_crops`.
- AD-1/AD-2 (één nominatiepad): bootstrap schrijft NOOIT rechtstreeks in
  `reference_candidates`/`reference_logos` — uitsluitend via `nominateCandidate`
  (13.2). Bewezen door de guard-test "nomineert NOOIT rechtstreeks in
  reference_candidates".

### High — geen
- AC1-declaratie-guard is HARD en per GTIN: `resolveDeclarations(gtin).reason==='ok'
  && codes.includes(code)`; niet-declarerende GTIN wordt overgeslagen, geteld
  (`skippedNonDeclaring`) en gelogd. Ook `reason!=='ok'` valt af. Twee tests.
- AD-8 (hoofdvlag) + AD-11 (pauze) worden bij job-start gecheckt vóór ENIGE
  DB-read/mutatie; bij skip geen `findMany`, geen ml-call, geen nominatie. Drie tests.

### Medium — 1 gevonden, gefixt
- [bootstrap-run.ts:287] Dode/verwarrende expressie `truncated || search === undefined`
  in het ml-catch-pad (`search` is daar per definitie `undefined`). Vervangen door
  `truncated` — ml-uitval is geen budget-afkap. GEFIXT.

### Low — 2 gevonden, gefixt/afgewogen
- [bootstrap_search.py] `import cv2` verplaatst van module-top naar lazy (binnen de
  functies), zodat de pure `cosine`-drempellogica los te testen is zonder OpenCV
  (cv2 leeft alleen in het Docker-image). GEFIXT (was nodig voor de pure-pytest-eis).
- [bootstrap-run.ts] `candidateGtinsForCode` laadt `take: limit*5` events en
  dedupliceert in geheugen. Begrensd (max 200×5=1000 rijen) en geïndexeerd op
  `t3777Code`; acceptabel. Afgewogen, geen fix nodig.

## Graceful degradation (checklist)
- Zaad ontbreekt → run `leeg` (reden `geen-zaad`), klasse blijft opneembaar.
- Geen kandidaat-GTINs → `leeg` (reden `geen-kandidaat-gtins`).
- ml-zoektocht faalt (zaad onleesbaar / ml onbereikbaar) → `leeg`, fail-closed,
  geen nominaties; klasse blijft opneembaar.
- Onleesbare artwork-pagina → zacht falen per GTIN (ml-side), run gaat door.
- Budget/time-box op → resterende klassen blijven `wachtend` (niet aangeraakt).

## Anti-patterns / dode code / secrets
- Geen secrets, geen debug-statements, geen `console.log`.
- Geen migratie toegevoegd (correct).
- Alle nieuwe ml-code onder `apps/ml-service/app/` (ARCH-3 constraint 2).

## Test-resultaat na fixes
- API vitest (volledig): 754 passed | 2 skipped | 37 todo.
- ml pytest (bootstrap-search): 9 passed.
- tsc --noEmit: schoon. eslint changed files: schoon.
