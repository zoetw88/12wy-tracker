import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const reportDir = join(root, "reports");
const generatedAt = new Date().toISOString();

const report = {
  schema: "12wy-tracker.eval-report",
  version: 1,
  generated_at: generatedAt,
  source: "sample-format",
  note: "Format artifact only. Replace with real promptfoo metrics after running eval with provider keys.",
  rubric_dimensions: [
    "specificity",
    "12_week_year_fit",
    "actionability",
    "uses_user_context",
    "avoids_generic_encouragement",
  ],
  cases: [
    {
      prompt_key: "create_goal_design",
      prompt_version: "v1",
      fixture: "goal_design_cases",
      model: "sample:gpt-4o-mini",
      latency_ms: 1820,
      input_tokens: 980,
      output_tokens: 420,
      estimated_cost_usd: 0.0004,
      parse_success: true,
      rubric: {
        specificity: 0.82,
        "12_week_year_fit": 0.86,
        actionability: 0.84,
        uses_user_context: 0.8,
        avoids_generic_encouragement: 0.88,
      },
      human_helpful_rating: null,
      decision: "keep",
    },
    {
      prompt_key: "suggest_priority",
      prompt_version: "v1",
      fixture: "priority_cases",
      model: "sample:gpt-4o-mini",
      latency_ms: 1240,
      input_tokens: 740,
      output_tokens: 260,
      estimated_cost_usd: 0.0002,
      parse_success: true,
      rubric: {
        specificity: 0.78,
        "12_week_year_fit": 0.83,
        actionability: 0.87,
        uses_user_context: 0.81,
        avoids_generic_encouragement: 0.86,
      },
      human_helpful_rating: null,
      decision: "keep",
    },
    {
      prompt_key: "weekly_review",
      prompt_version: "v1",
      fixture: "weekly_review_cases",
      model: "sample:gpt-4o-mini",
      latency_ms: 2100,
      input_tokens: 1220,
      output_tokens: 520,
      estimated_cost_usd: 0.0005,
      parse_success: true,
      rubric: {
        specificity: 0.8,
        "12_week_year_fit": 0.85,
        actionability: 0.82,
        uses_user_context: 0.83,
        avoids_generic_encouragement: 0.84,
      },
      human_helpful_rating: null,
      decision: "revise-after-real-run",
    },
  ],
};

await mkdir(reportDir, { recursive: true });
await writeFile(join(reportDir, "latest.json"), JSON.stringify(report, null, 2));
await writeFile(join(reportDir, "latest.md"), toMarkdown(report));

console.log(`Wrote ${join(reportDir, "latest.json")}`);
console.log(`Wrote ${join(reportDir, "latest.md")}`);

function toMarkdown(report) {
  const rows = report.cases.map((c) => {
    const avgRubric = average(Object.values(c.rubric));
    return [
      c.prompt_key,
      c.prompt_version,
      c.fixture,
      c.model,
      c.latency_ms,
      `${c.input_tokens}+${c.output_tokens}`,
      `$${c.estimated_cost_usd.toFixed(6)}`,
      c.parse_success ? "yes" : "no",
      avgRubric.toFixed(2),
      c.human_helpful_rating ?? "unrated",
      c.decision,
    ].join(" | ");
  });

  return `# Eval Report

Generated: ${report.generated_at}

Source: ${report.source}

${report.note}

## Rubric

${report.rubric_dimensions.map((name) => `- ${name}`).join("\n")}

## Cases

| Prompt | Version | Fixture | Model | Latency | Tokens | Cost | Parse | Rubric Avg | Human | Decision |
|---|---|---|---|---:|---:|---:|---|---:|---|---|
${rows.map((row) => `| ${row} |`).join("\n")}

## Next Decision

Run \`npm run eval\` with real provider keys, replace sample metrics, then compare prompt/model changes against this same report shape.
`;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
