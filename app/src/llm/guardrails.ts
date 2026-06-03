export const MAX_LLM_INPUT_CHARS = 60_000;
export const MAX_LLM_OUTPUT_CHARS = 20_000;
export const MAX_LLM_ERROR_CHARS = 300;

const TRUNCATED = "\n\n[truncated by local LLM guardrail]";

export function sanitizeLlmInput(value: string | null | undefined): string {
  return clamp(cleanText(value ?? ""), MAX_LLM_INPUT_CHARS);
}

export function sanitizeLlmOutput(value: string | null | undefined): string {
  return clamp(cleanText(value ?? ""), MAX_LLM_OUTPUT_CHARS);
}

export function sanitizeLlmError(value: string | null | undefined): string {
  return clamp(cleanText(value ?? ""), MAX_LLM_ERROR_CHARS);
}

export function normalizeLlmRequest<T extends { system?: string; user: string }>(req: T): T {
  return {
    ...req,
    system: req.system === undefined ? undefined : sanitizeLlmInput(req.system),
    user: sanitizeLlmInput(req.user),
  };
}

function cleanText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, "");
}

function clamp(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars) + TRUNCATED;
}
