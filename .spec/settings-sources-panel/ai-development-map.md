# settings-sources-panel AI development map

This file is the handoff entry point for agents working on this ticket.

## Authoritative sources

Read these in order before changing code:

1. `.spec/settings-sources-panel/tasks.md`
2. `.spec/settings-sources-panel/audit.md`
3. `docs/backlog.md`
4. Existing source adapter API

## Current scope

1. Add a Settings panel for personal desktop source status.
2. Reuse the existing source sync/status API surface.
3. Keep cloud account work and additional source connectors outside this task.

## Implementation files

### Production

- `app/src/pages/Settings.tsx`
- `app/src/i18n.ts`
- `app/src/styles.css`

### Tests

- `app/src/i18n.test.ts`

### Call sites or integration points

- Source adapter module
- Settings page render tree

## TDD checkpoints

1. Confirm i18n parity test exists.
2. Add label checks for the new Settings Sources strings.
3. Implement the smallest production change.
4. Re-run the narrow test.
5. Run build for the touched frontend area.

## Verification commands

```text
npm test
npm run build
```

## Known blockers

- The source adapter is stubbed in this shell; manual sync returns a configured-disabled result.

## Out of scope

- Cloud backend/source connectors.
- Real external login flows.
