#!/usr/bin/env bash
# Thin CLI over second-opinion.mjs: pipe one claim or dossier, get GLM-5.2's AGREE/DISAGREE/UNSURE verdict as one line of JSON.
root="$(cd "$(dirname "$0")/.." && pwd)"
helper="$root/.claude/skills/second-opinion/second-opinion.mjs"

usage() {
  cat <<'EOF'
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
EOF
}

claim=""
pass=()
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --claim) claim="${2:-}"; shift 2 ;;
    --model) pass+=(--model "${2:-}"); shift 2 ;;
    --timeout) pass+=(--timeout "${2:-}"); shift 2 ;;
    *) echo "agent-review: unknown argument: $1 (run --help)" >&2; exit 1 ;;
  esac
done

dossier=""
[ -t 0 ] || dossier="$(cat)"
[ -n "$dossier" ] || dossier="$claim"
if [ -z "$dossier" ]; then
  echo "agent-review: no --claim and empty stdin (run --help)" >&2
  exit 1
fi

printf '%s' "$dossier" | node "$helper" "${pass[@]}"
exit $?
