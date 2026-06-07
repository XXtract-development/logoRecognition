# CI-bouwstraat: pull-only deploys via GHCR (CI-1)

## Hoe het werkt

1. Push naar `acc` → GitHub Actions (`build-push.yml`) bouwt beide images mét OCI-labels en layer-cache en pusht ze naar GHCR (`:acc` + `:<merge-sha>`).
2. De `deploy-acc`-job (draait alléén als beide builds slagen) pint de merge-SHA in Coolify-env `LOGO_IMAGE_TAG` en triggert daarna precies één Coolify-deploy.
3. Coolify pullt (geen lokale build meer): `docker-compose.acc.yml` verwijst naar `ghcr.io/...:${LOGO_IMAGE_TAG:-acc}` met `pull_policy: always`.
4. Git-auto-deploy staat UIT op de app — de Actions-trigger is de enige geautomatiseerde deploy-aanleiding. Handmatige deploys (UI/MCP) blijven mogelijk en pullen altijd de laatst gepinde SHA (consistent paar gegarandeerd).

## Rollback

1. Zoek de gewenste eerdere **acc-merge-SHA** op (GitHub Actions-historie van build-push.yml, of `git log origin/acc`).
2. Zet in Coolify de env `LOGO_IMAGE_TAG` op die SHA (UI of API).
3. Trigger een deploy (UI-knop of `GET /api/v1/deploy?uuid=qsookwow8koko0kwg00g0cwk`).
4. Terug naar nieuwste: zet `LOGO_IMAGE_TAG` terug (of wacht op de volgende acc-push, die pint automatisch).

## Verificatie image == commit

```bash
ssh vanilla "docker inspect \$(docker ps --format '{{.Names}}' | grep '^app-qsoo') \
  --format '{{index .Config.Labels \"org.opencontainers.image.revision\"}}'"
# moet gelijk zijn aan de gepinde LOGO_IMAGE_TAG / de acc-merge-SHA
```

NB: `SOURCE_COMMIT` (Coolify-env) volgt de git-checkout van de compose, níét de image — gebruik het image-label voor bewijs.

## Secrets & auth

- `COOLIFY_TOKEN`/`COOLIFY_URL`: GitHub-repo-secrets (bron: team-config; nooit in code/logs).
- GHCR-pull op Vanilla: bestaande registry-login op de host. Opvolgpunt (least-privilege): vervangen door een token met uitsluitend pull-rechten op deze packages. Reproduceer nooit docker-config-inhoud in docs/logs.

## Bekende eigenschappen

- De éérste pull-only deploy haalt ~10 GB (ml 6,4 + app 3,7 GB) en is eenmalig traag; daarna geldt host-layer-cache en is de deploy-fase ≤ ~3 min.
- `:acc` is een rolling tag — alleen de gepinde SHA geeft garanties; daarom pint de pipeline altijd.
- `ci-cd.yml` draait nog tests op acc-pushes (dubbele compute, geen deploy) — onderhoudspunt.
