import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Dashboard from "./Dashboard";
import History from "./History";
import { tr, useLang } from "../i18n";

type Tab = "dashboard" | "history";

const STATS_SUBTAB_KEY = "stats_subtab";

function readStatsSubtab(): Tab {
  const stored = sessionStorage.getItem(STATS_SUBTAB_KEY);
  return stored === "history" ? "history" : "dashboard";
}

export default function Stats() {
  const [sp] = useSearchParams();
  const [tab, setTab] = useState<Tab>(readStatsSubtab);
  const [lang] = useLang();

  const handleSetTab = (next: Tab) => {
    sessionStorage.setItem(STATS_SUBTAB_KEY, next);
    setTab(next);
  };

  // When the ?review param is present, persist the subtab to "dashboard" so that
  // after Dashboard clears the param the fallback is "dashboard", not "history".
  const reviewParam = sp.get("review");
  useEffect(() => {
    if (reviewParam) {
      handleSetTab("dashboard");
    }
  }, [reviewParam]);

  // Belt-and-suspenders for the very first render before the effect fires.
  const effectiveTab: Tab = reviewParam ? "dashboard" : tab;

  return (
    <>
      <div className="subnav">
        <button className={effectiveTab === "dashboard" ? "active" : ""} onClick={() => handleSetTab("dashboard")}>
          {tr(lang, "dashboard")}
        </button>
        <button className={effectiveTab === "history" ? "active" : ""} onClick={() => handleSetTab("history")}>
          {tr(lang, "history")}
        </button>
      </div>
      {effectiveTab === "dashboard" ? <Dashboard /> : <History />}
    </>
  );
}
