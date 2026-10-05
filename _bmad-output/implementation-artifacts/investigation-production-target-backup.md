---
status: confirmed
owner: production_data_rehearsal
date: 2026-10-06
---
# Onderzoek van de mislukte productiedoel-back-upproef

Symptoom: de doel-back-uphelper stopt met ValueError voordat een back-upbestand of tijdelijke container wordt gemaakt. De actuele foutstatus is aanwezig; de geslaagde database- en opslagbewijzen blijven intact.

Read-only bewijs op Banana: doelbewijs en bronrijbewijs slagen; archiefhash klopt; containeridentiteit, eigen volume, gesloten poorten en image kloppen. Alle 35 tabelnamen komen exact overeen met de verwachte set; productie-instellingen hebben 3 rijen en de echte migratiehistorie 21. `target-backup.dump` is nog niet aangemaakt. Een afzonderlijke uitsluitend lezende vingerafdrukprobe faalt exact in `transfer-target-plan.identifier` met `Unsafe database identifier` bij de eerste tabel: `_prisma_migrations`.

Hypothesen: verkeerde doelidentiteit (weerlegd), verkeerde tabelset (weerlegd), ontbrekende productie-instellingen of migratiehistorie (weerlegd), onveilige of onverwachte tabelnaam (weerlegd: dit is de verplichte bekende migratietabel), te strenge hergebruikte naamcontrole (bevestigd).

Component: uitsluitend `transfer-target-backup.py`, dat een voor zelfgekozen rol-/databasenamen bedoelde controle ook op bestaande tabellen toepast. Die controle weigert de leidende underscore van de echte migratietabel.

Fixrichting vóór wijziging: een afzonderlijke tabelnaamfunctie in deze back-uphelper staat uitsluitend de exact bekende `_prisma_migrations`-naam aanvullend toe. Alle overige namen blijven onder de bestaande strenge controle. Geen bredere versoepeling, geen herstel in productie, geen wijziging van de geslaagde bewijzen. Een gerichte positieve en negatieve test bewaken dit.
