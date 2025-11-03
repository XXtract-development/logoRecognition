# 5. User Stories & Requirements

## 4.1 Epic: Training System

### User Story 1: Batch Upload
**Als** Data Manager
**Wil ik** meerdere afbeeldingen tegelijk uploaden
**Zodat** ik efficiënt grote datasets kan verwerken

**Acceptance Criteria:**
- [ ] Drag-and-drop interface voor meerdere bestanden
- [ ] Progress indicator per afbeelding
- [ ] Support voor JPG, PNG, WEBP formats
- [ ] Maximum 100 afbeeldingen per batch
- [ ] Foutafhandeling voor corrupte bestanden

### User Story 2: Smart Click Detection
**Als** Data Manager
**Wil ik** met één klik een logo selecteren
**Zodat** ik geen precieze rectangles hoef te tekenen

**Acceptance Criteria:**
- [ ] Enkele klik activeert auto-detectie
- [ ] Systeem toont gedetecteerde boundaries
- [ ] Mogelijkheid om detectie aan te passen
- [ ] Undo/redo functionaliteit
- [ ] Visuele feedback tijdens selectie

### User Story 3: Category Management
**Als** Data Manager
**Wil ik** categorieën en waarden beheren
**Zodat** ik logo's correct kan classificeren

**Acceptance Criteria:**
- [ ] CRUD operaties voor categorieën
- [ ] Code + label systeem
- [ ] CSV import/export
- [ ] Duplicate preventie
- [ ] Hierarchische categorieën support

## 4.2 Epic: Recognition System

### User Story 4: Web Upload Recognition
**Als** Eindgebruiker
**Wil ik** een afbeelding uploaden voor herkenning
**Zodat** ik logo's kan identificeren

**Acceptance Criteria:**
- [ ] Single file upload interface
- [ ] Visuele resultaten met bounding boxes
- [ ] Confidence scores per detectie
- [ ] Download resultaten als JSON/CSV
- [ ] Response binnen 2 seconden

### User Story 5: API Endpoint
**Als** Developer
**Wil ik** via API logo's herkennen
**Zodat** ik het systeem kan integreren

**Acceptance Criteria:**
- [ ] REST endpoint met base64 image support
- [ ] Unique ID per request
- [ ] JSON response met detecties
- [ ] 99% confidence threshold
- [ ] Rate limiting (100 req/min)

## 4.3 Epic: Quality Assurance

### User Story 6: 99% Accuracy Threshold
**Als** API Consumer
**Wil ik** alleen zeer zekere resultaten
**Zodat** ik kan vertrouwen op de output

**Acceptance Criteria:**
- [ ] Configureerbare confidence threshold
- [ ] "No result" bij lage confidence
- [ ] Confidence score in alle responses
- [ ] Logging van rejected predictions
- [ ] Monitoring dashboard voor accuracy

---
