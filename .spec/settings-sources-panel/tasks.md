# Tasks

Each task <= 1 commit. Done = test passes + reviewed.

- [x] task-1: Add Settings Sources labels with parity coverage
  - Files: app/src/i18n.ts, app/src/i18n.test.ts
  - Test: npm test

- [x] task-2: Add personal Sources panel to Settings
  - Files: app/src/pages/Settings.tsx, app/src/styles.css
  - Test: npm run build

## Acceptance

When all tasks are done:
- [x] Sources panel appears in Settings.
- [x] Panel shows configured script path, sync status, activity count, last sync, and manual sync button.
- [x] Stubbed source adapter reports a clear disabled status instead of failing silently.
- [x] Narrow and build verification pass.
