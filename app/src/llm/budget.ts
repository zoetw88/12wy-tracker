import { ProviderId } from "./providers";
import { LlmError } from "./resilience";
import { getUsageSummary, UsageSummary } from "./usage";

export const LLM_DAILY_BUDGET_KEY = "llm_budget_daily_usd";
export const LLM_MONTHLY_BUDGET_KEY = "llm_budget_monthly_usd";

export interface LlmBudgetSettings {
  dailyUsd: number | null;
  monthlyUsd: number | null;
}

export interface LlmBudgetStatus extends LlmBudgetSettings {
  todayCost: number;
  monthCost: number;
  dailyRemaining: number | null;
  monthlyRemaining: number | null;
  blocked: boolean;
  reason: string | null;
}

export function parseBudgetLimit(raw: string | null | undefined): number | null {
  const value = (raw ?? "").trim();
  if (value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function formatBudgetLimit(value: number | null): string {
  return value === null ? "" : String(value);
}

export function getLlmBudgetSettings(): LlmBudgetSettings {
  return {
    dailyUsd: parseBudgetLimit(localStorage.getItem(LLM_DAILY_BUDGET_KEY)),
    monthlyUsd: parseBudgetLimit(localStorage.getItem(LLM_MONTHLY_BUDGET_KEY)),
  };
}

export function setLlmBudgetSettings(settings: LlmBudgetSettings): void {
  writeBudgetSetting(LLM_DAILY_BUDGET_KEY, settings.dailyUsd);
  writeBudgetSetting(LLM_MONTHLY_BUDGET_KEY, settings.monthlyUsd);
  window.dispatchEvent(new CustomEvent("llm-budget-change"));
}

export function evaluateLlmBudget(
  usage: Pick<UsageSummary, "today_cost" | "month_cost">,
  settings: LlmBudgetSettings
): LlmBudgetStatus {
  const dailyRemaining = settings.dailyUsd === null
    ? null
    : Math.max(0, settings.dailyUsd - usage.today_cost);
  const monthlyRemaining = settings.monthlyUsd === null
    ? null
    : Math.max(0, settings.monthlyUsd - usage.month_cost);

  const dailyBlocked = settings.dailyUsd !== null && usage.today_cost >= settings.dailyUsd;
  const monthlyBlocked = settings.monthlyUsd !== null && usage.month_cost >= settings.monthlyUsd;

  return {
    ...settings,
    todayCost: usage.today_cost,
    monthCost: usage.month_cost,
    dailyRemaining,
    monthlyRemaining,
    blocked: dailyBlocked || monthlyBlocked,
    reason: dailyBlocked
      ? `Daily LLM budget reached ($${usage.today_cost.toFixed(4)} / $${settings.dailyUsd!.toFixed(4)})`
      : monthlyBlocked
        ? `Monthly LLM budget reached ($${usage.month_cost.toFixed(4)} / $${settings.monthlyUsd!.toFixed(4)})`
        : null,
  };
}

export async function getLlmBudgetStatus(): Promise<LlmBudgetStatus> {
  const summary = await getUsageSummary();
  return evaluateLlmBudget(summary, getLlmBudgetSettings());
}

export async function assertLlmBudgetAllowsCall(provider: ProviderId): Promise<void> {
  if (provider === "ollama") return;

  const status = await getLlmBudgetStatus();
  if (!status.blocked) return;

  throw new LlmError({
    class: "rate-limit",
    message: "LLM usage budget reached",
    rawDetail: status.reason ?? "LLM usage budget reached",
    displayKey: "llmErrRateLimit",
  });
}

function writeBudgetSetting(key: string, value: number | null): void {
  if (value === null) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, String(Math.max(0, value)));
}
