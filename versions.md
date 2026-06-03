# Versiegeschiedenis

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
