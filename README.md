# Fitness Buddy

Fitness Buddy is a Node/Express fitness tracker with user authentication, a protected plans page, SQLite persistence, and an optional AI coach powered by OpenRouter.

## Features

- Register, login, logout, current-user, password reset, and change-password flows
- Session-backed authentication with SQLite session storage
- Protected `/plans` route served outside the public static directory
- Calorie, macro, exercise, and nutrition tracking UI
- Optional AI chat endpoint with browser-side offline fallback
- Production-oriented config, security headers, rate limits, health check, and graceful shutdown

## Requirements

- Node.js 20 or newer
- npm

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_ENV` | No | Use `production` for deployed environments. |
| `PORT` | No | Server port. Defaults to `3000`. |
| `HOST` | No | Optional bind host. Leave empty for most platforms. |
| `APP_NAME` | No | Display/logging name. Defaults to `Fitness Buddy`. |
| `APP_URL` | Production | Public URL used by API provider headers. |
| `SESSION_SECRET` | Production | Must be at least 32 characters in production. |
| `SESSION_TTL_MS` | No | Session lifetime in milliseconds. Defaults to 7 days. |
| `ALLOWED_ORIGINS` | Production | Comma-separated allowed browser origins. |
| `DB_PATH` | No | SQLite database path. Defaults to `./data/db.sqlite`. |
| `OPENROUTER_API_KEY` | No | Enables `/api/chat`; without it, the app still runs. |
| `OPENROUTER_MODEL` | No | OpenRouter model ID. |

Generate a strong session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## API Routes

- `GET /healthz`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/change-password`
- `POST /api/chat`

## Deployment Checklist

1. Set `NODE_ENV=production`.
2. Set a strong `SESSION_SECRET`.
3. Set `APP_URL` to your deployed URL.
4. Set `ALLOWED_ORIGINS` to your deployed origin.
5. Use a persistent disk or volume for `DB_PATH`, for example `/app/data/db.sqlite`.
6. Add `OPENROUTER_API_KEY` only if you want live AI replies.
7. Confirm `GET /healthz` returns `{ "ok": true }`.

## Scaling Notes

This version is safer for small production deployments because sessions are stored in SQLite instead of process memory. For larger traffic or multiple server replicas, move the database and session store to managed services such as Postgres plus Redis. SQLite works best with one app instance and a persistent volume.

## Docker

```bash
docker build -t fitness-buddy .
docker run --env-file .env -p 3000:3000 -v "$PWD/data:/app/data" fitness-buddy
```
