/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then the brain ADR `2 Areas/20-29 Orbit Engineering/Decisions/Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md` (including its Implementation log) through the Obsidian MCP.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made. Write the run state for this session with `sleep: true` first, keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`). The run may create and change Render, AWS, Cloudflare, Stripe test mode and GitHub resources (including GitHub environments, their branch rules and their secrets) through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; and, once email runs on SES, cancel Resend Pro (through `claude-in-chrome` only where no API covers it). Never create an account, enter a password or payment detail, or permanently delete a project or its data: those are the owner's, recorded under Waiting on the owner in the spec, while the run continues with every step that does not need them. Never merge `redesign/main` to `main`. Never read a live secret into the transcript: pipe it from its source into its destination, and choose a design that needs no secret that only a dashboard shows.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval, reached through Batch M first. The run ends only when the spec is done or for an external cause (allowance exhausted, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. At handoff time the board had 128 open tickets, all 128 placed in the spec's `## The order` (0 unplaced, 0 placed twice; 14 tickets appear again only as dependency mentions).

## In flight (verify each first)

| item | disposition |
|---|---|
| `#829` rework, `orbit-landing-page` worktree `ticket-829-render-credential`, branch `fix/ticket-829-render-credential`, `landing#95` | the worker finished with local commit `eaa7f2b` (environment-scoped staging key, no deploy hook), not pushed; read its report in `$TMPDIR/orbit-workers/#829-*.log` (newest), carry it into the body, resolve threads, push, drive to merge |
| `#830` rework, `orbit-api` worktree `ticket-830-render-credential`, `api#639` | the worker finished with local commit `8ce0f662`, not pushed; same steps as `#829` |
| `#831` rework, `orbit-ui-mobile` worktree `ticket-831-render-credential`, `ui#1237` | the worker finished with local commit `16b14c86`, not pushed; read its report in `$TMPDIR/orbit-workers/#831-*.log` (newest), carry it into the body, resolve threads, push, drive to merge. It moves the Android internal job to its own environment; after it merges, add the `main`-only rule to the web `staging` environment |
| Repository-level `RENDER_API_KEY` in all three repositories | delete each one after its credential pull request merges and a production and a staging release both pass |
| `ui#1238` hydration carry to `redesign/main` (`#827`, `#556`) | opened by a worker; CI and Pullfrog not read; drive it to merge, then close `#827` |
| `landing#94` landing sync (`#828`), worktree `ticket-828-landing-redesign-sync` | Pullfrog commented; local commit `7c9bc9f` (production release requires the public build marker) is not pushed; after `#829` merges, also carry its squash, answer the review, push, merge, then run the staging landing release and confirm the `orbit-build` marker |
| `ui#1217` privacy (`#805`), worktree `ticket-805-privacy-processors` | held until email runs on SES; local commit `48bdf5a1` (LGPD safeguards sentence) is not pushed; three threads open |
| SES production access | AWS case `179056896000159` waits on AWS; read it in the AWS Support console; on approval run the spec's Batch M operations line |
| Local branch `carry-next-dlq-alarm` in the `orbit-api` worktree `ticket-746-api-redesign-sync` | its commit reached `redesign/main` through `api#638`; delete the branch |
| Detached `orbit-api` scratch worktrees `merge-api-583` and `merge-api-584` | hold uncommitted files from an older run; read them, keep anything durable, then remove them |
| Stashes | none in any of the three repositories |
| Ignored files | `orbit-api/infra/local.tfvars` holds the web digests, the Render database choice, the landing apex-only domain list, and both storage providers set to `S3` |
| Other worktrees | every other worktree belongs to a merged branch; tear them down per the spec's stale worktree note |

## Then, in order

1. The in-flight rows above, credential isolation first, because the landing sync and every later release depend on it.
2. The spec's `## The order`, Batch M (it now includes renaming the staging web host to `app-staging.useorbit.org`, an owner decision), in its dependency order, ending with its operations line (the SES switch, then Resend, then `#805`).
3. THE REDESIGN GATE stays open for the owner: staging runs `redesign/main` and the internal 1.3.39 (98) build is out. Keep staging current with `/release` for staging whenever `redesign/main` moves, and do not merge `redesign/main` to `main`.
4. Everything the gate does not block, in the spec's order: the rest of Batch E, Batch 0b and Batch 0c.
5. Owner decisions already taken are in the spec's standing rules and constraints; a ticket's acceptance wins over its suggested method; a review finding on a sync pull request that is also a defect on `main` is fixed on `main` first.

## Previous prompt, disposition

- Opening, entry point, sleep contract and goal: carried, with fresh counts; the authorization no longer names the database copy, DNSSEC or Vercel, which are done.
- Owner instruction 0 (remove the production reviewer): done; no repository has a reviewer rule, and the ADR states none.
- Owner instruction 1 (copy the production database): done; zero rows lost, the production API reads Render Postgres; the Supabase project is paused after the owner's sign-off.
- Owner instruction 2 (staging login): done; email code and Google sign-in both verified on staging.
- Owner instruction 3 (DNSSEC DS at Spaceship): done; DNSSEC validates.
- Owner instruction 4 (release workflows): done; one manual `release.yml` per repository, the old deploy workflows deleted, staging auto-deploy off, `android-release.yml` limited to internal, open and production, `/release` updated.
- Owner instruction 5 (Android on both tracks): done; 1.3.38 (97) from `main` on open, 1.3.39 (98) from `redesign/main` on internal.
- Owner instruction 6 (release both environments): done for production (API, web, landing, Android at `main`) and for staging API and web at `redesign/main`; staging landing's marker check waits on `#828`.
- In-flight rows: the `#556` Google carry, `ui#1226`, `api#628`, `api#631`, `api#626`, `api#625` all merged; the old `Deploy API` run is gone with its workflow; `ui#1217` carried; the other rows carried through the spec.
- Steps 1 and 3: done (the gate build shipped). Steps 2, 4 and 5: carried.

## Carried

Keep a timed decision log in the session scratchpad outside the repository, and track what still needs the owner in the spec's `## Current state` without quotes or attribution. Every identifier in this prompt came from a previous session: treat each as a lead to verify.
