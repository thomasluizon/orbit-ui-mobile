#!/usr/bin/env bash
#
# rollup.sh - thin cross-repo CI/nightly health roll-up for the three Orbit repos.
#
# Reads the LATEST main-branch run of each tracked quality gate across
# orbit-ui-mobile, orbit-api and orbit-landing-page via `gh run list`, classifies
# each run, and prints ONE consolidated GREEN/RED verdict. It re-runs and re-audits
# nothing: it only reads run conclusions other workflows already produced. This is
# the read-only meta-gate, distinct from /validate (which executes lint/type/test)
# and /prod-readiness (an LLM pre-launch audit).
#
# Exit codes (a caller branches on these):
#   0  GREEN       every hard-tier gate's latest main run is success, pending or no-run-yet
#   1  RED         at least one hard-tier gate's latest main run failed
#   2  TOOL ERROR  gh is unauthenticated/unreachable, or a hard-tier workflow no longer
#                  resolves on its default branch (HTTP 404 = the tracked table drifted)
#
# Auth: reads GH_TOKEN / GITHUB_TOKEN from the environment (never argv), exactly as
# `gh` does natively. Reads all three PUBLIC repos. In CI the default GITHUB_TOKEN can
# read a public sibling repo's Actions runs; if a cross-repo read ever 403s, set a
# fine-grained PAT with `actions: read` on the two siblings as ROLLUP_CROSS_REPO_TOKEN
# (see .github/workflows/rollup.yml). Uses gh's built-in --jq, so no external jq/node.

set -u

usage() {
  cat <<'EOF'
rollup.sh - thin cross-repo CI/nightly health roll-up (all three Orbit repos).

Usage:
  bash tools/rollup.sh          Read every tracked gate's latest main run and print
                                one markdown report ending in a single verdict line.
  bash tools/rollup.sh --help   Print this usage and exit 0.

What it does:
  For each tracked workflow it runs `gh run list --workflow <file> --branch main -L 1`
  and classifies the latest run. It executes NO tests and audits nothing - it reads
  run conclusions only. Output is markdown on stdout; errors go to stderr.

Tiers:
  Hard      main-signal quality gates; a failed latest main run turns the verdict RED.
  Advisory  PR gates (enforced at merge by branch protection) + prod smoke; shown,
            never reddens the verdict.
  Excluded  release/promote/reminder/auto-merge/dependency-review/LLM-review machinery.

Exit codes:
  0  GREEN       all hard gates green (pending / no-run-yet count as green-with-note)
  1  RED         a hard gate's latest main run failed
  2  TOOL ERROR  gh unauthenticated/unreachable, or a hard workflow 404s (table drift)

Auth:
  Reads GH_TOKEN / GITHUB_TOKEN from the environment. No secrets in argv.
EOF
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  "") ;;
  *) printf 'rollup.sh: unknown argument: %s\n\n' "$1" >&2; usage >&2; exit 2 ;;
esac

UI="thomasluizon/orbit-ui-mobile"
API="thomasluizon/orbit-api"
LANDING="thomasluizon/orbit-landing-page"

# Hard-verdict gates: the workflows that genuinely produce a main-branch health
# signal (push-to-main or scheduled). A failed latest main run here turns the
# verdict RED. UI sonarcloud/api sonarcloud carry the build+test+coverage signal on
# push to main; UI nightly/api mutation are the full nightly mutation runs; UI
# commit-sweep, api benchmark and landing nightly are the scheduled report gates.
# Format: "<repo>|<workflow-file>".
HARD_GATES=(
  "$UI|sonarcloud.yml"
  "$UI|nightly.yml"
  "$UI|commit-sweep.yml"
  "$API|sonarcloud.yml"
  "$API|mutation.yml"
  "$API|benchmark.yml"
  "$LANDING|nightly.yml"
)

# Advisory gates: PR-only gates already enforced at merge by branch protection (so
# --branch main returns no run) plus prod smoke (push to main, but red-flaky on
# smoke-account state). Shown for context; NEVER reddens the verdict.
ADVISORY_GATES=(
  "$UI|test.yml"
  "$UI|mutation.yml"
  "$UI|react-doctor.yml"
  "$UI|visual.yml"
  "$UI|perf.yml"
  "$UI|smoke-prod.yml"
  "$API|test.yml"
  "$LANDING|build.yml"
)

# classify_gate <repo> <workflow-file>
# Echoes "<CLASS>\t<detail>". CLASS is one of:
#   GREEN PENDING NORUN SKIPPED OTHER   (non-gating)
#   RED MISSING ERROR                   (gating: RED->exit1, MISSING/ERROR on hard->exit2)
classify_gate() {
  local repo="$1" wf="$2"
  local raw rc
  raw=$(gh run list -R "$repo" --workflow "$wf" --branch main -L 1 \
        --json conclusion,status,createdAt,headSha,url \
        --jq 'if length==0 then "NORUN" else .[0] | "\(.status)|\(.conclusion)|\(.createdAt)|\(.headSha[0:7])|\(.url)" end' 2>&1)
  rc=$?
  if [ "$rc" -ne 0 ]; then
    if printf '%s' "$raw" | grep -qiE 'HTTP 404|not found on the default branch'; then
      printf 'MISSING\tworkflow file no longer resolves on the default branch (tracked table drifted)'
    else
      printf 'ERROR\t%s' "$(printf '%s' "$raw" | tr '\n' ' ')"
    fi
    return
  fi
  if [ "$raw" = "NORUN" ]; then
    printf 'NORUN\tno run on main yet'
    return
  fi
  local status conclusion created sha url
  IFS='|' read -r status conclusion created sha url <<< "$raw"
  if [ "$status" != "completed" ]; then
    printf 'PENDING\t%s at %s (%s) %s' "$status" "$created" "$sha" "$url"
    return
  fi
  case "$conclusion" in
    success)
      printf 'GREEN\t%s (%s) %s' "$created" "$sha" "$url" ;;
    failure|timed_out|cancelled|startup_failure)
      printf 'RED\t%s at %s (%s) %s' "$conclusion" "$created" "$sha" "$url" ;;
    skipped|neutral)
      printf 'SKIPPED\t%s at %s (%s) %s' "$conclusion" "$created" "$sha" "$url" ;;
    *)
      printf 'OTHER\t%s at %s (%s) %s' "$conclusion" "$created" "$sha" "$url" ;;
  esac
}

