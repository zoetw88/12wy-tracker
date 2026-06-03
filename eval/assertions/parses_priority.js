/**
 * eval/assertions/parses_priority.js
 *
 * Assertion: the model output for the PRIORITY prompt can be parsed by the
 * REAL app parser (parsePriorityResponse), and returns at least one item.
 *
 * This ensures eval parse-rate == production behavior — same code path.
 *
 * Parser compile step:
 *   `npm run eval` (in eval/) calls `npm run build:parser` first, which runs:
 *     npx esbuild ../app/src/llm/parse.ts --bundle=false --platform=node \
 *                 --format=esm --outdir=.gen
 *   This produces eval/.gen/parse.js (gitignored). The import below targets
 *   that compiled output, so Node's standard ESM resolver handles it without
 *   any tsx or --experimental-strip-types flags.
 *
 *   Any change to app/src/llm/parse.ts is automatically reflected on the next
 *   `npm run eval` run — no drift between eval and production.
 *
 *   The original .ts import caveat (Unknown file extension '.ts') is now FIXED
 *   via the build:parser step. No manual action required.
 */

// Path from assertions/ up one level to .gen/ (produced by build:parser).
import { parsePriorityResponse } from "../.gen/parse.js";

export default function (output) {
  try {
    const raw = typeof output === "string" ? output : JSON.stringify(output);
    const arr = parsePriorityResponse(raw);
    return {
      pass: arr.length > 0,
      score: arr.length > 0 ? 1 : 0,
      reason: arr.length > 0 ? `parsed ${arr.length} item(s)` : "parse succeeded but returned empty array",
    };
  } catch (e) {
    return {
      pass: false,
      score: 0,
      reason: "threw: " + e.message,
    };
  }
}
