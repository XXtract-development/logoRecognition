# Story CI-1: Deploy via prebuilt GHCR-images (bouwstraat optie A)

Status: done — alle 5 AC's live bewezen (2026-06-07); zie Dev Agent Record

## Story

As a ontwikkelteam,
I want dat een push naar `acc` de images in CI bouwt en Coolify alleen nog pullt,
so that een deploy van ~16 minuten naar ~1-2 minuten gaat en iteraties (kalibratie, Epic 10) niet meer wachten op compose-rebuilds.

## Feiten (geverifieerd 2026-06-07)

- `.github/workflows/build-push.yml` bestaat en is **groen op elke acc-push**: bouwt en pusht `ghcr.io/xxtract-development/logo-recognition-app:{acc,sha}` en `-ml:{acc,sha}` — de CI-helft staat er al
- De GHCR-packages zijn **private** → Vanilla heeft pull-auth nodig
- Coolify deployt nu op de git-webhook en **bouwt lokaal** (compose `build:`-blokken) — vandaar de 16 min; webhook-timing racet bovendien met de Actions-build
- `COOLIFY_TOKEN` + `COOLIFY_URL` staan in de team-secrets (`~/claude-team-config/secrets/.env`) — bruikbaar als GitHub-repo-secrets voor de deploy-trigger
- Coolify ondersteunt géén build-server voor compose-apps (optie B vervalt, eerder vastgesteld)
- **Vanilla heeft al een wérkende ghcr-login** (classic token, user xxtract, in de root-docker-config) — pull-auth bestaat dus al; least-privilege-rotatie is een apart, optioneel punt
- Coolify gebruikt aantoonbaar `docker-compose.acc.yml` voor deze app (containerlabel-verificatie) · van de overige 6 workflows deployt/bouwt er géén op acc (alleen ci-cd.yml verspilt acc-test-compute — onderhoudspunt, buiten scope)
- Imagegroottes: ml ≈ 6,4 GB, app ≈ 3,7 GB → de éérste GHCR-pull is zwaar; daarna host-layer-cache

## Ontwerpbeslissingen (te bevriezen ná adversarial review)

1. **Bouwer blijft `build-push.yml`**, uitgebreid met: (a) **workflow-niveau** `concurrency: deploy-${{ github.ref }}` + `cancel-in-progress: true` (dekt óók de deploy-job — bevinding 6), (b) registry/GHA-layer-cache voor beide images, (c) **`docker/metadata-action@v5` + OCI-labels** op beide builds (🔴-bevinding 1: zonder labels is de image==commit-verificatie onhaalbaar), (d) een `deploy`-job ALLEEN voor `acc`, met `needs: [build-app, build-ml]`, die éérst de Coolify-env `LOGO_IMAGE_TAG` op de merge-SHA zet (API) en dán de deploy triggert (`POST $COOLIFY_URL/api/v1/deploy?uuid=qsookwow8koko0kwg00g0cwk`, Bearer uit repo-secrets, nooit in logs).
2. **`docker-compose.acc.yml` wordt pull-only mét SHA-pinning (bevinding 3-upgrade):** `image: ghcr.io/xxtract-development/logo-recognition-{app,ml}:${LOGO_IMAGE_TAG:-acc}` + `pull_policy: always`. Daarmee pullt élke deploy (ook handmatig via UI/MCP) exact de laatst gepinde merge-SHA — geen half-gepushte `:acc`-paren mogelijk. Runtime-gedrag (env_file, healthchecks, mounts, resources) ongewijzigd.
3. **Coolify git-auto-deploy UIT** voor deze app: de Actions-trigger is voortaan de enige **geautomatiseerde** deploy-aanleiding (bevinding 4: UI/MCP-deploys blijven mogelijk en zijn door de SHA-pin veilig). Expliciete config-stap, gedocumenteerd en omkeerbaar.
4. **GHCR-pull-auth op Vanilla**: de bestaande werkende ghcr-login wordt geverifieerd en hergebruikt (bevinding 2). Least-privilege-rotatie (token met uitsluitend pull-rechten op deze packages) is een gedocumenteerd opvolgpunt voor Friso — géén blocker; "fine-grained" wordt niet voorgeschreven (onbewezen voor org-packages). Docs reproduceren nooit docker-config-inhoud (bevinding 12).
5. **Rollback-procedure**: rollback = `LOGO_IMAGE_TAG` op een eerdere **acc-merge-SHA** zetten (bevinding 9: zoals zichtbaar in de Actions-historie) + deploy. Procedure in `docs/04-deployment/` + eenmaal geoefend als AC.
6. **`main`-branch**: images blijven gebouwd (bestaand gedrag), maar GEEN auto-deploy-trigger (alleen acc; prod-bouwstraat buiten scope).
7. **Implementatie-volgorde (load-bearing, bevinding 8):** (i) workflow-uitbreiding mergen → images mét labels bestaan; (ii) compose pull-only + `LOGO_IMAGE_TAG`-env aanmaken in Coolify; (iii) git-auto-deploy uit; (iv) eerste pull-only deploy **mét expliciete bevestiging van Friso** (containers herstarten — vaste afspraak, bevinding 11; eerste pull haalt ~10 GB en mag traag zijn).

## Acceptance Criteria

