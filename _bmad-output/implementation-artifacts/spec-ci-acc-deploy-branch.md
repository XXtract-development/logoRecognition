---
title: 'ACC-uitrol via uitroltak acc-deploy en de Coolify-webhook'
type: 'bugfix'
created: '2026-11-02'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'af065152fd980df2f3d462544f9588d51c1d6fa8'
context:
  - '{project-root}/_bmad-output/specs/spec-ci-deploy-hetzner-runner/SPEC.md'
  - '{project-root}/_bmad-output/test-artifacts/atdd-checklist-ci-deploy-hetzner-runner.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sinds 21-10-2026 laat `firewall-2` alleen Hetzner-servers en GitHub-webhooks door naar de Coolify-host; de job `deploy-acc` roept vanaf een GitHub-runner de Coolify-API aan en faalt met een connect-timeout, waardoor elke ACC-uitrol handwerk is.

**Approach:** (besluit Friso, 02-11) Na beide image-builds verschuift de workflow de tak `acc-deploy` naar de commit; Coolify volgt die tak met automatisch uitrollen en rolt uit op de GitHub-webhook; de compose kiest app- en ml-image op de door Coolify uitgecheckte commit (`SOURCE_COMMIT`).

## Boundaries & Constraints

**Always:** `needs: [build-app, build-ml]` blijft; job alleen bij `refs/heads/acc` en event `push`/`workflow_dispatch`, op `ubuntu-latest`, `permissions: contents: write`; elke schrijffout maakt de job rood; een oude (herstarte) run verschuift de tak nooit terug; compose faalt dicht zonder `SOURCE_COMMIT`; `SOURCE_COMMIT` staat in geen `environment:`/`build`-blok.

**Never:** Coolify-API aanroepen vanuit de workflow; eigen runner; firewall, secrets of Coolify-instellingen wijzigen; de tak `acc-deploy` vóór de merge aanmaken; build-jobs of andere workflows wijzigen; push of merge vanuit deze run.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Normaal | acc = SHA, acc-deploy = ouder | PATCH force naar SHA, samenvatting met controle-instructie | n.v.t. |
| Eerste keer | acc-deploy bestaat niet (404) | POST maakt tak op SHA | fout → rood |
| Oude rerun | acc ≠ SHA | niets schrijven, melding, groen | n.v.t. |
| Zelfde SHA | acc-deploy = SHA | niets schrijven, melding "geen webhook; gebruik Coolify-knop", groen | n.v.t. |
| Schrijffout | PATCH/POST faalt (403/422/5xx) | job rood | exit ≠ 0 |
| Leesfout | acc onleesbaar of acc-deploy-lezing faalt anders dan 404 | niets schrijven, rood | exit ≠ 0 |
| Geen SHA | `DEPLOY_SHA` leeg | niets schrijven, rood | exit ≠ 0 |

</frozen-after-approval>

## Code Map

- `.github/workflows/build-push.yml` r.95-119 -- job `deploy-acc`: twee curl-stappen naar Coolify vervangen door checkout + script; rest van het bestand (concurrency r.9-12, build-jobs) ongemoeid.
- `.github/scripts/start-ci-minio.sh` -- bestaand patroon voor een toetsbaar fail-closed hulpscript (`set -euo pipefail`, nep-binaries in tests). Nieuw: `.github/scripts/move-acc-deploy-branch.sh`.
- `docker-compose.acc.yml` r.72-75 (app) en r.121-122 (ml-service) -- `image:` van `${LOGO_IMAGE_TAG:-acc}` naar `${SOURCE_COMMIT:?…}`; commentaar CI-1 bijwerken; verder niets.
- `docs/04-deployment/ci-bouwstraat.md` -- volledig bijwerken: werking, verificatie (app én ml-service), rollback via `gh api` met grenzen, eerste-run-bewijs.
- `.github/tests/test_acc_deploy_branch.py` -- acceptatietests (ATDD, rood vastgelegd); niet aanpassen om groen te krijgen.
- Coolify-gedrag (gelezen, beta.463): `SOURCE_COMMIT` alleen gezet als er geen gebruikersvariabele met die naam is; parser registreert alleen `environment:`/`build.args`.

## Tasks & Acceptance

