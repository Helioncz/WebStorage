// Website Import & Redesign Assistant.
//
// Načte zdroj (URL nebo lokální složku), zanalyzuje strukturu/obsah/styl a založí
// NOVÝ projekt webu (scaffolding + PROMPT_PRO_CLAUDE.md + brief). Cílem je redesign,
// NE 1:1 kopie — převzatý obsah je vždy označen ke kontrole. Žádné obcházení
// zabezpečení/přihlášení/CAPTCHA: stahuje se jen veřejně dostupné HTML přes GET.

use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;
use url::Url;

const TIMEOUT: Duration = Duration::from_secs(15);
const MAX_TEXTS: usize = 40;
const MAX_IMAGES: usize = 60;
const MAX_HTML_BYTES: u64 = 5 * 1024 * 1024;

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct LinkItem {
    pub text: String,
    pub href: String,
}

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct Analysis {
    pub source: String,
    pub source_type: String, // "url" | "folder"
    pub title: Option<String>,
    pub description: Option<String>,
    pub lang: Option<String>,
    pub headings: Vec<String>,
    pub texts: Vec<String>,
    pub links: Vec<LinkItem>,
    pub images: Vec<String>,
    pub colors: Vec<String>,
    pub fonts: Vec<String>,
    pub nav: Vec<String>,
    pub sections: Vec<String>,
    pub emails: Vec<String>,
    pub phones: Vec<String>,
    pub fetched_at: String,
}

fn clean(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ").trim().to_string()
}

fn sel(s: &str) -> Selector {
    Selector::parse(s).expect("staticky selektor")
}

/// Stáhne HTML z veřejné URL (GET, timeout). Nesnaží se obcházet zabezpečení.
fn fetch_html(target: &str) -> Result<(String, Url), String> {
    let parsed = Url::parse(target).map_err(|_| "Neplatná URL.".to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Podporované jsou jen http(s) adresy.".into());
    }
    let agent = ureq::AgentBuilder::new()
        .timeout(TIMEOUT)
        .user_agent("ProjectHangar-Redesign/1.0")
        .build();
    let resp = agent
        .get(parsed.as_str())
        .call()
        .map_err(|e| match e {
            ureq::Error::Status(code, _) => format!("Web vrátil HTTP {code}."),
            ureq::Error::Transport(t) => format!("Web nedostupný: {t}"),
        })?;
    let ctype = resp.header("Content-Type").unwrap_or("").to_string();
    if !ctype.is_empty() && !ctype.contains("html") {
        return Err(format!("Zdroj není HTML stránka (Content-Type: {ctype})."));
    }
    let mut buf = Vec::new();
    resp.into_reader()
        .take(MAX_HTML_BYTES)
        .read_to_end(&mut buf)
        .map_err(|e| format!("Chyba čtení: {e}"))?;
    Ok((String::from_utf8_lossy(&buf).into_owned(), parsed))
}

fn fetch_css(agent: &ureq::Agent, url: &str) -> Option<String> {
    let resp = agent.get(url).call().ok()?;
    let mut buf = Vec::new();
    resp.into_reader().take(1024 * 1024).read_to_end(&mut buf).ok()?;
    Some(String::from_utf8_lossy(&buf).into_owned())
}

fn extract_colors(css: &str, out: &mut BTreeSet<String>) {
    let bytes = css.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'#' {
            let start = i + 1;
            let mut j = start;
            while j < bytes.len() && bytes[j].is_ascii_hexdigit() {
                j += 1;
            }
            let len = j - start;
            if len == 3 || len == 6 {
                out.insert(format!("#{}", &css[start..j]).to_lowercase());
            }
            i = j;
        } else {
            i += 1;
        }
    }
}

fn extract_fonts(css: &str, out: &mut BTreeSet<String>) {
    for chunk in css.split("font-family").skip(1) {
        if let Some(rest) = chunk.split(';').next() {
            let val = rest.trim_start_matches(':').trim();
            if let Some(first) = val.split(',').next() {
                let f = first.trim().trim_matches('"').trim_matches('\'').trim();
                if !f.is_empty() && f.len() < 40 && !f.starts_with("var(") {
                    out.insert(f.to_string());
                }
            }
        }
    }
}

