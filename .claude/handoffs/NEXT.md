/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then the brain ADR `2 Areas/20-29 Orbit Engineering/Decisions/Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md` (including its Implementation log) through the Obsidian MCP. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md`, because most of this run is redesign repair.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made. Write the run state for this session with `sleep: true` first, keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode and GitHub resources (including GitHub environments, their branch rules and their secrets) through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; operate the Google OAuth client through `claude-in-chrome`; and create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production). Never create an account, enter a password or payment detail, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## The owner's instruction for this run

Every issue from the owner's staging review gets fixed, plus many sweeps until nothing is wrong: the redesign is far from acceptable right now. Treat that as the top priority beside Batch M's remaining merges. Every reported issue and every sweep finding is in the spec's `### Batch R` (filed tickets, and findings still to file). After each batch of merged fixes, release `redesign/main` to staging and run a rendered sweep: open every screen on staging in the browser at desktop and phone width, check it against the `DESIGN.md` rules, its drawing, `BRAND.md` and the brain decisions, file what is wrong, fix it, and sweep again until a full pass finds nothing. Code-only audit agents do not count as a sweep.

The owner's review asked for these, and every one must reach staging: Calendário as one centred column (month grid on top, the selected day below, the view switch in the month header, 24px card padding, less bloat, the drawing amended); Perfil with full-row hover and focus, correct group spacing, settings inline, the duplicate Preferências and Avançado pages removed, Suporte opening the support form, and clear copy for the API keys row and the trial heading; Sobre without its internal naming note; Astra on desktop as a side panel with one focus ring; Progresso without the repeating error toast and with a centred column; `⌘K` on a Mac; a stale page after a web release that recovers; dialog pills of equal width with confirm labels that name the consequence.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run ends only when the spec is done or for an external cause (allowance exhausted, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff time the board had 142 open tickets, all 142 placed in the spec's `## The order` (0 unplaced, 0 placed twice); `#833` is placed although GitHub closed it, because its cutover has not run and it must be reopened.

## In flight (verify each first)

