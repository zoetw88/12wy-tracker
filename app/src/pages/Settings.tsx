import { useEffect, useRef, useState } from "react";
import {
  PROVIDERS, ProviderId,
} from "../llm/providers";
import {
  getActiveProvider, setActiveProvider,
  getActiveModel, setActiveModel,
  getKey, setKey,
  callLlm,
} from "../llm/client";
import {
  listRecentUsage, getUsageSummary, clearUsage, UsageRow, UsageSummary,
} from "../llm/usage";
import {
  formatBudgetLimit,
  getLlmBudgetSettings,
  getLlmBudgetStatus,
  LlmBudgetStatus,
  parseBudgetLimit,
  setLlmBudgetSettings,
} from "../llm/budget";
import {
  listPromptVersions,
  PromptVersionInfo,
  setPromptVersion,
} from "../llm/promptRegistry";
import { testPrompt } from "../llm/prompts";
import {
  defaultEndForStart,
  programEnd,
  programStart,
  setProgramRange,
  todayISO,
} from "../dateUtils";
import {
  deleteProfileData,
} from "../db";
import {
  createLocalDataSnapshot,
  dataLocationLabel,
  deleteActiveProfileLocalData,
  downloadSnapshot,
  importLocalDataSnapshot,
  parseSnapshotJson,
} from "../dataPortability";
import {
  activeProfile,
  addProfile,
  AppProfile,
  deleteProfile,
  listProfiles,
  setActiveProfile,
} from "../profile";
import { tr, useLang } from "../i18n";
import { useToast } from "../useToast";

