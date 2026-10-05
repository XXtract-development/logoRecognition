---
title: 'Controleerbare productie-inrichting voorbereiden'
type: chore
created: '2026-10-05'
status: done
route: dispatch
baseline_commit: '814f6cd396f63dada95411d51dda5dfae3205a6a'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="Gebruiker heeft op 5 oktober 2026 ingestemd met concrete lokale productievoorbereiding; geen live uitvoering">
## Intent
Productie gebruikt een oudere repository; de huidige productiecompose voor logoRecognition bouwt lokaal, gebruikt bezette hostpoorten en veronderstelt een niet aangetroffen PostgreSQL-server. Maak een concreet lokaal controleerbaar pakket voor een afzonderlijke nieuwe Coolify-voorziening, met alle noodzakelijke modellen, bestanden en gegevensoverdracht als expliciete vervolgstappen. De oude dienst blijft beschikbaar.

## Boundaries & Constraints
Altijd: app/ML uit hetzelfde bevroren ACC-imagepaar; aparte PostgreSQL16 met vector0.6; privé Redis/MinIO/database zonder hostpoorten; productie-eigen volumes, database en sleutels; vier private buckets; voorbereidende services kunnen draaien zonder app/ML/startupjobs. Runtime pas expliciet na complete schema/data/bestanden en goedgekeurde productie-uitvoering. Voorbereidingsconfiguratie moet falen bij ontbrekende vereiste waarden. Gebruik bestaande gedragscode; alle uitvoer nu is lokaal of read-only. Behoud GHS-modelhash en productietrainingsherkomst. Registreer beperkingen van generic detector/modelcaches en echte endpointacceptatie. Geen volledige ACC-database over een bestaand doel herstellen.
Nooit: live Coolify-resources maken, productionDDL/data schrijven, deploy/routeomschakeling of bestaande containeracties; geen main-autodeploy inschakelen; geen credentials/data in commits/logs; geen wijzigingen van derden terugdraaien. Deze opdracht levert een voorbereid pakket; onbekende productiegeheimen worden verplichte invoer zonder fictieve waarden.

## I/O & Edge-Case Matrix
| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Configuratie compleet | Eigen doelwaarden en één exacte releaseversie | Compose valideert, app/ML delen release, intern netwerk en eigen opslag | Geen deploy door valideren |
| Configuratie ontbreekt | Geen vereiste image/database/opslag/proxywaarden | Validatie stopt met uitleg zonder geheimen af te drukken | Geen defaults naar ACC of minioadmin |
| Opslag leeg | Vier buckets vooraf nodig | Herhaalbare initializer maakt alle vier privé en controleert aanwezigheid | Niet afgaan op ML-startup |
| Voorbereiding | Alleen infrastructurele profielservices | App/ML niet gestart en geen automatische referentieherbouw/jobs | Runtime profiel expliciet activeren na vrijgave |
</frozen-after-approval>

## Code Map
- `docker-compose.prod.yml`: huidige ongeschikte hostnetwerk/lokale builds; te vervangen door getrapte dedicated productievoorziening.
- `docker-compose.acc.yml`: bewezen app/ML SHApaar en MinIO digest; niet wijzigen.
- `apps/api/src/main.ts`: REDIS_URL activeert workers en catalog-provider; niet wijzigen. Alle appstart pas na voorbereiding.
- `apps/ml-service/app/main.py`: startup wist/herbouwt referentievectoren en REINDEX; niet op incomplete database starten.
- `apps/ml-service/app/services/storage.py`: auto-init slechts models/training-images; vierbucketsinit apart voorbereiden.
- `apps/api/prisma/migrations`: 21 migraties; public plus vector/trigram/gist/gin en grants hardcoded rol logorecognition.
- `apps/ml-service/app/ml/model_manager.py`: EfficientDetONNX/mocks en EfficientNetTorchcache; GHS-model in image.

## Tasks & Acceptance
Execution:
- [x] `docker-compose.prod.yml`: pinned app/ML-images, eigen PG16/vector, privé bridge-netwerken, volumes zonder shared ACCpaths, defaults starten uitsluitend PG/Redis/MinIO; bucketinitializer voorbereid; runtime profiel app/ML en alleen app op externe Coolify-proxynetwerk. Geen verplichte GPU of hostpoorten.
- [x] `scripts/deployment/production/production.env.example`: concrete envcontract met verplichte eigen geheimen/config, geen bruikbare fallbackgeheimen. Leg ontbrekende echte waarden vast, geen echte secretwaarden.
- [x] `scripts/deployment/production/initialize-buckets.py`: vierbucketsinit met bestaande MinIO-Pythonclient in bevroren ML-image als afzonderlijke provisioning-entrypoint; geen app-lifespan/MLherbouw. Controleer private bucketpolicy en leesbaarheid, geen deletes of publiek-policy.
- [x] `scripts/deployment/production/check-production-config.py`: statische failclosedvalidator, één exacte versie/digests, gescheiden app/MLdatabasecredentials mogelijk, productie-eigen inputs en geen hostpoorten/lokale builds; toon geen secrets. Gebruik argparse Pythonstdlib plus lokaal aanwezige YAMLparser indien nodig.
- [x] `scripts/deployment/production/test-production-config.py`: betekenisvolle configuratie-, ontbrekende invoer-, profielisolatie- en bucketinitializer-tests; geen liveDBtests.
Root beheert afzonderlijk `docs/04-deployment/production-preparation-20261005.md`, bronrelease-evidence en spec/status. Implementatieagent beheert bovenstaande vijfpaden; anderen werken ook in deze codebase, behoud hun wijzigingen en pas jouw werk daarop aan.

