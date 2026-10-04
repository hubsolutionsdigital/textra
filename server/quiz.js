// Quiz Arena: quizzes the agency builds, live games players join with a PIN, and solo practice links.
//
// Live games are kept in memory (they last minutes, and the portal runs as a single instance).
// Everyone in a game follows it over Server-Sent Events: each change sends every listener a fresh
// view of the game made for them, so players never receive answers before the reveal.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { UPLOAD_DIR } from './db.js';
import {
  cleanQuiz,
  compact,
  forPlayer,
  gradeAnswer,
  playable,
  pointsFor,
  revealOf,
  streakBonus,
} from './quiz-logic.js';
import { TEMPLATES } from './quiz-templates.js';

export const AVATARS = ['🦊', '🐼', '🐸', '🦄', '🐙', '🦁', '🐯', '🐨', '🐵', '🐧', '🦉', '🐳', '🦖', '🐝', '👾', '🤖'];
export const REACTIONS = ['🔥', '👏', '😂', '😮', '🎉', '💜'];
const GET_READY_MS = 4000;
const MAX_PLAYERS = 200;
const GAME_TTL_MS = 4 * 3600_000;
const MEDIA_PREFIX = 'quiz-';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS quizzes (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  theme TEXT NOT NULL DEFAULT 'aurora',
  questions TEXT NOT NULL DEFAULT '[]',
  practice_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quiz_games (
  id INTEGER PRIMARY KEY,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  pin TEXT NOT NULL,
  players TEXT NOT NULL,
  played_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_quiz_games_quiz ON quiz_games(quiz_id);
`;

const token = (bytes = 18) => crypto.randomBytes(bytes).toString('base64url');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};

export function mountQuiz(app, db, { requireUser }) {
  db.exec(SCHEMA);
  const games = new Map();

  const q = {
    list: db.prepare(
      `SELECT z.*, (SELECT COUNT(*) FROM quiz_games g WHERE g.quiz_id = z.id) AS plays
       FROM quizzes z WHERE owner_id = ? ORDER BY updated_at DESC, id DESC`,
    ),
    get: db.prepare('SELECT * FROM quizzes WHERE id = ?'),
    byPractice: db.prepare('SELECT * FROM quizzes WHERE practice_token = ?'),
    insert: db.prepare(
      'INSERT INTO quizzes (owner_id, title, description, theme, questions, practice_token) VALUES (?, ?, ?, ?, ?, ?)',
    ),
    update: db.prepare(
      `UPDATE quizzes SET title = ?, description = ?, theme = ?, questions = ?, updated_at = datetime('now') WHERE id = ?`,
    ),
    games: db.prepare('SELECT * FROM quiz_games WHERE quiz_id = ? ORDER BY id DESC LIMIT 20'),
    addGame: db.prepare('INSERT INTO quiz_games (quiz_id, pin, players) VALUES (?, ?, ?)'),
  };

  const parseQuiz = (row) => ({ ...row, questions: JSON.parse(row.questions) });

  function ownedQuiz(req) {
    const row = q.get.get(Number(req.params.quizId));
    if (!row || row.owner_id !== req.user.id) fail(404, 'Quiz not found');
    return parseQuiz(row);
  }

  function createQuiz(ownerId, raw) {
    const quiz = cleanQuiz(raw);
    const { lastInsertRowid } = q.insert.run(
      ownerId, quiz.title, quiz.description, quiz.theme, JSON.stringify(quiz.questions), token(),
    );
    return parseQuiz(q.get.get(lastInsertRowid));
  }

  // ---------- quizzes (agency) ----------

  app.get('/api/quizzes', requireUser, (req, res) => {
    const quizzes = q.list.all(req.user.id).map((row) => {
      const { questions, ...rest } = parseQuiz(row);
      return { ...rest, question_count: questions.length, scenes: questions.map((x) => x.visual?.scene).filter((s) => s && s !== 'none').slice(0, 3) };
    });
    res.json({ quizzes, live: [...games.values()].filter((g) => g.hostId === req.user.id && g.state !== 'ended').map((g) => ({ pin: g.pin, title: g.quiz.title, state: g.state, players: g.players.size })) });
  });

  app.post('/api/quizzes', requireUser, (req, res) => {
    const template = TEMPLATES[req.body?.template] ?? TEMPLATES.blank;
    const quiz = createQuiz(req.user.id, { ...template, title: String(req.body?.title ?? '').trim() || template.title });
    res.json({ quiz });
  });

  app.get('/api/quizzes/:quizId', requireUser, (req, res) => {
    const quiz = ownedQuiz(req);
    res.json({ quiz, games: q.games.all(quiz.id).map((g) => ({ ...g, players: JSON.parse(g.players) })) });
  });

  app.put('/api/quizzes/:quizId', requireUser, (req, res) => {
    const existing = ownedQuiz(req);
    const quiz = cleanQuiz(req.body);
    q.update.run(quiz.title, quiz.description, quiz.theme, JSON.stringify(quiz.questions), existing.id);
    res.json({ quiz: parseQuiz(q.get.get(existing.id)) });
  });

  app.post('/api/quizzes/:quizId/duplicate', requireUser, (req, res) => {
    const src = ownedQuiz(req);
    res.json({ quiz: createQuiz(req.user.id, { ...src, title: `${src.title} (copy)`.slice(0, 120) }) });
  });

  app.delete('/api/quizzes/:quizId', requireUser, (req, res) => {
    const quiz = ownedQuiz(req);
    db.prepare('DELETE FROM quizzes WHERE id = ?').run(quiz.id);
    res.json({ ok: true });
  });

  // Images for question visuals and hotspot backgrounds. Names are random, and players load them
  // without signing in, the same model as the share links.
  const mediaUpload = multer({
    storage: multer.diskStorage({
      destination: UPLOAD_DIR,
      filename: (req, file, cb) => cb(null, MEDIA_PREFIX + token(12) + (IMAGE_EXT[file.mimetype] ?? '')),
    }),
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  });
  const IMAGE_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' };

  app.post('/api/quiz-media', requireUser, mediaUpload.single('image'), (req, res) => {
    if (!req.file) fail(400, 'No image uploaded');
    if (!IMAGE_EXT[req.file.mimetype]) {
      fs.rmSync(req.file.path, { force: true });
      fail(400, 'Use a PNG, JPG, GIF or WebP image');
    }
    res.json({ url: `/api/quiz-media/${req.file.filename}` });
  });

  app.get('/api/quiz-media/:name', (req, res) => {
    const name = path.basename(req.params.name);
    if (!name.startsWith(MEDIA_PREFIX)) fail(404, 'Not found');
    const file = path.join(UPLOAD_DIR, name);
    if (!fs.existsSync(file)) fail(404, 'Not found');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(file);
  });

  // ---------- practice (solo, self-paced) ----------

  function practiceQuiz(req) {
    const row = q.byPractice.get(String(req.params.token));
    if (!row) fail(404, 'This practice link is not valid');
    const quiz = parseQuiz(row);
    const questions = quiz.questions.filter((x) => !x.problems?.length).map(compact);
    if (!questions.length) fail(409, 'This quiz has no finished questions yet');
    return { quiz, questions };
  }

  app.get('/api/practice/:token', (req, res) => {
    const { quiz, questions } = practiceQuiz(req);
    res.json({
      title: quiz.title,
      description: quiz.description,
      theme: quiz.theme,
      questions: questions.map(forPlayer),
    });
  });

  app.post('/api/practice/:token/check', (req, res) => {
    const { questions } = practiceQuiz(req);
    const question = questions[Number(req.body?.index)];
    if (!question) fail(400, 'No such question');
    const fraction = gradeAnswer(question, req.body?.answer);
    const elapsed = Math.max(0, Number(req.body?.elapsed) || 0);
    res.json({
      fraction,
      points: pointsFor(question, fraction, elapsed),
      reveal: revealOf(question, forPlayer(question)),
    });
  });

  // ---------- live games ----------

  function newPin() {
    for (;;) {
      const pin = String(crypto.randomInt(100000, 1000000));
      if (!games.has(pin)) return pin;
    }
  }

  app.post('/api/quizzes/:quizId/live', requireUser, (req, res) => {
    const quiz = ownedQuiz(req);
    const check = playable(quiz.questions);
    if (!check.ok) fail(400, `Finish the quiz first: ${check.problems[0]}`);
    const game = {
      pin: newPin(),
      hostId: req.user.id,
      quiz: { id: quiz.id, title: quiz.title, theme: quiz.theme },
      questions: quiz.questions.map(compact),
      players: new Map(),
      state: 'lobby',
      index: -1,
      played: null,
      startedAt: 0,
      deadline: 0,
      timer: null,
      listeners: new Set(),
      reactions: [],
      touchedAt: Date.now(),
    };
    games.set(game.pin, game);
    res.json({ pin: game.pin });
  });

  function liveGame(req) {
    const game = games.get(String(req.params.pin));
    if (!game || game.state === 'ended') fail(404, 'No game with that PIN is running');
    game.touchedAt = Date.now();
    return game;
  }

  function hostedGame(req) {
    const game = liveGame(req);
    if (game.hostId !== req.user.id) fail(403, 'Only the host can control this game');
    return game;
  }

  function playerOf(game, body) {
    const p = game.players.get(String(body?.player ?? ''));
    if (!p || p.key !== body?.key) fail(403, 'You are not in this game. Join again with the PIN.');
    return p;
  }

  const ranking = (game) => [...game.players.values()].sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);

  const publicPlayer = (p) => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score, streak: p.streak });

  /** Answer breakdown shown on the big screen after each question. */
  function stats(game) {
    const qn = game.questions[game.index];
    const answers = [...game.players.values()].map((p) => p.answers[game.index]).filter(Boolean);
    const out = {
      answered: answers.length,
      correct: answers.filter((a) => a.fraction === 1).length,
      partial: answers.filter((a) => a.fraction > 0 && a.fraction < 1).length,
      wrong: answers.filter((a) => a.fraction === 0).length,
      accuracy: answers.length ? answers.reduce((s, a) => s + a.fraction, 0) / answers.length : 0,
    };
    if (qn.type === 'choice') {
      out.counts = qn.options.map((_, i) => answers.filter((a) => Array.isArray(a.answer) && a.answer.includes(i)).length);
    } else if (qn.type === 'truefalse') {
      out.counts = [true, false].map((v) => answers.filter((a) => a.answer === v).length);
    } else if (qn.type === 'hotspot') {
      out.pins = answers.map((a) => ({ x: Number(a.answer?.x) || 0, y: Number(a.answer?.y) || 0, ok: a.fraction === 1 })).slice(0, 300);
    } else if (qn.type === 'slider') {
      out.values = answers.map((a) => Number(a.answer)).filter(Number.isFinite).slice(0, 300);
    }
    return out;
  }

  function viewFor(game, who) {
    const total = game.questions.length;
    const ranked = ranking(game);
    const view = {
      pin: game.pin,
      title: game.quiz.title,
      theme: game.quiz.theme,
      state: game.state,
      index: game.index,
      total,
      playerCount: game.players.size,
      remainingMs: game.state === 'question' || game.state === 'get-ready' ? Math.max(0, game.deadline - Date.now()) : 0,
      reactions: game.reactions,
    };
    const qn = game.questions[game.index];
    if (qn && game.state === 'get-ready') view.question = { prompt: qn.prompt, type: qn.type, points: qn.points, visual: qn.visual, time: qn.time };
    if (qn && game.state === 'question') view.question = game.played;
    if (qn && (game.state === 'reveal' || game.state === 'leaderboard')) view.question = revealOf(qn, game.played);
    if (game.state === 'reveal') view.stats = stats(game);
    if (game.state === 'question') view.answeredCount = ranked.filter((p) => p.answers[game.index]).length;

    if (who.host) {
      view.host = true;
      view.players = ranked.map(publicPlayer);
      view.isLast = game.index >= total - 1;
      if (game.state === 'leaderboard' || game.state === 'podium') {
        view.leaderboard = ranked.slice(0, 10).map((p) => ({ ...publicPlayer(p), prevRank: p.prevRank, gained: p.answers[game.index]?.points ?? 0 }));
      }
      return view;
    }

    const me = who.player;
    const rank = ranked.indexOf(me) + 1;
    view.me = { ...publicPlayer(me), rank };
    if (game.state === 'question' && me.answers[game.index]) {
      view.answered = true;
      view.myAnswer = me.answers[game.index].answer;
    }
    if ((game.state === 'reveal' || game.state === 'leaderboard') && qn) {
      const a = me.answers[game.index];
      view.result = a
        ? { answer: a.answer, fraction: a.fraction, points: a.points, bonus: a.bonus }
        : { answer: null, fraction: 0, points: 0, bonus: 0, missed: true };
      const ahead = ranked[rank - 2];
      if (ahead) view.ahead = { name: ahead.name, gap: ahead.score - me.score };
    }
    if (game.state === 'podium') view.podium = ranked.slice(0, 3).map(publicPlayer);
    return view;
  }

  function send(game, listener) {
    if (listener.player && !game.players.has(listener.player.id)) {
      listener.res.write(`event: kicked\ndata: {}\n\n`);
      listener.res.end();
      game.listeners.delete(listener);
      return;
    }
    listener.res.write(`data: ${JSON.stringify(viewFor(game, listener))}\n\n`);
  }

  /** Coalesces bursts of changes (e.g. many answers at once) into one update per tick. */
  function broadcast(game) {
    if (game.pending) return;
    game.pending = true;
    setImmediate(() => {
      game.pending = false;
      for (const l of game.listeners) send(game, l);
    });
  }

  function setTimer(game, ms, fn) {
    clearTimeout(game.timer);
    game.timer = setTimeout(fn, ms);
    game.timer.unref?.();
  }

  function startQuestion(game) {
    // Remember the ranking before this question so the leaderboard can animate moves up and down.
    ranking(game).forEach((p, i) => (p.prevRank = i + 1));
    game.index += 1;
    const qn = game.questions[game.index];
    game.played = forPlayer(qn);
    game.state = 'get-ready';
    game.deadline = Date.now() + GET_READY_MS;
    game.reactions = [];
    setTimer(game, GET_READY_MS, () => {
      game.state = 'question';
      game.startedAt = Date.now();
      game.deadline = game.startedAt + qn.time * 1000;
      setTimer(game, qn.time * 1000 + 300, () => reveal(game));
      broadcast(game);
    });
    broadcast(game);
  }

  function reveal(game) {
    if (game.state !== 'question') return;
    clearTimeout(game.timer);
    game.state = 'reveal';
    // Streaks break for anyone who didn't answer fully right.
    for (const p of game.players.values()) {
      if (!(p.answers[game.index]?.fraction === 1)) p.streak = 0;
    }
    broadcast(game);
  }

  function finish(game) {
    clearTimeout(game.timer);
    game.state = 'podium';
    const ranked = ranking(game);
    if (ranked.length) {
      const results = ranked.map((p, i) => ({
        rank: i + 1,
        name: p.name,
        avatar: p.avatar,
        score: p.score,
        correct: p.answers.filter((a) => a?.fraction === 1).length,
      }));
      q.addGame.run(game.quiz.id, game.pin, JSON.stringify(results));
    }
    broadcast(game);
  }

  app.get('/api/live/:pin', (req, res) => {
    const game = liveGame(req);
    res.json({ title: game.quiz.title, theme: game.quiz.theme, state: game.state, avatars: AVATARS });
  });

  app.post('/api/live/:pin/join', (req, res) => {
    const game = liveGame(req);
    if (game.state === 'podium') fail(409, 'This game has finished');
    const name = String(req.body?.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 20);
    if (!name) fail(400, 'Pick a nickname');
    const taken = [...game.players.values()].some((p) => p.name.toLowerCase() === name.toLowerCase());
    if (taken) fail(409, 'That nickname is taken in this game. Try another one.');
    if (game.players.size >= MAX_PLAYERS) fail(409, 'This game is full');
    const avatar = AVATARS.includes(req.body?.avatar) ? req.body.avatar : AVATARS[game.players.size % AVATARS.length];
    const player = {
      id: token(9),
      key: token(),
      name,
      avatar,
      score: 0,
      streak: 0,
      prevRank: 0,
      answers: [],
      joinedAt: Date.now(),
    };
    game.players.set(player.id, player);
    broadcast(game);
    res.json({ player: player.id, key: player.key });
  });

  app.post('/api/live/:pin/answer', (req, res) => {
    const game = liveGame(req);
    const player = playerOf(game, req.body);
    if (game.state !== 'question') fail(409, 'Time is up for this question');
    if (player.answers[game.index]) fail(409, 'You already answered');
    const qn = game.questions[game.index];
    const elapsed = Date.now() - game.startedAt;
    const fraction = gradeAnswer(qn, req.body?.answer);
    const streak = fraction === 1 ? player.streak + 1 : 0;
    const points = pointsFor(qn, fraction, elapsed);
    const bonus = fraction === 1 && qn.points ? streakBonus(streak) : 0;
    player.answers[game.index] = { answer: req.body?.answer ?? null, fraction, points: points + bonus, bonus, elapsed };
    player.streak = streak;
    player.score += points + bonus;
    if ([...game.players.values()].every((p) => p.answers[game.index])) {
      setTimer(game, 600, () => reveal(game));
    }
    broadcast(game);
    res.json({ ok: true });
  });

  app.post('/api/live/:pin/react', (req, res) => {
    const game = liveGame(req);
    const player = playerOf(game, req.body);
    const emoji = String(req.body?.emoji ?? '');
    if (!REACTIONS.includes(emoji)) fail(400, 'Unknown reaction');
    const now = Date.now();
    if (now - (player.reactedAt ?? 0) < 700) return res.json({ ok: true });
    player.reactedAt = now;
    game.reactions = [...game.reactions.filter((r) => now - r.at < 4000), { id: token(6), emoji, avatar: player.avatar, at: now }].slice(-30);
    broadcast(game);
    res.json({ ok: true });
  });

  app.post('/api/live/:pin/host/:action', requireUser, (req, res) => {
    const game = hostedGame(req);
    const last = game.index >= game.questions.length - 1;
    switch (req.params.action) {
      case 'next':
        if (game.state === 'lobby') {
          if (!game.players.size) fail(409, 'Wait for at least one player to join');
          startQuestion(game);
        } else if (game.state === 'question') {
          reveal(game);
        } else if (game.state === 'reveal') {
          if (last) finish(game);
          else {
            game.state = 'leaderboard';
            broadcast(game);
          }
        } else if (game.state === 'leaderboard') {
          startQuestion(game);
        }
        break;
      case 'kick': {
        game.players.delete(String(req.body?.player));
        broadcast(game);
        break;
      }
      case 'end':
        clearTimeout(game.timer);
        game.state = 'ended';
        for (const l of game.listeners) {
          l.res.write(`event: ended\ndata: {}\n\n`);
          l.res.end();
        }
        game.listeners.clear();
        games.delete(game.pin);
        break;
      default:
        fail(404, 'Unknown action');
    }
    res.json({ ok: true });
  });

  /**
   * The live feed. Hosts are recognised by their session cookie, players by the id and key they
   * got when joining (passed in the query string, as EventSource can't send headers).
   */
  app.get('/api/live/:pin/stream', (req, res, next) => {
    const game = liveGame(req);
    if (req.query.host) {
      return requireUser(req, res, () => {
        if (game.hostId !== req.user.id) return next(new HttpError(403, 'Only the host can open this screen'));
        openStream(game, req, res, { host: true });
      });
    }
    const player = game.players.get(String(req.query.player ?? ''));
    if (!player || player.key !== req.query.key) fail(403, 'You are not in this game');
    openStream(game, req, res, { player });
  });

  function openStream(game, req, res, who) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    const listener = { res, ...who };
    game.listeners.add(listener);
    send(game, listener);
    const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => {
      clearInterval(ping);
      game.listeners.delete(listener);
    });
  }

  // Forget games nobody has touched for a few hours.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [pin, g] of games) {
      if (now - g.touchedAt > GAME_TTL_MS && !g.listeners.size) {
        clearTimeout(g.timer);
        games.delete(pin);
      }
    }
  }, 600_000);
  sweep.unref?.();

  return { games };
}
