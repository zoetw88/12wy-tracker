import { fetch } from "@tauri-apps/plugin-http";
import {
  ProviderConfig, ProviderId, PromptKey,
  PROVIDERS, findProvider, findModel, computeCost,
} from "./providers";
import { insertUsage } from "./usage";
import { traceLlmCall } from "./langfuse";
import { fetchWithTimeout, errorFromResponse } from "./clientHelpers";
import { LlmError, MAX_RETRIES, nextRetryDelayMs } from "./resilience";
import { normalizeLlmRequest, sanitizeLlmError, sanitizeLlmOutput } from "./guardrails";
import { assertLlmBudgetAllowsCall } from "./budget";
import { resolvePromptVersion } from "./promptRegistry";

export interface LlmRequest {
  promptKey: PromptKey;
  system?: string;
  user: string;
  responseFormat?: "text" | "json";
  maxOutputTokens?: number;
  temperature?: number;
  /** Optional grouping label for usage/Langfuse (defaults to promptKey). */
  scenario?: string;
  /** Optional prompt version tag for comparing prompt iterations in Langfuse. */
  promptVersion?: string;
}

export interface LlmResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUSD: number;
  provider: ProviderId;
  model: string;
  raw: any;
  requestId: string;
}

// ---------- Active selection ----------
export function getActiveProvider(): ProviderId {
  return (localStorage.getItem("llm_active_provider") as ProviderId) || "gemini";
}
export function setActiveProvider(p: ProviderId) {
  localStorage.setItem("llm_active_provider", p);
}
export function getActiveModel(provider?: ProviderId): string {
  const p = provider ?? getActiveProvider();
  return localStorage.getItem(`llm_active_model_${p}`) || findProvider(p).defaultModel;
}
export function setActiveModel(provider: ProviderId, model: string) {
  localStorage.setItem(`llm_active_model_${provider}`, model);
}

export function getKey(provider: ProviderId): string {
  return localStorage.getItem(findProvider(provider).apiKeyStorage) || "";
}
export function setKey(provider: ProviderId, key: string) {
  localStorage.setItem(findProvider(provider).apiKeyStorage, key);
}

