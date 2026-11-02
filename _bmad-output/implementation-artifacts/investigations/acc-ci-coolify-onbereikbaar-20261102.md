---
case: acc-ci-coolify-onbereikbaar-20261102
status: confirmed
created: 2026-11-02T09:55:00+00:00
owner_repo: logoRecognition
affected_repos: [logoRecognition]
environment: ACC
trigger: "Sinds 30-10-2026 faalt bij elke push naar acc de workflow 'Build and Push Docker Images', job deploy-acc, stap 'Pin image tag in Coolify': curl: (28) Failed to connect to coolify.xxtract.com port 443 after 133165 ms"
severity: medium
---

# GitHub Actions bereikt Coolify niet meer (ACC-uitrol logoRecognition)

## Hand-off Brief

De Coolify-server (`coolify.xxtract.com`, 78.46.225.177) is sinds **21-10-2026 rond 15:33 UTC**
vanaf het open internet onbereikbaar op álle poorten (22, 80, 443, 8000). Alleen een kleine
allowlist komt er nog door: het kantoor (92.111.159.162), een tweede vast adres (92.108.135.131),
Hetzner-servers zoals Vanilla, en kennelijk de webhooks van GitHub zelf. De GitHub Actions-runners
staan niet op die lijst; daardoor kan de workflow de image-tag niet meer doorgeven en geen uitrol
starten. Dat het pas op 30-10 opviel komt doordat er tussen 13-10 en 30-10 geen push naar `acc` was.

De filtering zit **niet op de server zelf** (geen ufw, iptables `INPUT ACCEPT`, geen drop-regels),
maar ervóór: het gedrag (stilte in plaats van weigering) is dat van een Hetzner Cloud Firewall.
De oorzaak ligt dus buiten de code. Een codewijziging alléén lost dit niet op zonder een
infrastructuurkeuze; die keuze ligt bij Friso.

## Case Info

- Trigger: zie frontmatter. Laatste mislukte run 41193683416 (31-10 11:52Z).
- Omgeving: ACC (Coolify-host coolify.xxtract.com; app `qsookwow8koko0kwg00g0cwk` draait op Vanilla).
- Methode: GitHub-runlogs, DNS, externe TCP-proeven via check-host.net (8 + 4×5 knooppunten),
  read-only SSH op coolify-host en vanilla, read-only SELECT op de Coolify-database.
- Klok: alles in UTC (journald `-o short-iso`, Coolify-DB `created_at` in UTC, GitHub in Z).
- **Schrijfacties uitgevoerd: geen.** Geen wijziging aan servers, firewall, Coolify, DNS of secrets.

## Evidence Inventory

