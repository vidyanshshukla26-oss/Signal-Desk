# Recording checklist

## Before recording

- [ ] Verify the official buildathon track, deadline, video duration, judging rubric, and submission fields in the OmniRush dashboard. They were not included in the project brief.
- [ ] Use a clean checkout and run `npm ci`.
- [ ] Run `npm run build` and `npm test`; keep the successful terminal output available for the description or final frame.
- [ ] Start the app with `npm start` and confirm `http://127.0.0.1:3000` loads.
- [ ] Use demo or fictional customer information only. Do not record real customer data, secrets, tokens, or private URLs.
- [ ] Hide unrelated browser tabs, notifications, credentials, and desktop content.
- [ ] Set the browser zoom so the sidebar, summary cards, pipeline, and detail panel fit on screen.
- [ ] Keep the browser console and terminal out of the main recording unless showing the verified command results.

## Required shots

- [ ] Opening frame: SignalDesk name, local-first mode, and the workspace dashboard.
- [ ] Workspace selector with the seeded demo workspace.
- [ ] Signal pipeline with status filters and at least one detail panel.
- [ ] Add-signal form with a fictional production issue.
- [ ] Explainable triage result showing type, priority/score, topics, rationale, and next action.
- [ ] Routing change showing owner, due date, and a new pipeline status.
- [ ] CSV export action or downloaded file confirmation.
- [ ] Closing frame with the verified local commands and a brief limitations note.

## Optional Expo Go shots

- [ ] Start the API on the LAN with `HOST=0.0.0.0 npm start`.
- [ ] Set the mobile `.env` API origin to the computer's LAN address, without `/api` at the end.
- [ ] Start Expo with `npx expo start --lan` from `mobile/` and scan the QR code.
- [ ] Show the same workspace and signal queue in Expo Go.
- [ ] Open a signal, run triage, update routing, and show the native CSV share sheet.
- [ ] Do not record the device's real notifications, account names, private network details, or customer data.

## Narration reminders

- [ ] Say that the product runs locally and does not call an external AI API.
- [ ] Describe the triage as deterministic and explainable; do not call it machine learning or claim autonomous judgment.
- [ ] Explain that the current JSON store is a demo-friendly single-process store, not production multi-tenant infrastructure.
- [ ] Say what OmniRush did during development truthfully: repository inspection, implementation, test design, and verification.
- [ ] Do not claim deployment, external publication, a judge result, or a Submission ID unless those actions actually happen in the dashboard.

## After recording

- [ ] Watch the recording once for readable text, visible errors, accidental private data, and audio clarity.
- [ ] Confirm the main workflow completes in one take or use the seeded backup path.
- [ ] Keep the final repository path, exact test output, demo URL, and recording file organized for the submission form.
- [ ] Submit only after reviewing the official rules and any required disclosure fields.
