# SignalDesk

**SignalDesk turns scattered customer feedback into an explainable, routed product queue.**

It is a local-first SaaS-style workspace for product and customer-success teams that need to capture the raw customer voice, decide what matters, assign the next move, and close the loop without sending customer data to a third-party AI service.

> Buildathon note: the task brief did not include the official 2026 track names, deadline, judging rubric, or video-duration requirement. This project is intentionally positioned as a productivity/workflow submission; verify the exact track and current submission requirements in the OmniRush dashboard before submitting.

## The problem

Customer feedback arrives as an unstructured stream: an email here, a support conversation there, a sales-call note in a document. The hard part is not collecting another inbox. It is making a consistent, defensible decision about each signal and making the next action visible to the team.

## The solution

SignalDesk gives each team a workspace with an end-to-end loop:

1. **Capture** a feedback signal with its original context, source, and customer.
2. **Triage** it with deterministic, human-readable rules that classify category, topics, sentiment, priority, confidence, and owner role.
3. **Route** it to Inbox, Planned, In progress, or Shipped with an owner and due date.
4. **Review** the summary counts and top topics for the workspace.
5. **Export** a CSV snapshot for a planning meeting or handoff.

The same-origin browser app and Node server run locally with no account, paid service, secret, network integration, or external AI API. An Expo Go client in `mobile/` uses the same API so the workflow is available on a phone as well as the website.

## Why it is demoable

The core demo is one visible workflow rather than a collection of disconnected screens:

- Open the seeded **SignalDesk Demo** workspace.
- Add a messy customer note such as a production checkout failure.
- Open the signal and run **Explainable triage**.
- Show the category, priority score, matched topics, rationale, recommended action, and owner role.
- Route it to Engineering, set a due date, move it to In progress, and export the workspace.

The triage engine is deliberately deterministic. The same input produces the same result, and the API returns the matched rule evidence instead of pretending that a black-box model made a judgment.

## Acceptance criteria

The MVP is complete when a person can:

- start the app from a clean checkout with one install command;
- open a seeded workspace or create an isolated workspace;
- capture and persist a signal;
- inspect a signal from the pipeline;
- run and re-run an explainable triage decision;
- update status, owner, and due date;
- see workspace-level counts and top topics;
- export the workspace as CSV; and
- complete the same capture, triage, routing, and share workflow from Expo Go; and
- run the automated tests without a database or network service.

## Quick start

Requirements:

- Node.js 22 or newer
- npm 10 or newer

The website runtime is pinned to Node `22.23.3` in `.nvmrc`. The Expo client has its own pinned Expo-compatible runtime in `mobile/.nvmrc` because the two app toolchains are independently reproducible.

From the repository root, the one-command local run is:

```bash
npm ci && npm start
```

