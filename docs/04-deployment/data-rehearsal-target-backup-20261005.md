# Controleerbare back-up van de nieuwe productie-inrichting

De helper `transfer-target-backup.py` is tegen de afzonderlijke nieuwe productie-inrichting uitgevoerd. Alle 35 tabellen zijn met identieke inhoud hersteld in een geïsoleerde proefcontainer. Alle 1.069 bestanden zijn gecontroleerd en opgenomen in een opnieuw gelezen archief. De proefcontainer en zijn tijdelijke opslag zijn verwijderd. Negen lokale controles op bewijs, volledigheid, foutstatus en opruimen slagen.

Voer hem pas uit nadat de nieuwe productiedatabase met succes is hersteld en haar beperkte rollen zijn bewezen. De helper vereist dat actuele doelbewijs, de exact gekozen resource, eigen PostgreSQL-volume, bekende image, privépoorten en ongewijzigd bronpakket. Hij wijzigt of herstelt niets in de echte productiedatabase.

```sh
python3 "$logo_release_root/scripts/deployment/production/transfer-target-backup.py" \
  --env "$logo_release_root/production.env" \
  --package "$logo_release_root/transfer-package" \
  --container "$logo_new_pg_container" \
  --expected-resource "$logo_resource" \
  --execute
```

De helper leest alle 34 toepassingstabellen én de echte migratiehistorie. Hij maakt een eigen volledige back-up van de openbare productiedoeltabellen, inclusief de drie bewust aangemaakte productie-instellingen. Elke tabelinhoud wordt vóór en na de back-up gecontroleerd. De helper herstelt vervolgens uitsluitend in zijn eigen tijdelijke container op dezelfde bewezen lokale Docker-verbinding, zonder netwerk of gepubliceerde poorten en met begrensd geheugengebruik. Uitbreidingen en het bestaande public-schema worden op dezelfde gecontroleerde manier behandeld als in de eerdere proef. Alle 35 tabelinhouden moeten exact terugkomen.

Als de opslagoverdracht ook bewezen is, controleert de helper de passende geslaagde opslagstatus en de volledige 1.069 teruggelezen bestandscontroles. Hij maakt een apart bestandsarchief van de lokaal bewaarde identieke bytes en leest dat archief opnieuw terug. Dit is een kopie van het bewezen overdrachtspakket waarvan de bytes gelijk zijn aan het nieuwe doel; het is geen tweede download uit MinIO en geen uitgevoerde herplaatsing in een ander MinIO-systeem. Deze precieze beperking wordt in het bewijs opgenomen.

Bestanden blijven buiten Git met beperkte toegang: `target-backup.dump`, `target-objects-backup.tar` en `target-backup-verification.json` in het privé overdrachtspakket. Een onafhankelijke kopie staat daarnaast op de afzonderlijke beheerderscomputer; beide archiefcontrolesommen zijn na de overdracht opnieuw gelijk bevonden. De bronserver en de beheerderscomputer bewaren dus dezelfde gecontroleerde archieven.

De databaseproef kan vóór de opslagoverdracht worden uitgevoerd. Dan heet de eindstatus `passed_database_only`, met expliciet nog open opslagcontrole. Voor het starten van de volledige toepassing moet de coördinator een actuele eindstatus `passed` hebben en de onafhankelijke back-upkopie controleren. Bij iedere fout wordt de actuele foutstatus vastgelegd. Niet bevestigd opruimen van de eigen tijdelijke container en opslag maakt de proef ongeldig en laat de opdracht mislukken. Geheimen worden niet weergegeven.