// ---------- Adapter: call any provider ----------
export async function callLlm(
  req: LlmRequest,
  override?: { provider?: ProviderId; model?: string }
): Promise<LlmResponse> {
  const safeReq = normalizeLlmRequest({
    ...req,
    promptVersion: resolvePromptVersion(req.promptKey, req.promptVersion),
  });
  const providerId = override?.provider ?? getActiveProvider();
  const provider = findProvider(providerId);
  const model = override?.model ?? getActiveModel(providerId);
  if (!findModel(providerId, model)) {
    // tolerate non-registered models (e.g. custom Ollama)
  }

  const apiKey = getKey(providerId);
  if (provider.needsKey && !apiKey) {
    const rawDetail = `${provider.name} API key 未設定 (Settings 頁面)`;
    const llmErr = new LlmError({
      class: "auth",
      message: rawDetail,
      rawDetail,
      displayKey: "llmErrAuth",
    });
    await logFailure(providerId, model, safeReq, rawDetail);
    throw llmErr;
  }

  try {
    await assertLlmBudgetAllowsCall(providerId);
  } catch (e) {
    const detail = e instanceof LlmError ? e.rawDetail : String(e);
    await logFailure(providerId, model, safeReq, detail);
    throw e;
  }

  // ---------------------------------------------------------------------------
  // Attempt loop — max MAX_RETRIES+1 total attempts (0-based: 0, 1, 2)
  //
  // Usage-logging contract (per-attempt): each iteration writes EXACTLY ONE
  // llm_usage row — a failure row in the catch (one per failed attempt) or the
  // single success row on the success path. So a 429-then-success call yields
  // 2 rows (1 failure + 1 success); 3 failed transient attempts yield 3 failure
  // rows. The returned LlmResponse.requestId is ALWAYS the success row's id
  // (the rating feature anchors on it). error_msg carries internal-only raw
  // detail (LlmError.rawDetail) — never surfaced to the UI.
  // ---------------------------------------------------------------------------
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const t0 = performance.now();
    const startTime = new Date().toISOString();
    let raw: any;
    let text: string = "";
    let inTok = 0;
    let outTok = 0;

    try {
      if (provider.apiCompat === "gemini") {
        const r = await callGemini(provider, apiKey, model, safeReq);
        raw = r.raw; text = sanitizeLlmOutput(r.text); inTok = r.inTok; outTok = r.outTok;
      } else if (provider.apiCompat === "openai") {
        const r = await callOpenAICompat(provider, apiKey, model, safeReq);
        raw = r.raw; text = sanitizeLlmOutput(r.text); inTok = r.inTok; outTok = r.outTok;
      } else if (provider.apiCompat === "anthropic") {
        const r = await callAnthropic(provider, apiKey, model, safeReq);
        raw = r.raw; text = sanitizeLlmOutput(r.text); inTok = r.inTok; outTok = r.outTok;
      } else {
        throw new LlmError({
          class: "other",
          message: "unsupported apiCompat",
          rawDetail: `unsupported apiCompat: ${provider.apiCompat}`,
          displayKey: "llmErrOther",
        });
      }
    } catch (e: unknown) {
      // --- Per-attempt failure logging ---
      const latency = Math.round(performance.now() - t0);
      const endTime = new Date().toISOString();

      // Internal-only raw detail: use LlmError.rawDetail if available, else e.message
      const internalDetail =
        e instanceof LlmError ? e.rawDetail
        : (e instanceof Error ? e.message : String(e));
      const safeInternalDetail = sanitizeLlmError(internalDetail);

      await insertUsage({
        provider: providerId, model, prompt_key: safeReq.promptKey,
        system_prompt: safeReq.system ?? null, user_prompt: safeReq.user,
        response_text: null,
        input_tokens: 0, output_tokens: 0,
        latency_ms: latency, cost_usd: 0,
        success: false, error_msg: safeInternalDetail,
        scenario: safeReq.scenario, prompt_version: safeReq.promptVersion,
      });
      traceLlmCall({
        promptKey: safeReq.promptKey,
        scenario: safeReq.scenario,
        promptVersion: safeReq.promptVersion,
        provider: providerId, model,
        system: safeReq.system ?? null, user: safeReq.user,
        output: "",
        inputTokens: 0, outputTokens: 0,
        costUsd: 0, latencyMs: latency,
        success: false, errorMsg: safeInternalDetail,
        startTime, endTime,
      });

      // Decide whether to retry or stop
      const wait = nextRetryDelayMs(e, attempt);
      if (wait === null) {
        // Stop — throw an LlmError (wrap raw errors so callLlm always throws LlmError)
        if (e instanceof LlmError) throw e;
        // Raw network error or unknown → wrap as "other". rawDetail keeps the raw
        // text for internal logging; message stays sanitized so LlmError.message is
        // NEVER raw upstream text (anything reading .message, e.g. Settings, is safe).
        const rawDetail = sanitizeLlmError(e instanceof Error ? e.message : String(e));
        throw new LlmError({
          class: "other",
          message: "llm call failed",
          rawDetail,
          displayKey: "llmErrOther",
        });
      }

      // Transient — wait and try again
      await new Promise<void>((r) => setTimeout(r, wait));
      continue;
    }

    // --- SUCCESS path ---
    const latencyMs = Math.round(performance.now() - t0);
    const endTime = new Date().toISOString();
    const costUSD = computeCost(providerId, model, inTok, outTok);

    const requestId = await insertUsage({
      provider: providerId, model, prompt_key: safeReq.promptKey,
      system_prompt: safeReq.system ?? null, user_prompt: safeReq.user,
      response_text: text,
      input_tokens: inTok, output_tokens: outTok,
      latency_ms: latencyMs, cost_usd: costUSD,
      success: true, error_msg: null,
      scenario: safeReq.scenario, prompt_version: safeReq.promptVersion,
    });

    traceLlmCall({
      promptKey: safeReq.promptKey,
      scenario: safeReq.scenario,
      promptVersion: safeReq.promptVersion,
      provider: providerId, model,
      system: safeReq.system ?? null, user: safeReq.user,
      output: text,
      inputTokens: inTok, outputTokens: outTok,
      costUsd: costUSD, latencyMs,
      success: true, errorMsg: null,
      startTime, endTime,
    });

    return { text, inputTokens: inTok, outputTokens: outTok, latencyMs, costUSD,
             provider: providerId, model, raw, requestId };
  }

  // Should never reach here (loop always returns or throws), but TypeScript needs it
  throw new LlmError({
    class: "other",
    message: "retry loop exhausted without result",
    rawDetail: "retry loop exhausted without result",
    displayKey: "llmErrOther",
  });
}

