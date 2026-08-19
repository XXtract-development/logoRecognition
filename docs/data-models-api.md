# Data Models — API Backend

**Gegenereerd:** 2026-03-31 | **Scan Level:** Exhaustive | **ORM:** Prisma 5.9.1

---

## Database

- **Engine:** PostgreSQL 16
- **Extensie:** pgvector (512-dimensionale vector embeddings)
- **Indexing:** IVFFlat voor vector similarity search

---

## Entiteiten (20 Prisma Modellen)

### User
| Veld | Type | Beschrijving |
|------|------|-------------|
| id | String (UUID) | Primaire sleutel |
| email | String | Uniek, login identifier |
| passwordHash | String | Bcrypt (12 rounds) |
| username | String | Weergavenaam |
| role | Enum | ADMIN, USER, VIEWER |
| organizationId | String? | FK → Organization |
| lastLoginAt | DateTime? | Laatste login tijdstip |
| createdAt | DateTime | Aanmaakdatum |
| updatedAt | DateTime | Laatste wijziging |

### Organization
| Veld | Type | Beschrijving |
|------|------|-------------|
| id | String (UUID) | Primaire sleutel |
| name | String | Organisatienaam |
| users | User[] | Relatie naar gebruikers |

### Logo
| Veld | Type | Beschrijving |
|------|------|-------------|
| id | String (UUID) | Primaire sleutel |
| name | String | Logo naam |
| category | String | Categorie |
| value | String | Waarde (uniek met category) |
| description | String? | Beschrijving |
| defaultConfidence | Float | Standaard confidence drempel (0.99) |
| trainingSamples | Int | Aantal training samples |
| annotations | Annotation[] | Relatie naar annotaties |
| embeddings | LogoEmbedding[] | Relatie naar embeddings |

### LogoEmbedding
| Veld | Type | Beschrijving |
|------|------|-------------|
| id | String (UUID) | Primaire sleutel |
| logoId | String | FK → Logo |
| embedding | Vector(512) | pgvector embedding |
| modelVersionId | String? | FK → ModelVersion |
| createdAt | DateTime | Aanmaakdatum |

### LogoImage
| Veld | Type | Beschrijving |
|------|------|-------------|
| id | String (UUID) | Primaire sleutel |
| filename | String | Bestandsnaam |
| originalName | String | Originele bestandsnaam |
| storagePath | String | MinIO pad |
| thumbnailPath | String? | Thumbnail pad |
| mimeType | String | MIME type (jpeg/png/webp) |
| size | Int | Bestandsgrootte (bytes) |
| width | Int | Breedte (pixels) |
| height | Int | Hoogte (pixels) |
| hash | String | SHA256 hash |
| userId | String | FK → User (uploader) |
| categoryId | String? | FK → Logo (categorie) |
| annotations | Annotation[] | Relatie naar annotaties |

### Annotation
| Veld | Type | Beschrijving |
|------|------|-------------|
| id | String (UUID) | Primaire sleutel |
| imageId | String | FK → LogoImage |
| logoId | String | FK → Logo |
| batchId | String? | FK → TrainingBatch |
| x | Float | Bbox X (genormaliseerd 0-1) |
| y | Float | Bbox Y (genormaliseerd 0-1) |
| width | Float | Bbox breedte (genormaliseerd) |
| height | Float | Bbox hoogte (genormaliseerd) |
| confidence | Float? | ML confidence score |
| validated | Boolean | Review status |
| validatedBy | String? | FK → User (reviewer) |
| validatedAt | DateTime? | Review tijdstip |
| createdBy | String | FK → User (annotator) |
| createdAt | DateTime | Aanmaakdatum |

