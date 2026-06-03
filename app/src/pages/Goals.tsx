import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  listGoals, createGoal, updateGoal, deleteGoal, updateGoalCoach,
  listCheckItems, createCheckItem, updateCheckItem, deleteCheckItem,
} from "../db";
import { Goal, CheckItem, CheckItemType, GoalDesignSuggestion, SuggestedCheckItem } from "../types";
import { callLlm, getActiveModel, getActiveProvider, getKey } from "../llm/client";
import { ProviderId, findProvider } from "../llm/providers";
import {
  createGoalDesignPrompt,
  goalFieldItemsPrompt,
  goalFieldQuestionsPrompt,
  setupGoalCoachPrompt,
} from "../llm/prompts";
import { tr, useLang, Lang } from "../i18n";

type FollowUpQuestion = {
  id: string;
  label: string;
  options: string[];
};

export default function Goals() {
  const [lang] = useLang();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [items, setItems] = useState<Record<number, CheckItem[]>>({});
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [editing, setEditing] = useState<Goal | null>(null);
  const [toast, setToast] = useState("");

  const reload = async () => {
    const gs = await listGoals();
    setGoals(gs);
    const map: Record<number, CheckItem[]> = {};
    for (const g of gs) {
      map[g.id] = await listCheckItems(g.id);
    }
    setItems(map);
  };

  useEffect(() => {
    reload();
  }, []);

  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2400);
  };

  const newGoal = () =>
    setEditing({
      id: 0, name: "", description: "", why: "",
      target_text: "", weight: 25, active: 1, sort_order: goals.length,
      persona: null, context_json: null,
    });

  const saveGoal = async (g: Goal, initialItems: SuggestedCheckItem[] = []) => {
    if (g.id === 0) {
      const id = await createGoal(g);
      for (let i = 0; i < initialItems.length; i++) {
        const item = initialItems[i];
        await createCheckItem({
          goal_id: id,
          label: item.label,
          type: item.type,
          target_value: item.target_value ?? null,
          unit: item.unit ?? null,
          options: item.options ? JSON.stringify(item.options) : null,
          sort_order: i,
          active: 1,
        });
      }
      await setupCoachInBackground({ ...g, id });
    } else {
      await updateGoal(g);
    }
    setEditing(null);
    await reload();
    notify(tr(lang, "saved"));
  };

  const setupCoachInBackground = async (g: Goal) => {
    try {
      const p = setupGoalCoachPrompt(g);
      const r = await callLlm({
        promptKey: "setup_goal_coach",
        system: p.system,
        user: p.user,
        responseFormat: p.responseFormat,
        maxOutputTokens: 1500,
      });
      const persona = parseCoachPersona(r.text);
      if (persona) await updateGoalCoach(g.id, persona, "{}");
    } catch {
      // Coach persona improves future LLM advice, but goal creation must not depend on it.
    }
  };

  const removeGoal = async (g: Goal) => {
    if (!confirm(tr(lang, "confirmDeleteGoal", { name: g.name }))) return;
    await deleteGoal(g.id);
    await reload();
  };

  const toggleActive = async (g: Goal) => {
    await updateGoal({ ...g, active: g.active ? 0 : 1 });
    await reload();
  };

  function parseCoachPersona(raw: string): string {
    let obj: any;
    try { obj = JSON.parse(raw); }
    catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) return "";
      obj = JSON.parse(m[0]);
    }
    return String(obj?.persona ?? "").trim();
  }

  const addItemBlank = async (g: Goal) => {
    await createCheckItem({
      goal_id: g.id,
      label: tr(lang, "newItemDefaultLabel"),
      type: "bool",
      target_value: null,
      unit: null,
      options: null,
      sort_order: items[g.id]?.length || 0,
      active: 1,
    });
    await reload();
  };

  return (
    <>
      <div className="page-section-head">
        <div>
          <h2>{tr(lang, "goalsTitle")}</h2>
          <div className="subtitle">{tr(lang, "goalsSubtitle")}</div>
        </div>
        <button className="btn" onClick={newGoal}>{tr(lang, "addGoal")}</button>
      </div>

      {goals.length === 0 && (
        <div className="setup-empty">
          <strong>{tr(lang, "emptyGoalsTitle")}</strong>
          <span>{tr(lang, "emptyGoalsBody")}</span>
        </div>
      )}

      <div className="setup-goal-grid">
      {goals.map((g) => {
        const isOpen = open[g.id] ?? false;
        const cs = items[g.id] || [];
        return (
          <div key={g.id} className={`setup-goal-card ${isOpen ? "open" : ""}`}>
            <div className="setup-goal-head" onClick={() => setOpen({ ...open, [g.id]: !isOpen })}>
              <div>
                <div className="setup-goal-title">
                {g.name || tr(lang, "unnamed")}
                {!g.active && <span className="tag" style={{ marginLeft: 8 }}>{tr(lang, "disabled")}</span>}
                </div>
                <div className="setup-goal-meta">{cs.length} items</div>
              </div>
              <span className={`section-chevron ${isOpen ? "open" : ""}`}>▸</span>
            </div>
            {isOpen && (
              <div className="setup-goal-body">
                <div className="goal-detail">
                  {g.description && <p className="goal-desc">{g.description}</p>}
                  {g.target_text && (
                    <div className="goal-target">
                      <span>{tr(lang, "endpoint")}</span>
                      <strong>{g.target_text}</strong>
                    </div>
                  )}
                </div>

                <div className="goal-actions">
                  <button className="btn sm" onClick={() => addItemBlank(g)}>{tr(lang, "addItem")}</button>
                  <button className="btn ghost sm" onClick={() => toggleActive(g)}>
                    {g.active ? tr(lang, "disabled") : tr(lang, "enable")}
                  </button>
                  <button className="btn ghost sm" onClick={() => removeGoal(g)} style={{ color: "var(--danger)" }}>
                    {tr(lang, "delete")}
                  </button>
                </div>

                {cs.length === 0 ? (
                  <div className="muted" style={{ fontSize: 13, padding: "10px 0" }}>
                    {tr(lang, "noCheckItems")}
                  </div>
                ) : (
                  <div className="check-item-list">
                    {cs.map((c) => (
                      <CheckItemRow key={c.id} item={c} onChange={reload} lang={lang} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      </div>

      {editing && <GoalEditor goal={editing} onSave={saveGoal} onCancel={() => setEditing(null)} lang={lang} />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

function parseSuggestedItems(raw: string): SuggestedCheckItem[] {
  let arr: SuggestedCheckItem[];
  try {
    arr = JSON.parse(raw);
  } catch {
    const m = raw.match(/\[[\s\S]*\]/);
    if (!m) throw new Error("Cannot parse LLM response");
    arr = JSON.parse(m[0]);
  }
  if (!Array.isArray(arr)) throw new Error("LLM response is not a field array");
  return arr
    .filter((x) => x?.label && x?.type)
    .map((x) => ({
      label: String(x.label).trim(),
      type: x.type,
      target_value: x.target_value ?? undefined,
      unit: x.unit ?? undefined,
      options: x.options ?? undefined,
    }));
}

function parseGoalDesign(raw: string): GoalDesignSuggestion {
  let obj: any;
  try {
    obj = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Cannot parse LLM response");
    obj = JSON.parse(m[0]);
  }
  if (!obj || typeof obj !== "object") throw new Error("LLM response is not a goal design");
  const items = parseSuggestedItems(JSON.stringify(obj.items ?? []));
  const targetText = String(obj.target_text ?? "").trim();
  if (!targetText) throw new Error("LLM did not produce a target definition");
  return {
    description: obj.description ? String(obj.description).trim() : undefined,
    why: obj.why ? String(obj.why).trim() : undefined,
    target_text: targetText,
    weight: Number.isFinite(Number(obj.weight)) ? Number(obj.weight) : undefined,
    items,
  };
}

function parseFollowUpQuestions(raw: string): FollowUpQuestion[] {
  let obj: any;
  try {
    obj = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Cannot parse LLM response");
    obj = JSON.parse(m[0]);
  }
  const arr = Array.isArray(obj?.questions) ? obj.questions : [];
  return arr
    .map((q: any, i: number) => ({
      id: String(q?.id || `q${i + 1}`),
      label: String(q?.label || q?.question || "").trim(),
      options: Array.isArray(q?.options)
        ? q.options.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 4)
        : [],
    }))
    .filter((q: FollowUpQuestion) => q.label && q.options.length >= 2)
    .slice(0, 3);
}

function isTransientLlmError(e: any): boolean {
  const msg = String(e?.message ?? e).toLowerCase();
  return msg.includes("503") || msg.includes("unavailable") || msg.includes("high demand") || msg.includes("overloaded");
}

function friendlyLlmError(e: any, lang: Lang): string {
  const msg = String(e?.message ?? e);
  if (isTransientLlmError(e)) {
    return tr(lang, "friendlyErrorOverloaded");
  }
  if (msg.includes("API key")) return msg;
  if (msg.includes("429")) return tr(lang, "friendlyErrorQuota");
  return tr(lang, "friendlyErrorGeneric");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function GoalEditor({
  goal, onSave, onCancel, lang,
}: {
  goal: Goal;
  onSave: (g: Goal, initialItems?: SuggestedCheckItem[]) => void;
  onCancel: () => void;
  lang: Lang;
}) {
  const [g, setG] = useState<Goal>(goal);
  const [suggestions, setSuggestions] = useState<SuggestedCheckItem[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [manualItems, setManualItems] = useState<SuggestedCheckItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selfAssessment, setSelfAssessment] = useState("");
  const [fieldQuestions, setFieldQuestions] = useState<FollowUpQuestion[]>([]);
  const [fieldAnswers, setFieldAnswers] = useState<Record<string, string>>({});
  const [fieldLoading, setFieldLoading] = useState(false);
  const [fieldStatus, setFieldStatus] = useState("");
  const [fieldQuestionsChecked, setFieldQuestionsChecked] = useState(false);
  const hasGoalDraft = Boolean(g.name.trim() || g.description.trim());
  const hasReason = Boolean(g.why.trim() && selfAssessment.trim());
  const hasEndpoint = Boolean(g.target_text.trim());
  const allFollowupsAnswered = fieldQuestions.every((q) => Boolean(fieldAnswers[q.id]));
  const _p = getActiveProvider();
  const hasKey = !findProvider(_p).needsKey || !!getKey(_p);

  const canOpenStep = (nextStep: 1 | 2 | 3 | 4) => {
    if (nextStep === 1) return true;
    if (nextStep === 2) return hasGoalDraft;
    if (nextStep === 3) return hasGoalDraft && hasReason;
    return hasGoalDraft && hasReason && hasEndpoint;
  };

  const goStep = (nextStep: 1 | 2 | 3 | 4) => {
    if (!canOpenStep(nextStep)) return;
    setStep(nextStep);
  };

  const continueFromGoalStep = () => {
    if (!hasGoalDraft) return;
    if (!g.name.trim() && g.description.trim()) {
      setG({ ...g, name: g.description.trim().slice(0, 28) });
    }
    setStep(2);
  };

  const goalForLlm = (): Goal => ({
    ...g,
    description: [
      g.description.trim(),
      selfAssessment.trim() ? `目前程度/自評: ${selfAssessment.trim()}` : "",
    ].filter(Boolean).join("\n"),
  });

  const askSuggestions = async () => {
    setLoading(true);
    setError("");
    setStatus(tr(lang, "designingEndpoint"));
    try {
      if (!(window as any).__TAURI_INTERNALS__) {
        await sleep(1200);
      }
      const p = createGoalDesignPrompt(goalForLlm());
      const req = {
        promptKey: "create_goal_design",
        system: p.system,
        user: p.user,
        responseFormat: p.responseFormat,
        maxOutputTokens: 2400,
      } as const;
      let r;
      try {
        r = await callLlm(req);
      } catch (firstError: any) {
        if (!isTransientLlmError(firstError)) throw firstError;
        setStatus(tr(lang, "modelBusy"));
        await sleep(1800);
        try {
          r = await callLlm(req);
        } catch (secondError: any) {
          const provider = getActiveProvider();
          const model = getActiveModel(provider);
          const fallback = fallbackModel(provider, model);
          if (!fallback || !isTransientLlmError(secondError)) throw secondError;
          setStatus(tr(lang, "usingFallback", { model: fallback }));
          r = await callLlm(req, { provider, model: fallback });
        }
      }
      const design = parseGoalDesign(r.text);
      setG({
        ...g,
        description: design.description ?? g.description,
        why: design.why ?? g.why,
        target_text: design.target_text,
        weight: design.weight ?? g.weight,
      });
      setSuggestions([]);
      setSelected({});
      setFieldQuestions([]);
      setFieldAnswers({});
      setFieldQuestionsChecked(false);
      setFieldStatus("");
      setStatus(tr(lang, "endpointGenerated"));
      setStep(3);
    } catch (e: any) {
      setError(friendlyLlmError(e, lang));
      setStatus("");
    } finally {
      setLoading(false);
    }
  };

  const askFieldQuestions = async () => {
    setFieldLoading(true);
    setError("");
    setFieldStatus(tr(lang, "checkingFollowupsStatus"));
    try {
      const p = goalFieldQuestionsPrompt(goalForLlm());
      const r = await callLlm({
        promptKey: "goal_field_questions",
        system: p.system,
        user: p.user,
        responseFormat: p.responseFormat,
        maxOutputTokens: 900,
      });
      const questions = parseFollowUpQuestions(r.text);
      setFieldQuestions(questions);
      setFieldAnswers(Object.fromEntries(questions.map((q) => [q.id, ""])));
      setFieldQuestionsChecked(true);
      setFieldStatus(questions.length ? tr(lang, "followupAnswerFirst") : tr(lang, "followupInfoSufficient"));
    } catch (e: any) {
      setError(friendlyLlmError(e, lang));
      setFieldStatus("");
    } finally {
      setFieldLoading(false);
    }
  };

  const askFieldItems = async () => {
    setFieldLoading(true);
    setError("");
    setFieldStatus(tr(lang, "generatingFieldsStatus"));
    try {
      if (!fieldQuestionsChecked) {
        setFieldStatus(tr(lang, "checkFollowupsFirst"));
        return;
      }
      if (!allFollowupsAnswered) {
        setFieldStatus(tr(lang, "answerFollowupsFirst"));
        return;
      }
      const p = goalFieldItemsPrompt(goalForLlm(), fieldAnswers);
      const r = await callLlm({
        promptKey: "goal_field_items",
        system: p.system,
        user: p.user,
        responseFormat: p.responseFormat,
        maxOutputTokens: 1800,
      });
      const nextItems = parseSuggestedItems(r.text);
      setSuggestions(nextItems);
      setSelected(Object.fromEntries(nextItems.map((_, i) => [i, true])));
      setFieldStatus(tr(lang, "fieldsGenerated"));
    } catch (e: any) {
      setError(friendlyLlmError(e, lang));
      setFieldStatus("");
    } finally {
      setFieldLoading(false);
    }
  };

  const fallbackModel = (provider: ProviderId, currentModel: string): string | null => {
    if (provider === "gemini" && currentModel !== "gemini-2.0-flash") return "gemini-2.0-flash";
    if (provider === "openai" && currentModel !== "gpt-4o-mini") return "gpt-4o-mini";
    if (provider === "anthropic" && currentModel !== "claude-haiku-4-5-20251001") return "claude-haiku-4-5-20251001";
    return null;
  };

  const addManual = () =>
    setManualItems([
      ...manualItems,
      { label: "", type: "bool", target_value: undefined, unit: undefined, options: undefined },
    ]);

  const updateManual = (idx: number, patch: Partial<SuggestedCheckItem>) =>
    setManualItems(manualItems.map((item, i) => (i === idx ? { ...item, ...patch } : item)));

  const removeManual = (idx: number) =>
    setManualItems(manualItems.filter((_, i) => i !== idx));

  const save = () => {
    const initialItems = [
      ...suggestions.filter((_, i) => selected[i]),
      ...manualItems.filter((item) => item.label.trim()).map((item) => ({
        ...item,
        label: item.label.trim(),
      })),
    ];
    onSave(goalForLlm(), initialItems);
  };
  const selectedCount = suggestions.filter((_, i) => selected[i]).length + manualItems.filter((item) => item.label.trim()).length;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal goal-design-modal" onClick={(e) => e.stopPropagation()}>
        <div className="goal-design-head">
          <div>
            <h3>{tr(lang, "goalEditorTitle")}</h3>
            <p>{tr(lang, "goalEditorSubtitle")}</p>
          </div>
          <button className="btn ghost sm" onClick={onCancel}>{tr(lang, "close")}</button>
        </div>

        <div className="wizard-steps" aria-label={tr(lang, "wizardStepsAriaLabel")}>
          {[
            ["1", tr(lang, "goals")],
            ["2", tr(lang, "wizardStep2Label")],
            ["3", tr(lang, "wizardStep3Label")],
            ["4", tr(lang, "wizardStep4Label")],
          ].map(([n, label]) => (
            <button
              key={n}
              type="button"
              className={step === Number(n) ? "active" : ""}
              onClick={() => goStep(Number(n) as 1 | 2 | 3 | 4)}
              disabled={!canOpenStep(Number(n) as 1 | 2 | 3 | 4)}
            >
              <span>{n}</span>{label}
            </button>
          ))}
        </div>

        <div className="goal-wizard-card">
          {step === 1 && (
            <>
            <div className="panel-kicker">{tr(lang, "step1Kicker")}</div>
            <p className="wizard-copy">{tr(lang, "step1Copy")}</p>
            <div className="field">
              <label>{tr(lang, "goalNameLabel")}</label>
              <input
                type="text"
                value={g.name}
                placeholder={tr(lang, "goalNamePlaceholder")}
                onChange={(e) => setG({ ...g, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>{tr(lang, "goalDescLabel")}</label>
              <textarea
                value={g.description}
                placeholder={tr(lang, "goalDescPlaceholder")}
                onChange={(e) => setG({ ...g, description: e.target.value })}
              />
            </div>
            <div className="wizard-nav">
              <span />
              <button type="button" className="btn" onClick={continueFromGoalStep} disabled={!hasGoalDraft}>{tr(lang, "nextStep")}</button>
            </div>
            </>
          )}

          {step === 2 && (
            <>
            <div className="panel-kicker">{tr(lang, "step2Kicker")}</div>
            <p className="wizard-copy">{tr(lang, "step2Copy")}</p>
            <div className="field">
              <label>{tr(lang, "whyLabel")} <span className="required-mark" aria-label={tr(lang, "requiredMark")}>*</span></label>
              <textarea
                value={g.why}
                placeholder={tr(lang, "whyPlaceholder")}
                onChange={(e) => setG({ ...g, why: e.target.value })}
              />
            </div>
            <div className="field">
              <label>{tr(lang, "currentLevelLabel")} <span className="required-mark" aria-label={tr(lang, "requiredMark")}>*</span></label>
              <textarea
                value={selfAssessment}
                placeholder={tr(lang, "currentLevelPlaceholder")}
                onChange={(e) => setSelfAssessment(e.target.value)}
              />
            </div>
            <div className="why-hint-card">
              <strong>{tr(lang, "whyHintTitle")}</strong>
              <span>{tr(lang, "whyHintBody")}</span>
            </div>
            <div className="wizard-nav">
              <button type="button" className="btn ghost" onClick={() => setStep(1)}>{tr(lang, "prevStep")}</button>
              <button type="button" className="btn" onClick={() => goStep(3)} disabled={!hasReason}>{tr(lang, "nextStep")}</button>
            </div>
            </>
          )}

          {step === 3 && (
            <>
            <div className="design-result-top">
              <div>
                <div className="panel-kicker">{tr(lang, "step3Kicker")}</div>
                <span>{status || tr(lang, "step3DefaultStatus")}</span>
              </div>
              {hasKey ? (
                <button type="button" className="btn sm" onClick={askSuggestions} disabled={!hasGoalDraft || !hasReason || loading}>
                  {loading ? tr(lang, "generating") : tr(lang, "generateDesign")}
                </button>
              ) : (
                <span className="ai-no-key-hint">
                  <button type="button" className="btn sm" disabled>{tr(lang, "generateDesign")}</button>
                  <Link to="/setup" className="ai-no-key-link">{tr(lang, "aiNeedsKeyWizard")} — {tr(lang, "goToSettings")}</Link>
                </span>
              )}
            </div>
            {error && <div className="form-error">{error}</div>}

            <div className="field compact-field">
              <label>{tr(lang, "endpointLabel")}</label>
              <textarea
                value={g.target_text}
                placeholder={tr(lang, "endpointPlaceholder")}
                onChange={(e) => {
                  setG({ ...g, target_text: e.target.value });
                  setFieldQuestions([]);
                  setFieldAnswers({});
                  setFieldQuestionsChecked(false);
                  setSuggestions([]);
                  setSelected({});
                  setFieldStatus("");
                }}
              />
            </div>
            <div className="field compact-field importance-field">
              <label>
                {tr(lang, "importanceLabel")}
                <span
                  className="mini-help"
                  title={tr(lang, "importanceHelpTooltip")}
                >
                  ?
                </span>
              </label>
              <input
                type="number"
                value={g.weight}
                onChange={(e) => setG({ ...g, weight: Number(e.target.value) })}
              />
              <div className="field-help">{tr(lang, "importanceHelp")}</div>
            </div>
            <div className="wizard-nav">
              <button type="button" className="btn ghost" onClick={() => setStep(2)}>{tr(lang, "prevStep")}</button>
              <button type="button" className="btn" onClick={() => goStep(4)} disabled={!hasEndpoint}>{tr(lang, "confirmEndpoint")}</button>
            </div>
            </>
          )}

          {step === 4 && (
            <>
            <div className="initial-items-panel">
              <div className="initial-items-title">
                <div>
                  <div className="panel-kicker">{tr(lang, "step4Kicker")}</div>
                  <span>{fieldStatus || tr(lang, "step4DefaultStatus")}</span>
                </div>
                <div className="initial-items-actions">
                  {hasKey ? (
                    <>
                      <button type="button" className="btn secondary sm" onClick={askFieldQuestions} disabled={!canOpenStep(4) || fieldLoading}>
                        {fieldLoading ? tr(lang, "processing") : tr(lang, "checkFollowups")}
                      </button>
                      <button type="button" className="btn sm" onClick={askFieldItems} disabled={!canOpenStep(4) || !fieldQuestionsChecked || !allFollowupsAnswered || fieldLoading}>
                        {tr(lang, "generateFields")}
                      </button>
                    </>
                  ) : (
                    <span className="ai-no-key-hint">
                      <button type="button" className="btn secondary sm" disabled>{tr(lang, "checkFollowups")}</button>
                      <button type="button" className="btn sm" disabled>{tr(lang, "generateFields")}</button>
                      <Link to="/setup" className="ai-no-key-link">{tr(lang, "aiNeedsKeyWizard")} — {tr(lang, "goToSettings")}</Link>
                    </span>
                  )}
                  <button type="button" className="btn ghost sm" onClick={addManual}>{tr(lang, "addManualField")}</button>
                </div>
              </div>
              {error && <div className="form-error">{error}</div>}
              {fieldQuestions.length > 0 && (
                <div className="followup-list">
                  {fieldQuestions.map((q) => (
                    <div key={q.id} className="followup-question">
                      <strong>{q.label}</strong>
                      <div className="choice-card-row">
                        {q.options.map((option) => (
                          <button
                            key={option}
                            className={fieldAnswers[q.id] === option ? "active" : ""}
                            onClick={() => setFieldAnswers({ ...fieldAnswers, [q.id]: option })}
                            type="button"
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {suggestions.length === 0 && manualItems.length === 0 && (
                <div className="empty-inline">{tr(lang, "noFieldsYet")}</div>
              )}
              {suggestions.length > 0 && (
                <div className="suggested-item-list">
                  {suggestions.map((item, i) => (
                    <label key={`${item.label}-${i}`} className="suggested-item-row">
                      <input
                        type="checkbox"
                        checked={!!selected[i]}
                        onChange={(e) => setSelected({ ...selected, [i]: e.target.checked })}
                      />
                      <span>
                        <strong>{item.label}</strong>
                        <small>
                          {typeLabel(item.type, lang)}
                          {item.target_value !== null && item.target_value !== undefined
                            ? tr(lang, "targetValue", { value: item.target_value, unit: item.unit ? ` ${item.unit}` : "" })
                            : ""}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {manualItems.length > 0 && (
                <div className="manual-item-list">
                  {manualItems.map((item, i) => (
                    <div key={i} className="manual-item-row">
                      <input
                        value={item.label}
                        placeholder={tr(lang, "fieldNamePlaceholder")}
                        onChange={(e) => updateManual(i, { label: e.target.value })}
                      />
                      <select
                        value={item.type}
                        onChange={(e) => updateManual(i, { type: e.target.value as CheckItemType })}
                      >
                        <option value="bool">{tr(lang, "typeBool")}</option>
                        <option value="number">{tr(lang, "typeNumber")}</option>
                        <option value="minutes">{tr(lang, "typeMinutes")}</option>
                        <option value="text">{tr(lang, "typeText")}</option>
                        <option value="scale">{tr(lang, "typeScale")}</option>
                        <option value="choice">{tr(lang, "typeChoice")}</option>
                      </select>
                      <input
                        type="number"
                        placeholder={tr(lang, "fieldTargetPlaceholder")}
                        value={item.target_value ?? ""}
                        onChange={(e) => updateManual(i, { target_value: e.target.value === "" ? undefined : Number(e.target.value) })}
                      />
                      <input
                        placeholder={tr(lang, "fieldUnitPlaceholder")}
                        value={item.unit ?? ""}
                        onChange={(e) => updateManual(i, { unit: e.target.value || undefined })}
                      />
                      <button className="btn ghost sm" onClick={() => removeManual(i)}>{tr(lang, "deleteShort")}</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="wizard-nav">
              <button type="button" className="btn ghost" onClick={() => setStep(3)}>{tr(lang, "prevStep")}</button>
              <button type="button" className="btn" onClick={save} disabled={!hasGoalDraft || !g.target_text.trim() || selectedCount === 0}>{tr(lang, "createGoal")}</button>
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CheckItemRow({ item, onChange, lang }: { item: CheckItem; onChange: () => void; lang: Lang }) {
  const [c, setC] = useState<CheckItem>(item);
  const [editing, setEditing] = useState(false);

  const save = async () => {
    await updateCheckItem(c);
    setEditing(false);
    onChange();
  };
  const remove = async () => {
    if (!confirm(tr(lang, "confirmDeleteItem", { label: c.label }))) return;
    await deleteCheckItem(c.id);
    onChange();
  };

  return (
    <div className="item-row">
      <div className="lbl">
        {editing ? (
          <input
            className="inline-text"
            value={c.label}
            onChange={(e) => setC({ ...c, label: e.target.value })}
          />
        ) : (
          <span className="check-item-title">
            <strong>{c.label}</strong>
            <span className="tag">{typeLabel(c.type, lang)}</span>
            {c.target_value !== null && (
              <span className="target">{tr(lang, "targetValue", { value: c.target_value, unit: c.unit ? " " + c.unit : "" })}</span>
            )}
          </span>
        )}
      </div>
      <div className="control" style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {editing ? (
          <>
            <select
              className="inline-sel"
              value={c.type}
              onChange={(e) => setC({ ...c, type: e.target.value as CheckItemType })}
            >
              <option value="bool">bool</option>
              <option value="number">number</option>
              <option value="minutes">minutes</option>
              <option value="choice">choice</option>
              <option value="scale">scale</option>
              <option value="text">text</option>
            </select>
            <input
              className="inline-num"
              type="number"
              placeholder={tr(lang, "fieldTargetPlaceholder")}
              value={c.target_value ?? ""}
              onChange={(e) => setC({ ...c, target_value: e.target.value === "" ? null : Number(e.target.value) })}
            />
            <input
              className="inline-text"
              style={{ minWidth: 80 }}
              placeholder={tr(lang, "fieldUnitPlaceholder")}
              value={c.unit ?? ""}
              onChange={(e) => setC({ ...c, unit: e.target.value || null })}
            />
            <button className="btn sm" onClick={save}>{tr(lang, "saveButton")}</button>
            <button className="btn ghost sm" onClick={() => { setC(item); setEditing(false); }}>{tr(lang, "cancel")}</button>
          </>
        ) : (
          <>
            <button className="btn ghost sm" onClick={() => setEditing(true)}>{tr(lang, "editButton")}</button>
            <button className="btn ghost sm" onClick={remove} style={{ color: "var(--danger)" }}>{tr(lang, "deleteShort")}</button>
          </>
        )}
      </div>
    </div>
  );
}

function typeLabel(type: CheckItemType, lang: Lang): string {
  switch (type) {
    case "bool": return tr(lang, "typeBool");
    case "number": return tr(lang, "typeNumber");
    case "minutes": return tr(lang, "typeMinutes");
    case "choice": return tr(lang, "typeChoice");
    case "scale": return tr(lang, "typeScale");
    case "text": return tr(lang, "typeText");
  }
}
