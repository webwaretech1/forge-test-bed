-- Migration: Create scores table for arcade game leaderboards
-- This creates the core scores table with proper indexing for efficient leaderboard queries

-- Enable UUID extension for auto-generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create the scores table
CREATE TABLE scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_name VARCHAR(10) NOT NULL,
    game_slug VARCHAR(50) NOT NULL,
    score INTEGER NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for efficient leaderboard queries (game_slug, score DESC)
-- This supports queries like "top scores for a specific game"
CREATE INDEX idx_scores_leaderboard ON scores (game_slug, score DESC);

-- Add check constraint to ensure score is not negative
ALTER TABLE scores ADD CONSTRAINT chk_score_non_negative CHECK (score >= 0);