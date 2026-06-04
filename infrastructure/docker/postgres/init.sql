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
    active BOOLEAN NOT NULL DEFAULT TRUE,
    logo_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (t3777_code, variant_label)
);

-- Index for per-code lookups in the reference library
CREATE INDEX IF NOT EXISTS idx_reference_logos_t3777_code ON logos.reference_logos (t3777_code);

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

-- Grant permissions
GRANT ALL PRIVILEGES ON SCHEMA logos TO postgres;
GRANT ALL PRIVILEGES ON SCHEMA monitoring TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA logos TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA monitoring TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA logos TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA monitoring TO postgres;

-- Insert initial model version
INSERT INTO logos.model_versions (version, model_type, is_active)
VALUES ('1.0.0', 'EfficientDet-D4', true)
ON CONFLICT (version) DO NOTHING;