1. **Keten zonder race:** Given een push naar `acc`, When de Actions-run klaar is, Then zijn beide images gepusht (`:acc` + `:sha`) én is daarná precies één Coolify-deploy getriggerd And deployt Coolify pull-only (geen lokale build in de deploy-log) And draait er na afloop aantoonbaar de image van diezélfde commit (image-label/digest-verificatie, niet alleen SOURCE_COMMIT).
2. **Snelheid gemeten (bevinding 7):** Given de nieuwe keten ná de eerste pull (baseline mag >3 min — ~10 GB vers), When een no-op-commit gepusht wordt, Then is elke volgende Coolify-deploy-fase ≤ 3 minuten (gemeten) And wordt de totale keten push→live gerapporteerd (incl. cache-effect: tweede Actions-run aantoonbaar sneller).
3. **Auth & secrets:** Given de private packages, When Vanilla pullt, Then slaagt dat via de bestaande (geverifieerde) registry-login And staan COOLIFY_TOKEN/COOLIFY_URL uitsluitend als GitHub-secrets (niet in code/logs) And is least-privilege-rotatie van de host-token als opvolgpunt gedocumenteerd (geen blocker).
4. **Veiligheidsnet:** Given een falende image-build, When de Actions-run faalt, Then volgt er GEEN deploy (oude versie blijft draaien) And is de rollback-procedure gedocumenteerd én eenmaal daadwerkelijk geoefend (SHA-pin → redeploy → terug naar `:acc`).
5. **Regressie:** Given de pull-only compose, When de deploy draait, Then blijven env-injectie (Coolify `.env`), healthchecks, Storage-Box-mounts en resource-limits identiek werken (post-deploy smoke: containers healthy + bestaand verificatieritueel).

## Expliciet buiten scope

- Prod-bouwstraat (zelfde patroon, later besluit) · wijzigingen aan de Dockerfiles zelf · `concurrent_builds`-instelling Vanilla (UI-punt, bestaand) · de overige 6 workflows in `.github/workflows/` (opruimen = apart onderhoudspunt)

## Dev Notes

- Race-detail: na het omzetten van compose naar pull-only maar VÓÓR het uitzetten van de git-webhook is er één overgangsdeploy die de dan-bestaande `:acc`-image pullt — onschadelijk, maar voer beslissing 3 direct na de merge uit
- De Coolify-deploy-API is al bewezen in deze sessies (MCP `deploy_by_tag_or_uuid`); de Actions-trigger gebruikt hetzelfde endpoint via curl
- ML-image bouwt al groen op GitHub-runners (build-push.yml-historie) — runner-disk is dus geen blocker; cache verkleint vooral de torch-laag-herhaling
- Verificatie image==commit: gebruik `org.opencontainers.image.revision`-label (door build-push-action te zetten met `labels:`) en vergelijk op de host met `docker inspect`

### Referenties

- `.github/workflows/build-push.yml` (bestaande bouwer) · `docker-compose.acc.yml` (71–122: build-blokken) · handover-besluit "optie A gekozen, optie B kan niet" · Coolify-app `qsookwow8koko0kwg00g0cwk`

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 — orchestrator-inline, 2026-06-07.

### Completion Notes List

- Volgorde-afwijking (gedocumenteerd, veiliger): auto-deploy is VÓÓR de merge uitgezet (handmatig door Friso — de Coolify-API staat het veld niet toe: "is_auto_deploy_enabled not allowed"), waardoor de gecombineerde merge racevrij was en er geen overgangsdeploy nodig was
- AC1 ✅: eerste pull-only deploy draait `ghcr.io/...:8e93aca…`; `org.opencontainers.image.revision` == merge-SHA; `LOGO_IMAGE_TAG` door Actions gepind; geen lokale build
- AC2 ✅: baseline (eerste run) 21m21s push→live; **steady-state 1m35s totaal** (Actions ~31 s mét cache · deploy-fase 1m04s ≤ 3 min) — cache-effect aangetoond (build ~15 min → ~31 s)
- AC3 ✅: bestaande ghcr-host-login geverifieerd werkend; COOLIFY_TOKEN/COOLIFY_URL uitsluitend als GitHub-secrets gezet (waarden nergens getoond); least-privilege-rotatie gedocumenteerd opvolgpunt
- AC4 ✅: deploy-job vereist beide builds (needs); **rollback geoefend**: pin 8e93aca → live in 1m22s → herstel c984ea8 → live; procedure in docs/04-deployment/ci-bouwstraat.md
- AC5 ✅: meerdere deploys met healthy containers; env-injectie/mounts/healthchecks ongewijzigd (kalibratie-envs en detectieketen blijven werken)
- Onderhoudspunten (buiten scope, genoteerd): doc-only pushes triggeren de volledige keten (overweeg paths-ignore); ci-cd.yml verspilt acc-test-compute; host-token-rotatie

### File List

- .github/workflows/build-push.yml (concurrency, metadata-labels, GHA-cache, deploy-acc-job)
- docker-compose.acc.yml (pull-only + ${LOGO_IMAGE_TAG:-acc} + pull_policy)
- docs/04-deployment/ci-bouwstraat.md (nieuw)
- GitHub-secrets COOLIFY_TOKEN/COOLIFY_URL · Coolify-env LOGO_IMAGE_TAG · Coolify Auto Deploy uit (UI, Friso)
