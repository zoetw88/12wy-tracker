# Agent instructions

This repo follows the user's personal workflow system. Keep global process in
`~/.ai-workflow/*`, `~/.claude/*`, `~/.codex/config.toml`, and user-level
agent instructions; keep this file repo-specific and thin.

## Project context

12wy-tracker is a local-first desktop app for running a 12 Week Year workflow.
It uses Tauri 2, React 19, TypeScript, Vite, and a Rust desktop shell.

## Workflow expectation

For non-trivial changes, follow:

1. Define scope.
2. Create or update `.spec/<ticket>/` task files.
3. Confirm targeted tests before production edits.
4. Implement the smallest coherent change.
5. Verify narrowly first, then broaden as risk requires.
6. Review broader impact before changelog or commit work.

## Task-local files

For substantial tasks, create or update:

- `.spec/<ticket>/tasks.md`
- `.spec/<ticket>/audit.md`
- `.spec/<ticket>/ai-development-map.md`
- `.spec/<ticket>/adr-*.md` only for real architecture decisions

Use templates from `~/.ai-workflow/templates/`.

## Repo verification

- Frontend narrow tests: `cd app && npm test -- <test-file>`
- Frontend broader tests: `cd app && npm test`
- Frontend type/build gate: `cd app && npm run build`
- Eval harness: `cd eval && npm run eval`

## Scope rules

- Treat cloud accounts, paid plans, multi-device sync, and additional source
  integrations as separate tasks unless a task spec explicitly includes them.
- Keep unrelated local files, generated caches, and worktrees out of staged
  changes.
