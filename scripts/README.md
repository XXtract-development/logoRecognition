# Scripts Overzicht

Deze map bevat alle scripts die gebruikt worden in het logoRecognition project, georganiseerd per functionaliteit.

## 📁 Mappenstructuur

### `/deployment` - Deployment Scripts
Bevat alle deployment-gerelateerde configuraties en scripts.

**Docker Compose Bestanden:**
- `docker-compose.yml` - Standaard Docker Compose configuratie
- `docker-compose.test.yml` - Test omgeving configuratie
- `docker-compose.minio.yml` - MinIO storage configuratie

**Coolify Configuraties:**
- `coolify-backend.yml` - Backend deployment voor Coolify
- `coolify-frontend.yml` - Frontend deployment voor Coolify
- `coolify-services.yml` - Services deployment voor Coolify

**Start Scripts:**
- `start_backend.sh` - Start de backend server
- `start_uat.sh` - Start UAT (User Acceptance Testing) omgeving

**NPM Scripts:**
```bash
npm run docker:up        # Start Docker containers
npm run docker:down      # Stop Docker containers
npm run docker:test      # Run tests in Docker
npm run start:backend    # Start backend
npm run start:uat        # Start UAT omgeving
```

---

### `/development` - Development Utilities
Tools en utilities voor ontwikkeling.

**Scripts:**
- `rename_files.sh` - Hernoem bestanden in bulk
- `shrink_pngs.sh` - Comprimeer PNG afbeeldingen
- `run_category_migration.py` - Migreer categorieën in database

**Gebruik:**
```bash
# Hernoem bestanden
bash scripts/development/rename_files.sh

# Comprimeer afbeeldingen
bash scripts/development/shrink_pngs.sh

# Run migratie
python scripts/development/run_category_migration.py
```

---

### `/testing` - Test Runner Scripts
Scripts voor het uitvoeren van verschillende test suites.

**Test Scripts:**
- `run_comprehensive_tests.sh` - Volledige test suite
- `run_sprint03_tests.sh` - Sprint 3 specifieke tests
- `run_a_plus_plus_tests.sh` - A++ grade tests
- `UAT_test_final.sh` - Finale UAT tests
- `test_all_fixes.sh` - Test alle fixes
- `test_compilation_errors.sh` - Check compilatie errors
- `test_complete_functionality.sh` - Volledige functionaliteitstest
- `test_no_websocket_errors.sh` - WebSocket error check
- `test_robust_solution.sh` - Robuustheid tests
- `test_training_readiness_complete.sh` - Training readiness check
- `verify_auto_training.sh` - Verifieer automatische training

**NPM Scripts:**
```bash
npm run test               # Alle tests
npm run test:validation    # Validatie tests
npm run test:integration   # Integratie tests
npm run test:e2e          # End-to-end tests
npm run test:load         # Load tests
```

---

### `/qa` - QA & Validation
Quality Assurance scripts en validatie tools.

**QA Scripts:**
- `qa_validation_a_plus_plus.sh` - A++ QA validatie
- `qa_sprint01_validation.py` - Sprint 1 validatie
- `sprint03_qa_review.py` - Sprint 3 QA review
- `sprint03_validation.py` - Sprint 3 validatie

**Reports Map:**
- `reports/qa_validation_stamp.json` - QA validatie timestamp
- `reports/sprint03_qa_report.json` - Sprint 3 QA rapport
- `reports/sprint03_validation_report.json` - Sprint 3 validatie rapport

**NPM Scripts:**
```bash
npm run test:qa    # Run QA validatie
```

---

### `/setup` - Setup & Implementation Scripts
Scripts voor setup en implementatie van features.

**Implementation Scripts:**
- `setup_complete_implementation.sh` - Volledige setup
- `implement_complete_frontend.sh` - Frontend implementatie
- `implement_us035_039_complete.sh` - User stories 35-39 implementatie
- `implement_us035_to_039.sh` - User stories 35-39 (alternatief)
- `implement-a-plus-plus-grade.sh` - A++ grade features
- `update_all_stories.sh` - Update alle user stories

**Fix Scripts:**
- `fix-sprint-1.sh` - Sprint 1 fixes
- `fix-us-016-017-023.sh` - Specifieke user story fixes

**Gebruik:**
```bash
# Volledige setup
bash scripts/setup/setup_complete_implementation.sh

# Implementeer specifieke features
bash scripts/setup/implement_complete_frontend.sh
```

---

### `/archives` - Gearchiveerde Scripts
Oude of deprecated scripts die bewaard worden voor referentie.

**Bestanden:**
- `complete_sprint2.py` - Sprint 2 completion script (deprecated)
- `coverage.xml` - Oude coverage data
- `list.txt` - Oude bestandslijst
- `test-zoom-fix.html` - Oude zoom fix test
- Diverse oude test bestanden

⚠️ **Let op:** Scripts in deze map zijn mogelijk verouderd en worden niet meer actief onderhouden.

---

## 🚀 Quick Start

### Development
```bash
# Start development omgeving
npm run dev

# Run linter
npm run lint

# Format code
npm run format
```

### Testing
```bash
# Run alle tests
npm run test

# Run specifieke test suite
npm run test:validation
npm run test:qa
npm run test:e2e
```

### Deployment
```bash
# Start Docker containers
npm run docker:up

# Start backend
npm run start:backend

# Start UAT
npm run start:uat
```

---

## 📝 Migratie Notities

**Datum:** 3 November 2024

**Wijzigingen:**
- Alle scripts verplaatst van root naar `/scripts` directory
- Georganiseerd in subdirectories per functionaliteit
- Package.json scripts bijgewerkt met nieuwe paden
- Backup gemaakt in `backup-20251103-193641/`

**Voordelen:**
- ✅ Schonere project root
- ✅ Betere organisatie en vindbaarheid
- ✅ Duidelijke scheiding tussen verschillende script types
- ✅ Professionelere project structuur
- ✅ Gemakkelijker onderhoud

---

## 🔗 Gerelateerde Documentatie

- [Project README](../README.md)
- [Tests Directory](../tests/)
- [Package.json](../package.json)

---

Voor vragen of problemen, zie de project documentatie of neem contact op met het development team.
