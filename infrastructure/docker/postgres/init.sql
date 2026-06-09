-- PostgreSQL initialization script
-- STORY-001: Database Infrastructure with Monitoring

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Create schemas
CREATE SCHEMA IF NOT EXISTS logos;
CREATE SCHEMA IF NOT EXISTS monitoring;

-- Create main logos table with vector embeddings
CREATE TABLE IF NOT EXISTS logos.logo_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename VARCHAR(255) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    embedding vector(512),
    metadata JSONB DEFAULT '{}',
    brand_name VARCHAR(255),
    confidence_score FLOAT,
    detected_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX idx_logo_images_embedding ON logos.logo_images
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_logo_images_brand_name ON logos.logo_images
    USING gin (brand_name gin_trgm_ops);

CREATE INDEX idx_logo_images_metadata ON logos.logo_images
    USING gin (metadata);

CREATE INDEX idx_logo_images_created_at ON logos.logo_images (created_at DESC);

-- Create training data table
CREATE TABLE IF NOT EXISTS logos.training_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id UUID REFERENCES logos.logo_images(id) ON DELETE CASCADE,
    label VARCHAR(255) NOT NULL,
    confidence FLOAT,
    validated BOOLEAN DEFAULT FALSE,
    holdout BOOLEAN DEFAULT FALSE,
    validation_date TIMESTAMP WITH TIME ZONE,
    validated_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for holdout filtering (Epic 7: protected evaluation set)
CREATE INDEX IF NOT EXISTS idx_training_data_holdout ON logos.training_data (holdout);

-- Create model versions table
CREATE TABLE IF NOT EXISTS logos.model_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(50) NOT NULL UNIQUE,
    model_type VARCHAR(100) NOT NULL,
    accuracy FLOAT,
    precision_score FLOAT,
    recall_score FLOAT,
    f1_score FLOAT,
    training_date TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT FALSE,
    config JSONB DEFAULT '{}',
    metrics JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reference keurmerk library (Epic 7, Story 7.3)
-- Curated official keurmerk artwork + variants; soft delete via active flag.
CREATE TABLE IF NOT EXISTS logos.reference_logos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    t3777_code VARCHAR(100) NOT NULL,
    variant_label VARCHAR(100) NOT NULL,
    source TEXT,
    storage_path VARCHAR(500) NOT NULL,
    -- Story 12.1: GS1-veldtype (ACCREDITATION | DIET | NUTRITIONAL | GHS_SYMBOL | CONSUMER_USAGE)
    field_type VARCHAR(30) NOT NULL DEFAULT 'ACCREDITATION',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    logo_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (t3777_code, variant_label)
);

-- Index for per-code lookups in the reference library
CREATE INDEX IF NOT EXISTS idx_reference_logos_t3777_code ON logos.reference_logos (t3777_code);

-- Reference keurmerk embeddings (Epic 8, Story 8.4)
-- One embedding per active reference variant, used for crop classification via
-- pgvector cosine. Deliberately SEPARATE from logo_embeddings: (a) reference
-- embeddings are model-independent (no model_id), (b) sharing logo_embeddings
-- would pollute find_similar_logos with reference artwork as search results.
CREATE TABLE IF NOT EXISTS logos.reference_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_logo_id UUID NOT NULL REFERENCES logos.reference_logos(id) ON DELETE CASCADE,
    embedding vector(512),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ivfflat cosine index, mirroring logo_images.embedding
CREATE INDEX IF NOT EXISTS idx_reference_embeddings_embedding ON logos.reference_embeddings
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_reference_embeddings_ref_id ON logos.reference_embeddings (reference_logo_id);

