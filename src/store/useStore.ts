import { create } from "zustand";

type View = "dashboard" | "project" | "sites" | "settings" | "help" | "redesign";

interface AppStore {
  unlocked: boolean;
  setUnlocked: (v: boolean) => void;
  theme: string;
  toggleTheme: () => void;
  setTheme: (t: string) => void;
  view: View;
  selectedProjectId: string | null;
  openProject: (id: string) => void;
  openDashboard: () => void;
  openSites: () => void;
  gotoSettings: () => void;
  openHelp: () => void;
  openRedesign: () => void;
  refreshKey: number;
  refresh: () => void;
  // Stavová lišta — krátká zpráva o probíhající akci
  statusMsg: string;
  setStatus: (m: string) => void;
  // Nový projekt (web) — globální modal
  newProjectOpen: boolean;
  newProjectTemplate: string | null;
  openNewProject: (template?: string | null) => void;
  closeNewProject: () => void;
  // Otevření konkrétního webu v editoru po vytvoření
  pendingSiteRel: string | null;
  openSiteInWorkspace: (rel: string) => void;
  consumePendingSite: () => void;
  // Vrátit (undo) — 10s okno po smazání
  undo: { message: string; restore: () => Promise<void> | void; commit: () => Promise<void> | void } | null;
  setUndo: (u: AppStore["undo"]) => void;
  clearUndo: () => void;
}

export const THEMES = ["dark", "light", "ocean", "rose"];
const initialTheme = (): string => localStorage.getItem("theme") || "dark";
const applyTheme = (t: string) => {
  localStorage.setItem("theme", t);
  document.documentElement.setAttribute("data-theme", t);
};

export const useStore = create<AppStore>((set) => ({
  unlocked: false,
  setUnlocked: (v) => set({ unlocked: v }),
  theme: initialTheme(),
  toggleTheme: () =>
    set((s) => {
      const i = THEMES.indexOf(s.theme);
      const theme = THEMES[(i + 1) % THEMES.length];
      applyTheme(theme);
      return { theme };
    }),
  setTheme: (theme) => { applyTheme(theme); set({ theme }); },
  view: "dashboard",
  selectedProjectId: null,
  openProject: (id) => set({ view: "project", selectedProjectId: id }),
  openDashboard: () => set({ view: "dashboard", selectedProjectId: null }),
  openSites: () => set({ view: "sites", selectedProjectId: null }),
  gotoSettings: () => set({ view: "settings", selectedProjectId: null }),
  openHelp: () => set({ view: "help", selectedProjectId: null }),
  openRedesign: () => set({ view: "redesign", selectedProjectId: null }),
  refreshKey: 0,
  refresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
  statusMsg: "",
  setStatus: (m) => set({ statusMsg: m }),
  newProjectOpen: false,
  newProjectTemplate: null,
  openNewProject: (template = null) => set({ newProjectOpen: true, newProjectTemplate: template }),
  closeNewProject: () => set({ newProjectOpen: false, newProjectTemplate: null }),
  pendingSiteRel: null,
  openSiteInWorkspace: (rel) => set({ view: "sites", selectedProjectId: null, pendingSiteRel: rel }),
  undo: null,
  setUndo: (u) => set({ undo: u }),
  clearUndo: () => set({ undo: null }),
  consumePendingSite: () => set({ pendingSiteRel: null }),
}));
