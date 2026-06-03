# Eval Comparison Artifact

> ⚠️ **ILLUSTRATIVE EXAMPLE — NOT A REAL RUN.**
> Numbers below are **fabricated** to show the output FORMAT only.
> No API keys are available in this environment and `promptfoo` was not executed.
> Run `cd eval && npm install && <set env keys> && npm run eval` to produce real data.

---

## Model Comparison Table (FORMAT DEMO ONLY)

| Model | Task | Parse-rate | Avg latency (ms) | Cost / 1k runs (USD) | Rubric: actionability | Rubric: specificity | Rubric: format | Rubric: zh-quality | Overall |
|---|---|---|---|---|---|---|---|---|---|
| openai:gpt-4o-mini | priority | 0.95 | 1 820 | $0.42 | 0.80 | 0.75 | 0.90 | 0.88 | 0.83 |
| openai:gpt-4o-mini | weekly_review | — | 2 100 | $0.53 | 0.78 | 0.82 | 0.85 | 0.91 | 0.84 |
| openai:gpt-4o-mini | goal_design | — | 2 450 | $0.61 | 0.74 | 0.79 | 0.83 | 0.87 | 0.81 |
| google:gemini-2.0-flash | priority | 0.88 | 1 240 | $0.18 | 0.72 | 0.68 | 0.88 | 0.83 | 0.78 |
| google:gemini-2.0-flash | weekly_review | — |  980 | $0.22 | 0.70 | 0.71 | 0.84 | 0.80 | 0.76 |
| google:gemini-2.0-flash | goal_design | — | 1 150 | $0.25 | 0.68 | 0.72 | 0.82 | 0.79 | 0.75 |

**Parse-rate** applies only to the `priority` task (JSON-structured output). `—` means not applicable (free-form text response).

---

## Honesty Note on "Which Model is Better"

Subjective generative tasks (goal design, daily priority suggestions, weekly-review coaching)
have **no fully-objective metric**. The rubric scores above capture LLM-as-judge assessments
of actionability, specificity, format compliance, and zh-language quality — but these
judgments are themselves model-produced and can reflect the judge model's own biases.

**Eval narrows + informs; the human decides.**

A lower rubric score does not mean a model is wrong. A faster, cheaper model that scores
slightly lower on "specificity" may still be the right choice depending on user sensitivity
and cost constraints.

---

## Pricing Caveat

The cost numbers in this table use **promptfoo's own pricing table** (sourced from the
promptfoo version installed in `eval/`). They will differ slightly from the values
`computeCost` in `app/src/llm/providers.ts` uses for in-app billing display.

Use the numbers here for **relative ranking across models**, not as billing estimates.
For accurate billing, refer to the provider dashboard and `computeCost`.

---

## How to Run for Real

### Prerequisites

1. Set API keys in the environment (never commit these):
   ```
   OPENAI_API_KEY=sk-...
   GEMINI_API_KEY=AI...
   ```
   Or create a local `.env` file in `eval/` (already in `.gitignore`).

2. Install eval dependencies:
   ```
   cd eval
   npm install
   ```

### Run the eval

```
# From the eval/ directory:
npm run eval
```

This executes `promptfoo eval -c promptfooconfig.yaml`.

### View results in the browser UI

```
npm run view
```

This runs `promptfoo view` and opens the interactive comparison table in your browser.

---

## Parser Assertion Build Step (FIXED)

### `eval/assertions/parses_priority.js`

Previously this file imported `../../app/src/llm/parse.ts` directly, which caused
`"Unknown file extension '.ts'"` under Node's standard ESM resolver (promptfoo loads
assertion files via Node, not its bundled tsx transformer).

**This is now fixed.** `eval/package.json` has a `build:parser` script:

```sh
npx esbuild ../app/src/llm/parse.ts --bundle=false --platform=node --format=esm --outdir=.gen
```

`npm run eval` runs `build:parser` first (producing `eval/.gen/parse.js`, which is
gitignored), then runs `promptfoo eval`. `parses_priority.js` now imports from
`../.gen/parse.js` — a plain `.js` file that Node resolves without any loaders.

Any change to `app/src/llm/parse.ts` is automatically reflected on the next
`npm run eval` — no manual step, no drift.

### `eval/prompts.ts`

The prompt shim imports `../app/src/llm/prompts.ts` with a `.ts` extension. promptfoo loads
prompt functions via its bundled tsx transformer, so this **should work** for `prompts.ts`.
However, if you hit resolution errors, set `loader: tsx` in the promptfoo config.

---

*This file is the AC11 artifact for the `llm-quality-score` feature (task-9).
Real run output should replace this file's table section once API keys are available.*
