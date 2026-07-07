# Investigation (peil): ONNX-mock-detector — impact op de live herkenning?

## Hand-off Brief

1. **Wat is er.** De ml-service logt bij startup `ONNX runtime not available, using mock model` (4× per worker); `import onnxruntime` faalt in het image. Het DETECTIE-model valt terug op `MockDetectionModel`.
2. **Impact — LAAG (geen live-blokkade).** Het `detect()`-pad is een NIET-functionele stub in béide takken (mock = vaste dummy-box; ONNX = placeholder `_postprocess_detections` → `[]`). De ACTIEVE product-herkenning (Epic 12-19: flywheel + `/artwork/classify`) draait op het embedding/classificatie-pad met het ECHTE torch-model — niet op `/ml/detect`. Het detect-pad (`recognition.ts`, `detection.py`) is legacy-scaffold uit de Epic-8-tijd.
3. **Wat er nu nodig is.** Geen urgentie. Deprioriteren ónder 19.6 en de twee-traps-bouw. Fix = opruimen (dode detect-scaffold verwijderen) óf `onnxruntime` repareren als het detect-pad ooit heropgebouwd wordt — geen van beide blokkeert de klant.

## Confirmed Findings

### F1: `detect()` is niet-functioneel, ongeacht ONNX
`model_manager.py` — `MockDetectionModel.detect()` retourneert één vaste dummy (bbox 100,100,200,200, conf 0,95, `mock_logo`). Het ECHTE ONNX-pad roept `_postprocess_detections` aan, dat een **placeholder is met `return []`** (`model_manager.py:~214-218`). Dus zelfs mét een werkende onnxruntime geeft `detect()` niets bruikbaars. **Het probleem is niet "onnxruntime kapot" maar "de detector is nooit afgebouwd".**

### F2: de actieve herkenning gebruikt `detect()` NIET
De flywheel + artwork-pijplijn gebruiken `/artwork/classify` (`artwork.py`) → `propose_regions` + echt torch-embedding + referentie-matching (`classification.py`). `bootstrap_search` idem. Geen van deze raakt `model_manager.detect()` of het ONNX-model.

### F3: het detect-pad is legacy
`git log -1`: `recognition.ts` (roept `detectLogos`→`/ml/detect` aan) laatst inhoudelijk 2026-03-31 (production-readiness, geen feature); `detection.py` 2026-06-13 (CI-lint); terwijl `artwork.py` (classify) 2026-07-03 (Story 12.8, actueel). Alle recente herkenningsontwikkeling (Epic 12-19) zit op het classify/embedding-pad.

## Deduced Conclusions

### D1: geen klant-facing degradatie door de mock-detector
Op basis van F1+F2+F3: de huidige product-herkenning hangt niet van `detect()` af. Als een live-consument (frontend/n8n) `/recognition`→`/ml/detect` wél zou gebruiken, zou herkenning zichtbaar leeg/kapot zijn (F1: `[]`/dummy) — dat zou allang opgevallen zijn; n8n gebruikt bovendien het declared-values/classify-pad (Story 12.8). Dus: mock-detector = onschadelijk voor het huidige product.

## Hypothesized / open (lage prioriteit)
- **H1:** `recognition.ts`/`/ml/detect` is dode/ongebruikte scaffold (mounted maar geen actieve consument). Confirm: grep frontend/n8n op `/recognition`-calls. Refuteren zou de prioriteit verhogen, maar F1 (detector geeft sowieso niets) begrenst de impact zelfs dan.
- **H2:** onnxruntime-importfout = ontbrekende system-lib/glibc of arch-mismatch in het ml-image. Niet nader onderzocht (niet nodig voor de sizing).

## Fix direction (later, cleanup — geen story-urgentie)
1. **Aanbevolen: verwijder de dode detect-scaffold** (`detection.py`/`LogoDetector`/`recognition.ts`-detectiegebruik + de mock/ONNX-detectietak in `model_manager`) — minder verwarrende "using mock model"-ruis, minder dood pad. Alleen ná bevestiging (H1) dat niets het gebruikt.
2. **Alternatief** (als het detect-pad ooit terugkomt): `onnxruntime` in het image repareren (system-lib/versie-pin) ÉN `_postprocess_detections` echt implementeren — beide nodig; alleen onnxruntime fixen levert nog steeds `[]`.

## Status
**Concluded (peil).** Impact op live herkenning: **NEE** (confidence: Medium-High — F1/F2/F3 confirmed; H1 open maar begrensd). Prioriteit: LAAG — ná 19.6 en de twee-traps-bouw. Bij een volledige diagnose later: confirm H1 (consumenten) + H2 (import-oorzaak).