export default function Settings() {
  const [lang] = useLang();
  const [active, setActive] = useState<ProviderId>(getActiveProvider());
  const [activeModel, setActiveModelState] = useState<string>(getActiveModel(active));
  const [keys, setKeys] = useState<Record<ProviderId, string>>({} as any);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [budgetStatus, setBudgetStatus] = useState<LlmBudgetStatus | null>(null);
  const initialBudget = getLlmBudgetSettings();
  const [dailyBudget, setDailyBudget] = useState(formatBudgetLimit(initialBudget.dailyUsd));
  const [monthlyBudget, setMonthlyBudget] = useState(formatBudgetLimit(initialBudget.monthlyUsd));
  const [openLog, setOpenLog] = useState<UsageRow | null>(null);
  const [promptVersions, setPromptVersions] = useState<PromptVersionInfo[]>(() => listPromptVersions());
  const [profiles, setProfiles] = useState<AppProfile[]>(listProfiles());
  const [currentProfile, setCurrentProfile] = useState(activeProfile());
  const [newProfileName, setNewProfileName] = useState("");
  const [addingProfile, setAddingProfile] = useState(false);
  // When no range is stored yet, default the inputs to today (suggested, not auto-saved).
  const [rangeStart, setRangeStart] = useState(programStart() ?? todayISO());
  const [rangeEnd, setRangeEnd] = useState(programEnd() ?? defaultEndForStart(todayISO()));
  const { toast, notify } = useToast();
  const [usageOpen, setUsageOpen] = useState(false);
  const [dataBusy, setDataBusy] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  // Load all keys + usage
  useEffect(() => {
    const k: any = {};
    for (const p of PROVIDERS) k[p.id] = getKey(p.id);
    setKeys(k);
    refreshUsage();
  }, []);

  const refreshUsage = async () => {
    setUsage(await listRecentUsage(10));
    setSummary(await getUsageSummary());
    setBudgetStatus(await getLlmBudgetStatus());
    setPromptVersions(listPromptVersions());
  };

  const onChangeKey = (id: ProviderId, v: string) => {
    setKeys({ ...keys, [id]: v });
    setKey(id, v);
  };

  const onChangeActive = (id: ProviderId) => {
    setActive(id);
    setActiveProvider(id);
    const m = getActiveModel(id);
    setActiveModelState(m);
  };

  const onChangeModel = (m: string) => {
    setActiveModelState(m);
    setActiveModel(active, m);
  };

  const onTest = async () => {
    setTesting(true); setTestResult("");
    try {
      const t = testPrompt();
      const r = await callLlm({
        promptKey: "test",
        system: t.system || undefined,
        user: t.user,
        maxOutputTokens: 32,
      });
      setTestResult(
        `✓ ${r.provider}/${r.model} · ${r.latencyMs}ms · ${r.inputTokens}+${r.outputTokens} tok · $${r.costUSD.toFixed(6)}\n${tr(lang, "testResponseLabel")}: ${r.text.slice(0, 80)}`
      );
      await refreshUsage();
    } catch (e: any) {
      setTestResult("✗ " + e.message);
      await refreshUsage();
    } finally {
      setTesting(false);
    }
  };

  const onClearUsage = async () => {
    if (!confirm(tr(lang, "confirmClearUsage"))) return;
    await clearUsage();
    await refreshUsage();
    notify(tr(lang, "cleared"));
  };

  const saveBudget = async () => {
    setLlmBudgetSettings({
      dailyUsd: parseBudgetLimit(dailyBudget),
      monthlyUsd: parseBudgetLimit(monthlyBudget),
    });
    await refreshUsage();
    notify("LLM budget saved");
  };

  const exportData = async () => {
    setDataBusy(true);
    try {
      const snapshot = await createLocalDataSnapshot();
      downloadSnapshot(snapshot);
      notify("Data export created; API keys excluded");
    } catch (e: any) {
      notify(`Export failed: ${e?.message ?? String(e)}`);
    } finally {
      setDataBusy(false);
    }
  };

  const importDataFile = async (file: File | null) => {
    if (!file) return;
    setDataBusy(true);
    try {
      const text = await file.text();
      const snapshot = parseSnapshotJson(text);
      if (!confirm(`Import data from "${snapshot.source_profile.name}" into the active profile? Existing active-profile app data will be replaced. API keys are not imported.`)) return;
      await importLocalDataSnapshot(snapshot);
      notify("Data imported");
      window.location.reload();
    } catch (e: any) {
      notify(`Import failed: ${e?.message ?? String(e)}`);
    } finally {
      setDataBusy(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const deleteLocalData = async () => {
    if (!confirm("Delete goals, check-items, daily logs, weekly reviews, and LLM usage for the active profile? API keys are kept.")) return;
    setDataBusy(true);
    try {
      await deleteActiveProfileLocalData();
      notify("Active profile data deleted");
      window.location.reload();
    } catch (e: any) {
      notify(`Delete failed: ${e?.message ?? String(e)}`);
    } finally {
      setDataBusy(false);
    }
  };

  const changePromptVersion = (key: PromptVersionInfo["key"], version: string) => {
    try {
      setPromptVersion(key, version);
      setPromptVersions(listPromptVersions());
      notify("Prompt version updated");
    } catch (e: any) {
      notify(e?.message ?? String(e));
    }
  };

  const visiblePromptVersions = promptVersions.filter((prompt) => (
    prompt.key === "create_goal_design" ||
    prompt.key === "suggest_priority" ||
    prompt.key === "weekly_review" ||
    prompt.key === "dashboard_advice"
  ));

  const activeProvider = PROVIDERS.find((p) => p.id === active)!;
  const profileDisplayName = (profile: AppProfile) => {
    if (profile.id !== "default") return profile.name;
    return tr(lang, "defaultProfileName");
  };

  const saveRange = () => {
    setProgramRange(rangeStart, rangeEnd);
    notify(tr(lang, "weekRangeSaved"));
  };

  const selectProfile = (id: string) => {
    if (id === currentProfile.id) return;
    setActiveProfile(id);
    setCurrentProfile(activeProfile());
    setProfiles(listProfiles());
    window.location.reload();
  };

  const createProfile = () => {
    try {
      const profile = addProfile(newProfileName);
      setProfiles(listProfiles());
      setCurrentProfile(profile);
      setNewProfileName("");
      setAddingProfile(false);
      window.location.reload();
    } catch (e: any) {
      notify(e?.message ?? String(e));
    }
  };

  const removeCurrentProfile = async () => {
    if (profiles.length <= 1) {
      notify(tr(lang, "minOneProfile"));
      return;
    }
    if (!confirm(tr(lang, "confirmDeleteProfile", { name: profileDisplayName(currentProfile) }))) return;
    await deleteProfileData(currentProfile.id);
    const next = deleteProfile(currentProfile.id);
    setProfiles(listProfiles());
    setCurrentProfile(next);
    window.location.reload();
  };

  return (
    <>
      <div className="page-section-head settings-page-head">
        <div>
          <h2>System</h2>
          <div className="subtitle">{tr(lang, "settingsSubtitle")}</div>
        </div>
        <span className="info-chip" title={tr(lang, "settingsInfoTip")}>?</span>
      </div>

      <div className="section">
        <div className="section-header no-toggle">
          <div>
            <div className="section-title">Profiles</div>
            <div className="section-meta">{tr(lang, "profilesMeta")}</div>
          </div>
        </div>
        <div className="section-body">
          <div className="settings-choice-card profile-manager">
            <div className="profile-card-grid">
              {profiles.map((profile) => {
                const isActive = profile.id === currentProfile.id;
                return (
                  <button
                    key={profile.id}
                    className={`profile-card-option ${isActive ? "active" : ""}`}
                    onClick={() => selectProfile(profile.id)}
                    type="button"
                  >
                    <span>{profileDisplayName(profile)}</span>
                    <small>{isActive ? tr(lang, "inUse") : tr(lang, "switchProfile")}</small>
                  </button>
                );
              })}
            </div>

            <div className="settings-actions">
              <button className="btn" onClick={() => setAddingProfile(true)}>{tr(lang, "addProfile")}</button>
              <button
                className="btn ghost"
                onClick={removeCurrentProfile}
                disabled={profiles.length <= 1}
                style={{ color: "var(--danger)" }}
              >
                {tr(lang, "deleteCurrentProfile")}
              </button>
            </div>

            {addingProfile && (
              <div className="profile-create-row">
                <input
                  autoFocus
                  value={newProfileName}
                  placeholder="e.g. Job search / Health / Immigration"
                  onChange={(e) => setNewProfileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createProfile();
                    if (e.key === "Escape") {
                      setAddingProfile(false);
                      setNewProfileName("");
                    }
                  }}
                />
                <button className="btn" onClick={createProfile}>{tr(lang, "createProfile")}</button>
                <button
                  className="btn ghost"
                  onClick={() => {
                    setAddingProfile(false);
                    setNewProfileName("");
                  }}
                >
                  {tr(lang, "cancel")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="section compact-section">
        <div className="section-header no-toggle">
          <div>
            <div className="section-title">{tr(lang, "weekRangeSectionTitle")}</div>
            <div className="section-meta">{tr(lang, "weekRangeMeta")}</div>
          </div>
        </div>
        <div className="section-body">
          <div className="settings-choice-card settings-range-card">
            <div className="row settings-date-row">
              <div className="field">
                <label>{tr(lang, "startDateLabel")}</label>
                <input
                  type="date"
                  value={rangeStart}
                  onChange={(e) => {
                    const next = e.target.value;
                    setRangeStart(next);
                    setRangeEnd(defaultEndForStart(next));
                  }}
                />
              </div>
              <div className="field">
                <label>{tr(lang, "endDateLabel")}</label>
                <input
                  type="date"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="actions settings-range-actions">
              <button className="btn secondary" onClick={() => {
                const end = defaultEndForStart(rangeStart);
                setRangeEnd(end);
              }}>
                {tr(lang, "recalcEndDate")}
              </button>
              <button className="btn" onClick={saveRange}>{tr(lang, "saveRange")}</button>
            </div>
          </div>
        </div>
      </div>

      <div className="section compact-section">
        <div className="section-header no-toggle">
          <div>
            <div className="section-title">Save File</div>
            <div className="section-meta">Export, import, or delete active-profile progress</div>
          </div>
        </div>
        <div className="section-body">
          <div className="settings-choice-card">
            <div className="source-grid">
              <div>
                <span>Storage</span>
                <strong>{dataLocationLabel()}</strong>
              </div>
              <div>
                <span>Export policy</span>
                <strong>API keys excluded</strong>
              </div>
              <div>
                <span>Import mode</span>
                <strong>Replace active profile</strong>
              </div>
              <div>
                <span>Delete mode</span>
                <strong>Current save only</strong>
              </div>
            </div>
            <div className="settings-actions">
              <button className="btn" onClick={exportData} disabled={dataBusy}>Export save</button>
              <button className="btn secondary" onClick={() => importInputRef.current?.click()} disabled={dataBusy}>
                Import save
              </button>
              <button className="btn ghost" onClick={deleteLocalData} disabled={dataBusy} style={{ color: "var(--danger)" }}>
                Delete save
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: "none" }}
                onChange={(event) => importDataFile(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-header no-toggle">
          <div>
            <div className="section-title">LLM</div>
            <div className="section-meta">{tr(lang, "llmSectionMeta")}</div>
          </div>
        </div>
        <div className="section-body">
          <div className="settings-choice-card">
            <div className="row llm-row">
              <div className="field">
                <label>Provider</label>
                <select value={active} onChange={(e) => onChangeActive(e.target.value as ProviderId)}>
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{!getKey(p.id) && p.needsKey ? tr(lang, "noKeyLabel") : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Model</label>
                <select value={activeModel} onChange={(e) => onChangeModel(e.target.value)}>
                  {activeProvider.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} · in ${m.inputPer1M}/M · out ${m.outputPer1M}/M
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {activeProvider.needsKey && (
              <div className="field api-key-current">
                <label>{activeProvider.name} API key</label>
                <input
                  type="password"
                  placeholder="API key"
                  value={keys[active] || ""}
                  onChange={(e) => onChangeKey(active, e.target.value)}
                />
                <div className="sub">{tr(lang, "apiKeyStoredLocally")}{activeProvider.docsUrl}</div>
              </div>
            )}
            <div className="settings-actions">
              <button className="btn" onClick={onTest} disabled={testing}>
                {testing ? tr(lang, "testingConnection") : tr(lang, "testConnection")}
              </button>
              <button className="btn ghost" onClick={() => setUsageOpen(!usageOpen)}>
                {usageOpen ? tr(lang, "collapseUsage") : tr(lang, "viewUsage")}
              </button>
            </div>
            {testResult && (
              <pre
                className={`notice ${testResult.startsWith("✓") ? "info" : "danger"}`}
                style={{ marginTop: 12, whiteSpace: "pre-wrap", fontFamily: "inherit" }}
              >{testResult}</pre>
            )}
          </div>
        </div>
      </div>

      <div className="section compact-section">
        <div className="section-header no-toggle">
          <div>
            <div className="section-title">AI Mana Cap</div>
            <div className="section-meta">Local estimated cost limits before coach calls</div>
          </div>
        </div>
        <div className="section-body">
          <div className="settings-choice-card">
            <div className="row llm-row">
              <div className="field">
                <label>Daily limit (USD)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="No daily limit"
                  value={dailyBudget}
                  onChange={(e) => setDailyBudget(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Monthly limit (USD)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="No monthly limit"
                  value={monthlyBudget}
                  onChange={(e) => setMonthlyBudget(e.target.value)}
                />
              </div>
            </div>
            <div className="source-grid">
              <div>
                <span>Today</span>
                <strong>${(budgetStatus?.todayCost ?? 0).toFixed(4)}</strong>
              </div>
              <div>
                <span>This month</span>
                <strong>${(budgetStatus?.monthCost ?? 0).toFixed(4)}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong style={{ color: budgetStatus?.blocked ? "var(--danger)" : "var(--success)" }}>
                  {budgetStatus?.blocked ? "Blocked" : "Allowed"}
                </strong>
              </div>
              <div>
                <span>Scope</span>
                <strong>Hosted AI only</strong>
              </div>
            </div>
            {budgetStatus?.reason && (
              <div className="notice danger" style={{ marginTop: 12 }}>{budgetStatus.reason}</div>
            )}
            <div className="settings-actions">
              <button className="btn" onClick={saveBudget}>Save budget</button>
            </div>
          </div>
        </div>
      </div>

      {usageOpen && summary && (
      <div className="section usage-section">
        <div className="section-header no-toggle">
          <div>
            <div className="section-title">{tr(lang, "usageSectionTitle")}</div>
            <div className="section-meta">{tr(lang, "usageSectionMeta")}</div>
          </div>
          <div className="section-actions">
            <button className="btn ghost sm" onClick={onClearUsage}>{tr(lang, "clearUsageButton")}</button>
            <button className="btn ghost sm" onClick={() => setUsageOpen(false)}>{tr(lang, "collapseButton")}</button>
          </div>
        </div>
        <div className="section-body">
          <div className="stats usage-stats">
            <div className="stat-card">
              <div className="l">{tr(lang, "usageToday")}</div>
              <div className="v">${summary.today_cost.toFixed(4)}</div>
              <div className="sub">{summary.today_calls} calls</div>
            </div>
            <div className="stat-card">
              <div className="l">{tr(lang, "usageLast7")}</div>
              <div className="v">${summary.week_cost.toFixed(4)}</div>
              <div className="sub">{summary.week_calls} calls</div>
            </div>
            <div className="stat-card">
              <div className="l">Month</div>
              <div className="v">${summary.month_cost.toFixed(4)}</div>
              <div className="sub">{summary.month_calls} calls</div>
            </div>
            <div className="stat-card">
              <div className="l">{tr(lang, "usageTotal")}</div>
              <div className="v">${summary.total_cost.toFixed(4)}</div>
              <div className="sub">{summary.total_calls} calls</div>
            </div>
          </div>
          {usage.length === 0 ? (
            <div className="muted" style={{ padding: 20, fontSize: 13 }}>{tr(lang, "noCallsYet")}</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{tr(lang, "usageColTime")}</th><th>Provider/Model</th><th>{tr(lang, "usageColPurpose")}</th>
                  <th>{tr(lang, "usageColVersion")}</th><th>Tokens</th><th>Latency</th><th>Cost</th><th>{tr(lang, "usageColRating")}</th><th></th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                      {u.ts.slice(5, 19)}
                    </td>
                    <td>
                      {u.provider}<br />
                      <span className="muted" style={{ fontSize: 11 }}>{u.model}</span>
                    </td>
                    <td><span className="tag">{u.prompt_key}</span></td>
                    <td><span className="tag muted">{u.prompt_version || "v1"}</span></td>
                    <td>{u.input_tokens ?? 0} + {u.output_tokens ?? 0}</td>
                    <td>{u.latency_ms ?? 0}ms</td>
                    <td>
                      {u.success
                        ? "$" + (u.cost_usd ?? 0).toFixed(6)
                        : <span style={{ color: "var(--danger)" }}>✗</span>}
                    </td>
                    <td>{formatQualityScore(u.quality_score, lang)}</td>
                    <td>
                      <button className="btn ghost sm" onClick={() => setOpenLog(u)}>{tr(lang, "viewLog")}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      )}

      <div className="section compact-section">
        <div className="section-header no-toggle">
          <div>
            <div className="section-title">Coach Patch Notes</div>
            <div className="section-meta">Prompt versions used by AI logs and eval reports</div>
          </div>
        </div>
        <div className="section-body">
          <div className="prompt-version-list">
            {visiblePromptVersions.map((prompt) => (
              <div className="prompt-version-row" key={prompt.key}>
                <div className="prompt-version-main">
                  <span className="tag">{prompt.key}</span>
                  <strong>{prompt.notes}</strong>
                </div>
                <div className="prompt-version-meta">
                  <span>{prompt.evalCases}</span>
                  <span>{prompt.rollbackTo ?? "Git/release rollback"}</span>
                </div>
                <select
                  value={prompt.activeVersion}
                  onChange={(e) => changePromptVersion(prompt.key, e.target.value)}
                  aria-label={`Prompt version ${prompt.key}`}
                >
                  {prompt.versions.map((version) => (
                    <option key={version} value={version}>{version}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>

      {openLog && <LogDetailModal row={openLog} onClose={() => setOpenLog(null)} lang={lang} />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

function LogDetailModal({ row, onClose, lang }: { row: UsageRow; onClose: () => void; lang: Parameters<typeof tr>[0] }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 760 }}>
        <h3>{tr(lang, "logDetailTitle", { id: row.id })}</h3>
        <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          {row.ts} · {row.provider}/{row.model} · {row.prompt_key}
          {" · "}{tr(lang, "usageColVersion")}: {row.prompt_version || "v1"}
          {" · "}{row.input_tokens}+{row.output_tokens} tok
          {" · "}{row.latency_ms}ms · ${(row.cost_usd ?? 0).toFixed(6)}
          {" · "}{tr(lang, "usageColRating")}: {formatQualityScore(row.quality_score, lang)}
        </div>

        {row.system_prompt && (
          <>
            <h4 style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 4 }}>System</h4>
            <pre style={preStyle}>{row.system_prompt}</pre>
          </>
        )}

        <h4 style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 4 }}>User Prompt</h4>
        <pre style={preStyle}>{row.user_prompt}</pre>

        <h4 style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 4 }}>Response</h4>
        <pre style={preStyle}>{row.response_text || row.error_msg || tr(lang, "logDetailEmpty")}</pre>

        <div className="actions">
          <button className="btn" onClick={onClose}>{tr(lang, "logDetailClose")}</button>
        </div>
      </div>
    </div>
  );
}

const preStyle: React.CSSProperties = {
  background: "var(--bg)", padding: "10px 12px", borderRadius: 8,
  fontSize: 12, fontFamily: "ui-monospace, 'SF Mono', monospace",
  whiteSpace: "pre-wrap", wordBreak: "break-word",
  maxHeight: 200, overflow: "auto", marginBottom: 14,
};

function formatQualityScore(score: number | null, lang: Parameters<typeof tr>[0]): string {
  if (score === 1) return tr(lang, "usageRatingHelpful");
  if (score === 0) return tr(lang, "usageRatingNotHelpful");
  return tr(lang, "usageRatingUnrated");
}
