//! Katalog šablon projektů. Každá šablona předvyplní strukturu nového projektu
//! (úkoly, odkazy, přístupy, poznámku) a volitelně nakopíruje startovací kód webu.

use serde_json::{json, Value};

pub struct TmplTask {
    pub title: &'static str,
    pub priority: &'static str,
}
pub struct TmplLink {
    pub title: &'static str,
    pub url: &'static str,
    pub ltype: &'static str,
}
pub struct TmplCred {
    pub title: &'static str,
    pub ctype: &'static str,
}
pub struct TmplFile {
    pub name: &'static str,
    pub content: &'static str,
}

pub struct Template {
    pub key: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub icon: &'static str,
    pub ptype: &'static str,
    pub note_title: &'static str,
    pub note_body: &'static str,
    pub tasks: &'static [TmplTask],
    pub links: &'static [TmplLink],
    pub creds: &'static [TmplCred],
    pub files: &'static [TmplFile],
}

// --- Startovací kód webu (vložen do binárky při kompilaci) ---
const WEB_INDEX: &str = include_str!("../templates/web/index.html");
const WEB_STYLES: &str = include_str!("../templates/web/styles.css");
const WEB_SCRIPT: &str = include_str!("../templates/web/script.js");

const WEB_FILES: &[TmplFile] = &[
    TmplFile { name: "index.html", content: WEB_INDEX },
    TmplFile { name: "styles.css", content: WEB_STYLES },
    TmplFile { name: "script.js", content: WEB_SCRIPT },
];

// ---------------------------- WEB ----------------------------
const WEB_TASKS: &[TmplTask] = &[
    TmplTask { title: "Úvodní schůzka a zadání s klientem", priority: "high" },
    TmplTask { title: "Registrace / převzetí domény", priority: "high" },
    TmplTask { title: "Zajistit hosting a DNS", priority: "high" },
    TmplTask { title: "Návrh struktury webu (sitemap)", priority: "normal" },
    TmplTask { title: "Grafický návrh / wireframe", priority: "normal" },
    TmplTask { title: "Dodat texty a fotky od klienta", priority: "normal" },
    TmplTask { title: "Vývoj a naplnění obsahem", priority: "normal" },
    TmplTask { title: "Responzivita (mobil/tablet)", priority: "normal" },
    TmplTask { title: "SEO základ (title, popisky, sitemap.xml)", priority: "normal" },
    TmplTask { title: "Nasadit SSL certifikát (HTTPS)", priority: "high" },
    TmplTask { title: "Cookie lišta a GDPR", priority: "normal" },
    TmplTask { title: "Napojit analytiku (GA / Plausible)", priority: "low" },
    TmplTask { title: "Otestovat formuláře a odkazy", priority: "high" },
    TmplTask { title: "Kontrola rychlosti (PageSpeed)", priority: "low" },
    TmplTask { title: "Spuštění a kontrola po nasazení", priority: "urgent" },
    TmplTask { title: "Předání klientovi + zaškolení", priority: "high" },
];
const WEB_LINKS: &[TmplLink] = &[
    TmplLink { title: "Produkční web", url: "https://", ltype: "web" },
    TmplLink { title: "Testovací / staging", url: "https://", ltype: "staging" },
    TmplLink { title: "Administrace / CMS", url: "https://", ltype: "admin" },
    TmplLink { title: "Git repozitář", url: "https://", ltype: "git" },
    TmplLink { title: "Hosting (admin)", url: "https://", ltype: "hosting" },
    TmplLink { title: "Správa domény", url: "https://", ltype: "hosting" },
    TmplLink { title: "Analytika", url: "https://", ltype: "monitoring" },
];
const WEB_CREDS: &[TmplCred] = &[
    TmplCred { title: "Administrace / CMS", ctype: "admin" },
    TmplCred { title: "Hosting", ctype: "hosting" },
    TmplCred { title: "FTP / SFTP", ctype: "ftp" },
    TmplCred { title: "Databáze", ctype: "db" },
    TmplCred { title: "Doména / registrátor", ctype: "domain" },
    TmplCred { title: "E-mailové schránky", ctype: "email" },
];
const WEB_NOTE: &str = r#"# Předávací protokol — web

## Co je předáno
- [ ] Funkční web na produkční doméně
- [ ] Přístupy do administrace
- [ ] Přístupy k hostingu / FTP
- [ ] Zdrojové soubory / repozitář

## Použité technologie
- Doména:
- Hosting:
- CMS / framework:
- Verze PHP / Node:

## Provoz a údržba
- Zálohování:
- SSL certifikát (expirace):
- Kontakt na podporu:

## Poznámky
"#;

