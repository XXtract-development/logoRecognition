# Retrospective — Epic 17: Seed-bootstrap voor lege klassen

**Datum:** 2026-07-04 · **Branch:** `epic/vliegwiel-17` · **HEAD:** `e64daed` (code-anchor `7458b49`) · **Base:** `5c922a0` (acc met Epics 13-16 + 12.8)
**Stories:** 17.1–17.2 (2/2 done) · **Migratie:** geen (bootstrap_queue bestond al uit 16.2).

## Wat ging goed

- **De epic-review ving een bug die de story-eigen test juist bevestigde.** De 17.2-doorklik ("nieuw geactiveerde klasse" → gepromoveerde referenties) navigeerde naar `/flywheel/batches/{t3777Code}`, maar die route resolvet uitsluitend op promotie-batch-UUID → altijd 404, AC4 nooit gehaald. De web-test codeerde het foute contract hard (`navigate('/flywheel/batches/ACTIVATED')`) en de ac-trace verklaarde het "PASS". Zonder de onafhankelijke epic-review was dit als "klaar" doorgegaan. **Les: een test die het verkeerde contract vastlegt is gevaarlijker dan geen test — de adversarial review moet AC-tests tegen het échte routecontract houden, niet tegen de aanname van de auteur.**
- **NFR-6 (het zaad mag nooit referentie worden) is dubbel geborgd en getest** — ml-service embedt het gids-logo maar uploadt het nooit + een inhouds-digest-guard weert een meegelift zaadbeeld uit de output; de API nomineert uitsluitend echte crop-paden. Een geslaagde bootstrap promoveert aantoonbaar alleen echte crops.
- **Kwaliteitspoort-hergebruik klopt:** bootstrap-vondsten lopen via exact dezelfde `nominateCandidate` (13.2), alleen `origin:'bootstrap'` verschilt — geen aparte of afgezwakte promotie.
- **bootstrap_queue gedeeld met 16.2 zonder divergentie:** 17.1 schrijft de statusovergangen die 17.2 leest/toont; `enqueueBootstrapRun` (17.1) wordt door het 17.2-paneel hergebruikt. De statusset (wachtend/gedraaid/gevuld/leeg/uitgesloten) is consistent.

## Wat brak / lastig was

- **Een agent stopte drie stappen te vroeg.** De 17.2-agent had implementatie + tests + review klaar (api 791, web 124) maar stopte vlak vóór `versions.md`, de status-flip en de eindcommit — het interpreteerde een "pauzeer"-signaal te ruim. De orchestrator heeft die drie mechanische stappen zelf afgerond (git-verificatie + eigen testrun eerst). **Les: de laatste commit-stappen zijn deterministisch; die kan de orchestrator veilig zelf doen zonder een nieuwe agent.**
- **Worktree-omgeving:** node_modules ontbraken in deze verse worktree; gesymlinkt vanuit de identieke epic-16-worktree (nooit gecommit). ml-service-pytests draaiden lokaal niet (geen numpy) — pure-functie-tests via de story-record, endpoint-tests op CI.
- **L1 (bewust niet gefixt):** de overview levert nog een `bootstrapQueue`-paneelpayload (16.2-eigendom) die de FlywheelPage sinds 17.2 niet meer consumeert. Geen regressie; opruimen raakt 16.2-tests → genoteerd als losse opruimstory, buiten Epic 17.

## Patronen / afspraken hieruit

1. **AC-tests moeten tegen het échte contract van de afhankelijkheid gehouden worden**, niet tegen de aanname van de story-auteur. Bij een doorklik/route: verifieer het id-type dat de doelroute daadwerkelijk resolvet.
2. **De orchestrator rondt de laatste commit-stappen zelf af** als een agent net te vroeg stopt — geen nieuwe agent voor `versions.md` + status + commit.
3. **Elke "search seed / hulpbeeld dat niet mag lekken" heeft een guard op de plek van opslag/output nodig + een test die het lek expliciet probeert** (zoals de zaad-digest-guard). Sjabloon voor toekomstige hulpbeelden.

## Stand van het vliegwiel na Epic 17

De lege keurmerkklassen kunnen zichzelf nu vullen: het gids-logo als zoekzaad binnen declarerende producten, echte crops door de normale poort, en een beheerbare wachtrij op declaratiefrequentie. Samen met Epics 13-16 + 12.8 is het vliegwiel functioneel compleet op één ding na: de **brandstof-inname uit het historische 39k-archief** (Epic 18, GLN-backfill) — dat begint met een prod-read-governance-gate.

## Openstaand richting Epic 18 / operationeel (geen blocker)

- Epic 18 (18.1) start met een eenmalige read-only export op prod tradeItems → vereist expliciete governance-toestemming.
- Opruimstory: ongebruikte `bootstrapQueue`-paneelpayload uit de overview (16.2-eigendom).
- Operationeel blijven staan: 12.8-ACC-bewijsrun, 16.3-dashboard-exportknop, AC6-afstemming reviewstation-gebruikers.
