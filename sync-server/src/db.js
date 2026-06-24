import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

const dir = path.dirname(config.dbPath);
fs.mkdirSync(dir, { recursive: true });

export const db = new DatabaseSync(config.dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS github_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    delivery_id TEXT NOT NULL UNIQUE,
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    branch TEXT,
    before_sha TEXT,
    after_sha TEXT,
    pusher TEXT,
    commit_count INTEGER NOT NULL DEFAULT 0,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_github_events_repo
    ON github_events(owner, repo, id);
`);

export function insertGithubEvent(event) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO github_events (
      event_type,
      delivery_id,
      owner,
      repo,
      branch,
      before_sha,
      after_sha,
      pusher,
      commit_count,
      payload_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    event.eventType,
    event.deliveryId,
    event.owner,
    event.repo,
    event.branch || null,
    event.beforeSha || null,
    event.afterSha || null,
    event.pusher || null,
    event.commitCount || 0,
    JSON.stringify(event.payload),
  );
}

export function listEvents({ owner, repo, sinceId = 0, limit = 50 }) {
  const stmt = db.prepare(`
    SELECT
      id,
      event_type,
      delivery_id,
      owner,
      repo,
      branch,
      before_sha,
      after_sha,
      pusher,
      commit_count,
      created_at
    FROM github_events
    WHERE owner = ? AND repo = ? AND id > ?
    ORDER BY id ASC
    LIMIT ?
  `);

  return stmt.all(owner, repo, Number(sinceId) || 0, Math.min(Number(limit) || 50, 200));
}

export function latestEvent({ owner, repo }) {
  const stmt = db.prepare(`
    SELECT
      id,
      event_type,
      owner,
      repo,
      branch,
      after_sha,
      created_at
    FROM github_events
    WHERE owner = ? AND repo = ?
    ORDER BY id DESC
    LIMIT 1
  `);

  return stmt.get(owner, repo) || null;
}
