# Gotchas

Implementation lessons that still matter for the current app.

## Program Range Must Stay Explicit

The app allows the 12-week start date to be unset. Callers must guard that state instead of silently inventing a date. Fake dates make the dashboard look complete while the user's plan is still missing.

## URL State Can Fight Persisted UI State

The weekly-review modal is opened by URL state. If a persisted dashboard subtab points elsewhere, clearing the URL parameter can unmount the modal immediately. When a transient route parameter forces a view, reconcile the persisted view state at the same time.

## AI Output Needs A Durable Anchor

Rating or auditing an AI response requires the usage record id from the call that produced it. If the response text is persisted but the request id only lives in component state, navigation can disconnect the visible output from the row being rated.

## Prompt Eval Reuse Needs A Real Runtime Check

The eval harness reuses app prompt builders. Type checks are not enough; run the eval command when keys are available because the prompt runner and assertion runner load modules differently.

## Browser Demo Is Not Desktop Persistence

The browser preview uses fallback data so screenshots and GIFs can show the intended flow. Desktop builds still need a smoke test because local persistence and desktop plugins are not fully exercised by the browser preview.
