import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./Layout";
import Today from "./pages/Today";
import Stats from "./pages/Stats";
import Setup from "./pages/Setup";
import { applyThemeMode, watchSystemTheme } from "./theme";
import "./styles.css";

const legacyPathRedirects: Record<string, string> = {
  "/settings": "/setup?tab=settings",
  "/goals": "/setup",
  "/dashboard": "/stats",
  "/history": "/stats",
};

const legacyPath = window.location.pathname.replace(/\/$/, "") || "/";
const redirectTarget = legacyPathRedirects[legacyPath];
if (redirectTarget) {
  window.history.replaceState(null, "", `${window.location.origin}/#${redirectTarget}`);
}

applyThemeMode();
watchSystemTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/today" replace />} />
          <Route path="today" element={<Today />} />
          <Route path="stats" element={<Stats />} />
          <Route path="setup" element={<Setup />} />
          {/* legacy redirects */}
          <Route path="dashboard" element={<Navigate to="/stats" replace />} />
          <Route path="goals" element={<Navigate to="/setup" replace />} />
          <Route path="history" element={<Navigate to="/stats" replace />} />
          <Route path="settings" element={<Navigate to="/setup" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  </React.StrictMode>
);
