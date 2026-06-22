import { useEffect } from "react";
import { useStore } from "./store/useStore";
import Unlock from "./components/Unlock";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import ProjectDetail from "./components/ProjectDetail";

export default function App() {
  const { unlocked, theme, view, selectedProjectId } = useStore();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  if (!unlocked) return <Unlock />;

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        {view === "project" && selectedProjectId ? (
          <ProjectDetail projectId={selectedProjectId} key={selectedProjectId} />
        ) : (
          <Dashboard />
        )}
      </main>
    </div>
  );
}
