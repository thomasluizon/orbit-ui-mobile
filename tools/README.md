# tools/

> **At a glance** - reusable, agent-callable scripts for the Orbit harness, versioned with the repo.
> - A script lives here when it is worth running more than once. Throwaways go to the scratchpad, never here; `check-root-allowlist.mjs` enforces that boundary.
> - Every tool is non-interactive, supports `--help`, and returns meaningful exit codes (see `CONVENTIONS.md`).
> - `test-tools.mjs` EXECUTES every script here. A new tool with no coverage entry fails it, so coverage lands in the same PR as the tool.
> - The orchestration core includes queue planning, prompt/worker isolation, delivery verification,
>   final-head readiness receipts, ticket synchronization, review-thread handling, and teardown.
> - `verify-delivery.mjs` is the SOLE authority for the word "delivered". A worker's exit code is never evidence.
> - `list-bot-threads.mjs` makes "the bot review never ran" a verdict. Silence is never read as approval.

Reusable scripts an agent (or a human) invokes from the CLI. The bar for landing a file here: it has a
single clear purpose and you will run it again. One-off commands stay in your shell history or the
scratchpad. The root allowlist gate rejects any undeclared root file or directory regardless of its
name or git status. Read `CONVENTIONS.md` before adding one.

## The orchestration core

