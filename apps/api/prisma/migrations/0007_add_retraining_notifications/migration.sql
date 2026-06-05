-- Migration: 0007_add_retraining_notifications
-- Epic 9, Story 9.2: persistent retraining trigger notifications
-- Ensures offline data managers never miss a trigger (Socket.IO is volatile).

CREATE TABLE retraining_notifications (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    trigger_id  VARCHAR(128) NOT NULL,
    reasons     TEXT[]      NOT NULL DEFAULT '{}',
    status      VARCHAR(20) NOT NULL DEFAULT 'unread',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at     TIMESTAMPTZ,

    CONSTRAINT retraining_notifications_pkey PRIMARY KEY (id),
    CONSTRAINT retraining_notifications_trigger_id_key UNIQUE (trigger_id)
);

CREATE INDEX retraining_notifications_status_created_at_idx
    ON retraining_notifications (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON TABLE retraining_notifications TO logorecognition;
