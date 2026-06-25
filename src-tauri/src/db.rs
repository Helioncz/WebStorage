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

<<<<<<< Updated upstream
CREATE TABLE IF NOT EXISTS app_settings (
=======
-- Klic/hodnota konfigurace (cloud sync apod.) — uvnitr sifrovane DB
CREATE TABLE IF NOT EXISTS app_config (
>>>>>>> Stashed changes
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

-- Verzovani souboru: starsi verze blobu (CAS dedup podle hashe)
CREATE TABLE IF NOT EXISTS project_file_versions (
    id          TEXT PRIMARY KEY,
    file_id     TEXT NOT NULL REFERENCES project_files(id) ON DELETE CASCADE,
    blob_hash   TEXT NOT NULL,
    size        INTEGER NOT NULL,
    comment     TEXT,
    created_at  TEXT NOT NULL
);

-- Sablony projektu: ulozeny payload (typ, stitky, ukoly, odkazy, poznamka)
CREATE TABLE IF NOT EXISTS project_templates (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    description  TEXT,
    payload_json TEXT NOT NULL,    -- JSON: { type, tags, tasks[], links[], note }
    is_builtin   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL
);

-- Monitoring webu: dostupnost + expirace SSL
CREATE TABLE IF NOT EXISTS project_monitors (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    label           TEXT NOT NULL,
    url             TEXT NOT NULL,
    enabled         INTEGER NOT NULL DEFAULT 1,
    last_status     INTEGER,        -- HTTP kod, 0 = nedostupne
    last_ok         INTEGER,        -- 1 = ok
    last_latency_ms INTEGER,
    last_error      TEXT,
    ssl_expires_at  TEXT,           -- ISO datum konce platnosti certifikatu
    last_checked_at TEXT,
    created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fileversions_file ON project_file_versions(file_id);
CREATE INDEX IF NOT EXISTS idx_monitors_project  ON project_monitors(project_id);
CREATE INDEX IF NOT EXISTS idx_files_project   ON project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_links_project   ON project_links(project_id);
CREATE INDEX IF NOT EXISTS idx_creds_project   ON project_credentials(project_id);
CREATE INDEX IF NOT EXISTS idx_notes_project   ON project_notes(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project   ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_events_project  ON project_events(project_id);
"#;

/// Aplikuje schema na otevrene (a odemcene) spojeni.
pub fn apply_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(SCHEMA)?;
    seed_builtin_templates(conn);
    Ok(())
}

/// Vestavene sablony (idempotentne, podle stabilniho ID).
fn seed_builtin_templates(conn: &Connection) {
    let builtins = [
        (
            "tpl-web",
            "Webová prezentace",
            "Klasický firemní web na klíč",
            serde_json::json!({
                "type": "web",
                "tags": "web,prezentace",
                "tasks": ["Sběr podkladů od klienta", "Návrh designu", "Naprogramování webu",
                          "Naplnění obsahem", "Nasazení na doménu", "Předání klientovi"],
                "links": [
                    {"title": "Web (produkce)", "url": "https://", "type": "web"},
                    {"title": "Administrace", "url": "https://", "type": "admin"}
                ],
                "note": "## Web na klíč\n\nPostup: podklady → design → realizace → nasazení → předání."
            }),
        ),
        (
            "tpl-eshop",
            "E-shop",
            "Internetový obchod",
            serde_json::json!({
                "type": "eshop",
                "tags": "eshop,obchod",
                "tasks": ["Sběr sortimentu", "Návrh kategorií", "Platební brána", "Doprava a doručení",
                          "Import produktů", "Testovací objednávka", "Spuštění"],
                "links": [
                    {"title": "E-shop", "url": "https://", "type": "web"},
                    {"title": "Administrace", "url": "https://", "type": "admin"},
                    {"title": "Platební brána", "url": "https://", "type": "service"}
                ],
                "note": "## E-shop\n\nNezapomenout: platby, doprava, GDPR, obchodní podmínky."
            }),
        ),
        (
            "tpl-servis",
            "Servisní zakázka",
            "Údržba / úprava existujícího webu",
            serde_json::json!({
                "type": "service",
                "tags": "servis,udrzba",
                "tasks": ["Zjistit požadavek", "Zálohovat web", "Provést úpravu", "Otestovat", "Předat"],
                "links": [],
                "note": "## Servisní zakázka\n\nPřed zásahem vždy záloha!"
            }),
        ),
    ];
    for (id, name, desc, payload) in builtins {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO project_templates (id, name, description, payload_json, is_builtin, created_at)
             VALUES (?1, ?2, ?3, ?4, 1, datetime('now'))",
            rusqlite::params![id, name, desc, payload.to_string()],
        );
    }
}
