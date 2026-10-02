import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR, tx } from './db.js';
import {
  createMailer,
  decryptSecret,
  encryptSecret,
  explainMailError,
  smtpOptions,
  ZOHO_REGIONS,
} from './mailer.js';
import { parseEmails, roundSubmittedEmail } from './emails.js';
import { isHtmlName, isZipName, serveSiteFile, storeSite } from './sites.js';
import { fileURLToPath } from 'node:url';

const FRAME_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public', 'frame.js');
const DEVICES = ['desktop', 'laptop', 'tablet', 'mobile'];

/** Removes a stored upload: a single file, or a whole folder for HTML sites. */
const removeStored = (storedName) => fs.rmSync(path.join(UPLOAD_DIR, storedName), { recursive: true, force: true });

const SESSION_COOKIE = 'portal_session';
const SESSION_DAYS = 30;
const PRESET_KINDS = ['love', 'like', 'great', 'change', 'question'];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

const token = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');

const cleanName = (name) => String(name ?? '').trim().slice(0, 80);

function storedUpload(file, allowed) {
  if (!file) fail(400, 'No file uploaded');
  if (!allowed.includes(file.mimetype)) {
    fs.rmSync(file.path, { force: true });
    fail(400, `Unsupported file type: ${file.mimetype}`);
  }
  return path.basename(file.path);
}

/** Validates the notify list; at least one address is required. */
function requireEmails(input) {
  const { emails, invalid } = parseEmails(input);
  if (invalid.length) fail(400, `Not a valid email: ${invalid.join(', ')}`);
  if (!emails.length) fail(400, 'Add at least one email to notify when the client submits a round');
  return emails.join(', ');
}

/**
 * Where a comment sits on an HTML page: the clicked element (CSS selector) and the click position
 * inside it, plus page coordinates as a fallback if the element can't be found later.
 */
function parseAnchor(raw) {
  if (!raw) return null;
  let a;
  try {
    a = JSON.parse(raw);
  } catch {
    fail(400, 'Invalid comment position');
  }
  const num = (n, max) => Math.min(max, Math.max(0, Number(n) || 0));
  return {
    page: String(a.page ?? '').slice(0, 500),
    selector: String(a.selector ?? '').slice(0, 2000),
    fx: num(a.fx, 1),
    fy: num(a.fy, 1),
    px: num(a.px, 1e6),
    py: num(a.py, 1e7),
    vw: num(a.vw, 1e4) || 1440,
  };
}

