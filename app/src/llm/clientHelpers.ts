/**
 * Shared helpers used by client.ts provider call sites.
 *
 * Exported separately so they can be unit-tested without pulling in Tauri imports
 * (client.ts imports @tauri-apps/plugin-http which is unavailable in tsx/node).
 */

import { LlmError, TIMEOUT_MS } from "./resilience";
import { sanitizeLlmError } from "./guardrails";

// ---------------------------------------------------------------------------
// errorFromResponse
// ---------------------------------------------------------------------------

/**
 * Build a typed LlmError from a non-ok HTTP response.
 *
 * @param providerName  Human-readable name for rawDetail (internal logging only)
 * @param status        HTTP status code
 * @param body          Raw response body text (will be sliced to 300 chars in rawDetail)
 * @param retryAfterHeader  Value of the Retry-After header, or null if absent
 */
export function errorFromResponse(
  providerName: string,
  status: number,
  body: string,
  retryAfterHeader: string | null,
): LlmError {
  const rawDetail = `${providerName} ${status}: ${sanitizeLlmError(body)}`;

  if (status === 429) {
    let retryAfterMs: number | undefined;
    if (retryAfterHeader !== null) {
      const seconds = Number(retryAfterHeader);
      if (!isNaN(seconds) && isFinite(seconds)) {
        retryAfterMs = seconds * 1000;
      }
    }
    return new LlmError({
      class: "rate-limit",
      message: "rate limit exceeded",
      rawDetail,
      displayKey: "llmErrRateLimit",
      status,
      retryAfterMs,
    });
  }

  if (status === 401) {
    return new LlmError({
      class: "auth",
      message: "authentication failed",
      rawDetail,
      displayKey: "llmErrAuth",
      status,
    });
  }

  return new LlmError({
    class: "other",
    message: "request failed",
    rawDetail,
    displayKey: "llmErrOther",
    status,
  });
}

// ---------------------------------------------------------------------------
// fetchWithTimeout
// ---------------------------------------------------------------------------

/**
 * Wraps a fetch call with a manual AbortController-based timeout.
 *
 * Uses a `timedOut` flag rather than relying on the abort-error name, because
 * @tauri-apps/plugin-http does NOT reject with a DOMException named "AbortError" —
 * it throws `new Error("Request cancelled")` or a Rust-side error on abort.
 * The flag approach is robust regardless of what the plugin rejects with.
 *
 * @param url        Request URL
 * @param init       Fetch init (signal will be injected — do NOT pass one in)
 * @param timeoutMs  Timeout in milliseconds (default: TIMEOUT_MS from resilience.ts)
 * @param fetchFn    Injectable fetch implementation (defaults to the Tauri fetch);
 *                   provide a fake in tests to avoid Tauri imports.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = TIMEOUT_MS,
  fetchFn: (url: string, init: RequestInit) => Promise<Response> = globalThis.fetch,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (timedOut) {
      throw new LlmError({
        class: "timeout",
        message: "request timed out",
        rawDetail: sanitizeLlmError(String(e instanceof Error ? e.message : e)),
        displayKey: "llmErrTimeout",
      });
    }
    // Network error (no status) — rethrow so callLlm's classify treats it as transient
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
