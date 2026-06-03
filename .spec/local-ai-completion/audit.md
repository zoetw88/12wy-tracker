# Audit

## Scope

Add four high-ROI completion features for the personal local app:

- data export/import/delete
- local LLM usage budget
- prompt version and rollback visibility
- eval report artifacts

## Acceptance Evidence

- `cd app && npm test` passed: 7 files, 37 tests.
- `cd app && npm run build` passed.
- `cd eval && npm run report:sample` generated `eval/reports/latest.json` and `eval/reports/latest.md`.
- `cd eval && npm run report:preferences` generated `eval/reports/preferences.latest.json` and `eval/reports/preferences.latest.md`.
- `cd eval && npm run eval:preferences` is implemented as a repo-owned pairwise sanity runner; live execution requires `OPENAI_API_KEY`.
- Browser visual check on `http://127.0.0.1:5173/#/setup?tab=settings` confirmed System, Save File, AI Mana Cap, and Coach Patch Notes render with no horizontal overflow at 583px viewport.

## Blockers

- Real-provider eval was not run because no provider keys were used in this verification pass.
- Preference report validates dataset shape only; pairwise judge sanity and win-rate require provider keys and human calibration.