| # | Bron | Commando / query | Uitkomst |
|---|---|---|---|
| E1 | GitHub | `gh run list --workflow build-push.yml --limit 15` | Laatste success 13-10 06:16Z (b6a0857); failures 30-10 14:32Z, 31-10 08:39Z, 31-10 10:40Z. Geen runs tussen 13-10 en 30-10. |
| E2 | GitHub | `gh run view 41193683416 --log-failed` | `curl: (28) Failed to connect to coolify.xxtract.com port 443 after 133165 ms` — naam is opgelost, TCP-connect krijgt geen antwoord. |
| E3 | GitHub | `git log -- .github/workflows/build-push.yml`; `gh secret list` | Workflow ongewijzigd sinds 07-06-2026 (e121c2c). `COOLIFY_URL`/`COOLIFY_TOKEN` laatst gezet 02-10-2026. |
| E4 | DNS | `dig +short coolify.xxtract.com A` / `AAAA` / `NS xxtract.com` | A = 78.46.225.177, geen AAAA, NS = TransIP. Geen Cloudflare/proxy ertussen. |
| E5 | Werkplek | `curl -w "%{http_code} %{remote_ip}" https://coolify.xxtract.com/api/health` | 200 vanaf 92.111.159.162 (kantoor). |
| E6 | Vanilla | idem vanaf `ssh vanilla` | 200 (connect 0,036 s). |
| E7 | Internet | check-host.net `check-tcp?host=coolify.xxtract.com:443&max_nodes=8` (id 550ede1ckbba) | 8/8 knooppunten (br, de×2, ir, it, jp, pt, si): `Connection timed out`. |
| E8 | Internet | check-host.net op 78.46.225.177 poort 80, 22, 8000 | Alle beantwoorde knooppunten: `Connection timed out` (80: 3/3, 22: 4/4, 8000: 4/4). |
| E9 | Internet (controle) | check-host.net op 78.47.244.169:443 (Vanilla) en 188.245.118.226:443 (Banana) | 4/4 resp. 4/4 verbonden. De proefroute zelf werkt. |
| E10 | coolify-host | `ufw status verbose`; `iptables -S INPUT`; `iptables -S DOCKER-USER`; `nft list ruleset \| grep drop` | ufw inactive; `-P INPUT ACCEPT`; DOCKER-USER leeg; alleen standaard Docker-isolatieregels. Geen fail2ban, crowdsec inactive. |
| E11 | coolify-host | `ss -ltnp` | traefik (docker-proxy) luistert op 0.0.0.0:443/80, Coolify op 0.0.0.0:8000. |
| E12 | coolify-host | `journalctl -u ssh -u sshd --since 2026-10-20 -o short-iso \| grep -oE "^[0-9-]{10}T.* from [0-9a-f.:]+"` → distinct bron-IP's per dag | 20-10: 80, 21-10: 68, 22-10 t/m 02-11: 2–5 (alleen 172.18.x, 10.0.0.2, 92.111.159.162, 92.108.135.131). |
| E13 | coolify-host | idem 21-10, filter op niet-allowlist-IP's, `tail -2` | Laatste internet-bot: `2026-10-21T15:33:07Z Invalid user admin from 2.57.121.25`. Daarna geen enkele. |
| E14 | coolify-host | `last -x reboot`; `journalctl --list-boots` | Herstart 22-10 19:10Z — ná de afsluiting (E13), dus geen oorzaak. |
| E15 | Coolify-DB | `select date(created_at), is_webhook, is_api, count(*) from application_deployment_queues where created_at >= '2026-10-10' group by 1,2,3 order by 1,2,3;` | Webhook-uitrollen (`is_webhook=t`) gaan na 21-10 dagelijks door (bv. 27-10: 39, 31-10: 16). GitHub-webhooks komen dus wél binnen. |
| E16 | Coolify-DB | `select q.created_at,q.status,q.is_webhook,q.is_api,left(q.commit,8) from application_deployment_queues q join applications a on a.id::text=q.application_id where a.uuid='qsookwow8koko0kwg00g0cwk' and q.created_at>='2026-10-05' order by 1;` | Laatste CI-API-uitrol 13-10 06:26 (b6a08578); daarna alleen de handmatige van 31-10 11:53 (8c9373d2). Auto-deploy van de app staat uit (`is_auto_deploy_enabled = f`). |
| E17 | coolify-registry / coolify-project | `manifest-acc-hostbewaking.md` r.19 | Eigen eerdere meting: "Vanilla heeft geen Hetzner-firewall (een dichte poort weigert direct), Cherry wel (stilte op poort 9100)". Stilte = handtekening Hetzner Cloud Firewall. |
| E18 | Vanilla / coolify-host | `curl http://10.100.0.3:8000/api/health` | 200 vanaf beide: Coolify-API is via het privénetwerk bereikbaar. |
| E19 | GitHub | `gh repo view XXtract-development/logoRecognition --json visibility` | `PUBLIC`. |
| E21 | Internet | check-host.net `check-tcp?host=78.47.244.169:22&max_nodes=4` | 4/4 (at, hk, jp, nl) verbonden: SSH op Vanilla is van buiten bereikbaar (premisse optie A). |
| E20 | Lokaal | `grep -l -E "api/v1/(deploy\|applications)" ~/Documents/projects/*/.github/workflows/*.y*ml` | Treffer in `HR-portal/.github/workflows/build-push.yml` — bij nalezing (E27) is dat de **ArgoCD**-API, niet Coolify. Valse treffer. |

