import { Fragment, useEffect, useState } from "react";
import { useToast } from "../useToast";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Link } from "react-router-dom";
import { listAllMeta, listWeeklyReviews } from "../db";
import { DailyMeta, WeeklyReview } from "../types";
import { tr, useLang } from "../i18n";

type Tab = "daily" | "reviews";

const HISTORY_SUBTAB_KEY = "history_subtab";

function readHistorySubtab(): Tab {
  const stored = sessionStorage.getItem(HISTORY_SUBTAB_KEY);
  return stored === "reviews" ? "reviews" : "daily";
}

const CSV_COLS: (keyof DailyMeta)[] = [
  "date", "week_number", "daily_score", "execution_rate",
  "top_priority", "sleep_hours", "hrv", "mood",
  "energy_morning", "energy_night",
  "reflection_good", "reflection_bad", "reflection_tomorrow",
];

export default function History() {
  const [tab, setTab] = useState<Tab>(readHistorySubtab);

  const handleSetTab = (next: Tab) => {
    sessionStorage.setItem(HISTORY_SUBTAB_KEY, next);
    setTab(next);
  };

  // daily tab state
  const [logs, setLogs] = useState<DailyMeta[]>([]);
  const [filter, setFilter] = useState("");
  const { toast, notify } = useToast();

  // reviews tab state
  const [reviews, setReviews] = useState<WeeklyReview[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [lang] = useLang();

  useEffect(() => {
    listAllMeta().then(setLogs);
  }, []);

  useEffect(() => {
    if (tab === "reviews") {
      listWeeklyReviews().then(setReviews);
    }
  }, [tab]);

  const filtered = filter
    ? logs.filter(
        (l) =>
          l.date.includes(filter) ||
          (l.top_priority && l.top_priority.toLowerCase().includes(filter.toLowerCase())) ||
          (l.reflection_good && l.reflection_good.toLowerCase().includes(filter.toLowerCase()))
      )
    : logs;

  const onExport = async () => {
    const header = CSV_COLS.join(",");
    const rows = filtered.map((l) => CSV_COLS.map((c) => csvCell(l[c])).join(","));
    await writeText([header, ...rows].join("\n"));
    notify(tr(lang, "csvCopied", { n: filtered.length }));
  };

  return (
    <>
      <div className="page-section-head history-page-head">
        <div>
          <h2>{tr(lang, "history")}</h2>
          <div className="subtitle">{tr(lang, "historySubtitle")}</div>
        </div>
        <span className="info-chip" title={tr(lang, "historyInfoTip")}>?</span>
      </div>

      <div className="subnav">
        <button className={tab === "daily" ? "active" : ""} onClick={() => handleSetTab("daily")}>
          {tr(lang, "dailyLog")}
        </button>
        <button className={tab === "reviews" ? "active" : ""} onClick={() => handleSetTab("reviews")}>
          {tr(lang, "weeklyReview")}
        </button>
      </div>

      {tab === "daily" && (
        <>
          <div className="toolbar">
            <input
              type="text"
              placeholder={tr(lang, "searchPlaceholder")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{
                padding: "6px 12px",
                background: "var(--surface)",
                border: "0.5px solid var(--divider)",
                borderRadius: 8,
                minWidth: 240,
                outline: "none",
              }}
            />
            <div className="spacer" />
            <span className="muted" style={{ fontSize: 12 }}>{filtered.length} / {logs.length}</span>
            <button className="btn secondary" onClick={onExport}>📋 Export CSV</button>
          </div>

          <div className="section">
            {filtered.length === 0 ? (
              <div className="empty">
                <div className="big">{tr(lang, "noRecords")}</div>
                {tr(lang, "goFillFirstPrefix")}<Link to="/today">Today</Link>{tr(lang, "goFillFirstSuffix")}
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>{tr(lang, "colDate")}</th><th>{tr(lang, "colWeek")}</th><th>{tr(lang, "colScore")}</th><th>{tr(lang, "colSleep")}</th><th>{tr(lang, "colHrv")}</th><th>{tr(lang, "colMood")}</th><th>{tr(lang, "colTopPriority")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => (
                    <tr key={l.date}>
                      <td><strong>{l.date}</strong></td>
                      <td>{l.week_number}</td>
                      <td>{l.daily_score ?? "—"}</td>
                      <td>{l.sleep_hours ?? "—"}</td>
                      <td>{l.hrv ?? "—"}</td>
                      <td>{l.mood ?? "—"}</td>
                      <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {l.top_priority}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === "reviews" && (
        <div className="section">
          {reviews.length === 0 ? (
            <div className="empty">
              <div className="big">{tr(lang, "noRecords")}</div>
              {tr(lang, "reviewEmptyHint")}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{tr(lang, "weekNum")}</th>
                  <th>{tr(lang, "executionScoreShort")}</th>
                  <th>{tr(lang, "selfScoreShort")}</th>
                  <th>{tr(lang, "wentWellShort")}</th>
                  <th>{tr(lang, "toImproveShort")}</th>
                  <th>{tr(lang, "nextFocusShort")}</th>
                  <th>{tr(lang, "aiSuggestionShort")}</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => {
                  const isExpanded = expandedId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : r.id)}
                        style={{ cursor: "pointer" }}
                        aria-expanded={isExpanded}
                      >
                        <td><strong>{isExpanded ? "▾" : "▸"} W{r.week_number}</strong></td>
                        <td>{r.execution_score != null ? Math.round(r.execution_score) : "—"}</td>
                        <td>{r.self_score ?? "—"}</td>
                        <td style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.went_well || "—"}
                        </td>
                        <td style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.to_improve || "—"}
                        </td>
                        <td style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.next_focus || "—"}
                        </td>
                        <td>{r.ai_suggestion ? "✓" : "—"}</td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${r.id}-detail`} className="review-expand-detail">
                          <td colSpan={7}>
                            <div className="review-expand-grid">
                              <div className="review-expand-field">
                                <span className="review-expand-label">{tr(lang, "wentWell")}</span>
                                <span className="review-expand-value">{r.went_well || tr(lang, "notFilled")}</span>
                              </div>
                              <div className="review-expand-field">
                                <span className="review-expand-label">{tr(lang, "toImprove")}</span>
                                <span className="review-expand-value">{r.to_improve || tr(lang, "notFilled")}</span>
                              </div>
                              <div className="review-expand-field">
                                <span className="review-expand-label">{tr(lang, "nextFocus")}</span>
                                <span className="review-expand-value">{r.next_focus || tr(lang, "notFilled")}</span>
                              </div>
                              <div className="review-expand-field">
                                <span className="review-expand-label">{tr(lang, "nextTopPriority")}</span>
                                <span className="review-expand-value">{r.next_top_priority || tr(lang, "notFilled")}</span>
                              </div>
                              {r.ai_suggestion && (
                                <div className="review-expand-field review-expand-field--full">
                                  <span className="review-expand-label">{tr(lang, "aiSuggestion")}</span>
                                  <span className="review-expand-value">{r.ai_suggestion}</span>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

function csvCell(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
