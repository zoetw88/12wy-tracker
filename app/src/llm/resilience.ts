/**
 * Pure resilience helpers — no side effects, no I/O, no Tauri imports.
 *
 * Defines:
 *   - LlmError: typed error shape providers will throw (task-2 adds constants + extends as needed)
 *   - classify(err): { class, rawDetail } — classifies any thrown value
 *   - isTransient(err): true for 429 / 5xx / network error; false for timeout & all 4xx
 *   - backoffDelay(attempt): exponential base (~1s, ~2s …) + bounded jitter
 *   - JITTER_MAX: exported so tests can assert deterministic ceiling
 */

// ---------------------------------------------------------------------------
// Error shape
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tunable constants (single source of truth — no scattered literals)
// ---------------------------------------------------------------------------

/** Per-request timeout (ms). Generous so normal long generations aren't falsely cut. */
export const TIMEOUT_MS = 30000;
/** Max automatic retries for TRANSIENT errors only (total attempts = MAX_RETRIES + 1). */
export const MAX_RETRIES = 2;
/** Upper bound on honoring a 429 Retry-After (ms); larger values → give up immediately. */
export const RETRY_AFTER_CAP_MS = 10000;
/** UI cooldown fallback (ms) when a rate-limit error carries no Retry-After. */
export const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 3000;

export type LlmErrorClass = "timeout" | "rate-limit" | "auth" | "other";

/**
 * Typed error the provider call sites will throw.
 * task-2 will add TIMEOUT_MS / MAX_RETRIES / RETRY_AFTER_CAP_MS constants
 * and may extend this class — the shape is intentionally minimal here.
 */
export class LlmError extends Error {
  /** Machine-readable error class (used by retry loop + UI) */
  readonly class: LlmErrorClass;
  /** HTTP status if available; absent for network / AbortError */
  readonly status?: number;
  /** Raw upstream detail — INTERNAL ONLY; never render in DOM */
  readonly rawDetail: string;
  /** i18n key for the sanitized user-facing message */
  readonly displayKey: string;
  /** For rate-limit: milliseconds the caller should wait before the next attempt */
  readonly retryAfterMs?: number;

  constructor(opts: {
    class: LlmErrorClass;
    message: string;
    rawDetail: string;
    displayKey: string;
    status?: number;
    retryAfterMs?: number;
  }) {
    super(opts.message);
    this.name = "LlmError";
    this.class = opts.class;
    this.rawDetail = opts.rawDetail;
    this.displayKey = opts.displayKey;
    this.status = opts.status;
    this.retryAfterMs = opts.retryAfterMs;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Extract a numeric HTTP status from an unknown thrown value, if present. */
function getStatus(err: unknown): number | undefined {
  if (err != null && typeof err === "object" && "status" in err) {
    const s = (err as Record<string, unknown>).status;
    if (typeof s === "number") return s;
  }
  return undefined;
}

/** Return true when the error is an AbortError (timeout or manual cancel). */
function isAbortError(err: unknown): boolean {
  if (err != null && typeof err === "object" && "name" in err) {
    return (err as { name: unknown }).name === "AbortError";
  }
  return false;
}

// ---------------------------------------------------------------------------
// classify
// ---------------------------------------------------------------------------

export interface ClassifyResult {
  class: LlmErrorClass;
  /** Raw upstream error text for internal logging only. */
  rawDetail: string;
}

/**
 * Classify any thrown value into a machine error class.
 *
 * Rules (in precedence order):
 *   1. AbortError → "timeout"
 *   2. status 429  → "rate-limit"
 *   3. status 401  → "auth"
 *   4. everything else (5xx, 400, no status, …) → "other"
 */
export function classify(err: unknown): ClassifyResult {
  const rawDetail =
    err instanceof Error ? err.message : String(err);

  if (isAbortError(err)) {
    return { class: "timeout", rawDetail };
  }

  const status = getStatus(err);

  if (status === 429) return { class: "rate-limit", rawDetail };
  if (status === 401) return { class: "auth", rawDetail };

  return { class: "other", rawDetail };
}

// ---------------------------------------------------------------------------
// isTransient
// ---------------------------------------------------------------------------

/**
 * Returns true iff the error is worth retrying automatically.
 *
 * Transient (retry):
 *   - HTTP 429 (rate-limit)
 *   - HTTP 5xx (server error)
 *   - Network error: TypeError with no status (e.g. "Failed to fetch")
 *
 * NOT transient (no retry):
 *   - AbortError / timeout
 *   - Any 4xx including 401 and 400
 */
export function isTransient(err: unknown): boolean {
  // AbortError (timeout) → never retry
  if (isAbortError(err)) return false;

  const status = getStatus(err);

  if (status !== undefined) {
    // 429 → transient
    if (status === 429) return true;
    // 5xx → transient
    if (status >= 500 && status <= 599) return true;
    // any other status (4xx etc.) → not transient
    return false;
  }

  // No status: detect network errors by type + message
  // TypeError with a network-y message (e.g. "Failed to fetch", "Network error")
  if (err instanceof TypeError) {
    const msg = err.message;
    if (/failed to fetch|network/i.test(msg)) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// backoffDelay
// ---------------------------------------------------------------------------

/**
 * Maximum random jitter added to the exponential base (milliseconds).
 * Exported so tests can assert a deterministic ceiling without over-constraining
 * the randomness.
 */
export const JITTER_MAX = 250;

/**
 * Exponential backoff with bounded jitter.
 *
 *   attempt 0 → base 1000 ms + jitter in [0, JITTER_MAX)
 *   attempt 1 → base 2000 ms + jitter in [0, JITTER_MAX)
 *   attempt n → base 1000 * 2^n ms + jitter
 *
 * Always returns a non-negative number.
 */
export function backoffDelay(attempt: number): number {
  const base = 1000 * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * JITTER_MAX);
  return base + jitter;
}

// ---------------------------------------------------------------------------
// nextRetryDelayMs
// ---------------------------------------------------------------------------

/**
 * Pure retry-decision helper.
 *
 * Returns the milliseconds to wait before the NEXT attempt,
 * or `null` meaning STOP (do not retry).
 *
 * Rules (in precedence order):
 *   1. attempt >= MAX_RETRIES → null (exhausted; attempt is 0-based,
 *      so attempts 0 and 1 may retry; attempt 2 == MAX_RETRIES → stop)
 *   2. !isTransient(err) → null (timeout / 401 / 400 / other permanent)
 *   3. err is rate-limit AND carries retryAfterMs:
 *      - if retryAfterMs > RETRY_AFTER_CAP_MS → null (give up, too long)
 *      - else → return retryAfterMs
 *   4. otherwise (429 without Retry-After, 5xx, network) → return backoffDelay(attempt)
 */
export function nextRetryDelayMs(err: unknown, attempt: number): number | null {
  // Rule 1: exhausted
  if (attempt >= MAX_RETRIES) return null;

  // Rule 2: not transient → never retry
  if (!isTransient(err)) return null;

  // Rule 3: rate-limit with Retry-After header
  if (err instanceof LlmError && err.class === "rate-limit" && err.retryAfterMs !== undefined) {
    if (err.retryAfterMs > RETRY_AFTER_CAP_MS) return null;
    return err.retryAfterMs;
  }

  // Rule 4: backoff (429 without Retry-After, 5xx, network error)
  return backoffDelay(attempt);
}
