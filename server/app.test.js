import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-test-'));
process.env.DATA_DIR = dir;
const { openDb } = await import('./db.js');
const { createApp } = await import('./app.js');

const sent = [];
const mailer = { send: async (m) => sent.push(m) };

let server;
let base;
let cookie = '';

before(async () => {
  const app = createApp(openDb(path.join(dir, 'test.db')), { mailer });
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

async function api(method, url, body, { agency = true } = {}) {
  const headers = {};
  if (agency && cookie) headers.cookie = cookie;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(base + url, { method, headers, body: payload });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

const pdfBlob = () => new Blob(['%PDF-1.4\n%%EOF\n'], { type: 'application/pdf' });

test('full review lifecycle: 3 rounds, final approval', async () => {
  let r = await api('POST', '/api/auth/register', { email: 'a@studio.test', name: 'Studio', password: 'password1' });
  assert.equal(r.status, 200);

  r = await api('POST', '/api/projects', { name: 'Acme site', client_name: 'Acme' });
  assert.equal(r.status, 400, 'notification email is required');
  r = await api('POST', '/api/projects', { name: 'Acme site', notify_emails: 'not-an-email' });
  assert.equal(r.status, 400);
  r = await api('POST', '/api/projects', {
    name: 'Acme site',
    client_name: 'Acme',
    notify_emails: 'pm@studio.test, Dev@Studio.test',
  });
  assert.equal(r.data.project.notify_emails, 'pm@studio.test, dev@studio.test');
  const projectId = r.data.project.id;
  const teamToken = r.data.project.team_token;
  assert.ok(teamToken);
  const shareToken = r.data.project.share_token;

  const fd = new FormData();
  fd.append('title', 'Home page');
  fd.append('file', pdfBlob(), 'home.pdf');
  r = await api('POST', `/api/projects/${projectId}/screens`, fd);
  assert.equal(r.status, 200);
  const screen = r.data.screens[0];
  assert.equal(screen.current_version.round, 1);

  // client sees the page without an account
  r = await api('GET', `/api/share/${shareToken}`, undefined, { agency: false });
  assert.equal(r.data.screens.length, 1);
  assert.equal(r.data.project.owner_id, undefined);
  assert.equal(r.data.project.team_token, undefined, 'client never sees the team link');
  assert.equal(r.data.project.notify_emails, undefined);

  for (let round = 1; round <= 3; round++) {
    const c = new FormData();
    c.append('author_name', 'Jane');
    c.append('screen_id', String(screen.id));
    c.append('kind', round === 1 ? 'change' : 'love');
    c.append('body', round === 1 ? 'Swap the slider for a static hero' : '');
    c.append('x', '0.4');
    c.append('y', '0.2');
    c.append('images', new Blob(['png'], { type: 'image/png' }), 'shot.png');
    r = await api('POST', `/api/share/${shareToken}/comments`, c, { agency: false });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.comments.filter((x) => x.round === round).length, 1);

    r = await api('POST', `/api/share/${shareToken}/submit`, { author_name: 'Jane' }, { agency: false });
    assert.equal(r.status, 409, 'cannot submit before reviewing every page');
    r = await api('POST', `/api/share/${shareToken}/screens/${screen.id}/reviewed`, { author_name: 'Jane' }, { agency: false });
    assert.equal(r.status, 200);
    r = await api('POST', `/api/share/${shareToken}/submit`, { author_name: 'Jane' }, { agency: false });
    assert.equal(r.data.project.stage, 'revising');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(sent.length, round, 'one email per submitted round');
    assert.equal(sent.at(-1).to, 'pm@studio.test, dev@studio.test');
    assert.match(sent.at(-1).html, new RegExp(`/t/${teamToken}\\?round=${round}`));

    // the team link (no sign-in) can mark comments done, and the client sees it
    const commentId = r.data.comments.find((x) => x.round === round).id;
    r = await api('PATCH', `/api/team/${teamToken}/comments/${commentId}`, { status: 'done' }, { agency: false });
    assert.equal(r.status, 200);
    r = await api('GET', `/api/share/${shareToken}`, undefined, { agency: false });
    const updated = r.data.comments.find((x) => x.id === commentId);
    assert.equal(updated.status, 'done');
    assert.ok(updated.status_changed_at);

    // commenting is locked once submitted
    r = await api('POST', `/api/share/${shareToken}/comments`, c, { agency: false });
    assert.equal(r.status, 409);

    if (round < 3) {
      r = await api('POST', `/api/projects/${projectId}/advance`, { action: 'next_round' });
      assert.equal(r.data.project.current_round, round + 1);
      assert.equal(r.data.project.stage, 'review');
    }
  }

  r = await api('POST', `/api/projects/${projectId}/advance`, { action: 'next_round' });
  assert.equal(r.status, 409, 'no 4th round');

  const v = new FormData();
  v.append('file', pdfBlob(), 'home-final.pdf');
  r = await api('POST', `/api/projects/${projectId}/screens/${screen.id}/versions`, v);
  assert.equal(r.data.screens[0].current_version.round, 4, 'final version is max_rounds + 1');

  r = await api('POST', `/api/projects/${projectId}/advance`, { action: 'send_final' });
  assert.equal(r.data.project.stage, 'final');

  await api('PATCH', `/api/projects/${projectId}`, { live_url: 'acme.example' });
  r = await api('POST', `/api/share/${shareToken}/approve`, { author_name: 'Jane' }, { agency: false });
  assert.equal(r.data.project.stage, 'approved');
  assert.equal(r.data.project.approved_by, 'Jane');
  assert.equal(r.data.project.live_url, 'https://acme.example');
  assert.equal(r.data.comments.length, 3, 'all rounds kept as a log');
});

test('client cannot read another project or delete others comments', async () => {
  let r = await api('GET', '/api/share/nope', undefined, { agency: false });
  assert.equal(r.status, 404);
  r = await api('GET', '/api/projects/1', undefined, { agency: false });
  assert.equal(r.status, 401);
  r = await api('GET', '/api/team/nope', undefined, { agency: false });
  assert.equal(r.status, 404);
});