## Confirmed Findings

- VERIFIED: de runner faalt op TCP-niveau (connect-timeout), niet op token, URL of HTTP-status (E2, E3).
- VERIFIED: workflow en secrets zijn sinds de laatste geslaagde run niet gewijzigd (E3).
- VERIFIED: coolify.xxtract.com is vanaf willekeurige internetadressen onbereikbaar op 22/80/443/8000, terwijl andere Hetzner-servers via dezelfde proefroute wél bereikbaar zijn (E7, E8, E9).
- VERIFIED: vanaf kantoor en vanaf Vanilla werkt dezelfde URL (E5, E6).
- VERIFIED: de server zelf filtert niets (E10, E11).
- VERIFIED: internetverkeer naar de host stopte op 21-10-2026 tussen 15:33Z en het einde van die dag; sindsdien alleen allowlist-bronnen (E12, E13).
- VERIFIED: GitHub-webhooks bereiken Coolify nog steeds (E15).
- VERIFIED: de Coolify-API is intern bereikbaar via 10.100.0.3:8000 (E18).

## Deduced Conclusions

- INFERENCE: op 21-10-2026 rond 15:33Z is een Hetzner Cloud Firewall aan de Coolify-host gekoppeld (of aangescherpt) met een allowlist. Basis: stilte in plaats van weigering (E7, E8 vs. E17), host-firewall open (E10), abrupte overgang (E13). Niet zelf in de Hetzner Console gecontroleerd — geen `hcloud`-context op deze machine.
- INFERENCE: de allowlist bevat de webhook-bereiken van GitHub (E15), maar niet de Actions-runners. Actions-runners draaien op Azure met duizenden wisselende adresblokken; die passen niet zinvol in een firewall-allowlist.
- INFERENCE: dit valt samen met het Coolify-beveiligingswerk in die week (Coolify 4.0.0-beta.463 met 38 bekende advisories, waarvan 4 kritiek; onderzoek 25-10 in het coolify-project). Dichtzetten is dan een bewuste keuze, niet iets om terug te draaien.
- INFERENCE: elke andere workflow die vanaf GitHub-runners de Coolify-API aanroept faalt bij de volgende run ook. HR-portal valt daar níet onder (E20, E27).

## Hypothesized Paths

| # | Hypothese | Doodtest | Uitkomst |
|---|---|---|---|
| H1 | Hetzner Cloud Firewall met allowlist voor de Coolify-host | Internetproef stilte op alle poorten, host-firewall open, kantoor/Vanilla wél | **CONFIRMED** (gedrag); de regel zelf is UNTESTABLE zonder Hetzner-console |
| H2 | DNS gewijzigd / verkeerd adres | `dig` + runlog | REJECTED: A-record 78.46.225.177, runner resolvet de naam (E2, E4) |
| H3 | Cloudflare/proxy ertussen | NS en A-record | REJECTED: TransIP-DNS, direct Hetzner-IP (E4) |
| H4 | Firewall op de server zelf (ufw/iptables/fail2ban/crowdsec) | regels uitlezen | REJECTED: niets dat inkomend verkeer dropt (E10) |
| H5 | Verlopen token of gewijzigde URL-secret | foutcode | REJECTED: TCP-timeout gebeurt vóór HTTP; secrets ongewijzigd (E2, E3) |
| H6 | Herstart van de Coolify-host of de proxy | tijdlijn | REJECTED: afsluiting 21-10 15:33Z vóór herstart 22-10 19:10Z (E13, E14) |
| H7 | Traefik-IP-allowlist in Coolify | soort fout | REJECTED: zo'n middleware geeft een HTTP 403 ná een TCP-verbinding, geen connect-timeout |

## Recommended actions

1. **Besluit Friso (infrastructuur, geen code):** kies hoe de uitrol de Coolify-API voortaan bereikt. Opties staan hieronder. — *besluit*, hoog.
2. Bevestig in de Hetzner Console welke firewall aan de Coolify-host hangt en noteer de allowlist in `~/.claude/ssh-registry.md`. — *read-only, door Friso*, middel.
3. ~~HR-portal meenemen~~ — vervallen: HR-portal rolt uit via ArgoCD, niet via Coolify (E27).

