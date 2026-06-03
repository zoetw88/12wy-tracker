# local-ai-completion AI development map

This ticket finishes the personal local product story without expanding into cloud platform work.

## Authoritative sources

1. `.spec/local-ai-completion/tasks.md`
2. `.spec/local-ai-completion/audit.md`
3. `AGENTS.md`
4. `docs/architecture.md`
5. `docs/decisions.md`

## Current scope

1. Local data export/import/delete for user control.
2. Local LLM budget limits before provider calls.
3. Prompt version/rollback visibility for AI auditability.
4. Eval report artifacts for prompt/model comparison evidence.

## Implementation files

### Production

- `app/src/dataPortability.ts`
- `app/src/llm/budget.ts`
- `app/src/llm/promptRegistry.ts`
- `app/src/llm/client.ts`
- `app/src/pages/Settings.tsx`

### Tests

- `app/src/dataPortability.test.ts`
- `app/src/llm/budget.test.ts`
- `app/src/llm/promptRegistry.test.ts`
- eval report script smoke command

### Call sites or integration points

- Settings Save File panel
- Settings AI Mana Cap and AI Log panels
- `callLlm`
- `insertUsage`
- eval npm scripts

## Verification commands

```text
cd app && npm test
cd app && npm run build
cd eval && npm run report:sample
git diff --check
```

## Known blockers

- Full desktop import/export smoke may require Tauri runtime; browser fallback will be tested through build and pure helpers.

## Out of scope

- Server-side LLM gateway.
- Shared provider keys.
- Cloud sync.
- External data source expansion.
