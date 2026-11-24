---
title: 'Reviewbevindingen Nutri-Score ACC-test doorvoeren (PR #32, #33)'
type: 'bugfix'
created: '2026-11-24'
status: 'done'
baseline_commit: '1ee454c80ebffc04e0c4be5632249628e4cd998c'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '/Users/frisovanweelden/Documents/projects/logoRecognition/.claude/worktrees/nutriscore-review/_bmad-output/implementation-artifacts/reviews/nutriscore-acc-review-20261124.md'
  - '/Users/frisovanweelden/Documents/projects/logoRecognition/.claude/worktrees/nutriscore-review/_bmad-output/specs/spec-nutriscore-acc-test/SPEC.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** De `bmad-review` op `b07d008..1ee454c` vond o.a. dat een EXTRA-afnemer met de naam van een bestaande afnemer diens scans kan lezen, dat kapotte EXTRA-waarden per aanvraag de logs vullen onder het verkeerde label, en dat het meetscript breekbaar is (niet-atomair hervatten, ongecontroleerde JPEG-grootte, redirect lekt sleutel, `LOGO_KEY` afgekapt, rapport mist wat CAP-3 eist). Documentatie spreekt zichzelf tegen.

**Approach:** Elke bevinding uit het reviewverslag doorvoeren (ID's A/E/V/S), met eerst een rode test per codebevinding. Bevinding A5 (scoren op `items` i.p.v. `detections`) is een meetdefinitiekeuze en valt buiten deze spec; teruggelegd bij de orchestrator. E9 wordt verworpen: de server doet zelf `convert("RGB")` (`apps/ml-service/app/api/detection.py:101`), dus het script moet hetzelfde doen.

## Boundaries & Constraints

**Always:** Sleutelwaarden nooit in logs, uitvoer of bestanden; waarschuwingen noemen alleen variabele, index of afnemernaam. Vergelijken blijft timing-safe over alle items. `n8n-acc` in `LOGO_PIPELINE_KEYS` blijft exact werken. Fail closed.

**Never:** Coolify-variabelen, n8n-flow of -credentials aanraken; containeracties; migraties; meting opnieuw draaien op ACC; A5 bouwen.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error Handling |
|---|---|---|---|
| Naambotsing | main `n8n-acc:k1`, EXTRA `n8n-acc:k2` | `k2` → null; `k1` → `n8n-acc` | warn `LOGO_PIPELINE_KEYS_EXTRA entry ignored (name already in LOGO_PIPELINE_KEYS)` met `{name}` |
| Dubbele sleutel | main `a:k1`, EXTRA `b:k1` | `k1` → `a` | warn met namen, nooit sleutel |
| Lege/spatie EXTRA, komma aan eind | `'  '`, `'b:k,'` | geen extra / `b` werkt | geen waarschuwing |
| Kapot EXTRA-item | `'garbage'` | genegeerd | warn met label `LOGO_PIPELINE_KEYS_EXTRA` |
| Herhaalde aanvragen, zelfde config | 3× resolve | waarschuwing 1× | memo op ruwe waarden |
| `LOGO_KEY` met `:` | `LOGO_KEY=a:b` | sleutel `a:b` | — |
| Corrupt antwoordbestand | half JSON | opnieuw versturen | — |
| Beeld ontbreekt | id zonder png | geen antwoord | `_fouten/<id>.json` |
| JPEG te groot | ook bij lage kwaliteit > limiet | niet versturen, geen antwoord | `_fouten/<id>.json` fase `verkleinen` |
| 503/429 | eerste POST's | herhalen (max 3) | daarna geen antwoord + fout vastgelegd |
| Redirect | 3xx | geen volgen | status als fout |
| `detections`/`t3777_code` null | | geen crash | — |
| Waarheid `a`, `X`, status ≠ bevestigd | | normaliseren / weglaten | — |

</frozen-after-approval>

## Code Map

- **Werkmap:** alle paden zijn relatief aan de worktree `/Users/frisovanweelden/Documents/projects/logoRecognition/.claude/worktrees/nutriscore-review` (tak `fix/nutriscore-acc-review`). Werk en draai tests alleen daar; de hoofdmap bevat ongecommit werk van anderen. Niet committen. De rode tests (ATDD) staan al in beide testbestanden: maak ze groen zonder de verwachtingen te wijzigen.
- `apps/api/src/services/pipeline/logo-pipeline-keys.ts` -- `parseLogoPipelineKeys` (label-param), `resolveLogoPipelineConsumer` (botsingsfilter, memo). Callers: `api/v1/logo-scans.ts:29` (ongewijzigd).
- `apps/api/src/__tests__/routes/logo-scans-keys-extra.test.ts` -- nieuwe gevallen; route-helper zoals `logo-scans-auth.test.ts:13-18`.
- `apps/api/src/__tests__/routes/logo-scans-auth.test.ts` -- bestaand, moet groen blijven.
- `scripts/nutriscore_measure.py` / `scripts/test_nutriscore_measure.py` -- script en tests.
- `.github/workflows/ci-cd.yml:243-249` -- python-job; stap voor script-pytest toevoegen.
- `.env.example:58-65`, `docs/02-architecture/api-specification.md:359-360`, `_bmad-output/specs/spec-nutriscore-acc-test/SPEC.md` -- teksten.

## Tasks & Acceptance

**Execution:**
- [x] `logo-pipeline-keys.ts` -- A1/A2/A4/E1-E4: label per variabele; lege waarde/delen stil; EXTRA-item met naam of sleutel uit hoofdlijst weigeren + warn (naam); memo op `(main, extra)`.
- [x] `logo-scans-keys-extra.test.ts` -- V3: tests voor matrixrijen 1-5 en route-401 voor botsende sleutel.
- [x] `nutriscore_measure.py` -- A6-A9, A12-A14, A16, E5-E8, E10-E13: `load_truth`; null-veilige `extract_letters(result, methods)`; atomair schrijven, corrupt = afwezig; ontbrekend beeld; `shrink` q95 zonder subsampling, omlaag tot q60, anders niet versturen; 503/429 herhalen; `_fouten/<id>.json`; opener zonder redirects; `LOGO_KEY` kaal; `run` geeft ruwe resultaten; rapport met telling per methode, per-methode-tabellen, origineel/herschaald-split, modelversie-telling (+ waarschuwing bij >1), voorbehoud-regel.
- [x] `test_nutriscore_measure.py` -- V2/V4 + tests voor elke scriptbevinding.
- [x] `ci-cd.yml` -- V1: `python -m pytest scripts/test_nutriscore_measure.py -q`.
- [x] `.env.example`, `api-specification.md` -- A3/S9/S10.
- [x] `SPEC.md` -- A15, A16, S5-S8.

**Acceptance Criteria:**
- Given alle matrixrijen, when de gerichte tests draaien, then ze zijn eerst rood (vóór bouw) en daarna groen.
- Given een volledige `main()`-run met een nep die headers terugkaatst, then de sleutel staat niet in stdout, stderr of enig bestand onder `--out`.
- Given bestaande `logo-scans-*.test.ts`, then die blijven groen.

## Implementation Notes

- Route-poort (step-02): intent-gaten = alleen A5 (meetdefinitie), buiten scope gezet en teruggelegd; onomkeerbaar = geen in de code (push/merge naar acc valt onder de staande ACC-vrijgave); omvang = 9 bestanden, geen nieuwe publieke API → `dispatch`. Checkpoint 1: goedgekeurd via de opdracht van de orchestrator ("voer alle bevindingen door").

## Spec Change Log

## Review Triage Log

Ronde 1 (lagen: blind-hunter, edge-case-hunter, verification-gap; Opus). Alle overlevers → `patch`, terug naar de bouwagent.

| # | Laag | Bevinding | Oordeel | Bewijs / route |
|---|---|---|---|---|
| 1 | blind, edge (claim) | `test_main_never_shows_the_key` gebruikt geen nep die de sleutel terugkaatst (AC) | medium | `Fake` krijgt de sleutel nooit terug in een antwoord; afwijking van de AC. patch |
| 2 | blind | Trace-bevindingen A10/A11/V5/S1-S4 niet gedaan, triage leeg | false | Geen gebrek in de code. Trace komt in de volgende stap van de keten (`bmad-testarch-trace`); de triage wordt in stap 5 ingevuld |
| 3 | blind, edge, vg-other | `shrink` hergebruikt een oude q90 4:2:0-JPEG bij hervatten | medium | Zelfde pad `_jpeg/<id>.jpg` als de oude versie (r.145). patch |
| 4 | blind, edge (claim) | `load_truth`: ontbrekende status telt als bevestigd; letters buiten A–E verdwijnen stil; een string als waarde wordt per teken gelezen | medium | Wijkt af van de matrixregel "status ≠ bevestigd → weglaten". patch |
| 5 | blind | Rapport zegt niet dat er op ruwe `detections` gescoord wordt | low | Directe toevoeging van één regel; zinvol zolang A5 open is. patch |
| 6 | blind, edge | Eén schrijffout of PIL-fout breekt de hele run | medium | Een exception in `one()` loopt via `ex.map` naar boven. patch |
| 7 | blind, edge | `Retry-After` genegeerd; POST 0/502/504 niet herhaald; 429 en 302-via-run niet getest | medium | `_post_retry` met een vaste wachttijd (r.162-167). patch |
| 8 | blind, edge | Dubbele sleutel binnen EXTRA (en binnen de hoofdlijst) blijft stil | medium | `keyOwner` wordt niet bijgewerkt na accept (r.41-51). patch. Binnen de hoofdlijst alleen waarschuwen, gedrag ongewijzigd |
| 9 | blind | Geen regel in `versions.md` | low | Wordt bij de commit toegevoegd (staat buiten de bouw). patch bij de commit |
| 10 | blind | Route-test lekt de server bij een fout; memo zonder reset | low | try/finally: patch. Memo-reset: verworpen (low; een fix voegt publieke API toe; de tests gebruiken bewust unieke waarden, staat in een commentaar) |
| 11 | edge | `done` met onbruikbare `logoResults` wordt als done bewaard en nooit opnieuw verstuurd | medium | `_write_json` vóór de `_usable`-controle. patch |
| 12 | edge | 401/403 verstuurt toch alle 352 etiketten | medium | Geen stop op weigering. patch |
| 13 | vg | Per-methodetabellen alleen op koppen getoetst | medium (gap) | Bewijs in de laag zelf (gemuteerd, 25/25 groen). patch |
| 14 | vg | Splitsing origineel/herschaald en de berekening in `main()` niet getoetst | medium (gap) | Bewijs in de laag zelf. patch |
| 15 | vg | Pad "niet te verkleinen" in `run()` niet getoetst | medium (gap) | Bewijs in de laag zelf. patch |
| 16 | vg-other | Versiewaarschuwing ziet geen wissel van gewichten (`modelVersion` = env-label) | low | `api-specification.md:388`. Directe uitbreiding: ook de basis van `referenceVersion` en een voorbehoud. patch |

## Verification

**Commands:**
- `cd apps/api && npx vitest run src/__tests__/routes/logo-scans-` -- alles groen
- `cd apps/api && npx tsc --noEmit` -- geen fouten (geen `typecheck`-script)
- `python3 -m pytest scripts/test_nutriscore_measure.py -q` -- alles groen
