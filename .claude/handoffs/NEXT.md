/auto-work

Read `.claude/specs/orbit-prod-release.md` before anything else: its standing rules, `## The order` (Batch T first), `## Constraints` and `## Current state`. Read `.claude/playbooks/operations.md` before you launch, wait, merge, release or drive a browser, console or device. Open the brain ADRs in `## Decision pointers` through the Obsidian MCP. Read `AGENTS.md` and `CLAUDE.md`, and read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff. Check that this prompt is the newest (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), that the checkout runs current tools (`node tools/relay-checkout.mjs --check`), and free disk (`df -g /System/Volumes/Data`, floor 50 GiB).

## Entry point

`/auto-work` enters through `/sleep`, adopts the relay with `adoptRelayRun` (it keeps `sleep: true`, `crank: true` and `autoWork: true`; read it back), invokes `/crank`, then continues `/orchestrate` over the admitted queue without replanning it. Batch T comes first: no new board ticket is admitted until its ten tickets merge; the in-flight work below continues. No owner question is open, and the owner gave permission for every step that needs a yes (prohibited actions stay the owner's).

## Goal

Finish the spec: an empty board except `#33`, with verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. List what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff (`## The order`): 22 open, 22 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `501ee4411`; API `main` `3da71dcf6`; landing `main` `aab36c695`. Staging web `9a964ccad`; production web `6602756f3`; staging and production API `998823218`. Android Open 1.3.149 (209). Desktop 0.1.25. TestFlight Orbit Staging 1.3.149 (4). Sentry: `ORBIT-MOBILE-Q` unresolved (carried by `#1561`).

| Item | Disposition |
| --- | --- |
| Desktop Release 0.1.26 staging (`#1560`, `#2056`) | Run 42492679821 attempt 2 polls the aarch64 notary id; watcher `wait-desk-42492679821-a2.done.json` in the `25768799` scratchpad. On another limit failure rerun once more; after about 48 hours with aarch64 held, weigh an Apple Developer case. Then the staging web release, then the production web release that publishes signed 0.1.26. |
| `ui#2374` (`#1861`) | Round 7: the Administrators group state (deny-only) replaces the `TokenIsElevated` assertion at `test-acceptance-launch.ts:163`; read the macOS `report.json` before the notification timeout fix. |
| `#2061` | Local branch `fix/ticket-2061-search-clear-centre`, three commits, not pushed, diff not read. |
| `#2062`, `#2063` | `ui#2376` and `ui#2375` delivered, diffs not read; next steps in their order rows. |
| Apple submission `e44eaa63` | Detached poll in the `36945796` scratchpad (`notary-e44eaa63/done.json`). A signal only. |
| `landing#127` (`#1563`) | Approved at `7a1f9641a`. Merge only after signed 0.1.26 is on `desktop-production`; re-check the approval head first. |
| `ui#1989` and the `#2064` pull request | The `#2064` pull request carries these docs and supersedes `ui#1989`: merge any later relay commit into it, then close `ui#1989`. |

Waiting on the owner: ChatGPT Plus, the second Claude account on 4 December 2026, TestFlight for `#1561` (never remind).

## Then, in this order

1. Answer any owner message first, in the owner's language.
2. Batch T through `/orchestrate`, in its order.
3. File waiters on `wait-desk-42492679821-a2.done.json` and `notary-e44eaa63/done.json`.
4. `ui#2374` round 7; salvage `#2061`; drive `#2062` and `#2063` with their device proofs.
5. Once `ui#2374` merges, the `#315` live Astra gate window: a written cost estimate comment on `#315`, `AI__EvalDailyBudgetUsd` 2.00 in the production API env group with a restart, the gate runner (`run-gate-r12.sh` is the template; credentials in `$HOME/.orbit-run-carry/eval-prod/`), each failure rerun once, then 0.50 restored by targeted apply.
6. Desktop 0.1.26, the web releases, `landing#127` and the landing release; close `#2057`, `#2056`, `#1560` and `#1563` on their live evidence.
7. `#1561` device checks once the owner installs TestFlight; find which Play track still serves 1.3.135 and replace it.
8. `#2030`, then `#33` after every other ticket, and the auto-work intake cycle (`node tools/wait-auto-work.mjs` when idle).

## Scratchpad after a reboot

Run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> 25768799-0367-4f40-a08a-dceeee4f760f 67b610f8-fc45-449c-8e61-582a2aa30198` as a background task before you write into the new scratchpad (write the home directory out in full). If the predecessor scratchpad is gone, copy `$HOME/.orbit-run-carry/durable-25768799/` and rewrite the old id in every `.sh` and `.mjs` with `perl -pi`, then point `mirror.sh` at `durable-<new id>`. The predecessor decision log is `sleep-decisions.md` in the `25768799` scratchpad. The helper catalog and the older decision log chain are in `git show b40d003ed:.claude/handoffs/NEXT.md`.

## Crank

The run state carries `crank: true`. Invoke `/crank` immediately after `/sleep` entry; `.claude/skills/crank/SKILL.md` governs. A cranked relay hands off with `/handoff --relay --sleep --crank`; only `/crank --disable` ends it.

## Sleep

Unattended run: never ask the owner anything; decide with the recommended option and log each decision in the decision log format. The run never stops while work remains. Keep a live wake source while work remains (`.claude/playbooks/operations.md` `## Workers and launches`). Release through `/release` and `/android-release` (last Android: 1.3.149, 209). Merge only at the exact approved head with green checks and zero unresolved threads. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, owner orders, refused routes, identifiers, Crank, Sleep and scratchpad rules: carried; the standing owner orders and refused routes moved to the spec's standing rules and `.claude/playbooks/operations.md`.
- Release order, Render ids, release URLs and dispatch rules: carried in `.claude/playbooks/operations.md` and `/release`.
- The diet order section: carried as `### Batch T` in the spec; its measurements live in brain ADR D149.
- Helper catalog and decision log chain: superseded by the pointer to `b40d003ed` above.
- Waiters, `ui#2374`, `#2061`, `#2062`, `#2063`, desktop 0.1.26, `landing#127`, `#2056`, `#2057`, `#1560`, `#1563`, `#1561`, `#2030`, the `#315` gate window, `#33` and intake: carried above.

Every identifier in this prompt came from a previous session: treat each as a lead to verify.