### Opties (voor de keuze)

| Optie | Wat het doet | Kost | Risico |
|---|---|---|---|
| A. Uitrolstap via Vanilla (SSH-sprong) | De workflow logt via SSH in op Vanilla (dat wél van buiten bereikbaar is) en roept daar de Coolify-API aan over het privénetwerk (10.100.0.3:8000). | Eén deploy-sleutel met beperkt commando op Vanilla, één GitHub-secret, kleine workflowwijziging. ~1 uur. | Een sleutel op een ACC-server in GitHub-secrets; met `command=`-beperking in `authorized_keys` kan hij alleen de uitrol starten. |
| B. Eigen runner binnen Hetzner | Een GitHub-runner op een Hetzner-server draait alleen de uitrolstap. | Runner installeren en onderhouden. ~2 uur. | De repository is **openbaar**: GitHub raadt eigen runners op openbare repositories af, omdat code uit vreemde pull requests erop kan draaien. |
| C. Firewall openen voor GitHub Actions | GitHub's runner-adressen op de allowlist. | Duizenden wisselende adresblokken, wekelijks bijwerken. | Praktisch hetzelfde als open voor heel Azure; ondermijnt het dichtzetten. Afgeraden. |
| D. Trekken in plaats van duwen | Een geplande taak binnen Hetzner kijkt periodiek of er een nieuw `acc`-image is en start dan zelf de uitrol. | Script + geplande taak op een server. ~2 uur. | Uitrol enkele minuten vertraagd; extra bewegend onderdeel. |

## Out of scope

- Het beveiligingsniveau van Coolify zelf (beta.463): zie `~/Documents/projects/coolify/_bmad-output/planning-artifacts/research/technical-claude-security-skills-coolify-hetzner-2026-10-25/research.md`.
- Gelijkaartig netwerkonderzoek ACC: [acc-serverbereikbaarheid-20261002.md](acc-serverbereikbaarheid-20261002.md).

## Vervolg 2026-11-02 — hoe andere repo's het na 21-10 doen

Besluit Friso (via coördinator): firewall blijft bewust dicht; los het op zoals andere repo's.

