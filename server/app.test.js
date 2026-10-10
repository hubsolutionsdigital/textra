import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-test-'));
process.env.DATA_DIR = dir;
// Most tests create several agency accounts; the sign-up rules have their own test below.
process.env.ALLOW_SIGNUPS = 'true';
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

test('HTML prototypes: upload .html and .zip, served sandboxed, comments keep element anchor + device', async () => {
  const { zipSync, strToU8 } = await import('fflate');
  let reg = await api('POST', '/api/auth/register', { email: 'html@studio.test', name: 'Studio', password: 'password1' });
  assert.equal(reg.status, 200);
  let r = await api('POST', '/api/projects', { name: 'Proto', notify_emails: 'pm@studio.test' });
  const { id: projectId, share_token: shareToken } = r.data.project;

  // single .html file
  let fd = new FormData();
  fd.append('file', new Blob(['<html><head><title>x</title></head><body><h1>Hi</h1></body></html>'], { type: 'text/html' }), 'Landing.html');
  r = await api('POST', `/api/projects/${projectId}/screens`, fd);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const single = r.data.screens[0];
  assert.equal(r.data.upload_warning, undefined, 'self-contained page: no warning');

  // a site that draws its own cursor keeps it in comment mode
  fd = new FormData();
  fd.append('file', new Blob(['<html><head><style>body{cursor:none}</style></head><body></body></html>'], { type: 'text/html' }), 'cursor.html');
  r = await api('POST', `/api/projects/${projectId}/screens`, fd);
  const cursorVersion = r.data.screens.at(-1).current_version;
  assert.equal(cursorVersion.entry, 'cursor.html', 'a single HTML file keeps its own name');
  const cursorPage = await fetch(`${base}/sites/${cursorVersion.site_token}/${cursorVersion.entry}`);
  assert.match(await cursorPage.text(), /<script src="\/__portal\/frame\.js" data-custom-cursor="1"><\/script>/);
  await api('DELETE', `/api/projects/${projectId}/screens/${r.data.screens.at(-1).id}`);

  // a lone index.html whose images live next to it on the designer's computer
  fd = new FormData();
  fd.append(
    'file',
    new Blob(
      [
        `<html><head><style>.hero{background:url('img/hero.jpg')}</style></head><body>
         <img src="images/card-1.webp"><img src="https://cdn.example.com/x.png"><img src="data:image/png;base64,AA">
         <a href="#top">top</a><img src="file:///Users/susan/Downloads/logo.png">
         <script>const cards = ['images/card-2.jpg', "images/card-3.jpg"]; const tpl = \`img/\${n}.png\`;</script>
         <svg><circle fill="url(#g)"/></svg><div style="background:url('data:image/svg+xml,%3Crect fill=%22url(%23n)%22/%3E')"></div>
         <a href="about.html">About</a>
         </body></html>`,
      ],
      { type: 'text/html' },
    ),
    'index.html',
  );
  r = await api('POST', `/api/projects/${projectId}/screens`, fd);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.upload_warning.files, ['images/card-1.webp', 'images/card-2.jpg', 'images/card-3.jpg', 'img/hero.jpg']);
  assert.equal(r.data.upload_warning.total, 4);
  assert.deepEqual(r.data.upload_warning.computerPaths, ['file:///Users/susan/Downloads/logo.png']);
  assert.deepEqual(r.data.upload_warning.pages, ['about.html'], 'missing pages reported separately');
  await api('DELETE', `/api/projects/${projectId}/screens/${r.data.screens.at(-1).id}`);
  assert.equal(single.title, 'Landing');
  assert.equal(single.current_version.kind, 'html');
  assert.equal(single.current_version.entry, 'Landing.html');

  let res = await fetch(`${base}/sites/${single.current_version.site_token}/Landing.html`);
  const page = await res.text();
  assert.match(res.headers.get('content-security-policy'), /^sandbox allow-scripts/);
  assert.doesNotMatch(res.headers.get('content-security-policy'), /allow-same-origin/);
  assert.match(page, /<head><script src="\/__portal\/frame\.js"><\/script>/, 'no custom cursor flag');

  // zip in a wrapping folder, with assets and a root-relative URL
  const zip = zipSync({
    'site/index.html': strToU8('<html><head><link rel="stylesheet" href="/css/app.css"></head><body><img src="img/a.png"></body></html>'),
    'site/css/app.css': strToU8('body{background:url(/img/a.png)}'),
    'site/img/a.png': new Uint8Array([137, 80, 78, 71]),
  });
  fd = new FormData();
  fd.append('title', 'Home');
  fd.append('file', new Blob([zip], { type: 'application/zip' }), 'home.zip');
  r = await api('POST', `/api/projects/${projectId}/screens`, fd);
  const v = r.data.screens[1].current_version;
  assert.equal(r.data.upload_warning, undefined, 'zip with all its files: no warning');
  assert.equal(v.entry, 'index.html');
  res = await fetch(`${base}/sites/${v.site_token}/index.html`);
  assert.match(await res.text(), new RegExp(`href="/sites/${v.site_token}/css/app.css"`));
  res = await fetch(`${base}/sites/${v.site_token}/css/app.css`);
  assert.match(await res.text(), new RegExp(`url\\(/sites/${v.site_token}/img/a.png\\)`));
  // Tablet/Mobile previews: device-specific CSS is rewritten to match the previewed device
  res = await fetch(`${base}/sites/${v.site_token}/~mobile/css/app.css`);
  assert.match(await res.text(), new RegExp(`url\\(/sites/${v.site_token}/~mobile/img/a.png\\)`));
  const { rewriteDeviceQueries } = await import('./sites.js');
  assert.equal(
    rewriteDeviceQueries('@media only screen and (max-device-width: 768px) and (hover: none) and (pointer:coarse){}'),
    '@media only screen and (max-width: 768px) and (min-width: 0px) and (min-width: 0px){}',
  );
  assert.equal(rewriteDeviceQueries('@media (hover: hover) and (pointer: fine){}'), '@media (min-width: 999999px) and (min-width: 999999px){}');
  assert.equal(rewriteDeviceQueries('<meta name="viewport" content="width=device-width">'), '<meta name="viewport" content="width=device-width">');
  res = await fetch(`${base}/sites/${v.site_token}/~desktop/index.html`);
  assert.equal(res.status, 200);
  res = await fetch(`${base}/sites/${v.site_token}/img/a.png`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  res = await fetch(`${base}/sites/${v.site_token}`, { redirect: 'manual' });
  assert.equal(res.status, 302);
  res = await fetch(`${base}/sites/${v.site_token}/..%2f..%2fportal.db`);
  assert.equal(res.status, 404);
  // a menu link to a page that wasn't uploaded gets a friendly page that still reports back to the portal
  res = await fetch(`${base}/sites/${v.site_token}/~desktop/about.html`);
  assert.equal(res.status, 404);
  const missingPage = await res.text();
  assert.match(missingPage, /isn’t part of this design yet/);
  assert.match(missingPage, /\/__portal\/frame\.js/);
  res = await fetch(`${base}/sites/not-a-token/index.html`);
  assert.equal(res.status, 404);
  res = await fetch(`${base}/__portal/frame.js`);
  assert.match(await res.text(), /postMessage/);

  // zip-slip is rejected
  fd = new FormData();
  for (const evil of [{ '../evil.html': strToU8('x') }, { 'index.html': strToU8('x'), 'a/../../evil.html': strToU8('x') }]) {
    fd = new FormData();
    fd.append('file', new Blob([zipSync(evil)], { type: 'application/zip' }), 'evil.zip');
    r = await api('POST', `/api/projects/${projectId}/screens`, fd);
    assert.equal(r.status, 400);
    assert.match(r.data.error, /unsafe file path/);
  }

  // client comment anchored to an element at a given device size
  const c = new FormData();
  c.append('author_name', 'Jane');
  c.append('screen_id', String(r.data?.screens?.[1]?.id ?? (await api('GET', `/api/projects/${projectId}`)).data.screens[1].id));
  c.append('kind', 'change');
  c.append('body', 'Make the hero image bigger');
  c.append('x', '0.5');
  c.append('y', '0.5');
  c.append('device', 'mobile');
  c.append('anchor', JSON.stringify({ page: 'index.html', selector: 'body > img:nth-of-type(1)', fx: 0.5, fy: 0.25, px: 100, py: 200, vw: 390 }));
  r = await api('POST', `/api/share/${shareToken}/comments`, c, { agency: false });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const saved = r.data.comments.at(-1);
  assert.equal(saved.device, 'mobile');
  assert.equal(JSON.parse(saved.anchor).selector, 'body > img:nth-of-type(1)');
  assert.ok(r.data.screens[1].current_version.site_token, 'client gets the site token to view it');
});

