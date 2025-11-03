# 9. Database Schema

## 9.1 SQL Schema

```sql
-- Core tables
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    organization_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE training_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'uploading',
    file_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES training_batches(id),
    filename VARCHAR(255),
    s3_key VARCHAR(500),
    width INTEGER,
    height INTEGER,
    file_size_bytes BIGINT,
    image_hash VARCHAR(64),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE logos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(100) NOT NULL,
    value VARCHAR(100) NOT NULL,
    confidence_threshold FLOAT DEFAULT 0.99,
    training_samples INTEGER DEFAULT 0,
    accuracy FLOAT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, value)
);

CREATE TABLE annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id UUID REFERENCES images(id),
    logo_id UUID REFERENCES logos(id),
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    confidence FLOAT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ML-specific tables
CREATE TABLE models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255),
    version INTEGER DEFAULT 1,
    accuracy FLOAT,
    training_samples INTEGER,
    model_path VARCHAR(500),
    status VARCHAR(50) DEFAULT 'training',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

CREATE TABLE logo_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    logo_id UUID REFERENCES logos(id),
    model_id UUID REFERENCES models(id),
    embedding vector(768),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE recognition_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    model_id UUID REFERENCES models(id),
    request_id VARCHAR(100),
    image_hash VARCHAR(64),
    detections JSONB,
    confidence_threshold FLOAT,
    processing_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Feedback and learning tables
CREATE TABLE feedback_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recognition_log_id UUID REFERENCES recognition_logs(id),
    predicted_logo_id UUID REFERENCES logos(id),
    confidence FLOAT,
    correct_logo_id UUID REFERENCES logos(id),
    validated_by UUID REFERENCES users(id),
    validated_at TIMESTAMP,
    incorporated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_annotations_image ON annotations(image_id);
CREATE INDEX idx_annotations_logo ON annotations(logo_id);
CREATE INDEX idx_embeddings_logo ON logo_embeddings(logo_id);
CREATE INDEX idx_embeddings_vector ON logo_embeddings
    USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_recognition_logs_user ON recognition_logs(user_id);
CREATE INDEX idx_recognition_logs_hash ON recognition_logs(image_hash);
CREATE INDEX idx_feedback_queue_status ON feedback_queue(incorporated);
```

---