# Maps a CLASS to the short label shown in the report's State column.
state_label() {
  case "$1" in
    GREEN) printf 'pass' ;;
    RED) printf 'FAIL' ;;
    PENDING) printf 'pending' ;;
    NORUN) printf 'no-run' ;;
    MISSING) printf 'MISSING' ;;
    SKIPPED) printf 'skipped' ;;
    OTHER) printf 'other' ;;
    ERROR) printf 'ERROR' ;;
    *) printf '%s' "$1" ;;
  esac
}

hard_red=0
tool_error=0
red_lines=""
error_lines=""

emit_row() {
  local repo="$1" class="$2" detail="$3" label
  label=$(state_label "$class")
  printf '| %s | %s | %s | %s |\n' "${repo#thomasluizon/}" "$4" "$label" "$detail"
}

now=$(date -u +'%Y-%m-%dT%H:%M:%SZ')

hard_table=""
for row in "${HARD_GATES[@]}"; do
  IFS='|' read -r repo wf <<< "$row"
  result=$(classify_gate "$repo" "$wf")
  class=${result%%$'\t'*}
  detail=${result#*$'\t'}
  hard_table+="$(emit_row "$repo" "$class" "$detail" "$wf")"$'\n'
  case "$class" in
    RED) hard_red=1; red_lines+="  - ${repo#thomasluizon/} / $wf: $detail"$'\n' ;;
    MISSING|ERROR) tool_error=1; error_lines+="  - ${repo#thomasluizon/} / $wf ($class): $detail"$'\n' ;;
  esac
done

advisory_table=""
for row in "${ADVISORY_GATES[@]}"; do
  IFS='|' read -r repo wf <<< "$row"
  result=$(classify_gate "$repo" "$wf")
  class=${result%%$'\t'*}
  detail=${result#*$'\t'}
  advisory_table+="$(emit_row "$repo" "$class" "$detail" "$wf")"$'\n'
done

if [ "$hard_red" -eq 1 ]; then
  verdict="RED"; exit_code=1
  summary="At least one hard-tier gate's latest main run failed."
elif [ "$tool_error" -eq 1 ]; then
  verdict="TOOL-ERROR"; exit_code=2
  summary="Could not evaluate a hard-tier gate (gh unreachable or a tracked workflow 404s)."
else
  verdict="GREEN"; exit_code=0
  summary="Every hard-tier gate's latest main run is healthy (pending / no-run counted green)."
fi

cat <<EOF
# Orbit CI health roll-up

_Generated ${now} by \`tools/rollup.sh\`. Reads the latest \`main\` run of each tracked gate across all three repos; runs and audits nothing._

## Verdict: ${verdict}

${summary}

## Hard-verdict gates (main-signal quality gates)

| Repo | Workflow | State | Detail |
|---|---|---|---|
${hard_table}
## Advisory (enforced at merge by branch protection; never reddens the verdict)

| Repo | Workflow | State | Detail |
|---|---|---|---|
${advisory_table}
## Excluded (not health signals)

Intentionally untracked, each for a stated reason:

- **Release / promote** - \`android-release.yml\`, \`promote-prod.yml\` (UI): release machinery, not a health gate.
- **Reminders** - \`dep-sweep-reminder.yml\`, \`expo-sdk-watch.yml\` (UI): schedulers that file reminder issues, no pass/fail signal.
- **Auto-merge** - \`dependabot-auto-merge.yml\` (UI + api): merges Dependabot PRs, not a health gate.
- **Dependency review** - \`dependency-review.yml\` (UI + api + landing): PR-time supply-chain diff, gated at merge.
- **LLM PR review** - \`claude-review.yml\` (UI + api): per-PR AI review, not a main-branch health signal.

## Notes

- A green run conclusion means the gate executed cleanly on \`main\`, not that it found zero issues. Report-only gates (\`commit-sweep\`, api \`benchmark\`) and the SonarCloud Quality Gate (a check separate from the scan run) surface findings in their own artifacts/issues. A red *run* means the gate itself broke on \`main\`, which is what this roll-up surfaces.
- \`pending\` (run in progress) and \`no-run\` (no main run yet) are reported but never reddens the verdict.
- Advisory PR gates run only on \`pull_request\`, so \`--branch main\` returns no run; branch protection already blocks a red PR from merging. \`smoke-prod\` runs on push to main but can go red for prod-account reasons unrelated to code, so it is advisory too.
EOF

if [ -n "$red_lines" ]; then
  printf '\n### Failing hard gates\n\n%s' "$red_lines"
fi
if [ -n "$error_lines" ]; then
  printf '\n### Unreadable hard gates (tooling / table drift)\n\n%s' "$error_lines"
fi

printf '\nVERDICT: %s\n' "$verdict"
exit "$exit_code"