| item | disposition |
|---|---|
| `ui#1243` production deploy correlation on `main` (`#831`) | approved at `014d1f84`, every check green: merge, then release production web once (it also ships `#815` and `#834`), confirm a `$pageview` for `app.useorbit.org` in PostHog |
| `ui#1240` web credential carry to `redesign/main` (`#556`, `#831`) | after `ui#1243` merges, cherry-pick its squash with `-x`, answer its thread, push, clear review, merge; then close `#831` |
| `ui#1245` Sobre naming note (`#838`) | approved at `11750e86`, every check green: merge |
| `ui#1248` Calendário one column (`#843`) | open: `Redesign Review Harness` failing and Pullfrog findings; fix both, merge before `ui#1242` |
| `ui#1242` Astra side panel from 1024px (`#835`) | green, one open Pullfrog thread answered by `#843`: merge after `ui#1248`, then resolve the thread |
| `ui#1246` Progresso empty state (`#840`) | open with Pullfrog findings; copy already approved; fix and merge |
| `ui#1247` Perfil rows and inline settings (`#837`) | failing `Sonar Paths`, `SonarCloud Code Analysis`, `Surface Manifest Drift`, `Upgrade layout geometry` and review; copy approved; also delete `/ai-settings` in this pull request (spec Batch R) |
| `ui#1217` privacy (`#805`) | held until email runs on SES; local commit `48bdf5a1` unpushed in worktree `ticket-805-privacy-processors`; three threads open |
| `#836` Mac palette hint | merged (`ui#1244`); close after the next staging web release shows `⌘K` |
| `#833` staging host rename | closed on merge but not cut over: reopen and run the cutover in the spec's Batch M |
| SES production access | case `179056896000159` read: Orbit's full answer is the latest message, AWS owes the reply; `aws sesv2 get-account` still reports `DENIED` |
| Rendered sweep findings | 49 findings in the spec's `## Rendered sweep findings to file` (the fixed composer chip list, the Hoje trial upsell line, the sidebar missing on desktop `/upgrade`, and more): file them into Batch R after the two below |
| Batch R findings not yet filed | the account boundary's query cache clear (stuck skeletons, dropped first taps, undone logs) and the pushed-screen shell (two headers, composer on pushed screens): file both first, with the evidence written in the spec; then Avisos copy and targets, the Astra empty-state glyph and copy, and `aria-expanded` on the row menu |
| Board status of closed tickets | about 36 closed tickets still show a Todo board Status: repair each with `complete-ticket.mjs --repair-status`, slowly (see the spec's GraphQL budget constraint), then tear down their worktrees |
| Staging data | Caminhar is logged for today on the owner's staging account from a sweep; leave it or unlog it |
| Running workers | none |
| Stashes | none in any of the three repositories |
| Uncommitted work | none in the three main checkouts or any worktree; unpushed commits exist only in `ticket-805-privacy-processors` (`48bdf5a1`) |
| Ignored files | `orbit-api/infra/local.tfvars` holds the web digests, the Render database choice, the landing apex-only domain list, and both storage providers set to `S3` |
| Other worktrees | 58 ticket worktrees in `orbit-ui-mobile`, 48 in `orbit-api`, 3 in `orbit-landing-page`; the detached `ticket-822-web-health-retry` sits on a merged `main` commit; tear down per the spec |

## Then, in order

1. The in-flight rows above: merges and the production web release first (they are ready), then the carries, then `#833`'s cutover at a time nobody is testing on staging.
2. The spec's `### Batch R`: file the unfiled findings (the query cache clear first, because it undoes taps and logs), launch workers for every open Batch R ticket within the local cap and the admission gate, merge and release as they pass, then sweep staging again and repeat. Use the local macOS Chrome for sweeps (the spec's claude-in-chrome constraint); start the next sweep with the screens still unswept (listed in Batch R) and re-run the rendered comparison against the drawings.
3. The rest of `### Batch M`, ending with its operations line (the SES switch, then Resend, then `#805`).
4. THE REDESIGN GATE stays open for the owner; do not merge `redesign/main` to `main`.
5. Everything else in the spec's order: the rest of Batch E, Batch 0b and Batch 0c.

## Previous prompt, disposition

- Opening, entry point, sleep contract, authorization and the owner's instruction: carried, with the owner's review list restated.
- Goal: carried, with fresh counts (142 open, 142 placed).
- In flight, `api#641`: done (merged `268384d5`; staging API released and healthy at that commit; reconciliation first failed on AWS OIDC, fixed by `api#642` (merged `561fb431`) and a targeted apply, then passed; the `orbit-api` repository-level `RENDER_API_KEY` deleted; `#830` closed).
- In flight, `ui#1238`: done (merged `7b8b071c`, staging web released at it, `#827` closed).
- In flight, `ui#1243`: carried (both Pullfrog rounds fixed, now approved and green).
- In flight, `ui#1240`: carried.
- In flight, `ui#1239`: merged (`408076f4`, `#815` closed on merge); its production release and pageview check carried.
- In flight, `ui#1241`: merged (`14c30813`, after a chat review fix and copy approval, `#834` closed on merge); its production release and carry carried.
- In flight, `ui#1242`: carried (side panel commit pushed, body rebuilt, waits for `ui#1248`).
- In flight, `ui#1244`: done (merged `07a8e019`); the ticket close carried.
- In flight, `ui#1217`: carried.
- In flight, `#833`: carried.
- In flight, SES: superseded (the case is read; AWS owes the reply).
- In flight, tickets `#834` to `#840`: `#834` done; `#835` to `#840` carried as pull requests or, for `#839`, not started.
- In flight, sweep findings not yet filed: done (filed as `#841` to `#854`); new findings carried.
- In flight, running workers, stashes, uncommitted work, ignored files, other worktrees: carried with fresh results (152 merged worktrees were torn down).
- Steps 1 to 5: carried in the same order.

Every identifier here came from a previous session: treat each as a lead to verify.
