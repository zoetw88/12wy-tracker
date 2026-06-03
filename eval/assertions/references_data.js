/**
 * eval/assertions/references_data.js
 *
 * Assertion: the model output references at least one distinctive value from
 * the test fixture's vars (e.g. a goal name, a date string, a label).
 *
 * This is a heuristic — it guards against "hallucinated" or generic responses
 * that ignore the specific context provided in the prompt vars.
 *
 * Strategy:
 *   1. Collect top-level string vars with length 2–40.
 *   2. Heuristic extension: if a top-level var is a plain object (e.g. the
 *      goal-design fixture's `goal` var), pull any short string fields
 *      (name / title / why / target_text — whatever exists, length 2..40)
 *      into needles too. This gives goal-design cases a real check rather
 *      than always skipping. Only one level deep; no recursion beyond that.
 *   3. If needles is still empty after both steps (no checkable data at all),
 *      return pass:true with score:1 and a "skipped" reason — this is a soft
 *      signal, not a hard assertion failure, so promptfoo does not mark the
 *      test as failed.
 *
 * Limitations:
 *   - Does not recurse into arrays or deeply nested structures.
 *   - If the output is a JSON blob the raw JSON string is searched, which
 *     may produce false positives if the output echoes input keys.
 */

// Short string field names that are worth pulling from nested objects as
// representative identifiers (heuristic — not exhaustive).
const OBJECT_STRING_FIELDS = ["name", "title", "why", "target_text", "label", "description"];

export default function (output, context) {
  const vars = context?.vars || {};
  const needles = [];

  for (const k of Object.keys(vars)) {
    const v = vars[k];
    if (typeof v === "string" && v.length >= 2 && v.length <= 40) {
      // Top-level string var — use directly.
      needles.push(v);
    } else if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      // Top-level object var (e.g. vars.goal = { name, why, ... }).
      // Pull short string fields as representative needles (heuristic).
      for (const field of OBJECT_STRING_FIELDS) {
        const fv = v[field];
        if (typeof fv === "string" && fv.length >= 2 && fv.length <= 40) {
          needles.push(fv);
        }
      }
    }
  }

  // No checkable data found at all — skip rather than fail hard.
  // Returning pass:true here treats this as a soft/skipped signal so promptfoo
  // does not count it as an assertion failure for fixtures with no string vars.
  if (needles.length === 0) {
    return { pass: true, score: 1, reason: "no string vars to check — skipped" };
  }

  const s = String(output);
  const hit = needles.some((n) => s.includes(n));

  return {
    pass: hit,
    score: hit ? 1 : 0,
    reason: hit
      ? "output references a fixture value"
      : "no fixture value referenced in output",
  };
}
