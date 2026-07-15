#!/usr/bin/env pwsh
# Thin CLI over second-opinion.mjs: pipe one claim or dossier, get GLM-5.2's AGREE/DISAGREE/UNSURE verdict as one line of JSON.
$root = Split-Path -Parent $PSScriptRoot
$helper = Join-Path $root '.claude/skills/second-opinion/second-opinion.mjs'

function Show-Usage {
  @'
agent-review - cross-model second opinion (GLM-5.2 via opencode) on one claim.

Usage:
  agent-review --claim "<one-line claim>"        # claim as arg, dossier built for you
  agent-review < dossier.txt                      # full dossier (title/severity/path:line/code) on stdin
  agent-review --claim "<c>" --model <slug> --timeout <ms>
  agent-review --help | -h

Behavior:
  Resolves the repo root from the script location, so it runs from any cwd.
  With --claim and empty stdin, sends the claim as the dossier; otherwise forwards stdin verbatim.
  Delegates to second-opinion.mjs, prints its single-line JSON, and passes the exit code through.

Exit codes:
  0  a JSON verdict was printed (OK) or opencode was UNAVAILABLE (graceful, still JSON)
  1  usage error: no --claim and empty stdin, or an unknown flag
'@
}

$claim = ''
$pass = @()
$i = 0
while ($i -lt $args.Count) {
  switch ($args[$i]) {
    { $_ -in '-h', '--help' } { Show-Usage; exit 0 }
    '--claim' { $claim = $args[$i + 1]; $i += 2 }
    '--model' { $pass += @('--model', $args[$i + 1]); $i += 2 }
    '--timeout' { $pass += @('--timeout', $args[$i + 1]); $i += 2 }
    default { [Console]::Error.WriteLine("agent-review: unknown argument: $($args[$i]) (run --help)"); exit 1 }
  }
}

$dossier = ''
if ([Console]::IsInputRedirected) { $dossier = [Console]::In.ReadToEnd() }
if ([string]::IsNullOrEmpty($dossier)) { $dossier = $claim }
if ([string]::IsNullOrEmpty($dossier)) {
  [Console]::Error.WriteLine('agent-review: no --claim and empty stdin (run --help)')
  exit 1
}

$dossier | & node $helper @pass
exit $LASTEXITCODE
