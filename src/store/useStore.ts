import { create } from "zustand";

type View = "dashboard" | "project";

interface AppStore {
  unlocked: boolean;
  setUnlocked: (v: boolean) => void;
  theme: "dark" | "light";
  toggleTheme: () => void;
  view: View;
  selectedProjectId: string | null;
  openProject: (id: string) => void;
  openDashboard: () => void;
  refreshKey: number;
  refresh: () => void;
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
  refreshKey: 0,
  refresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
}));
