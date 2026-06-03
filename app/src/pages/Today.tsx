import { useEffect, useState } from "react";
import { useToast } from "../useToast";
import {
  listGoals, listCheckItems, listEntriesForDate, upsertEntry,
  loadMeta, saveMeta, listMetaInRange, listEntriesInRange, listWeeklyReviews,
} from "../db";
import { CheckItem, DailyEntry, DailyMeta, emptyMeta, Goal, WeeklyReview } from "../types";
import { todayISO, weekNumber, programStart, daysSinceStart, totalDays, hasProgramRange } from "../dateUtils";
import { scoreDay, deloadTrigger, entryDone } from "../score";
import { callLlm, getKey, getActiveProvider } from "../llm/client";
import { LlmError } from "../llm/resilience";
import { findProvider } from "../llm/providers";
import { priorityPrompt, PrioritySuggestion } from "../llm/prompts";
import { parsePriorityResponse } from "../llm/parse";
import { tr, useLang, Lang } from "../i18n";
import RatingControl from "../components/RatingControl";
import { Link } from "react-router-dom";

export default function Today() {
  const [lang] = useLang();
  const [date, setDate] = useState(todayISO());
  const [goals, setGoals] = useState<Goal[]>([]);
  const [items, setItems] = useState<CheckItem[]>([]);
  const [entries, setEntries] = useState<Map<number, DailyEntry>>(new Map());
  const [meta, setMeta] = useState<DailyMeta | null>(null);
  const { toast, notify } = useToast();
  const [dirty, setDirty] = useState(false);
  const [latestReview, setLatestReview] = useState<WeeklyReview | null>(null);
  const [suggestions, setSuggestions] = useState<PrioritySuggestion[] | null>(null);
  const [sugRequestId, setSugRequestId] = useState<string | null>(null);
  const [sugLoading, setSugLoading] = useState(false);
  const [sugError, setSugError] = useState("");
  const [editingPriority, setEditingPriority] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState("items");

  useEffect(() => {
    (async () => {
      let gs: Goal[] = [];
      let its: CheckItem[] = [];
      let es: DailyEntry[] = [];
      let m: DailyMeta = emptyMeta(date, hasProgramRange() ? weekNumber(date) : 0);
      try {
        [gs, its, es, m] = await Promise.all([
          listGoals(true),
          listCheckItems(undefined, true),
          listEntriesForDate(date),
          loadMeta(date),
        ]);
      } catch {
        // Browser preview cannot access the Tauri local store; use demo data so the UI is inspectable.
        gs = [previewGoal()];
        its = previewCheckItems();
      }
      setGoals(gs);
      setItems(its);
      setEntries(new Map(es.map((e) => [e.check_item_id, e])));
      setMeta(m);
      setDirty(false);
      setSuggestions(null);
      setSugRequestId(null);
      setSugError("");
      // Auto-ask LLM for priority if empty + not asked today + has key
      const askedKey = `priority_asked_${date}`;
      const provider = getActiveProvider();
      if (
        !m.top_priority &&
        !localStorage.getItem(askedKey) &&
        getKey(provider) &&
        gs.length > 0
      ) {
        fetchPrioritySuggestions(date, gs, its);
      }
    })();
  }, [date]);

  const fetchPrioritySuggestions = async (
    forDate: string, gs: Goal[], its: CheckItem[]
  ) => {
    setSugLoading(true); setSugError("");
    try {
      const end = forDate;
      const startDate = new Date(forDate + "T00:00:00");
      startDate.setDate(startDate.getDate() - 7);
      const recentStart = isoOf(startDate);

      // recent 7d window + full-program window
      // programStart() may be null when no range is set; fall back to recentStart
      // so the LLM still gets some context (just not the full-program window).
      const programStartDate = programStart() ?? recentStart;
      const [recentMs, recentEs, allEs] = await Promise.all([
        listMetaInRange(recentStart, end),
        listEntriesInRange(recentStart, end),
        listEntriesInRange(programStartDate, end),
      ]);

      const yesterday = new Date(forDate + "T00:00:00");
      yesterday.setDate(yesterday.getDate() - 1);
      const yIso = isoOf(yesterday);
      const yMeta = recentMs.find((x) => x.date === yIso);

      const daysElapsed = hasProgramRange()
        ? Math.max(1, Math.min(totalDays(), daysSinceStart(forDate)))
        : 1;
      const daysRemaining = Math.max(0, totalDays() - daysElapsed);

      const p = priorityPrompt({
        date: forDate,
        weekNumber: hasProgramRange() ? weekNumber(forDate) : 1,
        daysElapsed,
        daysRemaining,
        totalDays: totalDays(),
        goals: gs,
        items: its,
        recentMetas: recentMs,
        recentEntries: recentEs,
        allEntries: allEs,
        yesterdayTomorrowNote: yMeta?.reflection_tomorrow || "",
        yesterdayBadNote: yMeta?.reflection_bad || "",
      });
      const r = await callLlm({
        promptKey: "suggest_priority",
        system: p.system,
        user: p.user,
        responseFormat: p.responseFormat,
        maxOutputTokens: 2048,
      });
      const arr = parsePriorityResponse(r.text);
      setSuggestions(arr);
      setSugRequestId(r.requestId);
    } catch (e: any) {
      const key = e instanceof LlmError ? e.displayKey : "llmErrOther";
      setSugError(key);
    } finally {
      setSugLoading(false);
    }
  };

  const dismissSuggestions = () => {
    localStorage.setItem(`priority_asked_${date}`, "1");
    setSuggestions(null);
    setSugRequestId(null);
  };

  const pickSuggestion = (s: PrioritySuggestion) => {
    if (!meta) return;
    setMeta({ ...meta, top_priority: s.priority });
    setDirty(true);
    dismissSuggestions();
    notify(tr(lang, "appliedSuggestion"));
  };

  const deload = meta ? deloadTrigger(meta) : [];

  const updateEntry = (itemId: number, patch: Partial<DailyEntry>) => {
    const cur = entries.get(itemId) || {
      date, check_item_id: itemId, value_num: null, value_text: null, value_bool: null,
    };
    const next = { ...cur, ...patch };
    const m = new Map(entries);
    m.set(itemId, next);
    setEntries(m);
    setDirty(true);
  };

  const updateMeta = <K extends keyof DailyMeta>(k: K, v: DailyMeta[K]) => {
    if (!meta) return;
    setMeta({ ...meta, [k]: v });
    setDirty(true);
  };

  const onSave = async () => {
    if (!meta) return;
    try {
      for (const e of entries.values()) {
        await upsertEntry(e);
      }
      const s = scoreDay(goals, items, Array.from(entries.values()));
      await saveMeta({ ...meta, week_number: hasProgramRange() ? weekNumber(meta.date) : 0, daily_score: s.weightedPct });
      setDirty(false);
    } catch (e: any) {
      notify(tr(lang, "saveFailed", { msg: e?.message ?? String(e) }));
    }
  };

  // Auto-save: 800 ms after the last edit, write to DB silently.
  useEffect(() => {
    if (!dirty || !meta) return;
    const t = setTimeout(() => { onSave(); }, 800);
    return () => clearTimeout(t);
  }, [dirty, meta, entries]);

  const loadLatestReview = async () => {
    try {
      const reviews = await listWeeklyReviews();
      // listWeeklyReviews returns rows ordered by week_number ASC; pick last
      const latest = reviews.length > 0 ? reviews[reviews.length - 1] : null;
      setLatestReview(latest);
    } catch {
      setLatestReview(null);
    }
  };

  useEffect(() => {
    loadLatestReview();
    const handler = () => { loadLatestReview(); };
    window.addEventListener("weekly-review-changed", handler);
    return () => window.removeEventListener("weekly-review-changed", handler);
  }, []);

  if (!meta) return <div>Loading...</div>;

  const _activeProvider = getActiveProvider();
  const hasKey = !findProvider(_activeProvider).needsKey || !!getKey(_activeProvider);

  const activeItems = items.filter((it) => it.active);
  const totalItems = activeItems.length;
  const doneItems = activeItems.filter((it) => entries.get(it.id) && entryDone(it, entries.get(it.id)!).done).length;
  const donePct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;
  const progressCards = [
    {
      key: "items",
      label: tr(lang, "todayItems"),
      meta: `${doneItems}/${totalItems}`,
      detail: totalItems > 0
        ? tr(lang, "itemsDoneDetail", { done: doneItems, pending: totalItems - doneItems })
        : tr(lang, "noItemsYet"),
    },
    {
      key: "base",
      label: tr(lang, "bodyStatus"),
      meta: bodyStatusMeta(meta, lang),
      detail: bodyStatusMeta(meta, lang),
    },
    {
      key: "reflection",
      label: tr(lang, "reflectionSection"),
      meta: `${reflectionFilledCount(meta)}/3`,
      detail: reflectionFilledCount(meta) > 0
        ? tr(lang, "reflectionFilledDetail", { n: reflectionFilledCount(meta) })
        : tr(lang, "notFilledYet"),
    },
  ];
  const uniqueGoals = goals.filter(
    (goal, index, arr) => arr.findIndex((g) => g.name.trim() === goal.name.trim()) === index
  );
  const goalLogCards = uniqueGoals.map((goal) => {
    const goalItems = activeItems.filter((it) => it.goal_id === goal.id);
    const goalDone = goalItems.filter((it) => entries.get(it.id) && entryDone(it, entries.get(it.id)!).done).length;
    return {
      key: `g${goal.id}`,
      label: goal.name,
      meta: `${goalDone}/${goalItems.length}`,
      detail: goalItems.length > 0
        ? tr(lang, "goalItemsCount", { n: goalItems.length })
        : tr(lang, "noGoalItemsYet"),
    };
  });
  const systemLogCards = [
    {
      key: "base",
      label: tr(lang, "bodyStatus"),
      meta: bodyStatusMeta(meta, lang),
      detail: bodyStatusMeta(meta, lang),
    },
    {
      key: "reflection",
      label: tr(lang, "reflectionSection"),
      meta: `${reflectionFilledCount(meta)}/3`,
      detail: reflectionFilledCount(meta) > 0
        ? tr(lang, "reflectionFilledDetail", { n: reflectionFilledCount(meta) })
        : tr(lang, "notFilledYet"),
    },
  ];
  const logCards = [
    ...goalLogCards,
    ...systemLogCards,
  ];
  const fallbackCard = goalLogCards[0] ?? systemLogCards[0];
  const activeCard = logCards.find((c) => c.key === selectedCard) ?? fallbackCard;

  const openProgress = (key?: string) => {
    setSelectedCard(key ?? goalLogCards[0]?.key ?? "base");
    setProgressOpen(true);
  };

  const currentGoalKey = activeCard?.key?.startsWith("g") ? activeCard.key : (goalLogCards[0]?.key ?? "");

  return (
    <>
      <div className="page-head">
        <div>
          <h2>{tr(lang, "today")}</h2>
          <div className="subtitle">{date}</div>
        </div>
        <div className="today-actions">
          <button className="btn" onClick={() => openProgress()}>
            {tr(lang, "addTodayProgress")}
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="date-pill"
          />
        </div>
      </div>

      {deload.length > 0 && (
        <div className="notice">{tr(lang, "deloadNotice", { items: deload.join("、") })}</div>
      )}

      {goals.length > 0 && (
        <>
      <section className="today-overview">
        <div className="today-overview-copy">
          <div>
            <div className="overview-kicker">{tr(lang, "todayProgress")}</div>
            <h3>{tr(lang, "nOfMComplete", { done: doneItems, total: totalItems })}</h3>
          </div>
          <div className="overview-bar">
            <span style={{ width: `${donePct}%` }} />
          </div>
        </div>
      </section>

      <PriorityStrip
        lang={lang}
        meta={meta}
        suggestions={suggestions}
        sugLoading={sugLoading}
        sugError={sugError}
        editingPriority={editingPriority}
        setEditingPriority={setEditingPriority}
        updateMeta={updateMeta}
        pickSuggestion={pickSuggestion}
        dismissSuggestions={dismissSuggestions}
        regen={() => {
          updateMeta("top_priority", "");
          localStorage.removeItem(`priority_asked_${date}`);
          if (goals.length > 0) fetchPrioritySuggestions(date, goals, items);
        }}
        manualStart={() => setEditingPriority(true)}
        llmStart={() => fetchPrioritySuggestions(date, goals, items)}
        hasGoals={goals.length > 0}
        hasKey={hasKey}
        sugRequestId={sugRequestId}
      />

      <LastReviewStrip lang={lang} review={latestReview} />

      <div className="progress-grid">
        {progressCards.map((card) => (
          <button
            key={card.key}
            className="progress-tile"
            onClick={() => {
              openProgress(card.key === "items" ? logCards[0]?.key : card.key);
            }}
          >
            <span className="pt-title">{card.label}</span>
            <span className="pt-meta">{card.meta}</span>
            <span className="pt-detail">{card.detail}</span>
          </button>
        ))}
      </div>

      {progressOpen && (
        <div className="progress-backdrop" onClick={() => setProgressOpen(false)}>
          <div className="progress-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="progress-sheet-head">
              <div>
                <div className="overview-kicker">{tr(lang, "addTodayProgress")}</div>
              </div>
              <button className="sheet-close" onClick={() => setProgressOpen(false)}>×</button>
            </div>

            <div className="floating-card">
              <div className="log-mode-tabs">
                <button
                  className={activeCard?.key?.startsWith("g") ? "active" : ""}
                  onClick={() => setSelectedCard(goalLogCards[0]?.key ?? "")}
                  disabled={goalLogCards.length === 0}
                >
                  {tr(lang, "goals")}
                </button>
                <button
                  className={activeCard?.key === "base" ? "active" : ""}
                  onClick={() => setSelectedCard("base")}
                >
                  {tr(lang, "bodyStatus")}
                </button>
                <button
                  className={activeCard?.key === "reflection" ? "active" : ""}
                  onClick={() => setSelectedCard("reflection")}
                >
                  {tr(lang, "reflectionSection")}
                </button>
              </div>

              {activeCard?.key?.startsWith("g") && (
              <div className="log-card-head single">
                <select
                  value={currentGoalKey}
                  onChange={(e) => setSelectedCard(e.target.value)}
                >
                  {goalLogCards.map((card) => (
                    <option key={card.key} value={card.key}>
                      {card.label}
                    </option>
                  ))}
                </select>
                <span className="log-card-meta">{activeCard?.detail}</span>
              </div>
              )}

              {activeCard?.key?.startsWith("g") && (() => {
                const goalId = Number(activeCard.key.slice(1));
                const goalItems = activeItems.filter((it) => it.goal_id === goalId);
                if (goalItems.length === 0) {
                  return <div className="muted">{tr(lang, "noGoalCheckItems")}</div>;
                }
                return goalItems.map((it) => (
                  <CheckRowEditable
                    key={it.id}
                    item={it}
                    entry={entries.get(it.id)}
                    onChange={(patch) => updateEntry(it.id, patch)}
                    lang={lang}
                  />
                ));
              })()}

              {activeCard?.key === "base" && (
                <>
              <div className="row">
                <NumField label={tr(lang, "sleepHoursLabel")} value={meta.sleep_hours} onChange={(v) => updateMeta("sleep_hours", v)} step={0.1} />
                <NumField label="HRV" value={meta.hrv} onChange={(v) => updateMeta("hrv", v as any)} />
              </div>
              <div className="row">
                <ScaleField label={tr(lang, "energyMorning")} value={meta.energy_morning} onChange={(v) => updateMeta("energy_morning", v)} />
                <ScaleField label={tr(lang, "energyNight")} value={meta.energy_night} onChange={(v) => updateMeta("energy_night", v)} />
                <ScaleField label={tr(lang, "colMood")} value={meta.mood} onChange={(v) => updateMeta("mood", v)} />
              </div>
                </>
              )}

              {activeCard?.key === "reflection" && (
                <>
              <div className="field">
                <label>{tr(lang, "reflectionGoodLabel")}</label>
                <textarea value={meta.reflection_good} onChange={(e) => updateMeta("reflection_good", e.target.value)} />
              </div>
              <div className="field">
                <label>{tr(lang, "reflectionBadLabel")}</label>
                <textarea value={meta.reflection_bad} onChange={(e) => updateMeta("reflection_bad", e.target.value)} />
              </div>
              <div className="field">
                <label>{tr(lang, "reflectionTomorrowLabel")}</label>
                <textarea value={meta.reflection_tomorrow} onChange={(e) => updateMeta("reflection_tomorrow", e.target.value)} />
              </div>
                </>
              )}
            </div>

            <div className="sheet-actions">
              {dirty && <span className="autosave">{tr(lang, "autosaving")}</span>}
              {!dirty && <span className="autosave done">{tr(lang, "synced")}</span>}
              <button
                className="btn done-button"
                onClick={async () => {
                  await onSave();
                  setProgressOpen(false);
                  notify(tr(lang, "updatedTodayProgress"));
                }}
              >
                {tr(lang, "doneButton")}
              </button>
            </div>
          </div>
        </div>
      )}

        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

function isoOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function previewGoal(): Goal {
  return {
    id: -1,
    name: "Demo goal: 12-week execution rhythm",
    description: "Use the app to turn planning into daily action.",
    why: "Show the goal dropdown and AI coaching flow in browser preview.",
    target_text: "Complete a stable daily review habit and weekly improvement loop.",
    weight: 25,
    active: 1,
    sort_order: 0,
    persona: null,
    context_json: null,
  };
}

function previewCheckItems(): CheckItem[] {
  return [
    {
      id: -101,
      goal_id: -1,
      label: "Review top priority",
      type: "bool",
      target_value: null,
      unit: null,
      options: null,
      sort_order: 0,
      active: 1,
    },
    {
      id: -102,
      goal_id: -1,
      label: "Focused work",
      type: "minutes",
      target_value: 30,
      unit: "min",
      options: null,
      sort_order: 1,
      active: 1,
    },
  ];
}

function NumField({
  label, value, onChange, step,
}: { label: string; value: number | null; onChange: (v: number | null) => void; step?: number }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        step={step ?? 1}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </div>
  );
}

function ScaleField({
  label, value, onChange,
}: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="segmented">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            className={value === n ? "active" : ""}
            onClick={() => onChange(value === n ? null : n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function PriorityStrip({
  lang, meta, suggestions, sugLoading, sugError, editingPriority, setEditingPriority,
  updateMeta, pickSuggestion, dismissSuggestions, regen, manualStart, llmStart, hasGoals, hasKey,
  sugRequestId,
}: any) {
  // Has a priority -> compact view with regenerate
  if (meta.top_priority && !editingPriority) {
    return (
      <div className="priority-strip set">
        <span className="ps-tag">{tr(lang, "priorityTag")}</span>
        <span className="ps-text">{meta.top_priority}</span>
        <button className="btn ghost sm" title={tr(lang, "editButton")} onClick={() => setEditingPriority(true)}>{tr(lang, "editButton")}</button>
        <button className="btn ghost sm" title={tr(lang, "refreshButton")} onClick={regen}>{tr(lang, "refreshButton")}</button>
      </div>
    );
  }
  if (editingPriority) {
    return (
      <div className="priority-strip set">
        <span className="ps-tag">{tr(lang, "priorityTag")}</span>
        <input
          type="text"
          value={meta.top_priority}
          autoFocus
          onChange={(e) => updateMeta("top_priority", e.target.value)}
          placeholder={tr(lang, "priorityInputPlaceholder")}
          onBlur={() => setEditingPriority(false)}
          onKeyDown={(e: any) => { if (e.key === "Enter") setEditingPriority(false); }}
          style={{ flex: 1 }}
        />
      </div>
    );
  }
  // Suggestions UI
  if (suggestions || sugLoading || sugError) {
    if (sugError && !suggestions && !sugLoading) {
      return (
        <div className="priority-strip empty">
          <span className="ps-tag">{tr(lang, "priorityTag")}</span>
          <span className="muted" style={{ flex: 1 }}>
            {!hasKey ? tr(lang, "aiNeedsKey") : tr(lang, sugError || "llmErrOther")}
          </span>
          {!hasKey && <Link to="/setup" className="btn ghost sm">{tr(lang, "goToSettings")}</Link>}
          <button className="btn sm" onClick={manualStart}>{tr(lang, "writeButton")}</button>
        </div>
      );
    }
    return (
      <div className="priority-strip suggesting">
        <div className="ps-head">
          <span className="ps-tag">{tr(lang, "priorityTag")}</span>
          <span className="ps-title">
            {sugLoading ? <>{tr(lang, "thinkingText")} <span className="spinner" /></> : tr(lang, "todayTopPriority")}
          </span>
          {!sugLoading && (
            <>
              <button className="btn ghost sm" onClick={dismissSuggestions}>{tr(lang, "skip")}</button>
              <button className="btn secondary sm" onClick={llmStart}>{tr(lang, "redraw")}</button>
            </>
          )}
        </div>
        {suggestions && (
          <>
            <div className="priority-cards">
              {suggestions.map((s: any, i: number) => (
                <div key={i} className="priority-card" onClick={() => pickSuggestion(s)}>
                  {s.tag && <div className="pc-tag">{s.tag}</div>}
                  <div className="pc-title">{s.priority}</div>
                  <div className="pc-reason">{s.reason}</div>
                </div>
              ))}
            </div>
            <RatingControl requestId={sugRequestId} />
          </>
        )}
      </div>
    );
  }
  // Empty state
  return (
    <div className="priority-strip empty">
      <span className="ps-tag">{tr(lang, "priorityTag")}</span>
      <span className="muted" style={{ flex: 1 }}>
        {!hasKey ? tr(lang, "aiNeedsKey") : tr(lang, "priorityNotSet")}
      </span>
      {!hasKey && <Link to="/setup" className="btn ghost sm">{tr(lang, "goToSettings")}</Link>}
      {hasGoals && hasKey && (
        <button className="btn secondary sm" onClick={llmStart}>{tr(lang, "suggestButton")}</button>
      )}
      <button className="btn sm" onClick={manualStart}>{tr(lang, "writeButton")}</button>
    </div>
  );
}

function LastReviewStrip({ lang, review }: { lang: Lang; review: WeeklyReview | null }) {
  if (!review) return null;
  const hasFocus = review.next_focus.trim().length > 0;
  const hasPriority = review.next_top_priority.trim().length > 0;
  if (!hasFocus && !hasPriority) return null;
  return (
    <div className="priority-strip" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.25rem" }}>
      <span className="ps-tag muted">{tr(lang, "lastWeekFocus")}</span>
      {hasFocus && (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "baseline" }}>
          <span className="muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{tr(lang, "nextFocus")}:</span>
          <span style={{ fontSize: 13 }}>{review.next_focus}</span>
        </div>
      )}
      {hasPriority && (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "baseline" }}>
          <span className="muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{tr(lang, "nextTopPriority")}:</span>
          <span style={{ fontSize: 13 }}>{review.next_top_priority}</span>
        </div>
      )}
    </div>
  );
}

function reflectionFilledCount(m: DailyMeta): number {
  let n = 0;
  if (m.reflection_good.trim()) n++;
  if (m.reflection_bad.trim()) n++;
  if (m.reflection_tomorrow.trim()) n++;
  return n;
}

function bodyStatusMeta(m: DailyMeta, lang: Lang): string {
  const parts: string[] = [];
  if (m.sleep_hours != null) parts.push(tr(lang, "sleepMeta", { h: m.sleep_hours }));
  if (m.hrv != null) parts.push(`HRV ${m.hrv}`);
  return parts.length > 0 ? parts.join(" · ") : tr(lang, "notRecorded");
}

function CheckRowEditable({
  item, entry, onChange, lang,
}: { item: CheckItem; entry: DailyEntry | undefined; onChange: (p: Partial<DailyEntry>) => void; lang: Lang }) {
  const done = entry ? entryDone(item, entry).done : false;
  const target = item.target_value;
  const unit = item.unit || "";

  return (
    <div className="item-row">
      <div className="lbl">
        {item.label}
        {target !== null && (
          <div className="sub">{tr(lang, "targetValue", { value: target, unit: unit ? " " + unit : "" })}</div>
        )}
      </div>
      <div className="control" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {item.type === "bool" && (
          <label className="toggle">
            <input
              type="checkbox"
              checked={!!entry?.value_bool}
              onChange={(e) => onChange({ value_bool: e.target.checked ? 1 : 0 })}
            />
            <span className="slider" />
          </label>
        )}
        {(item.type === "number" || item.type === "minutes") && (
          <>
            <input
              className="inline-num"
              type="number"
              value={entry?.value_num ?? ""}
              onChange={(e) => onChange({ value_num: e.target.value === "" ? null : Number(e.target.value) })}
            />
            {unit && <span className="muted" style={{ fontSize: 11 }}>{unit}</span>}
          </>
        )}
        {item.type === "scale" && (
          <div className="segmented">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className={entry?.value_num === n ? "active" : ""}
                onClick={() => onChange({ value_num: entry?.value_num === n ? null : n })}
              >{n}</button>
            ))}
          </div>
        )}
        {item.type === "choice" && (
          <select
            className="inline-sel"
            value={entry?.value_text ?? ""}
            onChange={(e) => onChange({ value_text: e.target.value || null })}
          >
            <option value="">—</option>
            {safeParseOpts(item.options).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        )}
        {item.type === "text" && (
          <input
            className="inline-text"
            type="text"
            value={entry?.value_text ?? ""}
            onChange={(e) => onChange({ value_text: e.target.value || null })}
          />
        )}
      </div>
      <span style={{ fontSize: 16, marginLeft: 6, color: done ? "var(--success)" : "var(--text-3)", width: 16, textAlign: "center" }}>
        {done ? "✓" : "·"}
      </span>
    </div>
  );
}

function safeParseOpts(json: string | null): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