-- Create search history table for analytics
CREATE TABLE IF NOT EXISTS logos.search_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_vector vector(512),
    results_count INTEGER,
    search_time_ms FLOAT,
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create monitoring tables
CREATE TABLE IF NOT EXISTS monitoring.query_stats (
    id SERIAL PRIMARY KEY,
    query_hash VARCHAR(64),
    query_text TEXT,
    execution_count BIGINT DEFAULT 0,
    total_time_ms FLOAT DEFAULT 0,
    mean_time_ms FLOAT DEFAULT 0,
    max_time_ms FLOAT DEFAULT 0,
    last_executed TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monitoring.health_checks (
    id SERIAL PRIMARY KEY,
    service_name VARCHAR(100),
    status VARCHAR(20),
    response_time_ms FLOAT,
    details JSONB DEFAULT '{}',
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create backup tracking table
CREATE TABLE IF NOT EXISTS monitoring.backup_history (
    id SERIAL PRIMARY KEY,
    backup_type VARCHAR(50),
    backup_path VARCHAR(500),
    size_bytes BIGINT,
    duration_seconds FLOAT,
    status VARCHAR(20),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create functions for monitoring
CREATE OR REPLACE FUNCTION monitoring.update_query_stats()
RETURNS void AS $$
BEGIN
    INSERT INTO monitoring.query_stats (query_hash, query_text, execution_count, total_time_ms, mean_time_ms, max_time_ms)
    SELECT
        md5(query) as query_hash,
        query,
        calls,
        total_exec_time,
        mean_exec_time,
        max_exec_time
    FROM pg_stat_statements
    WHERE mean_exec_time > 10
    ON CONFLICT (query_hash) DO UPDATE
    SET
        execution_count = EXCLUDED.execution_count,
        total_time_ms = EXCLUDED.total_time_ms,
        mean_time_ms = EXCLUDED.mean_time_ms,
        max_time_ms = EXCLUDED.max_time_ms,
        last_executed = NOW();
END;
$$ LANGUAGE plpgsql;

-- Create function for vector similarity search
CREATE OR REPLACE FUNCTION logos.similarity_search(
    query_embedding vector(512),
    limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    filename VARCHAR,
    brand_name VARCHAR,
    distance FLOAT,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        l.id,
        l.filename,
        l.brand_name,
        l.embedding <=> query_embedding AS distance,
        l.metadata
    FROM logos.logo_images l
    WHERE l.embedding IS NOT NULL
    ORDER BY l.embedding <=> query_embedding
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_logo_images_updated_at
    BEFORE UPDATE ON logos.logo_images
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create materialized view for performance metrics
CREATE MATERIALIZED VIEW monitoring.performance_metrics AS
SELECT
    DATE_TRUNC('hour', created_at) as hour,
    COUNT(*) as search_count,
    AVG(search_time_ms) as avg_search_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY search_time_ms) as p95_search_time,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY search_time_ms) as p99_search_time
FROM logos.search_history
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at);

-- Create index on materialized view
CREATE UNIQUE INDEX idx_performance_metrics_hour ON monitoring.performance_metrics (hour);

-- ============================================
-- ARTWORK PIPELINE TABLES (Epic 8)
-- ============================================

-- Artwork import runs (Epic 8, Story 8.1)
CREATE TABLE IF NOT EXISTS logos.artwork_import_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    gtins JSONB NOT NULL DEFAULT '[]',
    imported_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    heartbeat_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artwork_import_runs_status ON logos.artwork_import_runs (status);
CREATE INDEX IF NOT EXISTS idx_artwork_import_runs_created_at ON logos.artwork_import_runs (created_at DESC);

-- Artwork import items (Epic 8, Story 8.1)
CREATE TABLE IF NOT EXISTS logos.artwork_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gtin VARCHAR(50) NOT NULL,
    gln VARCHAR(50),
    media_id VARCHAR(255) NOT NULL,
    file_name VARCHAR(500) NOT NULL,
    source_location VARCHAR(1000) NOT NULL,
    sha256_hash VARCHAR(64),
    storage_path VARCHAR(1000),
    mime_type VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'imported',
    failure_reason TEXT,
    import_run_id UUID NOT NULL REFERENCES logos.artwork_import_runs(id) ON DELETE CASCADE,
    pages JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (media_id)
);