test('sign-ups close after the first account unless the email domain is allowed', async () => {
  const fresh = createApp(openDb(path.join(dir, 'signup.db')), { mailer });
  const srv = await new Promise((resolve) => {
    const x = fresh.listen(0, () => resolve(x));
  });
  const url = `http://127.0.0.1:${srv.address().port}/api/auth/register`;
  const register = (email) =>
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, name: 'X', password: 'password1' }) });
  delete process.env.ALLOW_SIGNUPS;
  try {
    assert.equal((await register('owner@studio.test')).status, 200, 'first account always allowed');
    assert.equal((await register('stranger@gmail.test')).status, 403);
    process.env.SIGNUP_EMAIL_DOMAINS = 'studio.test, other.test';
    assert.equal((await register('teammate@studio.test')).status, 200);
    assert.equal((await register('stranger@gmail.test')).status, 403);
  } finally {
    delete process.env.SIGNUP_EMAIL_DOMAINS;
    process.env.ALLOW_SIGNUPS = 'true';
    srv.closeAllConnections();
    srv.close();
  }
});

test('a zip with several pages becomes one review page per HTML file, updated together', async () => {
  const { zipSync, strToU8 } = await import('fflate');
  await api('POST', '/api/auth/register', { email: 'split@studio.test', name: 'Studio', password: 'password1' });
  let r = await api('POST', '/api/projects', { name: 'Trinax', notify_emails: 'pm@studio.test' });
  const projectId = r.data.project.id;
  const nav = '<a href="play.html">Play</a><a href="reward.html">Reward</a><a href="capture.html">Capture</a>';
  const site = (label) =>
    zipSync({
      'TRINAX GO! - Website 3/index.html': strToU8(`<html><body>${nav}<img src="images/a.png">${label}</body></html>`),
      'TRINAX GO! - Website 3/play.html': strToU8(`<html><body>${nav}play ${label}</body></html>`),
      'TRINAX GO! - Website 3/capture.html': strToU8(`<html><body>${nav}capture</body></html>`),
      'TRINAX GO! - Website 3/reward.html': strToU8(`<html><body>${nav}reward</body></html>`),
      'TRINAX GO! - Website 3/images/a.png': new Uint8Array([137, 80, 78, 71]),
      'TRINAX GO! - Website 3/partials/footer.html': strToU8('<footer></footer>'),
      '__MACOSX/TRINAX GO! - Website 3/._index.html': strToU8('junk'),
    });

  let fd = new FormData();
  fd.append('title', 'TRINAX GO! - Website 3');
  fd.append('file', new Blob([site('v1')], { type: 'application/zip' }), 'TRINAX GO! - Website 3.zip');
  r = await api('POST', `/api/projects/${projectId}/screens`, fd);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(
    r.data.screens.map((s) => [s.title, s.current_version.entry]),
    [['Home', 'index.html'], ['Play', 'play.html'], ['Reward', 'reward.html'], ['Capture', 'capture.html']],
    'menu order, nested partials ignored',
  );
  assert.match(r.data.upload_note, /added as 4 review pages: Home, Play, Reward, Capture/);
  const stored = new Set(r.data.screens.map((s) => s.current_version.stored_name));
  assert.equal(stored.size, 1, 'pages share one upload');
  const tokens = new Set(r.data.screens.map((s) => s.current_version.site_token));
  assert.equal(tokens.size, 4, 'each page has its own link');
  let page = await fetch(`${base}/sites/${r.data.screens[1].current_version.site_token}/play.html`);
  assert.match(await page.text(), /play v1/);

  // new version uploaded on one page updates all four, and adds pages that are new in the zip
  const play = r.data.screens[1];
  const zip2 = site('v2');
  const { unzipSync } = await import('fflate');
  const withNew = zipSync({ ...unzipSync(zip2), 'TRINAX GO! - Website 3/interact.html': strToU8('<html>interact</html>') });
  fd = new FormData();
  fd.append('file', new Blob([withNew], { type: 'application/zip' }), 'TRINAX v2.zip');
  r = await api('POST', `/api/projects/${projectId}/screens/${play.id}/versions`, fd);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.screens.length, 5);
  assert.deepEqual(r.data.screens.map((s) => s.versions.length), [2, 2, 2, 2, 1]);
  assert.equal(r.data.screens[4].title, 'Interact');
  assert.match(r.data.upload_note, /updated .*Home.*; added new page Interact/);
  page = await fetch(`${base}/sites/${r.data.screens[1].current_version.site_token}/play.html`);
  assert.match(await page.text(), /play v2/);

  // deleting one page keeps the shared files for the others
  r = await api('DELETE', `/api/projects/${projectId}/screens/${r.data.screens[0].id}`);
  page = await fetch(`${base}/sites/${r.data.screens[0].current_version.site_token}/play.html`);
  assert.equal(page.status, 200);
});

