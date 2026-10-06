# Productievoorbereiding logoRecognition — 5 oktober 2026

Status op 6 oktober 2026: **productievoorziening en publieksomschakeling uitgevoerd; geplande controles en beperkingen expliciet open**. Eigenaar: Codex/root. Hoofdtaak: `01a0fc7a-28d6-7333-ae26-c6dc972076d8`. Expliciete productieopdracht: “Ga verder totdat alles klaarvis in productie”. Zie het [actuele draaiboek](acc-naar-productie-draaiboek-20261005.md).

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


## Historische voorbereidingsnotities — 5 oktober 2026

De onderstaande oorspronkelijke plannen, broninventaris en lokale proeven zijn behouden als geschiedenis. Hun formuleringen “nog niet uitgevoerd” beschrijven de situatie vóór de huidige uitvoering; zij overschrijven de actuele registratie hierboven niet.

## Gekozen inrichting

Maak één **nieuwe** Coolify Docker Compose-applicatie op Banana, los van de bestaande `Logo detection` (`kc4w4400wgwcg8sc4cwgw8s8`, andere repository). Gebruik de nieuwe productiecompose uit deze werkmap. PostgreSQL, Redis en MinIO krijgen een eigen privé-netwerk zonder gepubliceerde hostpoorten; alleen de app mag aan het bestaande Coolify-proxynetwerk worden gekoppeld. De ML-dienst wordt niet publiek toegankelijk. De oude productiedienst blijft bereikbaar.

Dedicated PostgreSQL16 met pgvector0.6 draait in deze nieuwe voorziening met een eigen persistent databasevolume. Daarmee hangt de nieuwe applicatie niet af van een veronderstelde PostgreSQL-server op de bestaande MySQL/Mongo-host. Alleen PostgreSQL-data op lokale duurzame schijf; objectbestanden via `MINIO_DATA_PATH` in een eigen subdirectory van de bevestigde productie-Storage Box-mount. Maak en controleer deze directory expliciet vóór start; een ontbrekende mount mag niet als gewone lokale directory worden gebruikt. Een permanent volume is geen backup: externe logische backups en bewezen herstel blijven verplicht.

De huidige Banana-controle bevestigt `coolify` als bridgenetwerk en een gemounte Storage Box met circa 268 GiB vrije ruimte. Geheugen beschikbaar op het meetmoment: circa 14,5 GiB. Dit is een momentopname, geen capaciteitsgarantie: meet CPU, geheugen en schijf opnieuw vóór uitvoering en onder proefbelasting.

## Bevroren bronversie en modellen

Bron: ACC-merge `814f6cd396f63dada95411d51dda5dfae3205a6a`. Beide containerrevisies en digests read-only geverifieerd op Vanilla op 5 oktober 2026. Images worden op inhoudsdigest gebruikt, niet op een veranderlijke `acc` of `main`-tag.

| Onderdeel | Exacte bron |
|---|---|
| App | `ghcr.io/xxtract-development/logo-recognition-app@sha256:dba4876ad8cc213da91bd08f52ce5751ec4b7b5c5d629b139981101ed6d87f2f` |
| ML | `ghcr.io/xxtract-development/logo-recognition-ml@sha256:bfd7f50e2b10e6dc4286d0ce0e0333f680bb78971f9fa348764691c462a82a2e` |
| MinIO | `minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e` |
| Redis | `redis@sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99` |
| PostgreSQL/vector voor Banana AMD64 | `pgvector/pgvector@sha256:d88687938e7336e1ecd1d8c2f29a750e6ab033e511b04a57a1f2d6d2219a0435` — platformmanifest uit `0.6.0-pg16` |
| Dezelfde PostgreSQL/vector voor lokale ARM64-proef | `pgvector/pgvector@sha256:b81748da2ec31adb8af4b22e471a78087ee89cce2612bc5aecc9450302652cce` |
| GHS-specialist in ML-image | `ghs-glyph-v1-58a1db6819e8`; bestand-SHA256 `68b9ce1488150d32722bb116790fcd065a89d53525fa43dfd48c3148f63d8974` |
| EfficientNet-gewichten uit werkende ACC-cache | `efficientnet_b0_rwightman-7f5810bc.pth`; 21.444.401 bytes; SHA256 `7f5810bc96def8f7552d5b7e68d53c4786f81167d28291b21c0d90e1fca14934` |

De aanvullende EfficientNet-gewichten zijn met identieke hash lokaal veiliggesteld **buiten de Git-repository**, op `/Users/frisovanweelden/.codex/production-release-cache/logoRecognition/20261005/efficientnet_b0_rwightman-7f5810bc.pth`. Ze moeten vóór de eerste ML-start in de eigen cache worden geplaatst onder `/app/models/torch/hub/checkpoints/`. Controleer rechten van de non-root gebruiker `mlservice`, geef alleen de cache de juiste eigenaar en bewijs lezen/laden zonder nieuwe download. Kopieer een cache via een expliciete provisioningstap; maak ML niet root om een rechtenprobleem te omzeilen.

