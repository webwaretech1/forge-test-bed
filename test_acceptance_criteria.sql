-- Test script to verify acceptance criteria for arcade scores schema

\set ON_ERROR_STOP on

-- Deterministic setup.
DROP TABLE IF EXISTS scores;
DROP EXTENSION IF EXISTS "uuid-ossp";

-- Phase 1: run 001 and verify base schema.
\i migrations/001_create_scores_table.sql

DO $$
DECLARE
    missing_columns INTEGER;
BEGIN
    SELECT COUNT(*) INTO missing_columns
    FROM (
        VALUES
            ('id', 'uuid'),
            ('player_name', 'character varying'),
            ('game_slug', 'character varying'),
            ('score', 'integer'),
            ('timestamp', 'timestamp with time zone')
    ) AS expected(column_name, data_type)
    LEFT JOIN information_schema.columns c
      ON c.table_name = 'scores'
     AND c.column_name = expected.column_name
     AND c.data_type = expected.data_type
    WHERE c.column_name IS NULL;

    IF missing_columns <> 0 THEN
        RAISE EXCEPTION 'Missing or incorrect required base columns in scores table after 001';
    END IF;
END $$;

DO $$
DECLARE
    replay_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'scores' AND column_name = 'replay_hash'
    ) INTO replay_exists;

    IF replay_exists THEN
        RAISE EXCEPTION 'replay_hash must not exist before running 002';
    END IF;
END $$;

DO $$
DECLARE
    player_len INTEGER;
    slug_len INTEGER;
BEGIN
    SELECT character_maximum_length INTO player_len
    FROM information_schema.columns
    WHERE table_name = 'scores' AND column_name = 'player_name';

    SELECT character_maximum_length INTO slug_len
    FROM information_schema.columns
    WHERE table_name = 'scores' AND column_name = 'game_slug';

    IF player_len <> 10 THEN
        RAISE EXCEPTION 'player_name length mismatch: expected 10, got %', player_len;
    END IF;

    IF slug_len <> 50 THEN
        RAISE EXCEPTION 'game_slug length mismatch: expected 50, got %', slug_len;
    END IF;
END $$;

-- Add seed data before 002 to verify existing rows remain intact.
INSERT INTO scores (player_name, game_slug, score, timestamp) VALUES
('ALICE', 'pac-man', 245680, '2026-05-18 14:30:00+00'),
('BOB', 'pac-man', 350000, '2026-05-18 13:00:00+00'),
('CHARLIE', 'pac-man', 280000, '2026-05-18 12:00:00+00'),
('DAVE', 'galaga', 124000, '2026-05-18 11:00:00+00'),
('EVE', 'galaga', 98000, '2026-05-18 10:00:00+00'),
('ALICE', 'galaga', 125000, '2026-05-18 09:00:00+00'),
('ALICE', 'space-invaders', 89000, '2026-05-18 08:00:00+00');

-- Phase 2: run 002 and verify replay_hash behavior + data preservation.
\i migrations/002_add_replay_verification.sql

DO $$
DECLARE
    row_count INTEGER;
    replay_len INTEGER;
    null_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO row_count FROM scores;
    IF row_count <> 7 THEN
        RAISE EXCEPTION 'Expected existing rows to remain after 002, got % rows', row_count;
    END IF;

    SELECT character_maximum_length INTO replay_len
    FROM information_schema.columns
    WHERE table_name = 'scores' AND column_name = 'replay_hash';

    IF replay_len <> 64 THEN
        RAISE EXCEPTION 'replay_hash length mismatch: expected 64, got %', replay_len;
    END IF;

    SELECT COUNT(*) INTO null_count FROM scores WHERE replay_hash IS NULL;
    IF null_count <> 7 THEN
        RAISE EXCEPTION 'Expected replay_hash default NULL for existing rows';
    END IF;
END $$;

-- Insert with replay_hash and verify UUID auto-generation.
INSERT INTO scores (player_name, game_slug, score, timestamp, replay_hash)
VALUES ('ALICE', 'pac-man', 245679, '2026-05-18 14:31:00+00', 'abc123def456');

DO $$
DECLARE
    row_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO row_count
    FROM scores
    WHERE player_name = 'ALICE'
      AND game_slug = 'pac-man'
      AND score = 245679
      AND replay_hash = 'abc123def456'
      AND id IS NOT NULL;

    IF row_count <> 1 THEN
        RAISE EXCEPTION 'Expected inserted ALICE row with replay_hash and non-null UUID';
    END IF;
