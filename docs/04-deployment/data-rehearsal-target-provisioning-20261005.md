# Uitvoerbare inrichting van de nieuwe productiedatabase en opslag

Dit pakket voert niets vanzelf uit. De coördinator start alleen de goedgekeurde nieuwe infrastructuur. Het bestaande productieprogramma en zijn opslag blijven apart. De onderstaande helpers mogen uitsluitend op de nieuwe, lege inrichting worden uitgevoerd.

## Voorbereide privébestanden

`transfer-target-plan.py` is lokaal uitgevoerd met de privé `production.env` en het bewezen overdrachtspakket. Het resultaat staat buiten Git onder `~/.codex/production-release-cache/logoRecognition/20261005/target-provisioning/`: `runtime-roles.sql`, `runtime-storage-policy.json` en `target-plan.json`. Alle bestanden hebben beperkte toegang. De SQL bevat wachtwoorden en mag niet worden afgedrukt, gecommit of in een opdrachtregel worden geplakt.

De echte `database.dump` is de oorspronkelijke geslaagde volledige schema-export met uitsluitend geselecteerde openbare tabelgegevens. De 21 oorspronkelijke migratieregistraties zijn echt, voltooid en gelijk aan de gekozen releasebestanden. Dit is geen nieuw uitgevoerde public-only export. De doelhelper controleert het archief op onverwachte aanvullende schemas, maakt de vier bekende uitbreidingen beschikbaar en slaat alleen de overbodige aanmaak van het reeds bestaande public-schema over. Alle overige herstelfouten blijven fataal.

## Nieuwe PostgreSQL-doelcontainer

Kopieer scripts en het privé overdrachtspakket naar een afgeschermde map op Banana. Gebruik onderstaande opdracht nadat de coördinator de exacte nieuwe PostgreSQL-container heeft gekozen. De shellvariabelen benoemen alleen paden, het nieuwe resourcenaam en de gekozen container; geen wachtwoorden.

```sh
python3 "$logo_release_root/scripts/deployment/production/transfer-target-database.py" \
  --env "$logo_release_root/production.env" \
  --package "$logo_release_root/transfer-package" \
  --container "$logo_new_pg_container" \
  --expected-resource "$logo_resource" \
  --execute
```

De helper controleert vóór herstel de database-identiteit, administrator, onveranderlijke PostgreSQL-image, eigen volume `<resource>-postgres-data`, ontbreken van gepubliceerde poorten, ontbrekende toepassingstabellen en afwezigheid van bestaande runtime-rollen. Het archief en alle bestanden moeten nog horen bij de actuele geslaagde proef. Een bestaande gevulde database wordt geweigerd.

Na herstel vergelijkt de helper elke geselecteerde tabel exact met de bron, controleert de lege uitgesloten tabellen en de relaties, maakt afzonderlijke beperkte rollen en geeft uitsluitend de ML-rol eigendom over `reference_embeddings`. De app krijgt gebruikelijke gegevensrechten, maar geen rechten op de migratiehistorie; ML krijgt alleen leesrechten op de benodigde herkenningstabellen en schrijfrechten op modelversies, vergelijkingsgegevens en referenties. Beide rollen hebben geen administratorrechten of recht om databases/rollen te maken. Een echte herindexering wordt als ML-rol uitgevoerd. De blijvende pauze en verouderde nulmeting worden opgeslagen in de JSON-vorm die de toepassing daadwerkelijk leest.

Succes wordt vastgelegd in `transfer-package/target-database-verification.json`. Bij een fout blijft de actuele status rood. Een gedeeltelijk herstelde database mag niet blind opnieuw worden verwerkt; de coördinator onderzoekt eerst de fout.

## Nieuwe MinIO-doelcontainer

Controleer vóór het starten van de helper met de containergegevens dat de gekozen MinIO-container bij de nieuwe resource hoort, uitsluitend de nieuwe `MINIO_DATA_PATH` gebruikt, geen hostpoorten publiceert en het netwerk een alias `minio` uitsluitend voor deze container heeft. Kies het exacte privénetwerk van deze nieuwe resource; gebruik geen bestaand ACC- of legacyproductienetwerk.

De coördinator voert daarna de volgende eenmalige helper uit met de gekozen ML-image. Het aangepaste startpunt laadt geen toepassing en start geen herkenningsdienst:

