import { getDb } from "../db";
import { activeProfileId } from "../profile";
import { ProviderId, PromptKey } from "./providers";

export interface UsageRow {
  id: number;
  ts: string;
  provider: string;
  model: string;
  prompt_key: string | null;
  system_prompt: string | null;
  user_prompt: string | null;
  response_text: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  cost_usd: number | null;
  success: number;
  error_msg: string | null;
  request_id: string | null;
  profile_id: string | null;
  scenario: string | null;
  prompt_version: string | null;
  input_chars: number | null;
  output_chars: number | null;
  quality_score: number | null;
}

export interface UsageInsert {
  provider: ProviderId;
  model: string;
  prompt_key: PromptKey;
  system_prompt: string | null;
  user_prompt: string;
  response_text: string | null;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  cost_usd: number;
  success: boolean;
  error_msg: string | null;
  scenario?: string;
  prompt_version?: string;
  quality_score?: number | null;
}

export async function insertUsage(u: UsageInsert): Promise<string> {
  const requestId = newRequestId();
  try {
    const db = await getDb();
    await db.execute(
      `INSERT INTO llm_usage
         (provider, model, prompt_key, system_prompt, user_prompt, response_text,
          input_tokens, output_tokens, latency_ms, cost_usd, success, error_msg,
          request_id, profile_id, scenario, prompt_version, input_chars, output_chars, quality_score)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        u.provider, u.model, u.prompt_key, u.system_prompt, u.user_prompt, u.response_text,
        u.input_tokens, u.output_tokens, u.latency_ms, u.cost_usd,
        u.success ? 1 : 0, u.error_msg,
        requestId, activeProfileId(), u.scenario ?? u.prompt_key, u.prompt_version ?? "v1",
        u.user_prompt.length + (u.system_prompt?.length ?? 0),
        u.response_text?.length ?? 0,
        u.quality_score ?? null,
      ]
    );
  } catch {
    insertPreviewUsage(u, requestId);
  }
  return requestId;
}

export async function listRecentUsage(limit = 20): Promise<UsageRow[]> {
  try {
    const db = await getDb();
    return await db.select<UsageRow[]>(
      `SELECT * FROM llm_usage ORDER BY id DESC LIMIT $1`,
      [limit]
    );
  } catch {
    return previewUsageRows().slice(0, limit);
  }
}

export interface UsageSummary {
  today_cost: number;
  today_calls: number;
  week_cost: number;
  week_calls: number;
  month_cost: number;
  month_calls: number;
  total_cost: number;
  total_calls: number;
  total_tokens_in: number;
  total_tokens_out: number;
}

export async function getUsageSummary(): Promise<UsageSummary> {
  const today = new Date();
  const todayStr = todayISOLocal(today);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 7);
  const weekStartStr = todayISOLocal(weekStart);
  const monthStartStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  try {
    const db = await getDb();

    const [today_row] = await db.select<{ c: number; n: number }[]>(
      `SELECT COALESCE(SUM(cost_usd), 0) as c, COUNT(*) as n
         FROM llm_usage WHERE date(ts) = $1`,
      [todayStr]
    );
    const [week_row] = await db.select<{ c: number; n: number }[]>(
      `SELECT COALESCE(SUM(cost_usd), 0) as c, COUNT(*) as n
         FROM llm_usage WHERE date(ts) >= $1`,
      [weekStartStr]
    );
    const [month_row] = await db.select<{ c: number; n: number }[]>(
      `SELECT COALESCE(SUM(cost_usd), 0) as c, COUNT(*) as n
         FROM llm_usage WHERE date(ts) >= $1`,
      [monthStartStr]
    );
    const [total_row] = await db.select<{ c: number; n: number; ti: number; to: number }[]>(
      `SELECT COALESCE(SUM(cost_usd), 0) as c,
              COUNT(*) as n,
              COALESCE(SUM(input_tokens), 0) as ti,
              COALESCE(SUM(output_tokens), 0) as "to"
         FROM llm_usage`
    );
    return {
      today_cost: today_row?.c ?? 0,
      today_calls: today_row?.n ?? 0,
      week_cost: week_row?.c ?? 0,
      week_calls: week_row?.n ?? 0,
      month_cost: month_row?.c ?? 0,
      month_calls: month_row?.n ?? 0,
      total_cost: total_row?.c ?? 0,
      total_calls: total_row?.n ?? 0,
      total_tokens_in: total_row?.ti ?? 0,
      total_tokens_out: total_row?.to ?? 0,
    };
  } catch {
    const rows = previewUsageRows();
    const todayRows = rows.filter((r) => r.ts.slice(0, 10) === todayStr);
    const weekRows = rows.filter((r) => r.ts.slice(0, 10) >= weekStartStr);
    const monthRows = rows.filter((r) => r.ts.slice(0, 10) >= monthStartStr);
    return {
      today_cost: sum(todayRows, "cost_usd"),
      today_calls: todayRows.length,
      week_cost: sum(weekRows, "cost_usd"),
      week_calls: weekRows.length,
      month_cost: sum(monthRows, "cost_usd"),
      month_calls: monthRows.length,
      total_cost: sum(rows, "cost_usd"),
      total_calls: rows.length,
      total_tokens_in: sum(rows, "input_tokens"),
      total_tokens_out: sum(rows, "output_tokens"),
    };
  }
}

export async function clearUsage(): Promise<void> {
  try {
    const db = await getDb();
    await db.execute(`DELETE FROM llm_usage`);
  } catch {
    setPreviewUsageRows([]);
  }
}

/**
 * One-shot write of a user quality rating to an existing llm_usage row.
 * The `quality_score IS NULL` guard enforces immutability at the DB level:
 * a second rating for the same request_id is a silent no-op (0 rows updated).
 * Convention: 👍 = 1.0, 👎 = 0.0 (REAL column).
 */
export async function updateQualityScore(requestId: string, score: number): Promise<void> {
  // Enforce 0.0/1.0 convention; reject non-finite or out-of-range values silently.
  if (!Number.isFinite(score) || score < 0 || score > 1) return;
  try {
    const db = await getDb();
    await db.execute(
      `UPDATE llm_usage SET quality_score = $1 WHERE request_id = $2 AND quality_score IS NULL`,
      [score, requestId]
    );
  } catch {
    setPreviewUsageRows(previewUsageRows().map((row) => (
      row.request_id === requestId && row.quality_score === null
        ? { ...row, quality_score: score }
        : row
    )));
  }
}

function todayISOLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function newRequestId(): string {
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `llm_${randomId}`;
}

const PREVIEW_USAGE_KEY = "llm_usage_preview_rows";

function insertPreviewUsage(u: UsageInsert, requestId: string): void {
  const rows = previewUsageRows();
  const nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;
  const row: UsageRow = {
    id: nextId,
    ts: new Date().toISOString(),
    provider: u.provider,
    model: u.model,
    prompt_key: u.prompt_key,
    system_prompt: u.system_prompt,
    user_prompt: u.user_prompt,
    response_text: u.response_text,
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    latency_ms: u.latency_ms,
    cost_usd: u.cost_usd,
    success: u.success ? 1 : 0,
    error_msg: u.error_msg,
    request_id: requestId,
    profile_id: activeProfileId(),
    scenario: u.scenario ?? u.prompt_key,
    prompt_version: u.prompt_version ?? "v1",
    input_chars: u.user_prompt.length + (u.system_prompt?.length ?? 0),
    output_chars: u.response_text?.length ?? 0,
    quality_score: u.quality_score ?? null,
  };
  setPreviewUsageRows([row, ...rows].slice(0, 50));
}

function previewUsageRows(): UsageRow[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(PREVIEW_USAGE_KEY);
    if (!raw) return [];
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function setPreviewUsageRows(rows: UsageRow[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PREVIEW_USAGE_KEY, JSON.stringify(rows));
}

function sum(rows: UsageRow[], key: "cost_usd" | "input_tokens" | "output_tokens"): number {
  return rows.reduce((acc, row) => acc + (row[key] ?? 0), 0);
}
