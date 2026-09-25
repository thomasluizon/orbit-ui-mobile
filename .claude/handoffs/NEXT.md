# NEXT

**Read `.claude/specs/orbit-prod-release.md` first**, including its standing instructions and its last section,
"What the 2026-09-25 afternoon run added (session `205c74ca`, attended)".

## Entry point

`/sleep`. It is the only entry point; it runs `/orchestrate` itself. Thomas is asleep: take every decision
yourself, the best approach, and log it.

## The goal: finish the spec

An empty board and a production release, exactly as the spec defines it. The run ends only when the spec is
done, or externally (allowance exhausted, machine stopped, Thomas says stop). A blocker is the next piece of
work. Re-derive what is left:

    gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400

190 tickets were open at this handoff. Every `needs:conversation` ticket is answered (0 open); the 26 tickets
with an "Open questions" section carry their answers as comments and are `needs:no-conversation`.

## In flight, each with a disposition

| item | state | disposition |
|---|---|---|
| worker `#615` main backport | RUNNING at handoff (launcher pid 35248, Codex pid 35751), worktree `orca/workspaces/orbit-ui-mobile/ticket-615-main-backport`, branch `fix/ticket-615-main-backport`, 3 local commits (`65411209` head), no upstream yet, log `/var/folders/x_/m8324t4j1wv_m7y0r8839js00000gn/T/orbit-workers/#615-1790357063800.log` | outcome unknown: read the worktree first; verify-delivery; review; merge to `main` |
| `ui#1100` (`#631` main backport) | open on `main`, COMMENTED at `54c6f013` | clear the findings, merge to `main` |
| `ui#1099` (`#667` main backport, fonts) | APPROVED at `118a750a` | check CI (strict is off; D115 local merge-result check if behind), merge, then close `#667` |
| `ui#1098` (`#668` redesign port, Contract Drift pin) | COMMENTED at `4a21283e` | clear findings, merge; after merge run `gh workflow run redesign-drift.yml --ref redesign/main`; Contract Drift then goes green on redesign PRs |
| `ui#1049` (`#559`, spacing rule) | round 7 pushed at `dc2f5006` (rule cut to a write-free contract), review pending | if a new edge case arrives, answer it as outside the declared contract; merge when approved |
| `api#554` (`#564`, Hangfire) | APPROVED at `f8a412ee` (main merged in) | check CI, merge to `main`, confirm the Render deploy |
| `api#535`, `api#558` (Dependabot nuget) | APPROVED; `#535` asked `@dependabot rebase` (csproj conflicts) | merge when green and conflict-free |
| pins `ui#1046`, `api#537`, `landing#80` | wait for Pullfrog 0.1.83 (`npm view pullfrog version`) | re-review then |
| stale worktrees for merged PRs | about 70 under `orca/workspaces/` (listed by `git worktree list` in both repos) | `node tools/teardown-worktree.mjs` for every one whose PR reads MERGED; never an unmerged one |
| `menu-probe` worktree (detached `959381da`) | commit is on `origin/main` | leave |
| stashes | 0 in all three repositories | none |
| uncommitted work | none in the three main checkouts | none |
| run record | `.git/orbit-orchestrate-run.json`, session `205c74ca`, `sleep: false` | a new session writes its own; carry the open rows |

## What to do, in order

1. **Deliver the in-flight PRs above** (the `#615` worker first). Admission refuses new ticket work above 10
   open PRs; merge before opening.
2. **`main` backport of `#658`** (the admission gate) and **`#672`** (`main` harness on macOS), then **`#673`**
   (flaky tampered-token test) and **`#676`** (goal completion clock race).
3. **`#675`** Turnstile on web and Android sign-in, targeting `main` (shipped sign-in), with a `redesign/main`
   port. It carries `#108`'s details. After it ships, the switch-on needs Thomas's Cloudflare secret (manual).
4. **The `#318` program, in dependency order**: `#678` (API-A) and `#679` (API-B) first, then `#680`, then
   `#681`, and `#682` after `#24` Stage 3. All target `redesign/main`.
5. **`#687`** (does MCP over OAuth enforce the Pro gate; prove it with a free-account test first), **`#684`**
   (ceiling error code, unblocks `#30`), **`#674`**, **`#666`**, **`#620`**, **`#686`**, then the rest of the board
   by leverage (`plan-queue.mjs --board`).

Every identifier here came from a previous session. Treat each as a lead to verify.
