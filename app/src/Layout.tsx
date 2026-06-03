import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  weekNumber,
  todayISO,
  TOTAL_WEEKS,
  daysUntilEnd,
  daysSinceStart,
  totalDays,
  hasProgramRange,
  PROGRAM_RANGE_EVENT,
} from "./dateUtils";
import { Lang, tr, useLang } from "./i18n";
import WeeklyReviewFab from "./components/WeeklyReviewFab";

export default function Layout() {
  const [rangeVersion, setRangeVersion] = useState(0);
  const [lang, setLang] = useLang();

  useEffect(() => {
    const refresh = () => {
      setRangeVersion((v) => v + 1);
    };
    window.addEventListener(PROGRAM_RANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(PROGRAM_RANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  void rangeVersion;

  const hasRange = hasProgramRange();
  // Only compute date-math when a range is stored — avoids NaN/fake values.
  const w = hasRange ? weekNumber(todayISO()) : null;
  const leftDays = hasRange ? daysUntilEnd() : null;
  const day = hasRange
    ? Math.max(1, Math.min(totalDays(), daysSinceStart(todayISO())))
    : null;
  const sprintPct = day !== null ? Math.round((day / totalDays()) * 100) : null;
  const weekDots = Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1);
  const displayWeek = w ?? 1;
  const displayDay = day ?? 1;
  const displayLeftDays = leftDays ?? totalDays();
  const displayPct = sprintPct ?? 0;

  return (
    <div className="layout-top">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">12</span>
          <span className="brand-text">{tr(lang, "appTitle")}</span>
          {hasRange && w !== null && leftDays !== null && (
            <span className="brand-meta">
              W{w}/{TOTAL_WEEKS} · {tr(lang, "weekLeft", { days: leftDays })}
            </span>
          )}
        </div>
        <nav className="topnav">
          <NavLink to="/today" className={({ isActive }) => (isActive ? "active" : "")}>
            {tr(lang, "today")}
          </NavLink>
          <NavLink to="/stats" className={({ isActive }) => (isActive ? "active" : "")}>
            {tr(lang, "stats")}
          </NavLink>
          <NavLink to="/setup" className={({ isActive }) => (isActive ? "active" : "")}>
            {tr(lang, "setup")}
          </NavLink>
        </nav>
        <div className="sprint-meter" aria-label={`12 週衝刺進度 ${displayPct}%`}>
            <div className="sprint-meter-top">
              <span>Day {displayDay}</span>
              <strong>{displayPct}%</strong>
            </div>
            <div className="sprint-weeks" aria-hidden="true">
              {weekDots.map((n) => (
                <span key={n} className={n <= displayWeek ? "done" : ""} />
              ))}
            </div>
        </div>
        <div className="lang-switch" aria-label="Language">
          {(["zh", "en", "fr"] as Lang[]).map((code) => (
            <button
              key={code}
              className={lang === code ? "active" : ""}
              onClick={() => setLang(code)}
              type="button"
            >
              {code === "zh" ? "中" : code.toUpperCase()}
            </button>
          ))}
        </div>
      </header>
      <main className="main">
        <section className="adventure-banner" aria-label="12 週像素衝刺狀態">
            <div className="adventure-scene" aria-hidden="true">
              <span className="pixel-cloud cloud-a" />
              <span className="pixel-cloud cloud-b" />
              <span className="pixel-runner" />
              <span className="pixel-flag" />
            </div>
            <div className="adventure-copy">
              <span className="level-label">{tr(lang, "level", { week: displayWeek })}</span>
              <strong>{tr(lang, "bannerTitle")}</strong>
              <span>{tr(lang, "bannerMeta", { day: displayDay, totalDays: totalDays(), pct: displayPct })}</span>
            </div>
            <div className="coin-counter" title="12 週衝刺進度">
              <span className="coin" aria-hidden="true" />
              <strong>{displayLeftDays}</strong>
              <span>{tr(lang, "daysLeft")}</span>
            </div>
        </section>
        <Outlet />
      </main>
      <WeeklyReviewFab />
    </div>
  );
}
