# Gecontroleerde productiecuratie van één lege referentie

Status: voorbereid; niet uitgevoerd. Dit besluit hervat het vliegwiel niet.

## Exacte wijziging
Uitsluitend referentie `f1a85af9-c845-49a9-8ce3-90457da6e759` voor `RECYCLABLE_GENERAL_CLAIM` via het bestaande beheerde deactivatiepad inactief maken. Bronpixelhash: `d7214796e3f896897ac9a665117531bdd7e8ed79d1dbecdd0249191e8fec6ad3`. Record, bestand en embedding behouden als historie; niets verwijderen. De bron is visueel beoordeeld door root en een onafhankelijke AI, zonder menselijke-goldclaim. Alle542actieve referenties zijn read-only geaudit; alleen deze heeft geen centrale inhoud.

## Uitvoering na expliciet curatiebesluit
1. Controleer opnieuw eigen vijf containers en geldige versleutelde backup. Bevestig exact dezelfde referentie-ID, code, active=true en pixelhash; bij afwijking stoppen. Bewaar exact record/embedding als privé rollbackbewijs.
2. Pas de eigen readonly nazorgobserver gecontroleerd aan zodat uitsluitend de verwachte active/reference-vectorcount542→541 verandert; behoud alle overige controles, bewaar de eerdere observerhash en de nieuwe bronhash plus het curatiebesluit. Geen algemene tolerantie voor ontbrekende embeddings. De oude542meting blijft origineel in historie.
3. Roep exact `PATCH /api/v1/reference-logos/f1a85af9-c845-49a9-8ce3-90457da6e759/deactivate` aan met geldige beheerautorisatie. Controleer HTTPresultaat en daarna de echte database-read: dezelfde referentie active=false;541actieve referenties met541completevectoren. Geen handmatigeSQLcuratie.
4. Verifieer bestaande baseline-invalidatie en templateverversing uit dit beheerde pad; controleer werkelijk actuele detectie-index en templates, wacht zo nodig de bestaande cachetermijn. Geen containerherstart vereist voor deze referentiecuratie. Bij refreshfailure eerst investigation, geen hervatting.
5. Hermeet alle oorspronkelijke654beelden zonder labelverandering; houd huidige-runtime en nieuwe-hashroute apart. Herhaal bestaande productieherkenningsproeven; bewaar requests/resultaten en code/imagebinding zonder geheimen. De geheugenpreview is geen bewijs van uitgevoerde curatie.
6. Laat de gepauzeerde uitbreiding en uitgeschakelde nominatie intact: twee subtypeverwarringen blijven,294/564positieven correct in hashcorrecte preview. Geen algemene drempelverhoging, capverhoging, goldherlabeling of GHSvrijgave.
7. Neem daadwerkelijk resultaat, eventuele failures en bronhashbindingen op in status/evidence/checklist. Behoud dagelijksebackup,24-uurscontrole, legacyvoorziening en cache.

## Terugkeer
Geen volledig databaseherstel. Bij aangetoonde verslechtering veilig gepauzeerd blijven, de specifieke eerder bewaarde referentiestatus via een afzonderlijk expliciet goedgekeurd herstelpad terugzetten en alle count/hash/indexcontroles herhalen. Een niet-bestaand activateendpoint wordt niet aangenomen. Geen uitfasering of nieuwecontaineractie binnen dit curatiebesluit.

## Effect en grens
De lege referentie doet niet meer mee aan herkenning. In de volledige ongewijzigde geheugenpreview verdwijnen negen foutieve recyclingmatches; twee subtypefoutmatches blijven. Dit maakt onbeheerde uitbreiding nog niet bewezen veilig. Codecorrectie is afzonderlijk via ACCtests/PR vrij te geven; productiecode-uitrol vergt een apart besluit over de exact geteste imagepair.
