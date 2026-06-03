// How to run: npx tsx app/src/llm/__test_client_timeout.ts
// Tests for task-3: fetchWithTimeout + errorFromResponse in client.ts
// These are exported for test-only use; they are NOT part of the public API.

// @ts-ignore — node:assert/strict is not in browser tsconfig; valid at tsx runtime
import assert from "node:assert/strict";
import { LlmError } from "./resilience";
import { fetchWithTimeout, errorFromResponse } from "./clientHelpers";

// ---------------------------------------------------------------------------
// errorFromResponse — pure helper: (providerName, status, body, retryAfterHeader?) → LlmError
// ---------------------------------------------------------------------------

// 429 → class "rate-limit", displayKey "llmErrRateLimit", status 429
{
  const err = errorFromResponse("Gemini", 429, "rate limited", null);
  assert.ok(err instanceof LlmError, "errorFromResponse returns LlmError");
  assert.equal(err.class, "rate-limit", "429 → rate-limit class");
  assert.equal(err.status, 429, "429 → status 429");
  assert.equal(err.displayKey, "llmErrRateLimit", "429 → displayKey llmErrRateLimit");
  assert.ok(err.rawDetail.includes("Gemini"), "rawDetail includes provider name");
  assert.ok(err.rawDetail.includes("429"), "rawDetail includes status");
  assert.ok(err.rawDetail.includes("rate limited"), "rawDetail includes body snippet");
  console.log("PASS errorFromResponse 429 → rate-limit");
}

// 429 with numeric Retry-After: 5 → retryAfterMs = 5000
{
  const err = errorFromResponse("OpenAI", 429, "too many requests", "5");
  assert.equal(err.class, "rate-limit");
  assert.equal(err.retryAfterMs, 5000, "Retry-After: 5 → retryAfterMs 5000");
  console.log("PASS errorFromResponse 429 + Retry-After 5 → retryAfterMs 5000");
}

// 429 with non-numeric Retry-After: retryAfterMs should be undefined
{
  const err = errorFromResponse("OpenAI", 429, "too many requests", "Fri, 31 May 2026 00:00:00 GMT");
  assert.equal(err.class, "rate-limit");
  assert.equal(err.retryAfterMs, undefined, "non-numeric Retry-After → retryAfterMs undefined");
  console.log("PASS errorFromResponse 429 + date Retry-After → retryAfterMs undefined");
}

// 401 → class "auth", displayKey "llmErrAuth"
{
  const err = errorFromResponse("Anthropic", 401, "unauthorized", null);
  assert.equal(err.class, "auth", "401 → auth class");
  assert.equal(err.status, 401, "401 → status 401");
  assert.equal(err.displayKey, "llmErrAuth", "401 → displayKey llmErrAuth");
  console.log("PASS errorFromResponse 401 → auth");
}

// 500 → class "other", displayKey "llmErrOther"
{
  const err = errorFromResponse("DeepSeek", 500, "internal server error", null);
  assert.equal(err.class, "other", "500 → other class");
  assert.equal(err.status, 500, "500 → status 500");
  assert.equal(err.displayKey, "llmErrOther", "500 → displayKey llmErrOther");
  console.log("PASS errorFromResponse 500 → other");
}

// 400 → class "other", displayKey "llmErrOther"
{
  const err = errorFromResponse("Gemini", 400, "bad request", null);
  assert.equal(err.class, "other");
  assert.equal(err.displayKey, "llmErrOther");
  console.log("PASS errorFromResponse 400 → other");
}

// rawDetail is capped at 300 chars of body
{
  const longBody = "x".repeat(500);
  const err = errorFromResponse("Gemini", 500, longBody, null);
  // rawDetail format: "Gemini 500: <body.slice(0,300)>"
  // so rawDetail includes provider+status, and body portion is max 300 chars of the 500-char body
  assert.ok(!err.rawDetail.includes("x".repeat(301)), "rawDetail body capped at 300 chars");
  console.log("PASS errorFromResponse rawDetail body capped at 300 chars");
}

// ---------------------------------------------------------------------------
// fetchWithTimeout — wraps a fetch, adds AbortController + timedOut flag
// ---------------------------------------------------------------------------

// Happy path: fetch resolves quickly → returns the response, no timeout
{
  const mockResp = { ok: true, status: 200 } as any;
  const fakeFetch = async (_url: string, _init: any) => mockResp;
  const result = await fetchWithTimeout("http://example.com", {}, 5000, fakeFetch);
  assert.strictEqual(result, mockResp, "fetchWithTimeout passes through successful response");
  console.log("PASS fetchWithTimeout happy path returns response");
}

// Timeout path: fetch hangs longer than timeoutMs → throws LlmError with class "timeout"
{
  // Simulates a hang: waits until the AbortSignal fires, then rejects
  const fakeFetch = (_url: string, init: any): Promise<Response> =>
    new Promise((_resolve, reject) => {
      const sig: AbortSignal = init.signal;
      sig.addEventListener("abort", () => reject(new Error("Request cancelled")));
    });

  let threw: any = null;
  try {
    // use 50ms timeout so test is fast
    await fetchWithTimeout("http://example.com", {}, 50, fakeFetch);
  } catch (e) {
    threw = e;
  }
  assert.ok(threw !== null, "fetchWithTimeout should throw on timeout");
  assert.ok(threw instanceof LlmError, `fetchWithTimeout throws LlmError on timeout, got: ${threw?.constructor?.name}`);
  assert.equal(threw.class, "timeout", "fetchWithTimeout timeout → class 'timeout'");
  assert.equal(threw.displayKey, "llmErrTimeout", "fetchWithTimeout timeout → displayKey llmErrTimeout");
  console.log("PASS fetchWithTimeout hang → LlmError timeout");
}

// Non-timeout fetch error: reject with a network error → re-thrown as-is (not LlmError)
{
  const netErr = new TypeError("Failed to fetch");
  const fakeFetch = async (_url: string, _init: any): Promise<Response> => { throw netErr; };

  let threw: any = null;
  try {
    await fetchWithTimeout("http://example.com", {}, 5000, fakeFetch);
  } catch (e) {
    threw = e;
  }
  assert.ok(threw !== null, "fetchWithTimeout should rethrow network errors");
  assert.ok(!(threw instanceof LlmError), "network error is NOT wrapped in LlmError (rethrown raw for classify in callLlm)");
  assert.strictEqual(threw, netErr, "same error instance rethrown");
  console.log("PASS fetchWithTimeout network error rethrown as-is");
}

// signal is passed into fetch init
{
  let capturedSignal: AbortSignal | undefined;
  const fakeFetch = async (_url: string, init: any): Promise<Response> => {
    capturedSignal = init.signal;
    return { ok: true, status: 200 } as any;
  };
  await fetchWithTimeout("http://example.com", { method: "POST" }, 5000, fakeFetch);
  assert.ok(capturedSignal instanceof AbortSignal, "fetchWithTimeout passes AbortSignal to fetch");
  console.log("PASS fetchWithTimeout passes AbortSignal to fetch init");
}

console.log("\nAll task-3 tests passed.");
