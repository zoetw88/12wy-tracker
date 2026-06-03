// How to run: npx tsx app/src/llm/__test_resilience.ts
// Red gate: `cd app && npx tsc --noEmit` fails with TS2307 "Cannot find module './resilience'"
// because app/src/llm/resilience.ts does not exist yet.

// @ts-ignore — node:assert/strict is not in browser tsconfig; valid at tsx runtime
import assert from "node:assert/strict";
import {
  classify, isTransient, backoffDelay, JITTER_MAX,
  nextRetryDelayMs,
  LlmError, MAX_RETRIES, RETRY_AFTER_CAP_MS,
} from "./resilience";

// ---------------------------------------------------------------------------
// Helpers to make typed errors with a numeric status
// ---------------------------------------------------------------------------
function httpErr(status: number, message = `HTTP ${status}`): Error {
  return Object.assign(new Error(message), { status });
}

function abortErr(): Error {
  return Object.assign(new Error("aborted"), { name: "AbortError" });
}

// ---------------------------------------------------------------------------
// classify(err)
// ---------------------------------------------------------------------------

// 429 → "rate-limit"
{
  const result = classify(httpErr(429));
  assert.equal(result.class, "rate-limit", "classify 429 → rate-limit");
  assert.ok(typeof result.rawDetail === "string", "classify 429 → rawDetail is string");
  console.log("PASS classify 429 → rate-limit");
}

// 401 → "auth"
{
  const result = classify(httpErr(401));
  assert.equal(result.class, "auth", "classify 401 → auth");
  console.log("PASS classify 401 → auth");
}

// AbortError → "timeout"
{
  const result = classify(abortErr());
  assert.equal(result.class, "timeout", "classify AbortError → timeout");
  console.log("PASS classify AbortError → timeout");
}

// 500 → "other"
{
  const result = classify(httpErr(500));
  assert.equal(result.class, "other", "classify 500 → other");
  console.log("PASS classify 500 → other");
}

// 400 → "other"
{
  const result = classify(httpErr(400));
  assert.equal(result.class, "other", "classify 400 → other");
  console.log("PASS classify 400 → other");
}

// plain Error (no status) → "other"
{
  const result = classify(new Error("something broke"));
  assert.equal(result.class, "other", "classify plain Error → other");
  console.log("PASS classify plain Error → other");
}

// rawDetail is exposed for internal logging
{
  const result = classify(httpErr(429, "rate limited detail"));
  assert.ok(result.rawDetail.length > 0, "classify exposes rawDetail");
  console.log("PASS classify exposes rawDetail");
}

// ---------------------------------------------------------------------------
// isTransient(err)
// ---------------------------------------------------------------------------

// 429 → true
{
  assert.equal(isTransient(httpErr(429)), true, "isTransient 429 → true");
  console.log("PASS isTransient 429 → true");
}

// 503 (5xx) → true
{
  assert.equal(isTransient(httpErr(503)), true, "isTransient 503 → true");
  console.log("PASS isTransient 503 → true");
}

// network error (TypeError, no status) → true
{
  const netErr = new TypeError("Failed to fetch");
  assert.equal(isTransient(netErr), true, "isTransient TypeError 'Failed to fetch' → true");
  console.log("PASS isTransient network TypeError → true");
}

// AbortError (timeout) → false
{
  assert.equal(isTransient(abortErr()), false, "isTransient AbortError → false");
  console.log("PASS isTransient AbortError → false");
}

// 401 → false
{
  assert.equal(isTransient(httpErr(401)), false, "isTransient 401 → false");
  console.log("PASS isTransient 401 → false");
}

// 400 → false
{
  assert.equal(isTransient(httpErr(400)), false, "isTransient 400 → false");
  console.log("PASS isTransient 400 → false");
}

// ---------------------------------------------------------------------------
// backoffDelay(attempt)
// ---------------------------------------------------------------------------

// Deterministic range assertions that hold regardless of jitter.
// JITTER_MAX is exported from resilience.ts; jitter is in [0, JITTER_MAX).
// backoffDelay(0): base=1000; range = [1000, 1000+JITTER_MAX)
// backoffDelay(1): base=2000; range = [2000, 2000+JITTER_MAX)
// Key assertions that are always true:
//   bd(0) >= 1000                        (floor)
//   bd(0) < 2000                         (ceiling — must be below bd(1) floor)
//   bd(1) >= 2000                        (floor — always above bd(0) ceiling)
//   bd(1) <= 2000 + JITTER_MAX           (ceiling)

