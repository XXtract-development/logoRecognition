# Dagelijkse back-up van de eigen productieomgeving

De helper `scripts/deployment/production/backup-owned-production.py` maakt een nieuwe, versleutelde back-up van uitsluitend `logo-production-20261005`. Hij leest de database en opslag, schrijft alleen nieuwe back-upbestanden en voert geen containerstart, herstart, restore, gegevenswijziging of verwijdering uit. Deze code installeert zelf geen planning.

## Inhoud en bewijs

- Volledige PostgreSQL-database in custom-formaat, inclusief eigenaarschap en rechten; afzonderlijke privé `roles.sql` bewaart de rollen van deze eigen PostgreSQL-instance. Dit bestand bevat gevoelige wachtwoordverifiers.
- Alle openbare database-tabellen, hun aantallen en directe `storage_path`, `crop_path`, `thumbnail_path`-verwijzingen uit precies hetzelfde geëxporteerde, alleen-lezen databasebeeld. Bekende verwijzingen in JSON (`storagePath`, `cropPath`, `thumbnailPath`, `imagePath`, snake-casevarianten en `page_key`) worden ook gecontroleerd.
- Volledige actuele inhoud van alle vier privé buckets: `training-images`, `recognition-images`, `thumbnails`, `models`. Nieuwe uploads worden via actuele lijsten opgehaald; het oude migratiemanifest is geen invoer.
- Voor elk bestand: oorspronkelijke bucket/sleutel, grootte, ETag en SHA-256. Alle objecten worden in `objects.tar` opgeslagen en daarna volledig op hash nagelezen. Alle verwijzingen uit het databasebeeld moeten daarin aanwezig zijn.
- `database-toc.txt` bewijst dat elke tabel uit het databasebeeld in het databasearchief staat. De private `receipt.json`, volledige objectmanifesten en alle bronbestanden blijven uitsluitend in lokale afgeschermde staging.
- Het hele pakket wordt met AES-256-GCM in blokken van 1 MiB versleuteld. De externe opslag ontvangt uitsluitend `payload.aes256gcm` en een geschoonde receipt met formaat, resource, tijd, aantallen, hashes, nonce en authenticatietag. Deze metadata is via GCM mee-geauthenticeerd.
- Vóór de atomische vrijgave leest de helper de externe ciphertext terug, ontsleutelt en authenticeert die in lokale private staging en vergelijkt alle pakketbestanden op grootte en SHA-256. Hetzelfde geldt bij later herstel: geen ontsleutelde inhoud gebruiken vóór een geslaagde GCM-authenticatie.

De database gebruikt een echt PostgreSQL-snapshot dat ook `pg_dump` gebruikt. Database en S3 hebben geen gezamenlijke transactie. Daarom moeten de volledige opslaginventaris vóór en na de kopie gelijk zijn en worden objecten met `If-Match` opgehaald. Wijzigingen of ontbrekende verwijzingen laten de poging veilig mislukken; probeer een nieuwe poging zodra uploads/verwijderingen rustig zijn. Dit bewijst een gecontroleerde stabiele opslaginventaris, geen onbeperkte gezamenlijke transactie over beide systemen.

Een geslaagde dagelijkse kopie is **geen nieuwe restoreproef**: de receipt vermeldt `restore_tested: false`. Herhaal de afzonderlijke geïsoleerde restoreproef periodiek en na schemawijzigingen. Modellen die buiten MinIO op afzonderlijke ML-mounts staan, applicatie-images, externe authenticatiedatabase en private omgevingbestanden vallen niet onder deze helper; behoud hun bestaande afzonderlijke vrijgave/back-upbewijzen.

## Randvoorwaarden

De helper draait op de productiehost zelf, met Python 3, Docker en `cryptography` (getest met de op de host beschikbare versie 41.0.7). Elke Docker-opdracht gebruikt expliciet de lokale Unix-socket. De externe `/mnt/storagebox-home` moet daadwerkelijk gemount zijn en het pad mag nergens via symlinks omleiden. De PostgreSQL-volume-identiteit, database/gebruiker, exacte PostgreSQL-imagedigest, MinIO-rootidentiteit, privé poorten en de precieze MinIO-bind op de StorageBox worden vooraf gecontroleerd. De vier buckets worden alleen via het bestaande beperkte opslagaccount gelezen.

