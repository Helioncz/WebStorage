mod crypto;
mod db;
mod files;
mod git;
mod netlify;
mod sites;
mod templates;

use chrono::Utc;
use rusqlite::types::ValueRef;
use rusqlite::{params, Connection, Params, ToSql};
use serde_json::{Map, Value};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};
use uuid::Uuid;

// ----------------------------- Stav aplikace -----------------------------

struct Inner {
    conn: Option<Connection>,
    vault_dir: PathBuf,
}

pub struct AppState {
    inner: Mutex<Inner>,
    sites_root: sites::SharedRoot,
    preview_port: u16,
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

fn new_id() -> String {
    Uuid::new_v4().to_string()
}

// ----------------------------- Pomocnici DB ------------------------------

/// Spusti SELECT a vrati radky jako pole JSON objektu.
fn query_json<P: Params>(conn: &Connection, sql: &str, p: P) -> Result<Vec<Value>, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let cols: Vec<String> = stmt
        .column_names()
        .iter()
        .map(|s| s.to_string())
        .collect();
    let rows = stmt
        .query_map(p, |row| {
            let mut map = Map::new();
            for (i, name) in cols.iter().enumerate() {
                let v = match row.get_ref(i)? {
                    ValueRef::Null => Value::Null,
                    ValueRef::Integer(n) => Value::from(n),
                    ValueRef::Real(f) => Value::from(f),
                    ValueRef::Text(t) => Value::from(String::from_utf8_lossy(t).into_owned()),
                    ValueRef::Blob(_) => Value::Null,
                };
                map.insert(name.clone(), v);
            }
            Ok(Value::Object(map))
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn log_event(conn: &Connection, project_id: &str, etype: &str, title: &str) {
    let _ = conn.execute(
        "INSERT INTO project_events (id, project_id, type, title, is_automatic, created_at)
         VALUES (?1, ?2, ?3, ?4, 1, ?5)",
        params![new_id(), project_id, etype, title, now()],
    );
}

/// Prepise zaznam v fulltext indexu pro danou entitu.
fn reindex(conn: &Connection, etype: &str, id: &str, project_id: &str, title: &str, content: &str) {
    let _ = conn.execute(
        "DELETE FROM search_index WHERE entity_type = ?1 AND entity_id = ?2",
        params![etype, id],
    );
    let _ = conn.execute(
        "INSERT INTO search_index (entity_type, entity_id, project_id, title, content)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![etype, id, project_id, title, content],
    );
}

fn set_setting_kv(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = ?2",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn get_setting_kv(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        params![key],
        |r| r.get::<_, Option<String>>(0),
    )
    .ok()
    .flatten()
}

/// Vychozi web_root = slozka obsahujici `sites/` (a `site-templates/`).
/// V dev rezimu je cwd src-tauri, takze <repo> je o uroven vyse.
fn resolve_default_sites_root() -> PathBuf {
    if let Ok(cwd) = std::env::current_dir() {
        for cand in [cwd.clone(), cwd.join(".."), cwd.join("../..")] {
            if cand.join("sites").is_dir() || cand.join("site-templates").is_dir() {
                return cand.canonicalize().unwrap_or(cand);
            }
        }
        return cwd;
    }
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home).join("HangarSites");
    }
    PathBuf::from(".")
}

fn open_keyed(db_path: &PathBuf, key_hex: &str) -> Result<Connection, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.execute_batch(&format!("PRAGMA key = \"x'{key_hex}'\";"))
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", true).ok();
    // Overeni klice: pri spatnem hesle SQLCipher neprecte hlavicku.
    conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get::<_, i64>(0))
        .map_err(|_| "Spatne heslo nebo poskozena databaze".to_string())?;
    Ok(conn)
}

// ----------------------------- Vault: zamek ------------------------------

#[derive(serde::Serialize)]
struct VaultStatus {
    initialized: bool,
    unlocked: bool,
}

#[tauri::command]
fn vault_status(state: State<AppState>) -> VaultStatus {
    let g = state.inner.lock().unwrap();
    VaultStatus {
        initialized: g.vault_dir.join("vault.db").exists(),
        unlocked: g.conn.is_some(),
    }
}

#[tauri::command]
fn initialize(password: String, state: State<AppState>) -> Result<(), String> {
    if password.len() < 8 {
        return Err("Master heslo musi mit alespon 8 znaku.".into());
    }
    let mut g = state.inner.lock().unwrap();
    fs::create_dir_all(&g.vault_dir).map_err(|e| e.to_string())?;
    let salt_path = g.vault_dir.join("vault.salt");
    let db_path = g.vault_dir.join("vault.db");
    if db_path.exists() {
        return Err("Vault uz existuje, pouzij odemceni.".into());
    }
    let salt = crypto::generate_salt();
    fs::write(&salt_path, salt).map_err(|e| e.to_string())?;
    let key = crypto::derive_key_hex(&password, &salt)?;
    let conn = open_keyed(&db_path, &key)?;
    db::apply_schema(&conn).map_err(|e| e.to_string())?;
    g.conn = Some(conn);
    Ok(())
}

#[tauri::command]
fn unlock(password: String, state: State<AppState>) -> Result<(), String> {
    let mut g = state.inner.lock().unwrap();
    let salt_path = g.vault_dir.join("vault.salt");
    let db_path = g.vault_dir.join("vault.db");
    let salt = fs::read(&salt_path).map_err(|_| "Sul nenalezena, vault neni inicializovan.".to_string())?;
    let key = crypto::derive_key_hex(&password, &salt)?;
    let conn = open_keyed(&db_path, &key)?;
    db::apply_schema(&conn).map_err(|e| e.to_string())?;
    // Nacti ulozenou cestu k webum (pokud uzivatel nastavil vlastni).
    if let Some(v) = get_setting_kv(&conn, "sites_root") {
        if !v.is_empty() {
            *state.sites_root.lock().unwrap() = PathBuf::from(v);
        }
    }
    g.conn = Some(conn);
    Ok(())
}

#[tauri::command]
fn lock(state: State<AppState>) {
    let mut g = state.inner.lock().unwrap();
    g.conn = None;
}

/// Smaze trezor (vault.db + salt) — umozni zalozit novy s jinym heslem.
/// POZOR: smaze ulozene tokeny/nastaveni; slozky webu (sites/) zustanou.
#[tauri::command]
fn reset_vault(state: State<AppState>) -> Result<(), String> {
    let mut g = state.inner.lock().unwrap();
    g.conn = None;
    let _ = fs::remove_file(g.vault_dir.join("vault.db"));
    let _ = fs::remove_file(g.vault_dir.join("vault.salt"));
    Ok(())
}

