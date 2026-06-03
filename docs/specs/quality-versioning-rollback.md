# Spec — Quality, Prompt Versioning & Rollback (design)

**Status:** Design / blueprint. Covers three linked concerns: (a) CI gate,
(b) offline + online eval ("which is better"), (c) prompt externalization +
version switch/rollback. They form one loop: **version → measure → compare →
keep or roll back**, with rollback made cheap by putting volatile bits behind
config/backend rather than a client redeploy.

---

## (a) CI gate — "automatically know nothing regressed"
Current gap: the repo has NO test runner (only `tsc && vite build`); the
pure-function "tests" so far were throwaway node scripts. Minimum CI:

1. **Add vitest** (`npm i -D vitest`). Configure so test files are EXCLUDED from
   the app `tsc`/vite build (separate `vitest.config.ts`; exclude `**/*.test.ts`
   from the app tsconfig) — keeps `npm run build` green and unrelated to tests.
2. **Wire the genuinely-pure functions** as real tests (they were verified by
   temporary scripts before — make them permanent):
   - `score.ts`: `scoreDay`, `weeklyReviewExecutionScore` (the hand-computed 75/25/100 → 67 case + empty-week → 0).
   - `dateUtils.ts`: `weekNumber` boundaries (before start → 1, >84 days → 12), `daysUntilWeekEnds` (incl past-week → 0), `hasProgramRange` with mocked storage.
   - `i18n.ts`: a parity test asserting `Object.keys(labels.zh/en/fr)` are equal sets (catches the silent missing-en/fr-key class we hit repeatedly).
3. **GitHub Actions** `.github/workflows/ci.yml`: on push/PR → `npm ci` →
   `npx tsc --noEmit` → `npm run build` → `npx vitest run`. This is the
   pre-merge "didn't regress" gate.
4. (Later, when backend exists) add a backend test job + the eval harness as a
   scheduled/manual job (below).

> Constraint: the agent can't `npm install` (no network) so vitest can't be run
> here — these tests are written to run on `npm test` / CI on a networked machine.

## (b) Eval — "which model / prompt version is better"
Subjective generative tasks (coach advice, goal design, priority) have no single
right answer → use proxy metrics + judges, never a fully-automated verdict.

**Offline harness (before shipping a prompt/model change)**
- A **preference-based golden set**: ~10–20 representative inputs (real-ish goals,
  weeks) committed as fixtures. For subjective coach quality, this is not a
  golden-answer set: store preferred outputs, rejected outputs, preference
  rationale, and failure replays.
- Run each candidate (model × promptVersion) through `callLlm` (it already takes a
  provider/model override) → record per run: cost, latency, **JSON-parse success**,
  format-assertions (is it valid JSON / references the user data / is zh), and an
  **LLM-judge score** (a stronger model rates 1–5 on actionability/specificity).
- Tool: **promptfoo** (OpenAI-compatible, multi-provider, assertions + LLM rubric)
  OR a small custom runner reusing `callLlm`. Output a comparison table.
- Run as a manual/scheduled CI job (not per-commit — it costs tokens).

**Online (after shipping)**
- Every call already stamped with `promptVersion` + model in `llm_usage` (+ Langfuse).
- Add **user feedback** (👍/👎 or 1–5) next to AI outputs → writes `llm_usage.quality_score`
  (the column exists but is currently always null — see backlog). This is the
  strongest "is it actually better" signal.
- Compare aggregates **per promptVersion / model**: parse-success rate, cost,
  latency, avg quality_score, 👎 rate.
- **A/B**: serve v1 to some users, v2 to others (needs the backend to assign);
  compare aggregates.

**Rollback trigger:** if a new prompt/model version regresses on any key metric
(quality down, parse-success down, cost up beyond threshold) vs the prior version
→ roll back.

## (c) Prompt externalization + version switch / rollback
Today prompts are **hardcoded in `llm/prompts.ts`** → rollback = git revert +
rebuild + (desktop) re-ship. Fine for now; the upgrade path:

**Externalize prompts into a versioned store the app reads at runtime:**
- Each prompt = `{ key, version, template }`. The app resolves the ACTIVE version
  per prompt key from config.
- Personal/now: a versioned JSON (in repo or app config) + a "prompt version"
  setting → switch/roll back without code change (still local).
- Commercial/later: the **backend** serves the active prompt version (or Langfuse
  Prompt Management). Then **rollback = flip the active version server-side, no
  client redeploy** — instant, fleet-wide.
- Always keep `promptVersion` flowing into `llm_usage`/Langfuse so eval can attribute.

## Rollback cost by layer (the through-line)
| What | Rollback mechanism | Cost |
|---|---|---|
| Prompt (externalized) | flip active version in config/backend | instant, no redeploy |
| Prompt (hardcoded, today) | git revert + rebuild + re-ship | slow on desktop |
| Backend logic (CF Worker) | `wrangler rollback` to prior deployment | instant, atomic, no client touch |
| Desktop app version | updater (forward-only) — hard to downgrade | use **feature flags** to disable a bad feature instead of downgrading |
| Mobile app | store review + forward-only updates | feature flags |

**Principle:** put volatile, frequently-tuned things (prompts, model choice,
risky features) behind **config/backend + feature flags** so the common rollback
is a server flip, not a client redeploy. Reserve client redeploys for actual code.

## Recommended order
1. **(a) CI + vitest** — lowest effort, immediately gives "didn't regress" + the
   i18n-parity test that keeps biting us. (agent writes; owner `npm i -D vitest` + runs)
2. **Online feedback → quality_score** (small in-app 👍/👎 + a db update) — starts
   collecting the real "better?" signal now, even before a backend.
3. **Offline eval harness** (promptfoo or custom) — when iterating prompts/models seriously.
4. **Prompt externalization + server-side version flip** — once the backend exists
   (gives instant rollback; ties to the commercial track).

## Out of scope
- The backend itself (separate ADR/slices). Online A/B + server-side prompt flip
  depend on it.
