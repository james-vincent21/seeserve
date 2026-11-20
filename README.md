# Restaurant Vision MVP

Organized TypeScript monorepo: Next.js dashboard, Express API, and PostgreSQL in Docker. The demo input is a staged recorded clip. Business rules live in the API domain/application layers, not in React components or route handlers.

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
- PostgreSQL: localhost:5433

The SQL schema is initialized when the PostgreSQL volume is first created. If you change the initial migration during early development, reset the local database with `docker compose down -v` and `npm run db:up` (this deletes local database data).

The dashboard defaults to `INFERENCE_MODE=mock`, which returns no detections. No model weights or hosted endpoint were provided, so real YOLO detections are not active yet. The HTTP provider is an integration seam, not a ready-to-call YOLOv8 endpoint; hosted services differ in URL, authentication, request body and response shape. The sample adapter currently posts JSON `{ "image": "<base64 JPEG>" }` and normalizes common YOLO-like box responses. Set `INFERENCE_MODE=http`, `INFERENCE_API_URL` and credentials only when you have a compatible endpoint.

## Demo flow

1. Select a staged clip in the dashboard and press **Reset & play**.
2. The browser samples a resized JPEG frame every 3 seconds by default and posts it to Express in memory. Express forwards it to the configured inference adapter; no frame is written to disk or database. The 100-frame session cap is configurable.
3. Edit the normalized 0–1 table polygons in `apps/api/src/config/demo-zones.ts` so they match your video. The initial six polygons are placeholders.
4. The API derives Vacant/Seated with a debounce, logs unattended and pose-based hand-raise events, and stores event metadata in PostgreSQL. Use **Staff visited** to acknowledge service and suppress the current unattended alert.

Hand-raise behavior requires a pose model returning 17 COCO keypoints. A detection-only YOLOv8 model will not produce the wrists/shoulders needed by that rule. State, alert thresholds, and sample rate are local demo defaults and should be tuned to the staged clip and model/API quota.

## Module boundaries

- `apps/web`: presentation and API client only.
- `apps/api/src/domain`: business entities, rules and domain services; framework and database independent.
- `apps/api/src/application`: use cases orchestrating domain and repository ports.
- `apps/api/src/infrastructure`: PostgreSQL, model-provider adapter, config and external services.
- `apps/api/src/interfaces/http`: Express routes, controllers, validation and middleware.

Model API credentials stay in the Express backend. Frames should be sampled from the local staged clip in memory and sent only to the configured provider. Never log or persist frame bytes or provider payloads; store event metadata only.

## Scope for the first demo

Recorded clip playback, configured table zones, Vacant/Seated state, unattended alert, hand-raise alert, and dashboard status. Defer live camera/RTSP, Iftar mode, tableware inference, wait-time prediction, authentication and multi-tenant support until the core demo works.