/// Verze aplikace (z Cargo.toml).
#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Zaloha trezoru: zazipuje vault.db + vault.salt do `dest`.
#[tauri::command]
fn backup_vault(dest: String, state: State<AppState>) -> Result<(), String> {
    use std::io::Write as _;
    let dir = { state.inner.lock().unwrap().vault_dir.clone() };
    let db = dir.join("vault.db");
    if !db.exists() {
        return Err("Trezor zatím neexistuje.".into());
    }
    let file = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let opts: zip::write::FileOptions<()> =
        zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for name in ["vault.db", "vault.salt"] {
        let path = dir.join(name);
        if path.exists() {
            zip.start_file(name, opts).map_err(|e| e.to_string())?;
            let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
            zip.write_all(&bytes).map_err(|e| e.to_string())?;
        }
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

// ----------------------------- Projekty ----------------------------------

#[tauri::command]
fn list_projects(state: State<AppState>) -> Result<Vec<Value>, String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    query_json(
        conn,
        "SELECT * FROM projects WHERE deleted_at IS NULL
         ORDER BY is_favorite DESC, datetime(updated_at) DESC",
        params![],
    )
}

#[tauri::command]
fn get_project(id: String, state: State<AppState>) -> Result<Value, String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    let mut rows = query_json(conn, "SELECT * FROM projects WHERE id = ?1", params![id])?;
    rows.pop().ok_or_else(|| "Projekt nenalezen.".into())
}

#[tauri::command]
fn create_project(
    name: String,
    client: Option<String>,
    ptype: Option<String>,
    state: State<AppState>,
) -> Result<String, String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    let id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO projects (id, name, client, type, status, priority, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'active', 'normal', ?5, ?5)",
        params![id, name, client, ptype, ts],
    )
    .map_err(|e| e.to_string())?;
    log_event(conn, &id, "created", &format!("Projekt zalozen: {name}"));
    reindex(conn, "project", &id, &id, &name, client.as_deref().unwrap_or(""));
    Ok(id)
}

// ----------------------------- Sablony -----------------------------------

#[tauri::command]
fn list_templates() -> Vec<Value> {
    templates::metadata()
}

/// Zalozi projekt podle sablony: predvyplni ukoly, odkazy, pristupy, poznamku
/// a (u webovych sablon) nakopiruje startovaci kod webu do souboru projektu.
#[tauri::command]
fn create_project_from_template(
    template_key: String,
    name: String,
    client: Option<String>,
    state: State<AppState>,
) -> Result<String, String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    let t = templates::find(&template_key).ok_or("Sablona nenalezena.")?;

    let id = new_id();
    let ts = now();
    let ptype = if t.ptype.is_empty() { None } else { Some(t.ptype) };
    conn.execute(
        "INSERT INTO projects (id, name, client, type, status, priority, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'active', 'normal', ?5, ?5)",
        params![id, name, client, ptype, ts],
    )
    .map_err(|e| e.to_string())?;
    log_event(conn, &id, "created", &format!("Projekt ze sablony „{}\": {name}", t.name));
    reindex(conn, "project", &id, &id, &name, client.as_deref().unwrap_or(""));

    // Ukoly
    for task in t.tasks {
        conn.execute(
            "INSERT INTO project_tasks (id, project_id, title, status, priority, created_at)
             VALUES (?1, ?2, ?3, 'new', ?4, ?5)",
            params![new_id(), id, task.title, task.priority, now()],
        )
        .map_err(|e| e.to_string())?;
    }
    // Odkazy
    for l in t.links {
        conn.execute(
            "INSERT INTO project_links (id, project_id, title, url, type, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![new_id(), id, l.title, l.url, l.ltype, now()],
        )
        .map_err(|e| e.to_string())?;
    }
    // Pristupy (prazdne, jako placeholdery k vyplneni)
    for c in t.creds {
        conn.execute(
            "INSERT INTO project_credentials (id, project_id, title, type, username, secret, url, note, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, '', '', '', '', ?5, ?5)",
            params![new_id(), id, c.title, c.ctype, now()],
        )
        .map_err(|e| e.to_string())?;
    }
    // Poznamka (predavaci protokol apod.)
    if !t.note_body.is_empty() {
        let nid = new_id();
        conn.execute(
            "INSERT INTO project_notes (id, project_id, title, body_md, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![nid, id, t.note_title, t.note_body, now()],
        )
        .map_err(|e| e.to_string())?;
        reindex(conn, "note", &nid, &id, t.note_title, t.note_body);
    }
    // Startovaci kod webu do CAS uloziste
    for f in t.files {
        let bytes = f.content.as_bytes();
        let hash = files::store_object(&g.vault_dir, bytes)?;
        let ext = std::path::Path::new(f.name)
            .extension()
            .map(|s| s.to_string_lossy().into_owned());
        let fid = new_id();
        conn.execute(
            "INSERT INTO project_files (id, project_id, name, ext, blob_hash, size, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![fid, id, f.name, ext, hash, bytes.len() as i64, now()],
        )
        .map_err(|e| e.to_string())?;
        reindex(conn, "file", &fid, &id, f.name, "");
    }
    if !t.files.is_empty() {
        log_event(conn, &id, "file_added", &format!("Startovaci kod webu ({} soubory)", t.files.len()));
    }

    Ok(id)
}

#[tauri::command]
fn update_project(id: String, fields: Value, state: State<AppState>) -> Result<(), String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    // Whitelist editovatelnych poli.
    let allowed = [
        "name", "client", "type", "status", "priority", "description", "main_note", "tags",
        "color", "is_favorite",
    ];
    let obj = fields.as_object().ok_or("fields musi byt objekt")?;
    for (k, v) in obj {
        if !allowed.contains(&k.as_str()) {
            continue;
        }
        let sql = format!("UPDATE projects SET {k} = ?1, updated_at = ?2 WHERE id = ?3");
        let val: Box<dyn ToSql> = match v {
            Value::Null => Box::new(Option::<String>::None),
            Value::Bool(b) => Box::new(*b as i64),
            Value::Number(n) => Box::new(n.as_i64().unwrap_or(0)),
            Value::String(s) => Box::new(s.clone()),
            _ => continue,
        };
        conn.execute(&sql, params![val.as_ref(), now(), id]).map_err(|e| e.to_string())?;
    }
    // Reindex po uprave.
    if let Ok(p) = get_project_row(conn, &id) {
        let name = p.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let content = format!(
            "{} {} {}",
            p.get("client").and_then(|v| v.as_str()).unwrap_or(""),
            p.get("description").and_then(|v| v.as_str()).unwrap_or(""),
            p.get("tags").and_then(|v| v.as_str()).unwrap_or(""),
        );
        reindex(conn, "project", &id, &id, name, &content);
    }
    Ok(())
}

