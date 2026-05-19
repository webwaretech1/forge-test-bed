-- Migration: Create scores table for arcade game leaderboards
-- This creates the core scores table with proper indexing for efficient leaderboard queries

-- Enable UUID extension for auto-generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create the scores table
CREATE TABLE scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_name VARCHAR(50) NOT NULL,
    game_slug VARCHAR(50) NOT NULL,
    score BIGINT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    replay_hash VARCHAR(64) DEFAULT NULL
);

-- Create unique index for efficient leaderboard queries (game_slug, score DESC, timestamp ASC)
-- This supports queries like "top scores for a specific game" with deterministic tie-breaking
CREATE UNIQUE INDEX idx_scores_leaderboard ON scores (game_slug, score DESC, timestamp ASC);

-- Add check constraint to ensure score is not negative
ALTER TABLE scores ADD CONSTRAINT chk_score_non_negative CHECK (score >= 0);