test('a page added later on its own uses the images and pages of the earlier upload', async () => {
  const { zipSync, strToU8 } = await import('fflate');
  await api('POST', '/api/auth/register', { email: 'later@studio.test', name: 'Studio', password: 'password1' });
  let r = await api('POST', '/api/projects', { name: 'Trinax', notify_emails: 'pm@studio.test' });
  const { id: projectId, share_token: shareToken } = r.data.project;
  const nav = '<a href="index.html">Home</a><a href="play.html">Play</a><a href="about.html">About</a>';
  const zip = zipSync({
    'site/index.html': strToU8(`<html><body>${nav}<img src="images/hero.png"></body></html>`),
    'site/play.html': strToU8(`<html><body>${nav}<img src="images/play.png"></body></html>`),
    'site/images/hero.png': new Uint8Array([137, 80, 78, 71, 1]),
    'site/images/play.png': new Uint8Array([137, 80, 78, 71, 2]),
  });
  let fd = new FormData();
  fd.append('file', new Blob([zip], { type: 'application/zip' }), 'site.zip');
  r = await api('POST', `/api/projects/${projectId}/screens`, fd);
  assert.equal(r.data.screens.length, 2);
  const firstUpload = r.data.screens[0].current_version.stored_name;

  // client submits round 1, then the agency adds the forgotten About page on its own
  for (const s of r.data.screens) {
    await api('POST', `/api/share/${shareToken}/screens/${s.id}/reviewed`, { author_name: 'Jane' }, { agency: false });
  }
  await api('POST', `/api/share/${shareToken}/submit`, { author_name: 'Jane' }, { agency: false });
  fd = new FormData();
  fd.append('file', new Blob([`<html><body>${nav}<img src="images/play.png"><img src="images/about.png"></body></html>`], { type: 'text/html' }), 'about.html');
  r = await api('POST', `/api/projects/${projectId}/screens`, fd);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const about = r.data.screens.at(-1);
  assert.equal(about.current_version.entry, 'about.html');
  assert.equal(about.current_version.asset_base, firstUpload, 'linked to the earlier upload');
  assert.equal(about.current_version.site_group, r.data.screens[0].current_version.site_group, 'same page group');
  assert.deepEqual(r.data.upload_warning.files, ['images/about.png'], 'only the truly missing image is reported');
  assert.deepEqual(r.data.upload_warning.pages, [], 'links to Home and Play resolve to the earlier upload');
  assert.match(r.data.upload_note, /About added for round 2\. The client already submitted round 1; .*Reopen round 1/);
  assert.equal(about.current_version.round, 2);

  // reopening round 1 lets the client review the forgotten page there; it is relabelled as round 1
  r = await api('POST', `/api/projects/${projectId}/advance`, { action: 'reopen' });
  assert.equal(r.data.project.stage, 'review');
  assert.equal(r.data.project.current_round, 1);
  assert.equal(r.data.screens.at(-1).current_version.round, 1);
  let sub = await api('POST', `/api/share/${shareToken}/submit`, { author_name: 'Jane' }, { agency: false });
  assert.equal(sub.status, 409, 'Jane still has to review About');
  await api('POST', `/api/share/${shareToken}/screens/${about.id}/reviewed`, { author_name: 'Jane' }, { agency: false });
  sub = await api('POST', `/api/share/${shareToken}/submit`, { author_name: 'Jane' }, { agency: false });
  assert.equal(sub.data.project.stage, 'revising', 'only the new page needed reviewing');

  let res = await fetch(`${base}/sites/${about.current_version.site_token}/~desktop/images/play.png`);
  assert.equal(res.status, 200, 'shared image served from the earlier upload');
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [137, 80, 78, 71, 2]);
  res = await fetch(`${base}/sites/${about.current_version.site_token}/~desktop/play.html`);
  assert.match(await res.text(), /images\/play\.png/, 'other pages reachable through the menu');

  // a later full zip including about.html updates the About page instead of adding a duplicate
  const zip2 = zipSync({
    'site/index.html': strToU8(`<html><body>${nav}v2</body></html>`),
    'site/play.html': strToU8(`<html><body>${nav}v2</body></html>`),
    'site/about.html': strToU8(`<html><body>${nav}about v2</body></html>`),
  });
  fd = new FormData();
  fd.append('file', new Blob([zip2], { type: 'application/zip' }), 'site-v2.zip');
  r = await api('POST', `/api/projects/${projectId}/screens/${r.data.screens[0].id}/versions`, fd);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.screens.length, 3, 'no duplicate About page');
  assert.deepEqual(r.data.screens.map((s) => s.versions.length), [2, 2, 2]);

  // deleting Home keeps the earlier upload that About's first version still relies on
  await api('DELETE', `/api/projects/${projectId}/screens/${r.data.screens[0].id}`);
  res = await fetch(`${base}/sites/${about.current_version.site_token}/images/play.png`);
  assert.equal(res.status, 200);
});

