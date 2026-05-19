import test from 'node:test';
import assert from 'node:assert/strict';
import { ScoreValidationService, createServer } from './index.ts';
import http from 'node:http';

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

// HTTP API Tests
function makeRequest(server: http.Server, path: string, method: string, data?: any): Promise<{ status: number, body: any }> {
  return new Promise((resolve, reject) => {
    const address = server.address();
    if (!address || typeof address === 'string') {
      reject(new Error('Server address not available'));
      return;
    }

    const options = {
      hostname: 'localhost',
      port: address.port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsedBody = JSON.parse(body);
          resolve({ status: res.statusCode!, body: parsedBody });
        } catch {
          resolve({ status: res.statusCode!, body: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

test('API: valid score submission returns 200 and score id', async () => {
  const service = new ScoreValidationService(() => 'xyz789');
  const server = createServer(service);

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  try {
    const response = await makeRequest(server, '/api/scores', 'POST', {
      game: 'pac-man',
      playerName: 'ALICE',
      score: 245680,
      playDuration: 180,
      replayHash: 'abc123def',
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { valid: true, scoreId: 'xyz789' });
  } finally {
    server.close();
  }
});

test('API: score exceeding maximum returns 400 with error details', async () => {
  const server = createServer();

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  try {
    const response = await makeRequest(server, '/api/scores', 'POST', {
      game: 'pac-man',
      playerName: 'CHEATER',
      score: 4000000,
      playDuration: 300,
      replayHash: 'def456ghi',
    });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      valid: false,
      error: 'SCORE_EXCEEDS_MAXIMUM',
      message: 'Score 4000000 exceeds maximum possible for pac-man',
      maxScore: 3333360,
    });
  } finally {
    server.close();
  }
});

test('API: insufficient play duration returns 400 with error details', async () => {
  const server = createServer();

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  try {
    const response = await makeRequest(server, '/api/scores', 'POST', {
      game: 'galaga',
      playerName: 'SPEEDSTER',
      score: 50000,
      playDuration: 15,
      replayHash: 'ghi789jkl',
    });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      valid: false,
      error: 'INSUFFICIENT_PLAY_TIME',
      message: 'Play duration 15 seconds is below minimum required',
      minDuration: 30,
    });
  } finally {
    server.close();
  }
});

test('API: duplicate submission returns 400 with cooldown remaining', async () => {
  const service = new ScoreValidationService(() => 'score-one');
  const server = createServer(service);

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  try {
    // First submission
    await makeRequest(server, '/api/scores', 'POST', {
      game: 'space-invaders',
      playerName: 'ALICE',
      score: 125000,
      playDuration: 120,
      replayHash: 'jkl012mno',
    });

    // Wait a bit then submit duplicate
    await new Promise(resolve => setTimeout(resolve, 100));

    const response = await makeRequest(server, '/api/scores', 'POST', {
      game: 'space-invaders',
      playerName: 'ALICE',
      score: 125000,
      playDuration: 120,
      replayHash: 'another-hash',
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.valid, false);
    assert.equal(response.body.error, 'DUPLICATE_SUBMISSION');
    assert.equal(response.body.message, 'Same score already submitted within 60 seconds');
    assert(typeof response.body.cooldownRemaining === 'number');
    assert(response.body.cooldownRemaining > 0);
  } finally {
    server.close();
  }
});

test('API: replay hash exists returns 400 with conflicting submission', async () => {
  const service = new ScoreValidationService(() => 'scoreId123');
  const server = createServer(service);

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  try {
    // First submission
    await makeRequest(server, '/api/scores', 'POST', {
      game: 'pac-man',
      playerName: 'ALICE',
      score: 245680,
      playDuration: 180,
      replayHash: 'abc123def',
    });

    // Second submission with same replay hash
    const response = await makeRequest(server, '/api/scores', 'POST', {
      game: 'pac-man',
      playerName: 'BOB',
      score: 180000,
      playDuration: 200,
      replayHash: 'abc123def',
    });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      valid: false,
      error: 'REPLAY_HASH_EXISTS',
      message: 'Replay hash already used',
      conflictingSubmission: 'scoreId123',
    });
  } finally {
    server.close();
  }
});

test('API: missing replay hash returns 400 with error', async () => {
  const server = createServer();

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  try {
    const response = await makeRequest(server, '/api/scores', 'POST', {
      game: 'galaga',
      playerName: 'CAROL',
      score: 95000,
      playDuration: 150,
    });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      valid: false,
      error: 'MISSING_REPLAY_HASH',
      message: 'Replay hash is required for score validation',
    });
  } finally {
    server.close();
  }
});

test('API: unsupported game returns 400 with supported games list', async () => {
  const server = createServer();

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  try {
    const response = await makeRequest(server, '/api/scores', 'POST', {
      game: 'unknown-game',
      playerName: 'DAVE',
      score: 1000,
      playDuration: 60,
      replayHash: 'mno345pqr',
    });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      valid: false,
      error: 'UNSUPPORTED_GAME',
      message: 'Game unknown-game not supported',
      supportedGames: ['pac-man', 'space-invaders', 'galaga'],
    });
  } finally {
    server.close();
  }
});

test('API: invalid JSON returns 400 with error', async () => {
  const server = createServer();

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  try {
    const response = await new Promise<{ status: number, body: any }>((resolve, reject) => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Server address not available'));
        return;
      }

      const req = http.request({
        hostname: 'localhost',
        port: address.port,
        path: '/api/scores',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          resolve({ status: res.statusCode!, body: JSON.parse(body) });
        });
      });

      req.on('error', reject);
      req.write('invalid json');
      req.end();
    });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      valid: false,
      error: 'INVALID_JSON',
      message: 'Invalid JSON in request body',
    });
  } finally {
    server.close();
  }
});

test('API: non-existent route returns 404', async () => {
  const server = createServer();

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  try {
    const response = await makeRequest(server, '/api/nonexistent', 'POST', {});

    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { error: 'Not found' });
  } finally {
    server.close();
  }
});