| # | Bron | Commando / query | Uitkomst |
|---|---|---|---|
| E22 | Coolify-DB | `select a.uuid,a.name,a.build_pack,a.git_repository,a.git_branch,coalesce(a.docker_registry_image_name,''),s.is_auto_deploy_enabled,(select count(*) from application_deployment_queues q where q.application_id=a.id::text and q.created_at>'2026-10-21 15:33' and q.status='finished') from applications a join application_settings s on s.application_id=a.id where a.deleted_at is null order by 8 desc;` | ~40 apps rollen na 21-10 groen uit; vrijwel allemaal laat Coolify zelf uit git bouwen (`build:` in compose of Dockerfile-buildpack, push naar `registry.acc.xxtract.com`), aangestuurd door de GitHub-App-webhook (`is_webhook=t`) of de API. Bv. StageLegacy acc 39, UploadPortal acc 23, MyXXtract acc 20. |
| E23 | Coolify-DB | `select uuid,name,git_repository,git_branch from applications where deleted_at is null and (docker_compose_raw ilike '%ghcr.io%' or docker_compose ilike '%ghcr.io%' or docker_registry_image_name ilike '%ghcr%');` | Alleen de twee logoRecognition-apps (`qsookwow8koko0kwg00g0cwk`, `f048gs04scoksggw0okw4oo0`). **Geen andere repo combineert ghcr-images met Coolify.** De `build-push.yml` met ghcr in AI-Service, UploadPortal, MyXXtractFrontEnd e.a. bouwt voor K8s (`kustomization.yaml`), niet voor Coolify. |
| E24 | dqs-service | `.github/workflows/deploy.yml` r.189-222; PR #218 (gemerged 26-10 21:35Z) | Job `deploy-acc` draait `runs-on: [self-hosted, hetzner-acc]` en roept vandaar de Coolify-API aan. PR-tekst: "firewall-2 … laat op poort 443 alleen Hetzner-servers en GitHub-webhook-bereiken door (geverifieerd in de Hetzner-console)". |
| E25 | dqs-service | `gh run list -R XXtract-development/dqs-service --workflow deploy.yml --branch acc --event push --limit 6` | 6/6 success (01-11 14:18Z t/m 02-11 09:18Z); job "Deploy to acceptance" success 02-11 09:48Z. |
| E26 | coolify-build | `ssh root@188.245.95.88` → `.runner`, `systemctl list-units \| grep runner`, curl | Eén runner `coolify-build-acc`, service `actions.runner.XXtract-development-dqs-service.coolify-build-acc`, **repo-gebonden aan dqs-service** (aangemaakt 26-10 21:14Z), gebruiker `gh-runner` (niet in docker-groep). Vanaf deze host: `https://coolify.xxtract.com/api/health` 200, `http://10.100.0.3:8000/api/health` 200. |
| E27 | HR-portal | `grep -n -E "runs-on\|curl\|COOLIFY\|api/v1" HR-portal/.github/workflows/build-push.yml`; Coolify-DB `applications where git_repository ilike '%HR-portal%'` | Workflow roept ArgoCD aan (`https://${ARGOCD_SERVER}/api/v1/applications/...`); geen Coolify-app voor HR-portal. |
| E28 | GitHub | `gh repo view … --json visibility`; `gh api repos/XXtract-development/logoRecognition/actions/permissions/fork-pr-contributor-approval` | logoRecognition is PUBLIC (dqs-service PRIVATE); fork-PR-goedkeuring staat op `first_time_contributors`. |

