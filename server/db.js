import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

-- stage: review   -> client is commenting on current_round
--        revising -> client submitted current_round, agency is working on it
--        final    -> final design uploaded, waiting for client approval
--        approved -> client approved, development started
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  client_name TEXT NOT NULL DEFAULT '',
  welcome_message TEXT NOT NULL DEFAULT '',
  share_token TEXT NOT NULL UNIQUE,
  max_rounds INTEGER NOT NULL DEFAULT 3,
  current_round INTEGER NOT NULL DEFAULT 1,
  stage TEXT NOT NULL DEFAULT 'review',
  live_url TEXT NOT NULL DEFAULT '',
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS screens (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- round = the review round this file is meant for; max_rounds + 1 means "final"
CREATE TABLE IF NOT EXISTS versions (
  id INTEGER PRIMARY KEY,
  screen_id INTEGER NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  screen_id INTEGER NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL,
  round INTEGER NOT NULL,
  pdf_page INTEGER NOT NULL DEFAULT 1,
  x REAL NOT NULL,
  y REAL NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  agency_reply TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY,
  comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  stored_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS screen_reviews (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  screen_id INTEGER NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  reviewer_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (screen_id, round, reviewer_name)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  actor TEXT NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-agency outgoing email account (Zoho Mail, Gmail or any SMTP). Password is encrypted.
CREATE TABLE IF NOT EXISTS mail_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'com',
  zoho_account TEXT NOT NULL DEFAULT 'business',
  host TEXT NOT NULL DEFAULT '',
  port INTEGER NOT NULL DEFAULT 465,
  username TEXT NOT NULL,
  password_enc TEXT NOT NULL,
  from_name TEXT NOT NULL DEFAULT '',
  verified_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_screen ON comments(screen_id);
CREATE INDEX IF NOT EXISTS idx_versions_screen ON versions(screen_id);
CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id);
`;

export function openDb(file = path.join(DATA_DIR, 'portal.db')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Additive migrations for databases created by earlier versions. */
function migrate(db) {
  const has = (table, column) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!has('projects', 'notify_emails')) {
    db.exec(`ALTER TABLE projects ADD COLUMN notify_emails TEXT NOT NULL DEFAULT ''`);
  }
  if (!has('projects', 'team_token')) {
    db.exec(`ALTER TABLE projects ADD COLUMN team_token TEXT`);
  }
  const missing = db.prepare('SELECT id FROM projects WHERE team_token IS NULL').all();
  const setToken = db.prepare('UPDATE projects SET team_token = ? WHERE id = ?');
  for (const { id } of missing) setToken.run(crypto.randomBytes(18).toString('base64url'), id);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_team_token ON projects(team_token)');
  // HTML prototypes: versions can be a static site; comments can be anchored to page elements.
  if (!has('versions', 'kind')) db.exec(`ALTER TABLE versions ADD COLUMN kind TEXT NOT NULL DEFAULT 'pdf'`);
  if (!has('versions', 'site_token')) db.exec('ALTER TABLE versions ADD COLUMN site_token TEXT');
  if (!has('versions', 'entry')) db.exec('ALTER TABLE versions ADD COLUMN entry TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_versions_site_token ON versions(site_token)');
  if (!has('comments', 'anchor')) db.exec('ALTER TABLE comments ADD COLUMN anchor TEXT');
  if (!has('comments', 'device')) db.exec('ALTER TABLE comments ADD COLUMN device TEXT');
  if (!has('comments', 'status_changed_at')) {
    db.exec(`ALTER TABLE comments ADD COLUMN status_changed_at TEXT`);
  }
}

/** Run fn inside a transaction. */
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
