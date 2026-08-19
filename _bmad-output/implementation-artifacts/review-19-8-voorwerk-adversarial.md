# Adversarial review — voorwerk story 19.8 (story + ATDD-test + roadmap 19.9/19.10)

Datum: 2026-07-07. Targets: `19-8-fase1-bootstrap-crops-naar-review.md` + `flywheel-review-routing-19-8.atdd.test.ts` + `sprint-change-proposal-2026-07-07.md`.

## Geverifieerde feiten
- `nomination.ts:133` — `if (origin !== 'review')` omzeilt de 0,90-promotie-drempel (correct).
- `bootstrap-run.ts:409` — `status = res.nominated > 0 ? 'gevuld' : 'leeg'` → een review-routed crop markeert de klasse `gevuld`.
- Callers geven expliciet `origin: 'bootstrap'` (`bootstrap-run.ts:393`, `balanced-sampler.ts:297`).
- `guardrails.ts:49` — `CLONE_GAP_SOURCES = ['flywheel-promotion', 'review']` → herkomst `review` heeft speciaal guardrail-gedrag.

## Bevindingen + afhandeling
| # | Ernst | Bevinding | Afhandeling |
|---|-------|-----------|-------------|
| 1 | Midden-Hoog | Premature `gevuld`: review-routed crop → klasse verlaat de bootstrap-wachtrij; bij volledige review-afkeuring blijft de klasse leeg maar `gevuld` (nooit her-gebootstrapt). | **Fixed in story** — nieuwe AC/Task: klasse pas definitief `gevuld` bij ≥1 BEVESTIGDE ECHT-crop, óf her-queue bij review-afkeuring; review-pending telt niet als definitief gevuld. |
| 2 | Midden | Test-/fix-lek: test toetst de default, callers overriden met `bootstrap`. | **Fixed** — story: fix MOET caller-overrides weghalen; ATDD-test uitgebreid met een caller-pad-assertie (processClass/sampler → `review`). |
| 3 | Midden | `review`-herkomst is speciaal (guardrails clone-gap); overloaden koppelt bootstrap-crops aan review-guardrail-gedrag. | **Fixed in story** — expliciete ontwerpbeslissing: `bootstrap-review` (aparte herkomst) vs `review` (hergebruik), met de guardrails-koppeling als afweging; dev kiest gemotiveerd. |
| 4 | Laag | Class-cap kan vollopen met pending kandidaten. | **Fixed in story** — verificatietaak toegevoegd. |
| — | Info | 19.9 (ranking-switch) groter dan de one-liner; roadmap, detailleren bij aanvang. | — |

## Verdict
**PASS met verwerkte fixes.** Bevinding 1 (premature `gevuld`) is geen story-detail maar een correctheidsvoorwaarde — nu expliciet in de ACs. Klaar voor dev-story ná de fixes.
