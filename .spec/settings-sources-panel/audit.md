# Audit

## In scope

- Personal desktop Settings "Sources" panel.
- Reuse existing source status, count, last-sync, path, and sync APIs.
- Localized UI strings for zh/en/fr.
- Targeted verification with existing Vitest and build checks.

## Out of scope

- Cloud account or paid backend work.
- Additional source connectors.
- Local persistence schema changes.

## Deferred

- Real source connector implementation in the open-source shell.
- Full UI interaction tests for Settings.

## Known blockers

- The source adapter currently returns disabled/no-op values in the open-source shell, so live sync cannot be proven from this repo alone.
