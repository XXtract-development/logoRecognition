---
datum: 2026-10-04
status: naar ACC samengevoegd; bouwherstel voor automatische uitrol loopt
---
# Gevarenpictogrammen: implementatie en bewijs per type

De nieuwe herkenningsroute gebruikt negen authentieke officiële startreferenties van CCOHS. De bestaande modellen zijn niet opnieuw getraind. De technische aansluiting wordt met echte afbeeldingsverwerking getest; onafhankelijke veldkwaliteit is een afzonderlijke bewijsgrens. Nieuwe GHSvoorstellen blijven menselijke beoordeling, ook bij hoge score of overeenkomende productdeclaratie.

## Huidige bewijsstand

| Pictogram | Code | Officiële startreferenties | Onafhankelijke eindtestgroepen | Voldoende getraind/herkenningskwaliteit bewezen? |
|---|---|---:|---:|---|
| Ontploffende bom | GHS01 / EXPLODING_BOMB | 1 | 0 | Niet bewezen |
| Vlam | GHS02 / FLAME | 1 | 0 | Niet bewezen |
| Vlam boven cirkel | GHS03 / FLAME_OVER_CIRCLE | 1 | 0 | Niet bewezen |
| Gasfles | GHS04 / GAS_CYLINDER | 1 | 0 | Niet bewezen |
| Bijtend | GHS05 / CORROSION | 1 | 0 | Niet bewezen |
| Schedel met gekruiste beenderen | GHS06 / SKULL_AND_CROSSBONES | 1 | 0 | Niet bewezen |
| Uitroepteken | GHS07 / EXCLAMATION_MARK | 1 | 0 | Niet bewezen; eerste ontwikkelbeelden beschikbaar |
| Ernstig gezondheidsgevaar | GHS08 / HEALTH_HAZARD | 1 | 0 | Niet bewezen |
| Milieugevaar | GHS09 / ENVIRONMENT | 1 | 0 | Niet bewezen |

Alle negen referenties hebben bron-URL, ongewijzigde PNGbytes en opnieuw gecontroleerde SHA-256 in de gebundelde manifest. Ze tellen niet als onafhankelijke testbeelden. NO_PICTOGRAM is alleen een declaratieve toestand, geen tiende visuele klasse.

## Eerste echte ontwikkelverkenning

Acht oorspronkelijke PDFbestanden zijn via de bestaande media.stage-leesroute lokaal verzameld en hun SHA256 opnieuw tegen de oorspronkelijke importbestandsnamen gecontroleerd. Twee onafhankelijke AIbeoordelingen van volledige renders vonden vier uitroeptekens, twee frontetiketten zonder zichtbaarGHS en twee technische tekeningen. De positievebeelden behoren tot sterk verwante Marcel'sGreenSoap-layout/productvarianten, dus conservatief één ontwikkelfamilie. Geen menselijke annotatie/finalholdoutclaim.

Die ontwikkelproef legde twee echte fouten bloot: interne rode ruiten werden verborgen door een rode buitenomtrek, en gekleurde drukvlakken leken onterecht op HEALTH_HAZARD. Gerichte geometrie/ringcontroles en ontdubbeling verhelpen deze gevallen. Onafhankelijke rootherhaling bevestigt vier uitroeptekens (twee onzeker) en nul andere GHSvoorstellen op de acht pagina's. Drie code-/testreviews zijn uitgevoerd; alle geconstateerde problemen zijn hersteld en onafhankelijk opnieuw gecontroleerd. Dit is geen 100negatievenmeting en geen algemene kwaliteitsbelofte.

## Implementatie en bescherming

Namen/nummers worden centraal naar dezelfde betekenis/categorie vertaald; het bestaande pipelinecontract blijft GHS01–09 met bestaande methodenamen. GHSproductdeclaraties worden apart gelezen. GHSbevindingen gaan altijd naar zichtbare menselijke beoordeling; menselijke acceptatie blijft mogelijk zonder automatische training/referentie/goldsetmutaties. Automatische nominatie/promotie is afgeschermd.

Lokale dataset/evaluatiegereedschappen controleren herkomst, beeldhashes, families en gewijzigde-resolutieduplicaten. Ontwikkelvalidatie blijft gescheiden van een vooraf bevroren eindtest; een eindtest mag maar één keer worden geopend. Meetuitkomsten bevatten klassenmatrix, missers, verwisselingen, extra/onzekerevoorstellen, één-op-één boxmatching, kwaliteit/noemers en perklasse bewijsgrenzen. Herkende officiëletemplates mogen nooit eindtestbewijs worden.

## Nog niet bewezen of uitgevoerd

Geen onafhankelijke volledig geannoteerde eindtest met minimaal20leesbarepositievefamilies per klasse en100negatievefamilies. Geen modeltraining/gewichtenactivatie, liveDBimport, automatische GHSbevestiging of handmatige containeractie. Push/merge/ACCuitrol worden pas na succesvolle codechecks en review uitgevoerd. ImageURLonly blijft expliciet niet ondersteund; geef afbeeldingsinhoud.

De volgende inhoudelijke stap na codevrijgave is meer onafhankelijke echte etiketten verzamelen en dubbel controleren volgens het datasetcontract. Pas gemeten zwakke plekken rechtvaardigen gerichte extra referenties of modeltraining; referentieaantallen alleen nooit.

## Evidence

- [Testbewijs](ghs-test-evidence-20261002.md)
- [Broninventaris en onafhankelijke ontwikkelobservaties](ghs-dataset-source-inventory-20261002.md)
- [Onderzoek van concrete failures](investigations/ghs-codecontract-20261002.md)
- [Uitvoeringsspecificatie](spec-ghs-herkenning-implementatie.md)
- [Officiële bronkit](https://www.ccohs.ca/WHMISpictograms.html)
- [Gebundeld referentiemanifest](../../apps/ml-service/app/assets/ghs/manifest.json)


Eindverificatie4oktober2026:190Python/169APItests geslaagd, APIbuild/lint/opmaak/diff groen. Drie onafhankelijke reviews plus hercontrole afgerond,21bevindingen opgelost; niets uitgesteld. Geen onafhankelijkeveldkwaliteitsclaim.

PR2 samengevoegd na succesvolle volledige CI: ACCcommitf5c4a5b74f35c6a692782aacea1754e1849fd408. Werkelijkedraaiendeversie volgt na automatischeuitrol.

Automatischeappbuild37158891455 faalde bij externeONNXpostinstall vóórcompilatie. OudeACC305733noggezond; geenruntimevrijgaveclaim. Onderzoek bevestigt optioneleCUDA-downloadinlockedpackage; minimalecommand-scopedbouwfix voorbereid. Geenherkennings/model/providerwijziging.