async function logFailure(provider: ProviderId, model: string, req: LlmRequest, err: string) {
  try {
    await insertUsage({
      provider, model, prompt_key: req.promptKey,
      system_prompt: req.system ?? null, user_prompt: req.user,
      response_text: null,
      input_tokens: 0, output_tokens: 0,
      latency_ms: 0, cost_usd: 0,
      success: false, error_msg: sanitizeLlmError(err),
    });
  } catch {}
}

// ---------- Gemini ----------
async function callGemini(p: ProviderConfig, key: string, model: string, req: LlmRequest) {
  const url = `${p.baseUrl}/models/${model}:generateContent?key=${key}`;
  const body: any = {
    contents: [{ role: "user", parts: [{ text: req.user }] }],
  };
  if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
  body.generationConfig = {};
  if (req.responseFormat === "json") body.generationConfig.responseMimeType = "application/json";
  if (req.maxOutputTokens) body.generationConfig.maxOutputTokens = req.maxOutputTokens;
  if (req.temperature !== undefined) body.generationConfig.temperature = req.temperature;

  const r = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, undefined, fetch as any);
  if (!r.ok) {
    const body_ = await r.text();
    throw errorFromResponse(p.name, r.status, body_, r.headers.get("Retry-After"));
  }
  const j = await r.json();
  const text = j?.candidates?.[0]?.content?.parts?.map((x: any) => x.text).join("") ?? "";
  const um = j?.usageMetadata ?? {};
  return {
    raw: j, text,
    inTok: um.promptTokenCount ?? 0,
    outTok: um.candidatesTokenCount ?? 0,
  };
}

// ---------- OpenAI-compatible (OpenAI, DeepSeek, Kimi, Ollama) ----------
async function callOpenAICompat(p: ProviderConfig, key: string, model: string, req: LlmRequest) {
  const url = `${p.baseUrl}/chat/completions`;
  const messages: any[] = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  messages.push({ role: "user", content: req.user });
  const body: any = { model, messages };
  if (req.responseFormat === "json") body.response_format = { type: "json_object" };
  if (req.maxOutputTokens) body.max_tokens = req.maxOutputTokens;
  if (req.temperature !== undefined) body.temperature = req.temperature;

  const headers: any = { "Content-Type": "application/json" };
  if (p.needsKey) headers.Authorization = `Bearer ${key}`;

  const r = await fetchWithTimeout(url, { method: "POST", headers, body: JSON.stringify(body) }, undefined, fetch as any);
  if (!r.ok) {
    const body_ = await r.text();
    throw errorFromResponse(p.name, r.status, body_, r.headers.get("Retry-After"));
  }
  const j = await r.json();
  const text = j?.choices?.[0]?.message?.content ?? "";
  const u = j?.usage ?? {};
  return {
    raw: j, text,
    inTok: u.prompt_tokens ?? 0,
    outTok: u.completion_tokens ?? 0,
  };
}

// ---------- Anthropic ----------
async function callAnthropic(p: ProviderConfig, key: string, model: string, req: LlmRequest) {
  const url = `${p.baseUrl}/messages`;
  const body: any = {
    model,
    max_tokens: req.maxOutputTokens ?? 2048,
    messages: [{ role: "user", content: req.user }],
  };
  if (req.system) body.system = req.system;
  if (req.temperature !== undefined) body.temperature = req.temperature;

  const r = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  }, undefined, fetch as any);
  if (!r.ok) {
    const body_ = await r.text();
    throw errorFromResponse(p.name, r.status, body_, r.headers.get("Retry-After"));
  }
  const j = await r.json();
  const text = j?.content?.map((x: any) => x.text).filter(Boolean).join("") ?? "";
  const u = j?.usage ?? {};
  return {
    raw: j, text,
    inTok: u.input_tokens ?? 0,
    outTok: u.output_tokens ?? 0,
  };
}

// ---------- Convenience ----------
export async function testActiveProvider(): Promise<LlmResponse> {
  return await callLlm({
    promptKey: "test",
    user: "回覆兩個字: 已通",
    maxOutputTokens: 16,
  });
}

export { PROVIDERS };
