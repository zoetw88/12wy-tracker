// How to run: npx tsx app/src/llm/__test_parse.ts
// Red gate: `cd app && npx tsc --noEmit` fails with TS2307 "Cannot find module './parse'"
// because app/src/llm/parse.ts does not exist yet.

// @ts-ignore — node:assert/strict is not in browser tsconfig; valid at tsx runtime
import assert from "node:assert/strict";
import { parsePriorityResponse } from "./parse";

// Case 1: valid JSON array → length and fields correct
{
  const raw = JSON.stringify([
    { priority: "exercise", reason: "keep health", tag: "fitness" },
    { priority: "read", reason: "learn more", tag: "education" },
  ]);
  const result = parsePriorityResponse(raw);
  assert.equal(result.length, 2, "Case 1: should return 2 items");
  assert.equal(result[0].priority, "exercise");
  assert.equal(result[0].reason, "keep health");
  assert.equal(result[0].tag, "fitness");
  assert.equal(result[1].priority, "read");
  console.log("PASS Case 1: valid JSON array");
}

// Case 2: fenced ```json block → parsed correctly
{
  const raw = "```json\n[\n  {\"priority\":\"run\",\"reason\":\"health\",\"tag\":\"sport\"}\n]\n```";
  const result = parsePriorityResponse(raw);
  assert.equal(result.length, 1, "Case 2: should return 1 item from fenced block");
  assert.equal(result[0].priority, "run");
  assert.equal(result[0].reason, "health");
  assert.equal(result[0].tag, "sport");
  console.log("PASS Case 2: fenced ```json block");
}

// Case 3: missing reason → reason === ""; absent tag → tag === undefined
{
  const raw = JSON.stringify([
    { priority: "sleep" },
  ]);
  const result = parsePriorityResponse(raw);
  assert.equal(result.length, 1, "Case 3: should return 1 item");
  assert.equal(result[0].priority, "sleep");
  assert.equal(result[0].reason, "", "Case 3: missing reason should be empty string");
  assert.equal(result[0].tag, undefined, "Case 3: absent tag should be undefined");
  console.log("PASS Case 3: missing reason and absent tag");
}

// Case 4: malformed/non-JSON string → throws (NOT returns [])
{
  assert.throws(
    () => parsePriorityResponse("not json"),
    /Cannot parse JSON/,
    "Case 4: non-JSON should throw"
  );
  console.log("PASS Case 4: non-JSON string throws");
}

// Case 5: truncated array (strategy 3 — regex individual objects)
{
  // Simulates a response cut off mid-stream, with complete objects before the truncation
  const raw = '[{"priority":"alpha","reason":"first"},{"priority":"beta","reason":"second"';
  const result = parsePriorityResponse(raw);
  assert.ok(result.length >= 1, "Case 5: should extract at least one object from truncated array");
  assert.equal(result[0].priority, "alpha");
  console.log("PASS Case 5: truncated array via regex strategy");
}

console.log("\nAll tests passed.");
