# Draaiboek: acceptatie naar productie in Coolify

Datum oorspronkelijke inventaris: 5 oktober 2026. Actuele status op 6 oktober: **nieuwe productievoorziening en publieksomschakeling uitgevoerd; controles na uitrol en expliciete beperkingen worden bijgehouden**. Eigenaar: Codex/root; uitvoereigenaar: releasecoördinator. Hoofdtaak: `01a0fc7a-28d6-7333-ae26-c6dc972076d8`. De gebruiker heeft de productie-uitvoering expliciet goedgekeurd.

## Actuele uitvoering — 6 oktober 2026

De gebruiker heeft uitvoering expliciet toegestaan met: **“Ga verder totdat alles klaarvis in productie”**. De afgesproken productieovergang is uitgevoerd op de nieuwe eigen voorziening; de publieke route is omgeschakeld en met werkelijke verzoeken gecontroleerd. Geplande waarneming, eventuele aanvullende controles en latere uitfasering worden afzonderlijk bijgehouden. Het uitvoerakkoord is geen opdracht om de oude dienst of volumes te verwijderen.

De nieuwe Coolifyvoorziening `f048gs04scoksggw0okw4oo0` op Banana draait met vijf gezonde onderdelen: app/webinterface, ML, PostgreSQL, MinIO en Redis. De bestaande publieke route `logo-detection.xxtract.com` wijst nu naar de nieuwe app; definitieve publieke gezondheid is gecontroleerd op 6 oktober om circa 00:25 UTC. De terugkeer is daadwerkelijk beproefd: de route wees tijdelijk weer naar de gezonde legacydienst met `model_loaded: true`, waarna uitsluitend het eigen routebestand opnieuw werd geplaatst voor de nieuwe dienst. De oude voorziening en cache zijn behouden.

De **gegevensbron** blijft de gecontroleerde `814f6cd396f63dada95411d51dda5dfae3205a6a`-momentopname. Het daadwerkelijke **productiecodepaar** is `2c5bdab23c6d66f40183391a10bbb24ba1481601`: appdigest `5416ce7ae7f9576bea3e67dd8041102a407d63372941bdeeefd95ba45bf54aef` en ML-digest `99c08f57e0742d51122245db93120c06f4423f089db84e619042d74c187c2fa2`. De eerdere codevrijgave `f247881` en configuratie-PR10 `be70430b8b9b0268ef09c3f26d10c67025407257` zijn geschiedenis; zij worden niet als de huidige toepassingsimages gepresenteerd. Image-identiteiten, revisies, gezondheid, nul herstarts en geen geheugenuitval zijn werkelijk gecontroleerd.

Alle 34 toepassingstabellen plus 21 echte migratieregistraties en geselecteerde gegevens zijn beschikbaar met gecontroleerde relaties. Alle 1.069 benodigde objecten (40.487.281 bytes) zijn op grootte en SHA256 gecontroleerd; vier buckets blijven privé. De echte app bevestigt 542 actieve referenties, 542 vectoren, 876 logo-afbeeldingen, een lege bootstrapqueue en lege artworkreviewqueue; `flywheel.paused` is waar. De broncontrole na ACC2c5-uitrol bevestigt alle negen geselecteerde rijhashes, 21 migratiechecksums en 1.069 objecthashes onveranderd tegenover de gegevensbron. Het oorspronkelijke f247-controlebewijs blijft in de historie: [bronfreezecontrole](source-freeze-recheck-20261006.json).

De vrijgegeven GHS-modelhash `68b9ce1488150d32722bb116790fcd065a89d53525fa43dfd48c3148f63d8974` en embeddingcachehash `7f5810bc96def8f7552d5b7e68d53c4786f81167d28291b21c0d90e1fca14934` kloppen in de werkelijke ML. De publieke `/detect` herkende een echt productievoorbeeld als Nutri-Score B met HTTP 200 in 24,96 seconden en oorspronkelijke A2-score 0,9985477328300476. Het echte GHS-etiket leverde FLAME met 200 in 5,99 seconden, score 0,990627376953735, uitsluitend als reviewvoorstel. Een verkeerde API-sleutel geeft 401. Een negatieve frontfoto gaf 200 zonder detecties of reviewvoorstellen. Geen score is verhoogd; dit bewijst deze gecontroleerde voorbeelden, **geen algemene kwaliteit of voldoende praktijkbewijs voor alle negen GHS-typen**.

Twee grote productiebeelden van circa 36 en 41 miljoen pixels zijn gelijktijdig verwerkt in 36,02 en 32,24 seconden; een derde verzoek kreeg gecontroleerd 503 in 0,13 seconden. Gemeten geheugenpieken waren 265.175.040 bytes voor de app en 2.604.453.888 bytes voor ML; beide bleven gezond, zonder herstart of geheugenuitval. Dit is een begrensde belastingproef, geen onbeperkte capaciteitsgarantie. Zie [uitrolbewijs](production-rollout-evidence-20261005.json).

De daadwerkelijke publieke webinterface geeft 200. Productie-authenticatie leest uitsluitend de afzonderlijke gebruikersdatabase: 30 actieve gebruikers, alleen SELECT, geen gewijzigde gebruikersrijen. Een bestaande actieve gebruiker met een kortlevende intern ondertekende sessie krijgt via `/auth/me` 200 en de passende identiteit; een ongeldige sessie geeft 401. Werkelijke rolcontroles geven klant 403 en beheerder 200. De Laravel-bcryptvergelijking is met een synthetisch bekend wachtwoord op de echte runtime getest: correct geaccepteerd, verkeerd geweigerd. **Wachtwoordlogin met een bestaande gebruiker is niet uitgevoerd omdat diens wachtwoord niet bekend is.** Gebruikers-ID’s, e-mailadressen en geheimen worden niet gepubliceerd.

De werkelijke geauthenticeerde publieke upload gaf 201. Het origineel gaf 200 (425 bytes, PNG), de gegenereerde thumbnail 200 (538 bytes, JPEG) en een bestaande referentiepreview 200. Alle preview-URLs gebruiken dezelfde publieke apphost; gewijzigde ondertekening geeft 403. Eigen testrecord en beide objecten zijn vervolgens met 200 verwijderd en aantoonbaar afwezig; het aantal logo-afbeeldingen bleef 876 vóór en na de test. De eerdere interne `http://minio:9000`-previewfout is daarmee daadwerkelijk opgelost.

De getimede gevulde herstelproef blijft bewezen: export 0,356 seconden, werkelijk databaseherstel 0,494 seconden en volledige proef inclusief bestanden/verificatie/opruimen 13,837 seconden; alle 35 openbare tabelfingerprints gelijk. De eerste **versleutelde dagelijkse backup** `20261006T001655Z-82b81313` is daadwerkelijk gemaakt met uitsluitend AES-256-GCM-ciphertext en geschoonde metadata op de StorageBox. Een onafhankelijke Mac-validatie authenticeerde en controleerde alle hashes van het pakket met 35 tabellen en 1.069 objecten. Alleen de eigen nieuwe lokale plaintext-runmap is na geslaagde externe publicatie verwijderd (`private_stage_removed: true`); eerdere backups en sleutelkopieën blijven behouden.