**Execution:**
- [x] `.github/scripts/move-acc-deploy-branch.sh` -- nieuw: leest `REPO`, `DEPLOY_SHA`; GET kop `acc` en `acc-deploy` via `gh api … --jq .object.sha`; gedrag volgens matrix; schrijft naar `$GITHUB_STEP_SUMMARY` -- toetsbare, luid falende takverschuiving.
- [x] `.github/workflows/build-push.yml` -- `deploy-acc`: `if`, `permissions`, checkout, één stap met het script (env `GH_TOKEN: ${{ github.token }}`, `REPO`, `DEPLOY_SHA: ${{ github.sha }}`); curl-stappen weg -- Coolify-API is onbereikbaar.
- [x] `docker-compose.acc.yml` -- beide images op `${SOURCE_COMMIT:?…}` -- image = uitgecheckte commit, dicht falen.
- [x] `docs/04-deployment/ci-bouwstraat.md` -- runbook herschrijven -- CAP-4.

**Acceptance Criteria:**
- Given een push naar `acc` en twee geslaagde builds, when `deploy-acc` draait, then staat `acc-deploy` op de merge-SHA en is de job groen.
- Given de nieuwe compose, when Coolify `acc-deploy` uitrolt, then draaien app en ml-service `ghcr.io/…:<SOURCE_COMMIT>`, en zonder `SOURCE_COMMIT` start niets.
- Given de workflowbestanden, when ze gelezen worden, then bestaat er geen Coolify-API-aanroep, geen `self-hosted`-runner en geen trigger op `acc-deploy`.
- Given het runbook, when iemand terug moet, then beschrijft het rollback via `gh api` op `acc-deploy`, de grenzen ervan, en de controle van beide containers.

## Implementation Notes

Route-poort (02-11): intent gaps — geen (keuzes vastgelegd door Friso in SPEC v3.1); irreversibles — ja: na merge maakt/verschuift de workflow een tak op GitHub en start (na de Coolify-instellingen) uitrollen; footprint — 4 bestanden, 1 nieuw script dat de workflow aanroept. Route: `dispatch`.

Checkpoint 1: geen open vragen; ~1400 tokens. Goedkeuring "approve and continue" volgt uit de orchestrator-briefing (Friso koos route 1 op 02-11 en droeg op de keten door te lopen tot een PR).

Bouw (subagent a01b9f3b): script, workflow, compose, runbook. Nagekomen gat, zelf gedicht: de app leest `LOGO_IMAGE_TAG` vóór `SOURCE_COMMIT` als codeversie (`apps/api/src/services/pipeline/logo-scan-flow.ts` `codeVersion()`); runbook en `.env.example` zeggen nu dat de Coolify-env weg moet (instelling voor Friso). Containernamen `app-qsoo…`/`ml-service-qsoo…` en `.env`-pad op Vanilla gemeten 02-11. `deploy-coolify.yml` (main/staging, Coolify-webhook-URLs) valt buiten deze route en blijft ongemoeid.

Review-patches (zelfde subagent a01b9f3b, na triage): compose `LOGO_IMAGE_TAG=` in de app-service, aangescherpte tests (+1), runbook-grenzen, commentaar `codeVersion()`. Verificatie 02-11: `python3 -m unittest discover -s .github/tests -v` → 35/35 OK (geen skips); actionlint `build-push.yml` → 0; shellcheck script → 0; `npx vitest run src/__tests__/routes/logo-scans-dedupe.test.ts` (apps/api) → 41/41.

## Spec Change Log

## Review Triage Log

Lagen: blind-hunter, edge-case-hunter, verification-gap (alle drie gedraaid, geen overgeslagen). Diff: `/tmp/ci-review-diff-1793616514.diff` (58 kB).

