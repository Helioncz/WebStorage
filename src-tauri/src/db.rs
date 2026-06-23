use rusqlite::Connection;

/// SQL schema MVP. Spousti se idempotentne pri kazdem odemceni.
pub const SCHEMA: &str = r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    client       TEXT,
    type         TEXT,
    status       TEXT NOT NULL DEFAULT 'active',
    priority     TEXT NOT NULL DEFAULT 'normal',
    description  TEXT,
    main_note    TEXT,
    tags         TEXT,            -- carkou oddelene stitky (MVP)
    color        TEXT,
    is_favorite  INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    last_opened_at TEXT,
    deleted_at   TEXT
);

CREATE TABLE IF NOT EXISTS project_files (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    ext         TEXT,
    mime        TEXT,
    blob_hash   TEXT NOT NULL,   -- SHA-256, soubor lezi v objects/<aa>/<hash>
    size        INTEGER NOT NULL,
    is_main     INTEGER NOT NULL DEFAULT 0,
    is_pinned   INTEGER NOT NULL DEFAULT 0,
    comment     TEXT,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_links (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    url         TEXT NOT NULL,
    type        TEXT,
    description TEXT,
    is_pinned   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_credentials (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    type        TEXT,
    username    TEXT,
    secret      TEXT,            -- ulozeno v sifrovane DB (SQLCipher)
    url         TEXT,
    note        TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_notes (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    body_md     TEXT,
    type        TEXT DEFAULT 'doc',
    is_internal INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_tasks (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    status      TEXT NOT NULL DEFAULT 'new',
    priority    TEXT NOT NULL DEFAULT 'normal',
    due_date    TEXT,
    created_at  TEXT NOT NULL,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS project_events (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    title       TEXT NOT NULL,
    is_automatic INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);

-- Fulltext index (cestina: bez diakritiky)
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    entity_type,
    entity_id,
    project_id,
    title,
    content,
    tokenize = 'unicode61 remove_diacritics 2'
);

CREATE INDEX IF NOT EXISTS idx_files_project   ON project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_links_project   ON project_links(project_id);
CREATE INDEX IF NOT EXISTS idx_creds_project   ON project_credentials(project_id);
CREATE INDEX IF NOT EXISTS idx_notes_project   ON project_notes(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project   ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_events_project  ON project_events(project_id);
"#;

/// Aplikuje schema na otevrene (a odemcene) spojeni.
pub fn apply_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(SCHEMA)
}