fn get_project_row(conn: &Connection, id: &str) -> Result<Value, String> {
    let mut rows = query_json(conn, "SELECT * FROM projects WHERE id = ?1", params![id])?;
    rows.pop().ok_or_else(|| "Projekt nenalezen.".into())
}

#[tauri::command]
fn delete_project(id: String, state: State<AppState>) -> Result<(), String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    conn.execute("DELETE FROM projects WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    let _ = conn.execute(
        "DELETE FROM search_index WHERE project_id = ?1",
        params![id],
    );
    Ok(())
}

#[tauri::command]
fn touch_opened(id: String, state: State<AppState>) -> Result<(), String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    conn.execute(
        "UPDATE projects SET last_opened_at = ?1 WHERE id = ?2",
        params![now(), id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ----------------------------- Poznamky ----------------------------------

#[tauri::command]
fn list_notes(project_id: String, state: State<AppState>) -> Result<Vec<Value>, String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    query_json(
        conn,
        "SELECT * FROM project_notes WHERE project_id = ?1 ORDER BY datetime(updated_at) DESC",
        params![project_id],
    )
}

#[tauri::command]
fn save_note(
    id: Option<String>,
    project_id: String,
    title: String,
    body_md: String,
    state: State<AppState>,
) -> Result<String, String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    let ts = now();
    let nid = match id {
        Some(existing) => {
            conn.execute(
                "UPDATE project_notes SET title = ?1, body_md = ?2, updated_at = ?3 WHERE id = ?4",
                params![title, body_md, ts, existing],
            )
            .map_err(|e| e.to_string())?;
            existing
        }
        None => {
            let nid = new_id();
            conn.execute(
                "INSERT INTO project_notes (id, project_id, title, body_md, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
                params![nid, project_id, title, body_md, ts],
            )
            .map_err(|e| e.to_string())?;
            log_event(conn, &project_id, "note_added", &format!("Poznamka: {title}"));
            nid
        }
    };
    reindex(conn, "note", &nid, &project_id, &title, &body_md);
    Ok(nid)
}

#[tauri::command]
fn delete_note(id: String, state: State<AppState>) -> Result<(), String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    conn.execute("DELETE FROM project_notes WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    let _ = conn.execute(
        "DELETE FROM search_index WHERE entity_type = 'note' AND entity_id = ?1",
        params![id],
    );
    Ok(())
}

// ----------------------------- Odkazy ------------------------------------

#[tauri::command]
fn list_links(project_id: String, state: State<AppState>) -> Result<Vec<Value>, String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    query_json(
        conn,
        "SELECT * FROM project_links WHERE project_id = ?1 ORDER BY is_pinned DESC, title",
        params![project_id],
    )
}

#[tauri::command]
fn save_link(
    id: Option<String>,
    project_id: String,
    title: String,
    url: String,
    ltype: Option<String>,
    description: Option<String>,
    state: State<AppState>,
) -> Result<String, String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    match id {
        Some(existing) => {
            conn.execute(
                "UPDATE project_links SET title=?1, url=?2, type=?3, description=?4 WHERE id=?5",
                params![title, url, ltype, description, existing],
            )
            .map_err(|e| e.to_string())?;
            Ok(existing)
        }
        None => {
            let lid = new_id();
            conn.execute(
                "INSERT INTO project_links (id, project_id, title, url, type, description, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![lid, project_id, title, url, ltype, description, now()],
            )
            .map_err(|e| e.to_string())?;
            Ok(lid)
        }
    }
}

#[tauri::command]
fn delete_link(id: String, state: State<AppState>) -> Result<(), String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    conn.execute("DELETE FROM project_links WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ----------------------------- Pristupy ----------------------------------
// Secret se uklada do sifrovane DB (SQLCipher). Ve frontendu se nezobrazuje,
// dokud si ho uzivatel vyslovne nevyzada prikazem reveal_credential.

#[tauri::command]
fn list_credentials(project_id: String, state: State<AppState>) -> Result<Vec<Value>, String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    // Zamerne nevracime sloupec `secret`.
    query_json(
        conn,
        "SELECT id, project_id, title, type, username, url, note, created_at, updated_at
         FROM project_credentials WHERE project_id = ?1 ORDER BY title",
        params![project_id],
    )
}

#[tauri::command]
fn reveal_credential(id: String, state: State<AppState>) -> Result<String, String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    conn.query_row(
        "SELECT secret FROM project_credentials WHERE id = ?1",
        params![id],
        |r| r.get::<_, Option<String>>(0),
    )
    .map_err(|e| e.to_string())
    .map(|opt| opt.unwrap_or_default())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn save_credential(
    id: Option<String>,
    project_id: String,
    title: String,
    ctype: Option<String>,
    username: Option<String>,
    secret: Option<String>,
    url: Option<String>,
    note: Option<String>,
    state: State<AppState>,
) -> Result<String, String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    let ts = now();
    match id {
        Some(existing) => {
            // Pokud secret = None, heslo nemenime.
            if secret.is_some() {
                conn.execute(
                    "UPDATE project_credentials SET title=?1, type=?2, username=?3, secret=?4, url=?5, note=?6, updated_at=?7 WHERE id=?8",
                    params![title, ctype, username, secret, url, note, ts, existing],
                ).map_err(|e| e.to_string())?;
            } else {
                conn.execute(
                    "UPDATE project_credentials SET title=?1, type=?2, username=?3, url=?4, note=?5, updated_at=?6 WHERE id=?7",
                    params![title, ctype, username, url, note, ts, existing],
                ).map_err(|e| e.to_string())?;
            }
            log_event(conn, &project_id, "cred_changed", &format!("Pristup upraven: {title}"));
            Ok(existing)
        }
        None => {
            let cid = new_id();
            conn.execute(
                "INSERT INTO project_credentials (id, project_id, title, type, username, secret, url, note, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
                params![cid, project_id, title, ctype, username, secret, url, note, ts],
            ).map_err(|e| e.to_string())?;
            log_event(conn, &project_id, "cred_changed", &format!("Pristup pridan: {title}"));
            Ok(cid)
        }
    }
}