Het bestaande productie-omgevingbestand blijft buiten Git en heeft uitsluitend eigenaarstoegang, bijvoorbeeld `0600`. Geheimen komen niet in argumenten, logs of openbare documentatie. De huidige CIFS-mount rapporteert synthetisch 0755 met `nounix`: chmod/umask maakt plaintext daar niet afgeschermd. Daarom wordt nooit plaintext naar deze mount geschreven. Lokale staging moet daadwerkelijk eigenaarsrechten 0700 hebben en ieder plaintextbestand 0600; de helper controleert de echte stat-resultaten en weigert symlinks en staging op de externe mount. De beheerder schermt daarnaast de StorageBox-accounttoegang af.

Gebruik een nieuw willekeurig sleutelbestand van exact 32 ruwe bytes, uitsluitend lokaal in een daadwerkelijk private directory (0700), met werkelijke bestandsrechten 0600 en de eigenaar van het uitvoerende proces. Geef alleen het bestandspad via `--key`; nooit de sleutelinhoud via argumenten, omgeving of logs. De helper genereert, publiceert en overschrijft de sleutel niet. Bewaar en verifieer vóór ingebruikname een onafhankelijke private kopie op de Mac. Verlies van deze sleutel maakt de externe back-up onbruikbaar; bewaar haar ook bij latere sleutelrotatie voor oude capsules.

Begrenzingen: 128 MiB per object, 100.000 objecten, 4 MiB per pagina inventaris, 32 MiB database-metadata per antwoord, 15 seconden per netwerkoperatie en één uur totale werkdeadline (de actieve netwerkoperatie kan maximaal zijn eigen timeout uitlopen). De lokale plaintextpakketgrens is 512 MiB; voor een run wordt minstens 1,5 GiB vrije lokale stagingruimte vereist. Subprocesuitvoer is eveneens op 512 MiB begrensd. Een overschrijding mislukt expliciet, zonder een kleinere inventaris als volledig te presenteren. Bij groei eerst de grens en capaciteit opnieuw beoordelen.

## Installatie door de coördinator

Voer eerst één echte back-up uit en controleer de private receipt en de daadwerkelijke locatie op de StorageBox. Gebruik de actuele eigen containernamen/IDs, die vóór iedere dagelijkse uitvoering opnieuw moeten worden bepaald als Coolify ze heeft vervangen. De helper controleert deze vervolgens opnieuw; de namen alleen gelden niet als identiteit.

```sh
python3 /pad/naar/backup-owned-production.py \
  --env /privaat/pad/production.env \
  --postgres-container ACTUELE_EIGEN_POSTGRES_CONTAINER \
  --minio-container ACTUELE_EIGEN_MINIO_CONTAINER \
  --key /privaat/pad/backup.key \
  --staging /root/logo-production-20261005/private-backup-staging \
  --execute
```

Plan daarna één dagelijkse uitvoering via een beheerde systemd-timer, bijvoorbeeld 02:15 UTC, met een lokale flock tegen overlap en zichtbare foutstatus bij een mislukking. Gebruik dezelfde vaste helper/privé configuratie en bewaak een niet-nul exitcode; een stille fout in cron telt niet als operationeel gereed. Voorkom overlappende uitvoeringen in de planning, bijvoorbeeld met een lokale `flock`. De coördinator legt het exacte geplaatste commando, tijdzone, eerste echte resultaat en meldingspad apart vast. Het vastleggen van deze documentatie installeert die planning niet.

Elke run verwerkt plaintext uitsluitend in een nieuwe private lokale submap. Op de StorageBox verschijnt eerst `/mnt/storagebox-home/prod/logo-production-20261005/backups/.incomplete-TIJD-UNIEK` met alleen ciphertext. Pas na authenticatie en alle hashcontroles krijgt die map atomisch de naam `TIJD-UNIEK` en de geschoonde geslaagde receipt. Bestaande geslaagde back-ups worden nooit vervangen of verwijderd. Een mislukte of afgebroken poging heeft extern hoogstens onbruikbare ciphertext; de private lokale bronbestanden en een eventuele lokale `failed.json` blijven voor onderzoek behouden en tellen niet als geldige externe back-up.

