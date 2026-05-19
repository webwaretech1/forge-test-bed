import test from 'node:test';
import assert from 'node:assert/strict';
import { ScoreValidationService } from './index.ts';

test('valid submission passes and returns score id', () => {
  const service = new ScoreValidationService(() => 'xyz789');

  const result = service.postScore({
    game: 'pac-man',
    playerName: 'ALICE',
    score: 245680,
    playDuration: 180,
    replayHash: 'abc123def',
  });

  assert.deepEqual(result, { valid: true, scoreId: 'xyz789' });
});

test('submission exceeding maximum fails with SCORE_EXCEEDS_MAXIMUM', () => {
  const service = new ScoreValidationService();

  const result = service.postScore({
    game: 'pac-man',
    playerName: 'CHEATER',
    score: 4000000,
    playDuration: 300,
    replayHash: 'def456ghi',
  });

  assert.deepEqual(result, {
    valid: false,
    error: 'SCORE_EXCEEDS_MAXIMUM',
    message: 'Score 4000000 exceeds maximum possible for pac-man',
    maxScore: 3333360,
  });
});

test('submission with insufficient play duration fails', () => {
  const service = new ScoreValidationService();

  const result = service.postScore({
    game: 'galaga',
    playerName: 'SPEEDSTER',
    score: 50000,
    playDuration: 15,
    replayHash: 'ghi789jkl',
  });

  assert.deepEqual(result, {
    valid: false,
    error: 'INSUFFICIENT_PLAY_TIME',
    message: 'Play duration 15 seconds is below minimum required',
    minDuration: 30,
  });
});

test('duplicate score submission within 60 seconds fails with remaining cooldown', () => {
  const service = new ScoreValidationService(() => 'score-one');
  const start = 1_000_000;

  service.postScore(
    {
      game: 'space-invaders',
      playerName: 'ALICE',
      score: 125000,
      playDuration: 120,
      replayHash: 'jkl012mno',
    },
    start,
  );

  const result = service.postScore(
    {
      game: 'space-invaders',
      playerName: 'ALICE',
      score: 125000,
      playDuration: 120,
      replayHash: 'another-hash',
    },
    start + 45_000,
  );

  assert.deepEqual(result, {
    valid: false,
    error: 'DUPLICATE_SUBMISSION',
    message: 'Same score already submitted within 60 seconds',
    cooldownRemaining: 15,
  });
});

test('replay hash reused by any submission fails and returns conflicting submission id', () => {
  const service = new ScoreValidationService(() => 'scoreId123');

  service.postScore({
    game: 'pac-man',
    playerName: 'ALICE',
    score: 245680,
    playDuration: 180,
    replayHash: 'abc123def',
  });

  const result = service.postScore({
    game: 'pac-man',
    playerName: 'BOB',
    score: 180000,
    playDuration: 200,
    replayHash: 'abc123def',
  });

  assert.deepEqual(result, {
    valid: false,
    error: 'REPLAY_HASH_EXISTS',
    message: 'Replay hash already used',
    conflictingSubmission: 'scoreId123',
  });
});

test('missing replay hash fails with MISSING_REPLAY_HASH', () => {
  const service = new ScoreValidationService();

  const result = service.postScore({
    game: 'galaga',
    playerName: 'CAROL',
    score: 95000,
    playDuration: 150,
  });

  assert.deepEqual(result, {
    valid: false,
    error: 'MISSING_REPLAY_HASH',
    message: 'Replay hash is required for score validation',
  });
});

test('unsupported game fails and returns supported games', () => {
  const service = new ScoreValidationService();

  const result = service.postScore({
    game: 'unknown-game',
    playerName: 'DAVE',
    score: 1000,
    playDuration: 60,
    replayHash: 'mno345pqr',
  });

  assert.deepEqual(result, {
    valid: false,
    error: 'UNSUPPORTED_GAME',
    message: 'Game unknown-game not supported',
    supportedGames: ['pac-man', 'space-invaders', 'galaga'],
  });
});
