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

Usage: merge-sweep.sh [--expected-head <pr-number>=<sha>]...
                      [--reviewed-through <pr-number>=<iso-timestamp>]...
                      <owner/repo> <pr-number>...
       merge-sweep.sh --help

Per PR it update-branches and polls until the merge state is decidable, then squash-merges.
A SonarCloud failure counts as a failed check here and SKIPs; use merge-sweep-cov.sh when a
new-code-coverage-only Sonar failure should be admin-overridden instead.

The expected head defaults to the PR's head SHA at entry. Pass --expected-head once per PR to
pin an earlier observed SHA. If update-branch or any later poll sees a different head, that PR
prints HEAD-MOVED and is never merged. The merge API also atomically matches the expected SHA.

Before any merge, --reviewed-through must name the latest instant through which that PR's
reviews, inline review comments, and issue comments were inspected. A newer or edited item,
an unresolved review thread, a missing mapping, or a failed lookup skips the PR. Repeat the
flag once per PR.

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

expected_head_mappings=""
reviewed_through_mappings=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    --expected-head)
      if [ "$#" -lt 2 ]; then
        printf 'merge-sweep.sh: --expected-head requires <pr-number>=<sha>\n\n' >&2
        usage >&2
        exit 2
      fi
      mapping="$2"
      mapping_pr="${mapping%%=*}"
      mapping_sha="${mapping#*=}"
      if [ "$mapping_pr" = "$mapping" ] || [ -z "$mapping_pr" ] || [ -z "$mapping_sha" ]; then
        printf 'merge-sweep.sh: expected-head mappings must be <pr-number>=<sha>, got: %s\n\n' "$mapping" >&2
        usage >&2
        exit 2
      fi
      case "$mapping_pr" in
        *[!0-9]*) printf 'merge-sweep.sh: expected-head PR must be a number, got: %s\n\n' "$mapping_pr" >&2; usage >&2; exit 2 ;;
      esac
      case "$mapping_sha" in
        *[!0-9a-fA-F]*) printf 'merge-sweep.sh: expected-head SHA must be hexadecimal, got: %s\n\n' "$mapping_sha" >&2; usage >&2; exit 2 ;;
      esac
      if [ "${#mapping_sha}" -ne 40 ] && [ "${#mapping_sha}" -ne 64 ]; then
        printf 'merge-sweep.sh: expected-head SHA must be a full 40- or 64-character commit SHA, got: %s\n\n' "$mapping_sha" >&2
        usage >&2
        exit 2
      fi
      mapping_sha="$(printf '%s' "$mapping_sha" | tr 'A-F' 'a-f')"
      for existing_mapping in $expected_head_mappings; do
        if [ "${existing_mapping%%=*}" = "$mapping_pr" ]; then
          printf 'merge-sweep.sh: duplicate expected-head mapping for PR %s\n\n' "$mapping_pr" >&2
          usage >&2
          exit 2
        fi
      done
      expected_head_mappings="$expected_head_mappings $mapping_pr=$mapping_sha"
      shift 2
      ;;
    --reviewed-through)
      if [ "$#" -lt 2 ]; then
        printf 'merge-sweep.sh: --reviewed-through requires <pr-number>=<iso-timestamp>\n\n' >&2
        usage >&2
        exit 2
      fi
      mapping="$2"
      mapping_pr="${mapping%%=*}"
      mapping_timestamp="${mapping#*=}"
      if [ "$mapping_pr" = "$mapping" ] || [ -z "$mapping_pr" ] || [ -z "$mapping_timestamp" ]; then
        printf 'merge-sweep.sh: reviewed-through mappings must be <pr-number>=<iso-timestamp>, got: %s\n\n' "$mapping" >&2
        usage >&2
        exit 2
      fi
      case "$mapping_pr" in
        *[!0-9]*) printf 'merge-sweep.sh: reviewed-through PR must be a number, got: %s\n\n' "$mapping_pr" >&2; usage >&2; exit 2 ;;
      esac
      if ! node -e 'const value=process.argv[1];if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))process.exit(1)' "$mapping_timestamp"; then
        printf 'merge-sweep.sh: reviewed-through must be an ISO timestamp, got: %s\n\n' "$mapping_timestamp" >&2
        usage >&2
        exit 2
      fi
      for existing_mapping in $reviewed_through_mappings; do
        if [ "${existing_mapping%%=*}" = "$mapping_pr" ]; then
          printf 'merge-sweep.sh: duplicate reviewed-through mapping for PR %s\n\n' "$mapping_pr" >&2
          usage >&2
          exit 2
        fi
      done
      reviewed_through_mappings="$reviewed_through_mappings $mapping_pr=$mapping_timestamp"
      shift 2
      ;;
    --*)
      printf 'merge-sweep.sh: unknown argument: %s\n\n' "$1" >&2
      usage >&2
      exit 2
      ;;
    *)
      break
      ;;
  esac
