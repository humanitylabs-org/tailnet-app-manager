# Tailnet Apps Manager

Clean mobile-first dashboard for local Tailnet apps.

## Routes

- `/apps`
- `/apps/api/health`
- `/apps/api/status`
- `/apps/api/action`

## Features

- Responsive card grid (mobile-friendly)
- Per-app icon + status pills
- Open / Restart / Update actions
- PWA manifest + install icons

## Run

```bash
node server.mjs
```

Defaults:
- host: `127.0.0.1`
- port: `8786`
- base path: `/apps`

Override with env vars:
- `APPS_HOST`
- `APPS_PORT`
- `TAILNET_BASE_URL`
