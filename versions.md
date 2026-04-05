# Versiegeschiedenis

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