| # | Laag | Bevinding | Verdict | Bewijs | Route |
|---|---|---|---|---|---|
| 1 | blind | `if`-test controleert alleen substrings, niet de combinatie | medium | Een `||`-variant zou op `main` de tak verschuiven en blijft groen | patch (exacte expressie) |
| 2 | blind | stale-rerun-test accepteert elke uitvoer met "acc" | low | `assertIn('acc', …)` matcht bijna alles | patch |
| 3 | blind | samenvattingsblok "Controle na deze run" ongetest | low | test controleert alleen SHA en "Coolify" | patch |
| 4 | blind | handmatige Redeploy kan `SOURCE_COMMIT=HEAD/unknown` geven | maybe-false | Broncode r.1991-2160 vervangt HEAD door de echte commit; niet waargenomen bij handmatige uitrol. Een `:HEAD`-pull faalt luid. Te beslechten door stap (3) van de volgorde | patch (runbook: controle na stap 3) |
| 5 | blind | rollback naar oude SHA zonder `LOGO_IMAGE_TAG` trekt stil `:acc` | low | oude compose `${LOGO_IMAGE_TAG:-acc}` | patch (runbook) |
| 6 | blind+edge | rerun/dispatch van de laatste run maakt een rollback ongedaan | low | `acc` = die SHA, dus de stale-wacht laat hem door | patch (runbook) |
| 7 | blind | E34 als VERIFIED gelabeld zonder waarneming | low | alleen broncode gelezen | patch (VERIFIED/INFERENCE gesplitst) |
| 8 | blind | E33-claim over variabelen zonder query | low | query ontbrak | patch (query + uitkomst 0 van 72 toegevoegd) |
| 9 | blind | statusregel onderzoek verouderd | low | sectie 2 eindigde met "nog geen codewijziging" | patch |
| 10 | blind | versieverwijzingen v3.1 vs v3.2 | low | docstring, checklist, runbook | patch (alles naar v3.3) |
| 11 | blind | namen verwijzen nog naar runner-route | low | slug is stabiele identiteit van de spec (memlog); hernoemen raakt alle verwijzingen | verworpen (low, fix meer dan directe correctie; titel noemt de route) |
| 12 | blind | triage-/verificatiebewijs ontbreekt | false | wordt in deze stap geschreven; groene run en lint in step-05/trace | verworpen |
| 13 | blind | handmatige "Run workflow" op ongewijzigde acc rolt niets uit | low | script meldt het, runbook zegt het niet volledig | patch (runbook) |
| 14 | edge | race tussen acc-check en geforceerde PATCH | false | oudere run zet hooguit tijdelijk de toen-actuele SHA; de nieuwere run (concurrency, needs) zet hem daarna vooruit; blijvend terug kan niet | verworpen |
| 15 | edge | rollback met teruggezette `LOGO_IMAGE_TAG` → app meldt rollback-SHA als codeversie | medium | `codeVersion()` leest `LOGO_IMAGE_TAG` eerst | patch, zelfde oorzaak als 18 |
| 16 | edge | trigger-test mist globs/`on: push` zonder takken | low | push met workflow-token start geen runs; test is alleen regressiewacht | verworpen (low, fix voegt fnmatch-logica toe) |
| 17 | edge | AC "geen Coolify-API-aanroep in de workflowbestanden" klopt niet voor `deploy-coolify.yml` | low | dat bestand (main/staging) faalt al sinds 2025; buiten de ACC-route | defer (bestaand probleem) |
| 18 | vg | `codeVersion()` geeft na elke uitrol de oude pin `8c9373d…` | high | Coolify-env bevat de pin (E33); niemand werkt hem bij | patch: compose zet `LOGO_IMAGE_TAG=` leeg in de app-service |
| 19 | vg | PATCH-test onderscheidt `-F` niet van `-f` | low | substring `force=true` | patch |
| 20 | vg | geen test op checkout vóór het script | medium | checkout weghalen blijft groen, eerste run rood | patch |
| 21 | vg | commentaar `codeVersion()` verouderd | low | zegt dat `SOURCE_COMMIT` de checkout volgt, niet het image | patch (alleen commentaar) |

## Verification

**Commands:**
- `python3 -m unittest discover -s .github/tests -v` -- expected: alle tests groen (ook bestaande `test_ci_release_environment.py`).
- `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -color` -- expected: geen fouten in `build-push.yml`.
- `bash -n .github/scripts/move-acc-deploy-branch.sh` en `shellcheck` via docker -- expected: schoon.

**Manual checks (if no CLI):**
- Na merge en Coolify-instellingen: zie SPEC v3.1 "eerste echte run" (a)-(c).
