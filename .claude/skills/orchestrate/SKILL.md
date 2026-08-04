---
name: orchestrate
description: One Linear ticket in, one reviewed PR out. Preflights, opens an Orca worktree, launches one headless worker, verifies delivery out of band from artifacts, runs a capped two-round cross-vendor review, then hands the PR to Thomas. A machine never merges. Use after /ticket created the ticket.
argument-hint: ORB-N [--codex-only]
effort: high
---

# /orchestrate: one ticket, one reviewed PR

Constants:

- orca binary `C:\Users\thoma\AppData\Local\Programs\orca\resources\bin\orca`, Linear team `ORB`.
- The session always runs from orbit-ui-mobile (D17). The worktree opens in whichever repo the
  ticket's `repo:*` label names.
- **Scratchpad** = this session's scratchpad directory. Every prompt, diff, log and findings file
  goes there. Never inside a repo: a file written into the worktree gets committed by the worker.

## Invocation

```
/orchestrate ORB-N [--codex-only]
```

**One ticket. Nothing else.** The old scope and concurrency flags (sleep, only, single),
project-name scope, wave planning and parallel fleets are all deleted. There is no multi-ticket
path, and no flag reopens one.

If the argument is a project name, or more than one `ORB-N` is supplied, say exactly that and STOP.
Do not pick one, do not widen, do not queue the rest.

`--codex-only` is a FLAG Thomas passes. It is never a quota check the run performs for itself.

## §5.6 The algorithm

```
 0a Preflight, env   gh auth · orca reachable
                     PRINT the always-loaded byte total (all six sources)   [D32]
                     ASSERT no skill name exists in both scopes             [D33]
 1  Read ticket      orca linear issue ORB-N --json; resolve repo from repo:* label
 0b Preflight, tgt   the TARGET repo, not this checkout (D17 pins it to orbit-ui-mobile)
                     dirty -> STOP · not on main -> switch · behind -> ff-only. Print repairs.
 2  SCOPE GATE       >8 affected files, or judged >400 lines  ->  STOP, split the ticket
 3  Worktree         orca worktree create; git switch -c feature/orb-N-<slug>
 4  Compose prompt   ticket verbatim + comments + ORCHESTRATOR'S BRIEF + finishing contract
                     written to the scratchpad, never inside a repo
 5  Spawn worker     headless · stdin=NUL · cwd=worktree · log to scratchpad · background
 6  Stall detection  hard 45 min · no-progress 10 min · kill process tree
 7  VERIFY OUT OF BAND
                     git status --porcelain            -> empty
                     git rev-list --count main..HEAD   -> >= 1
                     git rev-list origin/<br>..HEAD    -> 0  (pushed)
                     gh pr list --head <br>            -> exactly 1, headRefOid matches
                     additions+deletions               -> <= 400
                     DELIVERED · NO_COMMIT · UNPUSHED · NO_PR · STALE_PR · OVERSIZE
                     anything but DELIVERED  ->  STOP and report. No auto-relaunch.
 8  Review round 1   gh pr diff > file; launch a SEPARATE session from the MAIN CHECKOUT
                     normal: Claude Opus 5 @ high   ·   --codex-only: Sol @ xhigh
                     -> findings.json [{id, severity, file, line, claim, blocking}]
                     -> LIST FROZEN. Non-blocking auto-filed as follow-up tickets.
 9  Adjudicate       0 blocking -> step 12
10  Fixer            round 2 only; prompt contains ONLY the frozen blocking findings
11  Verify-only      CLOSED/OPEN per frozen finding. New findings forbidden except on a line
                     in `git diff <r1>..<r2> --unified=0`
                     all CLOSED -> 12 · any OPEN -> STOP, hand to Thomas. No round 3 exists.
12  Hand to Thomas   PR URL, diff size, follow-ups filed, verdict. ORB-N -> In Review. STOP.
13  Teardown         only after gh pr view reads MERGED
```

## The four tools

These interfaces are fixed. Do not invent flags or variants.

```
node tools/compose-prompt.mjs    --issue ORB-N --repo <key> --out <file>
node tools/launch-worker.mjs     --issue ORB-N --worktree <p> --prompt <f> [--codex-only]
node tools/verify-delivery.mjs   --issue ORB-N --worktree <p> --branch <b> [--repo <k>]
node tools/teardown-worktree.mjs --issue ORB-N --worktree <p>
```

## Step 0. Preflight

Inline shell. There is no preflight tool. **Two halves, because the target repo is not known until
step 1 resolves it from the `repo:*` label.**

**0a. Environment, now.** Nothing here depends on which ticket is being run.

```bash
gh auth status
orca --version
```

**0b. Target repo, after step 1 and before step 3 creates the worktree.**

