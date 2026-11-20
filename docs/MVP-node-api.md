# Restaurant Vision Platform — Node.js MVP Build Brief

Updated 20 Nov 2026 from the original MVP guide. This version assumes inference is provided by a hosted pretrained-model API. It does not require Python or model training.

## 1. Goal

Build a laptop-demo MVP that replays one staged recorded video showing 4–6 configured tables. The presentation uses this clip as its only video input; live camera and RTSP are out of scope. Show table states and alerts on a live dashboard, and optionally send Telegram notifications. Demonstrate unattended guests, hand raises, Standard/Iftar mode, and that no footage is retained.

The project is a prototype. Detection quality, API latency, privacy terms, free-tier quotas, and commercial rights must be checked with the chosen inference provider before relying on this design.

## 2. Stack

- **App:** Next.js with TypeScript (App Router), Node.js runtime for server routes and the video worker.
- **UI/live updates:** React dashboard; Server-Sent Events (SSE) or WebSocket for state updates.
- **Inference:** Hosted pretrained detection/pose API, called from a server-side Node module. Keep provider-specific code behind an `InferenceProvider` interface so it can be replaced.
- **Video:** Play one local staged clip from the laptop and decode/sample frames in the Node process. No camera setup, RTSP, video upload UI, or production streaming in this MVP. Replaying the same clip makes the presentation repeatable.
- **Logic:** TypeScript table state machine, timers, zone geometry, alert de-duplication and mode rules. No ML needed for these rules.
- **Storage:** SQLite for local event metadata; PostgreSQL only when deploying multi-user/cloud service.
- **Notifications:** Telegram Bot HTTP API (optional), with credentials in environment variables.
- **Config:** JSON or YAML for zone polygons, thresholds and modes.

Do not select a model endpoint until it is confirmed to support the needed outputs: person boxes, stable tracking IDs or enough data to track locally, and pose keypoints for hand-raise detection. If it does not return IDs, implement short-lived anonymous tracking in Node. Tableware detections are optional and can be deferred; the manager can mark a table Finished manually.

## 3. Video, API and privacy design

1. Decode frames in memory and sample at a configured low rate (start at 1–2 frames/second for cost control; raise only after measuring latency and quota). Resize/compress in memory to the provider's documented input limits.
2. Send only sampled frames to the selected inference API over HTTPS. **This means image data leaves the laptop and is transmitted to the provider.** The original “never send images/video over a network” rule is incompatible with hosted inference and is replaced by this explicit exception.
3. Before using real diners, review provider retention, training-use, region, security and deletion terms. For the demo, use staged/consented footage. Do not send frames to Telegram, logs, analytics, or the dashboard.
4. Never save source footage, sampled frames, crops, thumbnails, or annotated images. Disable request/body logging for inference routes. Do not persist provider payloads. Keep only anonymous IDs, table IDs, event types, timestamps, durations, and mode in SQLite.
5. No face identification, face embeddings, re-identification, or names. Keep only transient anonymous track IDs. Do not store clothing/appearance descriptors; if a staff-vs-guest heuristic is unreliable without those, omit it and use manager-confirmed staff visits for the MVP.
6. Prefer local Node deployment for the video-processing loop. A serverless deployment may time out, lack persistent workers, or incur egress/inference cost; do not assume it can handle continuous video.
7. Add a visible clip/API status indicator. On API failure, pause inference and show an error; do not silently queue frames for later upload.

## 4. Cost: can the MVP be free?

**A no-cost prototype is possible, but a hosted-inference MVP is not guaranteed to stay free.** Next.js, Node.js, SQLite, and Telegram can be used without paying for software. A laptop and one staged clip avoid hosting and camera costs. A short presentation run can fit a provider free quota if the selected API offers one and the request budget is kept low; this must be checked, not assumed. The inference API is the variable: free credits/tiers may be limited, rate-limited, unavailable for sustained video, or subject to provider terms. Continuous analysis can quickly exceed a free quota.

Keep the demo short, sample sparsely, set a hard request/frame budget, and display usage. Check current provider pricing and free-tier terms before choosing one; do not promise “free forever.” If the API has no suitable free tier, alternatives are a local pretrained model (which changes the no-Python preference only if the chosen runtime requires it) or a paid inference budget. Commercial use may add model/provider licensing and privacy obligations.

## 5. Suggested repository structure

```text
restaurant-vision/
  AGENTS.md
  README.md
  docs/MVP-node-api.md
  config/
    settings.json
    zones.json
    modes.json
  src/
    app/                    # Next.js dashboard and route handlers
    server/video/            # in-memory source, sampling, lifecycle
    server/inference/        # provider interface + selected adapter
    server/vision/           # zones, optional local ID association
    server/logic/            # table states, hand raise, modes, timers
    server/events/           # SQLite metadata writer
    server/alerts/           # Telegram + deduplication
    server/realtime/         # SSE/WebSocket updates
  tools/
    check-no-footage.ts
  tests/
    table-state.test.ts
    hand-raise.test.ts
    modes.test.ts
```

