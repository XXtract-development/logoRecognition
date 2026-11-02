# CI-bouwstraat: ACC-uitrol via uitroltak `acc-deploy` en de Coolify-webhook (CI-1)

> [!note]
> Sinds 21-10-2026 laat `firewall-2` op de Coolify-host alleen Hetzner-servers en GitHub-webhooks
> door. GitHub-runners bereiken de Coolify-API dus niet meer; de workflow roept die API ook niet
> meer aan. Achtergrond: `_bmad-output/specs/spec-ci-deploy-hetzner-runner/SPEC.md` (v3.3).

## Hoe het werkt

1. Push naar `acc` → GitHub Actions (`.github/workflows/build-push.yml`) bouwt beide images mét
   OCI-labels en layer-cache en pusht ze naar GHCR (`:acc` + `:<merge-sha>`).
2. De job `deploy-acc` draait alléén na twee geslaagde builds (`needs: [build-app, build-ml]`), alleen
   op `refs/heads/acc` bij een push of handmatige start, en op een GitHub-runner. Hij draait
   `.github/scripts/move-acc-deploy-branch.sh`, dat de tak `acc-deploy` met het workflow-token
   (`contents: write`) naar de merge-SHA verschuift (`PATCH` met `force`, of `POST` als de tak nog
   niet bestaat).
   - Staat `acc` niet meer op die SHA (een oude run die opnieuw gestart is), dan verschuift hij niets
     en blijft de job groen. De tak gaat dus nooit terug door een herstarte run.
   - Staat `acc-deploy` al op die SHA, dan komt er geen webhook; de job meldt dat en blijft groen.
     Opnieuw uitrollen gaat dan via de knop Redeploy in Coolify. Dat geldt ook voor een handmatige
     "Run workflow" op een ongewijzigde `acc`: die rolt niets uit, want `acc-deploy` staat al op de SHA.
   - Elke andere lees- of schrijffout maakt de job rood.
3. De verschuiving is een push op GitHub, dus GitHub stuurt de push-webhook naar Coolify (die komt
   wél door de firewall). De Coolify-app `qsookwow8koko0kwg00g0cwk` volgt tak `acc-deploy` met
   automatisch uitrollen aan, en start daarop een uitrol.
4. Coolify checkt `acc-deploy` uit en zet `SOURCE_COMMIT` op die commit. `docker-compose.acc.yml`
   kiest het app- én ml-image op `${SOURCE_COMMIT:?…}` met `pull_policy: always`; ontbreekt
   `SOURCE_COMMIT`, dan start niets.
5. Een push met het workflow-token start geen nieuwe workflowrun, en geen workflow luistert op
   `acc-deploy`. De `concurrency`-groep annuleert oudere runs zodra er een nieuwere push is.

> [!warning]
> Zet `SOURCE_COMMIT` nooit in een `environment:`- of `build`-blok van de compose, en maak in
> Coolify geen variabele met die naam. Coolify vult `SOURCE_COMMIT` alleen zolang er geen
> gebruikersvariabele met die naam bestaat (broncode beta.463), en registreert gebruikersvariabelen
> uit `environment:`/`build.args`. Dan wordt de image-tag leeg. `.github/tests/test_acc_deploy_branch.py`
> bewaakt dit.

De workflow wacht niet op de afloop van de Coolify-uitrol en meldt die ook niet; de stapsamenvatting
van `deploy-acc` zet de controle hieronder klaar.

## Verificatie na een uitrol (app én ml-service)

1. Coolify → app → Deployments: er staat een webhook-uitrol van tak `acc-deploy` op de merge-SHA.
2. Beide containers op Vanilla draaien het image van die commit:

   ```bash
   ssh vanilla 'for c in $(docker ps --format "{{.Names}}" | grep -E "^(app|ml-service)-qsoo"); do
     echo "$c $(docker inspect "$c" --format "{{index .Config.Labels \"org.opencontainers.image.revision\"}} {{.Config.Image}}")"
   done'
   # beide regels: revision = merge-SHA, en image eindigt op :<merge-sha>
   ```

3. De `.env` van de app bevat precies één `SOURCE_COMMIT`, gelijk aan de merge-SHA (alleen tellen en
   die ene regel tonen, nooit de hele `.env`):

   ```bash
   ssh vanilla 'f=/data/coolify/applications/qsookwow8koko0kwg00g0cwk/.env; grep -c "^SOURCE_COMMIT=" "$f"; grep "^SOURCE_COMMIT=" "$f"'
   ```

4. Geen uitrol gestart terwijl `deploy-acc` groen is? Dan kwam de webhook niet aan. Klik Redeploy in
   Coolify: dat pakt de kop van `acc-deploy`, dus de juiste SHA.

## Rollback

Terugdraaien gaat zonder Coolify-API: zet `acc-deploy` op een eerdere acc-merge-SHA, waarna de
webhook die uitrolt.

