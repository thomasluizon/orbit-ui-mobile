---
name: drive
description: Drive an epic (a multi-bundle issue) or several issues to done across MULTIPLE fresh sessions via a living spec file that survives /clear. A resumable, spec-driven conductor over /prime, grill-me, /plan, and /implement — heavy plan/implement work runs in worktree subagents (multiple issues in parallel), the interactive gates stay in the main session, and the SAME command resumes from the spec until the issue is closed. Use for a known-diff epic that is too big for one /execute pass but is NOT a converging-metric campaign (for that, see WORKFLOW.md's campaign pattern).
argument-hint: <issue-number> [issue-number ...] | status <#…> | stop <#>
---

# Drive: spec-driven, resumable, multi-session issue conductor

A thin conductor, like `/execute`, but built to span **many fresh sessions**. It writes
no new logic and re-implements nothing — `/prime`, `grill-me`, `/plan`, and `/implement`
own their behavior; reference them by name, never restate them. The one thing `/drive`
adds is a **living spec file** that is the durable state, so the whole run survives a
`/clear` and resumes from the exact same command.

`/drive` targets issues in `thomasluizon/orbit-ui-mobile`.

**Why it exists:** `/execute` is single-pass — one prime → plan → implement in one session.
An epic (a multi-bundle issue like a phased tech epic) is too big for that: one giant plan,
one giant implement, and a context window that rots. `/drive` breaks the epic into bundles,
does a bounded chunk per session, records progress in the spec, and hands you the exact
next command. It is the *attended* twin of `/night-run` (fresh context per unit, state in a
file) with the interactive gates kept, and it automates WORKFLOW.md's split-session pattern.

## The two levers, and how they compose

- **Subagents keep the main session thin.** Plan and implement run in worktree subagents
  (isolated, fresh context, parallel across issues). The main session accumulates only gate
  exchanges + one-line summaries + spec diffs — never full implementation transcripts. So
  you can drive several bundles in one session before it fills.
- **The spec makes `/clear` free.** When the session does fill (or you want to stop for the
  night), `/clear` and re-run `/drive <#>`; it reads the spec, reconciles against reality,
  and continues. `/clear` becomes an *optional checkpoint*, not a mandatory per-bundle step.

Subagents reduce how often you must clear; the spec makes any clear resumable. Both, not either.

## The living spec (the source of truth)

One file per issue at `.claude/specs/issue-<N>.spec.md` (gitignored, like `.claude/plans/`).
It is authoritative for *what is done and what is next*, but it is **reconciled against `gh`
on every resume** — never trusted blindly (a PR the spec calls "done" might have been closed
unmerged; verify with `gh pr view`). Template:

```markdown
---
issue: <N>
title: <issue title>
status: draft | in-progress | blocked | complete
next-action: "/drive <N>"        # exact command to paste after /clear
---

# Drive spec — #<N>: <title>

## Bundles
| # | scope | status | plan | branch | PR |
|---|-------|--------|------|--------|----|
| 1 | <e.g. A1+A3+A4 docs/tools> | done        | plans/issue-<N>-b1.plan.md | feature/… | #123 merged |
| 2 | <e.g. A2 /commit-sweep>    | in-progress | plans/issue-<N>-b2.plan.md | feature/… | #124 open   |
| 3 | <e.g. A5 precommit>        | todo        | -                          | -         | -           |

## Decisions (from grilling — durable across every /clear)
- <decision + why>

## Lesson candidates (from blocked bundles / verifier DISAGREE — promote via /lesson)
- <one line + the bundle it came from>

## Reconcile log
- <what a resume corrected against gh, and when>
```

Bundle `status`: `todo` → `planned` → `in-progress` → `done` (PR merged) | `blocked`.

## Mode detection

Parse `$ARGUMENTS`:

| Input | Mode |
|---|---|
| `status <#…>` | **Report.** Read each spec, reconcile against `gh`, show the bundle table + next action. No work. |
| `stop <#>` | **Pause.** Set the spec `status: blocked` with a one-line reason. No work. |
| ≥ 1 issue number, no spec yet | **Init** that issue (below). |
| ≥ 1 issue number, spec exists | **Resume** that issue (below). |
| ≥ 2 issue numbers | Run init/resume per issue in **multi-issue mode** (worktrees + parallel subagents). |
| 0 numeric tokens | Ask for an issue number. Do nothing else. |

## Init (first run on an issue)

1. **Prime.** Run `/prime <N>` (load-only; single-issue) or, for 2+ issues, `/prime <N…>`
   (it creates the paired worktrees and primes each in a parallel subagent). Do not carry
   past its summary except into the spec.
2. **Decompose.** Read the issue. If it is an epic (phased body / multiple independent
   items), break it into an ordered **bundle** list — group correlated items to minimize PRs
   (respect the "minimum PRs" preference), and order by dependency. A bounded slice is a
   single bundle (degenerate case — `/drive` still works, it just finishes in one cycle).
3. **Write the spec** with all bundles `todo`, decisions empty, `next-action: "/drive <N>"`.
4. **GATE — SPEC.** Show the bundle table + sequencing. Wait for `approve` / `edit <note>` /
   `abort`. Default-deny: no or ambiguous response → restate and wait.
5. **Grill** (main session; interactive — it NEVER runs as a subagent). Single issue:
   invoke `grill-me` on the open questions `/prime` surfaced. 2+ issues: invoke
   `batch-grill <N…>` — one frontier over the whole set, shared questions asked once,
   cross-issue conflicts surfaced before planning. Either way, record every resolved
   decision in the issue's spec Decisions section. The user's explicit exit is the gate.
6. Proceed to **Work** on the first `todo` bundle.

## Work (per bundle — heavy steps delegated to subagents)

1. **Plan (subagent).** Spawn a subagent in the issue's worktree to run `/plan` scoped to the
   bundle; it writes `.claude/plans/issue-<N>-b<k>.plan.md` and returns the plan Summary /
   Files / Tasks. Mark the bundle `planned` in the spec. Across multiple issues these run in
   parallel (3 concurrent cap, like `/implement`).
2. **GATE — PLAN.** Main session shows each plan's Summary / Files / Tasks. Wait for
   `approve` (blanket) / `approve <bundle|issue>` / `revise <feedback>` / `abort`. NOTHING
   implements without an explicit approve. This is the gate `/execute` treats as critical and
   the reason `/drive` never does "prime → implement" with no plan review.
3. **Implement (tier-routed subagent).** For each approved bundle, read the bundle plan's **Tier**
   field (`sonnet` / `opus`; default `opus` if absent) and spawn the matching implementation
   agent in the worktree — **`implement-sonnet`** (Sonnet 5 @ `high`) for a proven-isolated
   slice, **`implement-opus`** (Opus 4.8 @ `xhigh`) otherwise. It runs `/implement` Phases 1–6:
   code + parity + tests + validation, opens a **draft PR** (`gh pr create --draft`), and returns
   one line of JSON `{"bundle":k,"status":"done"|"blocked"|"failed","pr":"<url>","summary":"…"}`.
   If `implement-sonnet` returns `blocked` with a `tier-mismatch` reason, re-spawn that bundle on
   `implement-opus`. The draft PR + your review is the merge gate (a subagent cannot hold
   `/implement`'s interactive push prompt — the plan approval above already authorized the work;
   the draft state keeps the human at the merge). These named tier agents replace the old
   anonymous spawn, which silently ran every bundle on the inherited Opus session with no way to
   route the cheap slices down. Parity is mandatory: a web change lands in mobile and vice versa;
   i18n keys in both `en.json` and `pt-BR.json`; backend support in `orbit-api` via the added
   worktree.
3b. **Vision-verify (UI bundles only — the pixel check `/night-run` cannot do).** If the bundle
   changed a rendered surface, verify the pixels before you spend review attention, since
   `/drive` is attended and a renderer is available here:
   - Bring the stack up with the `dev-server` skill if it is not already running, then drive
     the `claude-in-chrome` MCP to navigate to the changed surface and screenshot it (light +
     dark). The **main session is vision-capable** — read the screenshot against `DESIGN.md`:
     semantic tokens only, no decorative glow / gradient wash, base-4 spacing, the AI-slop and
     scene-sentence tests, and the `#539` de-decorated anchor. Also run `design-reviewer` for
     the static token/parity pass on the diff (it is read-only and has no browser, so it never
     replaces the render — the two are complementary).
   - Report **pass** or the concrete deviations before the merge review. Never claim a visual
     pass you did not actually render; if the stack will not come up, say so and fall back to
     the static `design-reviewer` pass only.
4. **Update + reconcile.** Write the bundle's `status`, `branch`, and `PR` into the spec.
   Verify the PR with `gh pr view` — the spec reflects `gh` truth, not the subagent's claim.
   If the bundle came back `blocked`/`failed`, or vision-verify found a `DESIGN.md` deviation,
   append one line to the spec's **Lesson candidates** section (what went wrong + the bundle)
   and remind at handoff to run `/lesson`. Do not auto-edit the tracked `pending-lessons.md`.
5. **Next.**
   - More `todo` bundles AND the main session is still thin → offer to continue to the next
     bundle now, in this session.
   - Session getting long, or the user wants to pause → set `next-action: "/drive <N>"` and
     print the handoff: **"Bundle <k> PR: <url>. Run `/clear`, then `/drive <N>` to continue."**

## Resume (fresh session — the same `/drive <N>`)

1. Read the spec. **Reconcile against `gh`** for every non-`todo` bundle: PR merged → `done`;
   PR open → keep (awaiting merge); branch exists with no PR → `in-progress`; nothing on the
   branch → back to `todo`. Correct the spec and append to the Reconcile log.
2. Re-prime context (`/prime <N>` or a prime subagent) since the session is fresh.
3. Continue from the first actionable bundle via the **Work** loop.

## Termination

When every bundle is `done` with a **merged** PR: confirm once, then `gh issue close <N>`
(cross-repo issues: close the paired issue too), set the spec `status: complete`, and report
the PRs landed. `/drive` does not merge PRs itself — merging stays a human action.

## Multi-issue mode (2+ issue numbers)

Same loop, fanned out — mirroring `/execute`'s multi-issue mode and `/prime`/`/plan`/`/implement`'s
own multi-issue modes (they own the worktree + parallel-subagent machinery; never restate it):

- **Prime** creates paired worktrees under `.claude/worktrees/<branch>` and primes each issue
  in a parallel subagent.
- **Grill** stays in the main session (interactive; never a subagent). 2+ issues use
  `batch-grill <N…>` — one frontier over the set, shared questions asked once, cross-issue
  conflicts surfaced — recording each issue's decisions in that issue's spec.
- **Plan** and **Implement** run as parallel worktree subagents, per issue, 3 concurrent max.
- The three gates become **batch gates** over all issues, with per-issue scoping allowed
  (`approve <#…>`, `revise <#> <feedback>`, `drop <#…>`).
- One spec per issue; each advances independently. A failing issue does not halt its siblings.

## Output / next step

- **Mid-run:** end every turn with the concrete handoff line — the PR(s) opened and the exact
  next command (`/drive <N>` after `/clear`, or "continue" to take the next bundle now).
- **Report mode (`/drive status <#…>`):** the reconciled bundle table per issue, spent PRs,
  and which bundle is next.
- **On completion:** the merged PRs, the closed issue(s), and the archived spec path.