De ACC-inventaris onder `/app/models` vond deze `.pth` en geen andere `.pt`/`.onnx`-bestanden in die directory. Dat zegt niets over modellen in objectopslag. De generieke EfficientDet-route kan bij ontbreken van ONNX naar een mock terugvallen; claim daarom niet dat iedere route is bewezen. Controleer de daadwerkelijk gebruikte endpoint-routes en hun modelklassen/resultaten.

**Nutri-Score A2 heeft een aparte opslagroute:** controleer en promoveer model én metadata uit `training-images` met keys `models/nutriscore-a2/v1/a2_mobilenetv3s.pt` en `models/nutriscore-a2/v1/a2_meta.json`, of de daadwerkelijk ingestelde overrides. Alleen de bucket `models` kopiëren neemt dit model niet mee. Leg beide hashes, klassen en configuratie vast vóór vrijgave. Het GHS-model gaat wel mee in de ML-image.

Een begrensde read-only MinIO-inventaris vond de buckets `models`, `recognition-images` en `thumbnails` leeg. De inventaris van `training-images` werd niet voltooid. Er is dus **geen volledige dataset-/objectfreeze** en geen bewezen totale kopieomvang. De genoemde referenties, trainingsdata en bestanden mogen niet als reeds overgedragen worden afgevinkt.

## Getrapte uitvoering na afzonderlijk akkoord

1. Vul het nieuwe productie-envcontract met eigen waarden en geheimen via een beveiligde opslag. Het voorbeeldbestand bevat geen echte sleutels. Valideer lokaal met de configuratiecontrole en `docker compose config --quiet` in dezelfde omgeving; conflicterende shellwaarden moeten worden verwijderd en profielen/projectselectie mogen niet impliciet actief zijn; normale `config` kan geheimen afdrukken en hoort niet in publieke logs.
2. Laat uitsluitend infrastructuur draaien: eigen PostgreSQL, MinIO en Redis. De app en ML zitten in het expliciete runtimeprofiel; zij starten niet door de standaardselectie. Maak runtime niet per ongeluk actief via een Coolify-instelling of `COMPOSE_PROFILES`.
3. Maak beperkte database-identiteiten en rechten klaar, inclusief de hardcoded `logorecognition`-grants uit migraties 0007/0008. Gebruik aparte migratie-eigenaar en waar nodig eigenaarschap voor de ML-herindexering; geen admin/superusercredentials in app of ML. Voer alleen het goedgekeurde migratieplan uit met de bij deze release behorende Prisma5-tooling.
4. Maak expliciet alle vier private buckets aan met de provisioning-helper: `models`, `training-images`, `recognition-images`, `thumbnails`. Gebruik daarvoor beheercredentials in de afzonderlijke initializer, niet de app-runtime. Richt daarna de beperkte app/ML-accounts en bucket/objectrechten in, inclusief de vereiste bucketchecks/listrechten. De helper vervangt deze accountprovisioning niet.
5. Plaats de gecontroleerde modelcache met passende non-root rechten. Kopieer de geselecteerde objecten inclusief referentielogo’s, crops en eventuele A2-modelbestanden. Vergelijk het volledige bron-/doelmanifest op SHA256. Importeer pas daarna de geselecteerde rijen in relatievolgorde.
6. Bewijs backup en herstel van de gevulde nieuwe database/opslag op een apart doel. Laat de oude dienst en cache intact. Leg afspraken over nieuwe gegevens tijdens eventuele terugkeer vast.
7. Start pas nu het runtimeprofiel, eerst onder een tijdelijke verificatieroute. Controleer image-revisies/digests, modelhashes, referentieherbouw, echte indexzoekresultaten onder de ML-rol, toegang en een echte upload inclusief preview. Houd automatische taken gecontroleerd.
8. Bewijs de huidige `/detect`-aanroep van bestaande afnemers tegen de nieuwe app, inclusief authenticatie, request/response, foutcodes en time-outs. Bij incompatibiliteit eerst een adapter of afgesproken aanpassing implementeren/testen. Pas na alle checks en expliciet omschakelbesluit de publieksroute aanpassen.

**Coolify-profielgedrag is een uitvoervoorwaarde:** controleer de werkelijk gerenderde configuratie en de service-selectie in de beoogde Coolify-versie. Indien Coolify alle services ondanks profielen start, gebruik vooraf gescheiden infrastructuur- en runtimevoorzieningen of een beoordeelde equivalente getrapte route. Klik geen volledige deploy vóór de referentiedataset en modelcache gereed zijn.

