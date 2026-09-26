# NEXT

**Read `.claude/specs/orbit-prod-release.md` first**, including its standing instructions and its last section,
the latest session section.

## Entry point

`/sleep`. It is the only entry point; it runs `/orchestrate` itself. Nobody is awake to answer: take every
decision yourself, the best approach, and log it.

## FIRST, before any other work: remove every quickly-stale line from all three repos, and make it impossible to return

This outranks everything below, including the open pull requests. Nothing else starts until it is merged.

**Scope: literally every tracked file in `orbit-ui-mobile`, `orbit-api` and `orbit-landing-page`**, on both
`main` and `redesign/main`: skills, agents, rules, playbooks, hooks, tools and their tests, `CLAUDE.md`,
`AGENTS.md`, `DESIGN.md`, `BRAND.md`, `TESTING.md`, specs, handoffs, workflows, config files, and every code
comment in every language. Enumerate the files with `git ls-files`; do not sample.

**Remove or rewrite every line that goes stale quickly:**

1. Absolute paths from one machine (`/Users/...`, `C:\\Users\\...`, `/private/tmp/...`, `/var/folders/...`,
   `~/Developer/...` pointing at one person's layout). Use repo-relative paths, or an environment variable
   or a documented setting when the location truly varies. It must work for anyone on any computer.
2. Dated anecdotes and history: "measured on 2026-09-18", "on 2026-08-06 a run did X", "the failure this
   prevents", session ids, "added after", incident stories. State the rule itself, timelessly. Keep a date only
   where it is load-bearing data (a fixture, a deadline a tool computes, a pinned version's release date).
3. The owner's name, and quotes attributed to him ("Thomas said", "his words", "Thomas asked for this").
   State the rule; never who asked for it or when. Product names (Orbit, Astra) stay.
4. Bloated AI comments: comments that narrate, restate the code, justify themselves at length, or explain
   history. Delete them. A comment survives only if it is a short WHY a reader needs to change the code safely.
5. The skills that generate this content must stop generating it: `/handoff` (its "in his words, with the
   date" rule for standing instructions), `/lesson`, `/orchestrate`, `/sleep`, the spec, and any template.
   Rewrite each instruction so its output is timeless.

**Then make it impossible to continue**, in all three repos:

- A CI job (in each repo's guards workflow, required on `main`) that fails a pull request adding an absolute
  home or temp path, the owner's name, or a dated anecdote pattern in harness files, docs and comments, with a
  short, reviewed allowlist for real data.
- The same check as a pre-commit hook (Lefthook where the repo has it) and as a Claude Code PreToolUse hook on
  `Write`/`Edit`, so a session is stopped before it writes the line.
- A rule in `.claude/rules/core.md` (and `AGENTS.md` for Codex): write rules and comments timelessly, with no
  dates, names, anecdotes or machine paths.
- Existing gates stay: ESLint `local/no-comments` and Roslyn `ORBIT0001` already restrict comments; extend
  them only where they miss a case above.

**Done means**, per repo: `git grep -nE '/Users/|C:\\Users|/private/tmp|/var/folders'` finds nothing;
`git grep -n 'Thomas'` finds nothing outside the reviewed allowlist; the dated-anecdote grep the new gate uses
finds nothing outside it; the new CI job, pre-commit hook and PreToolUse hook each fail on a planted example
and pass after it is removed. Harness and doc changes route to `main`, with a `redesign/main` pull request for
the files that exist only there. Run both harnesses (`node tools/test-tools.mjs`, `node .claude/hooks/test-hooks.mjs`)
before each push, as `CLAUDE.md` requires. Then the rest of this prompt continues normally.

## The goal: finish the spec

An empty board and a production release, exactly as the spec defines it. The run ends only when the spec is
done, or externally (allowance exhausted, machine stopped, the owner says stop). A blocker is the next piece of
work. Re-derive what is left:

    gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400

169 tickets were open at this handoff.

## In flight, each with a disposition

Launch Codex workers about 90 seconds apart. Admission refuses new ticket work above 10 open PRs across the
three repos (9 open at handoff). **Until `ui#1123` merges, a Pullfrog approval counts only if it was submitted
after the head's push time** (`gh api "repos/<owner>/<repo>/activity?ref=refs/heads/<branch>"`, the entry whose
`after` is the head); `reviewDecision` APPROVED alone can be a re-pointed old review.

| item | state at handoff | disposition |
|---|---|---|
| `ui#1123` (`#697` review freshness) | round 2 committed `c31f89b4`, UNPUSHED; my revert of the worker's `bounded-process.mjs` edit is in it; harness NOT rerun after the revert | run `node tools/test-tools.mjs` and `node .claude/hooks/test-hooks.mjs`, put the evidence from the worker's `/tmp/ticket-697-pr-evidence.md` in the body (replace the check-suite block), resolve thread `PRRT_kwDOR5Siws6mODIH` after re-reading its id with `list-bot-threads.mjs`, push. File the `bounded-process.mjs` flake as its own ticket. Then the `main` backport of `list-bot-threads.mjs` |
| `ui#1126` (`#705` React out of shared) | approved at `977d8de8`; fix batch worker EXITED just after the handoff, result unread (log path in `.git/orbit-worker-launches`, worktree `orca/workspaces/orbit-ui-mobile/ticket-705-shared-react-hooks`), 10 unpushed commits incl. `90628b6c` | read the worktree: finish or salvage the batch (logic into shared cores, app hooks wiring only, manifest regenerated), then body, push, fresh review. SonarCloud was 39.8% duplication |
| `api#569` (`#704` explicit culture) | approved at `2d16f4a2`; batch 2 committed `692cc740` (architecture) and `ba4d30f0` (coverage tests), UNPUSHED | merge the worker report into the body, push, confirm SonarCloud new coverage >= 80% and `drift` green, merge to `main` |
| `api#574` (`#665` slip at write time) | CHANGES_REQUESTED: "A rolling deployment can permanently record slips as completions; the migration and writer transition need coordination" | review batch on the migration and writer transition (expand-contract), then merge to `main` |
| `api#571` (`#706` record pages) | batch 1 pushed `36a8900f`; waiter finished at handoff, result unread | read CI and review; merge to `orbit-api` `redesign/main`; then relaunch `#681` on `feature/ticket-681-astra-read-blocks` (clean) |
| `api#573` (`#607` accent Pro gate) | APPROVED at `1abc6da8` | verify push time, CI, merge to `orbit-api` `redesign/main` |
| `ui#1111` (`#675` Turnstile redesign port) | merge push `a0e2486e`; a same-head re-review was requested; `reviewDecision` APPROVED may be re-pointed | verify the approval postdates the push, then squash-merge to `redesign/main`. Then a `main` sync ticket for `1b5a32b3`, `314d5574`, `773c0a44` and later `main` commits |
| `ui#1125` (`#653` account day gates) | batch pushed `e3744af0`; APPROVED shown | verify freshness and CI, test the merge result, merge to `redesign/main` |
| `ui#1127` (`#622` step-up account reset) | APPROVED at `d58eadcd` | verify freshness and CI, test the merge result, merge to `redesign/main` |
| handoff skill fix | committed with this handoff (work order reconciled every run; previous prompt carried forward); harnesses NOT run on it | run both harnesses first thing; fix anything they report |
| `#702` redesign port | `main` half merged (`ui#1124`); App not created | open the `redesign/main` port PR; the App is the owner's manual step (spec) |
| 47 NEEDS_CONVERSATION board tickets | filtered at `/questions`: none is the owner's | post each decision on its ticket and add `needs:no-conversation` before its worker (spec, overnight section) |
| running workers | `#705` fix batch (above) | as above |
| stashes, uncommitted work in the three main checkouts | 0 stashes; main checkouts clean | none |
| run record | `.git/orbit-orchestrate-run.json`, session `4f2a4bf8`, `sleep: true`, 22 merged rows | a new session writes its own; carry the open rows |

## What to do, in order

0. The cleanup above, to merged, in all three repos. Nothing below starts before it.
1. Land what is ready: `api#573`, `ui#1127`, `ui#1125`, `ui#1111` (each after the freshness and merge-result checks).
2. Push the three unpushed batches: `ui#1123`, `api#569`, `ui#1126` (after its worker's result is read).
3. Clear `api#574` and `api#571`; then relaunch `#681`.
4. Then follow the spec's `## The order: the batches to a production release`, batch by batch, never the
   board's leverage ranking. It was rebuilt on 2026-09-26 with all 169 open tickets, each in exactly one batch:
   Batch 0b (20 harness tickets), then Batch 0c (18 live defects on `main`, `#330` Android push first), then
   Batch 1 (19 redesign tickets, including the open PRs above) until `node tools/redesign-coverage.mjs` passes and
   every screen ticket is closed, then STOP at THE REDESIGN GATE (internal Play build for the owner; never merge
   `redesign/main` to `main`). `plan-queue.mjs` is only for dependency order and deferrals inside a batch. Place
   every ticket you file into one batch in the same session.

Every identifier here came from a previous session. Treat each as a lead to verify.
