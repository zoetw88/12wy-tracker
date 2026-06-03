# Architecture

This document is intentionally short. The public story for this repo is the local desktop product, not a list of unfinished platform ideas.

## Boundary

```text
ui -> application -> domain <- data/adapters
```

- `ui`: pages, layout, navigation, and visual state.
- `application`: orchestration, app state, prompt flows, and provider wiring.
- `domain`: goals, check-items, scoring, dates, and review rules.
- `data/adapters`: local persistence, LLM clients, usage records, and optional source adapters.

## Runtime Shape

- Tauri desktop shell hosts a React/Vite interface.
- Core workflow is device-local: goals, daily logs, review state, scores, and usage records are stored locally.
- LLM calls are direct provider calls using the user's own key.
- Optional collectors run outside the core UI through a sidecar boundary, so the app remains useful even when those collectors are absent.

## External Tool Boundaries

- `promptfoo` lives in `eval/` as a dev/CI harness for prompt regression, model comparison, and red-team runs. It is not an app dependency and is not part of production runtime.
- Langfuse is an optional development observer. The app sends traces only when development env keys are configured; otherwise tracing is a silent no-op and never blocks the product flow.
- OpenTelemetry is the long-term observability direction if the app grows beyond a local desktop product. The current app-owned contract remains usage records plus optional observers.

## Main Product Loop

1. Define a 12-week target.
2. Break it into weighted goals and daily check-items.
3. Log today's execution.
4. Review progress on the dashboard.
5. Ask AI for advice.
6. Inspect usage and prompt records when the output needs review.

## Key Invariants

- Program range can be unset; UI must not fake a start date.
- Scoring uses goal weights consistently across daily and weekly surfaces.
- AI failure never blocks manual logging.
- Usage records must keep enough context to audit provider, model, prompt key, latency, cost estimate, and prompt text.
- Demo fallback data is browser-preview only; desktop persistence remains the real app path.

## Docs Index

- `README.md`: public product narrative and demo link.
- `docs/decisions.md`: concise architecture decisions.
- `docs/backlog.md`: current release polish.
- `docs/gotchas.md`: relevant implementation lessons.
