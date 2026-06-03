import { useEffect, useRef, useState } from "react";
import { useToast } from "../useToast";
import {
  listGoals, listCheckItems, listEntriesInRange, listMetaInRange,
  getWeeklyReview, createWeeklyReview, setWeeklyReviewAiSuggestion,
} from "../db";
import { CheckItem, DailyEntry, DailyMeta, Goal, WeeklyReview, emptyWeeklyReview } from "../types";
import {
  todayISO, weekNumber, weekRange, TOTAL_WEEKS,
  daysSinceStart, totalDays, daysUntilEnd, toISO, programEnd,
  hasProgramRange, daysUntilWeekEnds,
} from "../dateUtils";
import { scoreDay, weeklyReviewExecutionScore } from "../score";
import { listActivitiesInRange, StravaActivity } from "../strava";
import { callLlm, getKey, getActiveProvider } from "../llm/client";
import { LlmError, DEFAULT_RATE_LIMIT_COOLDOWN_MS } from "../llm/resilience";
import { findProvider } from "../llm/providers";
import { Link, useSearchParams } from "react-router-dom";
import { dashboardAdvicePrompt, weeklyReviewPrompt } from "../llm/prompts";
import { tr, useLang } from "../i18n";
import RatingControl from "../components/RatingControl";

export default function Dashboard() {
  const [w, setW] = useState(hasProgramRange() ? weekNumber(todayISO()) : 1);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [items, setItems] = useState<CheckItem[]>([]);
  const [metas, setMetas] = useState<DailyMeta[]>([]);
  const [monthMetas, setMonthMetas] = useState<DailyMeta[]>([]);
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [chartView, setChartView] = useState<"week" | "month">("week");
  const { toast, notify } = useToast();
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [advice, setAdvice] = useState("");
  const [weeklyReviewRequestId, setWeeklyReviewRequestId] = useState<string | null>(null);
  const [adviceRequestId, setAdviceRequestId] = useState<string | null>(null);
  // Rate-limit countdown for the Ask-advice button
  const [adviceCooldownUntil, setAdviceCooldownUntil] = useState<number | null>(null);
  const [adviceCooldownSec, setAdviceCooldownSec] = useState<number>(0);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Weekly review state
  const [existingReview, setExistingReview] = useState<WeeklyReview | null>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewForm, setReviewForm] = useState(() => emptyWeeklyReview(hasProgramRange() ? weekNumber(todayISO()) : 1));
  const [selfScoreInput, setSelfScoreInput] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [lang] = useLang();

  useEffect(() => {
    // Reset weekly rating id so RatingControl doesn't carry a stale request
    // id from a previously-generated review in this session.
    setWeeklyReviewRequestId(null);
    (async () => {
      // weekRange requires a valid program range; skip DB queries for date-ranged
      // data when unset (goals/items still load for the goal-performance section).
      const wr = hasProgramRange() ? weekRange(w) : { start: "", end: "" };
      setGoals(await listGoals(true));
      setItems(await listCheckItems(undefined, true));
      setMetas(await listMetaInRange(wr.start, wr.end));
      setEntries(await listEntriesInRange(wr.start, wr.end));
      setActivities(await listActivitiesInRange(wr.start, wr.end));
      // Load existing review for this week
      const rev = await getWeeklyReview(w);
      setExistingReview(rev);
    })();
  }, [w]);

  useEffect(() => {
    (async () => {
      const mr = monthRange(month);
      setMonthMetas(await listMetaInRange(mr.start, mr.end));
    })();
  }, [month]);

  // Countdown interval: runs only while a cooldown is active
  useEffect(() => {
    if (adviceCooldownUntil === null) return;
    const tick = () => {
      const remaining = adviceCooldownUntil - Date.now();
      if (remaining <= 0) {
        setAdviceCooldownSec(0);
        setAdviceCooldownUntil(null);
        if (cooldownIntervalRef.current !== null) {
          clearInterval(cooldownIntervalRef.current);
          cooldownIntervalRef.current = null;
        }
      } else {
        setAdviceCooldownSec(Math.ceil(remaining / 1000));
      }
    };
    tick(); // immediate first tick
    cooldownIntervalRef.current = setInterval(tick, 1000);
    return () => {
      if (cooldownIntervalRef.current !== null) {
        clearInterval(cooldownIntervalRef.current);
        cooldownIntervalRef.current = null;
      }
    };
  }, [adviceCooldownUntil]);

  const today = todayISO();
  const hasRange = hasProgramRange();
  const dayN = hasRange ? Math.max(1, Math.min(totalDays(), daysSinceStart(today))) : null;
  const progressPct = dayN !== null ? Math.round((dayN / totalDays()) * 100) : null;

  const dayScores = metas.map((m) => {
    const dayEntries = entries.filter((e) => e.date === m.date);
    return { date: m.date, score: scoreDay(goals, items, dayEntries).weightedPct, meta: m };
  });
  const avgScore = dayScores.length > 0
    ? Math.round(dayScores.reduce((s, x) => s + x.score, 0) / dayScores.length)
    : 0;
  const monthDays = buildMonthDays(month);
  const monthScoreMap = new Map(monthMetas.map((m) => [m.date, m.daily_score]));
  const monthLogged = monthMetas.length;
  const monthAvg = monthLogged > 0
    ? Math.round(monthMetas.reduce((s, m) => s + (m.daily_score ?? 0), 0) / monthLogged)
    : 0;

  // Goal-level weekly progress
  const goalWeek = goals.filter((g) => g.active).map((g) => {
    const gItems = items.filter((i) => i.goal_id === g.id && i.active);
    let totalRatio = 0;
    let n = 0;
    for (const m of metas) {
      const dayEntries = entries.filter((e) => e.date === m.date);
      const s = scoreDay([g], gItems, dayEntries);
      totalRatio += s.weightedPct;
      n++;
    }
    return { goal: g, avgPct: n > 0 ? Math.round(totalRatio / n) : 0, days: n };
  });

  // Consume open-review signal from URL param ?review=N (AC8).
  // Fires whenever the search param appears; clears it after acting so navigate-away/back
  // does NOT re-open the form.
  useEffect(() => {
    const reviewStr = searchParams.get("review");
    if (!reviewStr) return;
    const wk = parseInt(reviewStr, 10);
    if (!isNaN(wk) && wk >= 1 && wk <= TOTAL_WEEKS && hasProgramRange() && weekRange(wk).end < todayISO()) {
      setW(wk);
      setReviewForm({ ...emptyWeeklyReview(wk) });
      setSelfScoreInput("");
      setShowReviewForm(true);
    }
    // Consume-once: remove the param so re-visiting Stats does not re-open.
    setSearchParams({}, { replace: true });
  // searchParams identity changes on every render under some routers, so use the
  // string value as the dependency to avoid infinite loops.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("review")]);

  const onSubmitReview = async () => {
    // Validate self_score
    const rawScore = parseInt(selfScoreInput, 10);
    if (isNaN(rawScore) || rawScore < 1 || rawScore > 10) {
      notify(tr(lang, "selfScoreInvalid"));
      return;
    }
    const clampedScore = Math.max(1, Math.min(10, rawScore));
    const execution_score = weeklyReviewExecutionScore(goals, items, entries);
    setReviewSubmitting(true);
    try {
      const base = emptyWeeklyReview(w);
      const newId = await createWeeklyReview({
        ...base,
        week_number: w,
        went_well: reviewForm.went_well,
        to_improve: reviewForm.to_improve,
        next_focus: reviewForm.next_focus,
        next_top_priority: reviewForm.next_top_priority,
        self_score: clampedScore,
        execution_score,
        ai_suggestion: null,
      });
      // Refresh the read-only view and close form — independent of AI result
      const rev = await getWeeklyReview(w);
      setExistingReview(rev);
      window.dispatchEvent(new Event("weekly-review-changed"));
      setShowReviewForm(false);
      notify(tr(lang, "reviewSaved"));

      // Non-blocking AI suggestion (AC4 invariant: failure must NOT undo save)
      try {
        const goalsText = goals.filter((g) => g.active).map((g) => {
          const gItems = items.filter((i) => i.goal_id === g.id && i.active);
          const itemLines = gItems.map((it) => {
            const itEntries = entries.filter((e) => e.check_item_id === it.id);
            const filled = itEntries.length;
            const sum = itEntries.reduce((s, e) => s + (e.value_num ?? 0), 0);
            const boolDone = itEntries.filter((e) => e.value_bool).length;
            return `  - ${it.label}: 本週填寫 ${filled} 筆${it.type === "bool" ? `, 完成 ${boolDone}` : ""}${sum ? `, 累計 ${sum}${it.unit ?? ""}` : ""}`;
          }).join("\n");
          return `【${g.name}】(weight ${g.weight})\n  終點: ${g.target_text || "(未填)"}\n${itemLines || "  (無 check items)"}`;
        }).join("\n\n");

        const weeklyStr = `W${w} 週回顧

執行分數: ${execution_score}
自評分數: ${clampedScore} / 10

本週亮點:
${reviewForm.went_well || "(未填)"}

本週改進:
${reviewForm.to_improve || "(未填)"}

下週聚焦目標:
${reviewForm.next_focus || "(未填)"}

下週頂級優先事項:
${reviewForm.next_top_priority || "(未填)"}

目標與本週進度:
${goalsText || "(尚無目標)"}`;

        const p = weeklyReviewPrompt(weeklyStr);
        const resp = await callLlm({
          promptKey: "weekly_review",
          system: p.system,
          user: p.user,
          maxOutputTokens: 1500,
        });
        await setWeeklyReviewAiSuggestion(newId, resp.text);
        // Update read-only state so suggestion shows immediately
        setExistingReview((prev) => prev ? { ...prev, ai_suggestion: resp.text } : prev);
        setWeeklyReviewRequestId(resp.requestId);
      } catch (aiErr: unknown) {
        // AI failure: review is already saved with ai_suggestion=null; do not retry
        // Surface sanitized class message only — never raw aiErr.message
        const aiKey = (aiErr instanceof LlmError ? aiErr.displayKey : "llmErrOther") as Parameters<typeof tr>[1];
        notify(`${tr(lang, "aiFailedReviewSaved")} ${tr(lang, aiKey)}`);
      }
    } catch (e: any) {
      const msg: string = e?.message ?? String(e);
      if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate")) {
        notify(tr(lang, "reviewExists"));
        // Reload existing
        const rev = await getWeeklyReview(w);
        setExistingReview(rev);
        setShowReviewForm(false);
      } else {
        notify(tr(lang, "saveFailed", { msg }));
      }
    } finally {
      setReviewSubmitting(false);
    }
  };

  const onAskAdvice = async () => {
    setAdviceLoading(true);
    setAdvice("");
    setAdviceRequestId(null);
    try {
      if (!(window as any).__TAURI_INTERNALS__) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1200));
      }
      const demoGoal: Goal = {
        id: -1,
        name: "Demo: Build a consistent 12-week execution rhythm",
        description: "Use AI advice to turn a broad goal into concrete weekly actions.",
        why: "Show how the coach reasons from goals, daily logs, and review data.",
        target_text: "Finish 12 weeks with a stable daily review habit and weekly improvement loop.",
        weight: 25,
        active: 1,
        sort_order: 0,
        persona: null,
        context_json: null,
      };
      const adviceGoals = goals.length > 0 ? goals : [demoGoal];
      const p = dashboardAdvicePrompt({
        week: w,
        totalWeeks: TOTAL_WEEKS,
        daysElapsed: dayN ?? 0,
        daysRemaining: hasRange ? daysUntilEnd() : 0,
        goals: adviceGoals,
        items,
        metas,
        entries,
        dayScores,
        goalWeek: goalWeek.length > 0 ? goalWeek : [{ goal: demoGoal, avgPct: 0, days: 0 }],
      });
      const r = await callLlm({
        promptKey: "dashboard_advice",
        system: p.system,
        user: p.user,
        maxOutputTokens: 1800,
      });
      setAdvice(r.text);
      setAdviceRequestId(r.requestId);
    } catch (e: unknown) {
      const key = (e instanceof LlmError ? e.displayKey : "llmErrOther") as Parameters<typeof tr>[1];
      if (e instanceof LlmError && e.class === "rate-limit") {
        const waitMs = e.retryAfterMs ?? DEFAULT_RATE_LIMIT_COOLDOWN_MS;
        setAdviceCooldownUntil(Date.now() + waitMs);
        notify(tr(lang, key));
      } else {
        notify(tr(lang, key));
      }
    } finally {
      setAdviceLoading(false);
    }
  };

  return (
    <>
      <div className="dashboard-head">
        <div>
          <h2>{tr(lang, "dashboard")}</h2>
          <div className="subtitle">
            {hasRange
              ? tr(lang, "overallSubtitle", { end: programEnd()!.slice(5), n: daysUntilEnd() })
              : null}
          </div>
        </div>
        <div className="dashboard-toolbar">
          <button
            className="btn secondary sm"
            onClick={onAskAdvice}
            disabled={adviceLoading || adviceCooldownUntil !== null}
          >
            {adviceLoading
              ? tr(lang, "aiAdviceLoading")
              : adviceCooldownUntil !== null
                ? tr(lang, "llmRetryIn", { sec: String(adviceCooldownSec) })
                : tr(lang, "aiAdvice")}
          </button>
        </div>
      </div>

      {existingReview && (
        <div className="section review-readonly-section">
          <div className="section-header no-toggle">
            <div className="section-title">{tr(lang, "weeklyReview")} — W{w}{tr(lang, "reviewDone")}</div>
            <div className="muted" style={{ fontSize: 11 }}>{tr(lang, "reviewReadonlyNote")}</div>
          </div>
          <div className="section-body">
            <div className="stats review-score-row" style={{ marginBottom: 14 }}>
              <div className="stat-card">
                <div className="l">{tr(lang, "executionScore")}</div>
                <div className="v">{existingReview.execution_score ?? "—"}</div>
                <div className="sub">{tr(lang, "autoComputed")}</div>
              </div>
              <div className="stat-card">
                <div className="l">{tr(lang, "selfScore")}</div>
                <div className="v">{existingReview.self_score ?? "—"}</div>
                <div className="sub">/ 10</div>
              </div>
            </div>
            <div className="review-field-readonly">
              <div className="review-field-label muted">{tr(lang, "wentWell")}</div>
              <div className="review-field-value">{existingReview.went_well || <span className="muted">{tr(lang, "notFilled")}</span>}</div>
            </div>
            <div className="review-field-readonly">
              <div className="review-field-label muted">{tr(lang, "toImprove")}</div>
              <div className="review-field-value">{existingReview.to_improve || <span className="muted">{tr(lang, "notFilled")}</span>}</div>
            </div>
            <div className="review-field-readonly">
              <div className="review-field-label muted">{tr(lang, "nextFocus")}</div>
              <div className="review-field-value">{existingReview.next_focus || <span className="muted">{tr(lang, "notFilled")}</span>}</div>
            </div>
            <div className="review-field-readonly">
              <div className="review-field-label muted">{tr(lang, "nextTopPriority")}</div>
              <div className="review-field-value">{existingReview.next_top_priority || <span className="muted">{tr(lang, "notFilled")}</span>}</div>
            </div>
            <div className="review-field-readonly" style={{ marginTop: 14 }}>
              <div className="review-field-label muted">{tr(lang, "aiSuggestion")}</div>
              {existingReview.ai_suggestion ? (
                <>
                  <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontSize: 13, color: "var(--text-1)" }}>
                    {existingReview.ai_suggestion}
                  </pre>
                  <RatingControl requestId={weeklyReviewRequestId} />
                </>
              ) : (() => { const _p = getActiveProvider(); return findProvider(_p).needsKey && !getKey(_p); })() ? (
                <div className="muted" style={{ fontSize: 12 }}>
                  {tr(lang, "aiNeedsKey")} <Link to="/setup">{tr(lang, "goToSettings")}</Link>
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 12 }}>{tr(lang, "aiUnavailable")}</div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="section dashboard-progress">
        <div className="section-body" style={{ paddingTop: 18 }}>
          {hasRange && dayN !== null && progressPct !== null ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--text-2)" }}>{tr(lang, "overallProgress")}</div>
                  <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 4 }}>
                    Day {dayN}<span style={{ fontSize: 16, color: "var(--text-3)", fontWeight: 400 }}> / {totalDays()}</span>
                  </div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 600, color: "var(--accent)" }}>{progressPct}%</div>
              </div>
              <div className="score-bar" style={{ marginTop: 12, height: 8 }}>
                <div style={{ width: `${progressPct}%` }} />
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                {tr(lang, "programEndLine", { w: weekNumber(today), total: TOTAL_WEEKS, date: programEnd()! })}
              </div>
            </>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>
              {tr(lang, "overallProgress")}
            </div>
          )}
        </div>
      </div>

      <div className="stats dashboard-kpis">
        <div className="stat-card">
          <div className="l">{tr(lang, "avgScore")}</div>
          <div className="v">{avgScore || "—"}</div>
          <div className="sub">{tr(lang, "loggedDaysThisWeek", { n: metas.length })}</div>
        </div>
        <div className="stat-card">
          <div className="l">{tr(lang, "targetDays")}</div>
          <div className="v">
            {dayScores.filter((d) => d.score >= 85).length}<span style={{ fontSize: 14, color: "var(--text-3)" }}> / {metas.length}</span>
          </div>
          <div className="sub">{tr(lang, "scoreAbove85")}</div>
        </div>
        <div className="stat-card">
          <div className="l">{tr(lang, "goalCount")}</div>
          <div className="v">{goals.filter((g) => g.active).length}</div>
          <div className="sub">{items.filter((i) => i.active).length} check items</div>
        </div>
        <div className="stat-card">
          <div className="l">{tr(lang, "activityVolume")}</div>
          <div className="v">
            {Math.round(activities.reduce((s, a) => s + (a.duration_min ?? 0), 0))}
            <span style={{ fontSize: 14, color: "var(--text-3)" }}> min</span>
          </div>
          <div className="sub">
            {tr(lang, "activitySessions", { n: activities.length })} · {activities.reduce((s, a) => s + (a.distance_km ?? 0), 0).toFixed(1)} km
          </div>
        </div>
      </div>

      <div className="section chart-panel">
        <div className="section-header no-toggle">
          <div>
            <div className="section-title">{tr(lang, "executionTrend")}</div>
            <div className="section-meta">
              {chartView === "week"
                ? tr(lang, "weekDailyScore", { w })
                : tr(lang, "monthLoggedAvg", { n: monthLogged, avg: monthAvg || "—" })}
            </div>
          </div>
          <div className="chart-controls">
            <div className="week-mini-controls">
              <button className="btn ghost sm" onClick={() => setW(Math.max(1, w - 1))} disabled={w <= 1}>←</button>
              <span>W{w}</span>
              <button className="btn ghost sm" onClick={() => setW(Math.min(TOTAL_WEEKS, w + 1))} disabled={w >= TOTAL_WEEKS}>→</button>
            </div>
            <div className="segmented">
              <button className={chartView === "week" ? "active" : ""} onClick={() => setChartView("week")}>Week</button>
              <button className={chartView === "month" ? "active" : ""} onClick={() => setChartView("month")}>Month</button>
            </div>
            {chartView === "month" && (
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            )}
          </div>
        </div>
        {chartView === "week" ? (
          <BarChart
            bars={(hasRange ? weekRangeDays(w) : []).map((d) => {
              const found = dayScores.find((x) => x.date === d);
              return {
                key: d,
                label: d.slice(5),
                value: found?.score ?? 0,
                muted: !found,
              };
            })}
          />
        ) : (
          <BarChart
            bars={monthDays.filter((d): d is string => !!d).map((d) => ({
              key: d,
              label: String(Number(d.slice(8))),
              value: monthScoreMap.get(d) ?? 0,
              muted: !monthScoreMap.has(d),
            }))}
            dense
          />
        )}
      </div>

      <div className="section">
        <div className="section-header no-toggle">
          <div className="section-title">{tr(lang, "goalPerformance")}</div>
        </div>
        <div className="section-body">
          {goalWeek.length === 0 && <div className="muted" style={{ padding: "8px 0", fontSize: 13 }}>{tr(lang, "noActiveGoals")}</div>}
          {goalWeek.map((g) => (
            <div key={g.goal.id} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 4 }}>
                <strong>{g.goal.name}</strong>
                <span className="muted">{g.avgPct}%</span>
              </div>
              <div className="score-bar"><div style={{ width: `${g.avgPct}%` }} /></div>
            </div>
          ))}
        </div>
      </div>

      {hasRange && !existingReview && weekRange(w).end >= todayISO() && (
        <div className="muted" style={{ fontSize: 13, padding: "10px 0 4px 0", textAlign: "center" }}>
          {tr(lang, "reviewableInDays", { n: daysUntilWeekEnds(w, todayISO()) })}
        </div>
      )}

      {showReviewForm && (
        <div className="modal-backdrop" onClick={() => setShowReviewForm(false)}>
          <div className="modal review-modal" onClick={(e) => e.stopPropagation()}>
            <div className="advice-head">
              <h3>{tr(lang, "weeklyReview")} — W{w}</h3>
              <button className="sheet-close" onClick={() => setShowReviewForm(false)}>×</button>
            </div>
            {/* AC7: compact read-only week summary */}
            <div style={{ background: "var(--surface-3)", borderRadius: "var(--radius-sm)", padding: "10px 14px", marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 20, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>{tr(lang, "reviewModalAvgScore")}</div>
                  <div style={{ fontSize: 20, fontWeight: 600 }}>{avgScore || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>{tr(lang, "reviewModalTargetDays")}</div>
                  <div style={{ fontSize: 20, fontWeight: 600 }}>
                    {dayScores.filter((d) => d.score >= 85).length}
                    <span style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 400 }}> / {dayScores.length}</span>
                  </div>
                </div>
              </div>
              {goalWeek.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>{tr(lang, "reviewModalGoalPerf")}</div>
                  {goalWeek.map((g) => (
                    <div key={g.goal.id} style={{ marginBottom: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                        <span style={{ color: "var(--text-2)" }}>{g.goal.name}</span>
                        <span className="muted">{g.avgPct}%</span>
                      </div>
                      <div className="score-bar" style={{ height: 5 }}><div style={{ width: `${g.avgPct}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="field">
              <label>{tr(lang, "wentWell")}</label>
              <textarea
                value={reviewForm.went_well}
                onChange={(e) => setReviewForm((f) => ({ ...f, went_well: e.target.value }))}
                placeholder={tr(lang, "wentWellPlaceholder")}
              />
            </div>
            <div className="field">
              <label>{tr(lang, "toImprove")}</label>
              <textarea
                value={reviewForm.to_improve}
                onChange={(e) => setReviewForm((f) => ({ ...f, to_improve: e.target.value }))}
                placeholder={tr(lang, "toImprovePlaceholder")}
              />
            </div>
            <div className="field">
              <label>{tr(lang, "nextFocus")}</label>
              <textarea
                value={reviewForm.next_focus}
                onChange={(e) => setReviewForm((f) => ({ ...f, next_focus: e.target.value }))}
                placeholder={tr(lang, "nextFocusPlaceholder")}
              />
            </div>
            <div className="field">
              <label>{tr(lang, "nextTopPriority")}</label>
              <textarea
                value={reviewForm.next_top_priority}
                onChange={(e) => setReviewForm((f) => ({ ...f, next_top_priority: e.target.value }))}
                placeholder={tr(lang, "nextTopPriorityPlaceholder")}
              />
            </div>
            <div className="field">
              <label>{tr(lang, "selfScoreLabel")}</label>
              <div className="segmented" style={{ flexWrap: "wrap" }}>
                {[1,2,3,4,5,6,7,8,9,10].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={selfScoreInput === String(n) ? "active" : ""}
                    onClick={() => setSelfScoreInput(String(n))}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="actions">
              <button className="btn secondary sm" onClick={() => setShowReviewForm(false)} disabled={reviewSubmitting}>{tr(lang, "cancel")}</button>
              <button className="btn sm" onClick={onSubmitReview} disabled={reviewSubmitting}>
                {reviewSubmitting ? tr(lang, "reviewSubmitting") : tr(lang, "submitReview")}
              </button>
            </div>
          </div>
        </div>
      )}

      {advice && (
        <div className="modal-backdrop" onClick={() => { setAdvice(""); setAdviceRequestId(null); }}>
          <div className="modal advice-modal" onClick={(e) => e.stopPropagation()}>
            <div className="advice-head">
              <h3>{tr(lang, "aiAdvice")}</h3>
              <button className="sheet-close" onClick={() => { setAdvice(""); setAdviceRequestId(null); }}>×</button>
            </div>
            <pre>{advice}</pre>
            <RatingControl requestId={adviceRequestId} />
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

function BarChart({
  bars,
  dense = false,
}: {
  bars: { key: string; label: string; value: number; muted?: boolean }[];
  dense?: boolean;
}) {
  const max = 100;
  return (
    <div className={`bar-chart ${dense ? "dense" : ""}`}>
      {bars.map((b) => (
        <div key={b.key} className={`bar-cell ${b.muted ? "muted-bar" : ""}`}>
          <div className="bar-track">
            <div className="bar-fill" style={{ height: `${Math.max(2, Math.min(max, b.value))}%` }} />
          </div>
          <div className="bar-label">{b.label}</div>
          {!dense && <div className="bar-value">{b.muted ? "—" : b.value}</div>}
        </div>
      ))}
    </div>
  );
}

function weekRangeDays(week: number): string[] {
  const wr = weekRange(week);
  const start = new Date(wr.start + "T00:00:00");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return toISO(d);
  });
}

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start: toISO(start), end: toISO(end) };
}

function buildMonthDays(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const mondayOffset = (first.getDay() + 6) % 7;
  const days: (string | null)[] = Array.from({ length: mondayOffset }, () => null);
  for (let day = 1; day <= last.getDate(); day++) {
    days.push(toISO(new Date(y, m - 1, day)));
  }
  while (days.length % 7 !== 0) days.push(null);
  return days;
}