`<target>` is the repository the TICKET names, resolved from its `repo:*` label, which is very often
not this one. The session always opens in orbit-ui-mobile (D17) regardless of where the work lands,
so the orchestrator's own checkout may sit on any branch and that is not a gate. What must be clean,
on main, and current is the repo the worktree will branch FROM. Checking the orchestrator's checkout
instead would refuse a legitimate run and pass a dangerous one.

**Bring it to that state rather than refusing.** Two of the three conditions are one safe idempotent
command away, and stopping a run because a repo is one commit behind is friction with no safety in
it. The third is not, and never becomes so.

```bash
# 1. DIRTY TREE: the one hard stop. Never auto-repaired.
git -C <target> status --porcelain     # any output -> STOP, print it, do not stash, do not discard

# 2. NOT ON MAIN: switch, once the tree is proven clean above.
git -C <target> rev-parse --abbrev-ref HEAD
git -C <target> switch main            # only if <target> is NOT this session's own checkout

# 3. BEHIND: fast-forward. Always safe on a clean tree.
git -C <target> fetch origin main
git -C <target> merge --ff-only origin/main
git -C <target> rev-list --count HEAD..origin/main    # now 0
```

Uncommitted work is somebody's unsaved thinking and this skill does not get to decide it is
disposable. Stashing hides it somewhere they will not look. So a dirty target repo stops the run,
prints the paths verbatim, and hands the decision back.

**The carve-out on step 2:** if `<target>` resolves to the repository this session is running from,
do NOT switch it. Switching would swap this skill file, `.claude/orchestrator.json` and the tools out
from under the run in progress, and the orchestrator would finish reading a different harness than it
started with. Stop and say exactly that instead.

Print every repair you performed, with its command. A silent repair is how a run starts from a state
nobody chose.

### D32. Print the always-loaded byte total

Six sources feed every turn. Print each one's current byte count and the total, then continue.
**Print it, never fail on it.** A budget that blocks the run is how the harness froze the product.

| Source | 2026-08-04 | Target |
|---|---:|---:|
| `CLAUDE.md` | 10,504 | 6,000 |
| `.claude/rules/core.md` | 3,027 | 2,200 |
| `~/.claude/CLAUDE.md` | 2,406 | unchanged |
| `~/.claude/rules/agentic-baseline.md` | 5,571 | unchanged |
| `brain/hot.md` | 8,668 | 6,000 |
| every skill `description:`, both scopes | 23,981 | 11,262 |

```bash
wc -c CLAUDE.md .claude/rules/core.md ~/.claude/CLAUDE.md \
      ~/.claude/rules/agentic-baseline.md \
      ~/Documents/Programming/Projects/brain/hot.md

# the sixth source: the frontmatter description: value, continuation lines included,
# of every discoverable skill in BOTH scopes
for f in .claude/skills/*/SKILL.md ~/.claude/skills/*/SKILL.md; do
  awk 'NR==1&&/^---\r?$/{fm=1;next} fm&&/^---\r?$/{exit} \
       fm&&/^description:/{p=1;print;next} \
       fm&&p&&/^[A-Za-z_-]+:/{p=0} fm&&p' "$f"
done | wc -c
```

The `fm` guard and the exit on the closing `---` are both load-bearing. A `description:` that is the
LAST frontmatter key is terminated by `---`, not by another key, so an awk that stops only on the
next `key:` runs into the body and counts the whole file. That bug reported `humanize` at 11,526
bytes against a true 255.

Plugin and built-in skills load their descriptions too, and live under `~/.claude/plugins/`, a third
location outside both scopes. They measured 11,462 bytes across 31 skills on 2026-08-04. Nothing in
this repo can shrink them, which is why the row above scopes to the two directories the rebuild
controls. Print them separately if the total looks unaccountably large.

This replaces the old context-budget checker tool, which is deleted. It measured 24% of the surface
and its own source is why: `const MEASURABLE_BASELINE_KEY = /^(?:CLAUDE\.md|\.claude\/rules\/[^/]+\.md)$/`.
It could not see the two global files, `hot.md`, or the skill descriptions, which alone are the
single largest source.

### D33. Assert no skill name exists in both scopes

```bash
comm -12 <(ls -1 .claude/skills) <(ls -1 ~/.claude/skills)
```

Any output is a **hard FAIL**. Name every colliding skill and stop.

Global (`~/.claude/skills/`) silently overrides project (`.claude/skills/`) for SKILLS. No warning
is printed and precedence is not configurable; `skillOverrides` controls visibility only.
**Note the inversion, it is the trap:** for AGENTS the precedence runs the OTHER way, project beats
user. So the same directory layout means opposite things for the two kinds.

This gate exists because ORB-115, ORB-111 and ORB-118 all closed as Done with their work undone,
invisibly, on a shadowed skill.