```sh
docker run --rm --name "$logo_resource-storage-provisioning" \
  --network "$logo_new_private_network" --user 0 --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m --cpus 1 --memory 1g \
  --entrypoint python \
  -v "$logo_release_root/scripts/deployment/production:/provisioning:ro" \
  -v "$logo_release_root/production.env:/release/production.env:ro" \
  -v "$logo_release_root/transfer-package:/release/transfer-package:rw" \
  "$logo_ml_image" /provisioning/transfer-target-storage.py \
  --env /release/production.env --package /release/transfer-package \
  --expected-resource "$logo_resource" --execute
```

De helper gebruikt uitsluitend `minio:9000` in het expliciet gekozen netwerk. Een extra bucket of onverwacht bestaand bestand wordt geweigerd. De vier buckets blijven zonder anonieme toegang. De nonroot runtime-gebruiker krijgt alleen toegang tot hun bestanden en het benodigde bucketoverzicht, zonder beheerdersrechten. Een echte, uitsluitend lezende beheeraanroep met dit account moet worden geweigerd. Er worden geen testbeleidwijzigingen gebruikt.

Alle 1.069 bestanden worden onder hun oorspronkelijke naam met het nonroot account geplaatst en teruggelezen. Bestaande bestanden worden nooit overschreven: zij moeten direct dezelfde inhoud hebben. Alle teruggelezen bestanden moeten exact dezelfde omvang en SHA256 hebben. Het volledige bewijs staat in `transfer-package/target-storage-verification.json`.

De MinIO-administratiefuncties en hun signaturen zijn gecontroleerd op de daadwerkelijk geïnstalleerde SDK 7.2.3; `user_list` is de juiste methodenaam en een geweigerde beheeraanroep gebruikt HTTP-status 403. Zie ook de [officiële MinIO SDK-bron](https://github.com/minio/minio-py/blob/master/minio/minioadmin.py).

## Nog vóór de herkenningsdienst

Controleer beide nieuwe doelbewijzen, maak en herstel een nieuwe back-up van de gevulde productiedoeldatabase en opslag, plaats de gecontroleerde EfficientNet-cache met het juiste niet-beheerderseigendom en start vervolgens pas ML. De herbouw van vergelijkingsgegevens, GHS/NutriScore-voorbeeldmetingen, nieuwe upload met miniatuur en de echte geauthenticeerde herkenningsaanroepen blijven afzonderlijke controles vóór het omschakelen van de oude publieke route.


## Verwerkte onafhankelijke controle van de doelhelpers

De actuele ML-databasemethoden zijn gecontroleerd, inclusief de geïnstalleerde ACC-startcode. Zij hebben geen aanvullende schema-aanmaak tijdens opstart nodig. De rechten dekken nu ook trainingsbatches, het bijwerken van logodefinities, het vastleggen van gecontroleerde declaraties en het lezen van bestaande beoordelingsitems. Schrijfrechten zijn per tabel beperkt tot de daadwerkelijk gebruikte handelingen. ML bezit uitsluitend de tabel met vergelijkingsgegevens om herindexeren mogelijk te maken.

De databasehelper verbindt daadwerkelijk met de ML-gebruikersnaam en het wachtwoord via de lokale TCP-verbinding; het wachtwoord gaat uitsluitend via standaardinvoer. Hij leest echte referenties en voert logodefinitie- en declaratieschrijfacties plus herindexeren uit binnen een transactie die volledig wordt teruggedraaid. Trainingsbatchrechten worden gecontroleerd met een echte SQL-opdracht zonder rijen, zodat geen fictieve gebruiker hoeft te worden aangemaakt. Aantallen na terugdraaien moeten onveranderd zijn.

De opslaghelper weigert een vooraf bestaande runtime-policy, iedere bestaande aanvullende gebruiker en iedere bestaande groep vóórdat hij beheerwijzigingen uitvoert. Daarna controleert hij de exacte directe policybinding, ontbrekende groepsbindingen en de volledige inhoud van de beperkte policy, zowel vóór als na de bestandsoverdracht. Een enkele geweigerde beheeraanroep is dus aanvullend bewijs, niet de enige controle.

Nieuwe bestanden worden geplaatst met `If-None-Match: *`: de server weigert overschrijven wanneer tussentijds een andere schrijver dezelfde naam vult. Die inhoud wordt daarna teruggelezen en moet dezelfde bestandscontrole hebben. Deze voorwaarde is gecontroleerd tegen de werkelijke MinIO SDK 7.2.3 en de [servercode van de gekozen MinIO-release](https://github.com/minio/minio/blob/07c3a429bfed433e49018cb0f78a52145d4bedeb/cmd/object-handlers.go). Een gedeeltelijke eerdere IAM-inrichting wordt niet blind overschreven of hergebruikt: eerst onderzoek en een afzonderlijke hervatroute.
