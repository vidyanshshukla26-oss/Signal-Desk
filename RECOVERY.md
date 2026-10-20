# SignalDesk recovery

The application source is currently missing from the working directory. The local
Git reflog records the original application commit as:

`7a4057ef263816b08f8b3fad6b20aa64a134d952` — `chore: initialize SignalDesk app`

Its loose commit object is still present. The tree and referenced file objects
have **not** yet been verified: the OmniRush command sandbox is unavailable.
The reflog subsequently records repeated replacement histories; do not reset to
the current HEAD expecting it to contain the app.

## Recover from a normal PowerShell terminal

Open PowerShell in this project folder and run:

```powershell
./restore-signaldesk.ps1
```

The script verifies the commit and required application paths, exports the
snapshot into a uniquely named `.recovery/` folder, and copies only missing files
back into the project. Existing files are preserved, and copied files are
SHA-256 checked against the extracted snapshot. Local environment files (except
`.env.example`), database/customer-data files under `data/`, and dependencies are
not copied back. Keep the recovery snapshot private; it contains historical files.

The script does not change branches, reset history, delete files, commit, push,
install dependencies, or deploy anything. Do not stage `.recovery/` for commit.
If execution policy blocks the script, use your organization's approved method
for running reviewed local scripts rather than changing global policy.

## Verify after recovery

```powershell
git status --short
npm ci
npm run build
npm test
```

If `mobile/package.json` and `mobile/App.js` are recovered:

```powershell
npm --prefix mobile ci
npm --prefix mobile test
```

These commands have not been run during this recovery attempt. The script may
recover an older revision; changes made after the original commit may need to
be reapplied after inspecting the restored files. SQL, Vercel, and Render support
was requested later and has not been implemented.