De aanvankelijke, inmiddels vervangen plaintext-backuprun is door de coördinator op 6 oktober om circa 00:41 UTC uitsluitend uit de eigen private staging verwijderd, nadat de onafhankelijke versleutelde capsules waren geauthenticeerd en geverifieerd. De versleutelde backups, onafhankelijke sleutelkopieën en afzonderlijke databaseherstelbewijzen blijven behouden. Geen oorspronkelijke productiegegevens of eerdere beschermde herstelbewijzen zijn verwijderd.

De dagelijkse systemd-timer is actief op 02:15 UTC. De tweede echte service-uitvoering `20261006T002009Z-bc41895a` eindigde succesvol om 00:20:30 UTC. Versleutelde kopie/authenticatie is **geen nieuwe databaseherstelproef**; de dagelijkse receipt vermeldt `restore_tested: false`. De eerdere getimede databaseherstelproef blijft het afzonderlijke herstelbewijs. Zie [dagelijkse backup](production-daily-backup-20261005.md).

De laatste volledige CI-run `37395367362` slaagde voor server-, ML- en beveiligingscontroles, maar de browsertests faalden door HTTP 429: de gedeelde synthetische testomgeving putte haar standaard verzoekbudget uit. De oorzaak is met screenshot en trace vastgesteld; de correctie verhoogt uitsluitend het CI-browsertestbudget naar 10.000 en is onafhankelijk beoordeeld met 12 geslaagde omgevingscontroles. De volledige browserherhaling staat nog open; er wordt geen volledig geslaagde CI-run geclaimd. De daadwerkelijke productiecode en het imagepaar `2c5bdab` zijn hierdoor niet veranderd.

Coördinator Codex/root heeft een **begrensd GO** vastgelegd voor deze migratie, de bestaande publieke `/detect` en overgedragen training/opslag op basis van werkelijk publiek bewijs en de zelfstandige productieopdracht. Geen nieuw gebruikersakkoord wordt verondersteld. Bestaande-gebruikerswachtwoordlogin en de generieke v1-route met instelbare drempels blijven uitgestelde acceptatiepunten: het gebruikerswachtwoord is onbekend en de generieke ONNX-detector ontbrak reeds in ACC. Dit zijn expliciete scopebeperkingen; niet alle 110 checkliststappen of algemene logo-/GHS-kwaliteit zijn daarmee bewezen.

**Nacontrole:** de daadwerkelijke 15-minutencontrole is geslaagd: 900 seconden met 24 steekproeven, telkens de nieuwe publieke gezondheid 200 en vijf gezonde onderdelen zonder geheugenuitval of herstart. De geïnstalleerde read-only observer slaagde handmatig om 00:33:10 UTC en via systemd om 00:33:47 UTC met exitcode 0: 542 actieve referenties én 542 complete vectoren, backupservice, timer en huidige versleutelde backuphash correct.

De twee echte server-timers zijn actief voor 6 oktober 01:25:18 UTC (één uur) en 7 oktober 00:25:18 UTC (24 uur). De hoofdtaak heeft daarnaast actieve stille nazorgbewaking: alleen melden bij een betekenisvolle fout of afronding. **Die toekomstige controles zijn nog niet uitgevoerd**; zij blijven open. De echte queuecontrole om 00:29 UTC toont geen actieve, wachtende of mislukte jobs. Eigen schedules zijn geïnventariseerd en één veilige watchdog is succesvol verwerkt; geen ACC-jobs geïmporteerd en geen willekeurige training gestart. De publieke legacyroute gebruikt een vaste strenge drempel 0,99; instelbare normale/hoge drempels van de afzonderlijke v1-route zijn niet getest. De bestaande-gebruikerswachtwoordlogin blijft expliciet onbeproefd. De legacyvoorziening en modelcache blijven minimaal tot de 24-uurscontrole én een afzonderlijk gedocumenteerd uitfaseerbesluit behouden; geen automatische stop of verwijdering.


## 1. Uitkomst en belangrijkste keuze

Breng de goedgekeurde versie van logoRecognition met de webinterface, API, herkenningsdienst, PostgreSQL-tabellen, geselecteerde beheerde gegevens, MinIO-opslag en eigen Redis naar productie. Behoud bestaande productiegegevens en houd de huidige productiedienst beschikbaar totdat de nieuwe dienst bewezen werkt.

**Productie draait momenteel een andere, oudere toepassing.** Maak daarom een nieuwe productievoorziening naast die dienst. Verander de bestaande Coolify-voorziening niet blind naar een andere repository. Schakel de bestaande publieksroute pas om nadat aanroepcontract, authenticatie en herkenningsresultaten zijn gecontroleerd. “Alles overbrengen” betekent alle goedgekeurde functionaliteit, tabellen en benodigde beheerde inhoud beschikbaar maken; het betekent geen automatische vervanging van gebruikers, geschiedenis, wachtrijen of productiegegevens door acceptatiegegevens.

De oorspronkelijke voorbereiding gaf op zichzelf geen toestemming voor productiehandelingen. Inmiddels heeft de gebruiker de productieovergang expliciet opgedragen, zoals hierboven vastgelegd. Voer alleen de goedgekeurde begrensde acties uit; ontbrekend acceptatiebewijs en toestemming voor latere verwijdering worden niet verondersteld.

## 2. Historische broninventaris — 5 oktober 2026

Onderstaande waarnemingen zijn de historische read-only inventaris vóór uitvoering op 5 oktober 2026. Bewaar ze als herkomst; uitspraken als “niet gevonden” en bronversie `814f6cd` beschrijven dat eerdere moment. Voor de actuele nieuwe productievoorziening en codevrijgave geldt de uitvoeringsregistratie hierboven. Repository-instellingen bewijzen op zichzelf niet wat werkelijk draait.

