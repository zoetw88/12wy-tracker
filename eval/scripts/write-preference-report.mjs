#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const casesPath = join(root, "preferences", "coach_preference_cases.json");
const reportsDir = join(root, "reports");
const jsonReportPath = join(reportsDir, "preferences.latest.json");
const mdReportPath = join(reportsDir, "preferences.latest.md");

const dataset = JSON.parse(readFileSync(casesPath, "utf8"));
validateDataset(dataset);

const report = buildReport(dataset);
mkdirSync(reportsDir, { recursive: true });
writeFileSync(jsonReportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
writeFileSync(mdReportPath, renderMarkdown(report), "utf8");

console.log(`Wrote ${jsonReportPath}`);
console.log(`Wrote ${mdReportPath}`);

function validateDataset(value) {
  if (value.schema !== "12wy-tracker.preference-cases") {
    throw new Error("Invalid preference dataset schema");
  }
  if (value.version !== 1) {
    throw new Error("Unsupported preference dataset version");
  }
  if (!Array.isArray(value.rubric_dimensions) || value.rubric_dimensions.length === 0) {
    throw new Error("rubric_dimensions must be a non-empty array");
  }
  if (!Array.isArray(value.cases) || value.cases.length === 0) {
    throw new Error("cases must be a non-empty array");
  }
  const ids = new Set();
  for (const item of value.cases) {
    const requiredStrings = [
      "id",
      "prompt_key",
      "prompt_version",
      "source",
      "preferred_output",
      "rejected_output",
    ];
    for (const key of requiredStrings) {
      if (typeof item[key] !== "string" || item[key].trim() === "") {
        throw new Error(`Case ${item.id ?? "(unknown)"} missing ${key}`);
      }
    }
    if (ids.has(item.id)) throw new Error(`Duplicate case id: ${item.id}`);
    ids.add(item.id);
    if (!item.input_context || typeof item.input_context !== "object") {
      throw new Error(`Case ${item.id} missing input_context`);
    }
    if (!Array.isArray(item.preference_reason) || item.preference_reason.length === 0) {
      throw new Error(`Case ${item.id} missing preference_reason`);
    }
    for (const dim of value.rubric_dimensions) {
      const score = item.rubric?.[dim];
      if (!Number.isFinite(score) || score < 1 || score > 5) {
        throw new Error(`Case ${item.id} invalid rubric score for ${dim}`);
      }
    }
  }
}

function buildReport(dataset) {
  const generatedAt = new Date().toISOString();
  const byPrompt = {};
  for (const item of dataset.cases) {
    byPrompt[item.prompt_key] = (byPrompt[item.prompt_key] ?? 0) + 1;
  }
  const regressionCases = dataset.cases.filter((item) => item.regression).length;
  return {
    schema: "12wy-tracker.preference-report",
    version: 1,
    generated_at: generatedAt,
    source_dataset: "eval/preferences/coach_preference_cases.json",
    note: "Preference dataset artifact only. Pairwise judge runs require provider keys and human calibration before being used as a release gate.",
    summary: {
      total_cases: dataset.cases.length,
      regression_cases: regressionCases,
      prompt_keys: byPrompt,
      rubric_dimensions: dataset.rubric_dimensions,
    },
    gate_shape: {
      style_preference_win_rate: ">= 0.70 against baseline",
      failure_replay_pass_rate: ">= 0.95",
      critical_factual_error_count: "0",
      format_violation_rate: "<= 0.02",
      human_judge_agreement: "calibrated before blocking releases",
    },
    cases: dataset.cases.map((item) => ({
      id: item.id,
      prompt_key: item.prompt_key,
      prompt_version: item.prompt_version,
      source: item.source,
      regression: Boolean(item.regression),
      preference_reason: item.preference_reason,
      rubric_avg: average(Object.values(item.rubric)),
    })),
  };
}

function renderMarkdown(report) {
  const rows = report.cases.map((item) => (
    `| ${item.id} | ${item.prompt_key} | ${item.prompt_version} | ${item.source} | ${item.regression ? "yes" : "no"} | ${item.rubric_avg.toFixed(2)} | ${item.preference_reason.join("<br>")} |`
  ));
  return `# Preference Eval Dataset Report

Generated: ${report.generated_at}

Source: ${report.source_dataset}

${report.note}

## Summary

- Total cases: ${report.summary.total_cases}
- Regression cases: ${report.summary.regression_cases}
- Prompt keys: ${Object.entries(report.summary.prompt_keys).map(([key, count]) => `${key} (${count})`).join(", ")}
- Rubric: ${report.summary.rubric_dimensions.join(", ")}

## Release Gate Shape

| Metric | Target |
|---|---|
${Object.entries(report.gate_shape).map(([key, value]) => `| ${key} | ${value} |`).join("\n")}

## Cases

| Case | Prompt | Version | Source | Regression | Rubric Avg | Preference Reason |
|---|---|---|---|---|---:|---|
${rows.join("\n")}

## Next Decision

Run a provider-backed pairwise judge against this dataset, then calibrate a sample with human review before using win-rate as a release gate.
`;
}

function average(values) {
  return values.reduce((acc, n) => acc + n, 0) / values.length;
}
