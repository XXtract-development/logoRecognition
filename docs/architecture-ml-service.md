# Architectuur — ML Service (apps/ml-service)

**Gegenereerd:** 2026-03-31 | **Scan Level:** Exhaustive | **Taal:** Python 3.11 | **Framework:** FastAPI

---

## Overzicht

De ML microservice is een FastAPI-gebaseerde Python applicatie die verantwoordelijk is voor logo-detectie, embedding-generatie en modeltraining. Het gebruikt PyTorch voor training, ONNX Runtime voor inferentie en PostgreSQL met pgvector voor vector similarity search.

---

## Directory Structuur

```
apps/ml-service/
├── app/
│   ├── main.py              # FastAPI applicatie entry point
│   ├── core/
│   │   ├── config.py         # Pydantic-settings configuratie
│   │   └── logging.py        # Structlog logging setup
│   ├── ml/
│   │   ├── model_manager.py  # ONNX/PyTorch model laden & inferentie
│   │   └── detector.py       # Logo detectie logica
│   ├── api/
│   │   ├── detection.py      # Detectie endpoints
│   │   ├── training.py       # Training job endpoints
│   │   ├── models.py         # Model beheer endpoints
│   │   └── health.py         # Health check endpoints
│   └── services/
│       ├── database.py       # PostgreSQL async operaties (asyncpg)
│       ├── storage.py        # MinIO/S3 storage operaties
│       ├── similarity.py     # Vector similarity search
│       └── trainer.py        # PyTorch training pipeline
├── requirements.txt
└── Dockerfile               # Multi-stage productie build
```

---

## API Endpoints (prefix: `/ml`)

### Detectie

| Methode | Pad | Beschrijving |
|---------|-----|-------------|
| POST | `/ml/detect` | Base64 encoded afbeelding detectie |
| POST | `/ml/detect/upload` | Bestand upload detectie |
| POST | `/ml/embed` | Embedding generatie (512-dim vector) |

### Training

| Methode | Pad | Beschrijving |
|---------|-----|-------------|
| POST | `/ml/train` | Start training met batch ID |
| GET | `/ml/train/{job_id}` | Training status ophalen |
| GET | `/ml/train` | Lijst training jobs |
| DELETE | `/ml/train/{job_id}` | Annuleer job |
| GET | `/ml/train/progress/logos` | Training voortgang per logo |

### Modellen

| Methode | Pad | Beschrijving |
|---------|-----|-------------|
| GET | `/ml/models` | Lijst alle modellen |
| GET | `/ml/models/{model_id}` | Model details (versie, accuracy, precision, recall, F1) |
| POST | `/ml/models/{model_id}/activate` | Activeer model |
| DELETE | `/ml/models/{model_id}` | Verwijder model |

### Health

| Methode | Pad | Beschrijving |
|---------|-----|-------------|
| GET | `/health` | Basis health (modellen geladen, GPU beschikbaar) |
| GET | `/health/ready` | Kubernetes readiness probe |
| GET | `/health/live` | Kubernetes liveness probe |
| GET | `/health/detailed` | Component status met GPU geheugen metrics |

**Prometheus metrics:** beschikbaar op `/metrics`

---

## ML Modellen

### Detectie Model
- **Architectuur:** EfficientDet (ONNX formaat)
- **Input:** 640×640 pixels, genormaliseerd [0,1], CHW format
- **Output:** Detecties met confidence scores en bounding boxes
- **NMS:** Non-Maximum Suppression met IoU berekening
- **Execution Providers:** CUDA (GPU) of CPU (fallback)

### Embedding Model
- **Architectuur:** EfficientNet-B0 of ResNet-50 (PyTorch)
- **Input:** 224×224 pixels, genormaliseerd
- **Output:** 512-dimensionale embedding vector
- **Gebruik:** Logo matching via cosine similarity

### Smart Detection
- **Methode:** Edge detection + contour finding (OpenCV)
- **Fallback:** Wanneer ONNX model niet beschikbaar

---

## Training Pipeline (services/trainer.py)

### Configuratie
| Parameter | Standaard |
|-----------|-----------|
| Batch Size | Configureerbaar |
| Epochs | Configureerbaar |
| Learning Rate | Configureerbaar |
| Augmentation Factor | Configureerbaar |
| Validation Split | Configureerbaar |

### Training Stappen
1. **Data laden** — Training afbeeldingen ophalen uit database
2. **Label mapping** — Categorieën toewijzen aan indices
3. **Augmentatie** — Rotatie, flip, kleur jitter
4. **Train/validatie split** — Configureerbare verdeling
5. **Model initialisatie** — EfficientNet-B0 of ResNet-50
6. **Training loop** — AdamW optimizer, ReduceLROnPlateau scheduler
7. **Early stopping** — Patience counter voor convergentie
8. **ONNX export** — Model converteren naar ONNX formaat
9. **Upload** — Model opslaan in MinIO storage
10. **Registratie** — Versie registreren in database

**Versie format:** `v{YYYYMMDD_HHMMSS}`

---

## Services

### Database Service (asyncpg)
- Async connection pool (min 2, max 10)
- Training batch operaties (CRUD)
- Model versie beheer met activering
- Logo operaties en training statistieken
- **Embedding operaties:** Opslag en similarity search via pgvector
- **Vector search:** `embedding <=> vector` operator voor nearest neighbors

### Storage Service (MinIO)
- **Buckets:** `models`, `training-images`
- Model opslaan/laden/verwijderen
- Presigned URL generatie
- Training afbeelding operaties

### Similarity Service
- Embedding generatie en opslag
- Logo matching tegen database embeddings
- Similarity drempel configureerbaar
- **Embedding cache:** Max 1000 entries

---

## Configuratie (core/config.py)

| Instelling | Standaard |
|-----------|-----------|
| Host | 0.0.0.0 |
| Port | 8001 |
| Confidence Threshold | 0.99 |
| NMS Threshold | 0.5 |
| Max Detecties | 100 |
| Embedding Dimensies | 512 |
| GPU Enabled | False |
| Device | Auto (cuda als GPU + beschikbaar, anders cpu) |

---

## Dockerfile (Multi-stage)

| Stage | Basis | Doel |
|-------|-------|------|
| Builder | python:3.11-slim | Build deps, venv setup, pip install |
| Runtime | python:3.11-slim | Runtime deps (OpenCV libs), venv copy |

- **Gebruiker:** non-root (mlservice)
- **Model directories:** `/app/models`, `/app/models/torch`
- **Health check:** curl `/health` elke 30s
- **Entrypoint:** `uvicorn app.main:app --host 0.0.0.0 --port 8001`

---

## Externe Afhankelijkheden

| Service | Gebruik |
|---------|--------|
| PostgreSQL + pgvector | Training data, model versies, vector embeddings |
| Redis | L2 caching |
| MinIO | Model opslag, training afbeeldingen |

---

## Logging & Monitoring
- **Structlog** — Structured JSON logging in productie
- **Prometheus** — Metrics endpoint op `/metrics`
- **Health probes** — Kubernetes readiness/liveness
- **GPU metrics** — Geheugengebruik in detailed health
