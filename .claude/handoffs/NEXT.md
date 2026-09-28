/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then the brain ADR `2 Areas/20-29 Orbit Engineering/Decisions/Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md` (including its Implementation log) through the Obsidian MCP.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made. Write the run state for this session with `sleep: true` first, keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`). For Batch M the run may create and change Render, AWS, Cloudflare, Spaceship DNSSEC, Stripe test mode and GitHub resources through Terraform, CLIs, APIs and MCPs; copy the production database to Render unattended (the owner authorized it as this run's first step); switch DNS; deploy production through the new release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; and, after a verified cutover, cancel Vercel Pro and Resend Pro and pause the Supabase project (through `claude-in-chrome` only where no API covers it). Never create an account, enter a password or payment detail, or permanently delete a project or its data: those are the owner's, recorded under Waiting on the owner in the spec, while the run continues with every step that does not need them. Never merge `redesign/main` to `main`. Start a production release only where this prompt or the spec's order calls for it; starting the run is the approval.

## Owner instructions for this run

0. Before anything else, remove the required reviewer from the `production` environment in all three repositories (`gh api -X PUT repos/thomasluizon/<repo>/environments/production` with no `reviewers`, keeping the environment and its secrets), confirm the protection rules list is empty, and correct the brain ADR `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`: the owner never asked for a required reviewer; starting a production release is the approval.
1. First step: copy the production database from Supabase (project `wdscxamegetmhqldqsdg`, Postgres 17) to Render Postgres `orbit-production` (`dpg-dasotg8473hc739a5gpg-a`), unattended: freeze writes (suspend the production API for the window), dump `public` and `hangfire`, restore, verify every table by row count and checksum with zero rows lost, point the production API at Render Postgres, and bring it back; Supabase is paused only after the owner signs off. Read credentials from SSM and Render without printing them.
2. Fix staging login on `https://orbit-web-staging-eakn.onrender.com/login`: the email code is never sent ("O código não foi enviado"; find why in the staging API logs and its email configuration, and make it send), and Google sign-in still goes through Supabase and hits the egress error because `redesign/main` does not carry `#1219` yet (the running `#556` carry below is that fix). Verify both by signing in on staging.
3. Finish Spaceship: add the Cloudflare DS record at Spaceship > useorbit.org > DNSSEC (key tag 2371, algorithm 13, digest type 2, digest `550CC9A0902AC2319B30F903A53F7D487E2172A4B2E65C587348A0867EC2DC46`). The org registry delegates to Cloudflare since the last session and both Cloudflare nameservers publish KSK 2371; confirm both again, then add the DS and verify with `dig +dnssec` that a validating resolver (1.1.1.1) returns the `ad` flag.
4. Rework the release workflows (spec standing rules and Batch M items 8 and 9): nothing deploys on a merge or push, and no branch is tied to staging.
   - One manually run `release.yml` in each code repository (`orbit-api`, `orbit-ui-mobile`, `orbit-landing-page`) with an environment input: `production` always deploys `main`, and starting it is the approval; `staging` deploys a branch the operator selects (for example `main` to test before production). Fold `deploy-api.yml`, `deploy-web.yml`, `web-image.yml` and `deploy-landing.yml` into these and delete them; turn Render auto-deploy off for the staging API in Terraform.
   - `android-release.yml` keeps its track input with only the tracks in use: open and production build `main` against the production API; the internal testing track (the owner's closed beta) builds a selected branch against the staging API. Delete every other track option. Confirm in Play Console which testing track the owner's testers use before deleting any.
   - Update the `/release` skill and its tools to match: production compares against `main`; staging takes a branch.
5. Ship Android on both tracks through the reworked `android-release.yml`, each with its own binary and the next versionCode in the shared sequence: a staging build from `redesign/main` (staging API) to the internal (closed beta) track once staging login works, and a production build from `main` (production API, with `#1219`'s Google sign-in and the other fixes) to the open track. If Play rejects an upload because an older build on another active track fails validation, replace that build first (spec constraint).
6. Leave everything deployed and current: run `/release` for production (API, web, landing, Android open track, in that order) and `/release` for staging with `redesign/main` selected, and verify each service's live commit against its branch head.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval, reached through Batch M first. The run ends only when the spec is done or for an external cause (allowance exhausted, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. At handoff time the board had 127 open tickets, all 127 placed in the spec's `## The order` (0 unplaced, 0 placed twice).

## In flight (verify each first)

| item | disposition |
|---|---|
| Worker `#556` carry, `orbit-ui-mobile` worktree `ticket-556-carry-google-release`, branch `fix/ticket-556-carry-google-release` | cherry-picking `main`'s seven newest commits (`#1222`, `#1220`, `#1224`, `#1221`, `#1225`, `#1223`, `#1219`) onto `redesign/main`; last seen with 5 commits and a dirty tree mid-pick; outcome unknown. Read the worktree and the worker log under `$TMPDIR/orbit-workers/`; finish or relaunch, open the PR, merge, then verify staging Google sign-in |
| `ui#1226` analytics opt-out (`#84`), branch `feature/orb-78-analytics-opt-out`, base `redesign/main` | the worker finished and opened it; CI and Pullfrog not yet read; drive it to merge (its toggle copy changed during the worker's run: approve the final strings with /second-opinion) |
| `api#628` SES | approved; SonarCloud red on new-code findings; fix them, re-review, merge, then apply its Terraform, request SES production access, and switch the email provider variables |
| `api#631` web plan guard (`#814`) | first review round; drive it to merge |
| `api#626` staging lifecycle | approved; GitGuardian false positive the owner clears; after merge run the staging database state move in its manual steps |
| `api#625` S3 uploads | SonarCloud `terraform:S6258` needs the owner's accept; after merge switch uploads to S3 once the web host serving production has the S3 CSP |
| `ui#1217` privacy processors (`#805`) | held until cutover; apply the owner's softened transfers sentence from the ticket comment |
| `Deploy API` run in `orbit-api` | still waiting on the reviewer being removed; cancel it once the reviewer is gone and release the API through the new flow |
| Cloudflare DNSSEC | enabled and signing; DS at Spaceship is owner instruction 3 |
| Stashes, unpushed commits, uncommitted work | none in any of the three repositories apart from the two worker worktrees above |
| Ignored files | `orbit-api/infra/local.tfvars` holds the real staging web digest and a placeholder production web digest |
| `#763`, `#790`, `#792`, `#556`, `#746`, `#565`, `#566`, `#390`, `#134` | carried unchanged from the spec |

## Then, in order

1. The owner instructions above, in their order, then the in-flight rows.
2. The spec's `## The order`, Batch M, in its dependency order, ending with its operations list.
3. With staging on the new stack and staging login working: deploy the redesign to staging, ship the closed test build to the internal and closed tracks with the staging API, verify it, and stop at THE REDESIGN GATE for the owner's approval. Production being on the new stack is not a precondition for this build.
4. Everything the gate does not block, in the spec's order: the rest of Batch E, Batch 0b and Batch 0c.
5. Owner decisions already taken are in the spec's standing rules and constraints; a ticket's acceptance wins over its suggested method; a review finding on a sync pull request that is also a defect on `main` is fixed on `main` first.

## Previous prompt, disposition

- Opening, entry point and sleep contract: carried.
- Sleep authorization: carried, widened to Spaceship DNSSEC and to the unattended database copy the owner authorized.
- Goal: carried, with fresh counts.
- In flight: `api#622`, `ui#1214`, `ui#1215`, `ui#1216`, `api#623`, `api#624` done (merged; tickets closed); `api#625`, `api#626`, `ui#1217` carried with new state; staging billing done (`#808`, `api#629`); PostHog dashboard done (four app tiles added, landing tiles scoped to the landing host); worktrees of merged branches carried to the spec's stale worktree note.
- Step 1 (in-flight merges): done except the rows carried above.
- Step 2 (Batch M): carried; nameserver switch done, staging web created, the rest carried in the spec's operations list.
- Step 3 (gate build): carried, now without waiting for production.
- Steps 4 and 5: carried.

## Carried

Keep a timed decision log in the session scratchpad outside the repository, and track what still needs the owner in the spec's `## Current state` without quotes or attribution. Every identifier in this prompt came from a previous session: treat each as a lead to verify.
