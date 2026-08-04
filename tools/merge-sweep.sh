#!/usr/bin/env bash
# Require-up-to-date merge readiness sweep. Per PR: update-branch, then poll
# mergeStateStatus until the checks are decidable. A clean result is handed to a human for
# squash merge; this script never performs a merge.
# WHY the review-staleness guard below: an update-branch rewrites the head SHA and re-triggers the
# `review` check, but GitHub keeps the PRE-update APPROVED reviewDecision while that re-review runs,
# so a sweep that merges on a decidable merge state can ship past a CHANGES_REQUESTED that lands
# seconds later. That happened on https://github.com/thomasluizon/orbit-api/pull/403: a HIGH
# backend-contract finding reached main and deployed, and the fix went to the orphaned head branch.
# Never touches the local working tree.
set -u

# dead-path-ok: feature detector waits only while the review workflow can still post a check
REVIEW_WORKFLOW_PATH=".github/workflows/claude-review.yml"
REVIEW_CHECK_NAME="review"
ORCA_BIN="${ORCA_BIN:-C:\Users\thoma\AppData\Local\Programs\orca\resources\bin\orca}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<EOF
Require-up-to-date merge sweep: prepare a human squash-merge handoff for each green PR.

Usage: merge-sweep.sh [--expected-head <pr-number>=<sha>]...
                      [--reviewed-through <pr-number>=<iso-timestamp>]...
                      [--issue <pr-number>=<ORB-N>]...
                      [--authority-public-key <base64>]
                      <owner/repo> <pr-number>...
       merge-sweep.sh --help

Per PR it update-branches and polls until the merge state is decidable, then prints
HUMAN-MERGE-REQUIRED. It never calls a merge command or merge API.
A SonarCloud failure counts as a failed check here and SKIPs; use merge-sweep-cov.sh when a
new-code-coverage-only Sonar failure should be handed to Thomas for a human decision instead.

The expected head defaults to the PR's head SHA at entry. Pass --expected-head once per PR to
pin an earlier observed SHA. A routine update-branch merge is adopted only when its parents
include the prior expected SHA and a parent equal to or behind the freshly resolved base branch
tip; any other change prints HEAD-MOVED. The merge API also atomically matches the final expected
SHA.