| Onderdeel | Vastgesteld | Gevolg |
|---|---|---|
| ACC Coolify | `qsookwow8koko0kwg00g0cwk`, Vanilla | Bronvoorziening; wijzig deze niet tijdens inventaris/export |
| ACC toepassingsversie | App en ML gebruiken GHCR-revisie `814f6cd396f63dada95411d51dda5dfae3205a6a`, beide gezond | Bevries deze versie en beide image-digests als bron |
| ACC MinIO | Digest `14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e`, gezond | Exacte versie vastleggen, geen `latest` introduceren |
| ACC Redis | Redis 7, gezond | Eigen productie-wachtrij maken; ACC-jobs niet kopiëren |
| ACC database | PostgreSQL 16.15, host `10.0.0.6:5432`, database `logo_recognition` | Gecontroleerde bron; niet gebruiken als productiedatabase |
| ACC schema | `public`; `search_path` is `"$user", public`; 35 tabellen inclusief `_prisma_migrations` | Alle 34 toepassingstabellen plus migratieregister aanwezig |
| ACC bronmomentopname | Database 28.572.695 bytes (circa 27,25 MiB); logos 41; reference_logos 604; training_data 930; gold_set_records 900; model_versions 0; reference_embeddings 542 | Dit zijn waargenomen bronwaarden, geen vooraf goedgekeurde importaantallen; 604 referenties tegenover 542 vectoren vraagt actieve-setcontrole |
| ACC aanvullende objecten | Geen views of materialized views in de live inventaris | Functies, triggers, rechten en eigenaren wel afzonderlijk vastleggen |
| ACC extensies | vector 0.6.0; pg_trgm 1.6; btree_gin 1.3; btree_gist 1.7 | Compatibele extensies op productie vooraf aantonen |
| ACC migraties | Alle 21 van `0001` tot `0021` afgerond, niet teruggedraaid | Bronhistorie compleet; niet als fictieve productiehistorie importeren |
| Bestaande productievoorziening | `kc4w4400wgwcg8sc4cwgw8s8`, “Logo detection”, Banana | Bestaande dienst beschikbaar houden |
| Bestaande productiebron | `XXtract-development/logo-detection-service`, `main`, `/docker-compose.prod.yaml` | Dit is een andere repository dan logoRecognition |
| Bestaande productiecontainer | Eén gezonde Python-container, image `kc4w4400wgwcg8sc4cwgw8s8_logo-detection:437fd96266e2d24bc77249405f1ad8432f7baf3b` | Leg deze image vast als terugkeerdoel |
| Bestaande productieconfiguratie | Geen DATABASE_URL-, MinIO- of Redis-configuratiesleutels aangetroffen; volume `model-cache-prod` op `/home/appuser/.cache/groundingdino` | Geen bestaand nieuw databasesysteem veronderstellen; cache behouden |
| Bestaande productieadres | `https://logo-detection.xxtract.com:8001` in Coolify | Werkelijke externe route, poort en afnemers nog contractmatig controleren |
| Bekende productiedatabasehost | Op de onderzochte host geen PostgreSQL-listener op 5432, geen PostgreSQL-dienst/tooling; wel MySQL en MongoDB | Het in compose genoemde `10.0.0.8:5432` is geen bewezen werkend PostgreSQL-doel; inventarisatie bewijst niet dat elders geen PostgreSQL bestaat |
| Coolify database-/dienstenlijst | Geen passende logoRecognition/PostgreSQL-voorziening aangetroffen in begrensde zoekactie | Nieuwe dedicated PostgreSQL 16 met compatibele vector-extensie voorbereiden; locatie, eigenaar en backups nog bevestigen |
| Productiepoorten | 8000 en 8001 op Banana bezet | Huidige productiecompose veroorzaakt poortconflict; netwerkplan aanpassen vóór uitvoering |
| Publieke legacycheck | `/health` en `/openapi.json` geven 200; titel LogoDetectionService, versie 0.1.0; routes `/health` en `/detect` | `/detect`-contract vergelijken met de nieuwe API; eventuele adapter vóór cutover testen |
| ACC publieke check | `/health` geeft 200; `/openapi.json` leverde HTML, geen OpenAPI-JSON | Geen automatisch beschikbare nieuwe OpenAPI-route veronderstellen |
| Nieuwe productievoorziening | Niet gevonden in de onderzochte Coolify-toepassingslijst | Nieuwe parallelle voorziening voorbereiden |
| Nieuwe repositorybranches | `origin/acc` = `814f6cd396f63dada95411d51dda5dfae3205a6a`; `origin/main` = `5929d742fd25259cbc3ac736f283cc8e54f265f4` | Branches zijn niet gelijk; huidige `main` niet blind deployen |
| GHS-model in ACC-image | `ghs-glyph-v1-58a1db6819e8`; SHA256 `68b9ce1488150d32722bb116790fcd065a89d53525fa43dfd48c3148f63d8974` | Bundel exact dit vrijgegeven model; verworpen experimenten niet meenemen |

Nog vóór uitvoering vaststellen: nieuwe/dedicated productie-PostgreSQL-voorziening en eventuele elders bestaande logoRecognition-gegevens; database-eigenaar/rollen/rechten/back-upbeleid; beschikbare hostpoorten en opslagmounts; nieuwe Coolify-ID; tijdelijke verificatieroute; definitief API-contract en afnemers; productie-authenticatie; omvang van gegevens en bestanden; overdrachtsduur en onderhoudsvenster. Bewijs en besluiten invullen in §13. Onbekend betekent een open uitvoervoorwaarde, niet een verondersteld akkoord.

## 3. Reikwijdte en verboden shortcuts

In scope: huidige goedgekeurde toepassing, herkenningscode en ingebouwd model, alle 34 tabellen, noodzakelijke eigen configuratie, beheerde referenties en training met broninformatie, samenhangende opslagobjecten, verbinding met productiecatalogus/media, monitoring, herstel en route-omschakeling.

Buiten een automatische kopie: ACC-gebruikers/wachtwoorden, productiegeheimen, testresultaten, acceptatiejobs, persoonlijke of lokale onderzoeksbestanden, verworpen modelkandidaten, en externe MongoDB/catalogus/media-databases. Deze externe diensten blijven bronverbindingen; hun tabellen of bestanden worden niet overschreven door deze vrijgave.

Gebruik geen volledige ACC-databaseherstelactie over een bestaande productiedatabase. Gebruik geen `prisma db push`, reset, destructive down-migrations, verwijdering van opslagvolumes, `mirror --remove`, of een ongetoetste import met conflicten negeren. Gebruik geen globale migratie-opdracht als vervanging voor een vooraf gecontroleerd pending-plan. Alle Laravel-migratie/reset/wipe-opdrachten op gedeelde containers blijven verboden volgens teaminstructies.

## 4. Architectuur en configuratie die productie moet krijgen

De nieuwe voorziening bevat vier onderdelen: één app-container met webinterface en API, één ML-container, MinIO en Redis. PostgreSQL is een afzonderlijk beheerde database. Bij opslag op dezelfde host blijven bestanden in de productie-Storage Box-map; containers zijn vervangbaar, hun persistente gegevens niet.

| Configuratiegroep | Voor productie vastleggen zonder waarden openbaar te maken |
|---|---|
| Versie | Beide GHCR-image-digests, OCI-revisie, release-SHA, compose-checksum en goedgekeurde MinIO-digest |
| Database | Eigen productie-DATABASE_URL, TLS, database/schema, runtime-rol, aparte DDL-rol, verbindingslimiet en extensies; eigenaar van `reference_embeddings` en bevoegdheid voor ML-herindexering expliciet vastleggen (§9) |
| Opdrachtverwerking | Eigen Redis-adres/poort/namespace en volume; `PIPELINE_SERVICE_KEY`; gekozen werkercapaciteit en schema’s voor automatische taken |
| Opslag | Productie-MinIO-endpoint/poort/TLS en beperkte eigen credentials; buckets; `/mnt/storagebox-home/prod/logo-recognition/minio-data` indien de mount daadwerkelijk is bevestigd |
| Toegang | `AUTH_DATABASE_URL` en bijbehorende externe productiegebruikersdatabase afzonderlijk controleren naast `DATABASE_URL`; JWT/authenticatie-instellingen, productiegebruikers en rechten, API-sleutels, toegestane origins, interne dienstsleutels |
| Brondiensten | Productiecatalogus/media-adressen en eigen API-sleutels; eventuele MongoDB alleen voor toegestane bronlezing |
| Herkenning | Modelpad, ONNX-bestand indien gebruikt, embeddingmodel/gewichtencache, GPU-instelling indien werkelijk ondersteund, GHS-review-provider en twee modellen indien die functie wordt vrijgegeven |
| Kwaliteitsregels | De goedgekeurde drempels, holdout-minimum, review-/twijfelgedrag, referentie- en promotie-instellingen; bewuste productie-instellingen blijven behouden |
| Netwerk | Interne app/ML/Redis/MinIO-poorten, tijdelijke route, definitieve route, TLS, firewall en reverse proxy |