Pas nadat de externe capsule volledig geauthenticeerd, op alle bestanden gecontroleerd en atomisch gepubliceerd is, verwijdert de helper uitsluitend de nieuwe private lokale runmap die hij zelf heeft aangemaakt. De oorspronkelijke directory-identiteit en het private stagingpad worden vóór verwijderen opnieuw gecontroleerd. Bestaande runmappen, sleutelbestanden, bronobjecten en externe back-ups blijven behouden. De openbare receipt en samenvatting vermelden `private_stage_removed: true` uitsluitend nadat de werkelijke verwijdering geslaagd is. Een opruimfout levert een niet-nul exitcode en geen volledig geslaagde samenvatting; de reeds geldige capsule blijft behouden.

Mislukte private runmappen blijven voor onderzoek staan. Monitor lokale en externe vrije ruimte; de helper stopt veilig wanneer de lokale reserveruimte ontbreekt. Er is geen automatische verwijdering van externe back-ups of mislukte stages. De coördinator behandelt opruiming van mislukte/eerdere runs afzonderlijk. Dit document migreert of verwijdert geen eerdere back-ups.

## Daadwerkelijke planning en nacontrole

De coördinator heeft de eerste versleutelde back-up én een echte uitvoering via systemd als geslaagd gecontroleerd. De geplaatste namen zijn `logo-production-20261005-backup.service` en `logo-production-20261005-backup.timer`, dagelijks om 02:15 UTC. De onafhankelijke private Mac-sleutelkopie is geverifieerd. Deze oplevering verandert of start die units niet opnieuw.

De aanvullende `observe-owned-production.py` controleert uitsluitend lezend: de nieuwe publieke `/health`-respons met een verse tijd, precies de vijf vastgelegde containers en hun images, gezondheid/herstarts/geheugentekorten, 542 actieve volledige herkenningsvectoren, een recente geslaagde systemd-back-up plus actieve timer, en de laatste externe versleutelde back-up met passende aantallen en opnieuw berekende ciphertext-hash. De observer leest geen encryptiesleutel en doet geen nieuwe ontsleuteling; zijn bewijs is de opgeslagen geauthenticeerde terugleesreceipt plus de actuele ciphertext-hash. Hij schrijft alleen geschoonde JSON-resultaten in de private release-map, en geeft bij een afwijking een niet-nul exitcode.

De observer verlangt een door de coördinator aangemaakt privé `observation-targets.json` (0600 in een werkelijk private 0700 directory). Voorbeeldschema — de werkelijke container- en image-identiteiten worden niet in Git vastgelegd:

```json
{
  "resource": "logo-production-20261005",
  "services": {
    "app": {"container": "ACTUELE_CONTAINER", "image": "sha256:64_HEX_TEKENS", "restart_count": 0},
    "ml-service": {"container": "ACTUELE_CONTAINER", "image": "sha256:64_HEX_TEKENS", "restart_count": 0},
    "postgres": {"container": "ACTUELE_CONTAINER", "image": "sha256:64_HEX_TEKENS", "restart_count": 0},
    "redis": {"container": "ACTUELE_CONTAINER", "image": "sha256:64_HEX_TEKENS", "restart_count": 0},
    "minio": {"container": "ACTUELE_CONTAINER", "image": "sha256:64_HEX_TEKENS", "restart_count": 0}
  }
}
```

Voer vóór het inplannen één echte nacontrole uit. De voorbeeldservice `observe-owned-production.service.example` start zelf niets; de coördinator plaatst deze onder een eigen duidelijke unitnaam en levert het bestaande publieke HTTPS-healthadres via de private `observation.env` (`OBSERVATION_HEALTH_URL`). Maak vervolgens twee afzonderlijke eenmalige timers op het **feitelijk vastgelegde omschakelmoment plus één uur en plus 24 uur**, met `Persistent=true` en absolute UTC `OnCalendar`-tijden. Beide kunnen dezelfde observer-service aanroepen. Bewaar de geplaatste tijden, oorspronkelijke baseline en de echte resultaten. Een actieve timer bewijst alleen de planning; de 1-uurs- en 24-uursstappen blijven open totdat hun werkelijke nacontrole is geslaagd. Als een timer door reboot later afgaat, registreer de echte tijd en doe geen alsof de oorspronkelijke wachttijd exact is geobserveerd.

Een bewust nieuwe training of nieuwe release verandert de vaste baseline (542 en container/image-identiteiten). Pas die uitsluitend na de bijbehorende geverifieerde vrijgave aan; een observerafwijking mag dit niet stilzwijgend automatisch accepteren.
