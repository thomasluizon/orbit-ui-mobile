#!/usr/bin/env bash
# Coverage-aware merge sweep (server-side gh, robust polling). Per PR:
#   - require reviewDecision == APPROVED; SKIP otherwise.
#   - SKIP on any failing NON-Sonar required check (a real defect) or a merge conflict (DIRTY).
#   - poll through BEHIND (update-branch) and the post-update re-CI window until the merge state
#     is decidable (CLEAN/UNSTABLE), then:
#       * Sonar SUCCESS/absent  -> normal squash-merge.
#       * Sonar FAILURE that is SOLELY new-code coverage (verified from the check-run summary,
#         never a Bug/Vuln/Hotspot/Smell/Duplication/rating drop) -> admin squash-merge
#         (coverage debt repaid in the Sonar burn-down; rubber-stamp tests are banned).
#       * Sonar FAILURE on anything more -> SKIP (needs a real fix).
# WHY the review-staleness guard below: an update-branch rewrites the head SHA and re-triggers the
# `review` check, but GitHub keeps the PRE-update APPROVED reviewDecision while that re-review runs,
# so a sweep that merges on a decidable merge state can ship past a CHANGES_REQUESTED that lands
# seconds later. That happened on https://github.com/thomasluizon/orbit-api/pull/403: a HIGH
# backend-contract finding reached main and deployed, and the fix went to the orphaned head branch.
# Never touches the local working tree.
set -u

REVIEW_WORKFLOW_PATH=".github/workflows/claude-review.yml"
REVIEW_CHECK_NAME="review"

