/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then the brain ADR `2 Areas/20-29 Orbit Engineering/Decisions/Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md` (including its Implementation log) through the Obsidian MCP.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made. Write the run state for this session with `sleep: true` first, keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`). For Batch M the run may create and change Render, AWS, Cloudflare, Stripe test mode and GitHub resources through Terraform, CLIs, APIs and MCPs; copy the production database to Render in a short maintenance window after verifying the copy; switch DNS; deploy production through the new release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; and, after a verified cutover, cancel Vercel Pro and Resend Pro and pause the Supabase project (through `claude-in-chrome` only where no API covers it). Never create an account, enter a password or payment detail, or permanently delete a project or its data: those are the owner's, recorded under Waiting on the owner in the spec, while the run continues with every step that does not need them. Never merge `redesign/main` to `main`. Never approve a GitHub `production` environment deployment yourself; those wait for the owner.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval, reached through Batch M first. The run ends only when the spec is done or for an external cause (allowance exhausted, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. At handoff time the board had 134 open tickets, all 134 placed in the spec's `## The order` (0 unplaced, 0 placed twice).

## In flight (verify each first)

| item | disposition |
|---|---|
| `api#622` Google code sign-in | approved at `0be4ffe8`, green; merge (production already carries `Google__AllowedRedirectUris__0`), close `#796`, then launch `#802` |
| `ui#1214` Android tracks and MCP endpoint | approved at `9a492f0c`, green; merge, close `#799` |
| `ui#1215` web Docker image and release workflows | approved at `484117d3`, green after the body dash fix; merge, then build the first staging image, apply Terraform for `orbit-web` and `orbit-web-staging`, set `RENDER_WEB_SERVICE_ID` and `RENDER_WEB_STAGING_SERVICE_ID`, close `#794` |
| `ui#1216` PostHog analytics | approved at `e2e63640`, green; merge, set `NEXT_PUBLIC_POSTHOG_KEY` and `EXPO_PUBLIC_POSTHOG_KEY` build values and the `analytics` feature flag row, verify `/ingest` in the browser, then launch `#84` |
| `api#623` Cloudflare DNS and Turnstile | one P1 thread on `infra/README.md`; clear it, merge, apply, switch the Spaceship nameservers to Cloudflare and verify every record, then launch `#797` |
| `api#624` API release workflow | body finding to clear; turn Render auto-deploy off right before merging, then apply Terraform and prove `deploy-api.yml` once (the owner approves the environment) |
| `api#625` S3 uploads | first review pending |
| `api#626` staging lifecycle | first review pending |
| `ui#1217` privacy processors | held until cutover; its three threads are correct timing guards |
| Running workers | none; every worker of the previous session exited |
| Worktrees of merged branches | `ticket-793`, `ticket-795`, `ticket-798` clean; tear down |
| Stashes, unpushed commits | none in any of the three repositories |
| Ignored files | `orbit-api/infra/local.tfvars` holds placeholder web digests only |
| Staging billing | no ticket yet: file and build Stripe test mode (key in the Keychain as `orbit-stripe-test-secret-key`, verified) and Google Play test billing for internal and closed tracks |
| PostHog dashboard | keep "Orbit - Acquisition and Signups" and add the new tiles once `#83` is live |
| `#763`, `#790`, `#792`, `#556`, `#746`, `#565`, `#566`, `#390`, `#134` | carried unchanged from the spec |

## Then, in order

1. The in-flight rows above, merges first.
2. The spec's `## The order`, Batch M, in its dependency order, ending with the operations list there (web services, database copy with zero rows lost, SES production access, DNS and domain cutover, removing the API's duplicated direct variables, cancelling and deleting the retired services).
3. With staging and production both live on the new stack: deploy the redesign to staging, ship the closed test build to the internal and closed tracks with the staging API, verify it, and stop at THE REDESIGN GATE for the owner's approval.
4. Everything the gate does not block, in the spec's order: the rest of Batch E, Batch 0b and Batch 0c, including the web three-dot menu bug.
5. Owner decisions already taken are in the spec's standing rules; a ticket's acceptance wins over its suggested method; a review finding on a sync pull request that is also a defect on `main` is fixed on `main` first.

## Previous prompt, disposition

- Opening, entry point and sleep contract: carried.
- Sleep authorization: carried, widened to Stripe test mode, with the new rule that the run never approves a `production` environment deployment.
- Goal: carried, with fresh counts.
- In flight: no open pull requests at the start: superseded by the table above. Running workers, stashes, unpushed commits: carried as checked. Stale worktrees: carried in the spec's current state. `#763`, `#790`, `#792`, `#556`, `#746`, `#565`, `#566`, `#390`, `#134`, web three-dot menu: carried.
- Step 1 (Batch M): in progress; tooling done, Render production and staging created, landing and staging API live, contacts moved; carried as step 2.
- Steps 2 to 6: carried as steps 3 to 5.
- Carried section: carried below.

## Carried

Keep a timed decision log in the session scratchpad outside the repository, and track what still needs the owner in the spec's `## Current state` without quotes or attribution. Every identifier in this prompt came from a previous session: treat each as a lead to verify.