Expected state: `~/.claude/skills/` holds exactly 12 dirs (`brain`, `brain-agenda`, `brain-capture`,
`brain-decide`, `brain-review`, `catch-up`, `humanize`, `i-have-adhd`, `message`, `grilling`, `tdd`,
`diagnosing-bugs`) and none of them may also exist under `.claude/skills/`.

## Step 1. Read the ticket

```bash
orca linear issue ORB-N --json
```

Resolve the target repo from the `repo:*` label. Read the body and every comment. The ticket is the
prompt (D2): it is quoted verbatim into the worker prompt, never paraphrased.

## Step 2. Scope gate

STOP the run and tell Thomas to split the ticket when either holds:

- the ticket touches more than **8 files**, or
- you judge the change at more than **400 diff lines**.

Judge before spawning, not after. A worker never launches on a ticket judged over 400 lines. This is
the same 400 that step 7 enforces on the delivered diff; catching it here costs one message instead
of a run.

## Step 3. Worktree

```bash
orca worktree create --repo path:<repo> --name <slug> --base-branch main \
  --linear-issue ORB-N --no-parent --comment "<one line>" --json
```

Orca creates `refs/heads/<gituser>/<name>`. That is not the contract branch. In the worktree run
`git switch -c feature/orb-N-<slug>` (`fix/` for a bug ticket) and confirm HEAD landed on it. The
branch is never left to the worker to remember.

## Step 4. Compose the prompt

```bash
node tools/compose-prompt.mjs --issue ORB-N --repo <key> --out <scratchpad>/orb-N-prompt.md
```

The file carries, in order:

1. The ticket body VERBATIM plus every chronological comment.
2. **The orchestrator's brief:** target repo and its absolute path, the branch already checked out,
   the base branch, the affected-file list from step 2, and the scope boundary as a hard limit.
3. **The finishing contract:** run lint, type-check and tests for the touched workspace; commit;
   push; open a PR to `main` whose body links `ORB-N`; attach the PR URL to the Linear issue with
   `orca linear attach`. Cross-platform parity and i18n key parity land in the same commit.
   **The worker never merges and never opens a second PR.**

Write it to the scratchpad. A prompt file inside the worktree gets committed by the worker.

## Steps 5 and 6. Spawn the worker

```bash
node tools/launch-worker.mjs --issue ORB-N --worktree <p> --prompt <f> [--codex-only]
```

Headless, `stdin=NUL`, `cwd` = the worktree, log to the scratchpad.

`launch-worker.mjs` runs in the FOREGROUND as its own watchdog and owns both clocks: a hard 45
minute cap and a 10 minute no-progress cap, killing the whole process tree on either.

The orchestrator launches it as a **background shell task and ends its turn.** Zero tokens burn
while the worker runs, and the process exiting is what wakes the session.

**Death is the wake signal.** A dead worker can never hang the session, because the session is not
running. There is nothing to poll, nothing to babysit, and no monitor to arm.

## Step 7. Verify delivery, out of band

```bash
node tools/verify-delivery.mjs --issue ORB-N --worktree <p> --branch <b> [--repo <k>]
```

It is the SOLE authority for the word "delivered". Exit 0 means `DELIVERED`.

| Verdict | Meaning |
|---|---|
| `DELIVERED` | every check below passed |
| `NO_COMMIT` | `git rev-list --count main..HEAD` is 0 |
| `UNPUSHED` | commits exist above `origin/<branch>` |
| `NO_PR` | `gh pr list --head <branch>` returned 0, or more than 1 |
| `STALE_PR` | the PR's `headRefOid` is not the branch head |
| `OVERSIZE` | additions + deletions exceed 400 |

A dirty tree (`git status --porcelain` non-empty) fails too.

**Never read the worker's own exit code as proof of anything.** Three documented CLI bugs make it
meaningless: openai/codex#20919, openai/codex#19945, anthropics/claude-code#25629. Artifacts are the
only evidence.

**Anything but `DELIVERED` stops the run.** Report the verdict and what is unmet. **No auto-relaunch.**

## §5.3 The review contract

Six rules. All six hold in both modes.

1. **Freeze the ruleset before round 1.** Severity definitions are fixed at PR-open time and do not
   move during the review.
2. **Cross-vendor reviewer in a fresh session.** The invariant in both modes: **the session that
   writes the code is never the session that reviews it.** Same model is acceptable; same session
   is not.
3. **Every finding is classified at report time, Blocking or Non-blocking.** Blocking means it
   breaks behaviour, security, or data integrity. Everything else is auto-filed as a follow-up
   Linear ticket and never fixed in this PR.
4. **Diff-only scope.** The reviewer reads the diff, not the repository.
5. **Monotonic round 2.** Re-check ONLY the frozen Blocking list, answering `CLOSED` or `OPEN` per
   finding. New findings are forbidden, with one mechanical carve-out: a defect on a line the
   fixer's own round-2 diff touched, computed as `git diff <r1>..<r2> --unified=0` and handed to the
   reviewer as data it cannot widen.