### TrainingBatch
| Veld | Type | Beschrijving |
|------|------|-------------|
| id | String (UUID) | Primaire sleutel |
| name | String | Batch naam |
| status | TrainingStatus | UPLOADING → PROCESSING → ANNOTATING → TRAINING → COMPLETED / FAILED |
| config | Json? | Training configuratie |
| startedAt | DateTime? | Start tijdstip |
| completedAt | DateTime? | Voltooiing tijdstip |
| error | String? | Foutmelding |
| annotations | Annotation[] | Relatie naar annotaties |

### TrainingData
| Veld | Type | Beschrijving |
|------|------|-------------|
| id | String (UUID) | Primaire sleutel |
| imageId | String | FK → LogoImage |
| label | String | Training label |
| split | String | train / validation / test |

### ModelVersion
| Veld | Type | Beschrijving |
|------|------|-------------|
| id | String (UUID) | Primaire sleutel |
| version | String | Versie string (v{YYYYMMDD_HHMMSS}) |
| name | String | Model naam |
| status | String | training / active / inactive / failed |
| accuracy | Float? | Accuracy metric |
| precision | Float? | Precision metric |
| recall | Float? | Recall metric |
| f1Score | Float? | F1 score |
| size | Int? | Model grootte (bytes) |
| storagePath | String? | MinIO pad |
| trainingJobId | String? | FK → TrainingBatch |
| activatedAt | DateTime? | Activering tijdstip |
| createdAt | DateTime | Aanmaakdatum |

### RecognitionLog
| Veld | Type | Beschrijving |
|------|------|-------------|
| id | String (UUID) | Primaire sleutel |
| requestId | String | Uniek request ID |
| imageHash | String | MD5 hash van input |
| userId | String? | FK → User |
| processingTime | Int | Verwerkingstijd (ms) |
| results | RecognitionResult[] | Relatie naar resultaten |
| feedback | FeedbackEntry[] | Relatie naar feedback |
| createdAt | DateTime | Tijdstip |

### RecognitionResult
| Veld | Type | Beschrijving |
|------|------|-------------|
| id | String (UUID) | Primaire sleutel |
| logId | String | FK → RecognitionLog |
| brand | String | Gedetecteerd merk |
| confidence | Float | Confidence score |
| x | Float | Bbox X |
| y | Float | Bbox Y |
| width | Float | Bbox breedte |
| height | Float | Bbox hoogte |

### FeedbackEntry
| Veld | Type | Beschrijving |
|------|------|-------------|
| id | String (UUID) | Primaire sleutel |
| logId | String | FK → RecognitionLog |
| isCorrect | Boolean | Klopt de detectie? |
| incorporated | Boolean | Verwerkt in training data? |
| incorporatedAt | DateTime? | Verwerkingstijdstip |
| userId | String | FK → User |
| createdAt | DateTime | Tijdstip |

---

## Enums

### TrainingStatus
`UPLOADING` → `PROCESSING` → `ANNOTATING` → `TRAINING` → `COMPLETED` | `FAILED`

### UserRole
`ADMIN` | `USER` | `VIEWER`

---

## Relatie Diagram

```
Organization ──1:N──→ User
User ──1:N──→ LogoImage (uploader)
User ──1:N──→ Annotation (creator)
User ──1:N──→ FeedbackEntry

Logo ──1:N──→ Annotation
Logo ──1:N──→ LogoEmbedding

LogoImage ──1:N──→ Annotation
LogoImage ──1:N──→ TrainingData

TrainingBatch ──1:N──→ Annotation
TrainingBatch ──1:1──→ ModelVersion

RecognitionLog ──1:N──→ RecognitionResult
RecognitionLog ──1:N──→ FeedbackEntry

ModelVersion ──1:N──→ LogoEmbedding
```

---

## Vector Search

De `LogoEmbedding` tabel gebruikt PostgreSQL pgvector extensie:
- **Dimensie:** 512
- **Index:** IVFFlat voor approximate nearest neighbor search
- **Operator:** `embedding <=> vector` (cosine distance)
- **Gebruik:** Logo matching bij herkenning — vergelijk input embedding met opgeslagen embeddings
