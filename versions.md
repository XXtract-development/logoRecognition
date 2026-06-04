# Versiegeschiedenis

## 2026-06-04 (Epic 8 — Review-scherm & bibliotheekweergave)

### Beoordelingsscherm voor artwork-detecties
- Nieuw scherm "Artwork review": twijfelgevallen uit de automatische keurmerk-detectie staan nu in één overzicht, naast de bestaande onzekere feedback-items
- Per item zie je de uitsnede van het gedetecteerde keurmerk, het voorgestelde label, de zekerheidsscore, de herkomst (bronbestand + positie op het etiket) en de reden waarom het item beoordeling nodig heeft
- Goedkeuren of afwijzen kan met één klik; goedgekeurde items worden direct als trainingsdata geregistreerd
- Beoordelen is voorbehouden aan beheerders; voor anderen zijn de knoppen uitgeschakeld met uitleg

### Bibliotheekweergave
- Trainingsafbeeldingen tonen nooit meer "NaN MB" of een ongeldige datum; ontbrekende gegevens worden netjes als "—" weergegeven

## 2026-06-04 (Epic 8 — Automatische Trainingsdata)

### Stabiliteits- en kwaliteitsverbeteringen (code-review)
- Gedeactiveerde trainingsdata (afgekeurde bron) wordt nu daadwerkelijk uitgesloten van modeltraining en de holdout-evaluatie — voorheen telde een gedeactiveerd record nog mee
- Registratie van meerdere crops gebeurt nu in één transactie: bij een fout halverwege blijven er geen half-opgeslagen records achter
- Synthetische trainingsdata kan niet meer als holdout gemarkeerd worden (de evaluatieset blijft gegarandeerd 100% echt)
- Een herhaalde mislukte import voor dezelfde productcode laat de importrun niet meer vastlopen
- Crop-classificatie verzint geen keurmerk-label meer wanneer er geen referentie beschikbaar is: de regio wordt dan als 'onzeker' gemarkeerd voor handmatige beoordeling in plaats van met een gegokt label de trainingsdata in te gaan

### Synthetische trainingsdata-generatie
- Schaarse klassen worden automatisch aangevuld met synthetisch gegenereerde trainingsdata
- De ratio echte/synthetische voorbeelden is configureerbaar; het ratio-plafond wint altijd over het minimum (kwaliteit boven kwantiteit)
- Klassen die het minimum niet kunnen halen door het ratio-plafond worden gerapporteerd als 'tekort' in plaats van stilletjes met ruis te worden opgevuld
- Synthetische samples komen nooit in de holdout-set terecht (NFR3: holdout is altijd 100% echt)

### Trainingsdata-registratie met herkomst
- Automatisch goedgekeurde keurmerk-crops worden opgeslagen als trainingsdata met volledige herkomst-informatie (bronbestand, boundingbox, methode, zekerheid)
- Trainingsdata uit een specifiek bronbestand kunnen in bulk gedeactiveerd worden (zonder te verwijderen) via één API-aanroep
- Elke trainingsrecord is volledig herleidbaar naar het originele artwork-bestand

### T3777-kruischeck en routing
- Gedetecteerde keurmerken worden automatisch vergeleken met de T3777-declaratie van het product
- Overeenkomsten met voldoende zekerheid worden direct goedgekeurd als trainingsdata
- Afwijkingen (verwacht maar niet gevonden, of gevonden maar niet gedeclareerd) gaan naar de beoordelingswachtrij met een duidelijke reden
- Zonder T3777-declaratie wordt niets automatisch goedgekeurd — alles gaat ter controle

### Crop-classificatie van gelokaliseerde regio's
- Gelokaliseerde keurmerk-regio's worden nu automatisch geclassificeerd naar een T3777-code
- Classificatie gebruikt embedding-gelijkenis met de referentiebibliotheek; als de zekerheid onder de drempel blijft, wordt de regio gemarkeerd als 'onzeker' (input voor handmatige beoordeling in stap 8.5)
- Bij ontbrekende referentie-embeddings valt het systeem terug op een pixelgebaseerde heuristiek

### Keurmerk-lokalisatie op artwork
- Het systeem kan nu keurmerken automatisch lokaliseren op gerasterde artwork-afbeeldingen
- Grote afbeeldingen worden opgeknipt in overlappende tegels (SAHI-aanpak) voor nauwkeurige detectie van kleine keurmerken
- Per tegel wordt template-matching uitgevoerd; detecties van overlappende tegels worden samengevoegd (non-maximum suppression)
- Lege of bijna-eenkleurige regio's worden automatisch genegeerd (wit-op-wit-bescherming)
- Nieuwe API-endpoint: POST /ml/artwork/localize — accepteert afbeelding en keurmerk-templates, retourneert detecties met coördinaten

