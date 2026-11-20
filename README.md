# Restaurant Vision MVP

Organized TypeScript monorepo: Next.js dashboard, Express API, and PostgreSQL in Docker. The demo input is a staged recorded clip; inference is designed to run through a hosted model API. Business rules live in the API domain/application layers, not in React components or route handlers.

## Requirements

- Node.js 24 LTS (Node.js 22.13+ is also suitable for this setup).
- npm 10+.
- Docker Desktop / Docker Engine with Compose.

## Start locally

```bash
cp .env.example .env
npm install
npm run db:up
npm run dev
```

- Dashboard: http://localhost:3000
- API health: http://localhost:4000/api/health
- PostgreSQL: localhost:5432

The SQL schema is initialized when the PostgreSQL volume is first created. If you change the initial migration during early development, reset the local database with `docker compose down -v` and `npm run db:up` (this deletes local database data).

## Module boundaries

- `apps/web`: presentation and API client only.
- `apps/api/src/domain`: business entities, rules and domain services; framework and database independent.
- `apps/api/src/application`: use cases orchestrating domain and repository ports.
- `apps/api/src/infrastructure`: PostgreSQL, model-provider adapter, config and external services.
- `apps/api/src/interfaces/http`: Express routes, controllers, validation and middleware.

Model API credentials stay in the Express backend. Frames should be sampled from the local staged clip in memory and sent only to the configured provider. Never log or persist frame bytes or provider payloads; store event metadata only.

## Scope for the first demo

Recorded clip playback, configured table zones, Vacant/Seated state, unattended alert, hand-raise alert, and dashboard status. Defer live camera/RTSP, Iftar mode, tableware inference, wait-time prediction, authentication and multi-tenant support until the core demo works.
