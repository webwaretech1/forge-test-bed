-- Migration: Add replay verification to scores table
-- This adds the replay_hash column to support game replay verification

-- Add replay_hash column with default value of NULL
-- This ensures existing records remain intact
ALTER TABLE scores ADD COLUMN replay_hash VARCHAR(64) DEFAULT NULL;