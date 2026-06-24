//! Deploy statického webu na Netlify přes jejich API (osobní token).
//! Vytvoří site (jednou) a nahraje ZIP složky → živá URL.

use serde_json::Value;
use std::path::Path;

fn bearer(token: &str) -> String {
    format!("Bearer {token}")
}

/// Vytvori novy Netlify site. Vrati (site_id, url, admin_url).
pub fn create_site(token: &str, name: &str) -> Result<(String, String, String), String> {
    let body = serde_json::json!({ "name": name }).to_string();
    let resp = ureq::post("https://api.netlify.com/api/v1/sites")
        .set("Authorization", &bearer(token))
        .set("Content-Type", "application/json")
        .timeout(std::time::Duration::from_secs(60))
        .send_string(&body);
    let text = match resp {
        Ok(r) => r.into_string().map_err(|e| e.to_string())?,
        Err(ureq::Error::Status(code, r)) => {
            let t = r.into_string().unwrap_or_default();
            return Err(format!("Netlify {code}: {t}"));
        }
        Err(e) => return Err(e.to_string()),
    };
    let v: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let id = v.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let url = v
        .get("ssl_url")
        .or_else(|| v.get("url"))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let admin = v.get("admin_url").and_then(|x| x.as_str()).unwrap_or("").to_string();
    if id.is_empty() {
        return Err("Netlify nevrátil site id.".into());
    }
    Ok((id, url, admin))
}

/// Nahraje ZIP na existujici site (deploy). Vrati URL deploye.
pub fn deploy_zip(token: &str, site_id: &str, zip_path: &Path) -> Result<String, String> {
    let bytes = std::fs::read(zip_path).map_err(|e| e.to_string())?;
    let url = format!("https://api.netlify.com/api/v1/sites/{site_id}/deploys");
    let resp = ureq::post(&url)
        .set("Authorization", &bearer(token))
        .set("Content-Type", "application/zip")
        .timeout(std::time::Duration::from_secs(180))
        .send_bytes(&bytes);
    let text = match resp {
        Ok(r) => r.into_string().map_err(|e| e.to_string())?,
        Err(ureq::Error::Status(code, r)) => {
            let t = r.into_string().unwrap_or_default();
            return Err(format!("Netlify deploy {code}: {t}"));
        }
        Err(e) => return Err(e.to_string()),
    };
    let v: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let live = v
        .get("ssl_url")
        .or_else(|| v.get("url"))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    Ok(live)
}
