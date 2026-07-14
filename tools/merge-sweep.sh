#!/usr/bin/env bash
# Require-up-to-date merge sweep (server-side gh). Per PR: update-branch, then
# poll mergeStateStatus itself until CLEAN/UNSTABLE (mergeable) and merge —
# waiting THROUGH the transient UNKNOWN/BLOCKED window while post-update CI
# re-runs. Skips only on a genuinely FAILED required check or timeout.
repo="$1"; shift
PRS="$@"
mstate() { # prints "MS|REVIEW|FAILEDCHECKS"
  gh pr view "$1" --repo "$repo" --json mergeStateStatus,reviewDecision,statusCheckRollup 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const d=JSON.parse(s);const r=d.statusCheckRollup||[];const failed=r.filter(c=>['FAILURE','ERROR','CANCELLED','TIMED_OUT','ACTION_REQUIRED','STARTUP_FAILURE'].includes((c.conclusion||c.state||'').toUpperCase())).map(c=>c.name||c.context).join(',')||'none';process.stdout.write((d.mergeStateStatus||'?')+'|'+(d.reviewDecision||'?')+'|'+failed);}catch(e){process.stdout.write('ERR|ERR|err');}})"
}
for n in $PRS; do
  gh pr update-branch "$n" --repo "$repo" >/dev/null 2>&1
  done_pr=""
  for i in $(seq 1 50); do   # up to ~17min per PR
    IFS='|' read -r ms rev failed <<< "$(mstate "$n")"
    if [ "$failed" != "none" ]; then echo "SKIP #$n ms=$ms FAILED=$failed"; done_pr=1; break; fi
    if { [ "$ms" = "CLEAN" ] || [ "$ms" = "UNSTABLE" ]; } && [ "$rev" = "APPROVED" ]; then
      if gh pr merge "$n" --repo "$repo" --squash --delete-branch >/dev/null 2>&1; then echo "MERGED #$n"; else echo "MERGE-REFUSED #$n ms=$ms rev=$rev"; fi
      done_pr=1; break
    fi
    if [ "$ms" = "BEHIND" ]; then gh pr update-branch "$n" --repo "$repo" >/dev/null 2>&1; fi
    if [ "$ms" = "DIRTY" ]; then echo "SKIP #$n ms=DIRTY (conflict)"; done_pr=1; break; fi
    sleep 20
  done
  [ -z "$done_pr" ] && echo "SKIP #$n (timeout waiting for CLEAN)"
done
echo "SWEEP-DONE"
