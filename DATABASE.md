# Database Schema for Arcade Game Scores

This directory contains PostgreSQL migrations and tests for the arcade game scores system.

## Files

- `migrations/001_create_scores_table.sql` - Creates the main scores table with proper indexing
- `migrations/002_add_replay_verification.sql` - Adds replay verification support  
- `test_acceptance_criteria.sql` - Test script that verifies all acceptance criteria

## Schema

### Scores Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Auto-generated unique identifier |
| `player_name` | VARCHAR(10) | NOT NULL | Player name (max 10 characters) |
| `game_slug` | VARCHAR(50) | NOT NULL | Game identifier |
| `score` | INTEGER | NOT NULL, >= 0 | Player's score |
| `timestamp` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | When the score was achieved |
| `replay_hash` | VARCHAR(64) | DEFAULT NULL | Hash for replay verification (added in migration 002) |

### Indexes

- `idx_scores_leaderboard` - Composite index on `(game_slug, score DESC)` for efficient leaderboard queries

## Usage

### Running Migrations

```sql
-- Run the first migration to create the table
\i migrations/001_create_scores_table.sql

-- Run the second migration to add replay verification
\i migrations/002_add_replay_verification.sql
```

### Testing

```sql
-- Run all acceptance criteria tests
\i test_acceptance_criteria.sql
```

### Example Queries

```sql
-- Get top 10 scores for a specific game
SELECT player_name, score, timestamp 
FROM scores 
WHERE game_slug = 'pac-man' 
ORDER BY score DESC 
LIMIT 10;

-- Get a player's personal bests across all games
SELECT game_slug, MAX(score) as best_score 
FROM scores 
WHERE player_name = 'ALICE' 
GROUP BY game_slug;

-- Insert a new score
INSERT INTO scores (player_name, game_slug, score, replay_hash) 
VALUES ('PLAYER1', 'galaga', 125000, 'hash123');
```

## Constraints

- Player names are limited to 10 characters maximum
- Game slugs are limited to 50 characters maximum  
- Scores must be non-negative integers
- Game slug and player name are required (NOT NULL)
- Replay hashes are optional and limited to 64 characters