import { create } from "zustand";

type View = "dashboard" | "project" | "sites";

interface AppStore {
  unlocked: boolean;
  setUnlocked: (v: boolean) => void;
  theme: "dark" | "light";
  toggleTheme: () => void;
  view: View;
  selectedProjectId: string | null;
  openProject: (id: string) => void;
  openDashboard: () => void;
  openSites: () => void;
  refreshKey: number;
  refresh: () => void;
  // Nový projekt (web) — globální modal
  newProjectOpen: boolean;
  newProjectTemplate: string | null;
  openNewProject: (template?: string | null) => void;
  closeNewProject: () => void;
  // Otevření konkrétního webu v editoru po vytvoření
  pendingSiteRel: string | null;
  openSiteInWorkspace: (rel: string) => void;
  consumePendingSite: () => void;
}

const initialTheme = (): "dark" | "light" =>
  (localStorage.getItem("theme") as "dark" | "light") || "dark";

export const useStore = create<AppStore>((set) => ({
  unlocked: false,
  setUnlocked: (v) => set({ unlocked: v }),
  theme: initialTheme(),
  toggleTheme: () =>
    set((s) => {
      const theme = s.theme === "dark" ? "light" : "dark";
      localStorage.setItem("theme", theme);
      document.documentElement.setAttribute("data-theme", theme);
      return { theme };
    }),
  view: "dashboard",
  selectedProjectId: null,
  openProject: (id) => set({ view: "project", selectedProjectId: id }),
  openDashboard: () => set({ view: "dashboard", selectedProjectId: null }),
  openSites: () => set({ view: "sites", selectedProjectId: null }),
  refreshKey: 0,
  refresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
  newProjectOpen: false,
  newProjectTemplate: null,
  openNewProject: (template = null) => set({ newProjectOpen: true, newProjectTemplate: template }),
  closeNewProject: () => set({ newProjectOpen: false, newProjectTemplate: null }),
  pendingSiteRel: null,
  openSiteInWorkspace: (rel) => set({ view: "sites", selectedProjectId: null, pendingSiteRel: rel }),
  consumePendingSite: () => set({ pendingSiteRel: null }),
}));
