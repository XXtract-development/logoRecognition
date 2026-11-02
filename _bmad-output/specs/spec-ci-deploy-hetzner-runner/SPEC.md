---
id: SPEC-ci-deploy-hetzner-runner
companions:
  - ../../implementation-artifacts/investigations/acc-ci-coolify-onbereikbaar-20261102.md
  - ../../../docs/04-deployment/ci-bouwstraat.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# ACC-uitrol logoRecognition via eigen runner in het Hetzner-netwerk

## Why

Pijn: sinds 21-10-2026 laat `firewall-2` op de Coolify-host alleen Hetzner-servers en GitHub-webhooks door. De job `deploy-acc` in `.github/workflows/build-push.yml` draait op een GitHub-runner, krijgt een connect-timeout, en elke ACC-uitrol moet met de hand. Friso houdt de firewall bewust dicht en wil de oplossing die andere repo's gebruiken: dqs-service (PR #218) draait de uitrolstap op een eigen runner op coolify-build, die wél door de firewall mag.

## Capabilities

- **CAP-1**
  - **intent:** Een push naar `acc` rolt na twee geslaagde builds automatisch uit op ACC, zonder handwerk.
  - **success:** `deploy-acc` vraagt een runner met labels `self-hosted`, `hetzner-acc`, `logo-acc`; beide API-stappen slagen; Coolify toont een API-uitrol voor de merge-SHA.
- **CAP-2**
  - **intent:** ACC draait altijd precies de images van de gepushte commit (de SHA-pin uit CI-1).
  - **success:** `deploy-acc` behoudt `needs: [build-app, build-ml]` en zet `LOGO_IMAGE_TAG` op `github.sha` in een stap vóór de deploy-trigger.
- **CAP-3**
  - **intent:** De eigen runner voert alleen de uitrol van `acc` uit, nooit code uit pull requests of andere takken.
  - **success:** De runner hangt in een runnergroep die alleen `XXtract-development/logoRecognition/.github/workflows/build-push.yml@refs/heads/acc` toelaat (instelling, manifest). In de code: de job draait alleen bij `github.ref == 'refs/heads/acc'` en event `push` of `workflow_dispatch`; als regressiewacht vraagt geen andere job in `.github/workflows/` een `self-hosted`-runner.
- **CAP-4**
  - **intent:** Een onbereikbare Coolify houdt de runner niet lang bezet en eindigt als duidelijke fout.
  - **success:** `timeout-minutes: 5`; elke `curl` met `-fsS --connect-timeout 10 --max-time 60`; `shell: bash` met `set -euo pipefail`; een fout maakt de job rood.

## Constraints

- De repository is openbaar. Vóór de runner aangaat: fork-PR-goedkeuring op "alle externe bijdragers" én de runnergroep-beperking uit CAP-3 (GitHub-instellingen, door Friso).
- De bestaande runner `coolify-build-acc` is aan dqs-service gebonden; logoRecognition krijgt een eigen runner op coolify-build met eigen gebruiker, map en service (serveractie, door Friso).
- Volgorde verplicht: (1) goedkeuringsinstelling, (2) runner geregistreerd en online met de drie labels, (3) merge, (4) de eerste push is het bewijs. Een offline runner laat de job tot 24 uur in de wachtrij staan zonder rode melding; `timeout-minutes` telt die wachttijd niet.
- `COOLIFY_URL`/`COOLIFY_TOKEN` blijven ongewijzigd; `https://coolify.xxtract.com` antwoordt vanaf coolify-build. Het token staat nooit in een log, procesargument of scriptbestand: het komt binnen via `env:` en gaat via stdin naar `curl -H @-`.
- De job krijgt `permissions: {}` en gebruikt alleen bash en curl (geen checkout, docker of node; de runner-gebruiker heeft geen docker-rechten). `bash` en `curl` 8.5.0 staan op coolify-build (gemeten 02-11).
- Toetsing is statisch: pytest leest de YAML (let op: PyYAML leest de sleutel `on` als `True`; toets `jobs`), en actionlint met `.github/actionlint.yaml` dat de labels `hetzner-acc` en `logo-acc` kent. De echte run is pas na merge te bewijzen.
- `docs/04-deployment/ci-bouwstraat.md` beschrijft: welke runner waar, de vereiste instellingen, het offline-gedrag met statuscommando, en dat een rollback via de API alleen vanaf kantoor of een Hetzner-host werkt.

## Non-goals

- De firewall wijzigen of GitHub-runner-adressen toelaten.
- Terug naar bouwen door Coolify op de webhook.
- De build-jobs naar de eigen runner verplaatsen.
- Wachten op de afloop van de Coolify-uitrol (gedrag blijft als CI-1: de trigger zet hem in de wachtrij).
- Secrets naar een GitHub-environment verplaatsen (opvolgpunt; de blootstelling aan andere takken bestond al).
- HR-portal (rolt uit via ArgoCD, niet geraakt); uitrol naar `main`/productie; secrets roteren.

## Success signal

- De eerste push naar `acc` na de instellingen en de merge geeft een groene `deploy-acc` op de eigen runner, en `docker inspect` op Vanilla toont `org.opencontainers.image.revision` gelijk aan die SHA (handmatige controle na merge), zonder handmatige uitrolstap.

## Open Questions

- De runnergroep-beperking uit CAP-3 bestaat niet op het GitHub Free-plan van de organisatie. Gaat de eigen runner door met alleen fork-goedkeuring voor alle externe bijdragers, wordt de repository privé, of kiezen we de route via een uitroltak en de Coolify-webhook? Besluit Friso; CAP-3 wordt daarna herschreven.
