# AGENTS.md (orbit-ui-mobile)

Instructions for Codex (CLI workers and the cloud reviewer). Claude Code reads
CLAUDE.md; the two must not fork: this file holds the worker contract and the review
rules, and DEFERS to `CLAUDE.md` (same directory) for repo conventions. Read CLAUDE.md
before writing code.

## Worker contract

- Your prompt is a Linear ticket body. Execute exactly it: scope and out-of-scope are
  binding; an impossible or contradictory ticket means STOP and report, never improvise.
- Finish = lint + type-check + tests green for the touched workspaces, commit, push,
  one PR to the ticket's target branch linking `ORB-N`, then own its review cycle
  through approval with zero unresolved threads. The pull request must be ready for review, never a draft.
  Never merge. Never push to `main` or `redesign/main` directly.
- After pushing, poll your pull request. Reconcile each automated review finding
  against the diff, fix valid findings, commit and push the fix, reply on the thread
  naming the fix commit, resolve the thread, and repeat until the review decision is
  approved with zero unresolved threads. Never resolve a thread opened by a human,
  and never report completion while any thread remains unresolved.
- Use `node tools/pr-watch.mjs --repo <owner/name> --pr <number> --once` for each
  low-level transition wake-up only. After every call and before waiting or
  reporting completion, run
  `node tools/worker-status.mjs --worktree <path> --issue ORB-N --json`. That
  full-surface completion poll inventories review submissions, review threads and
  their nested comments, and PR conversation comments, and fails closed on an
  incomplete inventory. Read unmet item bodies through GitHub's read APIs,
  reconcile them, then poll again. An informational automated finding that needs
  no code change may be resolved after replying with
  `No code change required: <reason>. Evidence: <PR commit>`. The named commit must
  be on the PR and change the reviewed path.
- For an automated finding in a review body or PR conversation comment with no
  thread, post a PR comment naming that activity ID and the PR commit that addresses
  it so the pre-merge verification can prove it was handled.
- Escalate when you disagree with a finding, when you are blocked on a decision you
  may not make, or when two consecutive cycles fail on the same finding. Report one
  escalation carrying the finding and your reasoning; otherwise report once when the
  pull request is approved with zero unresolved threads.
- Parity is mandatory for `parity:yes` tickets: `apps/web` and `apps/mobile` change in
  the SAME PR, logic and behaviour identical; i18n keys land in `en.json` AND
  `pt-BR.json` in the same edit.
- `visible-effect` tickets: capture the affected surfaces, read every captured
  screenshot, and critique the pixels against `DESIGN.md` plus
  `RENDER-CORRECTNESS.md`. Revise and re-capture until the critique is clean or a
  hard cap of three capture-critique iterations is reached; the cap prevents a
  subjective review loop from consuming the worker budget. Before In Review, attach
  the final screenshots and the critique to the Linear issue. At the cap, the
  critique must explicitly report every unresolved finding. For `parity:yes`, critique
  both platforms or name the platform not covered and why.
- Gates you will hit (all CI-enforced, none optional): ESLint `local/*` rules, the
  spacing-scale and z-index ratchets (`eslint-suppressions.json` may only shrink), the
  dash ban (`tools/check-dashes.mjs`; never type an em dash anywhere, including
  commits and PR text), the copy register (`tools/check-copy.mjs`), cross-platform
  parity, and the arch-map drift job (`node tools/arch-map.mjs` after changing routes,
  endpoints, or module structure, commit the regenerated artifacts).
- Never edit a gate baseline to admit a new violation. Fix the violation.

### Guardrails you must not trip

These hold for EVERY worker and every engine. They are enforced by CI, GitHub branch
protection, and the lefthook pre-commit/pre-push hooks, NOT by the Claude Code session
hooks (those do not run under a codex worker or a raw shell). This list is the readable
copy; the gates are the enforcement.

- Never push or force-push to `main` (or `redesign/main`). Branch to
  `feature/`|`fix/`|`chore/`, open a PR, squash-merge only. Never reuse a squash-merged
  branch.
- Never bypass the git hooks: no `--no-verify` (or its `-n` commit alias), no
  `--no-gpg-sign` and no `commit.gpgsign=false`. Fix what a hook flags, then commit.
- Never `git worktree remove --force`: on Windows it follows a junction and deletes the
  link target. Remove the junctions first, then remove the worktree without `--force`.

## Code Review Rules

Only what no gate can check; mechanical findings belong to CI and are noise here.
Flag P0/P1 only.

1. **A DTO field renamed, removed, or retyped that a shipped mobile client still
   reads.** The Contract Drift job cannot judge this: it does not know the Play-fleet
   lag. Safe path: append-only optional fields; breaking changes use expand-contract
   plus the `AppConfig.MinSupportedVersion` gate.
2. **`AppConfig.MinSupportedVersion` raised before the carrying build is live in the
   Play fleet.** Safe path: raise it only after the build carrying the change is the
   fleet minimum.
3. **A mobile mirror that exists but behaves differently from the web change.** The
   parity CI job sees file presence, not behaviour. Safe path: same logic, same error
   handling, same i18n keys; platform adapters differ only in the adapter layer.
4. **A load-bearing string changed**: URL slug, anchor id, primary nav label, form
   field `name` or order. Every test stays green while SEO/analytics/autofill
   regresses. Safe path: treat as a decision needing sign-off, not a refactor.