| Tool | What it does | Usage |
|---|---|---|
| `create-milestone.mjs` | Creates one explicitly approved milestone after proving the exact title does not exist. Sends the locked description through stdin and never creates a ticket. | `node tools/create-milestone.mjs --title <title> --description-file <path\|->` |
| `create-ticket.mjs` | Creates one issue only after validating every existing label, exact milestone title, and blocker. It then adds the issue to the configured board, sets Status (Todo by default), writes all blockedBy relations, and prints its real `#N` identity as JSON. A failed write stops every later write. | `node tools/create-ticket.mjs --title <text> --body-file <path\|-> --label <name>... [--milestone <title>] [--blocked-by <ticket-ref>]...` |
| `complete-ticket.mjs` | Owns the explicit post-merge transition. `--preflight` proves the open ticket and configured project item without writing. Completion sets Status Done and closes the issue as completed. `--repair-status` is the inverse, for a ticket GitHub already closed from a merge commit: it reconciles the board Status with the close reason (completed to Done, not planned to Canceled, duplicate to Duplicate), writes nothing else, and is a no-op when the column already agrees. `--cancel --reason-file` closes an open ticket whose work is GONE rather than done: it posts the required reason, sets Status Canceled and closes as not planned, so deleted work is never recorded as shipped. | `node tools/complete-ticket.mjs --issue <ORB-N\|#N\|N> [--preflight \| --repair-status \| --cancel --reason-file <path\|->]` |
| `plan-queue.mjs` | Resolves a scope (explicit tickets, a GitHub milestone, or the configured board) into ONE ordered execution plan: admission and deferrals, DAG-safe waves, transitive fan-out (`unlocks`), and stackable dependency chains. A ticket whose same-repo blockers do not form one chain has no branch that can carry them, so it defers as `UNSTACKABLE_BLOCKERS_IN_QUEUE` and the rest of the board still plans; cross-repo blockers order but never stack. A still-open blocker outside the queue defers the ticket. It plans only, and writes nothing anywhere. | `node tools/plan-queue.mjs (--tickets ORB-1,#123 \| --project <name> \| --board)` (`--format markdown`) |
| `compose-prompt.mjs` | Builds one worker prompt: the GitHub ticket body verbatim, the orchestrator's brief (objective, scope, output, boundaries), and the finishing contract. Refuses to write inside any declared repo, because a worker that finds its own work order in the tree can commit it. | `node tools/compose-prompt.mjs --issue <ORB-N\|#N\|N> --repo <ui\|api\|landing> --out <abs path>` |
| `launch-worker.mjs` | Spawns one headless worker and supervises it in the foreground. Both clocks kill the complete process tree, and this process is itself the run's wake source. `--measurement` swaps the no-progress clock for the measurement one and leaves the hard ceiling alone. `--hard-ceiling-minutes <n>` replaces the configured ceiling for this one launch, for a ticket that legitimately outruns the fleet-wide default. `--dry-run` prints the resolved plan and spawns nothing. GitHub credentials are owner-selected per child environment; global account state is never switched. It launches a worker; it never merges, reviews, or moves a ticket. | `node tools/launch-worker.mjs --issue <ORB-N\|#N\|N> --worktree <path> --prompt <file>` (`--measurement`, `--hard-ceiling-minutes <n>`, `--dry-run`) |
| `submit-cloud-worker.mjs` | Submits one Codex Cloud implementation from the explicitly pushed branch, after a strict dash check, and persists the task, base SHA, order hashes, deadline, and target worktree in both the scratchpad and shared Git state. Submission returns immediately. Its separate `--watch` mode registers a live wake source, records local abandonment at the deadline, and stays responsible until the remote task is terminal before resuming the unattended scheduler. It never applies a result. | `node tools/submit-cloud-worker.mjs --issue <ORB-N\|#N\|N> --env <id> --branch <name> --order <file> --worktree <path>` or `node tools/submit-cloud-worker.mjs --watch <receipt>` |
| `materialize-cloud-result.mjs` | Reads one task through `codex cloud list --json`, abandons it locally after the cloud ceiling, quarantines late results, and serially applies a non-empty ready diff only into a clean worktree at the receipt's exact base SHA. Recovery authenticates raw patch bytes. A durable materialization retries as idempotent success, while a successful zero-byte authoritative diff resolves an empty result as unusable. It reports Git status and the staged stat from disk, never Codex's file count. | `node tools/materialize-cloud-result.mjs --receipt <file> [--allow-abandoned]` |
| `verify-delivery.mjs` | Derives delivery solely from bounded Git and GitHub children: clean/pushed/current PR, exact current-head CI state, and GitHub compare `behind_by=0`. `OUT_OF_DATE` reports base/head SHAs and behind count. File and line counts remain `sizeAdvisory` and never block. Completed CI passes only on the confirmed `SUCCESS`, `NEUTRAL`, or `SKIPPED` allowlist; every other or future conclusion fails closed. Failed CI retains run/check ID, details URL, workflow, name, status and conclusion; newest rerun wins. | `node tools/verify-delivery.mjs --issue <ORB-N\|#N\|N> --worktree <p> --branch <b> --repo <key>` (`--base`, `--wait-ci`, `--command-timeout-seconds`) |
| `record-readiness.mjs` | Reads the live PR base/head/draft, its branch's required status checks, the compare, and the ticket ONCE, then persists and evaluates one repository-qualified receipt. READY requires green CI over the required contexts, a non-draft state, live `behind_by=0`, and ticket synchronization simultaneously; evidence pinned to an older head or base becomes an explicit stale verdict, and every verdict is reported together. The code review is NOT a separate axis: Pullfrog publishes `pullfrog-approval` as a required status check, so the verdict already arrives through the required contexts this tool reads. It never trusts a caller-authored status flag. | `node tools/record-readiness.mjs --repo <ui\|api\|landing> --pr <number> --delivery <file> --ticket <file>` |
| `sync-issue-state.mjs` | Asserts the live ticket carries exactly the `repo:<key>` label matching `--repo` before either write, so a mistyped ticket key cannot move or comment on a stranger's ticket. Moves working and blocked states to In Progress and simultaneous technical readiness to In Review, never Done. Stores the last posted state to suppress duplicate comments and emits a receipt for the readiness state machine. | `node tools/sync-issue-state.mjs --issue <ORB-N\|#N\|N> --repo <key> --pr <n> --state <working\|blocked\|ready> --head-sha <sha> --base-sha <sha> --message-file <path\|->` |
| `list-bot-threads.mjs` | Reports the repository-qualified Pullfrog review state for one PR. A bare number requires `--repo`; a full PR URL is accepted only when it maps unambiguously. The verdict comes from the review itself, never from the thread count, and a review counts only when its reviewed commit matches the current head. A draft pull request is read like any other one. It posts `@pullfrog review` first unless `--no-request` refuses that comment. GitHub children have hard timeouts and full-tree cleanup; progress is emitted while waiting. Unresolved threads are reported separately. | `node tools/list-bot-threads.mjs --pr <n-or-url> --repo <key>` (`--wait-seconds`, `--poll-seconds`, `--command-timeout-seconds`, `--bot`, `--no-request`) |
| `resolve-bot-thread.mjs` | Resolves the thread node FIRST and refuses unless its repository and pull request equal the targets named by `--repo` and `--pr`, so a globally unique node id cannot choose another live target. Then replies to ONE Pullfrog review thread and resolves it, in that order, never the resolve alone: a closed thread with no reason is indistinguishable from one nobody read. Reply body on stdin; an empty body is refused before any mutation. | `node tools/resolve-bot-thread.mjs --thread <PRRT_...> --repo <ui\|api\|landing> --pr <number> < reply.txt` (`--dry-run`) |
| `salvage-worker.mjs` | Inventories a dead worker's dirty tree, runs a caller-specified workspace test into a real receipt, refuses unrelated pre-staged paths, and stages only repeated named paths. It may run before PR creation; once a PR exists it registers the repository-qualified PR as unready before commit/push. | `node tools/salvage-worker.mjs --issue ORB-N --repo <key> [--pr <n>] --worktree <p> --branch <b> --run-root <p> --test-command <json> --test-receipt <json> --message <m> --path <path>...` |
| `update-ticket.mjs` | Replaces one ticket's body, its title, or both. The body is the only writable copy of the work order a worker ever reads, and the title is the one line every board view shows. Refuses a body without `--confirm-replace`, because that write overwrites every omitted section; a title needs no such flag, because a title typed in full cannot silently drop anything. Reports an identical or CRLF-twin body, and an identical title, as unchanged without touching the issue. It never appends, comments, or moves labels, milestone or Status. | `node tools/update-ticket.mjs --issue <ORB-N\|#N\|N> [--body-file <path\|-> --confirm-replace] [--title <text>]` |
| `label-ticket.mjs` | Adds or removes labels on one existing ticket, each validated against the live label list before the write, exactly like creation. The only sanctioned label mutation: the raw-mutation hook blocks `gh issue edit`, and `update-ticket.mjs` deliberately never touches labels. It never changes board Status, milestone, body, or state, and never creates a label. | `node tools/label-ticket.mjs --issue <ORB-N\|#N\|N> [--add <label>]... [--remove <label>]...` |
| `relate-ticket.mjs` | Adds or removes blocked-by relations on one existing ticket. The only sanctioned relation mutation after creation: `create-ticket.mjs` writes blockers only at creation, the raw-mutation hook blocks `gh issue edit`, and `update-ticket.mjs` writes only the title and the body. Every added blocker is read before the write, so a reference that does not exist fails rather than landing an edge on a stranger's issue. It never changes board Status, milestone, body, labels, or state. | `node tools/relate-ticket.mjs --issue <ORB-N\|#N\|N> [--add-blocked-by <ref>]... [--remove-blocked-by <ref>]...` |
| `board-view.mjs` | Lists the configured board's saved views, or sets one view's filter. The only sanctioned view mutation: the raw-mutation hook blocks `updateProjectV2View` because a GraphQL mutation cannot prove which board it targets, which left a lost filter repairable only by hand. The view is resolved by exact name from the live list before the write, so a typo fails instead of silently reshaping another view, and the result is read back from the mutation's own response. A matching filter is a no-op. It never changes a ticket, a Status or a layout. | `node tools/board-view.mjs --list` or `node tools/board-view.mjs --view <name> --filter <query>` |
| `teardown-worktree.mjs` | Removes one completed Orca worktree only after four independent work-loss checks pass: clean tree, PR merged with its merge commit in the target branch, local tip contained in the PR head, and the ticket closed with board status Done. Verifies removal from the filesystem and git, never from Orca's reply. | `node tools/teardown-worktree.mjs (--issue ORB-N \| --worktree <path>) --repo <key>` |
| `lib/orchestrator-config.mjs` | The one reader of `.claude/orchestrator.json`. Resolves the engine invocation and refuses a working copy that disagrees with `origin/main` when the checkout does not contain it, which is how a launch once started a worker on an already-superseded model. | imported, not invoked |
| `lib/github-issues.mjs` | The one adapter for GitHub tickets. Resolves migrated ORB identifiers and raw issue numbers, normalizes issue and Projects v2 state, validates and creates tickets, preflights and completes the post-merge transition, asserts repository labels, sets pre-merge board status, posts comments, and lists tickets. | imported, not invoked |
| `lib/github-rate-limit.mjs` | The pure proceed-or-wait decision over the per-user GraphQL budget. `list-bot-threads.mjs` asks it before each poll (via the free REST `rate_limit` read) so a spent budget becomes a bounded, announced wait instead of a dead run; the wait is capped by the caller's own remaining budget. | imported, not invoked |
| `lib/github-target.mjs` | Judges whether a caller-supplied GitHub node id belongs to the repository the caller named, before any write. A node that resolves elsewhere, or does not resolve at all, is refused. Also recognises the permissions error GitHub returns for a write aimed at another owner, so that error stops reading as a transient glitch. | imported, not invoked |
| `lib/identifier-ledger.mjs` | Records every node id the harness genuinely read back from GitHub, in `.git/orbit-observed-identifiers.json`. `list-bot-threads.mjs` writes it; `.claude/hooks/forbid-invented-identifier.mjs` reads it to tell a copied id from a typed one. | imported, not invoked |
| `lib/performance-measurement.mjs` | Canonical implementation of the performance workflow's normalization contract. It parses measured SQL conservatively, ranks query statistics, applies mapped execution contexts, and makes unknown SQL or unavailable measurement non-signaling with an explicit reason. | imported by the tools harness and generated into the audit workflow |
| `generate-performance-workflow.mjs` | Generates the measured-performance block in the sandboxed audit workflow from `lib/performance-measurement.mjs`, or fails when the committed block drifted. | `node tools/generate-performance-workflow.mjs (--check \| --write)` |

