# Project Hangar

Lokální desktopová aplikace pro správu projektů (web, e-shop, zakázky…).
Tauri 2 + React/TypeScript + šifrovaná SQLite (SQLCipher). **MVP** — bez AI, bez sync, bez monitoringu.

## Co umí (MVP)

- **Master heslo** → Argon2id → šifrovaný trezor (SQLCipher, AES-256). Bez hesla data nepřečteš.
- **Projekty** — CRUD, stav, priorita, typ, štítky, klient, oblíbené.
- **Soubory** — import (drag&drop přes dialog), uložení v content-addressable storage (SHA-256), otevření v OS.
- **Poznámky** — markdown.
- **Odkazy** — web/admin/git/hosting…, otevření jedním klikem.
- **Přístupy** — login + heslo v šifrované DB, heslo skryté dokud ho nevyžádáš, kopírování s auto-clear schránky.
- **Úkoly** — stavy, termíny.
- **Historie** — automatický log událostí v projektu.
- **Fulltext vyhledávání** (SQLite FTS5, bez diakritiky) přes projekty, poznámky, soubory.
- **Dashboard** — počty, naposledy otevřené, úkoly po termínu.
- Tmavý / světlý režim.

Data leží v `%APPDATA%\cz.helion.projecthangar\vault\` (Windows) / `~/Library/Application Support/...` (macOS):
`vault.db` (šifrovaná DB), `vault.salt`, `objects/` (soubory).

## Předpoklady (Windows)

Nainstaluj (přes [winget]):

```powershell
winget install OpenJS.NodeJS.LTS
winget install Rustlang.Rustup
# Build SQLCipher staticky kompiluje OpenSSL — potřebuje Perl a NASM:
winget install StrawberryPerl.StrawberryPerl
winget install NASM.NASM
```

Dále:
- **Visual Studio Build Tools** s „Desktop development with C++" (MSVC linker pro Rust).
- **WebView2 Runtime** (na Win 11 už bývá předinstalovaný).
- Po instalaci NASM přidej jeho složku do `PATH` (typicky `C:\Program Files\NASM`) a otevři nový terminál.

Ověř:
```powershell
node --version; cargo --version; rustc --version
perl --version; nasm --version
```

> Pozn.: `bundled-sqlcipher-vendored-openssl` kompiluje OpenSSL ze zdrojáků → odtud Perl + NASM.

## Předpoklady (macOS)

Stejný kód, jiný toolchain. Funguje na Intel i Apple Silicon (M1–M4).

```bash
# 1) Xcode command line tools (C kompilátor, linker)
xcode-select --install

# 2) Homebrew (pokud ho nemáš): https://brew.sh
# 3) Node + Rust + NASM (NASM kvůli buildu OpenSSL pro SQLCipher)
brew install node nasm
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Perl je v macOS součástí systému, instalovat netřeba. WebView (WKWebView) je taky vestavěný.

Ověř:
```bash
node --version && cargo --version && rustc --version
perl --version && nasm --version
```

Data trezoru jsou na Macu v `~/Library/Application Support/cz.helion.projecthangar/vault/`.

## Spuštění (dev)

Windows (PowerShell) i macOS/Linux (bash) — stejné příkazy:

```bash
npm install
npm run tauri dev
```

První build Rustu (včetně OpenSSL + SQLCipher) trvá několik minut, další jsou rychlé.

Při prvním spuštění si nastavíš master heslo → vytvoří se šifrovaný trezor.

## Build instalačky

```bash
npm run tauri build
```

- **Windows** → `.msi` / `.exe`. Pro installer doplň ikonu `.ico` a vrať `icons/icon.ico` do `tauri.conf.json`.
- **macOS** → `.app` / `.dmg`. Doplň ikonu `.icns` a vrať `icons/icon.icon` do `tauri.conf.json`.
- Sadu ikon (vč. `.ico` a `.icns`) vygeneruješ z jednoho PNG: `npm run tauri icon path/to/logo.png`.

> **macOS distribuce:** nepodepsaná `.app` půjde spustit jen přes pravý klik → Otevřít (Gatekeeper).
> Pro rozdávání mimo svůj Mac je potřeba Apple Developer účet (codesign + notarizace). Pro vlastní použití to neřeš.
> Build pro Mac musí proběhnout **na Macu** — z Windows zkřížený build Tauri nedělá.

## Struktura

```
src/                      React frontend
  lib/api.ts              obal nad Tauri commandy
  store/useStore.ts       Zustand stav (theme, výběr projektu)
  components/             Unlock, Sidebar, Dashboard, ProjectDetail (taby)
src-tauri/
  src/lib.rs              všechny commandy + bootstrap
  src/crypto.rs           Argon2id odvození klíče
  src/db.rs               SQL schema (MVP)
  src/files.rs            CAS úložiště souborů
  tauri.conf.json         konfigurace okna a bundlu
```

## Co schválně NENÍ v MVP

AI asistent, cloud/sync, týmová spolupráce, monitoring webů/expirací, verzování souborů,
šablony projektů, OCR, biometrika, systémový keychain. Připraveno v datovém modelu, dodělá se ve fázi 2/3.
