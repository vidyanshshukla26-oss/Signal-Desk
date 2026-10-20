param(
    [string]$SourceCommit = '7a4057ef263816b08f8b3fad6b20aa64a134d952'
)

# Run from a normal PowerShell terminal. No reset, checkout, clean, or push.
# Existing files are never overwritten. The full snapshot stays in .recovery/.
$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
Push-Location $Root
try {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw 'Git is required. Open a terminal where Git is installed and retry.'
    }
    if ($SourceCommit -notmatch '^[0-9a-fA-F]{40}$') {
        throw 'SourceCommit must be a full 40-character Git commit hash.'
    }
    & git cat-file -e "$SourceCommit^{commit}"
    if ($LASTEXITCODE -ne 0) { throw 'The recovery commit is unavailable. No files were restored.' }

    $Files = @(& git ls-tree -r --name-only $SourceCommit)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read the recovery snapshot.' }
    foreach ($Required in @('package.json', 'src/server.js', 'src/store.js', 'public/index.html')) {
        if ($Files -notcontains $Required) {
            throw "Snapshot is missing $Required. Stop here and inspect Git history; nothing was restored."
        }
    }

    $Recovery = Join-Path $Root ('.recovery/' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $Recovery | Out-Null
    $Archive = Join-Path $Recovery 'snapshot.zip'
    $Snapshot = Join-Path $Recovery 'snapshot'
    & git archive --format=zip "--output=$Archive" $SourceCommit
    if ($LASTEXITCODE -ne 0) { throw 'Git archive failed. Working files remain unchanged.' }
    Expand-Archive -LiteralPath $Archive -DestinationPath $Snapshot

    $Restored = 0
    $Preserved = 0
    $Skipped = 0
    foreach ($Relative in $Files) {
        # Never restore credentials, runtime customer data, dependencies or Git metadata.
        if ($Relative -match '(^|/)(\.git|node_modules|\.recovery)(/|$)' -or
            $Relative -match '(^|/)\.env($|\.)' -and $Relative -notmatch '(^|/)\.env\.example$' -or
            $Relative -match '^data/.+\.(json|db|sqlite|sqlite3)$') {
            $Skipped++
            continue
        }
        $Destination = [IO.Path]::GetFullPath((Join-Path $Root $Relative))
        $Prefix = $Root.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
        if (-not $Destination.StartsWith($Prefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Unsafe path encountered. Recovery stopped.'
        }
        $Source = Join-Path $Snapshot $Relative
        if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
            throw "Snapshot file unavailable: $Relative"
        }
        if (Test-Path -LiteralPath $Destination) {
            $Preserved++
            continue
        }
        $Parent = Split-Path -Parent $Destination
        if (-not (Test-Path -LiteralPath $Parent)) {
            New-Item -ItemType Directory -Path $Parent -Force | Out-Null
        }
        # overwrite=false also protects against a file appearing after Test-Path.
        [IO.File]::Copy($Source, $Destination, $false)
        if ((Get-FileHash -LiteralPath $Source).Hash -ne (Get-FileHash -LiteralPath $Destination).Hash) {
            throw "Restored file hash mismatch: $Relative"
        }
        $Restored++
    }
    Write-Host "Recovered $Restored missing files; preserved $Preserved existing files; skipped $Skipped sensitive/runtime paths."
    Write-Host "Original snapshot retained at: $Snapshot"
    if ($Files -notcontains 'mobile/App.js') {
        Write-Warning 'This snapshot does not include mobile/App.js. Mobile recovery requires another snapshot.'
    }
    Write-Host 'No commits, branch changes, resets, or external operations were performed.'
    Write-Host 'Next: inspect git status, then run npm ci, npm run build, and npm test.'
    Write-Host 'For mobile, if present: npm --prefix mobile ci; npm --prefix mobile test.'
} finally {
    Pop-Location
}