fn extract_contacts(text: &str, emails: &mut BTreeSet<String>, phones: &mut BTreeSet<String>) {
    // E-maily.
    for tok in text.split(|c: char| c.is_whitespace() || c == '<' || c == '>' || c == '"' || c == '(' || c == ')') {
        let t = tok.trim_matches(|c: char| !c.is_alphanumeric() && c != '@' && c != '.' && c != '_' && c != '-' && c != '+');
        if t.contains('@') && t.contains('.') && t.len() >= 6 && t.len() < 80 && t.matches('@').count() == 1 {
            emails.insert(t.to_lowercase());
        }
    }
    // Telefony: posloupnosti cislic/+/mezer delky 9-16.
    let mut cur = String::new();
    let flush = |cur: &mut String, phones: &mut BTreeSet<String>| {
        let digits = cur.chars().filter(|c| c.is_ascii_digit()).count();
        if (9..=16).contains(&digits) {
            phones.insert(clean(cur));
        }
        cur.clear();
    };
    for ch in text.chars() {
        if ch.is_ascii_digit() || ch == '+' || ch == ' ' || ch == '-' || ch == '(' || ch == ')' {
            cur.push(ch);
        } else {
            flush(&mut cur, phones);
        }
    }
    flush(&mut cur, phones);
}

/// Společná extrakce z HTML stringu. `base` = URL pro absolutní odkazy (None u složky).
fn analyze_html(html: &str, base: Option<&Url>, agent: Option<&ureq::Agent>) -> Analysis {
    let doc = Html::parse_document(html);
    let mut a = Analysis::default();

    a.title = doc
        .select(&sel("title"))
        .next()
        .map(|e| clean(&e.text().collect::<String>()))
        .filter(|s| !s.is_empty());

    for m in doc.select(&sel("meta")) {
        let name = m.value().attr("name").or_else(|| m.value().attr("property")).unwrap_or("");
        if name.eq_ignore_ascii_case("description") || name.eq_ignore_ascii_case("og:description") {
            if let Some(c) = m.value().attr("content") {
                if a.description.is_none() {
                    a.description = Some(clean(c));
                }
            }
        }
    }
    a.lang = doc.select(&sel("html")).next().and_then(|e| e.value().attr("lang").map(|s| s.to_string()));

    for h in doc.select(&sel("h1, h2, h3")) {
        let t = clean(&h.text().collect::<String>());
        if !t.is_empty() && t.len() < 160 {
            a.headings.push(t);
        }
    }
    a.headings.dedup();
    a.headings.truncate(50);

    for p in doc.select(&sel("p, li")) {
        let t = clean(&p.text().collect::<String>());
        if t.len() >= 40 && t.len() < 600 {
            a.texts.push(t);
            if a.texts.len() >= MAX_TEXTS {
                break;
            }
        }
    }

    let resolve = |href: &str| -> String {
        match base {
            Some(b) => b.join(href).map(|u| u.to_string()).unwrap_or_else(|_| href.to_string()),
            None => href.to_string(),
        }
    };

    for l in doc.select(&sel("a")) {
        if let Some(href) = l.value().attr("href") {
            if href.starts_with('#') || href.starts_with("javascript:") || href.starts_with("mailto:") {
                continue;
            }
            let text = clean(&l.text().collect::<String>());
            if a.links.len() < 80 {
                a.links.push(LinkItem { text, href: resolve(href) });
            }
        }
    }

    for img in doc.select(&sel("img")) {
        if let Some(src) = img.value().attr("src").or_else(|| img.value().attr("data-src")) {
            if src.starts_with("data:") {
                continue;
            }
            a.images.push(resolve(src));
            if a.images.len() >= MAX_IMAGES {
                break;
            }
        }
    }

    // Navigace.
    let nav_set: BTreeSet<String> = doc
        .select(&sel("nav a, header a"))
        .map(|e| clean(&e.text().collect::<String>()))
        .filter(|t| !t.is_empty() && t.len() < 40)
        .collect();
    a.nav = nav_set.into_iter().take(20).collect();

    // Sekce (id/class hlavnich bloku).
    let mut sections = BTreeSet::new();
    for s in doc.select(&sel("section, [id], main > div")) {
        if let Some(id) = s.value().attr("id") {
            if !id.is_empty() && id.len() < 40 {
                sections.insert(id.to_string());
            }
        }
    }
    a.sections = sections.into_iter().take(30).collect();

    // Barvy + fonty: inline <style>, style atributy, externí CSS.
    let mut colors = BTreeSet::new();
    let mut fonts = BTreeSet::new();
    for st in doc.select(&sel("style")) {
        let css = st.text().collect::<String>();
        extract_colors(&css, &mut colors);
        extract_fonts(&css, &mut fonts);
    }
    for el in doc.select(&sel("[style]")) {
        if let Some(s) = el.value().attr("style") {
            extract_colors(s, &mut colors);
            extract_fonts(s, &mut fonts);
        }
    }
    if let (Some(b), Some(ag)) = (base, agent) {
        for link in doc.select(&sel("link[rel=stylesheet]")).take(6) {
            if let Some(href) = link.value().attr("href") {
                if let Ok(css_url) = b.join(href) {
                    if let Some(css) = fetch_css(ag, css_url.as_str()) {
                        extract_colors(&css, &mut colors);
                        extract_fonts(&css, &mut fonts);
                    }
                }
            }
        }
    }
    a.colors = colors.into_iter().filter(|c| c != "#fff" && c != "#000" && c != "#ffffff" && c != "#000000").take(16).collect();
    a.fonts = fonts.into_iter().take(8).collect();

    // Kontakty z celého textu.
    let plain = doc.root_element().text().collect::<String>();
    let mut emails = BTreeSet::new();
    let mut phones = BTreeSet::new();
    extract_contacts(html, &mut emails, &mut phones); // mailto i v markupu
    extract_contacts(&plain, &mut emails, &mut phones);
    a.emails = emails.into_iter().take(10).collect();
    a.phones = phones.into_iter().take(10).collect();

    a
}