## Product gates

These back required CI checks. They fail a merge.

| Tool | What it does | Usage |
|---|---|---|
| `check-dashes.mjs` | Fails on an em dash or en dash in a changed file, a PR title, or a PR body. Backs `Dash Ban`. Its baseline may only shrink. | `node tools/check-dashes.mjs --files <path>... \| --check-baseline \| --write-baseline \| --text "<string>"` |
| `check-gradients.mjs` | Fails on decorative gradients in web or mobile source while allowing the named functional masks, calendar lines, loading indicator, and SVG mock. Backs `Design Token Guard`. | `node tools/check-gradients.mjs` |
| `check-lockup-crop.mjs` | Asserts `design/brand/orbit-lockup.svg`'s viewBox equals its ink within 1e-6, solving each path's real bounds from the curve extrema and applying the serialized transforms. It reads the committed bytes, because a generator asserting its own pre-rounded floats passed while the written file clipped. It FAILS CLOSED on a CLOSED SET: only `svg`, `title`, `desc`, `g` and `path` are known, each with an enumerated attribute whitelist, and only `M L H V C Q Z` path commands and a translate plus optional uniform scale. Every other element, attribute, command or transform is an error, never a skip, so an unmodelled paint attribute cannot make it report an exact crop over geometry it never measured. | `node tools/check-lockup-crop.mjs [--file <path>]` |
| `check-copy.mjs` | Enforces the copy register. Backs `Copy Register`. | `node tools/check-copy.mjs --check` |
| `check-i18n-usage.mjs` | Checks web, mobile and shared translation literals against both catalogs and enforces key parity, with no baseline; staged mode reads the index and scans all indexed sources when a catalog changes. Resolves translators through local and imported helpers, component props, aliases, spreads and returned carrier objects when every repository caller agrees on a namespace. Unsupported or disagreeing callers remain unresolved and never fail the gate. Current measurement: 2,954 of 3,539 calls checked (about 83 percent) across 1,921 files, with 585 unresolved calls in 162 files: 359 unproven bindings (331 literal keys) and 226 nonliteral keys with resolved translators. | `node tools/check-i18n-usage.mjs [--staged] [--root <directory>]` |
| `check-suppressions-ratchet.mjs` | Fails when the lint-suppression count grows. Backs `Suppressions Ratchet` (escape hatch: the `ratchet:reseed` label). | `node tools/check-suppressions-ratchet.mjs` |
| `check-push-target.mjs` | Refuses a push whose target is a protected branch. | `node tools/check-push-target.mjs` |
| `check-root-allowlist.mjs` | Fails when an undeclared file OR directory exists at the repository root, including ignored and untracked ones. Backs `Root Allowlist`; declarations live in `root-allowlist.json`. | `node tools/check-root-allowlist.mjs` |
| `check-workspace-overrides.mjs` | Fails when an npm workspace declares an `overrides` key that npm would ignore. Backs `Root Allowlist`. | `node tools/check-workspace-overrides.mjs` |

