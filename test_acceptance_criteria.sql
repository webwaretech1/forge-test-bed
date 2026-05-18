-- Test script to verify all acceptance criteria for arcade scores schema
-- This script tests all the scenarios mentioned in the GitHub issue

-- Test 1: Verify table structure after first migration
\echo 'Testing table structure...'
\d scores

-- Test 2: Insert a score record with auto-generated UUID
\echo 'Testing score insertion with auto-generated UUID...'
INSERT INTO scores (player_name, game_slug, score, timestamp, replay_hash)
VALUES ('ALICE', 'pac-man', 245680, '2026-05-18 14:30:00+00', 'abc123def456');

-- Verify the record was inserted with a UUID
SELECT id, player_name, game_slug, score, timestamp, replay_hash FROM scores WHERE player_name = 'ALICE';

-- Test 3: Insert multiple scores for leaderboard testing
\echo 'Setting up test data for leaderboard queries...'
INSERT INTO scores (player_name, game_slug, score, timestamp) VALUES
('BOB', 'pac-man', 350000, '2026-05-18 13:00:00+00'),
('CHARLIE', 'pac-man', 280000, '2026-05-18 12:00:00+00'),
('DAVE', 'galaga', 125000, '2026-05-18 11:00:00+00'),
('EVE', 'galaga', 98000, '2026-05-18 10:00:00+00');

-- Test 4: Query top 3 Pac-Man scores (should return exactly 3 rows ordered by highest score)
\echo 'Testing leaderboard query for pac-man...'
SELECT player_name, score FROM scores WHERE game_slug = 'pac-man' ORDER BY score DESC LIMIT 3;

-- Test 5: Add more scores for ALICE to test personal best query
\echo 'Adding more scores for ALICE...'
INSERT INTO scores (player_name, game_slug, score, timestamp) VALUES
('ALICE', 'galaga', 125000, '2026-05-18 09:00:00+00'),
('ALICE', 'space-invaders', 89000, '2026-05-18 08:00:00+00');

-- Test 6: Query ALICE's personal best for each game
\echo 'Testing personal best query for ALICE...'
SELECT game_slug, MAX(score) as best_score FROM scores WHERE player_name = 'ALICE' GROUP BY game_slug;

-- Test 7: Test constraint violations
\echo 'Testing constraint violations...'

-- Test player name exceeding 10 characters (should fail)
\echo 'Testing player name length constraint (should fail)...'
\set ON_ERROR_STOP off
INSERT INTO scores (player_name, game_slug, score) VALUES ('VERYLONGNAME', 'pac-man', 50000);
\set ON_ERROR_STOP on

-- Test NULL game_slug (should fail)
\echo 'Testing NOT NULL constraint on game_slug (should fail)...'
\set ON_ERROR_STOP off
INSERT INTO scores (player_name, game_slug, score) VALUES ('ALICE', null, 50000);
\set ON_ERROR_STOP on

-- Test 8: Verify index exists
\echo 'Checking indexes...'
\di+ idx_scores_leaderboard

-- Test 9: Show final table state
\echo 'Final table contents:'
SELECT * FROM scores ORDER BY game_slug, score DESC;