pub fn analyze_url(target: &str, now: &str) -> Result<Analysis, String> {
    let (html, base) = fetch_html(target)?;
    let agent = ureq::AgentBuilder::new().timeout(TIMEOUT).build();
    let mut a = analyze_html(&html, Some(&base), Some(&agent));
    a.source = target.to_string();
    a.source_type = "url".into();
    a.fetched_at = now.to_string();
    Ok(a)
}

pub fn analyze_folder(dir: &str, now: &str) -> Result<Analysis, String> {
    let path = PathBuf::from(dir);
    if !path.is_dir() {
        return Err("Složka neexistuje.".into());
    }
    let index = ["index.html", "index.htm"]
        .iter()
        .map(|f| path.join(f))
        .find(|p| p.exists())
        .or_else(|| {
            std::fs::read_dir(&path).ok()?.flatten().map(|e| e.path()).find(|p| {
                p.extension().map(|e| e == "html").unwrap_or(false)
            })
        })
        .ok_or("Ve složce není žádný .html soubor.")?;
    let html = std::fs::read_to_string(&index).map_err(|e| format!("Čtení {index:?}: {e}"))?;
    let mut a = analyze_html(&html, None, None);
    // Barvy/fonty navíc z .css souborů ve složce.
    let mut colors: BTreeSet<String> = a.colors.iter().cloned().collect();
    let mut fonts: BTreeSet<String> = a.fonts.iter().cloned().collect();
    for entry in walkdir::WalkDir::new(&path).max_depth(3).into_iter().flatten() {
        if entry.path().extension().map(|e| e == "css").unwrap_or(false) {
            if let Ok(css) = std::fs::read_to_string(entry.path()) {
                extract_colors(&css, &mut colors);
                extract_fonts(&css, &mut fonts);
            }
        }
    }
    a.colors = colors.into_iter().filter(|c| !["#fff", "#000", "#ffffff", "#000000"].contains(&c.as_str())).take(16).collect();
    a.fonts = fonts.into_iter().take(8).collect();
    a.source = dir.to_string();
    a.source_type = "folder".into();
    a.fetched_at = now.to_string();
    Ok(a)
}

// ----------------------------- Vytvoření projektu ------------------------

#[derive(Deserialize)]
pub struct CreateOpts {
    pub mode: String, // analyze | static | react | prompt | external
    pub slug: String,
    pub template_note: Option<String>, // popis zvolené šablony (volitelné)
    pub init_git: bool,
}

#[derive(Serialize)]
pub struct CreateResult {
    pub project_dir: String,
    pub files: Vec<String>,
    pub log: Vec<String>,
}

fn w(dir: &Path, rel: &str, content: &str, files: &mut Vec<String>) -> Result<(), String> {
    let p = dir.join(rel);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&p, content).map_err(|e| format!("zápis {rel}: {e}"))?;
    files.push(rel.to_string());
    Ok(())
}

