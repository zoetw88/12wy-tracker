#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const casesPath = join(root, "preferences", "coach_preference_cases.json");
const reportsDir = join(root, "reports");
const jsonReportPath = join(reportsDir, "preference-sanity.latest.json");
const mdReportPath = join(reportsDir, "preference-sanity.latest.md");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const JUDGE_MODEL = process.env.PREFERENCE_JUDGE_MODEL || "gpt-4o-mini";
const API_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required for preference sanity judge");
}

const dataset = JSON.parse(readFileSync(casesPath, "utf8"));
validateDataset(dataset);

const startedAt = Date.now();
const results = [];
for (let index = 0; index < dataset.cases.length; index += 1) {
  const item = dataset.cases[index];
  const preferredIsA = stableBoolean(item.id);
  const optionA = preferredIsA ? item.preferred_output : item.rejected_output;
  const optionB = preferredIsA ? item.rejected_output : item.preferred_output;
  const expected = preferredIsA ? "A" : "B";
  const judge = await judgePreference(item, optionA, optionB);
  const selected = normalizeChoice(judge.choice);
  results.push({
    case_id: item.id,
    prompt_key: item.prompt_key,
    source: item.source,
    regression: Boolean(item.regression),
    expected,
    selected,
    pass: selected === expected,
    rationale: judge.rationale,
  });
}

const passed = results.filter((row) => row.pass).length;
const regressionResults = results.filter((row) => row.regression);
const regressionPassed = regressionResults.filter((row) => row.pass).length;
const report = {
  schema: "12wy-tracker.preference-sanity-report",
  version: 1,
  generated_at: new Date().toISOString(),
  source_dataset: "eval/preferences/coach_preference_cases.json",
  judge: {
    provider: "openai-compatible",
    model: JUDGE_MODEL,
    api_base: API_BASE,
  },
  summary: {
    total_cases: results.length,
    passed,
    agreement_rate: ratio(passed, results.length),
    regression_cases: regressionResults.length,
    regression_passed: regressionPassed,
    regression_pass_rate: ratio(regressionPassed, regressionResults.length),
    latency_ms: Date.now() - startedAt,
  },
  results,
};

mkdirSync(reportsDir, { recursive: true });
writeFileSync(jsonReportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
writeFileSync(mdReportPath, renderMarkdown(report), "utf8");

console.log(`Wrote ${jsonReportPath}`);
console.log(`Wrote ${mdReportPath}`);
console.log(`Agreement: ${(report.summary.agreement_rate * 100).toFixed(1)}%`);

if (report.summary.regression_pass_rate < 0.95) {
  process.exitCode = 1;
}

function validateDataset(value) {
  if (value.schema !== "12wy-tracker.preference-cases") {
    throw new Error("Invalid preference dataset schema");
  }
  if (!Array.isArray(value.cases) || value.cases.length === 0) {
    throw new Error("Preference dataset has no cases");
  }
}

async function judgePreference(item, optionA, optionB) {
  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are a strict preference judge for a 12 Week Year coaching app.",
            "Choose which output is better for the user's input context.",
            "Prefer specificity, direct action, use of user data, 12 Week Year fit, and avoidance of generic encouragement.",
            "Return JSON only: {\"choice\":\"A\"|\"B\",\"rationale\":\"short reason\"}.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            case_id: item.id,
            prompt_key: item.prompt_key,
            input_context: item.input_context,
            preference_rubric: item.rubric,
            option_a: optionA,
            option_b: optionB,
          }, null, 2),
        },
      ],
    }),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Judge request failed: ${response.status} ${JSON.stringify(json)}`);
  }
  const text = json?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error(`Judge response missing content: ${JSON.stringify(json)}`);
  }
  const parsed = JSON.parse(text);
  return {
    choice: parsed.choice,
    rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
  };
}

function normalizeChoice(value) {
  const text = String(value ?? "").trim().toUpperCase();
  if (text === "A" || text === "B") return text;
  return "invalid";
}

function stableBoolean(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash % 2 === 0;
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function renderMarkdown(report) {
  const rows = report.results.map((row) => (
    `| ${row.case_id} | ${row.prompt_key} | ${row.expected} | ${row.selected} | ${row.pass ? "pass" : "fail"} | ${escapePipes(row.rationale)} |`
  ));
  return `# Preference Sanity Judge Report

Generated: ${report.generated_at}

Judge: ${report.judge.provider} / ${report.judge.model}

This report checks whether the judge can recover the curated preferred output from preferred/rejected pairs. It is not a candidate-model win-rate yet.

## Summary

- Total cases: ${report.summary.total_cases}
- Agreement rate: ${(report.summary.agreement_rate * 100).toFixed(1)}%
- Regression pass rate: ${(report.summary.regression_pass_rate * 100).toFixed(1)}%
- Latency: ${report.summary.latency_ms}ms

## Results

| Case | Prompt | Expected | Selected | Result | Rationale |
|---|---|---|---|---|---|
${rows.join("\n")}
`;
}

function escapePipes(value) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}
