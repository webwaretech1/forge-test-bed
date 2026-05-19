-- Migration: Add replay verification support to scores
-- Must preserve existing rows and set replay_hash default to NULL.

ALTER TABLE scores
ADD COLUMN replay_hash VARCHAR(64) DEFAULT NULL;
