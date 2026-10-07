import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-test-'));
process.env.DATA_DIR = dir;
process.env.ALLOW_SIGNUPS = 'true';
const { openDb } = await import('./db.js');
const { createApp } = await import('./app.js');
const logic = await import('./quiz-logic.js');
const { TEMPLATES } = await import('./quiz-templates.js');

let server;
let base;
let cookie = '';

before(async () => {
  const app = createApp(openDb(path.join(dir, 'test.db')), { mailer: { send: async () => {} } });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function api(method, url, body, { host = true } = {}) {
  const headers = {};
  if (host && cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return { status: res.status, data: await res.json().catch(() => null) };
}

/** Follows an SSE stream; `next(pred)` resolves with the first view matching pred. */
function follow(url, headers = {}) {
  const ctrl = new AbortController();
  const views = [];
  const waiters = [];
  (async () => {
    const res = await fetch(base + url, { headers, signal: ctrl.signal });
    const dec = new TextDecoder();
    let buf = '';
    for await (const chunk of res.body) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = block.split('\n').find((l) => l.startsWith('data: '));
        if (!data) continue;
        const view = JSON.parse(data.slice(6));
        views.push(view);
        for (const w of waiters.slice()) {
          if (w.pred(view)) {
            waiters.splice(waiters.indexOf(w), 1);
            w.resolve(view);
          }
        }
      }
    }
  })().catch(() => {});
  return {
    next: (pred) =>
      new Promise((resolve) => {
        const hit = views.findLast?.(pred);
        if (hit) return resolve(hit);
        waiters.push({ pred, resolve });
      }),
    close: () => ctrl.abort(),
  };
}

test('grading gives partial credit for drag-and-drop answers', () => {
  const c = (raw) => logic.compact(logic.cleanQuestion(raw, 0));
  const order = c({ type: 'order', prompt: 'x', items: ['a', '', 'b', 'c', 'd'] });
  assert.deepEqual(order.items, ['a', 'b', 'c', 'd']);
  assert.equal(logic.gradeAnswer(order, [0, 1, 2, 3]), 1);
  assert.equal(logic.gradeAnswer(order, [0, 1, 3, 2]), 0.5);
  assert.equal(logic.gradeAnswer(order, 'nonsense'), 0);

  const cat = c({
    type: 'categorize', prompt: 'x', buckets: ['A', '', 'B'],
    items: [{ text: 'one', bucket: 0 }, { text: 'two', bucket: 2 }],
  });
  assert.deepEqual(cat.buckets, ['A', 'B']);
  assert.equal(cat.items[1].bucket, 1, 'bucket indexes are remapped when empty groups are dropped');
  assert.equal(logic.gradeAnswer(cat, { 0: 0, 1: 1 }), 1);
  assert.equal(logic.gradeAnswer(cat, { 0: 0 }), 0.5);

  const choice = c({ type: 'choice', prompt: 'x', options: [{ text: 'a', correct: true }, { text: '' }, { text: 'b', correct: true }, { text: 'c' }] });
  assert.equal(logic.forPlayer(choice).multi, true);
  assert.equal(logic.gradeAnswer(choice, [0, 1]), 1);
  assert.equal(logic.gradeAnswer(choice, [0, 2]), 0, 'a wrong pick cancels a right one');
  assert.equal(logic.gradeAnswer(choice, [0]), 0.5);

  const blanks = c({ type: 'blanks', prompt: 'x', text: 'A [[301]] and a [[302]]', distractors: ['404'] });
  const shown = logic.forPlayer(blanks);
  assert.deepEqual(shown.parts, ['A ', ' and a ', '']);
  assert.ok(!JSON.stringify(shown).includes('[['), 'answers are not in the gap text');
  assert.equal(logic.gradeAnswer(blanks, ['301', '302']), 1);

  const slider = c({ type: 'slider', prompt: 'x', min: 0, max: 100, answer: 60, tolerance: 5 });
  assert.equal(logic.gradeAnswer(slider, 64), 1);
  assert.equal(logic.gradeAnswer(slider, 69), 0.5);
  assert.equal(logic.gradeAnswer(slider, 90), 0);

  const hot = c({ type: 'hotspot', prompt: 'x', target: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } });
  assert.equal(logic.gradeAnswer(hot, { x: 0.2, y: 0.2 }), 1);
  assert.equal(logic.gradeAnswer(hot, { x: 0.6, y: 0.2 }), 0);
  assert.equal(logic.forPlayer(hot).target, undefined, 'the target is never sent to players');

  assert.equal(logic.pointsFor({ points: 1, time: 20 }, 1, 0), 1000);
  assert.equal(logic.pointsFor({ points: 2, time: 20 }, 1, 20000), 1000);
  assert.equal(logic.pointsFor({ points: 0, time: 20 }, 1, 0), 0);
});

