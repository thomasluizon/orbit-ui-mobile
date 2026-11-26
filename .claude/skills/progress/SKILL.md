---
name: progress
description: Report what changed in product terms: what merged and what is built but not merged, since the previous report. Pass --remaining to report the open tickets of the board and every held decision instead. Use when the owner asks for progress or says /progress.
argument-hint: "[--remaining]"
effort: medium
---

# /progress

Report from live state. Never report from memory.

## The window

The window starts at the previous report. Find its time in the newest comment on the one open issue that has the label `progress-log` in `thomasluizon/orbit-tickets`.

1. Run `gh issue list --repo thomasluizon/orbit-tickets --label progress-log --state open --json number`.
2. Read the comments of that issue. Copy the issue number from this output.
3. When no such issue exists, create it once with `gh issue create --repo thomasluizon/orbit-tickets --label progress-log --title "Progress log" --body "Report times of /progress."`. Use the last 7 days as the window.

After the report, post one comment on that issue. The comment holds the report time in ISO 8601.

## The report

Write three parts only.

1. **Merged.** For each of `orbit-ui-mobile`, `orbit-api` and `orbit-landing-page`, run `gh pr list --repo thomasluizon/<repo> --state merged --search "merged:>=<time>" --json title,body,mergedAt`. Group the pull requests by the ticket that each one `Tracks`.
2. **Built but not merged.** List the open pull requests of the same three repositories.
3. **Being built now.** Read the last 200 lines of `$HOME/Library/Logs/brain-automations/orbit-drive.log`. A `launch` line with no later `worker-exit` for the same ticket is a worker that builds now. Say what it builds.

Rules for both parts:

- Use product terms only. Write no pull request number, ticket number or version number.
- Cover every session since the previous report, never only this one.
- Be honest about work that is half done.
- Keep the report short.

## --remaining

Report the open tickets of the board and every held ticket and pull request that `/questions` step 1 lists. Use the same rules.

## Estimates

Estimates run pessimistic. Adjust each estimate up. Say a time estimate for an owner step at most once.