For the preflight used before a demo or submission, run `npm run build` in a second terminal command. Then open [http://127.0.0.1:3000](http://127.0.0.1:3000).

The first run creates `data/signaldesk.json` and seeds a small demo workspace. Runtime data is ignored by Git because it may contain customer feedback. To use a different file:

```bash
SIGNALDESK_DATA_FILE=/absolute/path/to/signaldesk.json npm start
```

On Windows PowerShell, use:

```powershell
$env:SIGNALDESK_DATA_FILE = "$pwd\data\local.json"
npm start
```

The application binds to `127.0.0.1` by default. Set `HOST=0.0.0.0` only when you intentionally want another local container or machine to reach it.

## Commands

- `npm ci` — install the pinned dependency graph. SignalDesk has no runtime dependencies beyond Node built-ins.
- `npm run build` — syntax-check the server and browser code and verify the production asset shell.
- `npm run build:all` — run the website build checks and the Expo Babel check after both dependency trees are installed.
- `npm test` — run the Node test suite, including HTTP integration tests.
- `npm run test:all` — run the website tests and the Expo mobile syntax check.
- `npm run check` — run JavaScript syntax checks for all application code.
- `npm start` — start the local server.

### Expo Go mobile app

SignalDesk also includes a native mobile client in `mobile/` for Expo Go. The mobile client uses the same API and storage as the website, so a signal created on the website can be triaged and routed from a phone.

From a second terminal:

```bash
cd mobile
npm ci
```

Set the API host that the phone can reach. `127.0.0.1` means the phone itself, not the computer running the Node server. For a physical device, use the computer's LAN IPv4 address:

```bash
cp .env.example .env
# edit .env and set EXPO_PUBLIC_API_BASE_URL=http://192.168.1.42:3000
npx expo start --lan
```

Scan the QR code with Expo Go. The phone and computer must be on the same network, and the server should be started with `HOST=0.0.0.0` when the computer firewall allows LAN access:

```bash
HOST=0.0.0.0 npm start
```

For an Android emulator, use `http://10.0.2.2:3000/api`; for an iOS simulator, `http://127.0.0.1:3000/api` is usually appropriate. The mobile README contains the platform-specific troubleshooting steps. The mobile app can share the CSV through the native share sheet; it does not require a separate backend.

There is no web bundler step: the browser assets are intentionally plain, inspectable HTML, CSS, and JavaScript so the local demo is reproducible and easy to audit. The mobile client is bundled by Expo Metro when Expo Go starts.

## Architecture

```text
Browser (public/index.html, app.js, styles.css)  Expo Go (mobile/App.js)
              |                                      |
              +-------- JSON/CSV requests ---------+
                             |
                             v
                    Node 22 HTTP server (src/server.js)
              |
              +--> request validation + security headers
              +--> workspace/feedback persistence (src/store.js)
              +--> deterministic triage rules (src/triage.js)
              v
       data/signaldesk.json
```

### Workspace isolation

Every feedback request is scoped to `/api/workspaces/:workspaceId/...`. The store only looks up a signal inside the requested workspace, so an ID from another workspace cannot be patched or read. This is a local demonstration of the tenant boundary a hosted SaaS would keep in a database.

### Persistence

`src/store.js` uses a small JSON document with an atomic temporary-file write followed by rename. It is appropriate for a single local process and makes the demo easy to back up or inspect. It is not intended to be the storage layer for multiple production instances.

### Triage rules

`src/triage.js` does not call a model. It normalizes the submitted text and applies visible keyword rules for:

- category, such as bug, feature request, billing, account, performance, security, usability, or praise;
- topics, such as integrations, reporting, notifications, permissions, search, mobile, export, and workflow;
- sentiment from a small positive/negative lexicon;
- urgency from blocking, production, outage, security, and urgent language; and
- a bounded 0–100 priority score mapped to low, medium, high, or critical.

The result includes the matched category/topic/sentiment/urgency evidence, a rationale sentence, a suggested action, an owner role, and a confidence estimate. The score is a routing aid, not a promise that the feedback is objectively urgent. A teammate remains responsible for the decision.

### API surface

The browser uses these same-origin endpoints:

- `GET /api/health`
- `GET /api/workspaces`
- `POST /api/workspaces` with `{ "name": "Core product" }`
- `GET /api/workspaces/:workspaceId/summary`
- `GET /api/workspaces/:workspaceId/feedback?status=all|inbox|planned|in_progress|shipped`
- `POST /api/workspaces/:workspaceId/feedback` with `title`, `body`, `source`, and `customer`
- `POST /api/workspaces/:workspaceId/feedback/:feedbackId/triage`
- `PATCH /api/workspaces/:workspaceId/feedback/:feedbackId` with `status`, `owner`, and/or `dueDate`
- `GET /api/workspaces/:workspaceId/export.csv`

The server rejects malformed JSON, unknown patch fields, invalid status values, invalid dates, oversized request bodies, missing required fields, and paths outside the public directory. It also sends `nosniff`, frame, referrer, content-security, and permissions headers.

## Testing

The suite uses Node's built-in `node:test` runner and avoids a network dependency.

- `test/triage.test.js` protects deterministic scoring, category selection, sentiment, rationale, and rule evidence.
- `test/store.test.js` protects atomic persistence, re-opening a file, workspace mutation, and isolated test data.
- `test/server.test.js` exercises the real HTTP flow: workspaces, feedback creation, filtering, patching, re-triage, summary, cross-workspace isolation, CSV export, validation errors, body limits, static serving, and traversal handling.

Run the exact submission checks:

```bash
npm ci
npm --prefix mobile ci
npm run build
npm test
npm --prefix mobile test
# or the combined command:
npm run test:all
```

The website build and test commands, plus the mobile Babel check, should exit with code 0. The tests create temporary data files under the system temp directory and do not change the demo data. `npm run build:all` is the combined build preflight.

## Docker

A Dockerfile is included for a repeatable local container path:

```bash
docker build -t signaldesk:local .
docker run --rm -p 3000:3000 -v signaldesk-data:/app/data signaldesk:local
```

The data volume keeps the JSON store between container runs. Docker was not available in the supplied build environment, so the Docker image is prepared but not claimed as locally built or executed here. The non-Docker `npm ci && npm run build && npm start` path is the verified demo path.

The Expo development client has its own `mobile/Dockerfile` and dependency lockfile. Expo Go is normally easier to run directly on the host because the Metro development server and the phone need LAN discovery; the mobile Dockerfile is provided for a reproducible syntax-check/development-server environment, not as a store-ready mobile binary.

## Security and privacy posture

- No credentials, tokens, or environment secrets are required.
- Customer text is stored locally in the configured JSON file; do not use real sensitive data in a public demo.
- The server bounds JSON bodies at 256 KiB and validates all writable fields.
- User-controlled content is escaped before the browser injects it into the dashboard.
- The app has no login or authorization layer. A hosted deployment must add authentication, authorization, audit logging, encrypted storage, backups, and a real multi-tenant database before handling production customer data.
- The local JSON file is single-process storage. Concurrent multi-instance writes are out of scope.

## Demo and submission materials

- [Demo script](docs/demo-script.md) — a short, judge-friendly live walkthrough.
- [Recording checklist](docs/demo-checklist.md) — a preflight and shot list for the required video.

No deployment, publication, or buildathon submission has been performed from this workspace. In particular, there is no Submission ID in this repository. The participant must review the current dashboard requirements, record the video, publish the repository if desired, and submit it through the official OmniRush flow.

## How OmniRush was used

OmniRush is the only generative AI or agent tool used during development. It was used in this workspace to inspect the empty repository, choose and scope the MVP, implement the application, design tests, review the UI/API boundary, and run the local checks listed above. No other generative AI tool, agent, AI API, or generated visual asset was used. The product itself does not call an AI service at runtime.

## Limitations and next safe steps

The project is intentionally small enough to demonstrate reliably before a deadline. It does not include authentication, billing, team invitations, hosted database migrations, background jobs, external integrations, analytics, or an ML classifier. Those are product decisions for a production roadmap, not hidden features.

If this becomes a real service, the next safe step is to replace the JSON store behind the existing store interface with a transactional database and add an auth layer before adding integrations. The deterministic triage contract can remain as a transparent fallback even if a future product decision adds an optional model provider.

## License

SignalDesk is released under the [MIT License](LICENSE).
