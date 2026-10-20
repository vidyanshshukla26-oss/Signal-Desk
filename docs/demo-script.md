# SignalDesk demo script

Target length: 2–3 minutes. Keep the browser at `http://127.0.0.1:3000` and start with a clean demo data file or the seeded default workspace.

## 1. Set the scene — 15 seconds

Say:

> “SignalDesk is a local-first customer-feedback command center. It helps a small product team move from raw customer noise to an explainable next action without sending the feedback to an external AI service.”

Point to the local-first indicator, the workspace selector, and the four summary cards.

## 2. Show the existing queue — 20 seconds

- Open **SignalDesk Demo**.
- Point to the three seeded signals.
- Click the performance signal and show its source, customer, status, and triage insight.
- Click **Inbox** once to demonstrate status filtering, then return to **All**.

Say:

> “The pipeline is scoped to a workspace, and every signal has a visible lifecycle: Inbox, Planned, In progress, or Shipped.”

## 3. Capture a fresh signal — 30 seconds

Click **Add signal** and enter:

- **Title:** Checkout fails for every customer
- **What happened?:** Checkout is broken in production and every customer is blocked by a timeout. This is urgent and we need an owner today.
- **Source:** Support
- **Customer:** Orbit Health

Save it, open the new signal, and call out the toast and the new Inbox count.

## 4. Make the decision explainable — 35 seconds

Click **Run triage again**.

Point to:

- the Type and Priority chips;
- the priority score out of 100;
- the matched topics and owner route;
- **Why this matters**; and
- **Recommended next action**.

Say:

> “This is not a black box in the demo. The result is deterministic keyword/rule scoring, and the API keeps the matched evidence and rationale so a teammate can challenge the recommendation.”

## 5. Route the work — 25 seconds

In **Route this signal**:

- set **Status** to **In progress**;
- set **Owner** to `Engineering`; and
- set a near-future due date.

Save routing. Show the status pill change and the summary cards update.

## 6. Close the loop — 15 seconds

Click **Export CSV** and mention that the current workspace can be handed to a planning meeting or preserved as an audit snapshot.

Finish with:

> “The verified local path is `npm ci`, `npm run build`, `npm test`, then `npm start`. The remaining production work is authentication and database-backed multi-instance storage, which are explicitly out of scope for this reliable MVP.”

## Backup path if the live form is slow

Use the seeded signals only. Open the performance signal, re-run triage, update its owner/status, and export CSV. The core workflow is still visible without adding new data.

## Optional Expo Go companion shot — 25 seconds

If the mobile demo is part of the recording:

- Start the API with `HOST=0.0.0.0 npm start`.
- Set `EXPO_PUBLIC_API_BASE_URL` to the computer's LAN address and run `npx expo start --lan` from `mobile/`.
- Open SignalDesk in Expo Go and show the same workspace and signal queue.
- Open the same signal, tap **Run triage**, and show the native routing controls.
- Tap **Share CSV** to open the device share sheet.

Say:

> “The phone client is not a second data store. It is an Expo Go client over the same API, so the website and mobile experience share the same workspace, triage rules, and routing decisions.”
