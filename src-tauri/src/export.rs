// Export webu pro predani zakaznikovi.
// Vezme zdrojovou slozku webu, vyhodi vyvojarsky balast (node_modules, .git, ...),
// prida vygenerovany HANDOFF.md a vse zabali do jednoho .zip.

use chrono::Local;
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;

/// Adresare/soubory, ktere do balicku pro zakaznika nepatri.
const SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    ".svn",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".cache",
    ".parcel-cache",
    "target",
    ".vscode",
    ".idea",
    ".vercel",
    ".netlify",
];

/// Soubory, ktere se nikdy nezabalujou (citlive / nevyznamne).
const SKIP_FILES: &[&str] = &[
    ".DS_Store",
    "Thumbs.db",
    ".env",
    ".env.local",
    ".env.development",
    ".env.production",
    "npm-debug.log",
    "yarn-error.log",
];

fn is_skipped(name: &str) -> bool {
    SKIP_DIRS.contains(&name)
        || SKIP_FILES.contains(&name)
        || name.ends_with(".log")
        || name.ends_with(".tmp")
}

#[derive(serde::Serialize)]
pub struct ExportSummary {
    pub files: usize,
    pub bytes: u64,
    pub zip_path: String,
}

/// Sesbira relativni cesty vsech souboru ke zbaleni (s filtrem balastu).
fn collect_files(src: &Path) -> Result<Vec<(std::path::PathBuf, String)>, String> {
    let mut out = Vec::new();
    let walker = WalkDir::new(src).into_iter().filter_entry(|e| {
        let name = e.file_name().to_string_lossy();
        !is_skipped(&name)
    });
    for entry in walker {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().is_file() {
            continue;
        }
        let rel = entry
            .path()
            .strip_prefix(src)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        out.push((entry.path().to_path_buf(), rel));
    }
    Ok(out)
}

/// Vygeneruje obsah HANDOFF.md pro zakaznika.
fn handoff_md(project_name: &str, client: &str, base_url: Option<&str>, file_count: usize) -> String {
    let date = Local::now().format("%d.%m.%Y").to_string();
    let client_line = if client.is_empty() {
        String::new()
    } else {
        format!("**Klient:** {client}\n")
    };
    let url_section = match base_url {
        Some(u) if !u.is_empty() => format!(
            "\n## Cilova adresa\n\nWeb je urceny pro nasazeni na: **{u}**\n"
        ),
        _ => String::new(),
    };

    format!(
        r#"# {project_name} — předání webu

**Datum předání:** {date}
{client_line}**Počet souborů v balíčku:** {file_count}
{url_section}
## Co balíček obsahuje

Kompletní statický web (HTML, CSS, JavaScript, obrázky a další podklady).
Balíček je očištěný od vývojářských souborů — neobsahuje `node_modules`,
historii verzí ani konfigurační/citlivé soubory.

## Jak web nasadit

Web je statický, takže ho lze nasadit kdekoli bez serverové logiky:

1. **Nejjednodušší (drag & drop):** rozbalte ZIP a obsah složky nahrajte
   na hosting přes FTP, nebo přetáhněte do služby jako Netlify / Vercel /
   Cloudflare Pages.
2. **Klasický webhosting:** nahrajte **obsah** rozbalené složky do kořenového
   adresáře webu (typicky `public_html/` nebo `www/`). Soubor `index.html`
   musí ležet v kořeni.
3. Otevřete web v prohlížeči a ověřte, že se vše načítá správně.

## Předávací checklist

- [ ] Web se otevírá na cílové doméně
- [ ] Funguje navigace a všechny odkazy
- [ ] Obrázky a styly se načítají
- [ ] Kontaktní formulář / odkazy směřují na správné adresy
- [ ] Web je responzivní na mobilu

---

Vytvořeno aplikací **Project Hangar**.
"#
    )
}

/// Zabali zdrojovou slozku do `dest_zip`. Vraci souhrn.
pub fn export_site(
    src_dir: &str,
    dest_zip: &str,
    project_name: &str,
    client: &str,
    base_url: Option<&str>,
) -> Result<ExportSummary, String> {
    let src = Path::new(src_dir);
    if !src.is_dir() {
        return Err(format!("Zdrojová složka neexistuje: {src_dir}"));
    }

    let files = collect_files(src)?;
    if files.is_empty() {
        return Err("Ve zdrojové složce nejsou žádné soubory k exportu.".into());
    }

    let zip_file = File::create(dest_zip).map_err(|e| format!("vytvoření ZIP: {e}"))?;
    let mut zip = zip::ZipWriter::new(zip_file);
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let mut total_bytes: u64 = 0;
    let mut buf = Vec::new();
    for (abs, rel) in &files {
        zip.start_file(rel, opts).map_err(|e| e.to_string())?;
        buf.clear();
        File::open(abs)
            .map_err(|e| format!("čtení {rel}: {e}"))?
            .read_to_end(&mut buf)
            .map_err(|e| e.to_string())?;
        zip.write_all(&buf).map_err(|e| e.to_string())?;
        total_bytes += buf.len() as u64;
    }

    // Pridame HANDOFF.md (pokud uz takovy soubor ve zdroji nebyl).
    let already_has = files.iter().any(|(_, r)| r.eq_ignore_ascii_case("HANDOFF.md"));
    if !already_has {
        let md = handoff_md(project_name, client, base_url, files.len());
        zip.start_file("HANDOFF.md", opts).map_err(|e| e.to_string())?;
        zip.write_all(md.as_bytes()).map_err(|e| e.to_string())?;
    }

    zip.finish().map_err(|e| e.to_string())?;

    Ok(ExportSummary {
        files: files.len(),
        bytes: total_bytes,
        zip_path: dest_zip.to_string(),
    })
}