#[tauri::command]
fn delete_credential(id: String, state: State<AppState>) -> Result<(), String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    conn.execute("DELETE FROM project_credentials WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ----------------------------- Ukoly -------------------------------------

#[tauri::command]
fn list_tasks(project_id: String, state: State<AppState>) -> Result<Vec<Value>, String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    query_json(
        conn,
        "SELECT * FROM project_tasks WHERE project_id = ?1
         ORDER BY (status='done'), datetime(due_date) IS NULL, datetime(due_date)",
        params![project_id],
    )
}

#[tauri::command]
fn save_task(
    id: Option<String>,
    project_id: String,
    title: String,
    status: String,
    priority: String,
    due_date: Option<String>,
    state: State<AppState>,
) -> Result<String, String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    let completed = if status == "done" { Some(now()) } else { None };
    match id {
        Some(existing) => {
            conn.execute(
                "UPDATE project_tasks SET title=?1, status=?2, priority=?3, due_date=?4, completed_at=?5 WHERE id=?6",
                params![title, status, priority, due_date, completed, existing],
            ).map_err(|e| e.to_string())?;
            Ok(existing)
        }
        None => {
            let tid = new_id();
            conn.execute(
                "INSERT INTO project_tasks (id, project_id, title, status, priority, due_date, created_at, completed_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![tid, project_id, title, status, priority, due_date, now(), completed],
            ).map_err(|e| e.to_string())?;
            Ok(tid)
        }
    }
}

#[tauri::command]
fn delete_task(id: String, state: State<AppState>) -> Result<(), String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    conn.execute("DELETE FROM project_tasks WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ----------------------------- Soubory (CAS) -----------------------------

#[tauri::command]
fn list_files(project_id: String, state: State<AppState>) -> Result<Vec<Value>, String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    query_json(
        conn,
        "SELECT * FROM project_files WHERE project_id = ?1
         ORDER BY is_pinned DESC, name",
        params![project_id],
    )
}

/// Importuje soubor z disku do CAS uloziste.
#[tauri::command]
fn import_file(project_id: String, src_path: String, state: State<AppState>) -> Result<String, String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    let path = PathBuf::from(&src_path);
    let bytes = fs::read(&path).map_err(|e| format!("cteni souboru: {e}"))?;
    let hash = files::store_object(&g.vault_dir, &bytes)?;
    let name = path
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "soubor".into());
    let ext = path
        .extension()
        .map(|s| s.to_string_lossy().into_owned());
    let fid = new_id();
    conn.execute(
        "INSERT INTO project_files (id, project_id, name, ext, blob_hash, size, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![fid, project_id, name, ext, hash, bytes.len() as i64, now()],
    )
    .map_err(|e| e.to_string())?;
    log_event(conn, &project_id, "file_added", &format!("Soubor: {name}"));
    reindex(conn, "file", &fid, &project_id, &name, "");
    Ok(fid)
}

/// Zkopiruje blob do docasneho souboru s puvodnim nazvem a otevre ho v OS.
#[tauri::command]
fn open_file(id: String, state: State<AppState>) -> Result<(), String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    let (name, hash): (String, String) = conn
        .query_row(
            "SELECT name, blob_hash FROM project_files WHERE id = ?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    let bytes = files::read_object(&g.vault_dir, &hash)?;
    let tmp = std::env::temp_dir().join(format!("hangar_{name}"));
    fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    tauri_plugin_opener::open_path(tmp.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_file(id: String, state: State<AppState>) -> Result<(), String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    // Blob v CAS zamerne nemazeme (muze byt sdileny / verzovany).
    conn.execute("DELETE FROM project_files WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    let _ = conn.execute(
        "DELETE FROM search_index WHERE entity_type = 'file' AND entity_id = ?1",
        params![id],
    );
    Ok(())
}

// ----------------------------- Historie ----------------------------------

#[tauri::command]
fn list_events(project_id: String, state: State<AppState>) -> Result<Vec<Value>, String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    query_json(
        conn,
        "SELECT * FROM project_events WHERE project_id = ?1 ORDER BY datetime(created_at) DESC",
        params![project_id],
    )
}

// ----------------------------- Vyhledavani -------------------------------

#[tauri::command]
fn search(query: String, state: State<AppState>) -> Result<Vec<Value>, String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    // Prefix match na poslednim slove.
    let q = format!("{}*", query.trim().replace('"', " "));
    query_json(
        conn,
        "SELECT entity_type, entity_id, project_id, title,
                snippet(search_index, 4, '[', ']', '...', 8) AS snippet
         FROM search_index WHERE search_index MATCH ?1
         ORDER BY rank LIMIT 50",
        params![q],
    )
}

// ----------------------------- Dashboard ---------------------------------