fn design_brief(a: &Analysis) -> String {
    let colors = if a.colors.is_empty() { "—".into() } else { a.colors.join(", ") };
    let fonts = if a.fonts.is_empty() { "—".into() } else { a.fonts.join(", ") };
    let sections = if a.sections.is_empty() { a.nav.join(", ") } else { a.sections.join(", ") };
    format!(
        "# Design brief\n\n\
        **Zdroj:** {}\n\n\
        **Původní název:** {}\n\n\
        **Popis:** {}\n\n\
        ## Barvy (převzaté ke kontrole)\n{}\n\n\
        ## Fonty (převzaté ke kontrole)\n{}\n\n\
        ## Sekce / navigace\n{}\n\n\
        ## Doporučení pro redesign\n\
        - Moderní, vzdušné rozvržení s jasnou vizuální hierarchií\n\
        - Responzivní (mobil → tablet → desktop), mobile-first\n\
        - Výraznější CTA tlačítka a čitelnější typografie\n\
        - Konzistentní barevná paleta odvozená z původních barev\n\
        - SEO základ (title, meta description, OG, sitemap) a přístupnost (kontrast, alt, focus)\n",
        a.source,
        a.title.clone().unwrap_or_else(|| "—".into()),
        a.description.clone().unwrap_or_else(|| "—".into()),
        colors, fonts, sections,
    )
}

const PROMPT_URL: &str = include_str!("prompt_url.txt");
const PROMPT_FOLDER: &str = include_str!("prompt_folder.txt");

/// Sestaví prompt pro Claude Code z univerzální šablony (URL / složka) +
/// doplní placeholdery a připojí výsledek analýzy z aplikace.
fn prompt_md(a: &Analysis, opts: &CreateOpts, target_dir: &str) -> String {
    let technology = match opts.mode.as_str() {
        "static" => "Čisté HTML/CSS/JS",
        "react" => "React + Vite",
        _ => "AUTO (zvol podle obsahu)",
    };
    let language = a.lang.clone().unwrap_or_else(|| "AUTO".into());

    let base = if a.source_type == "folder" { PROMPT_FOLDER } else { PROMPT_URL };
    let filled = base
        .replace("{{SOURCE_URL}}", &a.source)
        .replace("{{SOURCE_FOLDER}}", &a.source)
        .replace("{{TARGET_DIRECTORY}}", target_dir)
        .replace("{{TECHNOLOGY_OR_AUTO}}", technology)
        .replace("{{LANGUAGE_OR_AUTO}}", &language);

    // Připojíme strukturovaný výsledek analýzy z aplikace (grounding pro Claude).
    let headings = a.headings.iter().take(25).map(|h| format!("- {h}")).collect::<Vec<_>>().join("\n");
    let texts = a.texts.iter().take(12).map(|t| format!("- {t}")).collect::<Vec<_>>().join("\n");
    let images = a.images.iter().take(20).map(|t| format!("- {t}")).collect::<Vec<_>>().join("\n");
    let nav = if a.nav.is_empty() { "—".into() } else { a.nav.join(", ") };
    let sections = if a.sections.is_empty() { "—".into() } else { a.sections.join(", ") };
    let colors = if a.colors.is_empty() { "—".into() } else { a.colors.join(", ") };
    let fonts = if a.fonts.is_empty() { "—".into() } else { a.fonts.join(", ") };
    let contacts = {
        let mut c = a.emails.clone();
        c.extend(a.phones.clone());
        if c.is_empty() { "—".into() } else { c.join(", ") }
    };
    let tmpl = opts.template_note.clone().unwrap_or_default();
    let tmpl_line = if tmpl.is_empty() { String::new() } else { format!("\n**Preferovaná šablona / styl:** {tmpl}\n") };

    format!(
        "{filled}\n\n\
        ======================================================\n\
        VÝSLEDEK AUTOMATICKÉ ANALÝZY (z aplikace Project Hangar)\n\
        ======================================================\n\
        {tmpl_line}\n\
        **Název:** {title}\n**Popis:** {desc}\n**Jazyk:** {language}\n\n\
        ## Navigace\n{nav}\n\n## Sekce\n{sections}\n\n\
        ## Barvy (převzaté ke kontrole)\n{colors}\n\n## Fonty (ke kontrole)\n{fonts}\n\n\
        ## Kontakty (veřejné)\n{contacts}\n\n\
        ## Nadpisy\n{headings}\n\n## Ukázky textů (ke kontrole)\n{texts}\n\n\
        ## Obrázky (převzaté ke kontrole)\n{images}\n",
        title = a.title.clone().unwrap_or_else(|| "—".into()),
        desc = a.description.clone().unwrap_or_else(|| "—".into()),
        headings = if headings.is_empty() { "—".into() } else { headings },
        texts = if texts.is_empty() { "—".into() } else { texts },
        images = if images.is_empty() { "—".into() } else { images },
    )
}

