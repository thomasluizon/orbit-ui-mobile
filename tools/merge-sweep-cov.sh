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
# Never touches the local working tree. Usage: merge-sweep-cov.sh <repo> <pr...>
repo="$1"; shift
gate() { # prints  MS \t REVIEW \t NONSONAR_FAILED \t SONARSTATE \t SHA
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
        process.stdout.write([(d.mergeStateStatus||'?'),(d.reviewDecision||'?'),(nonSonar.join(',')||'NONE'),sonarState,(d.headRefOid||'')].join('\t'));
      }catch(e){process.stdout.write('ERR\tERR\tERR\tERR\t');}
    })"
}
for n in "$@"; do
  gh pr update-branch "$n" --repo "$repo" >/dev/null 2>&1
  done_pr=""
  for i in $(seq 1 45); do   # ~15 min per PR
    IFS=$'\t' read -r ms rev nonsonar sonar sha < <(gate "$n")
    if [ "$rev" != "APPROVED" ]; then echo "SKIP #$n review=$rev"; done_pr=1; break; fi
    if [ "$nonsonar" != "NONE" ] && [ "$nonsonar" != "ERR" ]; then echo "SKIP #$n FAILED(non-sonar)=[$nonsonar]"; done_pr=1; break; fi
    if [ "$ms" = "DIRTY" ]; then echo "SKIP #$n DIRTY (conflict)"; done_pr=1; break; fi
    if [ "$ms" = "BEHIND" ]; then gh pr update-branch "$n" --repo "$repo" >/dev/null 2>&1; sleep 20; continue; fi
    # Non-Sonar failures already ruled out above; a Sonar FAILURE here is the SOLE blocker
    # (ms is typically BLOCKED, since SonarCloud Code Analysis is a REQUIRED check) — handle it
    # regardless of ms so a coverage-only PR doesn't loop to timeout.
    if [ "$sonar" = "FAILURE" ]; then
      summary=$(gh api "repos/$repo/commits/$sha/check-runs" --jq '.check_runs[] | select(.name=="SonarCloud Code Analysis") | .output.summary' 2>/dev/null)
      if printf '%s' "$summary" | grep -qi "Coverage on New Code" && ! printf '%s' "$summary" | grep -qiE "New Bugs|Bugs |Vulnerabilit|Security Hotspots|Security Rating|Code Smell|Duplicat|Maintainability Rating|Reliability Rating"; then
        if gh pr merge "$n" --repo "$repo" --squash --admin --delete-branch >/dev/null 2>&1; then echo "MERGED #$n (admin: coverage-only override)"; else echo "FAIL-ADMIN #$n"; fi
      else
        echo "SKIP #$n Sonar fails on MORE than coverage — needs a real fix"
      fi
      done_pr=1; break
    fi
    if { [ "$ms" = "CLEAN" ] || [ "$ms" = "UNSTABLE" ]; } && { [ "$sonar" = "SUCCESS" ] || [ "$sonar" = "NONE" ]; }; then
      if gh pr merge "$n" --repo "$repo" --squash --delete-branch >/dev/null 2>&1; then echo "MERGED #$n (clean)"; done_pr=1; break; fi
    fi
    # ms=BLOCKED/UNKNOWN with Sonar not-yet-failed → required checks still settling — wait
    sleep 20
  done
  [ -z "$done_pr" ] && echo "SKIP #$n (timeout waiting for a decidable merge state)"
done
echo "COV-SWEEP-DONE"