done

if [ "$#" -lt 2 ]; then
  usage >&2
  exit 2
fi
repo="$1"
shift
# Validate before the first gh call: an unvalidated slug or PR number reaches the API as a
# 404 and reads as "SKIP, nothing to merge" rather than as the usage error it is.
case "$repo" in
  */*) ;;
  *) printf 'merge-sweep.sh: first argument must be <owner/repo>, got: %s\n\n' "$repo" >&2; usage >&2; exit 2 ;;
esac
for pr in "$@"; do
  case "$pr" in
    '' | *[!0-9]*) printf 'merge-sweep.sh: PR arguments must be numbers, got: %s\n\n' "$pr" >&2; usage >&2; exit 2 ;;
  esac
done
for mapping in $expected_head_mappings; do
  mapping_pr="${mapping%%=*}"
  mapping_has_pr=""
  for pr in "$@"; do
    [ "$pr" = "$mapping_pr" ] && mapping_has_pr=1
  done
  if [ -z "$mapping_has_pr" ]; then
    printf 'merge-sweep.sh: expected-head mapping names PR %s, which is not in the sweep\n\n' "$mapping_pr" >&2
    usage >&2
    exit 2
  fi
done
for mapping in $reviewed_through_mappings; do
  mapping_pr="${mapping%%=*}"
  mapping_has_pr=""
  for pr in "$@"; do
    [ "$pr" = "$mapping_pr" ] && mapping_has_pr=1
  done
  if [ -z "$mapping_has_pr" ]; then
    printf 'merge-sweep.sh: reviewed-through mapping names PR %s, which is not in the sweep\n\n' "$mapping_pr" >&2
    usage >&2
    exit 2
  fi
done

# Fails CLOSED: only a lookup that SUCCEEDS and positively shows no review workflow turns the wait
# off, so an auth/rate-limit/network hiccup costs a slower sweep rather than the guard itself.
review_required=1
if workflow_paths=$(gh api "repos/$repo/actions/workflows" --paginate --jq '.workflows[].path' 2>/dev/null); then
  printf '%s\n' "$workflow_paths" | grep -qx "$REVIEW_WORKFLOW_PATH" || review_required=""
else
  echo "WARN: could not list $repo workflows; assuming the $REVIEW_CHECK_NAME check is required" >&2
fi

merged_heads=""

expected_head_for() { # <pr>; stdout: supplied SHA, or empty when the entry SHA must be captured
  local sought_pr="$1" mapping
  for mapping in $expected_head_mappings; do
    if [ "${mapping%%=*}" = "$sought_pr" ]; then
      printf '%s' "${mapping#*=}"
      return
    fi
  done
}

reviewed_through_for() { # <pr>; stdout: supplied review cutoff
  local sought_pr="$1" mapping
  for mapping in $reviewed_through_mappings; do
    if [ "${mapping%%=*}" = "$sought_pr" ]; then
      printf '%s' "${mapping#*=}"
      return
    fi
  done
}

newest_review_item_after() { # <cutoff>; author/timestamp TSV on stdin; exit 1 with newest item, 2 if malformed
  node -e '
    const cutoff=Date.parse(process.argv[1]);
    let input="";
    process.stdin.on("data",chunk=>input+=chunk).on("end",()=>{
      if(!Number.isFinite(cutoff)){process.exitCode=2;return}
      let newest;
      for(const line of input.split(/\r?\n/).filter(Boolean)){
        const fields=line.split("\t");
        if(fields.length!==2||!fields[0]||!fields[1]){process.exitCode=2;return}
        const instant=Date.parse(fields[1]);
        if(!Number.isFinite(instant)){process.exitCode=2;return}
        if(!newest||instant>newest.instant)newest={author:fields[0],timestamp:fields[1],instant};
      }
      if(newest&&newest.instant>cutoff){
        process.stdout.write(`${newest.author}\t${newest.timestamp}`);
        process.exitCode=1;
      }
    })' "$1"
}

check_review_items() { # <pr> <source> <cutoff>; author/timestamp TSV on stdin
  local pr="$1" source="$2" cutoff="$3" newest_item item_status author item_timestamp
  newest_item="$(newest_review_item_after "$cutoff")"
  item_status=$?
  case "$item_status" in
    0) return 0 ;;
    1)
      author="${newest_item%%$'\t'*}"
      item_timestamp="${newest_item#*$'\t'}"
      if [ "$source" = "inline-comments" ]; then
        echo "SKIP #$pr NEW-REVIEW-SINCE $cutoff (inline comment by $author at $item_timestamp)"
      else
        echo "SKIP #$pr NEW-REVIEW-SINCE $cutoff by $author at $item_timestamp"
      fi
      return 1
      ;;
    *)
      echo "SKIP #$pr REVIEW-LOOKUP-FAILED source=$source"
      return 1
      ;;
  esac
}

review_safety_gate() { # <pr>; prints the fail-closed SKIP reason
  local pr="$1" reviewed_through unresolved review_items inline_items comment_items
  reviewed_through="$(reviewed_through_for "$pr")"
  if [ -z "$reviewed_through" ]; then
    echo "SKIP #$pr REVIEW-LOOKUP-FAILED source=reviewed-through"
    return 1
  fi
  if ! unresolved=$(gh api graphql \
    -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{isResolved} pageInfo{hasNextPage}}}}}' \
    -F o="${repo%%/*}" -F r="${repo##*/}" -F n="$pr" \
    --jq '.data.repository.pullRequest.reviewThreads | if .pageInfo.hasNextPage then "PAGINATED" else ([.nodes[] | select(.isResolved == false)] | length) end' 2>/dev/null); then
    echo "SKIP #$pr REVIEW-LOOKUP-FAILED source=reviewThreads"
    return 1
  fi
  case "$unresolved" in
    '' | *[!0-9]*)
      echo "SKIP #$pr REVIEW-LOOKUP-FAILED source=reviewThreads"
      return 1
      ;;
  esac
  if [ "$unresolved" -ne 0 ]; then
    echo "SKIP #$pr UNRESOLVED-THREADS=$unresolved"
    return 1
  fi
  if ! review_items=$(gh api "repos/$repo/pulls/$pr/reviews" --paginate --jq '.[] | [.user.login, .submitted_at] | @tsv' 2>/dev/null); then
    echo "SKIP #$pr REVIEW-LOOKUP-FAILED source=reviews"
    return 1
  fi
  if ! printf '%s\n' "$review_items" | check_review_items "$pr" reviews "$reviewed_through"; then
    return 1
  fi
  if ! inline_items=$(gh api "repos/$repo/pulls/$pr/comments" --paginate --jq '.[] | ([.user.login, .created_at], [.user.login, .updated_at]) | @tsv' 2>/dev/null); then
    echo "SKIP #$pr REVIEW-LOOKUP-FAILED source=inline-comments"
    return 1
  fi
  if ! printf '%s\n' "$inline_items" | check_review_items "$pr" inline-comments "$reviewed_through"; then
    return 1
  fi
  if ! comment_items=$(gh api "repos/$repo/issues/$pr/comments" --paginate --jq '.[] | ([.user.login, .created_at], [.user.login, .updated_at]) | @tsv' 2>/dev/null); then
    echo "SKIP #$pr REVIEW-LOOKUP-FAILED source=issue-comments"
    return 1
  fi
  if ! printf '%s\n' "$comment_items" | check_review_items "$pr" issue-comments "$reviewed_through"; then
    return 1
  fi
}