Before any merge, --reviewed-through must name the latest instant through which that PR's
reviews, inline review comments, and issue comments were inspected. A newer or edited item,
an unresolved review thread, a missing mapping, or a failed lookup skips the PR. Repeat the
flag once per PR. The cutoff is exclusive: activity at or after that timestamp counts as new.
The review-safety query runs before the fresh Linear decision-time read and runs again after
success. Post-merge activity or an unverifiable post-merge review state is reported with a URL
when available and exits 4; this detects but cannot prevent the residual response-to-merge race.
Before a pending reassertion, the sweep re-reads Linear: it writes only if the issue is still
\`In Progress\`; an advanced state is left alone and emits \`LINEAR-STATE-REASSERT-SKIPPED\`. It
then re-reads after writing. A competing post-write state is left alone and emits
\`LINEAR-STATE-REASSERT-POST-WRITE-SKIPPED\`. A normal verified reassertion emits
\`LINEAR-STATE-REASSERTED\`. There is an undetectable sub-second residual between the pre-write
read and the write landing: a competing completed state can be overwritten, and the CLI response
shapes cannot distinguish that outcome from an ordinary successful reassertion.
A failed post-merge Linear state read or reassert emits \`POST-MERGE-LINEAR-STATE-REASSERT-FAILED\`
and exits 4.

--issue must map every swept PR to its Linear identifier (\`<pr-number>=<ORB-N>\`). Immediately
before merging, the sweep freshly reads that issue: \`In Review\` proceeds unchanged, while
\`In Progress\` marks a reassertion with the observed state and UTC instant. Only after GitHub
confirms the merge does it re-read Linear, reassert \`In Review\` only when it is still \`In Progress\`,
then re-read it again. A changed post-write state is left alone. There is an undetectable
sub-second residual between that pre-write read and the write landing: a competing completed state
can be overwritten, and the CLI response shapes cannot distinguish it from ordinary success. A decision-time
lookup failure or unknown state prints \`LINEAR-STATE-REFUSED\` and skips the merge.

It refuses to merge while the \`$REVIEW_CHECK_NAME\` check for the CURRENT head SHA is still
running, and re-reads reviewDecision after that check settles, so a pre-update APPROVED can
never carry a merge. Only a workflow lookup that succeeds and shows no ACTIVE
$REVIEW_WORKFLOW_PATH skips that wait: a deleted workflow leaves the list entirely, while a
disabled one stays listed yet can never post the check. A failed lookup keeps the guard on.

It does NOT require an approving review to exist: no identity in either repository can produce
one, so requiring it would refuse every unattended merge. It requires instead that no APPROVED
review is STALE (see --reviewed-through and the SHA-anchored gate) and refuses outright while
reviewDecision reads CHANGES_REQUESTED.
Every status check, required or not, must reach a terminal successful conclusion before merge.

After the sweep it re-checks every merged PR's head branch. A branch whose tip moved past the
SHA that was merged carries a post-merge commit that never reached main.

Output (stdout): one HUMAN-MERGE-REQUIRED/SKIP line per PR, then SWEEP-DONE.
Exit codes: 0 when every PR reached a human handoff or an explicit skip; 2 bad usage;
4 when a post-check read is unverifiable.
EOF
}

usage() {
  cat <<EOF
Read-only merge readiness sweep: hand clean pull requests to a human for squash merge.

Usage: merge-sweep.sh [--expected-head <pr-number>=<sha>]...
                      [--reviewed-through <pr-number>=<iso-timestamp>]...
                      [--issue <pr-number>=<ORB-N>]...
                      [--authority-public-key <base64>] <owner/repo> <pr-number>...

The sweep checks the current head, CI, review activity, signed exact-head review evidence,
worker delivery, and Linear In Review. It prints HUMAN-MERGE-REQUIRED for a clean PR.
It never calls a merge command or merge API, writes Linear, or deletes a branch.
EOF
}

expected_head_mappings=""
reviewed_through_mappings=""
issue_mappings=""
authority_public_key=""
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
    --issue)
      if [ "$#" -lt 2 ]; then
        printf 'merge-sweep.sh: --issue requires <pr-number>=<ORB-N>\n\n' >&2
        usage >&2
        exit 2
      fi
      mapping="$2"
      mapping_pr="${mapping%%=*}"
      mapping_issue="${mapping#*=}"
      if [ "$mapping_pr" = "$mapping" ] || [ -z "$mapping_pr" ] || ! printf '%s' "$mapping_issue" | grep -Eq '^ORB-[0-9]+$'; then
        printf 'merge-sweep.sh: issue mappings must be <pr-number>=<ORB-N>, got: %s\n\n' "$mapping" >&2
        usage >&2
        exit 2
      fi
      case "$mapping_pr" in
        *[!0-9]*) printf 'merge-sweep.sh: issue mapping PR must be a number, got: %s\n\n' "$mapping_pr" >&2; usage >&2; exit 2 ;;
      esac
      for existing_mapping in $issue_mappings; do
        if [ "${existing_mapping%%=*}" = "$mapping_pr" ]; then
          printf 'merge-sweep.sh: duplicate issue mapping for PR %s\n\n' "$mapping_pr" >&2
          usage >&2
          exit 2
        fi
      done
      issue_mappings="$issue_mappings $mapping_pr=$mapping_issue"
      shift 2
      ;;
    --authority-public-key)
      if [ "$#" -lt 2 ] || [ -z "$2" ]; then
        printf 'merge-sweep.sh: --authority-public-key requires a value\n\n' >&2
        usage >&2
        exit 2
      fi
      authority_public_key="$2"
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
for pr in "$@"; do
  issue_found=""
  for mapping in $issue_mappings; do
    [ "${mapping%%=*}" = "$pr" ] && issue_found=1
  done
  if [ -z "$issue_found" ]; then
    printf 'merge-sweep.sh: issue mapping is required for PR %s\n\n' "$pr" >&2
    usage >&2
    exit 2
  fi
done

# Fails CLOSED: only a lookup that SUCCEEDS and positively shows no review workflow turns the wait
# off, so an auth/rate-limit/network hiccup costs a slower sweep rather than the guard itself.
# WHY the state filter, and what it is NOT for. Both halves were read live on 2026-07-31 rather
# than taken from the REST reference. A DELETED workflow is dropped from this list outright even
# with run history: orbit-api's deploy.yml has 9 runs and reads `state: "deleted"` when fetched by
# id, yet does not appear here at all. So deleting the review workflow does NOT strand this guard.
# A DISABLED one does. Disabling dep-sweep-reminder.yml and re-reading this list returned it with
# `state: "disabled_manually"`, still present. A disabled workflow posts no check run, so matching
# on `.path` alone would hold `review_required` on forever while the check can never arrive, and
# every PR would poll to timeout and MERGE-REFUSE. Only an `active` workflow can produce one.
review_required=1
if workflow_paths=$(gh api "repos/$repo/actions/workflows" --paginate --jq '.workflows[] | select(.state == "active") | .path' 2>/dev/null); then
  printf '%s\n' "$workflow_paths" | grep -qx "$REVIEW_WORKFLOW_PATH" || review_required=""
else
  echo "WARN: could not list $repo workflows; assuming the $REVIEW_CHECK_NAME check is required" >&2
fi

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

issue_for() { # <pr>; stdout: Linear identifier
  local sought_pr="$1" mapping
  for mapping in $issue_mappings; do
    if [ "${mapping%%=*}" = "$sought_pr" ]; then
      printf '%s' "${mapping#*=}"
      return
    fi
  done
}

ensure_issue_in_review() { # <pr>; the final operation before the merge decision
  local pr="$1" issue state
  issue="$(issue_for "$pr")"
  if ! state="$("$ORCA_BIN" linear issue "$issue" --json 2>/dev/null | node -e 'let input="";process.stdin.on("data",chunk=>input+=chunk).on("end",()=>{try{const parsed=JSON.parse(input);const state=parsed?.result?.issue?.state?.name;if(typeof state!=="string"||!state)process.exit(1);process.stdout.write(state)}catch{process.exit(1)}})')"; then
    printf 'LINEAR-STATE-REFUSED issue=%s reason=lookup-failed\n' "$issue"
    return 1
  fi
  case "$state" in
    "In Review") return 0 ;;
    "In Progress")
      printf 'LINEAR-STATE-REFUSED issue=%s observed=%s reason=human-update-required\n' "$issue" "$state"
      return 1
      ;;
    *)
      printf 'LINEAR-STATE-REFUSED issue=%s observed=%s reason=unknown-state\n' "$issue" "$state"
      return 1
      ;;
  esac
}

newest_review_item_after() { # <cutoff>; author/timestamp/url TSV on stdin; exit 1 with newest item, 2 if malformed
  node -e '
    const cutoff=Date.parse(process.argv[1]);
    let input="";
    process.stdin.on("data",chunk=>input+=chunk).on("end",()=>{
      if(!Number.isFinite(cutoff)){process.exitCode=2;return}
      let newest;
      for(const line of input.split(/\r?\n/).filter(Boolean)){
        const fields=line.split("\t");
        if(fields.length!==3||!fields[0]||!fields[1]||!fields[2]){process.exitCode=2;return}
        const instant=Date.parse(fields[1]);
        if(!Number.isFinite(instant)){process.exitCode=2;return}
        if(!newest||instant>newest.instant)newest={author:fields[0],timestamp:fields[1],url:fields[2],instant};
      }
      if(newest&&newest.instant>=cutoff){
        process.stdout.write(`${newest.author}\t${newest.timestamp}\t${newest.url}`);
        process.exitCode=1;
      }
    })' "$1"
}

report_review_lookup_failure() { # <pr> <source> <pre|post>
  if [ "$3" = "post" ]; then
    echo "POST-MERGE-REVIEW-LOOKUP-FAILED #$1 source=$2"
  else
    echo "SKIP #$1 REVIEW-LOOKUP-FAILED source=$2"
  fi
}

REVIEW_LOOKUP_RESULT=""
lookup_review_activity() { # <pr> <source> <pre|post> <command...>; sets REVIEW_LOOKUP_RESULT
  local pr="$1" source="$2" phase="$3"
  shift 3
  REVIEW_LOOKUP_RESULT=""
  if ! REVIEW_LOOKUP_RESULT=$("$@" 2>/dev/null); then
    report_review_lookup_failure "$pr" "$source" "$phase"
    return 1
  fi
}

check_review_items() { # <pr> <source> <cutoff> <pre|post>; author/timestamp/url TSV on stdin
  local pr="$1" source="$2" cutoff="$3" phase="$4" newest_item item_status author item_timestamp item_url remainder
  newest_item="$(newest_review_item_after "$cutoff")"
  item_status=$?
  case "$item_status" in
    0) return 0 ;;
    1)
      author="${newest_item%%$'\t'*}"
      remainder="${newest_item#*$'\t'}"
      item_timestamp="${remainder%%$'\t'*}"
      item_url="${remainder#*$'\t'}"
      if [ "$phase" = "post" ]; then
        echo "POST-MERGE-ACTIVITY #$pr $author at $item_timestamp $item_url"
      elif [ "$source" = "inline-comments" ]; then
        echo "SKIP #$pr NEW-REVIEW-SINCE $cutoff (inline comment by $author at $item_timestamp)"
      else
        echo "SKIP #$pr NEW-REVIEW-SINCE $cutoff by $author at $item_timestamp"
      fi
      return 1
      ;;
    *)
      report_review_lookup_failure "$pr" "$source" "$phase"
      return 1
      ;;
  esac
}

review_safety_gate() { # <pr> <pre|post>; prints the fail-closed reason
  local pr="$1" phase="$2" reviewed_through unresolved review_items inline_items comment_items
  reviewed_through="$(reviewed_through_for "$pr")"
  if [ -z "$reviewed_through" ]; then
    report_review_lookup_failure "$pr" reviewed-through "$phase"
    return 1
  fi
  if ! lookup_review_activity "$pr" reviewThreads "$phase" gh api graphql \
    -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{isResolved} pageInfo{hasNextPage}}}}}' \
    -F o="${repo%%/*}" -F r="${repo##*/}" -F n="$pr" \
    --jq '.data.repository.pullRequest.reviewThreads | if .pageInfo.hasNextPage then "PAGINATED" else ([.nodes[] | select(.isResolved == false)] | length) end'; then
    return 1
  fi
  unresolved="$REVIEW_LOOKUP_RESULT"
  case "$unresolved" in
    '' | *[!0-9]*)
      report_review_lookup_failure "$pr" reviewThreads "$phase"
      return 1
      ;;
  esac
  if [ "$unresolved" -ne 0 ]; then
    if [ "$phase" = "post" ]; then
      echo "POST-MERGE-UNRESOLVED-THREADS #$pr count=$unresolved"
    else
      echo "SKIP #$pr UNRESOLVED-THREADS=$unresolved"
    fi
    return 1
  fi
  if ! lookup_review_activity "$pr" reviews "$phase" gh api graphql --paginate \
    -f query='query($o:String!,$r:String!,$n:Int!,$endCursor:String){repository(owner:$o,name:$r){pullRequest(number:$n){reviews(first:100,after:$endCursor){nodes{author{login} submittedAt updatedAt lastEditedAt url} pageInfo{hasNextPage endCursor}}}}}' \
    -F o="${repo%%/*}" -F r="${repo##*/}" -F n="$pr" \
    --jq '.data.repository.pullRequest.reviews.nodes[] | ([.author.login, .submittedAt, .url], [.author.login, .updatedAt, .url], [.author.login, .lastEditedAt, .url]) | select(.[1] != null) | @tsv'; then
    return 1
  fi
  review_items="$REVIEW_LOOKUP_RESULT"
  if ! printf '%s\n' "$review_items" | check_review_items "$pr" reviews "$reviewed_through" "$phase"; then
    return 1
  fi
  if ! lookup_review_activity "$pr" inline-comments "$phase" gh api "repos/$repo/pulls/$pr/comments" --paginate \
    --jq '.[] | ([.user.login, .created_at, .html_url], [.user.login, .updated_at, .html_url]) | @tsv'; then
    return 1
  fi
  inline_items="$REVIEW_LOOKUP_RESULT"
  if ! printf '%s\n' "$inline_items" | check_review_items "$pr" inline-comments "$reviewed_through" "$phase"; then
    return 1
  fi
  if ! lookup_review_activity "$pr" issue-comments "$phase" gh api "repos/$repo/issues/$pr/comments" --paginate \
    --jq '.[] | ([.user.login, .created_at, .html_url], [.user.login, .updated_at, .html_url]) | @tsv'; then
    return 1
  fi
  comment_items="$REVIEW_LOOKUP_RESULT"
  if ! printf '%s\n' "$comment_items" | check_review_items "$pr" issue-comments "$reviewed_through" "$phase"; then
    return 1
  fi
}

# Requires current local review evidence and preserves the native stale-approval refusal.
review_evidence_allows() { # <pr> <expected-head-sha>; prints the refusal reason
  local pr="$1" expected="$2" reviews verdict
  if ! reviews="$(gh api graphql \
    -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){headRefOid files(first:100){pageInfo{hasNextPage} nodes{path}} reviews(first:100){pageInfo{hasNextPage} nodes{id state body submittedAt updatedAt lastEditedAt url author{login} commit{oid}}}}}}' \
    -F o="${repo%%/*}" -F r="${repo##*/}" -F n="$pr" \
    --jq '.data.repository.pullRequest' 2>/dev/null)"; then
    echo "SKIP #$pr REVIEW-EVIDENCE-LOOKUP-FAILED"
    return 1
  fi
  if verdict="$(node "$SCRIPT_DIR/check-review-evidence.mjs" --repository "$repo" --pull-request "$pr" --expected-head "$expected" <<<"$reviews")"; then
    return 0
  fi
  echo "SKIP #$pr REVIEW-EVIDENCE-HELD $verdict"
  return 1
}

worker_delivery_allows() { # <pr> <branch> <expected-head-sha>; prints the refusal reason
  local pr="$1" branch="$2" expected="$3" issue verdict
  local authority_args=()
  if [ -n "$authority_public_key" ]; then
    authority_args=(--authority-public-key "$authority_public_key")
  fi
  issue="$(issue_for "$pr")"
  if verdict="$(node "$SCRIPT_DIR/check-worker-delivery.mjs" --issue "$issue" --branch "$branch" --head "$expected" "${authority_args[@]}")"; then
    return 0
  fi
  echo "SKIP #$pr WORKER-DELIVERY-HELD $verdict"
  return 1
}

head_oid() { # <pr>; stdout: current head SHA
  gh pr view "$1" --repo "$repo" --json headRefOid --jq .headRefOid 2>/dev/null
}

UPDATED_EXPECTED=""
UPDATED_ACTUAL=""
adopt_routine_update() { # <pr> <old-expected>; sets UPDATED_EXPECTED and UPDATED_ACTUAL
  local pr="$1" old_expected="$2" state base_ref head_ref base_tip commit_state
  local committer_name committer_email verified verification_reason commit_message parents parent relationship
  UPDATED_EXPECTED=""
  UPDATED_ACTUAL=""
  if ! state=$(gh pr view "$pr" --repo "$repo" --json headRefOid,baseRefName,headRefName --jq '[.headRefOid, .baseRefName, .headRefName] | @tsv' 2>/dev/null); then
    return 1
  fi
  IFS=$'\t' read -r UPDATED_ACTUAL base_ref head_ref <<<"$state"
  [ -n "$UPDATED_ACTUAL" ] && [ -n "$base_ref" ] && [ -n "$head_ref" ] || return 1
  if [ "$UPDATED_ACTUAL" = "$old_expected" ]; then
    UPDATED_EXPECTED="$old_expected"
    return 0
  fi
  if ! base_tip=$(gh api "repos/$repo/git/ref/heads/$base_ref" --jq '.object.sha' 2>/dev/null); then
    return 1
  fi
  [ -n "$base_tip" ] || return 1
  if ! commit_state=$(gh api "repos/$repo/git/commits/$UPDATED_ACTUAL" \
    --jq '[.committer.name, .committer.email, (.verification.verified | tostring), .verification.reason, .message, (.parents | map(.sha) | join(" "))] | @tsv' 2>/dev/null); then
    return 1
  fi
  IFS=$'\t' read -r committer_name committer_email verified verification_reason commit_message parents <<<"$commit_state"
  [ "$committer_name" = "GitHub" ] &&
    [ "$committer_email" = "noreply@github.com" ] &&
    [ "$verified" = "true" ] &&
    [ "$verification_reason" = "valid" ] &&
    [ "$commit_message" = "Merge branch '$base_ref' into $head_ref" ] &&
    [ -n "$parents" ] || return 1
  case " $parents " in
    *" $old_expected "*) ;;
    *) return 1 ;;
  esac
  for parent in $parents; do
    [ "$parent" = "$old_expected" ] && continue
    if [ "$parent" = "$base_tip" ]; then
      UPDATED_EXPECTED="$UPDATED_ACTUAL"
      return 0
    fi
    if ! relationship=$(gh api "repos/$repo/compare/$parent...$base_tip" --jq '.status' 2>/dev/null); then
      return 1
    fi
    case "$relationship" in
      ahead | identical)
        UPDATED_EXPECTED="$UPDATED_ACTUAL"
        return 0
        ;;
    esac
  done
  return 1
}

mstate() { # prints  MS | REVIEW | FAILEDCHECKS | PENDINGCHECKS | REVIEWCHECK | SHA
  gh pr view "$1" --repo "$repo" --json mergeStateStatus,reviewDecision,statusCheckRollup,headRefOid 2>/dev/null | node -e "
    let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
      try{
        const d=JSON.parse(s);
        const latestByContext=new Map(),unordered=[];
        for(const row of d.statusCheckRollup||[]){
          const name=row.name||row.context;
          const startedAt=row.startedAt;
          if(!name||typeof startedAt!=='string'){unordered.push(row);continue;}
          const latest=latestByContext.get(name);
          if(!latest||startedAt>latest.startedAt)latestByContext.set(name,{startedAt,rows:[row]});
          else if(startedAt===latest.startedAt)latest.rows.push(row);
        }
        const rows=[...unordered,...[...latestByContext.values()].flatMap(entry=>entry.rows)];
        const bad=['FAILURE','ERROR','CANCELLED','TIMED_OUT','ACTION_REQUIRED','STARTUP_FAILURE'];
        const failed=rows.filter(c=>bad.includes((c.conclusion||c.state||'').toUpperCase())).map(c=>c.name||c.context).join(',')||'none';
        const terminalStates=['SUCCESS',...bad,'NEUTRAL','SKIPPED','STALE'];
        const pending=rows.filter(c=>{
          const conclusion=(c.conclusion||'').toUpperCase();
          const status=(c.status||'').toUpperCase();
          const state=(c.state||'').toUpperCase();
          return !conclusion&&status!=='COMPLETED'&&!terminalStates.includes(state);
        }).map(c=>c.name||c.context||'?').join(',')||'none';
        const review=rows.find(c=>(c.name||c.context)==='$REVIEW_CHECK_NAME');
        const reviewSettled=!!review&&(!!review.conclusion||(review.status||'').toUpperCase()==='COMPLETED');
        const reviewCheck=!review?'ABSENT':(reviewSettled?'SETTLED':'RUNNING');
        process.stdout.write([(d.mergeStateStatus||'?'),(d.reviewDecision||'?'),failed,pending,reviewCheck,(d.headRefOid||'')].join('|'));
      }catch(e){process.stdout.write('ERR|ERR|err|err|ERR|');}
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
  actual="$(head_oid "$n")"
  if [ "$actual" != "$expected" ]; then
    echo "SKIP #$n HEAD-MOVED expected=$expected actual=$actual"
    continue
  fi
  gh pr update-branch "$n" --repo "$repo" >/dev/null 2>&1
  old_expected="$expected"
  if ! adopt_routine_update "$n" "$old_expected"; then
    echo "SKIP #$n HEAD-MOVED expected=$old_expected actual=${UPDATED_ACTUAL:-<unavailable>}"
    continue
  fi
  expected="$UPDATED_EXPECTED"
  done_pr=""
  block_reason="never reached a mergeable state"
  for i in $(seq 1 50); do # up to ~17min per PR
    IFS='|' read -r ms rev failed pending reviewcheck sha <<<"$(mstate "$n")"
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
    # `rev` is PR-level `reviewDecision` and survives the update-branch, so it can predate this
    # head SHA. Nothing may merge until this SHA's own review has settled.
    review_stale=""
    if [ -n "$review_required" ] && [ "$reviewcheck" != "SETTLED" ]; then
      review_stale=1
      block_reason="the $REVIEW_CHECK_NAME check on the current head never settled (state=$reviewcheck), so the APPROVED is stale"
    else
      block_reason="never reached a mergeable state (ms=$ms rev=$rev)"
    fi
    checks_pending=""
    if [ "$pending" != "none" ]; then
      checks_pending=1
      block_reason="checks on the current head never all concluded (pending=$pending)"
    fi
    # GitHub's PR-level decision still carries the native CHANGES_REQUESTED block. The positive
    # gate is the marker-bearing local review, read from the complete reviews inventory at the
    # final decision boundary and anchored both in its marker and GitHub commit to this head.
    if [ -z "$review_stale" ] && [ -z "$checks_pending" ] && { [ "$ms" = "CLEAN" ] || [ "$ms" = "UNSTABLE" ]; } && [ "$rev" != "CHANGES_REQUESTED" ]; then
      branch=$(gh pr view "$n" --repo "$repo" --json headRefName --jq .headRefName 2>/dev/null)
      if ! review_safety_gate "$n" pre; then
        done_pr=1
        break
      fi
      if ! ensure_issue_in_review "$n"; then
        echo "SKIP #$n LINEAR-STATE-REFUSED"
        done_pr=1
        break
      fi
      # The LAST API read before the merge call, and the only one anchored to a SHA. The
      # `rev` above is PR-level `reviewDecision`, which survives every push: PR #654 read
      # APPROVED from a review submitted against cac9ccb while headRefOid was 40dba9f, and
      # merged. If any approval exists, at least one must name THIS commit.
      if ! review_evidence_allows "$n" "$expected"; then
        done_pr=1
        break
      fi
      if ! worker_delivery_allows "$n" "$branch" "$expected"; then
        done_pr=1
        break
      fi
      echo "HUMAN-MERGE-REQUIRED #$n head=$expected"
      done_pr=1
      break
    fi
    if [ "$ms" = "BEHIND" ]; then
      actual="$(head_oid "$n")"
      if [ "$actual" != "$expected" ]; then
        echo "SKIP #$n HEAD-MOVED expected=$expected actual=$actual"
        done_pr=1
        break
      fi
      gh pr update-branch "$n" --repo "$repo" >/dev/null 2>&1
      old_expected="$expected"
      if ! adopt_routine_update "$n" "$old_expected"; then
        echo "SKIP #$n HEAD-MOVED expected=$old_expected actual=${UPDATED_ACTUAL:-<unavailable>}"
        done_pr=1
        break
      fi
      expected="$UPDATED_EXPECTED"
    fi
    sleep 20
  done
  [ -z "$done_pr" ] && echo "SKIP #$n (timeout: $block_reason)"
done
echo "SWEEP-DONE"