#[tauri::command]
fn dashboard(state: State<AppState>) -> Result<Value, String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    let count: i64 = conn
        .query_row(
            "SELECT count(*) FROM projects WHERE deleted_at IS NULL",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let active: i64 = conn
        .query_row(
            "SELECT count(*) FROM projects WHERE status='active' AND deleted_at IS NULL",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let recent = query_json(
        conn,
        "SELECT id, name, client, status FROM projects
         WHERE deleted_at IS NULL AND last_opened_at IS NOT NULL
         ORDER BY datetime(last_opened_at) DESC LIMIT 6",
        params![],
    )?;
    let overdue = query_json(
        conn,
        "SELECT t.id, t.title, t.due_date, p.name AS project
         FROM project_tasks t JOIN projects p ON p.id = t.project_id
         WHERE t.status NOT IN ('done','cancelled')
           AND t.due_date IS NOT NULL AND datetime(t.due_date) < datetime('now')
         ORDER BY datetime(t.due_date) LIMIT 20",
        params![],
    )?;
    Ok(serde_json::json!({
        "projects": count,
        "active": active,
        "recent": recent,
        "overdue": overdue,
    }))
}

// ----------------------------- Weby (site folders) -----------------------

#[derive(serde::Serialize)]
struct SitesConfig {
    root: String,
    preview_port: u16,
}

#[tauri::command]
fn get_sites_root(state: State<AppState>) -> SitesConfig {
    let root = state.sites_root.lock().unwrap().clone();
    SitesConfig {
        root: root.to_string_lossy().into_owned(),
        preview_port: state.preview_port,
    }
}

#[tauri::command]
fn set_sites_root(path: String, state: State<AppState>) -> Result<(), String> {
    let pb = PathBuf::from(&path);
    if !pb.is_dir() {
        return Err("Vybrana cesta neni slozka.".into());
    }
    *state.sites_root.lock().unwrap() = pb;
    let g = state.inner.lock().unwrap();
    if let Some(conn) = g.conn.as_ref() {
        set_setting_kv(conn, "sites_root", &path)?;
    }
    Ok(())
}

fn site_json(s: &sites::SiteInfo) -> Value {
    serde_json::json!({
        "slug": s.slug,
        "rel": s.rel,
        "has_index": s.has_index,
        "file_count": s.file_count,
        "title": s.title,
    })
}

/// Pracovni weby (sites/) — editujes, verzujes, deployujes.
/// K webu pripoji `name` (jmeno projektu) z nastaveni, pokud existuje.
#[tauri::command]
fn list_sites(state: State<AppState>) -> Vec<Value> {
    let root = state.sites_root.lock().unwrap().clone();
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref();
    sites::list_in(&root, "sites")
        .iter()
        .map(|s| {
            let mut v = site_json(s);
            if let Some(c) = conn {
                if let Some(name) = get_setting_kv(c, &format!("sitename:{}", s.rel)) {
                    if !name.is_empty() {
                        v["name"] = serde_json::json!(name);
                    }
                }
                if let Some(icon) = get_setting_kv(c, &format!("siteicon:{}", s.rel)) {
                    if !icon.is_empty() {
                        v["icon"] = serde_json::json!(icon);
                    }
                }
            }
            v
        })
        .collect()
}

/// Ulozi zobrazovane jmeno webu (= jmeno projektu).
#[tauri::command]
fn set_site_name(rel: String, name: String, state: State<AppState>) -> Result<(), String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    set_setting_kv(conn, &format!("sitename:{rel}"), &name)
}

/// Ulozi vlastni ikonu webu (data URL). Prazdne = smazat.
#[tauri::command]
fn set_site_icon(rel: String, data_url: String, state: State<AppState>) -> Result<(), String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    set_setting_kv(conn, &format!("siteicon:{rel}"), &data_url)
}

/// Minimalni base64 (standard alphabet).
fn b64_encode(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0];
        let b1 = *chunk.get(1).unwrap_or(&0);
        let b2 = *chunk.get(2).unwrap_or(&0);
        out.push(T[(b0 >> 2) as usize] as char);
        out.push(T[(((b0 & 0x3) << 4) | (b1 >> 4)) as usize] as char);
        out.push(if chunk.len() > 1 { T[(((b1 & 0xf) << 2) | (b2 >> 6)) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[(b2 & 0x3f) as usize] as char } else { '=' });
    }
    out
}

/// Nacte obrazek z disku jako data URL (pro upload ikony).
#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    if bytes.len() > 8 * 1024 * 1024 {
        return Err("Obrázek je příliš velký (max 8 MB).".into());
    }
    let mime = match std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    };
    Ok(format!("data:{};base64,{}", mime, b64_encode(&bytes)))
}

/// Importuje slozku z disku jako novou sablonu do site-templates/.
#[tauri::command]
fn import_template(src_path: String, name: String, state: State<AppState>) -> Result<String, String> {
    let slug: String = name
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        return Err("Zadej nazev sablony.".into());
    }
    let src = PathBuf::from(&src_path);
    if !src.is_dir() {
        return Err("Vyber slozku se soubory webu.".into());
    }
    let root = state.sites_root.lock().unwrap().clone();
    let dst = root.join("site-templates").join(&slug);
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    sites::copy_dir(&src, &dst)?;
    Ok(format!("site-templates/{slug}"))
}

/// Knihovna sablon (site-templates/) — jen ke cteni / kopirovani.
#[tauri::command]
fn list_site_templates(state: State<AppState>) -> Vec<Value> {
    let root = state.sites_root.lock().unwrap().clone();
    sites::list_in(&root, "site-templates").iter().map(site_json).collect()
}

/// Vytvori novy pracovni web zkopirovanim sablony do sites/<slug>.
#[tauri::command]
fn use_site_template(template_rel: String, new_slug: String, state: State<AppState>) -> Result<String, String> {
    let slug: String = new_slug
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        return Err("Zadej nazev webu.".into());
    }
    let root = state.sites_root.lock().unwrap().clone();
    let src = root.join(&template_rel);
    if !src.is_dir() {
        return Err("Sablona nenalezena.".into());
    }
    let dst = root.join("sites").join(&slug);
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    sites::copy_dir(&src, &dst)?;
    Ok(format!("sites/{slug}"))
}

#[tauri::command]
fn list_site_files(rel: String, state: State<AppState>) -> Vec<String> {
    let root = state.sites_root.lock().unwrap().clone();
    sites::list_site_files(&root, &rel)
}