Bij de oorspronkelijke inventaris was de repository-productiecompose nog niet gelijkwaardig aan ACC; onderstaande constateringen zijn historisch en worden door de actuele bevroren productieconfiguratie en runtimecontrole aangevuld: app/ML worden lokaal gebouwd, MinIO gebruikt `latest`, ML heeft standaard één proces en een Nvidia-reservering, en expliciete productie-routerlabels ontbreken. Voorbereidende codewijzigingen moeten dit eerst corrigeren of een expliciet goedgekeurd equivalent bieden. Neem hostnetwerkpoorten 6379, 9000, 9001, 8000 en 8001 niet blind over: de bestaande dienst kan poorten al gebruiken. Voorkeursvoorstel: afzonderlijk compose-bridgenetwerk met alleen de reverse proxy als toegang en interne ML/Redis/MinIO-adressen; eerst implementeren en op ACC testen. Alternatief: aantoonbaar vrije hostpoorten met private binding/firewall. Pas ML-adres, healthchecks en router consistent aan. GPU-beschikbaarheid is niet bewezen; geen GPU-afhankelijkheid zonder controle.

Voor automatische uitrol bouwt `build-push.yml` huidige images op `acc` en `main`, maar alleen ACC heeft daarin een werkelijk beschreven Coolify-uitrolstap. Een merge naar `main` is dus geen bewezen productie-uitrol. De andere productie-workflows verwijzen naar oudere frontend/backend-structuur, voorbeeldadressen of Kubernetes; schakel geen daarvan in als actuele Coolify-route zonder beoordeling.

Releaseversie: als een toekomstige merge naar `main` een nieuwe SHA oplevert, laat beide images voor diezelfde SHA bouwen en controleer dat hun toepassingsinhoud gelijk is aan de goedgekeurde ACC-versie. Gebruik óf aantoonbaar hetzelfde ACC-imagepaar op exacte digests, óf het samen gebouwde, opnieuw gecontroleerde releasepaar. Meng nooit de app van de ene SHA met ML van een andere. Leg ook de terugkeerimages van beide nieuwe onderdelen vast.

## 5. Databasestructuur en migraties

De actuele eigenaar van de structuur is de API/Prisma-code. ML leest en schrijft delen van dezelfde PostgreSQL-database. De live ACC-tabellen liggen in `public`. De repository bevat daarnaast een init.sql die `logos` en `monitoring`-schema’s, functies en een materialized view beschrijft. Die init.sql is **geen bewijs** van de live productie-structuur en mag niet blind als upgrade worden uitgevoerd.

Controleer op het gekozen productie-doel `current_database`, PostgreSQL-versie, `current_schema`, `search_path` per runtime-/migratierol, alle schema’s en objecten, extensies, owners, grants, default privileges, migratiechecksums en bestaande rijen. Bij afwijking eerst een apart herstel-/baseliningplan maken. Bestaande tabellen zonder correct migratieregister mogen niet fictief “afgerond” worden gemarkeerd voordat volledige structuurvergelijking bewijst dat die migratie werkelijk aanwezig is.

| Volgorde | Migratie | Effect en aandacht |
|---:|---|---|
| 1 | 0001_initial | 16 basistabellen, enums, vectoren, indices en relaties; alleen op bewezen lege/juiste structuur |
| 2 | 0002_add_holdout_to_training_data | Beschermde testgroepmarkering |
| 3 | 0003_add_metrics_to_model_version | Modelmetingen |
| 4 | 0004_add_reference_logos | Referentiebibliotheek |
| 5 | 0005_add_reference_embeddings | Referentievectoren |
| 6 | 0006_add_artwork_pipeline | Trainingsherkomst, actief/crop, imports, runs en review |
| 7 | 0007_add_retraining_notifications | Meldingen; grant aan rol `logorecognition` |
| 8 | 0008_add_model_activation_log | Activatiehistorie; grant aan rol `logorecognition` |
| 9 | 0009_add_field_type_to_reference_logos | Referentieveldtype |
| 10 | 0010_field_type_gs1_codelist_names | Veldverbreding, GS1-veld en wijziging bestaande waarden |
| 11 | 0011_nutriscore_fieldtype_nutritionalscore | Correctie bestaande Nutri-Score-veldtypewaarden |
| 12 | 0012_flywheel_nomination_tables | Kandidaten, kandidaatvectoren en negatieve voorbeelden |
| 13 | 0013_add_gold_set_records | Beheerde beoordelingsset en vervangingsrelatie |
| 14 | 0014_add_promotion_batches | Promotiebatches en kandidaatrelatie |
| 15 | 0015_add_system_settings | Persistente instellingen |
| 16 | 0016_add_outlier_findings | Afwijkingsmeldingen |
| 17 | 0017_add_threshold_changes | Wijzigingshistorie instellingen |
| 18 | 0018_add_mismatch_events | Declaratie/herkenningswaarnemingen |
| 19 | 0019_add_bootstrap_queue | Werkvoorraad |
| 20 | 0020_add_gln_backfill_reason | Nullable uitvalreden |
| 21 | 0021_add_declared_harvest_checks | Onthouden oogstbeoordelingen |

Forward-migraties bevatten geen expliciete tabelverwijdering, maar data-updates, unieke sleutels en relaties kunnen bestaande afwijkende gegevens raken. Controleer migraties 0010/0011 expliciet met voor/na-aantallen. Extensies vector, pg_trgm, btree_gin en btree_gist moeten beschikbaar zijn. De hardcoded rol `logorecognition` moet bestaan en de grants moeten passen; runtime-rollen krijgen geen onnodige DDL-rechten.

Voer het exact vastgelegde ontbrekende migratieplan eerst op een herstelde productiekopie uit. Alleen na toestemming gebruikt de DBA een gecontroleerde migratie-uitvoering met productie-identiteitscontrole, logging, passende lock-/statementtime-outs en de bevroren migratiebestanden. `prisma migrate deploy` past alle nog ontbrekende migraties toe: pas het alleen toe wanneer dat volledige pending-plan vooraf is goedgekeurd. De toepassing voert deze migraties niet vanzelf uit. Gebruik uitsluitend de aan het project-lockfile gekoppelde Prisma 5-tooling (`package.json`: `^5.9.1`), bijvoorbeeld gebundelde CLI/`npx --no-install`; geen ongemerkt opgehaalde nieuwste Prisma-CLI of andere generatie migratiecommando’s.

## 6. Alle tabellen en gegevensbeleid

Alle tabellen moeten qua structuur beschikbaar zijn. “Selectief” hieronder betekent een goedgekeurd rijmanifest met bron-ID, natuurlijke sleutel, eventuele doel-ID, inhoudshash, relaties, bijbehorend opslagobject en verwachte aantallen. Bij een werkelijk nieuwe lege productiedatabase zijn er geen bestaande rijen te bewaren; ook dan blijven ACC-testgebruikers en jobs geen standaard productie-inhoud.

