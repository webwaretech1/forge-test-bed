-- Migration: Create base scores table for arcade game leaderboards
-- This creates the core table and leaderboard index.

-- Enable UUID extension for auto-generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create the base scores table (without replay_hash; added in 002)
CREATE TABLE scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_name VARCHAR(10) NOT NULL,
    game_slug VARCHAR(50) NOT NULL,
    score INTEGER NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Required leaderboard index
CREATE UNIQUE INDEX idx_scores_leaderboard ON scores (game_slug, score DESC);

-- Ensure score is not negative.
ALTER TABLE scores ADD CONSTRAINT chk_score_non_negative CHECK (score >= 0);