{
  const bd0 = backoffDelay(0);
  assert.ok(bd0 >= 1000, `backoffDelay(0) >= 1000 (got ${bd0})`);
  assert.ok(bd0 < 2000, `backoffDelay(0) < 2000 (got ${bd0})`);
  assert.ok(bd0 <= 1000 + JITTER_MAX, `backoffDelay(0) <= 1000+JITTER_MAX (got ${bd0})`);
  console.log(`PASS backoffDelay(0) in [1000, 1000+${JITTER_MAX}) → ${bd0}`);
}

{
  const bd1 = backoffDelay(1);
  assert.ok(bd1 >= 2000, `backoffDelay(1) >= 2000 (got ${bd1})`);
  assert.ok(bd1 <= 2000 + JITTER_MAX, `backoffDelay(1) <= 2000+JITTER_MAX (got ${bd1})`);
  console.log(`PASS backoffDelay(1) in [2000, 2000+${JITTER_MAX}] → ${bd1}`);
}

// never negative
{
  for (let i = 0; i < 5; i++) {
    const d = backoffDelay(i);
    assert.ok(d >= 0, `backoffDelay(${i}) never negative (got ${d})`);
  }
  console.log("PASS backoffDelay never negative for attempts 0-4");
}

// ---------------------------------------------------------------------------
// nextRetryDelayMs(err, attempt)
// ---------------------------------------------------------------------------
// Helper to build a rate-limit LlmError with retryAfterMs
function rateLimitErr(retryAfterMs?: number): LlmError {
  return new LlmError({
    class: "rate-limit",
    message: "rate limit exceeded",
    rawDetail: "raw detail",
    displayKey: "llmErrRateLimit",
    status: 429,
    retryAfterMs,
  });
}

// transient 503 + attempt 0 → backoff number (>= 1000)
{
  const err503 = Object.assign(new Error("HTTP 503"), { status: 503 });
  const result = nextRetryDelayMs(err503, 0);
  assert.ok(result !== null, "nextRetryDelayMs(503, 0) → not null");
  assert.ok(typeof result === "number" && result >= 1000,
    `nextRetryDelayMs(503, 0) >= 1000 (got ${result})`);
  console.log(`PASS nextRetryDelayMs(503, 0) → ${result} (backoff range)`);
}

// transient 503 + attempt MAX_RETRIES (exhausted) → null
{
  const err503 = Object.assign(new Error("HTTP 503"), { status: 503 });
  const result = nextRetryDelayMs(err503, MAX_RETRIES);
  assert.equal(result, null,
    `nextRetryDelayMs(503, MAX_RETRIES=${MAX_RETRIES}) → null (exhausted)`);
  console.log(`PASS nextRetryDelayMs(503, ${MAX_RETRIES}) → null (exhausted)`);
}

// rate-limit with retryAfterMs=5000 + attempt 0 → 5000
{
  const result = nextRetryDelayMs(rateLimitErr(5000), 0);
  assert.equal(result, 5000,
    `nextRetryDelayMs(rate-limit retryAfterMs=5000, 0) → 5000`);
  console.log("PASS nextRetryDelayMs(rate-limit retryAfterMs=5000, 0) → 5000");
}

// rate-limit with retryAfterMs=60000 (exceeds cap 10s) → null
{
  const result = nextRetryDelayMs(rateLimitErr(60000), 0);
  assert.equal(result, null,
    `nextRetryDelayMs(rate-limit retryAfterMs=60000, 0) → null (exceeds cap ${RETRY_AFTER_CAP_MS}ms)`);
  console.log(`PASS nextRetryDelayMs(rate-limit retryAfterMs=60000, 0) → null (> ${RETRY_AFTER_CAP_MS}ms cap)`);
}

// LlmError timeout → null (timeout never retried)
{
  const timeoutErr = new LlmError({
    class: "timeout",
    message: "request timed out",
    rawDetail: "timed out detail",
    displayKey: "llmErrTimeout",
  });
  const result = nextRetryDelayMs(timeoutErr, 0);
  assert.equal(result, null, "nextRetryDelayMs(timeout, 0) → null");
  console.log("PASS nextRetryDelayMs(timeout LlmError, 0) → null");
}

// LlmError auth/401 → null (permanent, never retried)
{
  const authErr = new LlmError({
    class: "auth",
    message: "authentication failed",
    rawDetail: "401 unauthorized",
    displayKey: "llmErrAuth",
    status: 401,
  });
  const result = nextRetryDelayMs(authErr, 0);
  assert.equal(result, null, "nextRetryDelayMs(auth LlmError, 0) → null");
  console.log("PASS nextRetryDelayMs(auth LlmError, 0) → null");
}

console.log("\nAll tests passed.");