- VERIFIED: de firewall heet `firewall-2` en laat op 443 alleen Hetzner-servers en GitHub-webhooks door (E24, bevestigd in de Hetzner-console door de auteur van PR #218).
- VERIFIED: het enige patroon waarmee een GitHub-workflow na 21-10 de Coolify-API bereikt is de eigen runner op coolify-build (E24, E25, E26). Het tweede patroon — Coolify bouwt zelf op de webhook — draaide logoRecognition tot juni; CI-1 verliet het om 16 minuten bouwtijd en de race tussen webhook en Actions-build.
- VERIFIED: de bestaande runner kan logoRecognition niet bedienen: hij is aan dqs-service gebonden (E26).
- INFERENCE: een eigen runner op een **openbare** repository is uitvoerbaar voor code uit vreemde pull requests zodra die goedgekeurd worden. Met goedkeuring voor álle externe bijdragers en een job die alleen op een push naar `acc` draait is dat afgedekt; de goedkeuringsinstelling staat nu ruimer (E28).
- Gekozen: het dqs-patroon (E24). De SHA-pin blijft ongewijzigd: dezelfde twee API-aanroepen, alleen vanaf een andere machine.

## Vervolg 2026-11-02 (2) — blokkade bij de spec-review

| # | Bron | Commando / query | Uitkomst |
|---|---|---|---|
| E29 | GitHub | `gh api orgs/XXtract-development --jq .plan.name` | `free`. |
| E30 | GitHub-docs | https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/manage-access | "Organization owners using the GitHub Team plan can create additional organization-level runner groups." · "By default, only private repositories can access runners in a runner group" · "We recommend that you only use self-hosted runners with private repositories." Een runnergroep beperkt tot één workflow is op het Free-plan dus niet beschikbaar. |
| E31 | Coolify-DB + Vanilla | `select s.include_source_commit_in_build, s.is_auto_deploy_enabled, a.git_branch from application_settings s join applications a on a.id=s.application_id where a.uuid='qsookwow8koko0kwg00g0cwk';` · `grep -E "^(SOURCE_COMMIT\|LOGO_IMAGE_TAG)=" /data/coolify/applications/qsookwow8koko0kwg00g0cwk/.env` | `f\|f\|acc`; toch schrijft Coolify `SOURCE_COMMIT=<uitgecheckte commit>` in de compose-`.env` (nu `8c9373d2…`, gelijk aan `LOGO_IMAGE_TAG`). |

- VERIFIED: de spec-review (`bmad-review`, bevinding 1, hoog) wijst erop dat op een openbare repository een pull request uit een fork zijn eigen workflowbestand meebrengt en daarmee code op de eigen runner kan laten draaien zodra een beheerder op "goedkeuren" klikt. De afdoende bescherming (runnergroep alleen voor `build-push.yml@refs/heads/acc`) bestaat niet op het Free-plan (E29, E30).
- VERIFIED: dqs-service is privé (E28); daar speelt dit niet. Het dqs-patroon is voor logoRecognition dus niet één-op-één veilig over te nemen.
- INFERENCE: een tweede route zonder eigen runner kan wel: de workflow zet na de twee builds de commit op een aparte uitroltak; de GitHub-webhook (die de firewall doorlaat, E15) laat Coolify die tak uitrollen; de compose gebruikt de door Coolify gezette `SOURCE_COMMIT` (E31) als image-tag. Niet bewezen: dat GitHub de webhook ook verstuurt bij een push met het workflow-token (de documentatie sluit alleen nieuwe workflowruns uit).
- Status (toen): keuze teruggelegd bij Friso; spec v2, nog geen codewijziging. Vervangen door sectie (3).

## Vervolg 2026-11-02 (3) — gekozen route: uitroltak + Coolify-webhook (besluit Friso)

| # | Bron | Commando / query | Uitkomst |
|---|---|---|---|
| E32 | GitHub | `gh api repos/XXtract-development/logoRecognition/rulesets`; `.../rules/branches/acc-deploy`; `.../branches/acc/protection` | `[]`, `[]`, 404 "Branch not protected": niets houdt een push van het workflow-token naar `acc-deploy` tegen. |
| E33 | Coolify-DB | `select uuid,name,git_branch,coalesce(watch_paths,'<null>') from applications where deleted_at is null and (git_branch='acc-deploy' or uuid='qsookwow8koko0kwg00g0cwk');` | Alleen de logo-app (`acc`, watch_paths `<null>`); geen app volgt `acc-deploy`. Tweede query: `select count(*) from environment_variables where resourceable_id=(select id from applications where uuid='qsookwow8koko0kwg00g0cwk') and resourceable_type ilike '%Application' and key='SOURCE_COMMIT';` → `0` (van 72 variabelerijen); `LOGO_IMAGE_TAG` bestaat wel (gewoon + preview). |
| E34 | Coolify-broncode (container `coolify`, beta.463) | `ApplicationDeploymentJob.php` r.2389-2397; `bootstrap/helpers/parsers.php` r.420-470 en 960-1050 | `SOURCE_COMMIT` = uitgecheckte commit, alleen als er geen gebruikersvariabele `SOURCE_COMMIT` is. De compose-parser registreert variabelen alleen uit `environment:` en `build.args`; `image:` gaat ongewijzigd naar docker compose (ook zichtbaar in de gerenderde compose op Vanilla: `${LOGO_IMAGE_TAG:-acc}` staat er letterlijk). |

- VERIFIED (broncode, E34): Coolify vult `SOURCE_COMMIT` zolang er geen gebruikersvariabele met die naam is (E33: 0), en registreert geen variabelen uit `image:`.
- INFERENCE: een image-tag `${SOURCE_COMMIT:?…}` wordt daardoor uit de `.env` gevuld; niemand heeft dat op Vanilla al zien gebeuren. Te bewijzen bij de eerste echte run.
- INFERENCE: GitHub stuurt de push-webhook naar de Coolify-GitHub-App ook bij een ref-wijziging met het workflow-token (de documentatie sluit alleen nieuwe workflowruns uit). Te bewijzen bij de eerste echte run.

- Status: route 1 gebouwd op tak `fix/ci-coolify-pin` (spec v3.3, bmad-build-spec `spec-ci-acc-deploy-branch.md`); eerste echte run nog te bewijzen.