usage() {
  cat <<EOF
Coverage-aware merge sweep: squash-merge each APPROVED, green PR server-side.

Usage: merge-sweep-cov.sh <owner/repo> <pr-number>...
       merge-sweep-cov.sh --help

Per PR it update-branches, polls until the merge state is decidable, then merges:
  Sonar SUCCESS or absent           -> squash merge
  Sonar FAILURE, new-code coverage  -> admin squash merge (coverage-only override)
  Sonar FAILURE, anything else      -> SKIP

It refuses to merge while the \`$REVIEW_CHECK_NAME\` check for the CURRENT head SHA is still
running, and re-reads reviewDecision after that check settles, so a pre-update APPROVED can
never carry a merge. Only a workflow lookup that succeeds and shows no $REVIEW_WORKFLOW_PATH
skips that wait; a failed lookup keeps the guard on.

After the sweep it re-checks every merged PR's head branch. A branch whose tip moved past the
SHA that was merged carries a post-merge commit that never reached main.

Output (stdout): one MERGED/SKIP/FAIL-ADMIN line per PR, then any ORPHANED-HEAD lines, then
COV-SWEEP-DONE.
Exit codes: 0 every merged head verified clean; 1 at least one orphaned head branch; 2 bad usage;
3 a head branch could not be verified (unknown is not a clean pass).
EOF
}

case "${1:-}" in
  -h | --help)
    usage
    exit 0
    ;;
esac
if [ "$#" -lt 2 ]; then
  usage >&2
  exit 2
fi
repo="$1"
shift

# Fails CLOSED: only a lookup that SUCCEEDS and positively shows no review workflow turns the wait
# off, so an auth/rate-limit/network hiccup costs a slower sweep rather than the guard itself.
review_required=1
if workflow_paths=$(gh api "repos/$repo/actions/workflows" --paginate --jq '.workflows[].path' 2>/dev/null); then
  printf '%s\n' "$workflow_paths" | grep -qx "$REVIEW_WORKFLOW_PATH" || review_required=""
else
  echo "WARN: could not list $repo workflows; assuming the $REVIEW_CHECK_NAME check is required" >&2
fi

merged_heads=""

gate() { # prints  MS \t REVIEW \t NONSONAR_FAILED \t SONARSTATE \t SHA \t REVIEWCHECK
  gh pr view "$1" --repo "$repo" --json mergeStateStatus,reviewDecision,statusCheckRollup,headRefOid 2>/dev/null | node -e "
    let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
      try{
        const d=JSON.parse(s);
        const bad=['FAILURE','ERROR','CANCELLED','TIMED_OUT','ACTION_REQUIRED','STARTUP_FAILURE'];
        const rows=d.statusCheckRollup||[];
        const failed=rows.filter(c=>bad.includes((c.conclusion||c.state||'').toUpperCase()));
        const nonSonar=failed.filter(c=>(c.name||c.context)!=='SonarCloud Code Analysis').map(c=>c.name||c.context);
        const sonar=rows.find(c=>(c.name||c.context)==='SonarCloud Code Analysis')||{};
        const sonarState=(sonar.conclusion||sonar.state||'NONE').toUpperCase();
        const review=rows.find(c=>(c.name||c.context)==='$REVIEW_CHECK_NAME');
        const reviewSettled=!!review&&(!!review.conclusion||(review.status||'').toUpperCase()==='COMPLETED');
        const reviewCheck=!review?'ABSENT':(reviewSettled?'SETTLED':'RUNNING');
        process.stdout.write([(d.mergeStateStatus||'?'),(d.reviewDecision||'?'),(nonSonar.join(',')||'NONE'),sonarState,(d.headRefOid||''),reviewCheck].join('\t'));
      }catch(e){process.stdout.write('ERR\tERR\tERR\tERR\t\tERR');}
    })"
}

squash_merge() { # <pr> <head-sha> <label> [extra gh pr merge flags...]
  local pr="$1" head_sha="$2" label="$3"
  shift 3
  local branch
  branch=$(gh pr view "$pr" --repo "$repo" --json headRefName --jq .headRefName 2>/dev/null)
  if gh pr merge "$pr" --repo "$repo" --squash --delete-branch "$@" >/dev/null 2>&1; then
    echo "MERGED #$pr ($label)"
    # `^` is illegal in a refname, so it cannot collide with a branch name.
    merged_heads="$merged_heads $pr^$branch^$head_sha"
    return 0
  fi
  return 1
}

for n in "$@"; do
  gh pr update-branch "$n" --repo "$repo" >/dev/null 2>&1
  done_pr=""
  block_reason="no decidable merge state"
  for i in $(seq 1 45); do # ~15 min per PR
    IFS=$'\t' read -r ms rev nonsonar sonar sha reviewcheck < <(gate "$n")
    if [ "$rev" != "APPROVED" ]; then
      echo "SKIP #$n review=$rev"
      done_pr=1
      break
    fi
    if [ "$nonsonar" != "NONE" ] && [ "$nonsonar" != "ERR" ]; then
      echo "SKIP #$n FAILED(non-sonar)=[$nonsonar]"
      done_pr=1
      break
    fi
    if [ "$ms" = "DIRTY" ]; then
      echo "SKIP #$n DIRTY (conflict)"
      done_pr=1
      break
    fi
    if [ "$ms" = "BEHIND" ]; then
      block_reason="still BEHIND main after update-branch"
      gh pr update-branch "$n" --repo "$repo" >/dev/null 2>&1
      sleep 20
      continue
    fi
    # The APPROVED read above is PR-level and survives the update-branch, so it can predate this
    # head SHA. Nothing below may merge until this SHA's own review has settled.
    if [ -n "$review_required" ] && [ "$reviewcheck" != "SETTLED" ]; then
      block_reason="the $REVIEW_CHECK_NAME check on head $sha never settled (state=$reviewcheck), so the APPROVED is stale"
      sleep 20
      continue
    fi
    # Non-Sonar failures already ruled out above; a Sonar FAILURE here is the SOLE blocker
    # (ms is typically BLOCKED, since SonarCloud Code Analysis is a REQUIRED check), so handle it
    # regardless of ms and a coverage-only PR does not loop to timeout.
    if [ "$sonar" = "FAILURE" ]; then
      summary=$(gh api "repos/$repo/commits/$sha/check-runs" --jq '.check_runs[] | select(.name=="SonarCloud Code Analysis") | .output.summary' 2>/dev/null)
      if printf '%s' "$summary" | grep -qi "Coverage on New Code" && ! printf '%s' "$summary" | grep -qiE "New Bugs|Bugs |Vulnerabilit|Security Hotspots|Security Rating|Code Smell|Duplicat|Maintainability Rating|Reliability Rating"; then
        squash_merge "$n" "$sha" "admin: coverage-only override" --admin || echo "FAIL-ADMIN #$n"
      else
        echo "SKIP #$n Sonar fails on MORE than coverage, needs a real fix"
      fi
      done_pr=1
      break
    fi
    if { [ "$ms" = "CLEAN" ] || [ "$ms" = "UNSTABLE" ]; } && { [ "$sonar" = "SUCCESS" ] || [ "$sonar" = "NONE" ]; }; then
      if squash_merge "$n" "$sha" "clean"; then
        done_pr=1
        break
      fi
    fi
    # ms=BLOCKED/UNKNOWN with Sonar not-yet-failed: required checks still settling, wait
    block_reason="no decidable merge state (ms=$ms)"
    sleep 20
  done
  [ -z "$done_pr" ] && echo "SKIP #$n (timeout: $block_reason)"
done

# A head branch that merely survived --delete-branch is benign; only a tip that MOVED past the SHA
# that was merged proves a post-merge commit that never reached main. The GraphQL ref lookup exits 0
# with an EMPTY oid for a deleted branch, so a non-zero exit is unambiguously "could not verify",
# which is reported and counted, never silently read as clean.
branch_tip() { # <branch>; stdout: tip SHA, or empty when the ref is confirmed absent
  gh api graphql \
    -f query='query($o:String!,$n:String!,$q:String!){repository(owner:$o,name:$n){ref(qualifiedName:$q){target{oid}}}}' \
    -F o="${repo%%/*}" -F n="${repo##*/}" -F q="refs/heads/$1" \
    --jq '.data.repository.ref.target.oid // ""' 2>/dev/null
}

orphans=0
unverified=0
for entry in $merged_heads; do
  pr="${entry%%^*}"
  rest="${entry#*^}"
  branch="${rest%^*}"
  merged_sha="${rest##*^}"
  [ -n "$branch" ] || continue
  if ! tip=$(branch_tip "$branch"); then
    echo "WARN: could not verify branch $branch for #$pr; orphan status unknown" >&2
    unverified=$((unverified + 1))
    continue
  fi
  if [ -n "$tip" ] && [ "$tip" != "$merged_sha" ]; then
    echo "ORPHANED-HEAD #$pr $branch tip=$tip (moved past the merged $merged_sha, so those commits are NOT on main)"
    orphans=$((orphans + 1))
  fi
done

echo "COV-SWEEP-DONE"
[ "$orphans" -eq 0 ] || exit 1
[ "$unverified" -eq 0 ] || exit 3
