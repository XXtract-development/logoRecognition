---
datum: 2026-10-02
status: testontwerp; onderstaande acceptatietests nog niet uitgevoerd
---
# Herkenningstests en meetcriteria

| ID / capability | Test en te bewijzen resultaat | Niveau/prioriteit |
|---|---|---|
| G01 CAP1 | Alle9 naam/nummerparen, trim/case: canonieke interne code; correcte categorie/GS1-veld; legacy pipelineoutput blijft nummer | TS/Python-contract, hoog |
| G02 CAP1 | GHS-only, expliciete naam/nummer en gemengde profielen: gelijke selectie, andere klassen uitgesloten; alias+naam dezelfde box één resultaat | Contract, hoog |
| G03 CAP1 | Onbekend/GHS00/GHS10/NO_PICTOGRAM: nooit positieve GHS-detectie/template/registratie; UNKNOWN blijft onzeker | Contract/registratie, hoog |
| G04 CAP1 | Namen registreren met correcte metadata; foutpaar zonder storage/embeddingwrites; zelfde crop idempotent; beide flywheel-flagpaden | Mocked API/ML, hoog |
| G05 CAP2 | Namespacevarianten/exacte tag/herhalingen lezen GHS; verwante tag/ongescopete enumerationValue niet; bron/categorie behouden | Parserfixtures, hoog |
| G06 CAP2 | Gelijke/ontbrekende/afwijkende declaratie en NO_PICTOGRAM+positief: GHS-pilot review, nooit autoaccept zelfsconfidence1; geen zelf gegenereerde declaratie als onafhankelijk bewijs | Productketen mocked, hoog |
| G07 CAP3 | Identiekehash, gewijzigdecrop, familyId en near-duplicate over splits: datavalidatie faalt; holdoutregistratie/training/promotie geweigerd | Dataset/flags, hoog |
| G08 CAP4 | Negen klassen+UNKNOWN crop-eval met echte onafhankelijke beelden: volledige foutmatrix inclonleesbaar; geen eigen referentie/replay als bewijs | Offline beeldpilot, hoog |
| G09 CAP4 | Hele etiketten via echte productdetectie en afzonderlijk pipelinebeeldpad: juiste klasse+box1-op-1 gekoppeld aan truth, misses/duplicates/extra's zichtbaar | Offline beeldpilot, hoog |
| G10 CAP4 | Lege ruit, algemene vlam/uitroepteken, transport en overige negatieven: foutvoorstellen per volledig etiket, honderd unieke negatieve groepen | Offline beeldpilot, hoog |
| G11 CAP4 | FLAME vs FLAME_OVER_CIRCLE en echte andereGHS: multiclassverwisseling; nooit algemeen geen-symbooltraininglabel | Eval/exporttest, hoog |
| G12 CAP4 | Kleine/blur/reflectie/gebogen/meerdere pictogrammen: hele-etiketnoemer bevat alle gevallen, kwaliteitsvakkenenabstentie gerapporteerd | Offline beeldpilot, midden |
| G13 CAP4 | imageUrl-only mag geen succesvolle lege beeldmeting opleveren; replayapart van echtebeeldtest | Endpointcontract, hoog |
| G14 CAP5 | Bestaande T3777/diet/usage/NutriScore fixtures+bevroren referentieregressies; gewijzigde labels/thresholds of output breken regressiegate | Offline regressie, hoog |
| G15 CAP5 | Ontwikkelvalidatie voor selectie; verzegelde eindtest eenmaal voor vooraf vastgelegde baseline/challenger; template/gate/regio/classifier apart | Evaluatiecontract, hoog |

## Rapportvorm
Per klasse: ontwikkelgroepen, actieve echte referenties, onafhankelijke positieve holdoutgroepen, correcte cropclassificaties, correcte hele-etiketgroepen, matchende objecten, missers, extra foutdetecties, verwisselingen, abstenstie en negatieve foutetiketten; steeds teller/noemer. Onleesbare gevallen niet verbergen in een gunstiger noemer. Status: onvoldoende bewijs / onder pilotdoel / pilotdoel gehaald met menselijke review. Geen status voldoende getraind uit een rij referentieaantallen.

Whole-label objectmatching: maximum1-op-1 matching met IoU≥0,5 én correcte klasse. Dubbele box levert geen extra true positive. Een positieve bronfamiliegroep telt voor het pilotgroepdoel alleen correct bij minstens één leesbaar waarheidssymbool, als alle geannoteerde leesbare exemplaren van de betreffende klasse goed gevonden zijn én er geen foutieve extra/verwisselde GHS-voorspelling op het etiket is; objectrecall daarnaast afzonderlijk rapporteren. Extra voorspellingen blijven foutpositieven in precisie/foutmatrix. Volledig onleesbare groepen: abstentie, geen succes of minimumbewijs. Onduidelijke annotaties maken de groepsuitkomst onzeker; totaalnoemers blijven zichtbaar zonder waarheid te verzinnen. Negatieve etiketten: één of meer onterechte GHS-voorspellingen telt één foutetiket; noemer onafhankelijke negativefamiliegroepen.

## Reproduceerbaarheid en uitvoering
Bewaar manifest/hash, labels, modelweights+labelmap+confighash, codecommit, refs/template/gatesnapshot, thresholds, evaluatiescriptversie en outputs. Eerste pilot met ongewijzigde backbone; geen training om een ongediagnosticeerde missendebox te repareren. Sterke cropresultaten zijn geen hele-etiketresultaten. Nul-GHS-ref/testsnapshot blijft gedateerd; huidige model-GHSlabels eerst apart uitlezen.

Offline contracts gebruiken mocks/tempopslag en geen echte catalogus-/DB-verzoeken. Beeldmeting gebruikt uitsluitend vooraf toegestane lokale inputs; geen ACC- of productiebenchmarks starten in deze specificatiefase. Geen extra echte bronbeelden aanwezig of resultaat verzonnen. Testontwerp is geen geslaagde testrun.

## Verplichte review-regressies
G07/G15: modelkeuze, reference/gate/thresholdconfig en datasetmanifest moeten vastliggen vóór eindtesttoegang; een selectie/tuningverzoek met final-holdoutresultaten faalt als geldige vrijgave. G09: lege lijst leesbare truths levert geen geslaagde positievegroep; alle9klassen voorspellen op elk positief etiket levert geen pilot-succes door extra foutmatches. Test deze beoordelingslogica eerst met synthetische structuurfixtures; die tests zijn geen echte herkenningskwaliteit.