fn starter_index(a: &Analysis) -> String {
    let title = a.title.clone().unwrap_or_else(|| "Nový web".into());
    let desc = a.description.clone().unwrap_or_default();
    let nav = a
        .nav
        .iter()
        .take(6)
        .map(|n| format!("<a href=\"#\">{}</a>", n))
        .collect::<Vec<_>>()
        .join("\n        ");
    let hero_h = a.headings.first().cloned().unwrap_or_else(|| title.clone());
    let hero_p = a.texts.first().cloned().unwrap_or_default();
    format!(
        "<!doctype html>\n<html lang=\"cs\">\n<head>\n  <meta charset=\"utf-8\" />\n  \
        <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n  \
        <title>{title}</title>\n  <meta name=\"description\" content=\"{desc}\" />\n  \
        <link rel=\"stylesheet\" href=\"styles/main.css\" />\n</head>\n<body>\n  \
        <!-- POZN.: obsah převzatý ze zdroje je ke KONTROLE, ne finální. -->\n  \
        <header class=\"site-header\">\n    <div class=\"brand\">{title}</div>\n    \
        <nav class=\"nav\">\n        {nav}\n    </nav>\n  </header>\n\n  \
        <main>\n    <section class=\"hero\">\n      <h1>{hero_h}</h1>\n      \
        <p>{hero_p}</p>\n      <a class=\"cta\" href=\"#\">Začít</a>\n    </section>\n  </main>\n\n  \
        <footer class=\"site-footer\">© {title}</footer>\n  \
        <script src=\"scripts/main.js\"></script>\n</body>\n</html>\n"
    )
}

fn starter_css(a: &Analysis) -> String {
    let primary = a.colors.first().cloned().unwrap_or_else(|| "#4f8cff".into());
    let accent = a.colors.get(1).cloned().unwrap_or_else(|| "#3ecf8e".into());
    let font = a.fonts.first().cloned().unwrap_or_else(|| "system-ui".into());
    format!(
        ":root {{\n  --primary: {primary};\n  --accent: {accent};\n  --bg: #ffffff;\n  --text: #1a1a1a;\n  --muted: #6b7280;\n  --radius: 12px;\n}}\n\
        * {{ box-sizing: border-box; }}\n\
        body {{ margin: 0; font-family: \"{font}\", system-ui, sans-serif; color: var(--text); background: var(--bg); line-height: 1.6; }}\n\
        .site-header {{ display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; border-bottom: 1px solid #eee; }}\n\
        .brand {{ font-weight: 700; font-size: 20px; }}\n\
        .nav a {{ margin-left: 18px; text-decoration: none; color: var(--text); }}\n\
        .nav a:hover {{ color: var(--primary); }}\n\
        .hero {{ max-width: 800px; margin: 0 auto; padding: 80px 24px; text-align: center; }}\n\
        .hero h1 {{ font-size: clamp(28px, 6vw, 52px); margin-bottom: 16px; }}\n\
        .hero p {{ color: var(--muted); font-size: 18px; }}\n\
        .cta {{ display: inline-block; margin-top: 24px; padding: 14px 28px; background: var(--primary); color: #fff; border-radius: var(--radius); text-decoration: none; font-weight: 600; }}\n\
        .cta:hover {{ background: var(--accent); }}\n\
        .site-footer {{ padding: 32px 24px; text-align: center; color: var(--muted); border-top: 1px solid #eee; }}\n\
        @media (max-width: 640px) {{ .site-header {{ flex-direction: column; gap: 10px; }} }}\n"
    )
}

const STARTER_JS: &str = "// Základní interakce — rozšiř dle potřeby.\ndocument.querySelectorAll('a[href^=\"#\"]').forEach((a) => {\n  a.addEventListener('click', (e) => { e.preventDefault(); });\n});\n";

const GITIGNORE: &str = "node_modules/\ndist/\n.DS_Store\n*.log\n.env\n";

const ASSETS_NOTICE: &str = "PŘEVZATÝ OBSAH KE KONTROLE\n\nObrázky a podklady odvozené ze zdrojového webu sem patří pouze\ndočasně a je nutné je zkontrolovat z hlediska autorských práv\n(loga, placené fotky, fonty). Nepoužívej je v produkci bez souhlasu.\n";