CREATE INDEX IF NOT EXISTS idx_artwork_imports_gtin ON logos.artwork_imports (gtin);
CREATE INDEX IF NOT EXISTS idx_artwork_imports_import_run_id ON logos.artwork_imports (import_run_id);
CREATE INDEX IF NOT EXISTS idx_artwork_imports_status ON logos.artwork_imports (status);

-- Artwork review items for crosscheck routing (Epic 8, Story 8.5)
CREATE TABLE IF NOT EXISTS logos.artwork_review_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gtin VARCHAR(50) NOT NULL,
    t3777_code VARCHAR(100) NOT NULL,
    crop_path VARCHAR(1000),
    bbox JSONB NOT NULL DEFAULT '{}',
    confidence FLOAT,
    method VARCHAR(50),
    reason TEXT NOT NULL,
    source_file VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artwork_review_items_gtin ON logos.artwork_review_items (gtin);
CREATE INDEX IF NOT EXISTS idx_artwork_review_items_status ON logos.artwork_review_items (status);
CREATE INDEX IF NOT EXISTS idx_artwork_review_items_t3777_code ON logos.artwork_review_items (t3777_code);

-- TrainingData extensions (Epic 8, Story 8.6)
-- Add provenance, active and crop_path columns if they don't exist
ALTER TABLE logos.training_data
    ADD COLUMN IF NOT EXISTS provenance JSONB NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS crop_path VARCHAR(1000);

CREATE INDEX IF NOT EXISTS idx_training_data_active ON logos.training_data (active);
CREATE INDEX IF NOT EXISTS idx_training_data_provenance ON logos.training_data USING GIN (provenance jsonb_path_ops);

-- =============================================================================
-- Epic 9, Story 9.2: Retraining notifications (migration 0007)
-- =============================================================================
CREATE TABLE IF NOT EXISTS logos.retraining_notifications (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    trigger_id  VARCHAR(128) NOT NULL,
    reasons     TEXT[]      NOT NULL DEFAULT '{}',
    status      VARCHAR(20) NOT NULL DEFAULT 'unread',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at     TIMESTAMPTZ,

    CONSTRAINT retraining_notifications_pkey PRIMARY KEY (id),
    CONSTRAINT retraining_notifications_trigger_id_key UNIQUE (trigger_id)
);

CREATE INDEX IF NOT EXISTS idx_retraining_notifications_status_created
    ON logos.retraining_notifications (status, created_at DESC);

-- =============================================================================
-- Epic 9, Story 9.5: Model activation audit log (migration 0008)
-- =============================================================================
CREATE TABLE IF NOT EXISTS logos.model_activation_logs (
    id               UUID        NOT NULL DEFAULT gen_random_uuid(),
    model_version_id UUID        NOT NULL,
    user_id          VARCHAR(255) NOT NULL,
    activated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    triggered_by     VARCHAR(50) NOT NULL,
    batch_id         UUID,

    CONSTRAINT model_activation_logs_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_model_activation_logs_model_version_id
    ON logos.model_activation_logs (model_version_id);
CREATE INDEX IF NOT EXISTS idx_model_activation_logs_activated_at
    ON logos.model_activation_logs (activated_at DESC);

-- Grant permissions
GRANT ALL PRIVILEGES ON SCHEMA logos TO postgres;
GRANT ALL PRIVILEGES ON SCHEMA monitoring TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA logos TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA monitoring TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA logos TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA monitoring TO postgres;

-- Production deploy: also grant to logorecognition app user
-- GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE logos.artwork_import_runs TO logorecognition;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE logos.artwork_imports TO logorecognition;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE logos.artwork_review_items TO logorecognition;
-- Epic 9 tables:
GRANT SELECT, INSERT, UPDATE ON TABLE logos.retraining_notifications TO logorecognition;
GRANT SELECT, INSERT ON TABLE logos.model_activation_logs TO logorecognition;

-- Insert initial model version
INSERT INTO logos.model_versions (version, model_type, is_active)
VALUES ('1.0.0', 'EfficientDet-D4', true)
ON CONFLICT (version) DO NOTHING;