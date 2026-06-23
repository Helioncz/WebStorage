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

  // Weby (slozky na disku, mimo trezor). `rel` = "sites/foo" nebo "site-templates/bar".
  getSitesRoot: () => invoke<{ root: string; preview_port: number }>("get_sites_root"),
  setSitesRoot: (path: string) => invoke<void>("set_sites_root", { path }),
  listSites: () => invoke<Row[]>("list_sites"),
  listSiteTemplates: () => invoke<Row[]>("list_site_templates"),
  useSiteTemplate: (templateRel: string, newSlug: string) =>
    invoke<string>("use_site_template", { templateRel, newSlug }),
  listSiteFiles: (rel: string) => invoke<string[]>("list_site_files", { rel }),
  readSiteFile: (rel: string, path: string) =>
    invoke<string>("read_site_file", { rel, path }),
  writeSiteFile: (rel: string, path: string, content: string) =>
    invoke<void>("write_site_file", { rel, path, content }),
  sitePreviewUrl: (rel: string) => invoke<string>("site_preview_url", { rel }),
  openSiteFolder: (rel: string) => invoke<void>("open_site_folder", { rel }),
  exportSiteZip: (rel: string, dest: string) =>
    invoke<void>("export_site_zip", { rel, dest }),
  getDeployUrl: (rel: string) => invoke<string | null>("get_deploy_url", { rel }),
  setDeployUrl: (rel: string, url: string) => invoke<void>("set_deploy_url", { rel, url }),
  openExternalUrl: (url: string) => invoke<void>("open_external_url", { url }),

  // AI asistent
  getAiConfig: () => invoke<AiConfig>("get_ai_config"),
  setAiConfig: (config: AiConfig) => invoke<void>("set_ai_config", { config }),
  aiHttpPost: (url: string, headers: Record<string, string>, body: string) =>
    invoke<{ status: number; body: string }>("ai_http_post", { url, headers, body }),

  // Historie, hledani, dashboard
  listEvents: (projectId: string) => invoke<Row[]>("list_events", { projectId }),
  search: (query: string) => invoke<Row[]>("search", { query }),
  dashboard: () => invoke<any>("dashboard"),
};