## Bestanden en controles

- `docker-compose.prod.yml`: geïsoleerde productievoorziening en expliciete runtimeprofielen.
- `scripts/deployment/production/production.env.example`: verplichte doelwaarden en gescheiden credentials.
- `scripts/deployment/production/check-production-config.py`: controle zonder containerstart of secretuitvoer.
- `scripts/deployment/production/initialize-buckets.py`: vier private buckets, herhaalbaar en zonder verwijderen.
- `scripts/deployment/production/test-production-config.py`: configuratie-/profiel-/bucketcontroles zonder productieverbinding.

De standaardcompose doet geen automatische Prisma-migraties, ACC-import of publieke omschakeling. De huidige main-workflow wordt niet aangepast om productie automatisch te deployen; de eerste productie-uitrol is een expliciet goedgekeurde getrapte handeling met het bevroren imagepaar.

## Voorlopige begrenzing op de gedeelde host

De configuratie krijgt begrensde logs en geheugenplafonds: ML 8 GiB, app 2 GiB, PostgreSQL 2 GiB, MinIO 1 GiB en Redis 512 MiB; de initializer maximaal 1 GiB en loopt vóór runtime. Dit zijn voorlopige plafonds, geen bewezen gelijktijdige productiecapaciteit. Proefbelasting moet voldoende ruimte voor de oude dienst en host aantonen; voorkom gelijktijdig zware provisioning en runtime.

## Nog vereiste uitvoerbewijzen

- Nieuwe productie-Coolify-ID en tijdelijke route; DNS/TLS en echt Coolify-profielgedrag.
- Beperkte runtime-/opslagidentiteiten, echte auth-MySQL-verbinding en productiecatalogus/media-keys.
- Volledige consistente exportselectie en alle objecthashes, waaronder A2 indien in gebruik.
- Geslaagde gevulde datasetherstelproef en volledige endpointvergelijking; geen mock voor vereiste routes.
- Expliciet akkoord op productieaanmaak, migraties, containerstart en latere omschakeling.

Dit voorbereidingspakket vervangt die bewijzen niet. De voortgang wordt alleen als geslaagd geregistreerd waar een uitgevoerde controle dat ondersteunt.

## Uitgevoerde lokale herstelproef

Op 5 oktober zijn alle 21 SQL-migraties toegepast op een nieuwe, afgeschermde lokale PostgreSQL16-database met pgvector0.6. Er ontstonden 34 applicatietabellen. De vijf extensies zijn vastgelegd in het [proefresultaat](production-preparation-local-rehearsal-20261005.json). Een logische export is hersteld in een tweede lege lokale database: opnieuw 34 applicatietabellen. De tijdelijke container en zijn testvolume zijn daarna verwijderd.

Dit bewijst de lege schema-opbouw en het lokale schemaherstel. Het bewijst geen herstel van de gevulde ACC-dataset, objectbestanden, toegangsrechten, Prisma-migratiehistorie of live herkenningskwaliteit. De volledige gegevens- en bestandenproef blijft vereist vóór productie.

Het [bronmodelmanifest](production-release-manifest-20261005.json) vermeldt expliciet welke bronhashes gemeten zijn, welke cache lokaal is veiliggesteld en welke object-/doelbewijzen nog ontbreken. Het is geen verklaring dat modellen al naar productie zijn gekopieerd.

## Eindcontrole van het voorbereidingspakket

29 configuratie-/opslagtests en 11 controles van de automatische testflow zijn geslaagd. De uiteindelijke Compose-configuratie is gevalideerd met een tijdelijk fictief bestand dat daarna is verwijderd. De standaardselectie bevat alleen PostgreSQL, Redis en MinIO; het runtimeprofiel voegt app/ML toe en provisioning alleen de bucketinitializer. Alle oorspronkelijke bevindingen uit drie onafhankelijke reviews zijn verwerkt; ook de succesentrypointtest bewijst nu het daadwerkelijk aanmaken en controleren van vier buckets.

Er is geen productievoorziening gemaakt, geen productiedatabase beschreven, geen productiecontainer gestart en geen publieksroute aangepast. Het lokale testvolume is verwijderd; de gecontroleerde modelcache en deze werkmap zijn bewust behouden. De bestaande interactieve HTML-checklist is niet overschreven of als migratievoltooid afgevinkt.

Actuele eerstvolgende stap: voer de komende één-uurs- en 24-uurscontroles uit en registreer de waarnemingen; de 15-minutencontrole is geslaagd; houd resterende onbewezen controles en de beperking rond bestaande-gebruikerswachtwoordlogin zichtbaar. Legacydienst, cache, backups en sleutels blijven behouden; uitfasering is niet uitgevoerd.
