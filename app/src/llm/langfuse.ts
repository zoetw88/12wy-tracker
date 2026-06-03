const env = import.meta.env as any;
const HOST = env.VITE_LANGFUSE_HOST as string | undefined;
const PUBLIC_KEY = env.VITE_LANGFUSE_PUBLIC_KEY as string | undefined;
const SECRET_KEY = env.VITE_LANGFUSE_SECRET_KEY as string | undefined;

export const langfuseEnabled = !!(env.DEV && HOST && PUBLIC_KEY && SECRET_KEY);

export interface LlmTrace {
  promptKey: string;
  scenario?: string;
  promptVersion?: string;
  provider: string;
  model: string;
  system?: string | null;
  user: string;
  output: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  success: boolean;
  errorMsg?: string | null;
  startTime: string; // ISO string
  endTime: string;   // ISO string
}

export function traceLlmCall(t: LlmTrace): void {
  if (!langfuseEnabled) return;
  void send(t).catch(() => {}); // never throw into the caller
}

async function send(t: LlmTrace): Promise<void> {
  const now = new Date().toISOString();
  const traceId = globalThis.crypto.randomUUID();
  const genId = globalThis.crypto.randomUUID();

  const body = {
    batch: [
      {
        id: globalThis.crypto.randomUUID(),
        type: "trace-create",
        timestamp: now,
        body: {
          id: traceId,
          name: t.promptKey,
          timestamp: t.startTime,
          input: t.system
            ? { system: t.system, user: t.user }
            : { user: t.user },
          output: t.output,
          metadata: {
            scenario: t.scenario,
            promptVersion: t.promptVersion,
            provider: t.provider,
            model: t.model,
            costUsd: t.costUsd,
            latencyMs: t.latencyMs,
          },
          tags: [t.promptKey, t.scenario].filter(Boolean),
        },
      },
      {
        id: globalThis.crypto.randomUUID(),
        type: "generation-create",
        timestamp: now,
        body: {
          id: genId,
          traceId: traceId,
          name: t.promptKey,
          model: t.model,
          input: t.system
            ? [
                { role: "system", content: t.system },
                { role: "user", content: t.user },
              ]
            : [{ role: "user", content: t.user }],
          output: t.output,
          usage: {
            input: t.inputTokens,
            output: t.outputTokens,
            total: t.inputTokens + t.outputTokens,
            unit: "TOKENS",
          },
          startTime: t.startTime,
          endTime: t.endTime,
          level: t.success ? "DEFAULT" : "ERROR",
          statusMessage: t.errorMsg ?? undefined,
          metadata: {
            costUsd: t.costUsd,
            latencyMs: t.latencyMs,
            provider: t.provider,
            promptVersion: t.promptVersion,
          },
        },
      },
    ],
  };

  await globalThis.fetch(`${HOST}/api/public/ingestion`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + btoa(`${PUBLIC_KEY}:${SECRET_KEY}`),
    },
    body: JSON.stringify(body),
  });
}
