import { api } from "./api";

// GitHub logika pres backend proxy (api.githubApi). Token zustava v Rustu.

export type RepoLink = { owner: string; repo: string; url: string; branch: string };

function b64encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
function b64decode(b64: string): string {
  const bin = atob((b64 || "").replace(/\n/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function gh(method: string, path: string, body?: any): Promise<any> {
  const res = await api.githubApi(method, path, body !== undefined ? JSON.stringify(body) : undefined);
  const data = res.body ? JSON.parse(res.body) : {};
  if (res.status >= 400) {
    throw new Error(data?.message || `GitHub ${res.status}`);
  }
  return data;
}

/** Ověří token a vrátí GitHub login, nebo null. */
export async function githubLogin(): Promise<string | null> {
  if (!(await api.githubHasToken())) return null;
  try {
    const u = await gh("GET", "/user");
    return u.login || null;
  } catch {
    return null;
  }
}

/** Vytvoří nový repozitář (auto_init = má hned main + první commit). */
export async function createRepo(name: string, isPrivate: boolean, description = ""): Promise<RepoLink> {
  const r = await gh("POST", "/user/repos", { name, private: isPrivate, auto_init: true, description });
  return { owner: r.owner.login, repo: r.name, url: r.html_url, branch: r.default_branch || "main" };
}

/** Načte všechny soubory webu z disku (text). */
async function readAllFiles(rel: string): Promise<{ path: string; content: string }[]> {
  const paths = await api.listSiteFiles(rel);
  const out: { path: string; content: string }[] = [];
  for (const p of paths) {
    try {
      out.push({ path: p, content: await api.readSiteFile(rel, p) });
    } catch {
      // binarni / nečitelný soubor přeskočíme (MVP)
    }
  }
  return out;
}

/** Commitne a pushne VŠECHNY soubory jako jeden commit (Git Data API). */
export async function commitAndPush(rel: string, link: RepoLink, message: string): Promise<string> {
  const { owner, repo, branch } = link;
  const files = await readAllFiles(rel);
  if (files.length === 0) throw new Error("Žádné soubory k pushnutí.");

  // 1) aktuální ref + base tree
  const ref = await gh("GET", `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
  const baseCommitSha = ref.object.sha;
  const baseCommit = await gh("GET", `/repos/${owner}/${repo}/git/commits/${baseCommitSha}`);
  const baseTreeSha = baseCommit.tree.sha;

  // 2) blobs
  const tree: any[] = [];
  for (const f of files) {
    const blob = await gh("POST", `/repos/${owner}/${repo}/git/blobs`, { content: b64encode(f.content), encoding: "base64" });
    tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  // 3) tree + 4) commit + 5) update ref
  const newTree = await gh("POST", `/repos/${owner}/${repo}/git/trees`, { base_tree: baseTreeSha, tree });
  const newCommit = await gh("POST", `/repos/${owner}/${repo}/git/commits`, { message, tree: newTree.sha, parents: [baseCommitSha] });
  await gh("PATCH", `/repos/${owner}/${repo}/git/refs/heads/${branch}`, { sha: newCommit.sha });
  return newCommit.sha;
}

/** Stáhne aktuální stav repa do souborů na disku (add/update; mazání řeší uživatel). */
export async function pull(rel: string, link: RepoLink): Promise<number> {
  const { owner, repo, branch } = link;
  const tree = await gh("GET", `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
  let count = 0;
  for (const item of tree.tree || []) {
    if (item.type !== "blob") continue;
    const blob = await gh("GET", `/repos/${owner}/${repo}/git/blobs/${item.sha}`);
    const content = blob.encoding === "base64" ? b64decode(blob.content) : blob.content;
    await api.writeSiteFile(rel, item.path, content);
    count++;
  }
  return count;
}

export async function loadRepoLink(rel: string): Promise<RepoLink | null> {
  const raw = await api.getRepoLink(rel);
  return raw ? (JSON.parse(raw) as RepoLink) : null;
}
export async function saveRepoLink(rel: string, link: RepoLink): Promise<void> {
  await api.setRepoLink(rel, JSON.stringify(link));
}
