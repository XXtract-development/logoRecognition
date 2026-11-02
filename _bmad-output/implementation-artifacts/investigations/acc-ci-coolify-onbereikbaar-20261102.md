---
case: acc-ci-coolify-onbereikbaar-20261102
status: confirmed
created: 2026-11-02T09:55:00+00:00
owner_repo: logoRecognition
affected_repos: [logoRecognition, HR-portal]
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
| E20 | Lokaal | `grep -l -E "api/v1/(deploy\|applications)" ~/Documents/projects/*/.github/workflows/*.y*ml` | Ook `HR-portal/.github/workflows/build-push.yml` roept de Coolify-API aan (laatste run 15-09, dus nog niet geraakt). |

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
- INFERENCE: elke andere workflow die vanaf GitHub-runners de Coolify-API aanroept faalt bij de volgende run ook (HR-portal, E20).

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
3. Pas HR-portal mee aan zodra de keuze vastligt. — *codewijziging via BMAD*, laag.

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