export function createApp(db, { mailer = createMailer() } = {}) {
  const app = express();
  const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 150 * 1024 * 1024 } });
  const imageUpload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 15 * 1024 * 1024, files: 6 } });

  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? true : process.env.TRUST_PROXY);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // ---------- data helpers ----------

  const q = {
    project: db.prepare('SELECT * FROM projects WHERE id = ?'),
    projectByToken: db.prepare('SELECT * FROM projects WHERE share_token = ?'),
    projectByTeamToken: db.prepare('SELECT * FROM projects WHERE team_token = ?'),
    screens: db.prepare('SELECT * FROM screens WHERE project_id = ? ORDER BY position, id'),
    screen: db.prepare('SELECT * FROM screens WHERE id = ? AND project_id = ?'),
    versions: db.prepare(
      `SELECT v.* FROM versions v JOIN screens s ON s.id = v.screen_id
       WHERE s.project_id = ? ORDER BY v.id`,
    ),
    version: db.prepare(
      `SELECT v.* FROM versions v JOIN screens s ON s.id = v.screen_id
       WHERE v.id = ? AND s.project_id = ?`,
    ),
    comments: db.prepare('SELECT * FROM comments WHERE project_id = ? ORDER BY id'),
    comment: db.prepare('SELECT * FROM comments WHERE id = ? AND project_id = ?'),
    attachments: db.prepare(
      `SELECT a.* FROM attachments a JOIN comments c ON c.id = a.comment_id
       WHERE c.project_id = ? ORDER BY a.id`,
    ),
    attachment: db.prepare(
      `SELECT a.* FROM attachments a JOIN comments c ON c.id = a.comment_id
       WHERE a.id = ? AND c.project_id = ?`,
    ),
    reviews: db.prepare('SELECT * FROM screen_reviews WHERE project_id = ?'),
    events: db.prepare('SELECT * FROM events WHERE project_id = ? ORDER BY id DESC LIMIT 200'),
    addEvent: db.prepare(
      'INSERT INTO events (project_id, round, actor, type, message) VALUES (?, ?, ?, ?, ?)',
    ),
  };

  const logEvent = (project, actor, type, message) =>
    q.addEvent.run(project.id, project.current_round, actor, type, message);

  /** Everything a viewer (agency or client) needs to render a project. */
  function projectBundle(project, { forClient }) {
    const versions = q.versions.all(project.id);
    const attachments = q.attachments.all(project.id);
    const screens = q.screens.all(project.id).map((s) => {
      const own = versions.filter((v) => v.screen_id === s.id);
      return { ...s, versions: own, current_version: own.at(-1) ?? null };
    });
    const comments = q.comments.all(project.id).map((c) => ({
      ...c,
      attachments: attachments.filter((a) => a.comment_id === c.id).map((a) => a.id),
    }));
    const out = {
      project: publicProject(project, { forClient }),
      screens: forClient ? screens.filter((s) => s.current_version) : screens,
      comments,
      reviews: q.reviews.all(project.id),
      events: q.events.all(project.id),
    };
    return out;
  }

  function publicProject(p, { forClient }) {
    const { owner_id, ...rest } = p;
    if (forClient) {
      // Never leak the team link or the agency's notification list to the client.
      delete rest.team_token;
      delete rest.notify_emails;
      const owner = db.prepare('SELECT name FROM users WHERE id = ?').get(owner_id);
      rest.agency_name = owner?.name ?? '';
    }
    return rest;
  }

  const clientCanComment = (p) => p.stage === 'review';

  // Health check for the hosting platform: confirms the app is up and the database answers.
  app.get('/api/health', (req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ ok: true });
  });

  // ---------- auth ----------

  function currentUser(req) {
    const t = req.cookies?.[SESSION_COOKIE];
    if (!t) return null;
    return (
      db
        .prepare(
          `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.token = ? AND s.expires_at > datetime('now')`,
        )
        .get(t) ?? null
    );
  }

  /**
   * Secure cookies only over HTTPS. Safari (unlike Chrome) refuses to store a Secure cookie on
   * http://localhost, which would make sign-in silently fail when running the production build locally.
   */
  const useSecureCookie = (req) =>
    req.secure ||
    (process.env.NODE_ENV === 'production' &&
      process.env.INSECURE_COOKIES !== '1' &&
      !['localhost', '127.0.0.1', '::1'].includes(req.hostname));

  function startSession(req, res, userId) {
    const t = token(32);
    db.prepare(
      `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`,
    ).run(t, userId);
    res.cookie(SESSION_COOKIE, t, {
      httpOnly: true,
      sameSite: 'lax',
      secure: useSecureCookie(req),
      maxAge: SESSION_DAYS * 86400_000,
    });
  }

  const requireUser = (req, res, next) => {
    req.user = currentUser(req);
    if (!req.user) return res.status(401).json({ error: 'Please sign in' });
    next();
  };

  /** Loads :projectId for the signed-in agency user. */
  function ownedProject(req) {
    const p = q.project.get(Number(req.params.projectId));
    if (!p || p.owner_id !== req.user.id) fail(404, 'Project not found');
    return p;
  }

  /** Loads the project behind a team (agency staff) link from a notification email. */
  function teamProject(req) {
    const p = q.projectByTeamToken.get(String(req.params.teamToken));
    if (!p) fail(404, 'This team link is not valid');
    return p;
  }

  /** Loads the project behind a client share link. */
  function sharedProject(req) {
    const p = q.projectByToken.get(String(req.params.token));
    if (!p) fail(404, 'This review link is not valid');
    return p;
  }

  /**
   * Who may create an agency account: anyone while the portal has no accounts (first-run setup),
   * then only addresses on SIGNUP_EMAIL_DOMAINS (e.g. "yourstudio.com"), or anyone if ALLOW_SIGNUPS=true.
   */
  function signupAllowed(email) {
    if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) return true;
    if (process.env.ALLOW_SIGNUPS === 'true') return true;
    const domains = String(process.env.SIGNUP_EMAIL_DOMAINS ?? '')
      .split(/[\s,]+/)
      .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean);
    return domains.includes(email.split('@')[1]);
  }

  app.post('/api/auth/register', (req, res) => {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const name = cleanName(req.body.name);
    const password = String(req.body.password ?? '');
    if (!/^\S+@\S+\.\S+$/.test(email)) fail(400, 'Enter a valid email');
    if (!name) fail(400, 'Enter your agency name');
    if (password.length < 8) fail(400, 'Password must be at least 8 characters');
    if (!signupAllowed(email)) {
      fail(403, 'Sign-ups are closed on this portal. Ask your admin to add your email domain, or to create your account.');
    }
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) fail(409, 'That email is already registered');
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)')
      .run(email, name, hashPassword(password));
    startSession(req, res, Number(lastInsertRowid));
    res.json({ user: { id: Number(lastInsertRowid), email, name } });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !verifyPassword(String(req.body.password ?? ''), user.password_hash)) {
      fail(401, 'Wrong email or password');
    }
    startSession(req, res, user.id);
    res.json({ user: { id: user.id, email: user.email, name: user.name } });
  });

  app.post('/api/auth/logout', (req, res) => {
    const t = req.cookies?.[SESSION_COOKIE];
    if (t) db.prepare('DELETE FROM sessions WHERE token = ?').run(t);
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    res.json({ user: currentUser(req) });
  });

  // ---------- agency: projects ----------

  app.get('/api/projects', requireUser, (req, res) => {
    const projects = db
      .prepare(
        `SELECT p.*,
           (SELECT COUNT(*) FROM screens s WHERE s.project_id = p.id) AS screen_count,
           (SELECT COUNT(*) FROM comments c WHERE c.project_id = p.id AND c.round = p.current_round) AS round_comment_count,
           (SELECT COUNT(*) FROM comments c WHERE c.project_id = p.id AND c.status = 'open' AND c.kind IN ('change', 'question')) AS open_comment_count
         FROM projects p WHERE p.owner_id = ? ORDER BY p.id DESC`,
      )
      .all(req.user.id);
    res.json({ projects });
  });

  app.post('/api/projects', requireUser, (req, res) => {
    const name = cleanName(req.body.name);
    if (!name) fail(400, 'Give the project a name');
    const notifyEmails = requireEmails(req.body.notify_emails);
    const maxRounds = Math.min(10, Math.max(1, Number(req.body.max_rounds) || 3));
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO projects (owner_id, name, client_name, welcome_message, share_token, team_token, max_rounds, notify_emails)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        req.user.id,
        name,
        cleanName(req.body.client_name),
        String(req.body.welcome_message ?? '').slice(0, 2000),
        token(18),
        token(18),
        maxRounds,
        notifyEmails,
      );
    const project = q.project.get(Number(lastInsertRowid));
    logEvent(project, req.user.name, 'created', `Project "${name}" created`);
    res.json({ project });
  });

  app.get('/api/projects/:projectId', requireUser, (req, res) => {
    res.json(projectBundle(ownedProject(req), { forClient: false }));
  });

  app.patch('/api/projects/:projectId', requireUser, (req, res) => {
    const p = ownedProject(req);
    const next = {
      name: req.body.name !== undefined ? cleanName(req.body.name) || p.name : p.name,
      client_name: req.body.client_name !== undefined ? cleanName(req.body.client_name) : p.client_name,
      welcome_message:
        req.body.welcome_message !== undefined ? String(req.body.welcome_message).slice(0, 2000) : p.welcome_message,
      live_url: req.body.live_url !== undefined ? String(req.body.live_url).trim().slice(0, 500) : p.live_url,
      max_rounds:
        req.body.max_rounds !== undefined
          ? Math.min(10, Math.max(p.current_round, Number(req.body.max_rounds) || p.max_rounds))
          : p.max_rounds,
    };
    next.notify_emails = req.body.notify_emails !== undefined ? requireEmails(req.body.notify_emails) : p.notify_emails;
    if (next.live_url && !/^https?:\/\//i.test(next.live_url)) next.live_url = `https://${next.live_url}`;
    db.prepare(
      `UPDATE projects SET name = ?, client_name = ?, welcome_message = ?, live_url = ?, max_rounds = ?, notify_emails = ?
       WHERE id = ?`,
    ).run(next.name, next.client_name, next.welcome_message, next.live_url, next.max_rounds, next.notify_emails, p.id);
    if (next.live_url && next.live_url !== p.live_url) {
      logEvent(p, req.user.name, 'live_url', `Live site shared: ${next.live_url}`);
    }
    res.json(projectBundle(q.project.get(p.id), { forClient: false }));
  });

  app.delete('/api/projects/:projectId', requireUser, (req, res) => {
    const p = ownedProject(req);
    const files = [
      ...db
        .prepare('SELECT v.stored_name FROM versions v JOIN screens s ON s.id = v.screen_id WHERE s.project_id = ?')
        .all(p.id),
      ...q.attachments.all(p.id),
    ];
    db.prepare('DELETE FROM projects WHERE id = ?').run(p.id);
    for (const f of files) removeStored(f.stored_name);
    res.json({ ok: true });
  });

  /**
   * Stage transitions driven by the agency:
   *  - next_round: revising -> review (round + 1), only while rounds remain
   *  - send_final: revising -> final
   *  - reopen:     revising -> review (same round), e.g. client submitted too early
   */
  app.post('/api/projects/:projectId/advance', requireUser, (req, res) => {
    const p = ownedProject(req);
    const action = req.body.action;
    if (action === 'next_round') {
      if (p.stage !== 'revising') fail(409, 'The client has not submitted this round yet');
      if (p.current_round >= p.max_rounds) fail(409, 'All revision rounds are used — send the final design instead');
      db.prepare(`UPDATE projects SET stage = 'review', current_round = current_round + 1 WHERE id = ?`).run(p.id);
      logEvent(q.project.get(p.id), req.user.name, 'round_started', `Round ${p.current_round + 1} opened for review`);
    } else if (action === 'send_final') {
      if (p.stage !== 'revising') fail(409, 'The client has not submitted this round yet');
      db.prepare(`UPDATE projects SET stage = 'final' WHERE id = ?`).run(p.id);
      logEvent(p, req.user.name, 'final_sent', 'Final design sent for approval');
    } else if (action === 'reopen') {
      if (p.stage !== 'revising') fail(409, 'This round is already open');
      db.prepare(`UPDATE projects SET stage = 'review' WHERE id = ?`).run(p.id);
      logEvent(p, req.user.name, 'round_reopened', `Round ${p.current_round} reopened for more feedback`);
    } else {
      fail(400, 'Unknown action');
    }
    res.json(projectBundle(q.project.get(p.id), { forClient: false }));
  });

  // ---------- agency: screens & versions ----------

  /** Which round a freshly uploaded file belongs to, given the project stage. */
  const uploadRound = (p) =>
    p.stage === 'review' ? p.current_round : p.stage === 'revising' ? p.current_round + 1 : p.max_rounds + 1;

  /** Stores an uploaded design: a PDF, a single .html page, or a .zip of a static site. */
  const addVersion = (p, screenId, file) => {
    if (!file) fail(400, 'No file uploaded');
    const round = Math.min(uploadRound(p), p.max_rounds + 1);
    const name = file.originalname.slice(0, 200);
    if (isHtmlName(name) || isZipName(name)) {
      const { storedName, entry } = storeSite(file);
      db.prepare(
        `INSERT INTO versions (screen_id, round, original_name, stored_name, kind, site_token, entry)
         VALUES (?, ?, ?, ?, 'html', ?, ?)`,
      ).run(screenId, round, name, storedName, token(18), entry);
      return;
    }
    const stored = storedUpload(file, ['application/pdf']);
    db.prepare('INSERT INTO versions (screen_id, round, original_name, stored_name) VALUES (?, ?, ?, ?)').run(
      screenId,
      round,
      name,
      stored,
    );
  };

  app.post('/api/projects/:projectId/screens', requireUser, upload.single('file'), (req, res) => {
    const p = ownedProject(req);
    if (p.stage === 'approved') fail(409, 'This project is already approved');
    const title = cleanName(req.body.title) || cleanName(req.file?.originalname?.replace(/\.(pdf|html?|zip)$/i, ''));
    if (!title) fail(400, 'Give the page a title');
    tx(db, () => {
      const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM screens WHERE project_id = ?').get(p.id).n;
      const { lastInsertRowid } = db
        .prepare('INSERT INTO screens (project_id, title, note, position) VALUES (?, ?, ?, ?)')
        .run(p.id, title, String(req.body.note ?? '').slice(0, 1000), pos);
      if (req.file) addVersion(p, Number(lastInsertRowid), req.file);
    });
    logEvent(p, req.user.name, 'screen_added', `Page "${title}" added`);
    res.json(projectBundle(q.project.get(p.id), { forClient: false }));
  });

  app.patch('/api/projects/:projectId/screens/:screenId', requireUser, (req, res) => {
    const p = ownedProject(req);
    const s = q.screen.get(Number(req.params.screenId), p.id) ?? fail(404, 'Page not found');
    db.prepare('UPDATE screens SET title = ?, note = ? WHERE id = ?').run(
      req.body.title !== undefined ? cleanName(req.body.title) || s.title : s.title,
      req.body.note !== undefined ? String(req.body.note).slice(0, 1000) : s.note,
      s.id,
    );
    res.json(projectBundle(q.project.get(p.id), { forClient: false }));
  });

  app.post('/api/projects/:projectId/reorder', requireUser, (req, res) => {
    const p = ownedProject(req);
    const move = db.prepare('UPDATE screens SET position = ? WHERE id = ? AND project_id = ?');
    tx(db, () => (req.body.order ?? []).forEach((id, i) => move.run(i, Number(id), p.id)));
    res.json(projectBundle(q.project.get(p.id), { forClient: false }));
  });

  app.delete('/api/projects/:projectId/screens/:screenId', requireUser, (req, res) => {
    const p = ownedProject(req);
    const s = q.screen.get(Number(req.params.screenId), p.id) ?? fail(404, 'Page not found');
    const files = db.prepare('SELECT stored_name FROM versions WHERE screen_id = ?').all(s.id);
    files.push(
      ...db
        .prepare('SELECT a.stored_name FROM attachments a JOIN comments c ON c.id = a.comment_id WHERE c.screen_id = ?')
        .all(s.id),
    );
    db.prepare('DELETE FROM screens WHERE id = ?').run(s.id);
    for (const f of files) removeStored(f.stored_name);
    logEvent(p, req.user.name, 'screen_removed', `Page "${s.title}" removed`);
    res.json(projectBundle(q.project.get(p.id), { forClient: false }));
  });

  app.post(
    '/api/projects/:projectId/screens/:screenId/versions',
    requireUser,
    upload.single('file'),
    (req, res) => {
      const p = ownedProject(req);
      if (p.stage === 'approved') fail(409, 'This project is already approved');
      const s = q.screen.get(Number(req.params.screenId), p.id) ?? fail(404, 'Page not found');
      addVersion(p, s.id, req.file);
      const round = Math.min(uploadRound(p), p.max_rounds + 1);
      const label = round > p.max_rounds ? 'final version' : `round ${round} version`;
      logEvent(p, req.user.name, 'version_uploaded', `New ${label} of "${s.title}" uploaded`);
      res.json(projectBundle(q.project.get(p.id), { forClient: false }));
    },
  );

  // ---------- agency: comments ----------

  /** Status/reply changes made by the agency, from the dashboard or a team link. */
  function updateComment(p, req) {
    const c = q.comment.get(Number(req.params.commentId), p.id) ?? fail(404, 'Comment not found');
    const status = req.body.status !== undefined ? String(req.body.status) : c.status;
    if (!['open', 'done', 'wontfix'].includes(status)) fail(400, 'Unknown status');
    const reply = req.body.agency_reply !== undefined ? String(req.body.agency_reply).slice(0, 4000) : c.agency_reply;
    db.prepare(
      `UPDATE comments SET status = ?, agency_reply = ?,
         status_changed_at = CASE WHEN status = ? THEN status_changed_at ELSE datetime('now') END
       WHERE id = ?`,
    ).run(status, reply, status, c.id);
  }

  app.patch('/api/projects/:projectId/comments/:commentId', requireUser, (req, res) => {
    const p = ownedProject(req);
    updateComment(p, req);
    res.json(projectBundle(q.project.get(p.id), { forClient: false }));
  });

  // ---------- agency team link (from notification emails, no sign-in) ----------

  app.get('/api/team/:teamToken', (req, res) => {
    res.json(projectBundle(teamProject(req), { forClient: false }));
  });

  app.patch('/api/team/:teamToken/comments/:commentId', (req, res) => {
    const p = teamProject(req);
    updateComment(p, req);
    res.json(projectBundle(q.project.get(p.id), { forClient: false }));
  });

  app.get('/api/team/:teamToken/versions/:versionId/file', (req, res) => {
    const p = teamProject(req);
    const v = q.version.get(Number(req.params.versionId), p.id) ?? fail(404, 'File not found');
    sendStored(res, v.stored_name, 'application/pdf', v.original_name);
  });

  app.get('/api/team/:teamToken/attachments/:attachmentId', (req, res) => {
    const p = teamProject(req);
    const a = q.attachment.get(Number(req.params.attachmentId), p.id) ?? fail(404, 'File not found');
    sendStored(res, a.stored_name, a.mime);
  });

  // ---------- files ----------

  const sendStored = (res, storedName, mime, downloadName) => {
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (downloadName) res.setHeader('Content-Disposition', `inline; filename="${downloadName.replace(/"/g, '')}"`);
    res.sendFile(path.join(UPLOAD_DIR, storedName));
  };

  app.get('/api/projects/:projectId/versions/:versionId/file', requireUser, (req, res) => {
    const p = ownedProject(req);
    const v = q.version.get(Number(req.params.versionId), p.id) ?? fail(404, 'File not found');
    sendStored(res, v.stored_name, 'application/pdf', v.original_name);
  });

  app.get('/api/projects/:projectId/attachments/:attachmentId', requireUser, (req, res) => {
    const p = ownedProject(req);
    const a = q.attachment.get(Number(req.params.attachmentId), p.id) ?? fail(404, 'File not found');
    sendStored(res, a.stored_name, a.mime);
  });

  app.get('/api/share/:token/versions/:versionId/file', (req, res) => {
    const p = sharedProject(req);
    const v = q.version.get(Number(req.params.versionId), p.id) ?? fail(404, 'File not found');
    sendStored(res, v.stored_name, 'application/pdf', v.original_name);
  });

  app.get('/api/share/:token/attachments/:attachmentId', (req, res) => {
    const p = sharedProject(req);
    const a = q.attachment.get(Number(req.params.attachmentId), p.id) ?? fail(404, 'File not found');
    sendStored(res, a.stored_name, a.mime);
  });

  // ---------- client (share link, no account) ----------

  app.get('/api/share/:token', (req, res) => {
    res.json(projectBundle(sharedProject(req), { forClient: true }));
  });

  app.post('/api/share/:token/join', (req, res) => {
    const p = sharedProject(req);
    const name = cleanName(req.body.name);
    if (!name) fail(400, 'Please enter your name');
    logEvent(p, name, 'joined', `${name} opened the review`);
    res.json({ ok: true });
  });

  app.post('/api/share/:token/comments', imageUpload.array('images', 6), (req, res) => {
    const p = sharedProject(req);
    const cleanup = () => (req.files ?? []).forEach((f) => fs.rmSync(f.path, { force: true }));
    try {
      if (!clientCanComment(p)) fail(409, 'This round is closed for comments');
      const author = cleanName(req.body.author_name) || fail(400, 'Please enter your name first');
      const s = q.screen.get(Number(req.body.screen_id), p.id) ?? fail(404, 'Page not found');
      const kind = PRESET_KINDS.includes(req.body.kind) ? req.body.kind : fail(400, 'Unknown comment type');
      const body = String(req.body.body ?? '').trim().slice(0, 5000);
      if ((kind === 'change' || kind === 'question') && !body && !req.files?.length) {
        fail(400, 'Tell us a bit more so we can get it right');
      }
      const clamp = (n) => Math.min(1, Math.max(0, Number(n) || 0));
      const version = db.prepare('SELECT id FROM versions WHERE screen_id = ? ORDER BY id DESC LIMIT 1').get(s.id);
      const anchor = parseAnchor(req.body.anchor);
      const device = DEVICES.includes(req.body.device) ? req.body.device : null;
      const files = (req.files ?? []).map((f) => ({
        stored: storedUpload(f, ['image/png', 'image/jpeg', 'image/gif', 'image/webp']),
        mime: f.mimetype,
      }));
      tx(db, () => {
        const { lastInsertRowid } = db
          .prepare(
            `INSERT INTO comments (project_id, screen_id, version_id, round, pdf_page, x, y, kind, body, author_name, anchor, device)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            p.id,
            s.id,
            version?.id ?? null,
            p.current_round,
            Math.max(1, Number(req.body.pdf_page) || 1),
            clamp(req.body.x),
            clamp(req.body.y),
            kind,
            body,
            author,
            anchor ? JSON.stringify(anchor) : null,
            device,
          );
        const addAtt = db.prepare('INSERT INTO attachments (comment_id, stored_name, mime) VALUES (?, ?, ?)');
        for (const f of files) addAtt.run(Number(lastInsertRowid), f.stored, f.mime);
      });
    } catch (err) {
      cleanup();
      throw err;
    }
    res.json(projectBundle(q.project.get(p.id), { forClient: true }));
  });

  app.delete('/api/share/:token/comments/:commentId', (req, res) => {
    const p = sharedProject(req);
    const c = q.comment.get(Number(req.params.commentId), p.id) ?? fail(404, 'Comment not found');
    if (!clientCanComment(p) || c.round !== p.current_round) fail(409, 'Comments from a submitted round can’t be changed');
    if (c.author_name !== cleanName(req.body.author_name)) fail(403, 'You can only remove your own comments');
    const files = db.prepare('SELECT stored_name FROM attachments WHERE comment_id = ?').all(c.id);
    db.prepare('DELETE FROM comments WHERE id = ?').run(c.id);
    for (const f of files) removeStored(f.stored_name);
    res.json(projectBundle(q.project.get(p.id), { forClient: true }));
  });

  app.post('/api/share/:token/screens/:screenId/reviewed', (req, res) => {
    const p = sharedProject(req);
    const s = q.screen.get(Number(req.params.screenId), p.id) ?? fail(404, 'Page not found');
    const name = cleanName(req.body.author_name) || fail(400, 'Please enter your name first');
    if (req.body.reviewed === false) {
      db.prepare('DELETE FROM screen_reviews WHERE screen_id = ? AND round = ? AND reviewer_name = ?').run(
        s.id,
        p.current_round,
        name,
      );
    } else {
      db.prepare(
        'INSERT OR IGNORE INTO screen_reviews (project_id, screen_id, round, reviewer_name) VALUES (?, ?, ?, ?)',
      ).run(p.id, s.id, p.current_round, name);
    }
    res.json(projectBundle(q.project.get(p.id), { forClient: true }));
  });

  app.post('/api/share/:token/submit', (req, res) => {
    const p = sharedProject(req);
    if (p.stage !== 'review') fail(409, 'This round has already been submitted');
    const name = cleanName(req.body.author_name) || fail(400, 'Please enter your name first');
    const unreviewed = db
      .prepare(
        `SELECT COUNT(*) AS n FROM screens s
         WHERE s.project_id = ?
           AND EXISTS (SELECT 1 FROM versions v WHERE v.screen_id = s.id)
           AND NOT EXISTS (SELECT 1 FROM screen_reviews r
                           WHERE r.screen_id = s.id AND r.round = ? AND r.reviewer_name = ?)`,
      )
      .get(p.id, p.current_round, name).n;
    if (unreviewed > 0) fail(409, 'Please review every page before submitting this round');
    const count = db
      .prepare('SELECT COUNT(*) AS n FROM comments WHERE project_id = ? AND round = ?')
      .get(p.id, p.current_round).n;
    db.prepare(`UPDATE projects SET stage = 'revising' WHERE id = ?`).run(p.id);
    logEvent(
      p,
      name,
      'round_submitted',
      `${name} submitted round ${p.current_round} of ${p.max_rounds} with ${count} comment${count === 1 ? '' : 's'}`,
    );
    res.json(projectBundle(q.project.get(p.id), { forClient: true }));
    notifyRoundSubmitted(p, name, baseUrl(req));
  });

  app.post('/api/share/:token/approve', (req, res) => {
    const p = sharedProject(req);
    if (p.stage !== 'final') fail(409, 'There is no final design waiting for approval');
    const name = cleanName(req.body.author_name) || fail(400, 'Please enter your name first');
    db.prepare(`UPDATE projects SET stage = 'approved', approved_by = ?, approved_at = datetime('now') WHERE id = ?`).run(
      name,
      p.id,
    );
    logEvent(p, name, 'approved', `${name} approved the final design — development can start 🚀`);
    res.json(projectBundle(q.project.get(p.id), { forClient: true }));
  });

  // ---------- agency email account (Zoho Mail / Gmail / SMTP) ----------

  const PROVIDERS = ['zoho', 'gmail', 'smtp'];

  /** Saved settings for a user with the password decrypted, or null. */
  function mailSettingsFor(userId) {
    const row = db.prepare('SELECT * FROM mail_settings WHERE user_id = ?').get(userId);
    if (!row) return null;
    try {
      return { ...row, password: decryptSecret(row.password_enc) };
    } catch {
      return null; // key changed; treat as not configured
    }
  }

  const publicMailSettings = (row) =>
    row && {
      provider: row.provider,
      region: row.region,
      zoho_account: row.zoho_account,
      host: row.host,
      port: row.port,
      username: row.username,
      from_name: row.from_name,
      verified_at: row.verified_at,
      has_password: true,
      server: smtpOptions(row).host,
    };

  /** Validates a settings form; a blank password keeps the saved one. */
  function readMailForm(req) {
    const b = req.body ?? {};
    const provider = PROVIDERS.includes(b.provider) ? b.provider : fail(400, 'Choose Zoho Mail, Gmail or another provider');
    const username = String(b.username ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) fail(400, 'Enter the email address you send from');
    const saved = mailSettingsFor(req.user.id);
    let password = String(b.password ?? '');
    // Google shows app passwords in groups of four ("abcd efgh ijkl mnop"); the spaces aren't part of it.
    if (provider === 'gmail') password = password.replace(/\s+/g, '');
    password ||= saved?.password;
    if (!password) fail(400, provider === 'smtp' ? 'Enter the password' : 'Enter the app password');
    const form = {
      provider,
      region: ZOHO_REGIONS[b.region] ? b.region : 'com',
      zoho_account: b.zoho_account === 'personal' ? 'personal' : 'business',
      host: String(b.host ?? '').trim(),
      port: Number(b.port) || 465,
      username,
      password,
      from_name: cleanName(b.from_name) || req.user.name,
    };
    if (provider === 'smtp' && !/^[\w.-]+$/.test(form.host)) fail(400, 'Enter the SMTP server, e.g. smtp.example.com');
    return form;
  }

  app.get('/api/mail-settings', requireUser, (req, res) => {
    res.json({
      settings: publicMailSettings(mailSettingsFor(req.user.id)),
      zoho_regions: Object.entries(ZOHO_REGIONS).map(([value, r]) => ({ value, label: r.label })),
      server_default: mailer.envConfigured,
    });
  });

  /** Logs in to the mail server and sends a test email to the signed-in user before saving. */
  app.put('/api/mail-settings', requireUser, async (req, res) => {
    const form = readMailForm(req);
    try {
      await mailer.verify(form);
      await mailer.send(
        {
          to: req.user.email,
          subject: 'Your review portal can send email ✅',
          text: `This is a test from your Design Review Portal. Round notifications will be sent from ${form.username}.`,
          html: `<p>This is a test from your Design Review Portal. ✅</p><p>Round notifications will be sent from <strong>${form.username}</strong>.</p>`,
        },
        { settings: form },
      );
    } catch (err) {
      fail(400, explainMailError(err, form.provider));
    }
    db.prepare(
      `INSERT INTO mail_settings (user_id, provider, region, zoho_account, host, port, username, password_enc, from_name, verified_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET provider = excluded.provider, region = excluded.region,
         zoho_account = excluded.zoho_account, host = excluded.host, port = excluded.port,
         username = excluded.username, password_enc = excluded.password_enc, from_name = excluded.from_name,
         verified_at = excluded.verified_at, updated_at = excluded.updated_at`,
    ).run(
      req.user.id,
      form.provider,
      form.region,
      form.zoho_account,
      form.host,
      form.port,
      form.username,
      encryptSecret(form.password),
      form.from_name,
    );
    res.json({ settings: publicMailSettings(mailSettingsFor(req.user.id)), test_sent_to: req.user.email });
  });

  app.delete('/api/mail-settings', requireUser, (req, res) => {
    db.prepare('DELETE FROM mail_settings WHERE user_id = ?').run(req.user.id);
    res.json({ settings: null });
  });

  // ---------- notifications ----------

  const baseUrl = (req) => (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');

  /** Emails the agency's notify list after a round is submitted. Runs after the response; never throws. */
  async function notifyRoundSubmitted(p, author, base) {
    const to = parseEmails(p.notify_emails).emails;
    if (!to.length) return;
    try {
      const bundle = projectBundle(p, { forClient: false });
      const email = roundSubmittedEmail({
        project: p,
        round: p.current_round,
        author,
        screens: bundle.screens,
        comments: bundle.comments.filter((c) => c.round === p.current_round),
        teamUrl: `${base}/t/${p.team_token}?round=${p.current_round}`,
        adminUrl: `${base}/projects/${p.id}`,
      });
      const settings = mailSettingsFor(p.owner_id);
      const info = await mailer.send({ to: to.join(', '), ...email }, { settings });
      logEvent(
        p,
        'Portal',
        info?.outbox ? 'email_outbox' : 'email_sent',
        info?.outbox
          ? `Round ${p.current_round} summary not sent: no email account set up (saved to the outbox instead)`
          : `Round ${p.current_round} summary emailed to ${to.join(', ')}${settings ? ` from ${settings.username}` : ''}`,
      );
    } catch (err) {
      console.error('[mail] failed to send round notification', err);
      const settings = mailSettingsFor(p.owner_id);
      logEvent(
        p,
        'Portal',
        'email_failed',
        `Couldn’t email the round ${p.current_round} summary: ${explainMailError(err, settings?.provider)}`,
      );
    }
  }

  // ---------- uploaded HTML prototypes ----------

  // The site token is unguessable and only handed to people who can see the project, the same
  // model as the share link. Pages are sandboxed by serveSiteFile.
  app.get('/__portal/frame.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.type('text/javascript').sendFile(FRAME_SCRIPT);
  });

  app.get(['/sites/:siteToken', '/sites/:siteToken/*rest'], (req, res) => {
    const v = db.prepare(`SELECT * FROM versions WHERE site_token = ? AND kind = 'html'`).get(req.params.siteToken);
    if (!v) return res.status(404).type('text/plain').send('Not found');
    const rest = [].concat(req.params.rest ?? []).join('/');
    if (!rest) return res.redirect(`/sites/${v.site_token}/${v.entry}`);
    serveSiteFile(res, v.stored_name, v.site_token, rest);
  });

  // ---------- errors ----------

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large' : err.message });
    }
    const status = err.status ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message });
  });

  return app;
}