Acceptance Criteria:
- Given een compleet fictief lokaal envbestand, when configcontrole en DockerComposeconfig draaien, then een consistent imagepaar/private geïsoleerde infrastructuur en expliciete runtimeprofielen valideert zonder containerstart.
- Given ontbrekende of ACCgerichte inputs, when de validator draait, then volgt een fout zonder secretwaarden of livewrites.
- Given een lege of al deels gevulde objectopslag, when bucketinitializer loopt tegen een fake testclient, then bestaan alle vier private buckets herhaalbaar zonder verwijderen.
- Given standaardcomposeprofielen, when services worden geselecteerd, then app/ML/startupwriters zijn afwezig tot runtime expliciet wordt geactiveerd.

## Implementation Notes
Aparte beheerde werkmap gekozen wegens eerdere onverwerkte onderzoeksbestanden en reeds gemergde featurebranch; gebruiker heeft voorbereiding geautoriseerd. Speccheckpoint betreft deze goedgekeurde lokale voorbereiding, geen productie-uitvoertoestemming. Geen training of modelgewichten wijzigen.

## Verification
- Pythonconfig/bucket-tests: relevante positieve/negatieve gevallen slagen.
- `docker compose --env-file <fictieve lokale env> -f docker-compose.prod.yml config`: valideert zonder start; inspecteer services van default en runtimeprofiel.
- Onafhankelijke reviewers controleren diff, randgevallen en ontbrekend bewijs.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence | Route / resolution |
|---|---|---|---|
| B1 | high | Login bereikt authQuery/getAuthPool; AUTH_DATABASE_URL ontbreekt. | patch: auth/media contract |
| B2 | high | MediaServerClient valt daadwerkelijk terug op media.acc.xxtract.com. | patch: auth/media contract |
| B3 | high | Compose gebruikt lokaal named volume terwijl guide Storage Box voorschrijft. | patch: storage binding |
| B4 | high | Hostnamevalidator accepteert bestaande live route; router gebruikt deze meteen. | patch: verification hostname |
| B5 | high | Compose geeft shellomgeving voorrang; validator controleert alleen bestand. | patch: effective environment |
| B6 | medium | Infrastructurele envexpressies worden niet exact gecheckt. | patch: wiring validation |
| B7 | medium | Reviewprovider/key/modelexpressies worden niet exact gecheckt. | patch: wiring validation |
| B8 | medium | Binnenliggende apostrof wordt geaccepteerd door read_env maar niet door Compose. | patch: env parsing |
| B9 | medium | Geen resourceplafonds op gedeelde host; eerder ingestelde plafonds verwijderd. | patch: resource limits |
| B10 | medium | Logrotatie verwijderd; diskcapaciteit moet beschermd blijven. | patch: logging |
| E1 | high | Zelfde bewezen ontbrekende authconnection als B1. | patch: auth/media contract |
| E2 | high | Zelfde bewezen ACCmediafallback als B2. | patch: auth/media contract |
| E3 | high | Zelfde bewezen omgevingsoverride als B5. | patch: effective environment |
| E4 | high | Zelfde bewezen opslagafwijking als B3. | patch: storage binding |
| E5 | medium | urlsplit leest .port niet automatisch; ongeldige poort blijft geaccepteerd. | patch: URL validation |
| E6 | medium | Regex laat lege DNSlabels toe; onbruikbare verificatieroute kan slagen. | patch: URL validation |
| V1 | medium | Gap preverified: helpertests bewaken niet main-foutstatus/leakage. | patch: entrypoint coverage |
| V2 | medium | Gap preverified: geen normale CI-invocation van nieuwe veiligheidssuite. | patch: CI coverage |
| V3 | high | Zelfde bewezen authconnection als B1/E1. | patch: auth/media contract |

De correcties betreffen bestaande vereiste verbindingen, beloofde opslag, effectieve configuratie en directe regressiecontroles; geen wijziging van de goedgekeurde intentie of publiek endpointcontract. Geen finding afgewezen of verborgen.

### Uitvoeringsverduidelijking na review
Voeg AUTH_DATABASE_URL, MEDIASERVER_DOMAIN en MINIO_DATA_PATH toe aan het bestaande contract. MINIO gebruikt een eigen Storage Box-subdirectory; de verifierhostname mag niet de legacy publieksroute zijn. Controleer effectieve shelloverrides, alle credential/providerexpressies, URLpoorten/DNSlabels en Compose-compatible quotes. Behoud begrensde logs en voorlopige resourceplafonds. Voeg provisioning-entrypointtests en reguliere CI-invocation toe. Deze verduidelijking verandert geen productie-uitvoertoestemming.

| V4 (hercontrole) | medium | Succesentrypointtest bewijst nog geen daadwerkelijke vierbucketinit; wegvallen van helpercall kan slagen. | patch: assertions op created/read |

## Eindverificatie
29 voorbereidingstests + 11 workflowcontracttests groen; uiteindelijke fictieve env/Composevalidatie en profielselectie groen. 21 SQLs toegepast en 34tabellen lokaal hersteld, geen gevulde bronproef. Alle 20 afzonderlijke reviewbevindingen gecorrigeerd, niets uit review uitgesteld. Geen livewrites. Werkmap/cache behouden, tijdelijke fixture/container/volume verwijderd.