/// Vytvoří nový projekt redesignu v `parent/<slug>`.
pub fn create_project(a: &Analysis, opts: &CreateOpts, parent: &Path) -> Result<CreateResult, String> {
    let mut log = vec![format!("Režim: {}", opts.mode)];
    let slug = if opts.slug.trim().is_empty() { "redesign".to_string() } else { opts.slug.trim().to_string() };
    let dir = parent.join(&slug);
    if dir.exists() {
        return Err(format!("Cílová složka už existuje: {}", dir.display()));
    }
    std::fs::create_dir_all(&dir).map_err(|e| format!("vytvoření složky: {e}"))?;
    log.push(format!("Vytvořena složka {}", dir.display()));

    let mut files = Vec::new();

    // Metadata a brief — vždy.
    let source_info = serde_json::json!({
        "source": a.source, "source_type": a.source_type, "fetched_at": a.fetched_at,
        "title": a.title, "note": "Redesign projekt — převzatý obsah ke kontrole."
    });
    w(&dir, "source-info.json", &serde_json::to_string_pretty(&source_info).unwrap(), &mut files)?;
    w(&dir, "analysis.json", &serde_json::to_string_pretty(a).map_err(|e| e.to_string())?, &mut files)?;
    w(&dir, "design-brief.md", &design_brief(a), &mut files)?;
    w(&dir, "PROMPT_PRO_CLAUDE.md", &prompt_md(a, opts, &dir.to_string_lossy()), &mut files)?;
    w(
        &dir,
        "README.md",
        &format!(
            "# {} — redesign\n\nNový projekt vytvořený z analýzy zdroje `{}`.\n\n\
            ⚠️ Obsah převzatý ze zdroje je **ke kontrole**, ne finální — zkontroluj autorská práva.\n\n\
            ## Soubory\n- `PROMPT_PRO_CLAUDE.md` — zadání pro AI\n- `design-brief.md` — barvy, fonty, sekce\n\
            - `analysis.json` — surová analýza\n- `source-info.json` — zdroj\n",
            slug, a.source
        ),
        &mut files,
    )?;
    log.push("Zapsány: source-info.json, analysis.json, design-brief.md, PROMPT_PRO_CLAUDE.md, README.md".into());

    // Scaffolding podle režimu.
    match opts.mode.as_str() {
        "analyze" | "prompt" => {
            log.push("Pouze analýza/prompt — scaffolding webu se nevytváří.".into());
        }
        "react" => {
            w(&dir, "package.json", &format!(
                "{{\n  \"name\": \"{slug}\",\n  \"private\": true,\n  \"type\": \"module\",\n  \
                \"scripts\": {{ \"dev\": \"vite\", \"build\": \"vite build\" }},\n  \
                \"devDependencies\": {{ \"vite\": \"^5.0.0\" }}\n}}\n"), &mut files)?;
            w(&dir, "index.html", "<!doctype html>\n<html lang=\"cs\">\n<head>\n  <meta charset=\"utf-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n  <title>Redesign</title>\n</head>\n<body>\n  <div id=\"app\"></div>\n  <script type=\"module\" src=\"/src/main.js\"></script>\n</body>\n</html>\n", &mut files)?;
            w(&dir, "src/main.js", "document.querySelector('#app').innerHTML = '<h1>Redesign — začni v PROMPT_PRO_CLAUDE.md</h1>';\n", &mut files)?;
            w(&dir, "styles/main.css", &starter_css(a), &mut files)?;
            w(&dir, "assets/NOTICE.txt", ASSETS_NOTICE, &mut files)?;
            log.push("Vytvořen Vite scaffold.".into());
        }
        _ => {
            // "static" (výchozí)
            w(&dir, "index.html", &starter_index(a), &mut files)?;
            w(&dir, "styles/main.css", &starter_css(a), &mut files)?;
            w(&dir, "scripts/main.js", STARTER_JS, &mut files)?;
            w(&dir, "assets/NOTICE.txt", ASSETS_NOTICE, &mut files)?;
            log.push("Vytvořen statický HTML/CSS/JS web.".into());
        }
    }

    if opts.init_git {
        w(&dir, ".gitignore", GITIGNORE, &mut files)?;
        match std::process::Command::new("git").arg("init").current_dir(&dir).output() {
            Ok(o) if o.status.success() => log.push("git init OK.".into()),
            Ok(o) => log.push(format!("git init selhal: {}", String::from_utf8_lossy(&o.stderr))),
            Err(e) => log.push(format!("git nedostupný: {e}")),
        }
    }

    Ok(CreateResult { project_dir: dir.to_string_lossy().into_owned(), files, log })
}