6. **Hard cap of 2 rounds.** No round-3 path exists. At the cap, hand to Thomas.

**Why the cap exists.** PR #672 ran 9 review rounds over 38 hours and produced 19 findings: 19
unique, zero repeats, on a 7,078-line diff against a 400 line cap. Termination required "the
reviewer finds nothing", which on a diff that size has probability near zero. Rounds are capped
because convergence was never the terminating condition.

## Step 8. Review round 1

```bash
gh pr diff <n> > <scratchpad>/orb-N-r1.diff
```

Launch the reviewer as a **separate session from the MAIN CHECKOUT**, never from the worktree. Feed
it the diff file and the frozen ruleset. It returns:

```json
[{"id": "F1", "severity": "high", "file": "path", "line": 42, "claim": "...", "blocking": true}]
```

Write it to `<scratchpad>/orb-N-findings.json`. **The list is now frozen.** File every non-blocking
finding as its own follow-up Linear ticket immediately, then drop it from this run.

## Step 9. Adjudicate

Zero blocking findings goes straight to step 12. Otherwise, step 10.

## Step 10. Fixer, round 2 only

Compose a fixer prompt containing **ONLY the frozen blocking findings**. Not the ticket body, not
the non-blocking findings, not the reviewer's prose. Relaunch through `launch-worker.mjs` on the
same worktree and branch.

## Step 11. Verify-only pass

The reviewer answers `CLOSED` or `OPEN` for each frozen blocking finding, and nothing else. Hand it
`git diff <r1>..<r2> --unified=0` as the only surface on which a new finding is admissible.

- All `CLOSED` -> step 12.
- Any `OPEN` -> STOP and hand to Thomas with the open findings named. **There is no round 3.**

## Step 12. Hand to Thomas

**Visible-effect tickets only, before setting In Review.** A ticket labelled `visible-effect`
needs final screenshots, a critique artifact, and test output. Capture with
`node tools/capture-surfaces.mjs`, then run the bounded self-critique that `RENDER-CORRECTNESS.md`
defines. This is CLAUDE.md's D7 and it is not optional: only a human grants visual completion, and
a machine may only withhold it. A ticket with no visible surface skips this entirely.

Set `ORB-N` to In Review. Print, then STOP:

- PR URL and diff size (additions + deletions).
- Verdict: clean after round 1, clean after round 2, or handed over with N open findings.
- Every follow-up ticket filed, by identifier.
- Screenshots and critique artifact paths, for a `visible-effect` ticket.
- `DEGRADED: same-vendor review` when `--codex-only` was passed.

The run is over. Thomas merges.

## Step 13. Teardown

Only after `gh pr view <n> --json state` reads `MERGED`:

```bash
node tools/teardown-worktree.mjs --issue ORB-N --worktree <p>
```

Never tear down an unmerged worktree. The branch and its work are the only copy.

## §5.4 Model routing

| | Normal | `--codex-only` |
|---|---|---|
| Orchestrator | Opus 5 @ high, or Sol @ high | Sol @ high |
| Implementer | `codex exec` Sol @ high | `codex exec` Sol @ high |
| Reviewer | Claude Opus 5 @ high, fresh session | Sol @ **xhigh**, SEPARATE session, fresh context, neutral directory |
| Cross-vendor | yes | no, **DEGRADED** |

`--codex-only` is a flag, not a quota check. In degraded mode the run MUST print
`DEGRADED: same-vendor review` in its opening line AND in the PR body.

Three things keep degraded mode honest:

1. A separate process with fresh context, launched from the MAIN CHECKOUT and never the worktree,
   so the reviewer cannot read the PR's own `AGENTS.md`: instructions written by the change under
   review.
2. Higher reviewer effort (`xhigh` against the implementer's `high`).
3. The explicit banner in both places.

Say it plainly: same-family bias is **not** eliminated by any of the three, and its magnitude is
unmeasured. Degraded mode is a fallback, not an equivalent.

## Hard prohibitions

- **A machine never merges.** No `gh pr merge`, no `PUT /repos/{owner}/{repo}/pulls/{number}/merge`,
  no GraphQL `mergePullRequest`, no `--admin` in any shape. Naming both raw API paths is deliberate:
  banning only the flag leaves them open. **The human merge gate is what makes this whole
  simplification possible.** Thomas merges.
- Never push to `main`. Never force-push. Never `--no-verify`, never `--no-gpg-sign`.
- The composed prompt is written to the scratchpad, never inside a repo.
- No auto-relaunch on a failed verdict. Stop and report.
- Never edit this skill, a tool under `tools/`, or a CI gate from inside a run. A run that edits the
  contract it is executing describes no consistent system afterwards. Record it, repair it after.
