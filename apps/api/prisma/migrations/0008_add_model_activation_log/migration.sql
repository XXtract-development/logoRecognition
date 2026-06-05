-- Migration: 0008_add_model_activation_log
-- Epic 9, Story 9.5: audit log for human-approved model activations
-- Records who activated a model and when (NFR6, FR60-voorloper).

CREATE TABLE model_activation_logs (
    id               UUID        NOT NULL DEFAULT gen_random_uuid(),
    model_version_id UUID        NOT NULL,
    user_id          VARCHAR(255) NOT NULL,
    activated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    triggered_by     VARCHAR(50) NOT NULL,
    batch_id         UUID,

    CONSTRAINT model_activation_logs_pkey PRIMARY KEY (id)
);

CREATE INDEX model_activation_logs_model_version_id_idx
    ON model_activation_logs (model_version_id);

CREATE INDEX model_activation_logs_activated_at_idx
    ON model_activation_logs (activated_at DESC);

GRANT SELECT, INSERT ON TABLE model_activation_logs TO logorecognition;
