# Decisions

Only decisions that explain the current personal desktop product are kept here. Deferred product lines and platform plans are intentionally omitted.

## Local-First Desktop

The app starts as a personal desktop tool because the core value is private execution tracking: goals, daily logs, reflections, reviews, and prompt history. This avoids forcing account creation before the user has value, and it keeps sensitive planning data on the user's machine.

Rejected alternative: server-first storage. It would make sync easier later, but it weakens the privacy story and distracts from the finished local workflow.

## BYOK For AI Calls

AI features use the user's own provider key. That makes inference cost visible, removes hidden operating cost from this repo, and avoids shipping a shared provider key in a distributed client.

Rejected alternative: a bundled managed key. A desktop client cannot keep that secret, and quota enforcement belongs on a trusted service, not in local UI code.

## LLM Limits And Guardrails

The app keeps LLM limits local and inspectable: provider, model, prompt text, latency, estimated cost, and result metadata are recorded for each call. This is enough for BYOK because the user's provider account owns the hard billing boundary.

The app also supports local daily and monthly estimated-cost limits. These limits stop hosted-provider calls before a request is sent, while Ollama remains allowed because it has no provider billing cost in this app.

For managed AI, the boundary changes. A trusted gateway would be required before exposing any shared provider key. That gateway would enforce per-user quota, request rate limits, max-token caps, model allowlists, daily spend ceilings, and prompt guardrails for higher-risk advice surfaces.

Rejected alternative: enforce commercial limits in the desktop client. Local checks are useful for UX, but they are not a security or billing boundary.

## Sidecar Adapter Boundary

External data collection is kept outside the core product loop. The app can log goals, calculate progress, generate advice, and inspect prompts even if every optional collector is disabled.

The important decision is the boundary: source adapters may feed data in, but they do not own goals, scoring, review logic, or AI usage records.

## Eval And Usage Records

AI advice is subjective, so the app records enough context to review outputs: prompt key, model, provider, latency, estimated cost, prompt text, and response metadata. Offline evals compare prompt behavior, while in-app usage history gives a concrete audit trail.

For personal local use, the complete LLM loop is:

- Prompt keys and prompt versions for traceability.
- Fixed eval cases for goal design, daily priority, and weekly review prompts.
- Preference-based eval cases with preferred outputs, rejected outputs, preference rationale, and regression flags for subjective coach quality.
- Rubric scoring for specificity, actionability, data use, and fit to the 12-week workflow.
- Usage comparison across provider, model, latency, token count, estimated cost, parse success, and human helpful rating.
- Thumbs up/down feedback stored as local `quality_score`.
- Local input/output guardrails: control-character cleanup, prompt and response length caps, structured-output parsing, sanitized provider-error logs, missing-key handling, timeout, transient retry, and failed-attempt logging.

Rejected alternative: treat AI output as a black box. That is fast to ship, but it gives no way to explain quality, regressions, cost, or prompt changes.

## External Eval And Observability Tools

The product does not depend on promptfoo or Langfuse. The app-owned contract is prompt versioning, local usage records, preference cases, reports, and optional observer hooks.

promptfoo belongs in dev/CI: prompt regression, model comparison, and red-team runs. It stays in `eval/` and is not part of the production Tauri runtime.

Langfuse is an optional development observer. If env keys are configured in development, traces are sent for inspection; if not, tracing is a silent no-op and does not affect product behavior.

Long term, OpenTelemetry is the better abstraction if observability needs to become provider-neutral or production-grade.

## Data Portability

Local-first means the user can move or delete their data. The app exports active-profile goals, check items, daily logs, weekly reviews, usage records, and safe local settings as JSON. Provider API keys and secret-like settings are excluded.

Rejected alternative: export every localStorage key. That is convenient, but it risks leaking provider keys or unrelated local state.

## Demo Fallback Data

Browser preview cannot exercise every desktop capability, so the app includes a narrow demo fallback for screenshots and GIF capture. This is intentionally separate from the desktop persistence path.

The fallback exists only to make browser preview and capture reproducible without requiring local user data.