Data flow: video source → in-memory sampler → server-side inference adapter → normalized detections/keypoints → zone and table logic → metadata events → dashboard stream/Telegram text alert. Only the video and inference modules handle frame bytes. The inference provider receives the sampled frames; all later modules receive structured numeric results only.

## 6. MVP behavior and honest limits

- States: Vacant, Seated, Eating, Finished, Away. Start with Vacant/Seated; add others only after the core demo works.
- Unattended alert: guest is seated, no staff visit has been confirmed, and configured threshold passes. Allow a manager/staff visit action in the UI if staff classification is omitted.
- Hand raise: guest-associated keypoint has a wrist above shoulder for configured hold duration, only inside a table zone, with a per-table cooldown. API latency is part of end-to-end response time.
- Iftar mode changes configured thresholds and suppresses early alerts according to the SRS rule.
- Eating/Finished inferred from tableware is optional and weak. Provide a manager “Finished” action and state this limitation in the demo.
- Wait-time prediction remains a fixed-duration stub or can be deferred.

## 7. Build milestones

1. **Foundation:** Create Next.js/TypeScript app, config schema, local dashboard shell and no-footage checker. Confirm the staged clip can be read locally and that no frames are written.
2. **Provider spike:** Select one hosted API; confirm image input format, people/pose outputs, quotas, latency, retention and pricing. Implement one server-side request using a staged frame held only in memory. Add request budget and failure handling.
3. **Zones and basic states:** Configure 4–6 polygons; map person detections to zones; implement Vacant/Seated and debounce. Test with fake detections and timestamps.
4. **Unattended alert:** Add threshold, staff-visit reset/action, one alert per seating, mode-aware logic and dashboard event stream.
5. **Hand raise:** Consume API keypoints; implement hold duration and cooldown. Test sustained raise vs quick stretch using fake keypoints.
6. **Events and notification:** SQLite event-only schema, dashboard alerts and optional Telegram text sender with deduplication. Never include images.
7. **Modes and remaining states:** Standard/Iftar switch; optionally add Eating, Finished, Away and wait stub.
8. **Presentation run:** Replay the same short staged clip from beginning to end while the dashboard updates. Inspect logs/database/network behavior, run the no-footage checker, measure API calls and alert latency, and document misses/false alerts and known limits. Keep a hard per-run request cap.

## 8. Agent instructions (paste into AGENTS.md)

```md
# Restaurant floor-intelligence MVP (Next.js + Node, hosted inference)

## Goal
Build a prerecorded-clip presentation MVP for 4–6 tables with table states, unattended alerts and hand-raise calls. Follow docs/MVP-node-api.md and docs/SRS.md.

## Privacy and data rules
- Frames are transient in memory and are sent only to the explicitly configured inference provider over HTTPS. This provider transmission is an intentional exception to the original local-only rule.
- Never save video, frames, crops, thumbnails or annotated images. Never send images to Telegram, browser clients, logs or analytics.
- Disable request/body logging on routes handling image bytes. Never persist inference request/response payloads.
- No face identification, face embeddings, re-identification, names, or persistent appearance descriptors.
- Persist event metadata only: table ID, event type, timestamps, durations and mode.
- Use staged/consented video until provider retention and data-use terms have been reviewed.
- On provider failure, stop sampling/sending and show an error; do not queue frames.

## Stack and implementation
- TypeScript, Next.js, Node.js server runtime, SQLite, SSE or WebSocket.
- Use a provider interface; keep API keys server-side in environment variables.
- Work on one milestone at a time. Do not add features beyond its prompt.
- Pure logic must accept timestamps and fake detections/keypoints so it can be tested without video or API calls.
- Put thresholds in config, not scattered constants. Keep provider quotas and a hard per-run request cap configurable.

## Done check
Run the project checks requested for the milestone, run tools/check-no-footage.ts, and report changes, API calls/latency where relevant, and open issues. Do not claim a free tier or privacy property that has not been verified for the selected provider.
```

## 9. First provider-spike prompt

“Implement milestone 2 only. First compare candidate inference APIs against the requirements in this brief (person boxes, pose keypoints, stable IDs or a viable local association plan, free-tier limits, latency, retention and pricing). Use current official provider documentation and cite it in a short decision note. Then implement a server-only `InferenceProvider` interface and one adapter for the selected candidate, with a hard request budget and a test using mocked HTTP. Read one staged image into memory for the spike; do not write it to disk or log its contents. If no candidate meets the requirements within the no-cost demo budget, stop after documenting the gap and propose the smallest scope change.”

## 10. Demo checks

- Dashboard changes Vacant/Seated as staged people enter/leave table zones.
- One unattended alert fires at the configured threshold and clears/resets after a staff visit.
- Sustained hand raise alerts the correct table; a brief stretch does not.
- Iftar mode applies the configured early-alert suppression.
- No media files are created; SQLite contains event metadata only; logs contain no frame bytes or provider payloads.
- Report measured API request count, end-to-end alert latency, false alerts/misses, and the provider's free-tier usage for the clip replay.
