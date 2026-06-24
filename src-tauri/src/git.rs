//! Lokální git operace přes systémový `git` — aby web byl skutečný git repozitář
//! viditelný v GitHub Desktop. Token se vkládá jen efemérně do URL (neukládá se do configu).

use std::path::Path;
use std::process::Command;

fn run(dir: &Path, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .current_dir(dir)
        .args(args)
        .output()
        .map_err(|e| format!("git nelze spustit: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// `git` je dostupný.
pub fn available() -> bool {
    Command::new("git").arg("--version").output().map(|o| o.status.success()).unwrap_or(false)
}

/// Slozka je git repozitar.
pub fn is_repo(dir: &Path) -> bool {
    dir.join(".git").exists()
}

fn token_url(owner: &str, repo: &str, token: &str) -> String {
    format!("https://x-access-token:{token}@github.com/{owner}/{repo}.git")
}
fn clean_url(owner: &str, repo: &str) -> String {
    format!("https://github.com/{owner}/{repo}.git")
}

/// Propojí lokální složku s existujícím vzdáleným repem (clone-into):
/// init + remote + fetch + checkout. Soubory na disku se srovnají se vzdáleným stavem.
pub fn link(dir: &Path, owner: &str, repo: &str, branch: &str, token: &str) -> Result<(), String> {
    if is_repo(dir) {
        // už je repo — jen zkontroluj remote
        let _ = run(dir, &["remote", "remove", "origin"]);
        run(dir, &["remote", "add", "origin", &clean_url(owner, repo)])?;
        return Ok(());
    }
    // init
    if run(dir, &["init", "-b", branch]).is_err() {
        run(dir, &["init"])?;
        let _ = run(dir, &["checkout", "-b", branch]);
    }
    run(dir, &["remote", "add", "origin", &clean_url(owner, repo)])?;
    let turl = token_url(owner, repo, token);
    let refspec = format!("+refs/heads/{branch}:refs/remotes/origin/{branch}");
    run(dir, &["fetch", &turl, &refspec]).map_err(|e| format!("git fetch: {e}"))?;
    // reset --hard nepadá na existující netrackované soubory (na rozdíl od checkout)
    run(dir, &["reset", "--hard", &format!("origin/{branch}")])
        .map_err(|e| format!("git reset: {e}"))?;
    let _ = run(dir, &["branch", &format!("--set-upstream-to=origin/{branch}"), branch]);
    Ok(())
}

/// Inicializuje NOVY lokalni repo (prazdny remote) + commit VSECH souboru (i binarnich) + push.
/// Pouziva se pri zalozeni repa, aby se na GitHub dostaly i obrazky.
pub fn init_push(dir: &Path, owner: &str, repo: &str, branch: &str, token: &str, message: &str) -> Result<String, String> {
    if run(dir, &["init", "-b", branch]).is_err() {
        run(dir, &["init"])?;
        let _ = run(dir, &["checkout", "-b", branch]);
    }
    run(dir, &["add", "-A"])?;
    let email = format!("{owner}@users.noreply.github.com");
    let _ = run(dir, &[
        "-c", &format!("user.name={owner}"),
        "-c", &format!("user.email={email}"),
        "commit", "-m", message,
    ]);
    let turl = token_url(owner, repo, token);
    run(dir, &["push", &turl, &format!("HEAD:refs/heads/{branch}")]).map_err(|e| format!("git push: {e}"))?;
    let _ = run(dir, &["remote", "remove", "origin"]);
    let _ = run(dir, &["remote", "add", "origin", &clean_url(owner, repo)]);
    let _ = run(dir, &["fetch", &turl, &format!("+refs/heads/{branch}:refs/remotes/origin/{branch}")]);
    let _ = run(dir, &["branch", &format!("--set-upstream-to=origin/{branch}"), branch]);
    run(dir, &["rev-parse", "HEAD"])
}

/// add + commit + push (lokální git). Vrátí HEAD sha.
pub fn commit_push(dir: &Path, owner: &str, repo: &str, branch: &str, token: &str, message: &str) -> Result<String, String> {
    run(dir, &["add", "-A"])?;
    // commit s efemerní identitou (GitHub Desktop si pak nastaví svou)
    let email = format!("{owner}@users.noreply.github.com");
    let commit = run(dir, &[
        "-c", &format!("user.name={owner}"),
        "-c", &format!("user.email={email}"),
        "commit", "-m", message,
    ]);
    if let Err(e) = &commit {
        // "nothing to commit" není chyba
        if !e.contains("nothing to commit") && !e.to_lowercase().contains("nothing added") {
            return Err(format!("git commit: {e}"));
        }
    }
    let turl = token_url(owner, repo, token);
    run(dir, &["push", &turl, &format!("HEAD:refs/heads/{branch}")]).map_err(|e| format!("git push: {e}"))?;
    let _ = run(dir, &["fetch", &turl, &format!("+refs/heads/{branch}:refs/remotes/origin/{branch}")]);
    run(dir, &["rev-parse", "HEAD"])
}

/// fetch + fast-forward merge (stáhne změny z GitHubu).
pub fn pull(dir: &Path, owner: &str, repo: &str, branch: &str, token: &str) -> Result<(), String> {
    let turl = token_url(owner, repo, token);
    run(dir, &["fetch", &turl, &format!("+refs/heads/{branch}:refs/remotes/origin/{branch}")])
        .map_err(|e| format!("git fetch: {e}"))?;
    run(dir, &["merge", "--ff-only", &format!("origin/{branch}")])
        .map_err(|_| "Lokální a vzdálené změny se rozešly. Vyřeš to v GitHub Desktop (merge).".to_string())?;
    Ok(())
}