test('templates are complete and playable', () => {
  for (const [name, t] of Object.entries(TEMPLATES)) {
    if (name === 'blank') continue;
    const quiz = logic.cleanQuiz(t);
    assert.deepEqual(logic.playable(quiz.questions).problems, [], name);
    for (const qn of quiz.questions.map(logic.compact)) {
      assert.equal(logic.gradeAnswer(qn, logic.solutionOf(qn).answer ?? (qn.type === 'hotspot' ? { x: qn.target.x + 0.01, y: qn.target.y + 0.01 } : logic.solutionOf(qn))), 1, `${name}: ${qn.prompt}`);
    }
  }
});

test('quiz CRUD, practice and a full live game', async () => {
  let r = await api('POST', '/api/auth/register', { email: 'host@studio.test', name: 'Host', password: 'password1' });
  assert.equal(r.status, 200);

  r = await api('POST', '/api/quizzes', { template: 'blank' });
  const blankId = r.data.quiz.id;
  r = await api('POST', `/api/quizzes/${blankId}/live`);
  assert.equal(r.status, 400, 'an unfinished quiz cannot go live');

  r = await api('POST', '/api/quizzes', { template: 'seo', title: 'SEO night' });
  assert.equal(r.status, 200);
  const quiz = r.data.quiz;
  assert.equal(quiz.title, 'SEO night');

  // Trim it to two questions: a choice and an order question.
  const questions = [quiz.questions[0], quiz.questions[2]];
  r = await api('PUT', `/api/quizzes/${quiz.id}`, { ...quiz, questions });
  assert.equal(r.status, 200);
  assert.equal(r.data.quiz.questions.length, 2);

  r = await api('GET', '/api/quizzes');
  assert.equal(r.data.quizzes.length, 2);

  // Someone else can't see or host it.
  const mine = cookie;
  cookie = '';
  await api('POST', '/api/auth/register', { email: 'other@studio.test', name: 'Other', password: 'password1' });
  assert.equal((await api('GET', `/api/quizzes/${quiz.id}`)).status, 404);
  assert.equal((await api('POST', `/api/quizzes/${quiz.id}/live`)).status, 404);
  cookie = mine;

  // Practice link: no answers until checked.
  r = await api('GET', `/api/practice/${quiz.practice_token}`, undefined, { host: false });
  assert.equal(r.data.questions.length, 2);
  assert.ok(!JSON.stringify(r.data).includes('correct'));
  r = await api('POST', `/api/practice/${quiz.practice_token}/check`, { index: 0, answer: [0], elapsed: 0 }, { host: false });
  assert.equal(r.data.fraction, 1);
  assert.equal(r.data.points, 1000);
  assert.deepEqual(r.data.reveal.solution, [0]);

  // Live game.
  r = await api('POST', `/api/quizzes/${quiz.id}/live`);
  const pin = r.data.pin;
  assert.match(pin, /^\d{6}$/);
  assert.equal((await api('POST', `/api/live/${pin}/host/next`)).status, 409, 'needs a player first');

  r = await api('GET', `/api/live/${pin}`, undefined, { host: false });
  assert.equal(r.data.state, 'lobby');
  r = await api('POST', `/api/live/${pin}/join`, { name: 'Ada', avatar: '🦊' }, { host: false });
  const ada = r.data;
  r = await api('POST', `/api/live/${pin}/join`, { name: 'ada' }, { host: false });
  assert.equal(r.status, 409, 'nicknames are unique');
  r = await api('POST', `/api/live/${pin}/join`, { name: 'Linus' }, { host: false });
  const linus = r.data;

  const hostFeed = follow(`/api/live/${pin}/stream?host=1`, { cookie });
  const adaFeed = follow(`/api/live/${pin}/stream?player=${ada.player}&key=${ada.key}`);
  let v = await hostFeed.next((x) => x.state === 'lobby' && x.playerCount === 2);
  assert.equal(v.players.length, 2);
  assert.equal((await fetch(`${base}/api/live/${pin}/stream?player=${ada.player}&key=wrong`)).status, 403);

  await api('POST', `/api/live/${pin}/host/next`);
  v = await adaFeed.next((x) => x.state === 'get-ready');
  assert.equal(v.question.options, undefined, 'options are hidden while getting ready');
  v = await adaFeed.next((x) => x.state === 'question');
  assert.equal(v.question.options.length, 4);
  assert.ok(!JSON.stringify(v).includes('"correct"'), 'no answers while the question is open');

  r = await api('POST', `/api/live/${pin}/answer`, { player: ada.player, key: ada.key, answer: [0] }, { host: false });
  assert.equal(r.status, 200);
  r = await api('POST', `/api/live/${pin}/answer`, { player: ada.player, key: ada.key, answer: [1] }, { host: false });
  assert.equal(r.status, 409, 'one answer per question');
  await api('POST', `/api/live/${pin}/answer`, { player: linus.player, key: linus.key, answer: [2] }, { host: false });

  // Everyone answered: the reveal comes on its own.
  v = await adaFeed.next((x) => x.state === 'reveal');
  assert.equal(v.result.fraction, 1);
  assert.ok(v.result.points > 900);
  assert.deepEqual(v.question.solution, [0]);
  v = await hostFeed.next((x) => x.state === 'reveal');
  assert.deepEqual(v.stats.counts, [1, 0, 1, 0]);

  await api('POST', `/api/live/${pin}/host/next`);
  v = await hostFeed.next((x) => x.state === 'leaderboard');
  assert.equal(v.leaderboard[0].name, 'Ada');

  await api('POST', `/api/live/${pin}/host/next`);
  v = await adaFeed.next((x) => x.state === 'question' && x.index === 1);
  const order = v.question.items.map((i) => i.id).sort((a, b) => a - b);
  await api('POST', `/api/live/${pin}/answer`, { player: ada.player, key: ada.key, answer: order }, { host: false });
  await api('POST', `/api/live/${pin}/host/next`); // close early: Linus never answers
  v = await adaFeed.next((x) => x.state === 'reveal' && x.index === 1);
  assert.equal(v.result.fraction, 1);
  assert.equal(v.result.bonus, 100, 'two in a row earns a streak bonus');

  await api('POST', `/api/live/${pin}/host/next`);
  v = await adaFeed.next((x) => x.state === 'podium');
  assert.equal(v.podium[0].name, 'Ada');
  assert.equal(v.me.rank, 1);

  r = await api('GET', `/api/quizzes/${quiz.id}`);
  assert.equal(r.data.games.length, 1);
  assert.equal(r.data.games[0].players[0].correct, 2);

  await api('POST', `/api/live/${pin}/host/end`);
  assert.equal((await api('GET', `/api/live/${pin}`, undefined, { host: false })).status, 404);
  hostFeed.close();
  adaFeed.close();
});

test('quiz-only mode switches the review portal off', async () => {
  const solo = createApp(openDb(path.join(dir, 'solo.db')), { quizOnly: true, mailer: { send: async () => {} } });
  const srv = await new Promise((resolve) => {
    const s = solo.listen(0, () => resolve(s));
  });
  const url = `http://127.0.0.1:${srv.address().port}`;
  const res = await fetch(`${url}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'q@quiz.test', name: 'Q', password: 'password1' }),
  });
  const c = res.headers.get('set-cookie').split(';')[0];
  const get = (p) => fetch(url + p, { headers: { cookie: c } }).then((r) => r.status);
  assert.equal(await get('/api/quizzes'), 200);
  assert.equal(await get('/api/projects'), 404);
  assert.equal(await get('/api/mail-settings'), 404);
  srv.closeAllConnections();
  srv.close();
});
