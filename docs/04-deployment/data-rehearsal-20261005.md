# Proef met echte acceptatiegegevens

De overdrachtsproef met de gevulde database is geslaagd. Er is uitsluitend gelezen op acceptatie en lokaal getest; productie is hierbij niet gewijzigd.

De privé overdracht bevat 41 logodefinities, 876 afbeeldingen, 930 trainingsrecords, 604 referenties, 900 beoordelingsrecords en 72 moeilijke negatieve voorbeelden. IDs, uitsneden, brongegevens, validatiestatus, actiefstatus en testindeling zijn behouden. Gebruikers, wachtwoordgegevens, wachtrijen, herkenningshistorie en open promoties zijn niet overgenomen. Alle uitgesloten tabellen zijn leeg in de herstelde database.

Alle 34 toepassingstabellen en hun relaties zijn hersteld uit één database-export. De 21 oorspronkelijke voltooide migratieregistraties zijn onderdeel van dezelfde export; hun bestandscontrolesommen komen exact overeen met de 21 migraties in de gekozen release. Er is geen verzonnen migratiehistorie aangemaakt. Een tweede back-up van de gevulde testdatabase is opnieuw hersteld; alle gekozen tabelinhouden komen exact overeen met de oorspronkelijke export. De tijdelijke testcontainer en zijn tijdelijke opslag zijn verwijderd.

Alle 1.069 benodigde bestanden zijn opgehaald op hun exacte opslagnaam, waaronder beide NutriScore A2-modelbestanden. Er ontbreken geen bestanden. Voor ieder bestand zijn omvang en bestandscontrole gecontroleerd; de bron bleef vóór en na ophalen gelijk. Het pakket beslaat ongeveer 40,5 MB aan bestanden. Het al eerder veiliggestelde EfficientNet-bestand blijft apart bewaard; het GHS-model zit in de gekozen ML-release.

Het overdrachtspakket staat buiten Git in een persoonlijke map met beperkte toegang:
`~/.codex/production-release-cache/logoRecognition/20261005/transfer-package/`.
Het bevat de database-export, herstelde rijgegevens, modelbestanden en beelden, bestandsmanifesten en back-upbewijs. Deze bestanden mogen niet in de publieke repository terechtkomen.

De herhaalbare scripts staan onder `scripts/deployment/production/`:

- `transfer-source.py`: selectieve bronexport en controle van stabiele inhoud en releasegeschiedenis.
- `transfer-rehearsal.py`: herstel en tweede gevulde back-up/herstel op een eigen lokale testdatabase.
- `transfer-objects.py`: uitsluitend lezen van expliciete opslagbestanden; geen brede lijstactie of bronmutatie.
- `test-transfer-package.py`: negentien controles op selectie, paden en uitsluitend lezen van opslag.

De verdere productiecontrole omvat nog het uploaden en teruglezen van alle bestanden, beperkte databaserollen, opnieuw opbouwen van de vergelijkingsgegevens, controle via de echte herkenningsaanroep en een laatste broncontrole vóór omschakeling. De geslaagde proef bewijst overdraagbaarheid; zij bewijst niet dat alle negen gevarensymbolen voldoende onafhankelijk getest zijn.

Zie `data-rehearsal-evidence-20261005.json` voor gecontroleerde aantallen en modelcontrolesommen.

De herhaalde proef gebruikt een gecontroleerde lokale Docker-verbinding zonder netwerktoegang. Een mislukte proef of onvolledige opruiming blokkeert het vervolg en overschrijft de actuele status met een fout. Bestandsverificatie vereist de geslaagde proef met exact dezelfde rijgegevens; het manifest moet iedere gevraagde opslagnaam precies eenmaal bevatten. De negentien controles worden ook in de gewone bouwcontrole uitgevoerd.
