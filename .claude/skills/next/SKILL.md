---
name: next
description: >-
  Answer "what is the next ticket to execute?" and nothing else. Reads the merge-gated
  blockedBy DAG across every open Linear ticket via tools/wave-plan.mjs, ranks the
  launchable set by how many tickets each one unblocks, and names ONE recommendation with
  its reason. Read-only: it launches no worker, opens no worktree, and edits no ticket.
  Use when the question is "what should I run next", "what is launchable", "what unblocks
  the most", or "where does the board stand". Its executing sibling is /orchestrate, which
  is what you run AFTER this answers.
argument-hint: "[project name] (default: every open ticket)"
effort: low
---

# Next

The read-only front door to the wave table. `/orchestrate` computes the same DAG and then
launches workers; this stops at the answer.

Thomas never runs `tools/` scripts by hand, so this skill is the ONLY supported way to ask
the question. Never answer it by handing over the `node` line.

## 1. Read the DAG

```bash
node tools/wave-plan.mjs --all --json
```

With a project argument, scope it instead:

```bash
node tools/wave-plan.mjs --project "<name>" --json
```

Run it from the orbit-ui-mobile repo root. **It takes roughly two to four minutes** across
the full board, because every blocker outside the selection is fetched individually. Say so
before you start it, then wait. Do not fall back to the text mode; the ranking below needs
the JSON.

The payload is `{ waves: [{ wave, issues: [...] }], launchable: [identifier, ...] }`. Each
issue carries `identifier`, `title`, `state`, `stateType`, `labels`, `attempts` and
`blockedBy`.

If the run exits non-zero, report the exit code and stop. Exit 1 is "nothing to plan or a
cycle" and a cycle is a real defect in the ticket graph worth naming, not a retry.

## 2. Rank the launchable set

`launchable` is every ticket whose blockers are all merged, that is not already started, and
that is under the strike limit (D9). It is usually large; on 2026-07-26 it was 62 of 109.
A list of 62 is not an answer.

Rank it by **downstream reach**: for each launchable identifier, count how many issues
anywhere in `waves` name it in their `blockedBy`, transitively. The ticket that unblocks the
most is the recommendation. Break ties in this order:

1. A ticket blocking a LATER wave beats one blocking only the next wave.
2. `repo:api` beats `repo:ui` when both unblock the same work, because deploy-API-first is a
   DAG edge (D3) and the API side has to land first anyway.
3. Lower ticket number, so the answer is stable across runs.

Flag separately, never silently drop: any launchable ticket at `attempts >= 2`, which means
the ticket BODY is wrong and needs a rewrite before any worker sees it again (D9).

## 3. Answer

Lead with the single recommendation, then the runner-ups. Keep it to five rows.

```
NEXT: ORB-30 - Rewrite DESIGN.md as the de-decorated canon
  unblocks 11 tickets across waves 2 to 5, repo:ui
  run it with: /orchestrate ORB-30 --single

runner-ups
  ORB-76  unblocks 4   repo:api
  ORB-88  unblocks 2   repo:ui
  ...

board: 109 open, 62 launchable now, 5 waves
```

State the board line every time. It is the one number that shows movement between runs, and
per the launch decision of 2026-07-26 every open ticket is a launch gate, so the open count
IS the distance to launch.

Then stop. Do not reconcile tickets against the code, do not open files, do not launch
anything. `/orchestrate ORB-N --single` is the next command and it is Thomas's to type.
