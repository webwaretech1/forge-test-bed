# Database Schema for Arcade Game Scores

This directory contains PostgreSQL migrations and tests for the arcade game scores system.

## Files

- `migrations/001_create_scores_table.sql` - Creates the complete scores table with leaderboard index
- `migrations/002_add_replay_verification.sql` - (Legacy file, replay_hash now included in 001)
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
| `replay_hash` | VARCHAR(64) | DEFAULT NULL | Hash for replay verification |

### Indexes

- `idx_scores_leaderboard` - Non-unique composite index on `(game_slug, score DESC)` for efficient leaderboard queries.

## Usage

### Running Migrations

```sql
-- Run the migration
\i migrations/001_create_scores_table.sql
```

### Testing

```sql
-- Run all acceptance criteria tests
\i test_acceptance_criteria.sql
```

### Example Queries

```sql
-- Get top 3 scores for a specific game
SELECT player_name, score
FROM scores
WHERE game_slug = 'pac-man'
ORDER BY score DESC
LIMIT 3;

-- Get a player's personal bests across all games
SELECT game_slug, MAX(score) as best_score
FROM scores
WHERE player_name = 'ALICE'
GROUP BY game_slug;

-- Insert a new score with replay verification
INSERT INTO scores (player_name, game_slug, score, replay_hash)
VALUES ('PLAYER1', 'galaga', 125000, 'hash123');
```

## Constraints

- Player names are limited to 10 characters maximum
- Game slugs are limited to 50 characters maximum
- Scores must be non-negative integers
- Game slug and player name are required (NOT NULL)
- Replay hashes are optional and limited to 64 characters
