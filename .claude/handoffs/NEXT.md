/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then the brain ADR `2 Areas/20-29 Orbit Engineering/Decisions/Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md` through the Obsidian MCP.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made. Write the run state for this session with `sleep: true` first, keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`). For Batch M the run may create and change Render, AWS, Cloudflare and GitHub resources through Terraform, CLIs, APIs and MCPs; copy the production database to Render in a short maintenance window after verifying the copy; switch DNS; deploy production through the new release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; and, after a verified cutover, cancel Vercel Pro and Resend Pro and pause the Supabase project (through `claude-in-chrome` where no API covers it). Never create an account, enter a password or payment detail, or permanently delete a project or its data: those are the owner's, recorded under Waiting on the owner in the spec, while the run continues with every step that does not need them. Never merge `redesign/main` to `main`.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval, reached through Batch M first. The run ends only when the spec is done or for an external cause (allowance exhausted, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. At handoff time the board had 123 open tickets, all 123 placed in the spec's `## The order` (0 unplaced, 0 placed twice); Batch M has no tickets yet, and every ticket the run files for it is placed in Batch M.

## In flight (verify each first)

| item | disposition |
|---|---|
| Open pull requests | none in `orbit-ui-mobile`, `orbit-api` or `orbit-landing-page` |
| Running workers | none |
| Stashes | none in any of the three repositories |
| Unpushed commits | none on any branch with a remote |
| Stale worktrees | 33 UI and 5 API worktrees on branches with no remote left (all clean), six detached API checkouts (two dirty); verify each and remove it with `node tools/teardown-worktree.mjs` or by hand when nothing unmerged remains |
| `#763`, `#790`, `#792` | parked until Batch M lands; then record rows per call on the new database and close each |
| `#556`, `#746` syncs | current (UI through `#1213` except `#1204`, API through `#618`); carry every new `main` merge into `redesign/main` after it lands, cherry-picking only the new commits |
| `#565`, `#566` | watch windows; close each after seven days on its carrying release if Sentry shows no recurrence of ORBIT-WEB-C or ORBIT-MOBILE-5 |
| `#390`, `#134` | wait for the owner's device test |
| Web three-dot menu | two habit menus once showed at once on production web Today, not reproducible on demand; the spec's Batch 0c line says to file and fix it after Batch M |

## Then, in order

1. The spec's `## The order`, Batch M, in its own step order: install and configure every CLI first (Terraform, AWS CLI, Render CLI and MCP, and any other the steps need), then infrastructure as code, production, staging, the database copy, Google sign-in in the API, web and Android, Amazon SES, the release workflows, the `/release` skill, and the cutover with the cancelled plans. Record every decision and research result in the brain as it is made.
2. With staging and production both live on the new stack: deploy the redesign to staging, ship the closed test build to the internal and closed tracks with the staging API, verify it, and stop at THE REDESIGN GATE for the owner's approval.
3. Everything the gate does not block, in the spec's order: the rest of Batch E, Batch 0b and Batch 0c, including the web three-dot menu bug.
4. Owner decisions already taken, recorded in the spec: copy is written and approved by the run through `BRAND.md`, the brain, `/humanizer` and `/second-opinion`; console and dashboard steps are the run's, through `claude-in-chrome`; the repositories stay public; the decided stack is final.
5. A ticket body names the outcome and its acceptance; when a suggested method conflicts with the acceptance, the acceptance wins.
6. A review finding on a sync pull request that is also a defect on `main` is fixed on `main` first and then carried in the same sync; a sync changes no behaviour beyond carrying.

## Previous prompt, disposition

- Opening, entry point and sleep contract: carried above.
- Sleep authorization (merges to `main`, `orbit-api` merge deploys, `/android-release` to the open track, never `--admin`, never merge `redesign/main`): carried; the auto-deploy on merge is superseded by Batch M's release workflows, and the authorization is widened to Batch M's infrastructure steps.
- Closed, unmerged ledger rows `api#535` and `api#579`: done, marked `closed: true` in the previous run.
- Goal and the stop at THE REDESIGN GATE for the API choice: superseded; the gate now runs on the new staging after Batch M, and the Render preview plan is dropped.
- In flight `#763`: carried (parked until Batch M). `#790`, `#792`: carried (parked). Egress per active account: superseded, since database traffic moves onto Render's private network.
- In flight `#556`, `#746`, `#565`, `#566`, `#390`, `#134`, running workers, stashes, unpushed commits: carried.
- In flight stale worktrees: carried, with the full count.
- Step 1 (in-flight rows): carried in the table above.
- Step 2 (the order to the gate): superseded by steps 1 to 3 above.
- Steps 3 to 5 (owner decisions taken, ticket acceptance, sync review findings): carried as steps 4 to 6.
- Carried section: carried below.

## Carried

Keep a timed decision log in the session scratchpad outside the repository, and track what still needs the owner in the spec's `## Current state` without quotes or attribution. Every identifier in this prompt came from a previous session: treat each as a lead to verify.
