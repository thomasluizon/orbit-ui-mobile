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
3. **Being built now.** Name, in product terms, what each running worker builds. When no worker runs, name the next ticket in line.

Running workers:

1. Find the state directory with `git -C $HOME/Developer/orbit-ui-mobile rev-parse --path-format=absolute --git-common-dir`. The state directory is the `orbit-drive` folder inside that path.
2. Read each `*.launch.json` file in the state directory. A record counts only when the `.pid` file with the same name holds a live pid.
3. Read `ticketNumber` and `partNumber` of each record. Run `gh issue view <ticketNumber> --repo thomasluizon/orbit-tickets --json title,comments`. Read the ticket title.
4. When `partNumber` is not null, read the part title too. `partNumber` is not an issue number. Find the newest comment whose first line holds `Part <partNumber> of <m>`. Only `#` marks and a ticket reference can come before `Part`. The part title is the rest of that line.
5. Write one line for each running worker. The line says what the owner gets when the work lands, for example "Habit reminders that fire at the right time on Android".

No worker runs:

1. Run `node tools/drive.mjs --dry-run` in `$HOME/orca/workspaces/orbit-ui-mobile/orbit-drive`. The command reads and writes nothing.
2. Find the line that starts with `next ticket `. It names the next ticket in line, also while a pause or a usage stop holds the driver.
3. When the line is `next ticket none`, write that no ticket is in line, and stop here.
4. Read the ticket number after `#`, and the `partNumber` at the end when the line has one. Read the titles with steps 3 and 4 of "Running workers".
5. Write one line that says what that ticket or part builds, in product terms.

Rules for the whole report, `--remaining` included:

- Never list stuck, failed or retried work.
- Never write an attempt count, a cap or a count of tries.
- Never write the words "stuck", "failed", "retry", "attempt", "launch" or "cap".
- A pull request that the driver stopped on is built work that is not merged. List it in "Built but not merged" with no count, no cap and no retry word.
- Never list a `parked` item. It is harness work and no product progress.

Rules for each part:

- Use product terms only. Write no pull request number, ticket number or version number.
- Cover every session since the previous report, never only this one.
- Be honest about work that is half done.
- Keep the report short.

## --remaining

Report the open tickets of the board and every held ticket and pull request that `/questions` step 1 lists. Use the same rules, and list no `parked` item.

## Estimates

Estimates run pessimistic. Adjust each estimate up. Say a time estimate for an owner step at most once.
