/**
 * eval/assertions/is_zh.js
 *
 * Assertion: the model output is predominantly Chinese (Traditional or Simplified).
 *
 * Method: CJK Unified Ideographs ratio (U+4E00–U+9FFF).
 * Threshold: ratio > 0.2 (i.e. ≥20% of characters are CJK).
 *
 * Tuning notes:
 *   - 0.2 is intentionally loose — prompts contain English keys/numbers
 *     alongside Chinese prose. Typical Chinese output hovers around 0.35–0.55.
 *   - Raise to 0.3 if you want stricter enforcement.
 *   - Lower to 0.1 if the output format is JSON-heavy (lots of ASCII brackets).
 *   - The score is the raw ratio, so you can filter results by score in the UI.
 */

export default function (output) {
  const s = String(output);
  const cjk = (s.match(/[一-鿿]/g) || []).length;
  const ratio = s.length ? cjk / s.length : 0;
  return {
    pass: ratio > 0.2,
    score: ratio,
    reason: `CJK ratio ${ratio.toFixed(2)} (threshold 0.20)`,
  };
}