## Architecture map and visual evidence

| Tool | What it does | Usage |
|---|---|---|
| `arch-map.mjs` | Generates `architecture.json` and `architecture.html`, what an agent reads INSTEAD of exploring the codebase. Kept current by `arch-map.yml` in both repos; without that workflow it rots silently. | `node tools/arch-map.mjs` |
| `surface-manifest.mjs` | Derives the visual-surface inventory into `.claude/manifests/surfaces.json`, one cell per surface x theme x locale. Emits no status field on purpose. | `npm run surfaces:manifest` |
| `redesign-coverage.mjs` | Validates the committed one-to-one mapping from every manifest surface to its redesign group or written exclusion, then prints the exact R-group lists cited by the redesign tickets. | `node tools/redesign-coverage.mjs` (`--json`) |
| `orca-web-port.mjs` | Assigns a deterministic web port in the 3100-4099 window per Orca worktree and records it in the ignored `.orca/web-port`. Root stays on 3000; the database and API stay shared on 5432 and 5000. | `node tools/orca-web-port.mjs` (`--setup`) |
| `android-emulator.mjs` | Brings the Orbit Android emulator to a ready state. Creates `Orbit_Pixel_9_API_35` when absent, using only hardware values measured to boot. Every serial is resolved to its own AVD before it counts as ready, so an unrelated emulator is never reported or installed to, and a serial it cannot identify is never used. A running AVD is reused only while it still resolves `--verify-host`; otherwise it is restarted with `--dns`, because an emulator someone else started inherits the host resolver that failed to resolve `api.useorbit.org`. Readiness comes from `sys.boot_completed`, never from the launch succeeding. | `node tools/android-emulator.mjs` (`--status`, `--avd`, `--dns`, `--verify-host`, `--timeout`, `--json`) |