| Tabel | Gegevens naar productie | Controle/conflictafhandeling |
|---|---|---|
| organizations | Productieorganisaties behouden/gericht aanmaken | Unieke slug; geen ACC-organisatieblindkopie |
| users | Productiegebruikerstoegang gericht regelen | Unieke email; geen ACC-wachtwoorden of ongewenste ADMIN-rechten |
| logos | Goedgekeurde categorieën en actieve instellingen selectief | `(category,value)`; productiebeleid niet stil overschrijven |
| logo_images | Benodigde gecontroleerde beelden selectief | Bijbehorende opslag en hash eerst; ID-mapping |
| training_batches | Afgeronde benodigde herkomstbatches selectief | Geen lopende/failed testjobs; eigenaar naar geldige productie-identiteit |
| training_data | Gecontroleerde training en beschermde testgroep selectief | image-relatie, label/herkomst, active/validated/holdout behouden |
| annotations | Benodigde bevestigde annotaties selectief | image/batch/logo/created_by-relaties oplossen |
| model_versions | Geselecteerde goedgekeurde modellen selectief | Versie uniek; bestand/config/metingen samen; activatie apart beslissen |
| logo_embeddings | Alleen passend bij overgebrachte logo/modelversie | Exacte embeddingversie/dimensie; relaties en aantallen |
| reference_logos | Goedgekeurde bibliotheek selectief | `(t3777_code,variant_label)`; opslag/hash/GS1velden; bestaande conflicten beslissen |
| reference_embeddings | Gecontroleerd opnieuw opbouwen | Startup schrijft; actieve referenties en bestanden eerst compleet |
| reference_candidates | Alleen gewenst consistent beheerd werk selectief | `(content_hash,t3777_code)`; geen ongewenste open ACC-promotie |
| candidate_embeddings | Alleen bij geselecteerde kandidaten | Niet los promoveren; embeddingversie en kandidaatrelatie |
| hard_negatives | Gecontroleerde negatieve voorbeelden selectief | Hash uniek; bronbesluit en object behouden |
| promotion_batches | Alleen benodigde samenhangende historie selectief | Geen pending ACC-batch automatisch laten uitvoeren |
| gold_set_records | Beheerde beoordelingsset selectief | Inhoud onveranderlijk; volledige vervangen-door-keten en crops behouden |
| system_settings | Sleutel voor sleutel bewuste productie-inrichting | Pauze, drempels, control-cohort, baseline apart kiezen; geen blindkopie |
| outlier_findings | Productiehistorie behouden; ACC alleen indien relevant | Verwijzing naar werkelijk overgebrachte referentie |
| threshold_changes | Productieaudit behouden | ACC-import auditapart markeren; actuele waarden leven in instellingen |
| artwork_import_runs | Benodigde bronhistorie selectief | Alleen afgesloten runs; geen live ACC-run hervatten |
| artwork_imports | Benodigde echte bronbestanden selectief | media_id uniek; GLN/GTIN/source/hash/storage/pages; runrelatie |
| artwork_review_items | Gecontroleerde gewenste werkvoorraad selectief | Geen willekeurige testreviews; bron/crop/bbox/status behouden |
| declared_harvest_checks | Alleen indien bronpagina en referentiepool passen | Pair-key; tijdelijke poolfingerprint kan veranderen na vectorherbouw |
| bootstrap_queue | Productie-werkvoorraad opnieuw bepalen of selectief | Code uniek; uitsluitingen/prioriteit bewust kiezen; geen ACC-runstatusblindkopie |
| mismatch_events | Productiehistorie behouden | ACC-waarnemingen niet als productie-KPI meetellen |
| recognition_logs | Productiehistorie behouden | ACC-verificatieverzoeken niet als productieruns importeren |
| recognition_results | Productiehistorie behouden | Samen met bijbehorende logs; geen ACC-tests |
| feedback_queue | Productie-feedback behouden | Alleen gericht gewenste bevestigde inhoud; gebruiker/logo/logrelaties |
| retraining_notifications | Productiehistorie behouden | Geen oude ACC-trigger opnieuw aanbieden |
| model_activation_logs | Productieaudit behouden | Nieuwe daadwerkelijke productieactivatie zelf registreren |
| search_history | Productiehistorie behouden | Geen ACC-test-/persoonlijke zoekhistorie |
| query_stats | Productie-eigen metingen | Geen ACC-statistieken als productiemeting |
| health_checks | Productie-eigen metingen | Nieuwe controles registreren, ACC niet kopiëren |
| backup_history | Productie-eigen back-upregistratie | Daadwerkelijke productiebackup/verificatie registreren |

`_prisma_migrations` is een 35e technische tabel, geen toepassingstraining. Gebruik het correcte doeleigen migratieregister; kopieer niet blind de ACC-ledger. Leg bestaande extra tabellen, functies, triggers, views en rechten buiten Prisma afzonderlijk vast en behoud ze.

Importvolgorde volgt echte relaties: productieorganisaties/identiteiten → logo’s en modelregistraties → beelden/batches → trainingsdata/annotaties → referenties → kandidaten/vectoren en gekoppelde historie. Voor promotiebatches en gold-setzelfrelaties een expliciet twee-stapsplan met volledige ID-mapping gebruiken. Stel referentie/conflictbesluiten niet uit tot een fout halverwege de import. Gebruik een staginggebied en transactie per vooraf afgebakende samenhangende groep. Elke importgroep heeft een herhaalbaar plan en een overzicht van exact nieuw toegevoegde rijen/gewijzigde velden voor herstel.

## 7. Bestanden, modellen en opslag

Maak vóór de kopie een objectmanifest: bucket, key, grootte, SHA256, bronrijen, doelkey en doelhash. Een S3-ETag is niet altijd een bestandshash; gebruik SHA256 voor inhoudsvergelijking. Kopieer alleen benodigde objecten, zonder doelobjecten te verwijderen. Bij dezelfde key met andere inhoud: stoppen en een nieuwe key/expliciet conflictbesluit maken.

**Maak vóór de bestandsoverdracht alle vier buckets expliciet aan of controleer dat ze bestaan:** `models`, `training-images`, `recognition-images` en `thumbnails`. Ook een lege bucket is verplicht. Leg private toegang en lees-/schrijfrechten voor de werkelijk gebruikte app- en ML-credentials vast; vertrouw niet op automatische initialisatie. De ML-start maakt alleen de eerste twee buckets aan; de API roept haar functie `initializeBuckets()` momenteel nergens aan. Het kopiëren van objecten of regenereren van previews vervangt deze voorbereidingsstap niet.

Controleer vóór de omschakeling via de echte, geauthenticeerde app-upload een geldig nieuw testbeeld. Verifieer het opgeslagen origineel én de gegenereerde preview in `thumbnails`, haal beide terug met de bedoelde toegang en controleer de inhoud. Gebruik herkenbare, unieke testkeys en leg de aangemaakte records vast. Ruim uitsluitend deze testrecords en testobjecten op volgens het goedgekeurde testplan; raak geen bestaande inhoud aan. Stop bij een ontbrekende bucket, verkeerde rechten of een mislukte upload/preview, ook als alle diensten gezond lijken.

| Plaats | Behandeling |
|---|---|
| ML-image `app/assets/ghs/` | Negen referenties, manifest en specialist/model.json komen met het exacte ML-image; hashes narekenen |
| `models`-bucket | Geselecteerde werkelijk gebruikte modellen plus registraties; verworpen kandidaten uitsluiten |
| `training-images` | Benodigde bronbeelden, `reference-logos/`, artworkbestanden/crops, bevestigde training en beoordelingsbeelden |
| `recognition-images` | Productiehistorie behouden; alleen gericht benodigde inhoud promoveren |
| `thumbnails` | Benodigde previews kopiëren of gecontroleerd regenereren |
| `synthetic/` binnen trainingopslag | Alleen aanvullende goedgekeurde voorbeelden; geen vervanging voor productiemateriaal |
| `flywheel-index/*` | Kaarten op productiegegevens opnieuw opbouwen of met gecontroleerde herkomst promoveren |
| `keurmerk-harvest/declared-harvest-state.json` | Niet blind ACC-voortgang overnemen; doelbeleid vastleggen |
| `/app/models` en Torch-cache | Werkelijke model-/embeddingbestanden en persistente locatie verifiëren; eerste download en offline gedrag controleren |
| Legacy `model-cache-prod` | Behouden zolang terugkeer naar de bestaande dienst nodig is |
| Redis-volume | Eigen productievolume, geen ACC-kopie; bestaande productiequeue bewaren |

