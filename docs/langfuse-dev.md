# Langfuse Dev Tracing

## Purpose

DEV-ONLY optional observer. Langfuse is used to capture LLM calls during development so you can compare prompt quality and versions side by side.

The product does not depend on Langfuse. If the env keys are missing, tracing is a silent no-op. If the app later needs provider-neutral production observability, prefer an OpenTelemetry boundary and treat Langfuse as one possible sink.

- Not shipped to users
- No keys in the client bundle (env vars are never included in production builds)
- No user data sent to any SaaS — self-hosted on your dev machine only
- The tracer is fully disabled in production: `import.meta.env.DEV` is `false` in `npm run build`, so `langfuseEnabled` is always `false` and no fetch is ever made

## Self-host Langfuse

```sh
git clone https://github.com/langfuse/langfuse
cd langfuse
docker compose up
```

Open http://localhost:3000, create an account and a project, then copy the public and secret API keys from the project settings.

## Wire-up

```sh
cp app/.env.local.example app/.env.local
```

Edit `app/.env.local` and paste in your keys:

```
VITE_LANGFUSE_HOST=http://localhost:3000
VITE_LANGFUSE_PUBLIC_KEY=pk-lf-your-key-here
VITE_LANGFUSE_SECRET_KEY=sk-lf-your-key-here
```

Then run the app in dev mode:

```sh
npm run dev
```

Use the app's AI features (reviews, goals, etc.). Traces will appear in your Langfuse project at http://localhost:3000.

## Comparing Prompts

In the Langfuse UI, filter or group traces by:

- `metadata.promptVersion` — compare v1 vs v2 of a prompt
- `metadata.scenario` — compare across different scenarios
- Tag `promptKey` — filter to a specific prompt (e.g. `weekly-review`, `goal-coach`)

Use the "Sessions" or "Traces" view to compare token usage, latency, and cost side by side.

## Production Safety

- `npm run build` sets `import.meta.env.DEV = false` → `langfuseEnabled` is `false` → zero fetches, zero overhead
- `app/.env.local` is gitignored (`.env.local` and `.env*.local` in root `.gitignore`) so keys never commit
- Only `app/.env.local.example` (with placeholder values) is committed