#[tauri::command]
fn read_site_file(rel: String, path: String, state: State<AppState>) -> Result<String, String> {
    let root = state.sites_root.lock().unwrap().clone();
    let target = root.join(&rel).join(&path);
    fs::read_to_string(&target).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_site_file(rel: String, path: String, content: String, state: State<AppState>) -> Result<(), String> {
    let root = state.sites_root.lock().unwrap().clone();
    let target = root.join(&rel).join(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&target, content).map_err(|e| e.to_string())
}

/// Binarne zkopiruje soubor z disku do webu (default do assets/). Vrati rel cestu.
#[tauri::command]
fn import_asset(rel: String, src_path: String, subdir: Option<String>, state: State<AppState>) -> Result<String, String> {
    let src = PathBuf::from(&src_path);
    if !src.is_file() {
        return Err("Soubor nenalezen.".into());
    }
    let fname = src
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .ok_or("Neplatny nazev souboru.")?;
    let sub = subdir.unwrap_or_else(|| "assets".into());
    let sub = sub.trim_matches('/');
    let root = state.sites_root.lock().unwrap().clone();
    let dir = root.join(&rel).join(sub);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::copy(&src, dir.join(&fname)).map_err(|e| e.to_string())?;
    Ok(if sub.is_empty() { fname } else { format!("{sub}/{fname}") })
}

/// Smaze cely web (slozku pod sites/). Guard: jen uvnitr sites/.
#[tauri::command]
fn delete_site(rel: String, state: State<AppState>) -> Result<(), String> {
    if !rel.starts_with("sites/") || rel.contains("..") {
        return Err("Smazat lze jen pracovni web (sites/).".into());
    }
    let root = state.sites_root.lock().unwrap().clone();
    let dir = root.join(&rel);
    if dir.is_dir() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn delete_site_file(rel: String, path: String, state: State<AppState>) -> Result<(), String> {
    let root = state.sites_root.lock().unwrap().clone();
    // Ochrana proti traversal: cesta nesmi obsahovat "..".
    if path.split(['/', '\\']).any(|s| s == "..") {
        return Err("Neplatna cesta.".into());
    }
    let target = root.join(&rel).join(&path);
    if target.is_file() {
        fs::remove_file(&target).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// URL pro live preview v iframe (rel = "sites/foo" nebo "site-templates/bar").
#[tauri::command]
fn site_preview_url(rel: String, state: State<AppState>) -> String {
    format!("http://127.0.0.1:{}/{}/", state.preview_port, rel)
}

#[tauri::command]
fn open_site_folder(rel: String, state: State<AppState>) -> Result<(), String> {
    let root = state.sites_root.lock().unwrap().clone();
    let dir = root.join(&rel);
    tauri_plugin_opener::open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn export_site_zip(rel: String, dest: String, state: State<AppState>) -> Result<(), String> {
    let root = state.sites_root.lock().unwrap().clone();
    sites::zip_site(&root, &rel, &PathBuf::from(dest))
}

/// Ulozena „ziva" adresa webu (po deployi). Klic = rel.
#[tauri::command]
fn get_deploy_url(rel: String, state: State<AppState>) -> Option<String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref()?;
    get_setting_kv(conn, &format!("deploy:{rel}"))
}

#[tauri::command]
fn set_deploy_url(rel: String, url: String, state: State<AppState>) -> Result<(), String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    set_setting_kv(conn, &format!("deploy:{rel}"), &url)
}

/// Otevre adresu v systemovem prohlizeci.
#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}

// ----------------------------- GitHub ------------------------------------
// Desktop MVP: REST API pres osobni token (PAT). Token je sifrovany v trezoru
// a NIKDY se neposila do frontendu — vsechna volani injektuji token v Rustu.

#[tauri::command]
fn set_github_token(token: String, state: State<AppState>) -> Result<(), String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    set_setting_kv(conn, "github_token", &token)
}

#[tauri::command]
fn github_has_token(state: State<AppState>) -> bool {
    let g = state.inner.lock().unwrap();
    g.conn
        .as_ref()
        .and_then(|c| get_setting_kv(c, "github_token"))
        .map(|t| !t.is_empty())
        .unwrap_or(false)
}

/// Genericky GitHub API request. Method = GET/POST/PATCH/PUT/DELETE.
/// path je relativni ("/user", "/repos/...") nebo absolutni URL.
#[tauri::command]
fn github_api(
    method: String,
    path: String,
    body: Option<String>,
    state: State<AppState>,
) -> Result<Value, String> {
    let token = {
        let g = state.inner.lock().unwrap();
        let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
        get_setting_kv(conn, "github_token").unwrap_or_default()
    };
    if token.is_empty() {
        return Err("GitHub není připojen (chybí token).".into());
    }
    let url = if path.starts_with("http") {
        path
    } else {
        format!("https://api.github.com{path}")
    };
    let req = ureq::request(&method, &url)
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/vnd.github+json")
        .set("User-Agent", "ProjectHangar")
        .set("X-GitHub-Api-Version", "2022-11-28")
        .timeout(std::time::Duration::from_secs(60));
    let resp = match body {
        Some(b) => req.send_string(&b),
        None => req.call(),
    };
    match resp {
        Ok(r) => {
            let s = r.status();
            let t = r.into_string().map_err(|e| e.to_string())?;
            Ok(serde_json::json!({ "status": s, "body": t }))
        }
        Err(ureq::Error::Status(code, r)) => {
            let t = r.into_string().unwrap_or_default();
            Ok(serde_json::json!({ "status": code, "body": t }))
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Propojeni webu (rel) s repozitarem — ulozeno jako JSON v settings.
#[tauri::command]
fn get_repo_link(rel: String, state: State<AppState>) -> Option<String> {
    let g = state.inner.lock().unwrap();
    g.conn.as_ref().and_then(|c| get_setting_kv(c, &format!("github:{rel}")))
}

#[tauri::command]
fn set_repo_link(rel: String, value: String, state: State<AppState>) -> Result<(), String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    set_setting_kv(conn, &format!("github:{rel}"), &value)
}

// ----------------------------- Lokální git (GitHub Desktop) --------------

/// Vrati (owner, repo, branch, token, dir) pro dany web z trezoru.
fn git_ctx(state: &State<AppState>, rel: &str) -> Result<(String, String, String, String, PathBuf), String> {
    let dir = state.sites_root.lock().unwrap().clone().join(rel);
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    let token = get_setting_kv(conn, "github_token").unwrap_or_default();
    if token.is_empty() {
        return Err("GitHub není připojen.".into());
    }
    let raw = get_setting_kv(conn, &format!("github:{rel}")).ok_or("Web nemá propojený repozitář.")?;
    let v: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let owner = v.get("owner").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let repo = v.get("repo").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let branch = v.get("branch").and_then(|x| x.as_str()).unwrap_or("main").to_string();
    Ok((owner, repo, branch, token, dir))
}

#[tauri::command]
fn git_available() -> bool {
    git::available()
}

#[tauri::command]
fn git_is_repo(rel: String, state: State<AppState>) -> bool {
    let dir = state.sites_root.lock().unwrap().clone().join(&rel);
    git::is_repo(&dir)
}

/// Propojí lokální složku s GitHub repem (skutečný git repo pro GitHub Desktop).
#[tauri::command]
fn git_link(rel: String, state: State<AppState>) -> Result<(), String> {
    let (owner, repo, branch, token, dir) = git_ctx(&state, &rel)?;
    git::link(&dir, &owner, &repo, &branch, &token)
}

#[tauri::command]
fn git_commit_push(rel: String, message: String, state: State<AppState>) -> Result<String, String> {
    let (owner, repo, branch, token, dir) = git_ctx(&state, &rel)?;
    git::commit_push(&dir, &owner, &repo, &branch, &token, &message)
}

/// Inicializuje lokalni repo a pushne VSECHNY soubory (i binarni) na prazdny remote.
#[tauri::command]
fn git_init_push(rel: String, message: String, state: State<AppState>) -> Result<String, String> {
    let (owner, repo, branch, token, dir) = git_ctx(&state, &rel)?;
    git::init_push(&dir, &owner, &repo, &branch, &token, &message)
}

// ----------------------------- Netlify deploy ----------------------------

#[tauri::command]
fn set_netlify_token(token: String, state: State<AppState>) -> Result<(), String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    set_setting_kv(conn, "netlify_token", &token)
}

#[tauri::command]
fn netlify_has_token(state: State<AppState>) -> bool {
    let g = state.inner.lock().unwrap();
    g.conn
        .as_ref()
        .and_then(|c| get_setting_kv(c, "netlify_token"))
        .map(|t| !t.is_empty())
        .unwrap_or(false)
}

/// Publikuje web na Netlify (vytvoří site při prvním deployi, pak nahraje ZIP).
/// Vrátí živou URL.
#[tauri::command]
fn netlify_deploy(rel: String, state: State<AppState>) -> Result<String, String> {
    let root = state.sites_root.lock().unwrap().clone();
    let (token, mut site_id) = {
        let g = state.inner.lock().unwrap();
        let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
        let token = get_setting_kv(conn, "netlify_token").unwrap_or_default();
        if token.is_empty() {
            return Err("Netlify není připojené (chybí token).".into());
        }
        let site_id = get_setting_kv(conn, &format!("netlify:{rel}")).unwrap_or_default();
        (token, site_id)
    };

    let slug = rel.split('/').next_back().unwrap_or("web").to_string();

    // 1) site (vytvoř při prvním deployi)
    if site_id.is_empty() {
        let name = format!("{}-{}", slug, &new_id()[..6]);
        let (id, _url, _admin) = netlify::create_site(&token, &name)?;
        site_id = id;
        let g = state.inner.lock().unwrap();
        if let Some(conn) = g.conn.as_ref() {
            let _ = set_setting_kv(conn, &format!("netlify:{rel}"), &site_id);
        }
    }

    // 2) ZIP složky do temp
    let tmp = std::env::temp_dir().join(format!("hangar-deploy-{slug}.zip"));
    sites::zip_site(&root, &rel, &tmp)?;

    // 3) deploy
    let live = netlify::deploy_zip(&token, &site_id, &tmp)?;
    let _ = fs::remove_file(&tmp);

    // 4) ulož živou URL k webu
    if !live.is_empty() {
        let g = state.inner.lock().unwrap();
        if let Some(conn) = g.conn.as_ref() {
            let _ = set_setting_kv(conn, &format!("deploy:{rel}"), &live);
        }
    }
    Ok(live)
}

#[tauri::command]
fn git_pull(rel: String, state: State<AppState>) -> Result<(), String> {
    let (owner, repo, branch, token, dir) = git_ctx(&state, &rel)?;
    git::pull(&dir, &owner, &repo, &branch, &token)
}

/// Detekuje nainstalované Git/editor aplikace (v /Applications a ~/Applications).
#[tauri::command]
fn detect_apps() -> Vec<Value> {
    let candidates = [
        ("GitHub Desktop", "GitHub Desktop.app"),
        ("Visual Studio Code", "Visual Studio Code.app"),
        ("Cursor", "Cursor.app"),
        ("Zed", "Zed.app"),
        ("Sublime Text", "Sublime Text.app"),
        ("Fork", "Fork.app"),
        ("Sourcetree", "Sourcetree.app"),
        ("Tower", "Tower.app"),
        ("Nova", "Nova.app"),
        ("WebStorm", "WebStorm.app"),
    ];
    let home = std::env::var("HOME").unwrap_or_default();
    let dirs = ["/Applications".to_string(), format!("{home}/Applications")];
    let mut out = Vec::new();
    for (name, file) in candidates {
        for d in &dirs {
            let p = format!("{d}/{file}");
            if std::path::Path::new(&p).exists() {
                out.push(serde_json::json!({ "name": name, "path": p }));
                break;
            }
        }
    }
    out
}

/// Otevře složku webu v zadané aplikaci (`open -a`). Prázdné app = jen Finder.
#[tauri::command]
fn open_in_app(rel: String, app: String, state: State<AppState>) -> Result<(), String> {
    let dir = state.sites_root.lock().unwrap().clone().join(&rel);
    let mut cmd = std::process::Command::new("open");
    if app.trim().is_empty() {
        cmd.arg(&dir);
    } else {
        cmd.arg("-a").arg(&app).arg(&dir);
    }
    let status = cmd.status().map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("Aplikaci „{app}\" se nepodařilo otevřít."))
    }
}

#[tauri::command]
fn get_open_app(state: State<AppState>) -> String {
    let g = state.inner.lock().unwrap();
    g.conn
        .as_ref()
        .and_then(|c| get_setting_kv(c, "open_app"))
        .unwrap_or_default()
}

#[tauri::command]
fn set_open_app(app: String, state: State<AppState>) -> Result<(), String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    set_setting_kv(conn, "open_app", &app)
}

