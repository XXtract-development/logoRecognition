---
id: SPEC-ci-deploy-hetzner-runner
companions:
  - ../../implementation-artifacts/investigations/acc-ci-coolify-onbereikbaar-20261102.md
  - ../../../docs/04-deployment/ci-bouwstraat.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# ACC-uitrol logoRecognition via uitroltak en Coolify-webhook (v3.3)

## Why

Pijn: sinds 21-10-2026 laat `firewall-2` op de Coolify-host alleen Hetzner-servers en GitHub-webhooks door. De job `deploy-acc` in `.github/workflows/build-push.yml` roept vanaf een GitHub-runner de Coolify-API aan, krijgt een connect-timeout, en elke ACC-uitrol moet met de hand. Friso houdt de firewall dicht en koos (02-11) de route via de Coolify-server: de workflow verschuift na de builds een aparte uitroltak, de GitHub-webhook (die wél door de firewall komt) laat Coolify die tak uitrollen. Een eigen runner viel af: de repository is openbaar en het GitHub Free-plan kan een runner niet tot één workflow beperken.

## Capabilities

- **CAP-1**
  - **intent:** Een push naar `acc` rolt na twee geslaagde builds automatisch uit op ACC, zonder handwerk.
  - **success:** `deploy-acc` zet `refs/heads/acc-deploy` op de merge-SHA; Coolify (app op tak `acc-deploy`, automatisch uitrollen aan) start op de webhook een uitrol van die SHA.
- **CAP-2**
  - **intent:** ACC draait altijd precies de images van de uitgerolde commit.
  - **success:** `docker-compose.acc.yml` kiest het app- én ml-image op `SOURCE_COMMIT` (de commit die Coolify uitcheckt) en weigert te starten als die ontbreekt; `deploy-acc` behoudt `needs: [build-app, build-ml]`, dus de tak verschuift pas als beide images met die SHA bestaan.
- **CAP-3**
  - **intent:** Alleen een push (of handmatige start) op `acc` verschuift de uitroltak.
  - **success:** De job draait alleen bij `github.ref == 'refs/heads/acc'` en event `push` of `workflow_dispatch`, op een GitHub-runner; geen job in `.github/workflows/` vraagt een `self-hosted`-runner; de oude stappen "Pin image tag in Coolify" en "Trigger Coolify deployment" bestaan niet meer.
- **CAP-4**
  - **intent:** Terugdraaien naar een eerdere versie werkt zonder toegang tot de Coolify-API.
  - **success:** `docs/04-deployment/ci-bouwstraat.md` beschrijft werking, verificatie van beide containers en rollback: `acc-deploy` op een eerdere acc-merge-SHA (mét deze wijziging) zetten met `gh api`, waarna de webhook uitrolt; de volgende push naar `acc` draait de rollback terug; ghcr moet `:<sha>` van beide images nog hebben.

## Constraints

- De tak heet `acc-deploy`. De verschuiving staat in `.github/scripts/move-acc-deploy-branch.sh` (toetsbaar met een nep-`gh`, zoals `start-ci-minio.sh`) en gebruikt het workflow-token (`permissions: contents: write`):
  - staat `acc` niet meer op `github.sha` (een oude run die opnieuw gestart is), dan verschuift hij niets en meldt dat (groen);
  - staat `acc-deploy` al op `github.sha`, dan meldt hij dat er geen webhook komt en dat opnieuw uitrollen via de knop in Coolify gaat (groen);
  - geeft het lezen van `acc-deploy` 404, dan maakt een `POST` de tak aan; anders `PATCH` met `force`; elke andere lees- of schrijffout maakt de job rood.
- Een push met het workflow-token start geen nieuwe workflowrun; geen workflow luistert op `acc-deploy`. De `concurrency`-groep blijft.
- Gemeten 02-11: geen rulesets of beschermde takken op de repository; `watch_paths` van de app is leeg; geen andere Coolify-app volgt `acc-deploy`.
- De compose gebruikt `${SOURCE_COMMIT:?…}` voor het app- en ml-image: ontbreekt hij, dan faalt de uitrol. Coolify vult `SOURCE_COMMIT` met de uitgecheckte commit zolang er géén gebruikersvariabele met die naam bestaat, en registreert variabelen alleen uit `environment:`/`build.args` (broncode beta.463 gelezen). Daarom mag `SOURCE_COMMIT` in geen enkel `environment:`-blok van de compose staan (regressietest).
- De workflow gebruikt `COOLIFY_URL`/`COOLIFY_TOKEN` niet meer; de secrets blijven staan. De app leest `LOGO_IMAGE_TAG` vóór `SOURCE_COMMIT` als codeversie voor scan-hergebruik (`logo-scan-flow.ts`, `codeVersion()`) en niemand werkt die Coolify-env nog bij; daarom zet de compose in de app-service `LOGO_IMAGE_TAG=` (leeg, letterlijk). De Coolify-env mag blijven staan: alleen een rollback naar een SHA van vóór deze wijziging gebruikt hem.
- Volgorde: (1) merge: de workflow maakt `acc-deploy` aan op de merge-SHA terwijl Coolify nog op `acc` staat (geen uitrol); (2) Friso zet de app op `acc-deploy` en automatisch uitrollen aan; (3) eenmalig handmatig uitrollen in Coolify; (4) de volgende push naar `acc` bewijst de webhook. De tak wordt niet vooraf aangemaakt.
- De eerste echte run moet bewijzen: (a) GitHub stuurt de push-webhook ook als de workflow de tak verschuift, en Coolify start een webhook-uitrol voor `acc-deploy`; (b) beide containers (app en ml-service) op Vanilla draaien images met `org.opencontainers.image.revision` = `SOURCE_COMMIT` = merge-SHA, de `.env` van de app bevat precies één `SOURCE_COMMIT`, en in de app-container is `LOGO_IMAGE_TAG` leeg; (c) blijft de webhook uit, dan is de workflow groen en komt er geen uitrol: handmatig uitrollen in Coolify pakt de kop van `acc-deploy` en dus de juiste SHA. De job schrijft deze controle in zijn stapsamenvatting.
- Tests als `unittest.TestCase` in `.github/tests/` (draait in `ci-cd.yml`, houdt de uitrol niet tegen); PyYAML leest de sleutel `on` als `True`, dus toets `jobs`. `docker compose config` bewijst de interpolatie met en zonder `SOURCE_COMMIT`; actionlint draait via docker.

## Non-goals

- De firewall wijzigen; een eigen runner.
- Terug naar bouwen door Coolify; de build-jobs wijzigen.
- Wachten op of melden van de afloop van de Coolify-uitrol in de workflow.
- Secrets opruimen.
- Bewaking die een uitgebleven uitrol meldt (opvolgpunt).
- HR-portal (rolt uit via ArgoCD); uitrol naar `main`/productie.

## Success signal

- De eerste push naar `acc` na de instellingen en de merge geeft een groene `deploy-acc`, een webhook-uitrol van `acc-deploy` in Coolify, en `docker inspect` op Vanilla toont `org.opencontainers.image.revision` gelijk aan die merge-SHA, zonder handmatige stap.