// ---------------------------- E-SHOP ----------------------------
const ESHOP_TASKS: &[TmplTask] = &[
    TmplTask { title: "Zadání a výběr platformy (Shoptet/WooCommerce/…)", priority: "high" },
    TmplTask { title: "Doména + hosting + SSL", priority: "high" },
    TmplTask { title: "Import produktů a kategorií", priority: "high" },
    TmplTask { title: "Nastavit dopravy a platby", priority: "high" },
    TmplTask { title: "Fakturační / účetní napojení", priority: "normal" },
    TmplTask { title: "Obchodní podmínky, reklamace, GDPR", priority: "high" },
    TmplTask { title: "Feedy (Heureka, Zboží, Google Merchant)", priority: "normal" },
    TmplTask { title: "Testovací objednávka end-to-end", priority: "urgent" },
    TmplTask { title: "Napojit platební bránu (ostrý režim)", priority: "high" },
    TmplTask { title: "SEO a měření konverzí", priority: "normal" },
    TmplTask { title: "Spuštění a kontrola objednávkového procesu", priority: "urgent" },
    TmplTask { title: "Předání a zaškolení obsluhy", priority: "high" },
];
const ESHOP_LINKS: &[TmplLink] = &[
    TmplLink { title: "Produkční e-shop", url: "https://", ltype: "web" },
    TmplLink { title: "Administrace e-shopu", url: "https://", ltype: "admin" },
    TmplLink { title: "Platební brána (admin)", url: "https://", ltype: "admin" },
    TmplLink { title: "Hosting", url: "https://", ltype: "hosting" },
    TmplLink { title: "Heureka / feedy", url: "https://", ltype: "monitoring" },
];
const ESHOP_CREDS: &[TmplCred] = &[
    TmplCred { title: "Administrace e-shopu", ctype: "admin" },
    TmplCred { title: "Platební brána", ctype: "api" },
    TmplCred { title: "Hosting", ctype: "hosting" },
    TmplCred { title: "FTP / SFTP", ctype: "ftp" },
    TmplCred { title: "Databáze", ctype: "db" },
    TmplCred { title: "Doména / registrátor", ctype: "domain" },
];
const ESHOP_NOTE: &str = r#"# Předávací protokol — e-shop

## Platforma
- Systém:
- Verze / tarif:

## Platby a doprava
- Platební brána:
- Dopravci:

## Napojení
- Účetnictví / fakturace:
- Feedy (Heureka, Zboží, Google):

## Provoz
- SSL (expirace):
- Zálohy:
- Kontakt na podporu:
"#;

// ---------------------------- SERVISNÍ ZAKÁZKA ----------------------------
const SERVICE_TASKS: &[TmplTask] = &[
    TmplTask { title: "Zaznamenat požadavek klienta", priority: "high" },
    TmplTask { title: "Zálohovat web před zásahem", priority: "urgent" },
    TmplTask { title: "Diagnostika problému", priority: "high" },
    TmplTask { title: "Návrh řešení + odhad času", priority: "normal" },
    TmplTask { title: "Provést úpravu", priority: "normal" },
    TmplTask { title: "Otestovat na stagingu", priority: "high" },
    TmplTask { title: "Nasadit na produkci", priority: "high" },
    TmplTask { title: "Potvrzení funkčnosti s klientem", priority: "normal" },
    TmplTask { title: "Vykázat práci / fakturace", priority: "normal" },
];
const SERVICE_LINKS: &[TmplLink] = &[
    TmplLink { title: "Web klienta", url: "https://", ltype: "web" },
    TmplLink { title: "Administrace", url: "https://", ltype: "admin" },
    TmplLink { title: "Hosting", url: "https://", ltype: "hosting" },
];
const SERVICE_CREDS: &[TmplCred] = &[
    TmplCred { title: "Administrace / CMS", ctype: "admin" },
    TmplCred { title: "FTP / SFTP", ctype: "ftp" },
    TmplCred { title: "Hosting", ctype: "hosting" },
];
const SERVICE_NOTE: &str = r#"# Servisní záznam

## Požadavek
-

## Provedené kroky
-

## Výsledek / poznámky
-
"#;

// ---------------------------- KATALOG ----------------------------
const NONE: &[TmplTask] = &[];
const NO_LINKS: &[TmplLink] = &[];
const NO_CREDS: &[TmplCred] = &[];
const NO_FILES: &[TmplFile] = &[];

pub fn catalog() -> &'static [Template] {
    const C: &[Template] = &[
        Template {
            key: "web",
            name: "Webová stránka",
            description: "Prezentační web — kompletní checklist od domény po předání, sada odkazů, přístupů a startovací kód webu.",
            icon: "🌐",
            ptype: "web",
            note_title: "Předávací protokol",
            note_body: WEB_NOTE,
            tasks: WEB_TASKS,
            links: WEB_LINKS,
            creds: WEB_CREDS,
            files: WEB_FILES,
        },
        Template {
            key: "eshop",
            name: "E-shop",
            description: "Internetový obchod — checklist spuštění včetně plateb, doprav, feedů a předávacího protokolu.",
            icon: "🛒",
            ptype: "eshop",
            note_title: "Předávací protokol",
            note_body: ESHOP_NOTE,
            tasks: ESHOP_TASKS,
            links: ESHOP_LINKS,
            creds: ESHOP_CREDS,
            files: NO_FILES,
        },
        Template {
            key: "service",
            name: "Servisní zakázka",
            description: "Údržba / úprava existujícího webu — rychlý servisní postup, klíčové odkazy a přístupy.",
            icon: "🔧",
            ptype: "service",
            note_title: "Servisní záznam",
            note_body: SERVICE_NOTE,
            tasks: SERVICE_TASKS,
            links: SERVICE_LINKS,
            creds: SERVICE_CREDS,
            files: NO_FILES,
        },
        Template {
            key: "blank",
            name: "Prázdný projekt",
            description: "Začni od nuly bez předvyplněné struktury.",
            icon: "📄",
            ptype: "",
            note_title: "",
            note_body: "",
            tasks: NONE,
            links: NO_LINKS,
            creds: NO_CREDS,
            files: NO_FILES,
        },
    ];
    C
}

pub fn find(key: &str) -> Option<&'static Template> {
    catalog().iter().find(|t| t.key == key)
}

/// Metadata pro frontend (bez obsahu poznámky a kódu, jen počty).
pub fn metadata() -> Vec<Value> {
    catalog()
        .iter()
        .map(|t| {
            json!({
                "key": t.key,
                "name": t.name,
                "description": t.description,
                "icon": t.icon,
                "type": t.ptype,
                "counts": {
                    "tasks": t.tasks.len(),
                    "links": t.links.len(),
                    "creds": t.creds.len(),
                    "files": t.files.len(),
                }
            })
        })
        .collect()
}
