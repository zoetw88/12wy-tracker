import { PrioritySuggestion } from "./prompts";
import { sanitizeLlmOutput } from "./guardrails";

export function parsePriorityResponse(raw: string): PrioritySuggestion[] {
  const safeRaw = sanitizeLlmOutput(raw);
  const normalize = (x: any): PrioritySuggestion | null =>
    x && typeof x.priority === "string"
      ? {
          priority: String(x.priority),
          reason: String(x.reason ?? ""),
          tag: x.tag ? String(x.tag) : undefined,
        }
      : null;

  // 1. Try the response as-is (best case: pure JSON)
  try {
    const arr = JSON.parse(safeRaw);
    if (Array.isArray(arr)) {
      const out = arr.map(normalize).filter((x): x is PrioritySuggestion => x !== null);
      if (out.length) return out;
    }
  } catch {}

  // 2. Strip markdown code fence if Gemini wrapped it
  const fenced = safeRaw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      const arr = JSON.parse(fenced[1]);
      if (Array.isArray(arr)) {
        const out = arr.map(normalize).filter((x): x is PrioritySuggestion => x !== null);
        if (out.length) return out;
      }
    } catch {}
  }

  // 3. Last resort: extract individual {priority: ...} objects even from a
  //    truncated array. Works if maxOutputTokens cut off mid-stream and
  //    we got 2 complete + 1 partial object back.
  const objects: PrioritySuggestion[] = [];
  const objRe = /\{[^{}]*?"priority"\s*:\s*"[^"]*"[^{}]*?\}/g;
  let m: RegExpExecArray | null;
  while ((m = objRe.exec(safeRaw)) !== null) {
    try {
      const norm = normalize(JSON.parse(m[0]));
      if (norm) objects.push(norm);
    } catch {}
  }
  if (objects.length) return objects;

  throw new Error("Cannot parse JSON:\n" + safeRaw.slice(0, 500));
}
