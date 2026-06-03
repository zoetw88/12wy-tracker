import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import Goals from "./Goals";
import Settings from "./Settings";
import { tr, useLang } from "../i18n";

type Tab = "goals" | "settings";

function resolveSetupTab(sp: URLSearchParams): Tab {
  const param = sp.get("tab");
  return param === "settings" ? "settings" : "goals";
}

export default function Setup() {
  const [sp] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => resolveSetupTab(sp));
  const [lang] = useLang();
  return (
    <>
      <div className="subnav">
        <button className={tab === "goals" ? "active" : ""} onClick={() => setTab("goals")}>
          {tr(lang, "goals")}
        </button>
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
          {tr(lang, "settings")}
        </button>
      </div>
      {tab === "goals" ? <Goals /> : <Settings />}
    </>
  );
}
