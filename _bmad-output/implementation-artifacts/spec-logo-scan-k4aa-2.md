---
title: 'K4-aa: ACC-geheugenlimiet ml-service 12G en nieuwe norm lokale vergelijking'
type: 'chore'
created: '2026-10-31'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'fc6730d243a52d4d05318c9565de213c6ec30b02'
context:
  - '/Users/frisovanweelden/Documents/projects/logoRecognition/.claude/worktrees/logo-k4aa/_bmad-output/specs/spec-logo-scan-k4aa/SPEC.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** De ml-service op ACC zit al op 6,57 van 8 GiB; met de K4-aa-route aan (±0,8 GB extra per werker) loopt hij over de limiet. En het vergelijkscript keurt de route nog op de oude norm (≥ 90%), die de spike tegen zichzelf ook niet haalt.

**Approach:** Besluiten Friso 31-10-2026 (SPEC CAP-9 en CAP-8b): in `docker-compose.acc.yml` de ml-service-limiet van 8G naar 12G; `apps/ml-service/scripts/k4aa_vergelijk.py` rekent de nieuwe norm uit: de route wijkt in beide richtingen niet meer af van spike K4-aa run 1 dan spike run 2 van run 1.

## Boundaries & Constraints

**Always:** alleen de ml-service-limiet in `docker-compose.acc.yml`; reservering 2G blijft; norm als functie `norm_geslaagd(route_in_spike, spike_in_route, run2_in_run1, run1_in_run2)` met paren [treffers, totaal], gelijk = geslaagd, totaal 0 = niet geslaagd; de spike-spreiding (run 1 ↔ run 2) rekent het script zelf uit met dezelfde matchregel (zelfde code, IoU ≥ 0,5) op dezelfde etiketten en schrijft hem in `route.json`.

**Never:** `docker-compose.prod.yml` of andere diensten aanpassen; containers, Coolify of ACC aanraken; opnieuw betaalde aanroepen doen (het herberekenen van de norm uit de bestaande `route.json` + spike-uitvoer mag).

</frozen-after-approval>

## Code Map

- `docker-compose.acc.yml` -- ml-service `deploy.resources.limits.memory` (r.160: 8G → 12G); reservations (r.163) niet aanraken.
- `apps/ml-service/scripts/k4aa_vergelijk.py` -- `route()` en `_matched`: `geslaagd` gebruikt nu `>= 0.9`; nieuwe `norm_geslaagd` + spike run1↔run2 via `tel.lees_k4`/`tel.samenvoegen` zoals voor run 1 (`spike(kind, kaart)` leest run 1; run 2 staat in `ruw/<variant>/run2`). Optioneel subcommando om de norm opnieuw te beoordelen uit een bestaande `route.json` zonder aanroepen.
- Tests (al rood): `apps/ml-service/tests/test_k4aa_vergelijk_norm.py`, `apps/api/src/__tests__/routes/logo-scans-k4aa-deploy.atdd.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `docker-compose.acc.yml` -- limiet 12G -- CAP-9.
- [x] `apps/ml-service/scripts/k4aa_vergelijk.py` -- `norm_geslaagd` + spike-spreiding + herbeoordeling zonder aanroepen -- CAP-8b.

**Acceptance Criteria:**
- Given de twee ATDD-bestanden, when de wijziging klaar is, then beide groen en de volledige suites groen.
- Given de bestaande `route.json`, when de norm opnieuw beoordeeld wordt, then staat de uitslag met de spike-spreiding in `route.json` zonder nieuwe aanroepen.

## Implementation Notes

Route-poort: intent gaps geen (besluiten Friso); onomkeerbaar: de limietwijziging gaat na merge op `acc` mee in de automatische Coolify-uitrol (containers opnieuw aangemaakt); omvang 2 bestanden. Route `dispatch`. Goedkeuring vooraf door de opdracht; geen open vragen.

## Spec Change Log

## Review Triage Log

| # | laag | bevinding | oordeel | bewijs / route |
|---|---|---|---|---|
| F1+VG-o1 | blind/vg | normtest noemt 21/25 en 21/27 "gemeten" en verwacht geslaagd | medium | `route.json` en SPEC CAP-8: 22/25, 23/27, niet gehaald → patch |
| F2+E1+VG-o3 | blind/edge/vg | mislukte route-etiketten vallen weg, mislukte run 2 telt als leeg | medium | `_beoordeel` filtert `fout`, `spreiding` zet `r2=[]` → patch (symmetrisch) |
| F3 | blind | ontheffing niet zichtbaar bij `norm` | low | directe correctie (docstring/uitvoer) → patch |
| F4 | blind | `norm` overschrijft oordeel in place | low | directe correctie (`samenvatting_vorige`) → patch |
| F5+VG1 | blind/vg | `spreiding`/`_beoordeel`/`norm` ongetoetst | gap | omwisselen richtingen blijft onopgemerkt → patch (test) |
| F6 | blind | substring-test op "0.9" broos | low | verwijderen → patch |
| F7+VG-o2 | blind/vg | import zet `MAX_IMAGE_PIXELS=None` voor de hele pytest-sessie | medium | `load()` voert moduleniveau uit → patch |
| F8 | blind | `_tel()` laat sys.path groeien | low | directe correctie → patch |
| F9 | blind | `mlBlock` gekopieerd uit wiring-test | low | fix vraagt exporteren uit testbestand; weinig hinder → verworpen |
| F10 | blind | geheugenregex kan in volgend blok lopen | low | `\s+` matcht regeleinden; directe correctie → patch |
| F11 | blind | 12G zonder terugweg | maybe-false | besluit Friso noemt geen einddatum → defer (herzien na de proeven) |
| E2 | edge | `norm` zonder `route.json` → traceback | low | directe correctie → patch |
| E3 | edge | `spike_k4` None in norm-modus → TypeError | low | directe correctie → patch |

## Verification

**Commands:**
- `cd apps/ml-service && MODEL_PATH=/tmp/k4aa-models ~/.cache/logo-k4aa/venv/bin/python -m pytest tests/ -q` -- groen.
- `cd apps/api && npx vitest run` -- groen.
- `cd apps/ml-service && ~/.cache/logo-k4aa/venv/bin/ruff check scripts/k4aa_vergelijk.py && ~/.cache/logo-k4aa/venv/bin/black --check scripts/k4aa_vergelijk.py` -- schoon.
