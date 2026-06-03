# eval/ — Dev-Only LLM Quality Eval Harness

This folder is a **dev-only** model-comparison harness using [promptfoo](https://promptfoo.dev).
It is **never shipped** in the production Tauri app bundle (`app/` builds are completely
isolated from this folder — `app/package.json` has no promptfoo dependency).

promptfoo is an external dev/CI tool for prompt regression, model comparison, and
red-team runs. The product does not depend on it at runtime.

## What it does

Runs the app's real prompt builders (`createGoalDesignPrompt`, `priorityPrompt`,
`weeklyReviewPrompt`) against ≥2 candidate LLM providers using synthetic fixture data,
then produces a cost / latency / parse-rate / quality comparison table.

The shim (`prompts.ts`) imports directly from `../app/src/llm/prompts.ts` — no prompt
drift between eval and production.

The preference dataset is separate from exact-output fixtures. It stores subjective
preferred/rejected output pairs for coach quality, style, specificity, and actionability.
Those cases are used as regression examples; they are not golden answers.

## How to run

```sh
cd eval
npm install

# Set at least one provider key:
export OPENAI_API_KEY=sk-...
# or
export GEMINI_API_KEY=AIza...

# Uncomment providers in promptfooconfig.yaml first (see the providers: section)

npm run eval   # runs the comparison
npm run eval:preferences # runs provider-backed pairwise sanity judge; requires OPENAI_API_KEY
npm run report:sample # writes reports/latest.json and reports/latest.md format artifacts
npm run report:preferences # validates preference cases and writes reports/preferences.latest.*
npm run view   # opens the promptfoo UI to browse results
```

## Honesty note

These tasks (goal design, daily priority suggestions, weekly coaching) are **subjective**.
There is no fully-objective ground truth for "which output is better."

The eval harness narrows the field and informs the decision — it does not make it.
Human judgment (or in-app 👍/👎 ratings from real use) is the final arbiter.

For subjective coach quality, the stronger dataset shape is preference-based:
realistic input context, preferred output, rejected output, preference rationale,
rubric dimensions, source, and whether the case is a failure replay/regression case.

`npm run eval:preferences` is repo-owned and does not use promptfoo. It calls an
OpenAI-compatible judge with `OPENAI_API_KEY`, randomizes preferred/rejected order,
and reports whether the judge recovers the curated preferred answer. This validates
judge sanity before using pairwise win-rate as a release signal.

Automatic assertions (task-8) check structural properties: JSON parse success,
output language (zh), presence of fixture data references. Rubric scoring uses an
LLM-as-judge which is itself approximate.

## Cost numbers caveat

promptfoo reports cost using its own internal pricing table. These numbers differ from
the app's `computeCost` (in `app/src/llm/providers.ts`), which uses a separate source.
Use promptfoo's cost numbers for **relative ranking between models in this run only** —
do not treat them as billing figures.

## File layout

```
eval/
  package.json              separate npm root (promptfoo never enters app/ deps)
  promptfooconfig.yaml      eval config: prompts, providers, test fixtures
  prompts.ts                shim: imports real builders, returns chat messages
  fixtures/
    goal_design_cases.yaml  synthetic goal-design test cases (≥2)
    priority_cases.yaml     synthetic priority test cases (≥2)
    weekly_review_cases.yaml synthetic weekly-review test cases (≥2)
  preferences/
    coach_preference_cases.json preferred/rejected coach-output pairs
  assertions/
    parses_priority.js      imports real parser from ../.gen/parse.js (compiled by build:parser)
    references_data.js      heuristic: checks output references fixture values
  .gen/                     gitignored; produced by `npm run build:parser` (esbuild output)
  .gitignore                ignores node_modules/, .env, output dirs, .gen/
  reports/latest.json       latest report artifact shape
  reports/latest.md         latest human-readable report
  reports/preferences.latest.json latest preference dataset report
  reports/preferences.latest.md   latest preference dataset report, readable
  reports/preference-sanity.latest.json latest provider-backed preference judge report
  reports/preference-sanity.latest.md   latest provider-backed preference judge report
  README.md                 this file
```

### Parser build step

`npm run eval` automatically compiles `app/src/llm/parse.ts` → `eval/.gen/parse.js`
via esbuild before running promptfoo. The `.gen/` directory is gitignored. You do not
need to run any separate compile step manually.
