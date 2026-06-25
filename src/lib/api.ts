import { invoke } from "@tauri-apps/api/core";

// Tenke obaleni Tauri commandu. Nazvy odpovidaji #[tauri::command] v Rustu.

export type Project = Record<string, any>;
export type Row = Record<string, any>;
export type AiConfig = { provider: string; baseUrl: string; model: string; apiKey: string };

export const api = {
  // Vault
  vaultStatus: () => invoke<{ initialized: boolean; unlocked: boolean }>("vault_status"),
  initialize: (password: string) => invoke<void>("initialize", { password }),
  unlock: (password: string) => invoke<void>("unlock", { password }),
  lock: () => invoke<void>("lock"),
  resetVault: () => invoke<void>("reset_vault"),
  appVersion: () => invoke<string>("app_version"),
  backupVault: (dest: string) => invoke<void>("backup_vault", { dest }),

  // Projekty
  listProjects: () => invoke<Project[]>("list_projects"),
  getProject: (id: string) => invoke<Project>("get_project", { id }),
  createProject: (name: string, client?: string, ptype?: string) =>
    invoke<string>("create_project", { name, client, ptype }),

  // Sablony
  listTemplates: () => invoke<Row[]>("list_templates"),
  createProjectFromTemplate: (templateKey: string, name: string, client?: string) =>
    invoke<string>("create_project_from_template", { templateKey, name, client }),
  updateProject: (id: string, fields: Record<string, any>) =>
    invoke<void>("update_project", { id, fields }),
  deleteProject: (id: string) => invoke<void>("delete_project", { id }),
  touchOpened: (id: string) => invoke<void>("touch_opened", { id }),

  // Poznamky
  listNotes: (projectId: string) => invoke<Row[]>("list_notes", { projectId }),
  saveNote: (projectId: string, title: string, bodyMd: string, id?: string) =>
    invoke<string>("save_note", { id, projectId, title, bodyMd }),
  deleteNote: (id: string) => invoke<void>("delete_note", { id }),

  // Odkazy
  listLinks: (projectId: string) => invoke<Row[]>("list_links", { projectId }),
  saveLink: (
    projectId: string,
    title: string,
    url: string,
    ltype?: string,
    description?: string,
    id?: string
  ) => invoke<string>("save_link", { id, projectId, title, url, ltype, description }),
  deleteLink: (id: string) => invoke<void>("delete_link", { id }),

  // Pristupy
  listCredentials: (projectId: string) => invoke<Row[]>("list_credentials", { projectId }),
  revealCredential: (id: string) => invoke<string>("reveal_credential", { id }),
  saveCredential: (c: {
    id?: string;
    projectId: string;
    title: string;
    ctype?: string;
    username?: string;
    secret?: string;
    url?: string;
    note?: string;
  }) => invoke<string>("save_credential", c),
  deleteCredential: (id: string) => invoke<void>("delete_credential", { id }),

  // Ukoly
  listTasks: (projectId: string) => invoke<Row[]>("list_tasks", { projectId }),
  saveTask: (t: {
    id?: string;
    projectId: string;
    title: string;
    status: string;
    priority: string;
    dueDate?: string;
  }) => invoke<string>("save_task", t),
  deleteTask: (id: string) => invoke<void>("delete_task", { id }),

  // Soubory
  listFiles: (projectId: string) => invoke<Row[]>("list_files", { projectId }),
  importFile: (projectId: string, srcPath: string) =>
    invoke<string>("import_file", { projectId, srcPath }),
  openFile: (id: string) => invoke<void>("open_file", { id }),
  deleteFile: (id: string) => invoke<void>("delete_file", { id }),
  openExternalUrl: (url: string) => invoke<void>("open_external_url", { url }),
  listFileVersions: (fileId: string) => invoke<Row[]>("list_file_versions", { fileId }),
  restoreFileVersion: (versionId: string) =>
    invoke<void>("restore_file_version", { versionId }),

  // Sablony
  listTemplates: () => invoke<Row[]>("list_templates"),
  saveTemplate: (name: string, description: string, payloadJson: string) =>
    invoke<string>("save_template", { name, description, payloadJson }),
  deleteTemplate: (id: string) => invoke<void>("delete_template", { id }),
  createProjectFromTemplate: (templateId: string, name: string, client?: string) =>
    invoke<string>("create_project_from_template", { templateId, name, client }),

  // Monitoring
  listMonitors: (projectId: string) => invoke<Row[]>("list_monitors", { projectId }),
  saveMonitor: (projectId: string, label: string, url: string, id?: string) =>
    invoke<string>("save_monitor", { id, projectId, label, url }),
  deleteMonitor: (id: string) => invoke<void>("delete_monitor", { id }),
  checkMonitor: (id: string) => invoke<Row>("check_monitor", { id }),

  // Export webu pro zakaznika
  exportSite: (a: {
    srcDir: string;
    destZip: string;
    projectName: string;
    client?: string;
    baseUrl?: string;
    projectId?: string;
  }) => invoke<{ files: number; bytes: number; zipPath: string }>("export_site", a),

  // Cloud sync (Supabase, E2E šifrované)
  cloudStatus: () =>
    invoke<{
      configured: boolean;
      url?: string;
      email?: string;
      bucket: string;
      last_synced?: string;
    }>("cloud_status"),
  cloudSetConfig: (c: {
    url: string;
    anonKey: string;
    email: string;
    password: string;
    bucket?: string;
  }) => invoke<void>("cloud_set_config", c),
  cloudTest: () => invoke<string>("cloud_test"),
  cloudPush: () => invoke<{ size: number; updated_at: string }>("cloud_push"),
  cloudRemoteInfo: () =>
    invoke<{ exists: boolean; updated_at?: string; device?: string; size?: number }>(
      "cloud_remote_info"
    ),
  cloudPull: () => invoke<void>("cloud_pull"),

  // Weby (slozky na disku, mimo trezor). `rel` = "sites/foo" nebo "site-templates/bar".
  getSitesRoot: () => invoke<{ root: string; preview_port: number }>("get_sites_root"),
  setSitesRoot: (path: string) => invoke<void>("set_sites_root", { path }),
  listSites: () => invoke<Row[]>("list_sites"),
  setSiteName: (rel: string, name: string) => invoke<void>("set_site_name", { rel, name }),
  setSiteIcon: (rel: string, dataUrl: string) => invoke<void>("set_site_icon", { rel, dataUrl }),
  readFileBase64: (path: string) => invoke<string>("read_file_base64", { path }),
  importTemplate: (srcPath: string, name: string) => invoke<string>("import_template", { srcPath, name }),
  listSiteTemplates: () => invoke<Row[]>("list_site_templates"),
  useSiteTemplate: (templateRel: string, newSlug: string) =>
    invoke<string>("use_site_template", { templateRel, newSlug }),
  listSiteFiles: (rel: string) => invoke<string[]>("list_site_files", { rel }),
  readSiteFile: (rel: string, path: string) =>
    invoke<string>("read_site_file", { rel, path }),
  writeSiteFile: (rel: string, path: string, content: string) =>
    invoke<void>("write_site_file", { rel, path, content }),
  deleteSiteFile: (rel: string, path: string) =>
    invoke<void>("delete_site_file", { rel, path }),
  importAsset: (rel: string, srcPath: string, subdir?: string) =>
    invoke<string>("import_asset", { rel, srcPath, subdir }),
  deleteSite: (rel: string) => invoke<void>("delete_site", { rel }),
  sitePreviewUrl: (rel: string) => invoke<string>("site_preview_url", { rel }),
  openSiteFolder: (rel: string) => invoke<void>("open_site_folder", { rel }),
  exportSiteZip: (rel: string, dest: string) =>
    invoke<void>("export_site_zip", { rel, dest }),
  getDeployUrl: (rel: string) => invoke<string | null>("get_deploy_url", { rel }),
  setDeployUrl: (rel: string, url: string) => invoke<void>("set_deploy_url", { rel, url }),
  setNetlifyToken: (token: string) => invoke<void>("set_netlify_token", { token }),
  netlifyHasToken: () => invoke<boolean>("netlify_has_token"),
  netlifyDeploy: (rel: string) => invoke<string>("netlify_deploy", { rel }),
  openExternalUrl: (url: string) => invoke<void>("open_external_url", { url }),

  // AI asistent
  getAiConfig: () => invoke<AiConfig>("get_ai_config"),
  setAiConfig: (config: AiConfig) => invoke<void>("set_ai_config", { config }),
  aiHttpPost: (url: string, headers: Record<string, string>, body: string) =>
    invoke<{ status: number; body: string }>("ai_http_post", { url, headers, body }),

  // GitHub (token jen v backendu)
  setGithubToken: (token: string) => invoke<void>("set_github_token", { token }),
  githubHasToken: () => invoke<boolean>("github_has_token"),
  githubApi: (method: string, path: string, body?: string) =>
    invoke<{ status: number; body: string }>("github_api", { method, path, body }),
  getRepoLink: (rel: string) => invoke<string | null>("get_repo_link", { rel }),
  setRepoLink: (rel: string, value: string) => invoke<void>("set_repo_link", { rel, value }),
  // Lokální git (GitHub Desktop)
  gitAvailable: () => invoke<boolean>("git_available"),
  gitIsRepo: (rel: string) => invoke<boolean>("git_is_repo", { rel }),
  gitLink: (rel: string) => invoke<void>("git_link", { rel }),
  gitCommitPush: (rel: string, message: string) => invoke<string>("git_commit_push", { rel, message }),
  gitInitPush: (rel: string, message: string) => invoke<string>("git_init_push", { rel, message }),
  gitPull: (rel: string) => invoke<void>("git_pull", { rel }),
  openInGithubDesktop: (rel: string) => invoke<void>("open_in_github_desktop", { rel }),
  detectApps: () => invoke<{ name: string; path: string }[]>("detect_apps"),
  openInApp: (rel: string, app: string) => invoke<void>("open_in_app", { rel, app }),
  getOpenApp: () => invoke<string>("get_open_app"),
  setOpenApp: (app: string) => invoke<void>("set_open_app", { app }),
  getSyncConfig: () => invoke<{ url: string; has_token: boolean }>("get_sync_config"),
  setSyncConfig: (url: string, token?: string) =>
    invoke<void>("set_sync_config", { url, token }),
  syncCheckLatest: (rel: string) =>
    invoke<{
      owner: string;
      repo: string;
      last_seen_id: number;
      latest_id: number;
      changed: boolean;
      latest: Record<string, any> | null;
    }>("sync_check_latest", { rel }),
  syncMarkSeen: (rel: string, eventId: number) =>
    invoke<void>("sync_mark_seen", { rel, eventId }),

  // Historie, hledani, dashboard
  listEvents: (projectId: string) => invoke<Row[]>("list_events", { projectId }),
  search: (query: string) => invoke<Row[]>("search", { query }),
  dashboard: () => invoke<any>("dashboard"),
};