test('agency can delete several pages, or all of them, in one go', async () => {
  const { zipSync, strToU8 } = await import('fflate');
  await api('POST', '/api/auth/register', { email: 'bulk@studio.test', name: 'Studio', password: 'password1' });
  let r = await api('POST', '/api/projects', { name: 'Wrong upload', notify_emails: 'pm@studio.test' });
  const { id: projectId, share_token: shareToken } = r.data.project;
  const zip = zipSync({
    'site/index.html': strToU8('<html><body><a href="a.html">A</a><a href="b.html">B</a></body></html>'),
    'site/a.html': strToU8('<html>a</html>'),
    'site/b.html': strToU8('<html>b</html>'),
  });
  let fd = new FormData();
  fd.append('file', new Blob([zip], { type: 'application/zip' }), 'site.zip');
  r = await api('POST', `/api/projects/${projectId}/screens`, fd);
  fd = new FormData();
  fd.append('file', pdfBlob(), 'extra.pdf');
  r = await api('POST', `/api/projects/${projectId}/screens`, fd);
  assert.equal(r.data.screens.length, 4);
  const [home, a, b, pdf] = r.data.screens;
  await api('POST', `/api/share/${shareToken}/join`, { name: 'Jane' }, { agency: false });
  await api('POST', `/api/share/${shareToken}/comments`, { author_name: 'Jane', screen_id: a.id, kind: 'love', x: 0.1, y: 0.1 }, { agency: false });

  r = await api('POST', `/api/projects/${projectId}/screens/bulk-delete`, { ids: [] });
  assert.equal(r.status, 400);
  r = await api('POST', `/api/projects/${projectId}/screens/bulk-delete`, { ids: [a.id, b.id, 999999] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.screens.map((s) => s.id), [home.id, pdf.id]);
  assert.equal(r.data.comments.length, 0, 'comments on deleted pages go too');
  let page = await fetch(`${base}/sites/${home.current_version.site_token}/index.html`);
  assert.equal(page.status, 200, 'shared zip kept for the remaining page');

  // another agency cannot touch these pages
  const otherCookie = cookie;
  await api('POST', '/api/auth/register', { email: 'bulk2@studio.test', name: 'Other', password: 'password1' });
  r = await api('POST', `/api/projects/${projectId}/screens/bulk-delete`, { all: true });
  assert.equal(r.status, 404);
  cookie = otherCookie;

  r = await api('POST', `/api/projects/${projectId}/screens/bulk-delete`, { all: true });
  assert.equal(r.status, 200);
  assert.equal(r.data.screens.length, 0);
  assert.match(r.data.events[0].message, /All 2 pages removed/);
  page = await fetch(`${base}/sites/${home.current_version.site_token}/index.html`);
  assert.equal(page.status, 404, 'files removed once no page uses them');
});