END $$;

-- Leaderboard query assertions.
DO $$
DECLARE
    top_players TEXT[];
    top_scores INTEGER[];
BEGIN
    SELECT ARRAY_AGG(player_name ORDER BY score DESC),
           ARRAY_AGG(score ORDER BY score DESC)
      INTO top_players, top_scores
    FROM (
        SELECT player_name, score
        FROM scores
        WHERE game_slug = 'pac-man'
        ORDER BY score DESC
        LIMIT 3
    ) ranked;

    IF array_length(top_players, 1) <> 3 THEN
        RAISE EXCEPTION 'Expected exactly 3 pac-man leaderboard rows';
    END IF;

    IF top_players <> ARRAY['BOB', 'CHARLIE', 'ALICE'] THEN
        RAISE EXCEPTION 'Unexpected pac-man leaderboard players: %', top_players;
    END IF;

    IF top_scores <> ARRAY[350000, 280000, 245680] THEN
        RAISE EXCEPTION 'Unexpected pac-man leaderboard scores: %', top_scores;
    END IF;
END $$;

-- Personal-best query assertions.
DO $$
DECLARE
    game_count INTEGER;
    wrong_rows INTEGER;
BEGIN
    SELECT COUNT(*) INTO game_count
    FROM (
        SELECT game_slug, MAX(score) AS best_score
        FROM scores
        WHERE player_name = 'ALICE'
        GROUP BY game_slug
    ) pb;

    IF game_count <> 3 THEN
        RAISE EXCEPTION 'Expected 3 personal-best rows for ALICE, got %', game_count;
    END IF;

    SELECT COUNT(*) INTO wrong_rows
    FROM (
        SELECT game_slug, MAX(score) AS best_score
        FROM scores
        WHERE player_name = 'ALICE'
        GROUP BY game_slug
    ) pb
    WHERE NOT (
        (game_slug = 'pac-man' AND best_score = 245680) OR
        (game_slug = 'galaga' AND best_score = 125000) OR
        (game_slug = 'space-invaders' AND best_score = 89000)
    );

    IF wrong_rows <> 0 THEN
        RAISE EXCEPTION 'ALICE personal best values are incorrect';
    END IF;
END $$;

-- Index assertion for required unique index shape.
DO $$
DECLARE
    idx_def TEXT;
BEGIN
    SELECT indexdef INTO idx_def
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'scores'
      AND indexname = 'idx_scores_leaderboard';

    IF idx_def IS NULL THEN
        RAISE EXCEPTION 'Leaderboard index idx_scores_leaderboard is missing';
    END IF;

    IF idx_def NOT LIKE 'CREATE UNIQUE INDEX idx_scores_leaderboard ON public.scores USING btree (game_slug, score DESC)%' THEN
        RAISE EXCEPTION 'Leaderboard index has wrong definition: %', idx_def;
    END IF;
END $$;

-- Constraint violation: player_name > 10 should fail with truncation error.
DO $$
DECLARE
    name_error BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO scores (player_name, game_slug, score)
        VALUES ('VERYLONGNAME', 'pac-man', 50000);
    EXCEPTION
        WHEN string_data_right_truncation THEN
            name_error := TRUE;
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Unexpected exception type for player_name violation: %', SQLERRM;
    END;

    IF NOT name_error THEN
        RAISE EXCEPTION 'Expected player_name length violation did not occur';
    END IF;

    IF EXISTS (SELECT 1 FROM scores WHERE player_name LIKE 'VERYLONG%') THEN
        RAISE EXCEPTION 'Invalid long player_name row was inserted';
    END IF;
END $$;

-- Constraint violation: NULL game_slug should fail with NOT NULL violation.
DO $$
DECLARE
    slug_error BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO scores (player_name, game_slug, score)
        VALUES ('ALICE', NULL, 50000);
    EXCEPTION
        WHEN not_null_violation THEN
            slug_error := TRUE;
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Unexpected exception type for game_slug violation: %', SQLERRM;
    END;

    IF NOT slug_error THEN
        RAISE EXCEPTION 'Expected NOT NULL violation on game_slug did not occur';
    END IF;

    IF EXISTS (SELECT 1 FROM scores WHERE game_slug IS NULL) THEN
        RAISE EXCEPTION 'Invalid NULL game_slug row was inserted';
    END IF;
END $$;

\echo 'All acceptance criteria assertions passed.'