head_oid() { # <pr>; stdout: current head SHA
  gh pr view "$1" --repo "$repo" --json headRefOid --jq .headRefOid 2>/dev/null
}

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
  expected="$(expected_head_for "$n")"
  if [ -z "$expected" ]; then
    expected="$(head_oid "$n")"
  fi
  if [ -z "$expected" ]; then
    echo "SKIP #$n HEAD-MOVED expected=<unavailable> actual=<unavailable>"
    continue
  fi
  gh pr update-branch "$n" --repo "$repo" >/dev/null 2>&1
  actual="$(head_oid "$n")"
  if [ "$actual" != "$expected" ]; then
    echo "SKIP #$n HEAD-MOVED expected=$expected actual=$actual"
    continue
  fi
  done_pr=""
  block_reason="never reached a mergeable state"
  for i in $(seq 1 50); do # up to ~17min per PR
    IFS='|' read -r ms rev failed reviewcheck sha <<<"$(mstate "$n")"
    if [ "$sha" != "$expected" ]; then
      echo "SKIP #$n HEAD-MOVED expected=$expected actual=$sha"
      done_pr=1
      break
    fi
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
      if ! review_safety_gate "$n"; then
        done_pr=1
        break
      fi
      if gh pr merge "$n" --repo "$repo" --squash --delete-branch --match-head-commit "$expected" >/dev/null 2>&1; then
        echo "MERGED #$n"
        # `^` is illegal in a refname, so it cannot collide with a branch name.
        merged_heads="$merged_heads $n^$branch^$expected"
      else
        actual="$(head_oid "$n")"
        if [ "$actual" != "$expected" ]; then
          echo "SKIP #$n HEAD-MOVED expected=$expected actual=$actual"
        else
          echo "MERGE-REFUSED #$n ms=$ms rev=$rev"
        fi
      fi
      done_pr=1
      break
    fi
    if [ "$ms" = "BEHIND" ]; then
      gh pr update-branch "$n" --repo "$repo" >/dev/null 2>&1
      actual="$(head_oid "$n")"
      if [ "$actual" != "$expected" ]; then
        echo "SKIP #$n HEAD-MOVED expected=$expected actual=$actual"
        done_pr=1
        break
      fi
    fi
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
