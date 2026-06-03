// How to run: npx tsx app/src/__test_i18n_llm.ts
// Red gate: keys llmErrTimeout/llmErrRateLimit/llmErrAuth/llmErrOther/llmRetryIn
// do not exist in i18n.ts yet → tr() returns undefined → assertions fail.

// @ts-ignore — node:assert/strict is not in browser tsconfig; valid at tsx runtime
import assert from "node:assert/strict";
import { tr } from "./i18n";
import type { Lang } from "./i18n";

const NEW_KEYS = [
  "llmErrTimeout",
  "llmErrRateLimit",
  "llmErrAuth",
  "llmErrOther",
  "llmRetryIn",
] as const;

const LANGS: Lang[] = ["zh", "en", "fr"];

// Each key must exist in all 3 langs and return a non-empty string.
for (const key of NEW_KEYS) {
  for (const lang of LANGS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = tr(lang, key as any);
    assert.ok(
      typeof value === "string" && value.length > 0,
      `MISSING key "${key}" in lang "${lang}" — got: ${JSON.stringify(value)}`
    );
    console.log(`PASS  tr("${lang}", "${key}") → "${value}"`);
  }
}

// llmRetryIn must interpolate {sec} in all 3 langs.
for (const lang of LANGS) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const value = tr(lang, "llmRetryIn" as any, { sec: "5" });
  assert.ok(
    value.includes("5"),
    `llmRetryIn in "${lang}" should contain interpolated sec=5, got: "${value}"`
  );
  assert.ok(
    !value.includes("{sec}"),
    `llmRetryIn in "${lang}" still has un-interpolated {sec}: "${value}"`
  );
  console.log(`PASS  tr("${lang}", "llmRetryIn", {sec:"5"}) → "${value}"`);
}

console.log("\nAll i18n LLM key tests passed.");