### The protected-route redirect proof

`.maestro/protected-route-redirect.yaml` proves positively that a protected route sends a signed-out
person to login. It opens the protected route's deep link, asserts the LOGIN probe is visible and the
protected one is not, and requires the capture-only request probe derived from Expo Linking's raw
received URL for the exact protected surface, so a dropped link cannot look like a redirect.

The capture build is independent of the development server. From PowerShell, build and install it on
an already-running emulator, then run the flow. Supply `CAPTURE_LINK`; the assertions decide the
outcome without writing a screenshot:

```powershell
$env:EXPO_PUBLIC_CAPTURE_MODE='true'
npm run android:apk:emulator -w @orbit/mobile
adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
adb shell am force-stop org.useorbit.app
maestro test -e "CAPTURE_LINK=orbit://about?captureTheme=dark&captureLocale=en&captureSurface=m-route-about" `
  --debug-output .artifacts/mobile-capture/protected --flatten-debug-output `
  .maestro/protected-route-redirect.yaml
```

The deep link is `orbit://<path>?captureTheme=<light|dark>&captureLocale=<en|pt-BR>&captureSurface=<surfaceId>`,
where `<path>` is the route's href without its leading slash and `<surfaceId>` is the id in
`.claude/manifests/surfaces.json`. `apps/mobile/lib/capture-mode.ts` reads those parameters, and they
apply only in a build carrying `EXPO_PUBLIC_CAPTURE_MODE`.

The `force-stop` is load-bearing, not tidiness: the flow opens with `openLink`, so a warm app
exercises the warm-link path instead. Expo Router's guard rejects a protected warm link by retaining
the current public route, which leaves no prior public route to retain only on a cold start, and that
is what makes landing on login a positive claim.

## Brand assets

| Tool | What it does | Usage |
|---|---|---|
| `generate-brand-assets.mjs` | Regenerates the canonical 16, 48, 128 and 512 brand PNGs, the native 16 plus canonical 32 and 48 favicon layers, the Apple icon, console upload exports, platform icon, launcher layers, splash, notification silhouette, web icons, OG composite and Play feature graphic from the three canonical Orbit mark sources, `orbit-mark.svg` for the 1024 geometry, `orbit-mark-accent.svg` for every coloured raster and `orbit-mark-16.svg` for the native redraw below roughly 20px. Each one is validated before any render, so a missing or structurally invalid source fails rather than producing a silently wrong set. Outputs use the platform canvas and ink tokens with no baked mask radius. | `node tools/generate-brand-assets.mjs --write` |

## Harness self-test

| Tool | What it does | Usage |
|---|---|---|
| `test-tools.mjs` | Executes every tool in this directory against its contract and fails on any tool with no coverage entry. Review-only evidence is not sufficient: a harness that is read but never run is how a gate reports green over work that never happened. | `node tools/test-tools.mjs` |
| `record-gh-fixtures.mjs` | Re-records the GitHub issue, label, and Projects v2 response path/type manifest from read-only live `gh` commands. It never creates, edits, comments on, or closes a ticket. | `node tools/record-gh-fixtures.mjs` |

Its sibling is `node .claude/hooks/test-hooks.mjs`, which proves the seven session hooks block and allow
as specified, and that every hook wired in `.claude/settings.json` exists on disk and vice versa.

## Fixtures

`__fixtures__/gh-issue-envelopes.json` is recorded real `gh` output. Tests assert against what the CLI
actually emitted, never against a hand-written shape. Re-record it only with
`node tools/record-gh-fixtures.mjs`. The recorder is read-only and emits no write envelope. Two measured
incidents in this repository involved a worker inventing a field while the same commit added a mock that
agreed with the guess, so the harness stayed green over a real defect.