```bash
gh api -X PATCH repos/XXtract-development/logoRecognition/git/refs/heads/acc-deploy \
  -f sha=<eerdere-acc-merge-sha> -F force=true
```

Grenzen:

- De doel-SHA moet een acc-merge-SHA zijn **mét deze wijziging** (de compose op `SOURCE_COMMIT`).
  Een oudere commit heeft de compose op `${LOGO_IMAGE_TAG:-acc}`; daarvoor moet in Coolify tijdelijk
  een env `LOGO_IMAGE_TAG` met die SHA bestaan (alleen vanaf kantoor of Vanilla, niet vanuit de
  workflow). Staat `LOGO_IMAGE_TAG` daar niet op die SHA, dan pullt een rollback naar zo'n oude SHA
  stilzwijgend de rolling `:acc`-images, en Coolify meldt toch succes. Alleen de controle van het
  revision-label op beide containers vangt dat.
- GHCR moet `:<sha>` van **beide** images (`logo-recognition-app` en `logo-recognition-ml`) nog hebben.
- De rollback is tijdelijk: de volgende push naar `acc` zet `acc-deploy` weer op de nieuwste SHA, en
  dat doet ook het opnieuw starten van de laatste build-push-run of een `workflow_dispatch` op `acc`.
- Staat `acc-deploy` al op de doel-SHA, dan komt er geen webhook: gebruik Redeploy in Coolify.
- Controleer daarna beide containers zoals hierboven.

## Eerste echte run (bewijs na de merge)

Volgorde: (1) merge: de workflow maakt `acc-deploy` aan op de merge-SHA terwijl Coolify nog op
`acc` staat (geen uitrol); (2) de app in Coolify op tak `acc-deploy` zetten en automatisch uitrollen
aan; (3) eenmalig handmatig uitrollen in Coolify, en daarna `SOURCE_COMMIT` in de `.env` en het
revision-label van beide containers controleren zoals onder Verificatie (ook een handmatige Redeploy
moet een volledige SHA geven, niet `HEAD` of `unknown`); (4) de volgende push naar `acc` bewijst de
webhook. De tak wordt niet vooraf aangemaakt.

Die volgende push moet aantonen:

- (a) GitHub stuurt de push-webhook ook als de workflow de tak verschuift, en Coolify start een
  webhook-uitrol voor `acc-deploy`;
- (b) app en ml-service op Vanilla draaien images met `org.opencontainers.image.revision` =
  `SOURCE_COMMIT` = merge-SHA, de `.env` van de app bevat precies één `SOURCE_COMMIT`, en de env van
  de app-container toont `LOGO_IMAGE_TAG` leeg;
- (c) blijft de webhook uit, dan is de workflow groen en komt er geen uitrol; handmatig uitrollen in
  Coolify pakt dan de kop van `acc-deploy` en dus de juiste SHA.

Leg de uitkomst (run-ID, Coolify-uitrol, `docker inspect`-uitvoer) vast in
`_bmad-output/implementation-artifacts/investigations/acc-ci-coolify-onbereikbaar-20261102.md`.

## Secrets & auth

- De workflow gebruikt alleen het eigen workflow-token (`contents: write` in `deploy-acc`).
  `COOLIFY_TOKEN`/`COOLIFY_URL` worden niet meer gebruikt maar blijven als repo-secret staan.
- De app leest `LOGO_IMAGE_TAG` vóór `SOURCE_COMMIT` als codeversie
  (`apps/api/src/services/pipeline/logo-scan-flow.ts`, `codeVersion()`, hergebruik van scans). De compose
  maakt `LOGO_IMAGE_TAG` voor de app daarom leeg (`environment:` gaat vóór `env_file`), zodat de
  codeversie `SOURCE_COMMIT` volgt, per constructie de commit van het image. De Coolify-env
  `LOGO_IMAGE_TAG` mag blijven staan (alleen nodig voor een rollback naar een SHA van vóór deze
  wijziging); verwijderen mag, maar hoeft niet.
- GHCR-pull op Vanilla: bestaande registry-login op de host. Opvolgpunt (least-privilege): vervangen
  door een token met uitsluitend pull-rechten op deze packages. Reproduceer nooit docker-config-inhoud
  in docs/logs.

## Bekende eigenschappen

- De éérste pull-only deploy haalt ~10 GB (ml 6,4 + app 3,7 GB) en is eenmalig traag; daarna geldt
  host-layer-cache en is de deploy-fase ≤ ~3 min.
- `:acc` is een rolling tag zonder garantie; ACC draait altijd `:<SOURCE_COMMIT>`.
- Er is geen bewaking die een uitgebleven uitrol meldt (opvolgpunt).
- `ci-cd.yml` draait nog tests op acc-pushes (dubbele compute, geen deploy) — onderhoudspunt.
