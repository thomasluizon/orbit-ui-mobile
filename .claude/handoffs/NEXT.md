# NEXT

**Read `.claude/specs/orbit-prod-release.md` first**, and its last section, "What the 2026-09-25
sleep run added (session `707e6949`)", before anything else.

## Entry point

`/sleep`. It enters `/orchestrate` itself.

## The goal: finish the spec

The goal is an empty board and a production release, exactly as the spec defines it. Re-derive what
is left rather than trusting this file:

    gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400

199 tickets were open at this handoff. A blocker is the next piece of work. Only an exhausted
allowance, the machine stopping, or Thomas saying stop ends the run. Never ask him anything during
the run: take the recommended option and log it. Conversation tickets (`#217`, `#318`, `#320`) are
skipped unattended.

## Thomas's rule from this wrap-up, in his words

"anything related to the redesign stays on redesign/main anything NOT RELATED to the redesign goes
to main, as simple as that". And: "stop asking me about this". This holds in `orbit-ui-mobile` AND
`orbit-api`. Never ask about a branch. The spec's standing instructions carry the full rule.

## What to do, in order

1. **Land the CI admission gate on `main`.** `ui#1091` (`#658`) targets `redesign/main`, but it is
   harness work, so it belongs on `main`. Rebuild it on a new branch from `main`, run both
   harnesses, open the PR to `main`, close `ui#1091` with a pointer. Until it merges, open no new
   ticket work: only review rounds, merge-forwards and merges run.
2. **Finish `ui#1066` (`#631`).** A Claude-engine worker was merging `redesign/main` into it at
   handoff (details below). Read the worktree first. Then re-review, D115 check, merge. `#631` is a
   fix to shipped sign-in, so open its `main` backport PR too.
3. **Merge the approved `ui` set** once each is at an approval on its exact head: `ui#1090`,
   `#1089`, `#1088`, `#1086`, `#1084`. Each was forwarded after its approval, so each needs a
   same-head re-review. Run the D115 merge type-check before each merge.
4. **`ui#1030` (`#615`)**: CHANGES_REQUESTED at `4de8a6c7`; fix round, then merge. It is a fix to
   shipped behaviour that depends on redesign-only `ui#1029`: land it on `redesign/main`, then a
   `main` backport. `ui#1049` (`#559`): fix round.
5. **`orbit-api` strict `main` chain, one at a time**, merge-forward just before each turn and a
   FULL re-review after each: `api#544`, `#545`, `#548`, `#549`, `#551`, `#552`, `#554`, `#550`
   (merges inert, see the spec), `#530`, `#535`.
6. **Retarget redesign work in `orbit-api`** to its `redesign/main` (`827b99bd`): `api#531` (`#367`,
   colour schemes) and `api#532` (`#75`, emails). Rebuild each branch on `redesign/main`, re-review,
   merge there.
7. **`#556`**: merge `main` into `redesign/main` in `orbit-ui-mobile`, after step 1.
8. Then the spec's batch order, only while the admission gate allows it.
9. When Pullfrog publishes 0.1.83 (`npm view pullfrog version` was 0.1.82 on 2026-09-25),
   re-review the pins `ui#1046`, `api#537`, `landing#80`.

## In flight, each with a disposition

| item | state | disposition |
|---|---|---|
| Claude worker for `ui#1066` merge | launcher pid 54523, claude pid 54651, worktree `/Users/thomaslrgregoriogmail.com/orca/workspaces/orbit-ui-mobile/ticket-631-supabase-session`, branch `fix/ticket-631-supabase-session`, 53 files dirty mid-merge, log `/var/folders/x_/m8324t4j1wv_m7y0r8839js00000gn/T/orbit-workers/#631-1790330478781.log`, prompt: resolve 9 auth files so `ui#1072`'s and `#1066`'s guarantees both hold, test, commit, do not push | outcome unknown; read the worktree and log first, step 2 |
| `ui#1091` | COMMENTED at `15a0747d`, head `cabb4ba9`, Contract Drift red | step 1 |
| `ui#1090`, `#1089`, `#1088`, `#1086`, `#1084` | APPROVED at older commits, only Contract Drift red (advisory, D98); `#1084` also red `Build` (the `next/font` flake, `#667`) | step 3 |
| `ui#1030`, `ui#1049` | CHANGES_REQUESTED | step 4 |
| `api#544`, `#545`, `#551`, `#552`, `#554`, `#530` | APPROVED, BEHIND (`#551`/`#552`/`#554` checks cancelled while behind) | step 5 |
| `api#548`, `#549`, `#550`, `#535` | APPROVED, DIRTY (conflicts with tonight's merges) | step 5, merge-forward first |
| `api#531`, `api#532` | DIRTY, on `main` | step 6 |
| pins `ui#1046`, `api#537`, `landing#80` | wait for Pullfrog 0.1.83 | step 9 |
| Turnstile, Supabase allowlist, crisis live check | Thomas's, see the spec | not run work |
| `#660` | due 168 hours after 2026-09-25 03:41 UTC | do on 2026-10-02 or later |
| scratch worktree `menu-probe` (detached `959381da`, 4 debug edits, session `f5910aea`) | commit is on `origin/main` | leave |
| worktrees of merged PRs | 46 `ui` worktrees listed | `node tools/teardown-worktree.mjs` each whose PR merged, after a clean-tree check |
| other dirty trees, unpushed commits, stashes | none in `orbit-ui-mobile`, `orbit-api`, `orbit-landing-page` except the `#631` worker tree | none |
| Dependabot alerts on `orbit-ui-mobile` | 0 open | none |
| CI queue | 8 queued `ui`, 0 `api` | none |
| decision log `sleep-decisions.md` (D1 to D126) | session `707e6949` scratchpad | durable content copied into the spec section |

Every identifier here came from a previous session. Treat each as a lead to verify.

## --sleep

This file is written for an unattended run. Start with `/sleep`, write the run state under the new
session id, keep the Mac awake with `caffeinate -i -w <claude pid>`, and work the order above
without waiting for anyone.
