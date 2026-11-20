# Restaurant Vision MVP

Organized TypeScript monorepo: Next.js dashboard, Express API, and PostgreSQL in Docker. The demo input is a staged recorded clip; inference is designed to run through a hosted model API. Business rules live in the API domain/application layers, not in React components or route handlers.

## Requirements

- Node.js 24 LTS (Node.js 22.13+ is also suitable for this setup).
- npm 10+.
- Docker Desktop / Docker Engine with Compose.

## Run the demo locally

```bash
npm install
cp .env.example .env
npm run dev
```

`npm run dev` starts the Next.js dashboard and Express API together. Open **http://localhost:3000**, select an MP4, MOV, or WEBM clip, then click **Reset & play**. The dashboard samples the playing video every 3 seconds and shows the detected people, chairs, and table counts. The API allows up to 100 analyzed frames per session; click **Reset & play** to start a fresh session.

- Dashboard: http://localhost:3000
- API health: http://localhost:4000/api/health

The demo does not need PostgreSQL. To use the separate database-backed `/api/tables` endpoint as well, start PostgreSQL with `npm run db:up`; it is available on localhost:5433.

The default inference mode uses the hosted Ultralytics YOLOv8 model. `ULTRALYTICS_API_KEY` in `.env` is optional for the public model, but add a key there if your account or rate limit requires one. Sampled frames are sent from the API to Ultralytics for inference. The original video is selected and played in the browser; the app does not save it on the server. To run the dashboard without hosted inference, set `INFERENCE_MODE=mock` in `.env` (detections will be empty).

To run the services in separate terminals instead, use `npm run dev:api` and `npm run dev:web` from the repository root.

The SQL schema is initialized when the PostgreSQL volume is first created. If you change the initial migration during early development, reset the local database with `docker compose down -v` and `npm run db:up` (this deletes local database data).

## Module boundaries

- `apps/web`: presentation and API client only.
- `apps/api/src/domain`: business entities, rules and domain services; framework and database independent.
- `apps/api/src/application`: use cases orchestrating domain and repository ports.
- `apps/api/src/infrastructure`: PostgreSQL, model-provider adapter, config and external services.
- `apps/api/src/interfaces/http`: Express routes, controllers, validation and middleware.

The default model is the public Ultralytics `ultralytics/yolov8/yolov8n` model via the shared inference API. The Express backend sends one sampled JPEG at a time as an in-memory multipart upload. It does not save or log the frame or response. Public model inference can work without an API key; if using one, keep `ULTRALYTICS_API_KEY` only in `.env` and never commit it. This sends image data to Ultralytics, so its service data policy applies. The shared API rate limit is 20 requests per minute; the dashboard samples every 3 seconds and caps a session at 100 frames. Current `.env` thresholds are shortened for the presentation demo.

The demo layout targets the supplied clip and has three table zones ordered left-to-right. The configured minimum capacities are 4, 5, and 4 seats; person boxes determine occupied seats, while chair boxes outside person boxes add vacant seats. Adjust the zone polygons and minimum capacities in `apps/api/src/config/demo-zones.ts` if the camera framing or clip changes. YOLOv8n returns person boxes, not pose keypoints, so hand-raise alerts need a pose model and are not active with this default model.

## Scope for the first demo

Recorded clip playback, configured table zones, Vacant/Seated state, unattended alert, hand-raise alert, and dashboard status. Defer live camera/RTSP, Iftar mode, tableware inference, wait-time prediction, authentication and multi-tenant support until the core demo works.