/// Otevře složku webu v GitHub Desktop (zpětná kompatibilita).
#[tauri::command]
fn open_in_github_desktop(rel: String, state: State<AppState>) -> Result<(), String> {
    open_in_app(rel, "GitHub Desktop".into(), state)
}

// ----------------------------- Sync server -------------------------------
// Malý cloud server přijímá GitHub webhooky. Desktop se ho ptá, jestli má repo
// nové commity; samotný pull stále běží lokálně přes git.

#[derive(serde::Serialize)]
struct SyncConfigStatus {
    url: String,
    has_token: bool,
}

#[tauri::command]
fn get_sync_config(state: State<AppState>) -> SyncConfigStatus {
    let g = state.inner.lock().unwrap();
    let conn = match g.conn.as_ref() {
        Some(c) => c,
        None => {
            return SyncConfigStatus {
                url: String::new(),
                has_token: false,
            }
        }
    };
    SyncConfigStatus {
        url: get_setting_kv(conn, "sync_server_url").unwrap_or_default(),
        has_token: get_setting_kv(conn, "sync_server_token")
            .map(|t| !t.is_empty())
            .unwrap_or(false),
    }
}

#[tauri::command]
fn set_sync_config(url: String, token: Option<String>, state: State<AppState>) -> Result<(), String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    set_setting_kv(conn, "sync_server_url", url.trim().trim_end_matches('/'))?;
    if let Some(t) = token {
        if !t.trim().is_empty() {
            set_setting_kv(conn, "sync_server_token", t.trim())?;
        }
    }
    Ok(())
}

