-- Migration: Add replay verification hash to scores table.
-- Existing rows are preserved and replay_hash defaults to NULL.

ALTER TABLE scores
ADD COLUMN IF NOT EXISTS replay_hash VARCHAR(64) DEFAULT NULL;
