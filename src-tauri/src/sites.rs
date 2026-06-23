//! Správa webových projektů jako složek na disku (mimo šifrovaný trezor).
//! - lokální HTTP server pro live preview (iframe v Hangaru)
//! - výpis webů a souborů
//! - export složky do ZIP
//!
//! Jediný zdroj pravdy je složka na disku (verzovaná gitem). Hangar ji jen čte.

use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// Sdílená cesta ke kořeni s weby. Preview server ji čte při každém requestu,
/// takže změna kořene se projeví bez restartu.
pub type SharedRoot = Arc<Mutex<PathBuf>>;

fn mime_for(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        _ => "application/octet-stream",
    }
}

/// Spustí preview server na 127.0.0.1 a vrátí port. Běží po celou dobu běhu aplikace.
pub fn start_preview_server(root: SharedRoot) -> Result<u16, String> {
    let server = tiny_http::Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = server
        .server_addr()
        .to_ip()
        .map(|a| a.port())
        .ok_or("nelze ziskat port")?;

    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            let url = request.url().split('?').next().unwrap_or("/").to_string();
            let rel = percent_decode(url.trim_start_matches('/'));
            let base = { root.lock().unwrap().clone() };

            // Ochrana proti path traversal.
            let mut target = base.clone();
            let mut traversal = false;
            for seg in rel.split('/') {
                if seg.is_empty() || seg == "." {
                    continue;
                }
                if seg == ".." {
                    traversal = true;
                    break;
                }
                target.push(seg);
            }
            if traversal {
                let _ = request.respond(text_response(403, "Forbidden"));
                continue;
            }
            if target.is_dir() {
                target.push("index.html");
            }

            match std::fs::read(&target) {
                Ok(bytes) => {
                    let mime = mime_for(&target);
                    let header = tiny_http::Header::from_bytes(&b"Content-Type"[..], mime.as_bytes())
                        .unwrap();
                    let resp = tiny_http::Response::from_data(bytes).with_header(header);
                    let _ = request.respond(resp);
                }
                Err(_) => {
                    let _ = request.respond(text_response(404, "404 Not Found"));
                }
            }
        }
    });

    Ok(port)
}

fn text_response(code: u16, body: &str) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    tiny_http::Response::from_string(body).with_status_code(code)
}

/// Minimalisticke percent-decode (staci pro nazvy souboru s mezerami apod.).
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(h) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(h);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Jeden web (podsložka některého adresáře pod web_root).
#[derive(serde::Serialize)]
pub struct SiteInfo {
    pub slug: String,
    pub rel: String, // cesta vůči web_root, např. "sites/foo" nebo "site-templates/bar"
    pub has_index: bool,
    pub file_count: usize,
    pub title: Option<String>,
}

/// Vypíše weby v podadresáři `subdir` (např. "sites" nebo "site-templates").
pub fn list_in(root: &Path, subdir: &str) -> Vec<SiteInfo> {
    let mut out = Vec::new();
    let base = root.join(subdir);
    let entries = match std::fs::read_dir(&base) {
        Ok(e) => e,
        Err(_) => return out,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let slug = entry.file_name().to_string_lossy().into_owned();
        if slug.starts_with('.') {
            continue;
        }
        let index = path.join("index.html");
        let has_index = index.exists();
        let file_count = walkdir::WalkDir::new(&path)
            .into_iter()
            .flatten()
            .filter(|e| e.file_type().is_file())
            .count();
        let title = if has_index { extract_title(&index) } else { None };
        out.push(SiteInfo {
            rel: format!("{subdir}/{slug}"),
            slug,
            has_index,
            file_count,
            title,
        });
    }
    out.sort_by(|a, b| a.slug.cmp(&b.slug));
    out
}

/// Rekurzivně zkopíruje složku (pro „použít šablonu").
pub fn copy_dir(src: &Path, dst: &Path) -> Result<(), String> {
    if dst.exists() {
        return Err("Cilova slozka uz existuje.".into());
    }
    for entry in walkdir::WalkDir::new(src).into_iter().flatten() {
        let rel = entry.path().strip_prefix(src).map_err(|e| e.to_string())?;
        let target = dst.join(rel);
        if entry.file_type().is_dir() {
            std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            std::fs::copy(entry.path(), &target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn extract_title(index: &Path) -> Option<String> {
    let html = std::fs::read_to_string(index).ok()?;
    let lower = html.to_lowercase();
    let start = lower.find("<title>")? + 7;
    let end = lower[start..].find("</title>")? + start;
    Some(html[start..end].trim().to_string())
}

/// Seznam relativnich cest souboru v jednom webu (rel = "sites/foo").
pub fn list_site_files(root: &Path, rel: &str) -> Vec<String> {
    let dir = root.join(rel);
    let mut out = Vec::new();
    for entry in walkdir::WalkDir::new(&dir).into_iter().flatten() {
        if entry.file_type().is_file() {
            if let Ok(rel) = entry.path().strip_prefix(&dir) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    out.sort();
    out
}

/// Zazipuje slozku webu do ciloveho souboru (rel = "sites/foo").
pub fn zip_site(root: &Path, rel: &str, dest: &Path) -> Result<(), String> {
    let dir = root.join(rel);
    if !dir.is_dir() {
        return Err("Slozka webu neexistuje.".into());
    }
    let file = std::fs::File::create(dest).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let opts: zip::write::FileOptions<()> =
        zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    for entry in walkdir::WalkDir::new(&dir).into_iter().flatten() {
        let path = entry.path();
        let rel = match path.strip_prefix(&dir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let name = rel.to_string_lossy().replace('\\', "/");
        if name.is_empty() {
            continue;
        }
        if entry.file_type().is_file() {
            zip.start_file(name, opts).map_err(|e| e.to_string())?;
            let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
            zip.write_all(&bytes).map_err(|e| e.to_string())?;
        }
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}
