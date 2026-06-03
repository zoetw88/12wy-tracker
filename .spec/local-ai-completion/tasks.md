# Tasks

Done means the feature is wired, covered by focused tests where practical, and verified with the app build.

- [x] task-1: Local data portability
  - Files: `app/src/dataPortability.ts`, `app/src/pages/Settings.tsx`
  - Acceptance:
    - Export creates a JSON snapshot of local app data for the active profile.
    - Export excludes API keys and provider secrets.
    - Import validates schema/version before writing.
    - Delete all local app data requires confirmation and clears profile app data.

- [x] task-2: LLM usage budget
  - Files: `app/src/llm/budget.ts`, `app/src/llm/client.ts`, `app/src/pages/Settings.tsx`
  - Acceptance:
    - User can set daily and monthly estimated USD limits.
    - `callLlm` blocks before provider call when a configured limit is exceeded.
    - Budget state is visible in Settings usage area.
    - Ollama/local zero-cost usage remains allowed unless call limits are added later.

- [x] task-3: Prompt version and rollback visibility
  - Files: `app/src/llm/promptRegistry.ts`, `app/src/llm/client.ts`, `app/src/pages/Settings.tsx`
  - Acceptance:
    - Prompt keys have active version metadata.
    - Usage logging receives a prompt version when caller does not specify one.
    - Settings shows prompt versions and rollback notes.

- [x] task-4: Eval report output
  - Files: `eval/package.json`, `eval/scripts/*`, `eval/preferences/*`, `eval/reports/*`
  - Acceptance:
    - Eval tooling can write `eval/reports/latest.json`.
    - Eval tooling can write `eval/reports/latest.md`.
    - Report documents prompt key/version, rubric dimensions, metrics, and manual next decision.
    - Preference cases capture preferred output, rejected output, rationale, source, and regression flag.
    - Preference report documents the release-gate shape without claiming real judge results.
    - Repo-owned preference sanity runner can run pairwise judge without promptfoo when provider keys are configured.

- [x] task-5: Documentation and verification
  - Files: `README.md`, `docs/*` as needed
  - Acceptance:
    - README remains concise and visual.
    - No public docs reintroduce unrelated source integrations or release-only positioning.
    - Docs state promptfoo is dev/CI-only and Langfuse is an optional observer, not a runtime dependency.
    - `npm test`, `npm run build`, and relevant eval command pass or blockers are recorded.

## Out Of Scope

- Cloud accounts, sync, managed LLM gateway, server-side quota, online A/B testing.
- New source integrations.
- Storing provider API keys in export files.