fn sync_ctx(state: &State<AppState>, rel: &str) -> Result<(String, String, String, String, i64), String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    let url = get_setting_kv(conn, "sync_server_url").unwrap_or_default();
    let token = get_setting_kv(conn, "sync_server_token").unwrap_or_default();
    if url.is_empty() || token.is_empty() {
        return Err("Sync server není nastavený.".into());
    }
    let raw = get_setting_kv(conn, &format!("github:{rel}")).ok_or("Web nemá propojený GitHub repozitář.")?;
    let v: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let owner = v.get("owner").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let repo = v.get("repo").and_then(|x| x.as_str()).unwrap_or("").to_string();
    if owner.is_empty() || repo.is_empty() {
        return Err("Propojení GitHub repozitáře je neúplné.".into());
    }
    let last_seen = get_setting_kv(conn, &format!("sync_last_event:{rel}"))
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);
    Ok((url, token, owner, repo, last_seen))
}

#[tauri::command]
fn sync_check_latest(rel: String, state: State<AppState>) -> Result<Value, String> {
    let (url, token, owner, repo, last_seen) = sync_ctx(&state, &rel)?;
    let endpoint = format!("{url}/sync/latest?owner={owner}&repo={repo}");
    let resp = ureq::get(&endpoint)
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/json")
        .set("User-Agent", "ProjectHangar")
        .timeout(std::time::Duration::from_secs(20))
        .call();

    let body = match resp {
        Ok(r) => r.into_string().map_err(|e| e.to_string())?,
        Err(ureq::Error::Status(code, r)) => {
            let t = r.into_string().unwrap_or_default();
            return Err(format!("Sync server {code}: {t}"));
        }
        Err(e) => return Err(e.to_string()),
    };
    let parsed: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    let latest = parsed.get("latest").cloned().unwrap_or(Value::Null);
    let latest_id = latest.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
    Ok(serde_json::json!({
        "owner": owner,
        "repo": repo,
        "last_seen_id": last_seen,
        "latest_id": latest_id,
        "changed": latest_id > last_seen,
        "latest": latest,
    }))
}

#[tauri::command]
fn sync_mark_seen(rel: String, event_id: i64, state: State<AppState>) -> Result<(), String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    set_setting_kv(conn, &format!("sync_last_event:{rel}"), &event_id.to_string())
}

// ----------------------------- AI asistent -------------------------------
// Provider-agnosticka: Rust jen prepošle HTTP POST (obejde CORS webview),
// klic se uklada sifrovane v trezoru. Agentni smycka bezi ve frontendu.

/// Genericky HTTP POST na AI API. Vraci { status, body } i pro 4xx/5xx.
#[tauri::command]
fn ai_http_post(
    url: String,
    headers: std::collections::HashMap<String, String>,
    body: String,
) -> Result<Value, String> {
    let mut req = ureq::post(&url).timeout(std::time::Duration::from_secs(180));
    for (k, v) in &headers {
        req = req.set(k, v);
    }
    match req.send_string(&body) {
        Ok(r) => {
            let status = r.status();
            let text = r.into_string().map_err(|e| e.to_string())?;
            Ok(serde_json::json!({ "status": status, "body": text }))
        }
        Err(ureq::Error::Status(code, r)) => {
            let text = r.into_string().unwrap_or_default();
            Ok(serde_json::json!({ "status": code, "body": text }))
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Konfigurace AI (provider, base URL, model, klic) — ulozeno sifrovane v trezoru.
#[tauri::command]
fn get_ai_config(state: State<AppState>) -> Value {
    let g = state.inner.lock().unwrap();
    if let Some(conn) = g.conn.as_ref() {
        if let Some(raw) = get_setting_kv(conn, "ai_config") {
            if let Ok(v) = serde_json::from_str::<Value>(&raw) {
                return v;
            }
        }
    }
    serde_json::json!({
        "provider": "anthropic",
        "baseUrl": "https://api.anthropic.com",
        "model": "claude-opus-4-8",
        "apiKey": ""
    })
}

#[tauri::command]
fn set_ai_config(config: Value, state: State<AppState>) -> Result<(), String> {
    let g = state.inner.lock().unwrap();
    let conn = g.conn.as_ref().ok_or("Vault je zamceny.")?;
    set_setting_kv(conn, "ai_config", &config.to_string())
}

// ----------------------------- Bootstrap ---------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app
                .path()
                .app_data_dir()
                .expect("nelze ziskat app_data_dir")
                .join("vault");
            // Koren se slozkami webu + lokalni preview server.
            let sites_root: sites::SharedRoot =
                Arc::new(Mutex::new(resolve_default_sites_root()));
            let preview_port =
                sites::start_preview_server(sites_root.clone()).unwrap_or(0);
            app.manage(AppState {
                inner: Mutex::new(Inner {
                    conn: None,
                    vault_dir: dir,
                }),
                sites_root,
                preview_port,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vault_status,
            initialize,
            unlock,
            lock,
            reset_vault,
            app_version,
            backup_vault,
            list_projects,
            get_project,
            create_project,
            list_templates,
            create_project_from_template,
            update_project,
            delete_project,
            touch_opened,
            list_notes,
            save_note,
            delete_note,
            list_links,
            save_link,
            delete_link,
            list_credentials,
            reveal_credential,
            save_credential,
            delete_credential,
            list_tasks,
            save_task,
            delete_task,
            list_files,
            import_file,
            open_file,
            delete_file,
            list_events,
            search,
            dashboard,
            get_sites_root,
            set_sites_root,
            list_sites,
            set_site_name,
            set_site_icon,
            read_file_base64,
            import_asset,
            import_template,
            list_site_templates,
            use_site_template,
            list_site_files,
            read_site_file,
            write_site_file,
            delete_site_file,
            delete_site,
            site_preview_url,
            open_site_folder,
            export_site_zip,
            get_deploy_url,
            set_deploy_url,
            open_external_url,
            ai_http_post,
            get_ai_config,
            set_ai_config,
            set_github_token,
            github_has_token,
            github_api,
            get_repo_link,
            set_repo_link,
            git_available,
            git_is_repo,
            git_link,
            git_commit_push,
            git_init_push,
            set_netlify_token,
            netlify_has_token,
            netlify_deploy,
            git_pull,
            open_in_github_desktop,
            detect_apps,
            open_in_app,
            get_open_app,
            set_open_app,
            get_sync_config,
            set_sync_config,
            sync_check_latest,
            sync_mark_seen,
        ])
        .run(tauri::generate_context!())
        .expect("chyba pri spousteni Tauri aplikace");
}
