#!/usr/bin/env bash
# Require-up-to-date merge sweep (server-side gh). Per PR: update-branch, then poll
# mergeStateStatus itself until CLEAN/UNSTABLE (mergeable) and merge, waiting THROUGH the
# transient UNKNOWN/BLOCKED window while post-update CI re-runs. Skips only on a genuinely
# FAILED required check or timeout.
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
Require-up-to-date merge sweep: squash-merge each APPROVED, green PR server-side.

Usage: merge-sweep.sh <owner/repo> <pr-number>...
       merge-sweep.sh --help

Per PR it update-branches and polls until the merge state is decidable, then squash-merges.
A SonarCloud failure counts as a failed check here and SKIPs; use merge-sweep-cov.sh when a
new-code-coverage-only Sonar failure should be admin-overridden instead.

It refuses to merge while the \`$REVIEW_CHECK_NAME\` check for the CURRENT head SHA is still
running, and re-reads reviewDecision after that check settles, so a pre-update APPROVED can
never carry a merge. Only a workflow lookup that succeeds and shows no $REVIEW_WORKFLOW_PATH
skips that wait; a failed lookup keeps the guard on.

After the sweep it re-checks every merged PR's head branch. A branch whose tip moved past the
SHA that was merged carries a post-merge commit that never reached main.

Output (stdout): one MERGED/SKIP/MERGE-REFUSED line per PR, then any ORPHANED-HEAD lines, then
SWEEP-DONE.
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

mstate() { # prints  MS | REVIEW | FAILEDCHECKS | REVIEWCHECK | SHA
  gh pr view "$1" --repo "$repo" --json mergeStateStatus,reviewDecision,statusCheckRollup,headRefOid 2>/dev/null | node -e "
    let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
      try{
        const d=JSON.parse(s);
        const rows=d.statusCheckRollup||[];
        const bad=['FAILURE','ERROR','CANCELLED','TIMED_OUT','ACTION_REQUIRED','STARTUP_FAILURE'];
        const failed=rows.filter(c=>bad.includes((c.conclusion||c.state||'').toUpperCase())).map(c=>c.name||c.context).join(',')||'none';
        const review=rows.find(c=>(c.name||c.context)==='$REVIEW_CHECK_NAME');
        const reviewSettled=!!review&&(!!review.conclusion||(review.status||'').toUpperCase()==='COMPLETED');
        const reviewCheck=!review?'ABSENT':(reviewSettled?'SETTLED':'RUNNING');
        process.stdout.write([(d.mergeStateStatus||'?'),(d.reviewDecision||'?'),failed,reviewCheck,(d.headRefOid||'')].join('|'));
      }catch(e){process.stdout.write('ERR|ERR|err|ERR|');}
    })"
}

for n in "$@"; do
  gh pr update-branch "$n" --repo "$repo" >/dev/null 2>&1
  done_pr=""
  block_reason="never reached a mergeable state"
  for i in $(seq 1 50); do # up to ~17min per PR
    IFS='|' read -r ms rev failed reviewcheck sha <<<"$(mstate "$n")"
    if [ "$failed" != "none" ]; then
      echo "SKIP #$n ms=$ms FAILED=$failed"
      done_pr=1
      break
    fi
    if [ "$ms" = "DIRTY" ]; then
      echo "SKIP #$n ms=DIRTY (conflict)"
      done_pr=1
      break
    fi
    # The APPROVED below is PR-level and survives the update-branch, so it can predate this head
    # SHA. Nothing may merge until this SHA's own review has settled.
    review_stale=""
    if [ -n "$review_required" ] && [ "$reviewcheck" != "SETTLED" ]; then
      review_stale=1
      block_reason="the $REVIEW_CHECK_NAME check on the current head never settled (state=$reviewcheck), so the APPROVED is stale"
    else
      block_reason="never reached a mergeable state (ms=$ms rev=$rev)"
    fi
    if [ -z "$review_stale" ] && { [ "$ms" = "CLEAN" ] || [ "$ms" = "UNSTABLE" ]; } && [ "$rev" = "APPROVED" ]; then
      branch=$(gh pr view "$n" --repo "$repo" --json headRefName --jq .headRefName 2>/dev/null)
      if gh pr merge "$n" --repo "$repo" --squash --delete-branch >/dev/null 2>&1; then
        echo "MERGED #$n"
        # `^` is illegal in a refname, so it cannot collide with a branch name.
        merged_heads="$merged_heads $n^$branch^$sha"
      else
        echo "MERGE-REFUSED #$n ms=$ms rev=$rev"
      fi
      done_pr=1
      break
    fi
    if [ "$ms" = "BEHIND" ]; then gh pr update-branch "$n" --repo "$repo" >/dev/null 2>&1; fi
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

echo "SWEEP-DONE"
[ "$orphans" -eq 0 ] || exit 1
[ "$unverified" -eq 0 ] || exit 3