### Artwork-import via mediaserver
- Het systeem kan nu etiket-artwork automatisch ophalen uit de mediaserver en lokaal opslaan
- Per productcode (GTIN) worden alle PACKAGING_ARTWORK-bestanden geïmporteerd en gecachet
- Bestanden die al geïmporteerd zijn, worden overgeslagen (geen dubbele downloads)
- Importfouten per product worden geregistreerd; de rest van de batch gaat gewoon door
- Importstatus is op te vragen: hoeveel bestanden geïmporteerd, overgeslagen, of mislukt

## 2026-06-04

### Stabiliteits- en kwaliteitsverbeteringen modeltraining
- Het opslaan van een getraind model is robuuster gemaakt (technische fout in de registratie verholpen)
- Bij het opnieuw uploaden van een bestaande keurmerk-variant verschijnt nu een duidelijke melding in plaats van een serverfout
- Keurmerken met heel weinig voorbeelden blijven volledig beschikbaar voor training (worden niet meer in de holdout-set geplaatst)
- Een te kleine holdout-set geeft nu ook bij de trainingsservice een nette foutmelding
- De zoekfunctie op gelijkenis blijft alle keurmerken vinden, ook als hun voorbeelden in de holdout-set zitten
- Het referentie-overzicht laadt sneller bij veel (historische) varianten

## 2026-06-03

### Keurmerk-referentiebibliotheek
- Nieuw scherm "Referenties" om officiële keurmerk-beeldmerken te beheren
- Per keurmerk (T3777-code) meerdere varianten uploaden (taal, mono, kleur) met bronvermelding
- Alleen PNG- en SVG-bestanden toegestaan; te kleine afbeeldingen worden geweigerd met een duidelijke melding
- Varianten worden overzichtelijk per keurmerk gegroepeerd met een voorbeeldweergave
- Een variant kan worden gedeactiveerd zonder te verwijderen, zodat de historie behouden blijft

### Betrouwbaar evaluatiefundament voor modeltraining
- Trainingsafbeeldingen kunnen als "holdout" gemarkeerd worden: een vaste, beschermde set die nooit voor training wordt gebruikt
- Holdout-afbeeldingen worden automatisch uitgesloten bij het samenstellen van een trainingsbatch
- Elk getraind model wordt automatisch beoordeeld op dezelfde holdout-set, zodat modellen eerlijk met elkaar te vergelijken zijn
- Op het modelscherm zijn de holdout-resultaten (accuraatheid, precisie, recall, F1) zichtbaar, los van de trainingsresultaten
- De modelvergelijking toont beide modellen beoordeeld op dezelfde holdout-set

## 2026-04-04

### Training pagina laadt correct
- Categorieën en afbeeldingen worden nu correct geladen op de trainingpagina
- Inloggen is niet meer nodig om gegevens te bekijken

### Pagina's laden weer correct
- Alle pagina's (zoals training, dashboard) worden weer correct weergegeven
- Categorieën worden correct verwerkt op de trainingpagina
- Dashboard statistieken laden nu zonder inlogvereiste
- Trainings-jobs en modellen geven geen foutmelding meer als de ML-service niet beschikbaar is

### Testplannen gevalideerd en bijgewerkt
- Testplannen gevalideerd tegen huidige codebase en bijgewerkt met recente wijzigingen
- Validatierapport toegevoegd met bevindingen en aanbevelingen

### Test infrastructuur uitgebreid
- In-memory storage adapter voor tests (geen S3/MinIO nodig in CI)
- 43 nieuwe web component tests (stores, utils, services, pages)
- 28 P0 acceptatie tests voor kritische paden (auth, uploads, training)
- 32 API tests voor training, modellen en health endpoints
- 40 E2E tests voor modellen pagina, training pipeline en health API

### ML Service configuratie gefixt
- ML service poort uitgelijnd op 8011 (was mismatch tussen 8001 en 8011)
- API verbindt nu correct met de ML service

### Authenticatie geïmplementeerd
- Inloggen met bestaande xxtract-portal inloggegevens
- Login pagina toegevoegd
- 40 API unit tests en 14 E2E tests voor authenticatie