Een totale live MinIO-objecttelling is nog niet afgerond door een timeout; kopieomvang en volledige hashes zijn dus nog te meten, niet geschat. MinIO-inhoud kopiëren via gecontroleerde objectoverdracht, niet live onderliggende datamappen naar een andere MinIO-versie synchroniseren. Controleer Storage Box-mount werkelijk gemount, capaciteit, rechten en persistentie; een ontbrekende mount kan anders op lokale tijdelijke schijf lijken te werken. Officiële Coolify-uitleg: [persistente opslag](https://coolify.io/docs/applications/configuration/persistent-storage).

Seed-scripts voor gold-set, control-cohort, bootstrap en indexen zijn handmatig en hebben eigen dry-runvoorwaarden. Sommige bronbestanden uit `tests/validation` zitten niet in de runtimeimage. Voeg benodigde geverifieerde bronbestanden afzonderlijk aan het releasepakket toe. Geen automatische seed bij deploy/startup.

## 8. Back-up en bewezen herstel

Vóór enige productie-DDL/data-/routewijziging maakt de DBA een volledige logische databaseback-up in archiefformaat plus schema/objecten/rollenrechten en een objectopslagback-up/versiepunt. Leg tijdstip, bronidentiteit, grootte, checksums, bewaarlocatie en herstelprocedure vast. Sla credentials niet in dit draaiboek of logs op.

Herstel de back-up in een **aparte** database en afgescheiden opslag. Controleer alle tabellen en extra objecten, belangrijke rijenaantallen, relaties, referentiebeelden, authenticatie en modellen. Meet werkelijke hersteltijd. Een geslaagde export zonder proefherstel is geen voltooid herstelbewijs.

**Twee situaties onderscheiden:** bij een bestaande doeldatabase gebruikt de proef een herstelde productiekopie, met behoud van bestaande gegevens. Bij een nieuwe lege doeldatabase — het huidige voorkeursplan — repeteer vóór uitvoergoedkeuring lokaal/afgescheiden met een consistente ACC-selectie: lege PostgreSQL opbouwen, migraties toepassen, geselecteerde gegevens en objecten importeren, herkenning testen en deze proefset back-uppen/herstellen. Leg ook de huidige legacyconfiguratie, image en cache vast als herstelset. Na uitvoergoedkeuring pas de echte nieuwe productievoorzieningen aanmaken; voer daarop vóór publiek verkeer een backup/herstelproef in een apart doel uit. Er bestaat in die tak geen oude logoRecognition-productiedatabase die vooraf kan worden gekopieerd.

Ook ACC-export vereist een consistente bron: bevries relevante gegevenswijzigingen tijdens export of gebruik een gecontroleerd snapshotsysteem met gelijklopende database-/objectmanifesten. Een databasekopie van tijdstip A en veranderde objecten van B vormen geen bewezen consistente set.

Omdat het nieuwe systeem parallel wordt opgebouwd, is de eerste herstelroute terugschakelen naar de behouden legacydienst. Dit beschermt geen nieuwe gegevens die al door de nieuwe dienst zijn geschreven: vóór cutover het beleid voor nieuwe requests en eventuele teruglevering/archivering daarvan vastleggen. Geen gehele databasebackup terugzetten zonder vast te stellen welke sinds de backup ontstane productiegegevens dat zou verliezen.

## 9. Opstart en actieve achtergrondtaken

**ML-opstart schrijft zelf naar de database.** De dienst leest actieve referenties, verwijdert de referentievectoren, maakt nieuwe vectoren uit MinIO-beelden en herindexeert. Een lock verhindert parallelle herbouw door meerdere processen. Ontbrekende bestanden/modelproblemen kunnen nonfatal zijn: “healthy” kan naast een onvolledige referentiebibliotheek bestaan.

**Regel herindexering met de daadwerkelijke ML-databasegebruiker.** Wanneer een `ivfflat`-zoekindex aanwezig is, voert de huidige code rechtstreeks `REINDEX INDEX` uit. PostgreSQL 16 vereist daarvoor eigenaarsrechten op de index of tabel; gewone lees-/schrijfrechten zijn onvoldoende. Een aparte migratie-eigenaar met alleen gegevensrechten voor ML laat deze stap dus mislukken. Inventariseer de aanwezige index en eigenaar. Leg als concrete route vast dat een beperkte ML-rol eigenaar is van uitsluitend de benodigde tabel `reference_embeddings` en de bijbehorende indexen, met de overige noodzakelijke gegevensrechten, zonder superuser- of algemene database-eigenaarsrechten. De daarvoor benodigde eigendomsoverdracht is een afzonderlijk te beoordelen onderdeel van het goedgekeurde databaseplan; het is geen hier uitgevoerde wijziging.

Als dat eigendomsmodel niet past bij het productiebeleid, bereid dan eerst een beperkte DBA-onderhoudsroute én de bijbehorende codeaanpassing voor. De huidige rechtstreekse `REINDEX`-aanroep gebruikt zo'n route niet vanzelf; alleen een extra functie of DBA-stap toevoegen is daarom geen oplossing voor volgende opstarts. Test de gekozen route in de afgescheiden proefomgeving met dezelfde rolverdeling als productie, en herhaal de controle bij de nieuwe productiedienst vóór publiek verkeer. Bewijs dat referentieherbouw en, indien aanwezig, herindexering slagen onder de echte ML-identiteit: nul herindexeringsfouten in het herbouwresultaat/logs en correcte vectorzoekresultaten op bekende referenties. Een afgevangen rechtenfout blijft een stopreden. Als er geen `ivfflat`-index is, registreer herindexering als niet van toepassing en bewijs de zoekwerking afzonderlijk. Officiële toelichting: [PostgreSQL 16 REINDEX-rechten](https://www.postgresql.org/docs/16/sql-reindex.html).

Daarom eerst schema, referentiebestanden en actieve referentierijen compleet; daarna pas de ML-dienst starten. Vergelijk verwacht/werkelijk aantal bruikbare referenties/vectoren en controleer foutlogs. Geen onbedoelde mock voor detector of embeddings accepteren. Niet gebruikte generieke detectorcapaciteit expliciet als beperking rapporteren en via de echte herkenningsroutes beoordelen. Leg voor iedere werkelijk gebruikte herkenningsroute het detectorbestand, gewichtencache en SHA256, embeddingmodel-fingerprint en dimensie, gekozen CPU/GPU/provider en laadstatus vast. Controleer staged CPU-gewichten alleen indien die route ze werkelijk nodig heeft. Test een herstart zonder nieuwe downloads in de proefomgeving en vergelijk echte herkenningsresultaten met ACC; gezondheidsstatus en alleen een GHS-hash volstaan niet. De lege tabel model_versions bewijst niet dat modellen ontbreken: het GHS-model zit in de image en andere gewichten kunnen buiten deze registratietabel bestaan.

De API start bij een ingestelde Redis-verbinding automatisch detectie-/training-/referentiewerkers en schedulers. `flywheel.paused` is persistent maar pauzeert niet aantoonbaar alle queues. Leg daarom vóór eerste start vast: welke queues leeg/pauzeerbaar zijn, welke jobs mogen starten, welke schedulers actief worden en wie dat controleert. De nieuwe Redis bevat geen ACC-jobs; laat geen productie-import/training/promotie starten vóór de gezamenlijke controle. Beheersing kan via een afgescheiden nieuwe queue, gecontroleerde applicatiepauzes en expliciet gekozen activering; indien benodigde controle ontbreekt eerst een beoordeelde voorziening implementeren.

Wijzigingen aan bestaande productiecontainerstatus vereisen de expliciete teamvraag, bijvoorbeeld “Wil je dat ik Logo detection herstart?” Alleen het beschreven en goedgekeurde start-/deployplan uitvoeren; geen losse noodherstarts buiten dat plan.

## 10. Uitvoerfasen

| Fase/eigenaar | Voorwaarde | Actie | Verwacht resultaat/bewijs | Stopregel |
|---|---|---|---|---|
| 1. Releasecoördinator | Dit draaiboek beoordeeld | Bron-SHA, images, model, actuele config/data/objectmanifest en afnemers vastleggen | Bevroren releasepakket met hashes en scope | Bron verschuift of onduidelijke afnemer/route |
| 2. DBA/beheerder | Doeldatabase en mounts geïdentificeerd | Bestaand doel: productie-inventaris, backup en proefherstel; nieuw leeg doel: afgescheiden ACC-repetitie plus legacy-herstelset (§8) | Geteste herstelset en hersteltijd | Identiteit/restore/objecten niet bewezen |
| 3. DBA | Productiekopie veilig afgescheiden | Bestaand doel: pendingmigraties op herstelde kopie; nieuw doel: alle vereiste migraties op lege proefdatabase; structuur/conflicten/data-import en ML-herindexering onder de gekozen rolverdeling testen | Goedgekeurd migratie-, rechten- en rijplan, tijdsmeting | Schema/search_path/checksum/rolconflict, herindexeringsfout of dataverlies |
| 4. Ontwikkelaar/beheerder | Branchverschil en productiecompose beoordeeld | Releaseimages/compose/config en reviewbare definitie voor parallelle Coolifyresource voorbereiden; geen live resource aanmaken/starten | Samenhangend exact imagepaar, eigen routes/poorten/geheimen | `latest`, gemengde SHA’s, ontbrekend model of oude workflow |
| 5. Gebruiker/releasecoördinator | Concrete fase1–4 evidence aanwezig | Eén expliciet uitvoerbesluit over DBwijzigingen, start/deploy, dataselectie en onderhoud/cutover | Ondertekende §13 met begrensde acties | Geen expliciete toestemming; niets live schrijven |
| 6. Beheerder/DBA | Akkoord en herstelset actueel | Schrijvers/jobs gecontroleerd begrenzen; goedgekeurde nieuwe productievoorzieningen aanmaken; doelstructuur aanmaken/bijwerken; doeleigen herstelproef vóór cutover | Correcte migratieledger/rollen/schema, legacy gezond | Onverwachte actieve jobs/lock/DDLverschil |
| 7. Beheerder | Correcte doelopslag | Alle vier private buckets aanmaken/controleren en app-/ML-rechten vastleggen; daarna manifestobjecten toevoegen en volledig hashes vergelijken | Vier buckets aanwezig, ook indien leeg; alle noodzakelijke bestanden aanwezig | Ontbrekende bucket, onjuiste rechten, keyconflict, ontbrekende mount of hashafwijking |
| 8. DBA | Objecten compleet; conflictplan akkoord | Geselecteerde rijen in relatievolgorde importeren | Verwachte aantallen, zero verweesde relaties, productiegegevens behouden | Onverwachte update/duplicate/FKfout |
| 9. Beheerder/QA | Dataset compleet en queues beheerst | Nieuwe ML en app volgens akkoord starten; herbouw/herindexering onder de echte ML-rol verifiëren; tijdelijke route en echte upload inclusief preview testen | Versie-/modelbewijs, complete werkende vectorindex, opgeslagen origineel en preview, echte geauthenticeerde checks | Rechten-/herindexeringsfout, mislukte upload/preview, mock/lege index/providerfout/ongewenste job |
| 10. QA/releasecoördinator | Alle §11-controles geslaagd | Afnemercontract testen en go/no-go vastleggen | Bewezen compatibiliteit en herstelroute | Fout contract/auth/kwaliteit of onbekend effect |
| 11. Beheerder | Cutover expliciet akkoord | Publieksroute omzetten, gecontroleerde echte verzoeken, achtergrondtaken gefaseerd vrijgeven | Nieuwe dienst dient verkeer; oude dienst behouden | Error-/latentie-/herkenningdaling |
| 12. Beheerder/coördinator | Eerste verkeer geslaagd | Monitoren op meetpunten na 15min, 1uur, 24uur; resultaatsnotitie | Stabiele verwerking, opslag en jobs | Vastgelegde terugkeerdrempel bereikt |
| 13. Gebruiker/beheerder | Bewaartermijn en stabiliteit bewezen | Eventuele oude resource later apart uitfaseren | Documenteerde cleanup zonder verlies herstelbewijs | Geen afzonderlijk uitfaseerbesluit |

De volgorde “bestanden vóór referentie-opstart” is verplicht; een deployknop vóór database-/datavoorbereiding doorbreekt die volgorde. Tijdduur pas toezeggen nadat omvang en proefdoorlooptijd bekend zijn.

## 11. Acceptatie en go/no-go

| Controle | Vereist resultaat | Bewijs |
|---|---|---|
| Release-identiteit | Beide nieuwe containers exact goedgekeurde SHA/digests; compose en GHS-hash overeen | Inspectierapport, geen alleen mutable tag |
| Database | Alle 34 tabellen en juiste ledger; gewenste extra objecten/rechten behouden; juiste productie-identiteit | Schema-/ledger-/rechtenvergelijking |
| Gegevens | Verwachte aantallen; natuurlijke sleutels uniek; zero verweesde relaties; beschermde testgroep behouden | Rijmanifest en voor/na-controles |
| Objectopslag | Alle vier private buckets bestaan; vereiste keys/hash/grootte en app-/ML-rechten kloppen; productie-eigen persistentie | Bucket-/rechteninventaris, volledig objectmanifest en mountcontrole |
| Nieuwe upload | Nieuw origineel en gegenereerde preview kunnen via de echte app worden opgeslagen en teruggelezen | Geauthenticeerde upload, controle beide objecten en geregistreerde testcleanup |
| Referentieherkenning | Alle verwachte actieve referenties werkelijk bruikbaar; herbouw en eventuele herindexering slagen onder de daadwerkelijke ML-rol | Tabel-/indexeigenaar, gekozen onderhoudsroute, herbouwresultaat/logs zonder herindexeringsfout en bekende vectorzoekresultaten |
| Gezondheid | App, ML, MinIO, Redis gezond én database/opslag/model functioneel | Health plus diepere controles |
| Authenticatie | Productie-login/rollen/APIkeys kloppen; ongeautoriseerd verzoek geweigerd | Echte geauthenticeerde gatewaychecks |
| Extern contract | Huidige afnemer kan URL/request/response/status/errors/time-out gebruiken | Vergelijking legacy↔nieuw met representatieve requests |
| Herkenningskwaliteit | Bestaande productievoorbeelden en foto’s behouden; negatieve controles geen foute detectie | Vastgelegde voor/na-APIresultaten op exact dezelfde beelden |
| GHS-gedrag | Vrijgegeven model; twijfel blijft review; geen nieuwe claim alle negen bewezen | Per-type meetoverzicht en reviewkanaalchecks |
| Grenzen/drempels | Bij normale en hoge drempel juiste regular/reviewuitvoer; locatie/codes consistent | APIcontroles met afgesproken drempels |
| Automatische taken | Alleen afgesproken jobs/schedulers starten; geen ACC-opdrachten | Queue-/workerinventaris en eerste gecontroleerde verwerking |
| Herstel | Legacy bereikbaar en route terugkeer getest; nieuwe datasetbackup beschikbaar | Hersteloefening en terugkeerrecord |

ACC-metingen zijn vrijgavebewijs voor de onderzochte ACC-routes, geen bewijs dat productie-authenticatie en de bestaande gateway werken. Die geauthenticeerde gateway is eerder niet live geverifieerd. Het GHS-model is evenmin voldoende onafhankelijk in het veld bewezen voor alle negen typen; die beperking gaat mee naar productie. Behoud review-/twijfelgedrag en vergelijk kwaliteit met de bevroren ACC-versie, zonder een onterechte algemene herkenningsgarantie.

**Go** alleen bij alle vereiste controles geslaagd, nul onbesliste data-/routeconflicten, bewezen herstel en expliciet cutoverakkoord. **No-go** bij een mismatch in model/image/schema, ontbrekende buckets/bestanden, verkeerde opslagrechten, mislukte upload/preview, herindexerings- of eigenaarsrechtenfout, mock voor vereiste herkenning, onvolledige referentieindex, fout authenticatie/contract, actieve ongewenste jobs of ongeteste rollback. Health-groen alleen is onvoldoende.

## 12. Terugkeerplan

Voor publiek verkeer: stop het promotietraject, laat legacy beschikbaar, herstel alleen de exact vastgelegde nieuwe import-/configwijzigingen of vervang de nieuwe voorziening vanuit de bewezen snapshot. Nieuwe testomgeving/data behouden voor onderzoek; productiehistorie niet verwijderen.

Na route-omschakeling: beperk nieuwe verwerking volgens het afgesproken noodplan, schakel de route terug naar de bewaarde legacydienst en verifieer contract/authenticatie. Registreer welke verzoeken en nieuwe rijen in de tussentijd zijn ontstaan; bewaar die voor gerichte vervolgverwerking. Het terugzetten van code draait database/datawijzigingen niet automatisch terug.

Voor de nieuwe toepassing zijn vorige app-/ML-digests en bijbehorende dataset/modelregistratie bekend. Aanvullende tabellen blijven bij een code-terugkeer doorgaans staan; voer geen destructieve down-SQL uit zonder apart bewijs en toestemming. Herstel bestaande kolomwaarden/importconflicten gericht met de vooraf opgenomen voorwaarden. Gebruik een volledige databaseherstelactie alleen na een expliciet besluit over verlies/overname van sinds de backup ontstane gegevens.

Oude container, `model-cache-prod`, databasebackups, objectbackups en manifesten niet opruimen tijdens de eerste release. Uitfaseren vraagt een later besluit na de afgesproken bewaartermijn. Containeracties blijven toestemmingplichtig.

## 13. Uitvoerblad en goedkeuringsrecord

Vul dit vóór uitvoering in; geen credentials in dit blad.

| Veld | In te vullen / huidige waarde |
|---|---|
| Releasecoördinator / DBA / beheerder / QA | … |
| Bronfreeze datum/tijd en eigenaar | … |
| ACC SHA | `814f6cd396f63dada95411d51dda5dfae3205a6a` |
| Definitieve release-SHA | … |
| App-image digest / ML-image digest | … / … |
| MinIO-digest / Redis-image digest | … / … |
| Compose en migratiepakket SHA256 | … |
| Nieuwe Coolifyresource / server | … / … |
| Productie-DB host/database/schema (geen wachtwoord) | … |
| Database-/runtime-/DDL-rollen | … |
| ML-rol / eigenaar reference_embeddings en indexen / bewezen herindexeringsroute | … |
| Bevestigd verschil productie↔ACC schema/ledger | … |
| Snapshot/backups met hashes en bewaarlocatie | … |
| Proefherstel datum/uitvoerder/duur/resultaat | … |
| Rijmanifest en conflictenbesluit | … |
| Objectmanifest / kopieomvang / vrije ruimte | … |
| Vier private buckets / app- en ML-rechten / upload- en previewcontrole / testcleanup | … |
| Worker-/queue-/schedulerbeheersing | … |
| Productieconfiguratiesleutels gecontroleerd | … |
| Tijdelijke verificatieroute | … |
| Publieksroute / afnemers / contractcheck | … |
| Onderhoudsvenster / bereikbaarheid tijdens cutover | … |
| Terugkeerroute / oude image / eigenaar | … |
| Terugkeerdrempels fouten/latentie/kwaliteit | … |
| Nieuwe data tijdens cutover en terugkeerbeleid | … |
| Expliciet akkoord DBwijziging en dataselectie | … |
| Expliciet akkoord containerstart/deploy en routecutover | … |
| Go/no-go QA en tijd | … |
| Uitgevoerd resultaat / niet-uitgevoerde acties | … |
| Controle 15min / 1uur / 24uur | … |
| Cleanup / bewaartermijn / afzonderlijk uitfaseerbesluit | … |

Bewaar per fase tijdstip, verantwoordelijke, gebruikte versie, controle-uitvoer en stop-/herstelbesluit. Als nog productie-DBinformatie wordt toegevoegd, markeer die als nieuwe live waarneming met tijdstip en pas voorwaarden expliciet aan.

## 14. Technische bronverwijzingen

Repositorybronnen: `docker-compose.acc.yml`, `docker-compose.prod.yml`, root `Dockerfile`, `apps/ml-service/Dockerfile`, `.github/workflows/build-push.yml`, `apps/api/prisma/schema.prisma` en alle `apps/api/prisma/migrations/0001…0021/migration.sql`. Startupgedrag: `apps/ml-service/app/main.py`, `services/similarity.py`, `services/database.py`, `services/storage.py`, `apps/api/src/main.ts`. Datacontracten: `apps/api/src/services/storage.ts`, `services/flywheel/pause.ts` en de handmatige seed-/indexscripts onder `apps/api/src/scripts/`.

Officiële toelichting: [Prisma migratiecommando’s](https://docs.prisma.io/docs/cli/migrate) en [migraties vanuit een gecontroleerde omgeving uitrollen](https://docs.prisma.io/docs/orm/prisma-client/deployment/deploy-migrations-from-a-local-environment). Deze documentatie verklaart de tooling; de lokale/live inventaris en expliciete projecttoestemming bepalen wat hier daadwerkelijk mag worden uitgevoerd.

Volgende stap: registreer de komende één-uurs- en 24-uurscontroles op basis van echte waarnemingen; de 15-minutencontrole is geslaagd en rond uitsluitend nog onbewezen controles af. Houd legacydienst en herstelmateriaal beschikbaar. Uitfasering volgt pas na de bewaartermijn en een afzonderlijk gedocumenteerd besluit.
