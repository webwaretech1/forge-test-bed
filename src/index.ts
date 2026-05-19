export type SupportedGame = 'pac-man' | 'space-invaders' | 'galaga';

export type ScoreSubmission = {
  game: string;
  playerName: string;
  score: number;
  playDuration: number;
  replayHash?: string;
};

type SuccessfulValidation = {
  valid: true;
  scoreId: string;
};

type FailedValidation = {
  valid: false;
  error:
    | 'SCORE_EXCEEDS_MAXIMUM'
    | 'INSUFFICIENT_PLAY_TIME'
    | 'DUPLICATE_SUBMISSION'
    | 'REPLAY_HASH_EXISTS'
    | 'MISSING_REPLAY_HASH'
    | 'UNSUPPORTED_GAME';
  message: string;
  maxScore?: number;
  minDuration?: number;
  cooldownRemaining?: number;
  conflictingSubmission?: string;
  supportedGames?: SupportedGame[];
};

export type ScoreValidationResponse = SuccessfulValidation | FailedValidation;

type StoredSubmission = {
  scoreId: string;
  game: SupportedGame;
  playerName: string;
  score: number;
  submittedAtMs: number;
  replayHash: string;
};

const GAME_RULES: Record<SupportedGame, { maxScore: number; minDuration: number }> = {
  'pac-man': { maxScore: 3333360, minDuration: 30 },
  'space-invaders': { maxScore: 999999, minDuration: 30 },
  galaga: { maxScore: 999999, minDuration: 30 },
};

const SUPPORTED_GAMES = Object.keys(GAME_RULES) as SupportedGame[];
const DUPLICATE_WINDOW_SECONDS = 60;

const isSupportedGame = (game: string): game is SupportedGame =>
  SUPPORTED_GAMES.includes(game as SupportedGame);

const defaultIdGenerator = (): string => Math.random().toString(36).slice(2, 8);

export class ScoreValidationService {
  private readonly submissions: StoredSubmission[] = [];
  private readonly idGenerator: () => string;

  constructor(idGenerator: () => string = defaultIdGenerator) {
    this.idGenerator = idGenerator;
  }

  postScore(payload: ScoreSubmission, nowMs: number = Date.now()): ScoreValidationResponse {
    if (!payload.replayHash) {
      return {
        valid: false,
        error: 'MISSING_REPLAY_HASH',
        message: 'Replay hash is required for score validation',
      };
    }

    if (!isSupportedGame(payload.game)) {
      return {
        valid: false,
        error: 'UNSUPPORTED_GAME',
        message: `Game ${payload.game} not supported`,
        supportedGames: SUPPORTED_GAMES,
      };
    }

    const rules = GAME_RULES[payload.game];

    if (payload.score > rules.maxScore) {
      return {
        valid: false,
        error: 'SCORE_EXCEEDS_MAXIMUM',
        message: `Score ${payload.score} exceeds maximum possible for ${payload.game}`,
        maxScore: rules.maxScore,
      };
    }

    if (payload.playDuration < rules.minDuration) {
      return {
        valid: false,
        error: 'INSUFFICIENT_PLAY_TIME',
        message: `Play duration ${payload.playDuration} seconds is below minimum required`,
        minDuration: rules.minDuration,
      };
    }

    const replayHashConflict = this.submissions.find((submission) => submission.replayHash === payload.replayHash);
    if (replayHashConflict) {
      return {
        valid: false,
        error: 'REPLAY_HASH_EXISTS',
        message: 'Replay hash already used',
        conflictingSubmission: replayHashConflict.scoreId,
      };
    }

    const duplicate = this.submissions.find(
      (submission) =>
        submission.playerName === payload.playerName &&
        submission.game === payload.game &&
        submission.score === payload.score &&
        nowMs - submission.submittedAtMs < DUPLICATE_WINDOW_SECONDS * 1000,
    );

    if (duplicate) {
      const elapsedSeconds = Math.floor((nowMs - duplicate.submittedAtMs) / 1000);
      return {
        valid: false,
        error: 'DUPLICATE_SUBMISSION',
        message: 'Same score already submitted within 60 seconds',
        cooldownRemaining: DUPLICATE_WINDOW_SECONDS - elapsedSeconds,
      };
    }

    const scoreId = this.idGenerator();
    this.submissions.push({
      scoreId,
      game: payload.game,
      playerName: payload.playerName,
      score: payload.score,
      submittedAtMs: nowMs,
      replayHash: payload.replayHash,
    });

    return {
      valid: true,
      scoreId,
    };
  }
}

// HTTP Server
import http from 'node:http';
import { URL } from 'node:url';

const globalService = new ScoreValidationService();

export function createServer(service: ScoreValidationService = globalService): http.Server {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/scores') {
      let body = '';

      req.on('data', (chunk) => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const result = service.postScore(payload);

          res.setHeader('Content-Type', 'application/json');

          if (result.valid) {
            res.writeHead(200);
          } else {
            res.writeHead(400);
          }

          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            valid: false,
            error: 'INVALID_JSON',
            message: 'Invalid JSON in request body'
          }));
        }
      });

      req.on('error', () => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          valid: false,
          error: 'REQUEST_ERROR',
          message: 'Error reading request'
        }));
      });
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });
}
