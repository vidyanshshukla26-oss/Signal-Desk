# SignalDesk Mobile

SignalDesk Mobile is an Expo Go-compatible React Native client for the existing SignalDesk API. It keeps the workflow intentionally small and native: choose a workspace, review its queue, inspect explainable triage, route the next move, capture a new signal, and share a CSV snapshot.

## Requirements

- Node.js **20.19.4** (the pinned version in `.nvmrc`)
- npm 10 or newer
- Expo Go on a device for a physical-device run, or an iOS/Android simulator
- The SignalDesk API from the repository root

The Expo SDK, React, React Native, Babel preset, and runtime constraint are pinned in `package.json`; `package-lock.json` is the reproducible dependency lockfile.

## Setup

From the `mobile/` directory inside the repository:

```bash
nvm install
nvm use
npm ci
cp .env.example .env
```

The app reads `EXPO_PUBLIC_API_BASE_URL` at bundle time. The documented fallback is `http://127.0.0.1:3000`, which works for a desktop browser-style run and usually works for an iOS Simulator. A physical phone cannot use its own `localhost`; use the LAN setup below.

For the Android Emulator, use `http://10.0.2.2:3000` instead of `127.0.0.1` because the emulator reserves `10.0.2.2` for the host machine.

## Run with Expo Go

Start the API in a separate terminal from the repository root:

```bash
# From the repository root:
npm ci
HOST=0.0.0.0 npm start
```

PowerShell equivalent:

```powershell
# From the repository root:
npm ci
$env:HOST = "0.0.0.0"
npm start
```

Then start the mobile app from the repository's `mobile/` directory:

```bash
npm ci
npx expo start --lan
```

Scan the QR code with Expo Go, or press `a`/`i` for a connected emulator or simulator. The `npm start` script is also available and runs the same LAN command:

```bash
npm start
```

## Physical-device LAN setup

1. Put the phone and the computer running the API on the same Wi-Fi network.
2. Find the computer's private LAN address (for example, `192.168.1.42`).
3. Copy `.env.example` to `.env` and set the API origin to that address:

   ```dotenv
   EXPO_PUBLIC_API_BASE_URL=http://192.168.1.42:3000
   ```

4. Start the API with `HOST=0.0.0.0 npm start` from the repository root. If the computer firewall asks, allow Node to accept connections on the private network.
5. Restart Expo after changing `.env` so the public environment value is bundled, then run `npx expo start --lan` and scan its QR code in Expo Go.

Use the API origin without `/api` or a trailing slash, for example `http://192.168.1.42:3000`; the client also tolerates either suffix and normalizes it. The app shows the resolved API host in the “LOCAL-FIRST” badge so a device connection can be checked at a glance.

## What is included

- Workspace list, creation, and switching
- Summary metric cards for total, inbox, in-progress, and shipped signals
- Status filter chips backed by the API
- Signal list and selected signal detail
- Deterministic triage action backed by `POST /triage`
- Status, owner, and due-date routing backed by `PATCH`
- Add-signal modal with validation and inline error feedback
- Loading, empty, request error, refresh, and toast feedback states
- Accessible labels, selected states, and hints on interactive controls
- Native CSV sharing: fetches `/api/workspaces/:workspaceId/export.csv`, then calls `Share.share`

## Checks

Run the single offline syntax check from this directory:

```bash
npm test
```

It transforms `App.js` with the pinned Expo Babel preset, which validates the JSX and JavaScript without requiring a running API or network request. `npm ci` must be run first so the locked toolchain is installed.

## Deploy / distribute a native build

The app includes `eas.json` with preview and production profiles. After installing the local dependencies, authenticate with an Expo account and build with EAS CLI:

```bash
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

For a production Android or iOS build:

```bash
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest build --platform ios --profile production
```

Submit a completed store build with:

```bash
npx eas-cli@latest submit --platform android
npx eas-cli@latest submit --platform ios
```

Set `EXPO_PUBLIC_API_BASE_URL` to the deployed API origin in the EAS build environment before producing a distributable build. Do not commit `.env`, API keys, or other secrets; only `.env.example` belongs in this folder.

## Docker

The local `Dockerfile` installs the locked JavaScript dependencies, runs the mobile syntax check during the image build, and starts Expo's LAN development server:

```bash
docker build -t signaldesk-mobile:local .
docker run --rm -it -p 8081:8081 -p 19000:19000 -p 19001:19001 -p 19002:19002 \
  -e EXPO_PUBLIC_API_BASE_URL=http://host.docker.internal:3000 \
  signaldesk-mobile:local
```

For a phone to reach the API from Docker, replace `host.docker.internal` with the API machine's LAN address when needed. The regular host `npm ci && npx expo start --lan` flow is the simplest Expo Go path.
