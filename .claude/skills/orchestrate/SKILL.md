---
name: orchestrate
description: Tickets in, reviewed pull requests out. Plans a queue from one ticket, several, or a project, then per ticket opens a worktree, launches a headless worker, verifies delivery from artifacts, runs a capped cross-vendor review and clears the Codex bot's threads. --sleep works the whole queue unattended. A machine never merges unasked.
argument-hint: <ORB-N | ORB-A ORB-B | project> [--sleep] [--parallel] [--auto] [--codex-only]
effort: high
---

# /orchestrate: a queue of tickets, a stack of reviewed pull requests

Constants:

- orca binary `C:\Users\thoma\AppData\Local\Programs\orca\resources\bin\orca`, Linear team `ORB`.
- The session always runs from orbit-ui-mobile (D17). Each worktree opens in whichever repo its
  ticket's `repo:*` label names.
- **Scratchpad** = this session's scratchpad directory. Every prompt, diff, log and findings file
  goes there. Never inside a repo: a file written into the worktree gets committed by the worker.

## Invocation

```
/orchestrate ORB-N                      one ticket, exactly as before
/orchestrate ORB-A ORB-B ORB-C          those tickets, in dependency order
/orchestrate "<project name>"           every open ticket in that project
/orchestrate --auto                     the whole board, highest leverage first
```

Flags, all combinable:

| Flag | Effect |
|---|---|
| `--sleep` | do not stop after each pull request; work the whole queue and report at the end |
| `--parallel` | run up to `caps.parallelTickets` tickets at once, one worktree each |
| `--auto` | take the scope from the board rather than from an argument |
| `--codex-only` | Thomas's Claude-quota fallback. Never a quota check the run performs for itself |

**Without `--sleep` the run stops after every pull request** and waits for Thomas to type
`continue`. Nothing polls, nothing watches, and zero tokens burn while it waits.

**One ticket with no flags behaves exactly as it did before.** The queue of length one is the same
run it always was.

## §5.6 The algorithm

```
 0a Preflight, env   derive each remote owner token into child-process GH_TOKEN · orca reachable
                     PRINT the always-loaded byte total (all six sources)   [D32]
                     ASSERT no skill name exists in both scopes             [D33]
 1  PLAN THE QUEUE   node tools/plan-queue.mjs -> admitted, deferred, waves, stacks
                     PRINT the plan, the deferrals and every warning BEFORE any work starts
                     READ each admitted ticket WITH ITS COMMENTS. A comment is the work order too.
 0b Preflight, tgt   ONCE PER DISTINCT REPO in the plan, never once per ticket
                     dirty -> STOP · not on main -> switch · behind -> ff-only. Print repairs.
 2  SCOPE REVIEW     file and line estimates are advisory. Keep atomic behavior and every required
                     generated artifact together; split only at real behavior/deployment boundaries
 2b QUESTION GATE    BOTH MODES. Every question the queue raises, asked in ONE batch, before
                     the first worktree. Answers that remove a ticket remove it now.
                     THEN write .git/orbit-orchestrate-run.json: session, sleep, remaining[]
                                        ---- per ticket, in wave order ----
 3  Worktree         orca worktree create; git switch -c feature/orb-N-<slug>
                     stackParent set -> branch from ITS branch, not from main
 4  Compose prompt   ticket verbatim + comments + ORCHESTRATOR'S BRIEF + finishing contract
                     written to the scratchpad, never inside a repo
 5  Spawn worker     headless · stdin=NUL · cwd=worktree · log to scratchpad · background
 6  Stall detection  hard 45 min · no-progress 10 min · kill process tree
 7  VERIFY OUT OF BAND
                     git status --porcelain            -> empty
                     git rev-list --count <base>..HEAD -> >= 1
                     git rev-list origin/<br>..HEAD    -> 0  (pushed)
                     gh pr list --head <br>            -> exactly 1, headRefOid matches
                     PR title or body names ORB-N      -> the branch alone is not the link
                     additions+deletions and changedFiles -> advisory review information only
                     compare base...head               -> behind_by = 0
                     statusCheckRollup, both node shapes -> no check red, none pending
                     DELIVERED · NO_COMMIT · DIRTY_TREE · UNPUSHED · NO_PR · UNLINKED_PR
                     · STALE_PR · OUT_OF_DATE · CI_FAILING · CI_PENDING
                     anything but DELIVERED enters the bounded readiness/fixer path or a real blocker
                     SALVAGE allowed: discard residue · test then commit+push what the worker
                     left · re-run a CI job proven infra. NEVER write code, revert, force, merge.
                     A SALVAGED PR RE-ENTERS HERE and runs 7, 8, 12, 13 like any other.
 8  Review round 1   gh pr diff > file; launch a SEPARATE session from the repo's PRIMARY MAIN
                     normal: Claude Opus 5 @ high   ·   --codex-only: Sol @ xhigh
                     -> findings.json [{id, severity, file, line, claim, blocking}]
                     -> LIST FROZEN. Non-blocking auto-filed as follow-up tickets.
 9  Adjudicate       0 blocking -> step 12
10  Fixer            round 2 only; prompt contains ONLY the frozen blocking findings
11  Verify-only      CLOSED/OPEN per frozen finding. New findings forbidden except on a line
                     in `git diff <r1>..<r2> --unified=0`
                     all CLOSED -> 12 · any OPEN -> 12 anyway, report-only, then hand over
12  CODEX THREADS    node tools/list-bot-threads.mjs -> REVIEWED · CHANGES_REQUESTED · DRAFT
                     · NO_REVIEW.  NO_REVIEW is never reported as clean.
                     P1 fix · P2/P3 fix if cheap else file · reply THEN resolve, never resolve
                     alone. Re-verify and request current-head review after every push, within bound.
13  READINESS LOOP   wait CI · fix genuine failures · clean independent final-head review · request
                     current-head connector · fix/reply/resolve every actionable thread · merge main
                     into branch when behind · rerun invalidated receipts · synchronize Linear
                     READY only when every receipt names the same current head and base SHA
14  Hand over        PR URL, advisory diff size, receipt and READY verdict.
                     READY -> In Review, EXCEPT visible-effect: In Progress, visual check owed.
                     UPDATE remaining[] in .git/orbit-orchestrate-run.json
                     no --sleep -> STOP and wait for `continue`  ·  --sleep -> next ticket
                     --sleep: a turn ends ONLY with a live background task, NAMED  [Stop hook]
                                        ---- end per ticket ----
14  Report           every PR opened, the stack order, every ticket skipped and why,
                     and the one command that merges the lot. Thomas merges.
15  Teardown         per worktree, only after gh pr view reads MERGED
```

## The tools

These interfaces are fixed. Do not invent flags or variants.

```
node tools/plan-queue.mjs        (--tickets ORB-1,ORB-2 | --project <name> | --board) [--format markdown]
node tools/compose-prompt.mjs    --issue ORB-N --repo <key> --out <file> [--worktree <p>] [--branch <b>] [--base <ref>]
node tools/launch-worker.mjs     --issue ORB-N --worktree <p> --prompt <f> [--codex-only]
node tools/launch-worker.mjs     --issue ORB-N --review --repo <key> --prompt <f> [--codex-only]
node tools/verify-delivery.mjs   --issue ORB-N --worktree <p> --branch <b> --repo <key> [--base <ref>] [--wait-ci <s>] [--codex-only]
node tools/list-bot-threads.mjs  --pr <n-or-url> --repo <key> [--wait-seconds <s>] [--no-request]
node tools/resolve-bot-thread.mjs --thread <PRRT_...> --repo <key> --pr <number>   # reply body on stdin
node tools/salvage-worker.mjs    --issue ORB-N --repo <key> [--pr <n>] --worktree <p> --branch <b> --run-root <p> --test-command <json> --test-receipt <json> --message <m> --path <path>...
node tools/sync-linear-state.mjs --issue ORB-N --repo <key> --pr <n> --state <working|blocked|visual|ready> --head-sha <sha> --base-sha <sha> --message-file <path|->
node tools/record-readiness.mjs  --repo <key> --pr <n> --delivery <json> --review <json> --bot <json> --linear <json> [--codex-only]
node tools/record-readiness.mjs  --repo <key> --pr <n> --review <round-one-json> --register-round-one
node tools/teardown-worktree.mjs --issue ORB-N
```

The launcher is the ONLY sanctioned way to start a model session, reviewer included. A raw `claude`
or `codex` from an orchestrating session is refused by `.claude/hooks/orchestrator-guardrails.mjs`,
which exempts a process carrying the launcher's marker, a cwd inside a linked worktree, and
`--version`-style queries. A reviewer must run from the target repo's PRIMARY MAIN checkout, so only the marker exemption
can apply to it, and only the launcher sets that marker.

## Step 0. Preflight

Inline shell. There is no preflight tool. **Two halves, because the target repo is not known until
step 1 resolves it from the `repo:*` label.**

**0a. Environment, now.** Nothing here depends on which ticket is being run.

```bash
orca --version
```

**Never mutate the global GitHub account.** Two accounts are authenticated on this machine. Resolve
the target owner from that repository's `origin`, obtain its token without printing it, and pass it
only through the child process's `GH_TOKEN`. Delete inherited `GH_TOKEN`/`GITHUB_TOKEN` from the
environment before inserting the selected token. Concurrent UI and API launches must stay isolated:

```
remote: Permission to thomasluizon/orbit-ui-mobile.git denied to thomas-luizon_iqpay.
```

`tools/lib/github-auth.mjs` is the sole selector. Never log the token or return it in an artifact;
redact credentials from child errors before persisting or reporting them.

**0b. Target repos, after step 1 and before step 3 creates any worktree.**

**Once per DISTINCT repo in the plan, never once per ticket.** Two tickets in the same repo would
otherwise run `fetch` and `merge --ff-only` against one checkout twice, and under `--parallel` they
would race on `.git/index`.

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

### Assert the run can actually review and can actually mint a receipt

Both structural blockers of 2026-08-08 were discoverable HERE, before the first worktree, while the
question gate was still open. Both instead surfaced mid-run, when every remaining option was bad: 76
tickets stood down for an unlaunchable reviewer, and four complete landing pull requests stuck on
`REVIEW_STALE`. A failure here is a **step 2b QUESTION printed before any worker spawns**, never a
mid-run discovery.

```bash
# 1. The pr-review contract pair must agree, by COMMITTED BLOB, for ui and api.
for p in .claude/skills/pr-review/SKILL.md .claude/skills/pr-review/rubric.md; do
  u=$(git -C <ui>  rev-parse "HEAD:$p")
  a=$(git -C <api> rev-parse "HEAD:$p")
  [ "$u" = "$a" ] || echo "PARITY BLOCKED $p: ui $u, api $a"
done

# 2. Every repo in the plan must be able to mint a receipt, which means its rubric binding resolves.
#    A repo that carries the rubric at main binds to its own base; one that does not binds to ui's
#    origin/main, and that copy must exist.
git -C <ui> rev-parse "origin/main:.claude/skills/pr-review/rubric.md" >/dev/null \
  || echo "RECEIPT BLOCKED: the canonical rubric is missing on ui origin/main"
for r in <every repo key in the plan>; do
  git -C <repo> rev-parse "HEAD:.claude/skills/pr-review/rubric.md" >/dev/null 2>&1 \
    && echo "$r binds own-base" || echo "$r binds canonical-main (ui)"
done
```

Print the binding each repo resolved to. A run that cannot say which rubric its reviews will be
bound to is a run whose receipts will be refused, and it should ask before it spends a worker budget
rather than after.

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

## Step 1. Plan the queue

```bash
node tools/plan-queue.mjs --tickets ORB-A,ORB-B          # explicit list
node tools/plan-queue.mjs --project "<name>"             # a Linear project
node tools/plan-queue.mjs --board                        # --auto
```

It returns `admitted`, `deferred`, `waves` and `stacks`. **Print the plan and every deferral before
any work starts.** A ticket dropped at 03:00 that Thomas only discovers at 08:00 is a wasted night;
the same ticket named at the start is a decision he can make before he goes to bed.

Then read each admitted ticket in full **with its comments**, because the plan carries titles and
labels, not bodies:

```bash
orca linear issue ORB-N --comments --json
```

**A comment is part of the work order, not commentary on it.** A comment saying the ticket has to be
split, that the approach changed, or that half of it is already done changes what the run does, and a
run that read only the description would execute a plan its own ticket has already superseded. When a
comment and the body disagree, the LATER comment wins and you say so in the plan. A comment that
makes the ticket unrunnable as written removes it from the queue exactly like a step 1 deferral.
`compose-prompt.mjs` passes the comments through to the worker too, so both of you read the same
work order.

The ticket is the prompt (D2): quoted verbatim into the worker prompt, never paraphrased.

**Deferral reasons and what each means.** None of them is a failure of the run:

| Reason | Meaning |
|---|---|
| `BLOCKED_OUTSIDE_QUEUE` | its blocker is open and not in this queue, so its branch cannot carry it |
| `UNSTACKABLE_BLOCKERS_IN_QUEUE` | two or more same-repo blockers that do not chain. A branch has ONE parent and none of them can merge mid-queue, so no branch can carry their work. Run it after they merge |
| `NO_REPO_LABEL` | no `repo:*` label, so the target repository is unknown. Never guess it |
| `AMBIGUOUS_REPO` | two `repo:*` labels. `repo:both` does not exist (D4) |
| `CLOSED` | already Done, Canceled or Duplicate |
| `NOT_REPRODUCED` | the body says NOT REPRODUCED, asks for a device or emulator repro, or makes obtaining one the first Scope item. ORB-128 and ORB-208 are both Android runtime bugs whose competing hypotheses only a device can tell apart |
| `NOT_CODE_WORK` | the body says no code in any repo, Ops-only, or HUMAN-ONLY. ORB-27, ORB-28, ORB-83 |
| `MULTI_PR` | the body scopes itself to several pull requests, which breaks D4 before the harness sees it. ORB-25, ORB-26 |

The last four are the executability pass, added after the Onda 1 queue admitted 71 tickets and
deferred none while eleven of them could not be executed by a headless agent at all. Two things it is
deliberately careful about, and you should be too when you read its output: **a keyword match is
evidence, not a verdict** (the same sentence under Out of scope means the opposite of what it means
under Scope), and **counting bullets under Affected modules over-counts**, because that list carries
test files and read-only references. ORB-86 named two orbit-api files it never touched. A marginal
count is therefore a `warnings` entry on an ADMITTED ticket, not a deferral. Print those warnings.

`visible-effect` is **not** a deferral. Those tickets run; step 13 withholds In Review instead.

## Step 2b. The question gate, BOTH modes

**Every question the queue raises, asked once, before the first worktree exists.**

**It runs in both modes, and the position is the point.** The only human checkpoint used to sit at
step 13, AFTER the pull request exists, and nothing at all sat between step 4 and step 5. So the run
never asked anything before spending a worker budget in either mode; it only stopped afterwards, when
the answer had already cost a whole 45 minute run. Under `--sleep` that same question instead
surfaced as a failed verdict at 03:00 and the ticket was simply lost.

| Mode | Behaviour |
|---|---|
| `--sleep` | ask once here, then work the whole queue without stopping again |
| no `--sleep` | ask once here, **and** still stop after every pull request exactly as today |

Read every admitted ticket, its comments, and the deferrals from step 1, and collect:

1. **Contradictions inside one ticket**, especially a tool, path or process named two ways. ORB-30
   (34,293 characters) names Pencil as the prototyping tool in one section and Claude Design with
   `design/reference.html` in another, and says Pencil is retired in the first. `hot.md` confirms it
   is retired. A headless worker cannot ask which is current, and the Pencil section is the more
   detailed of the two, so it would follow the retired tool and produce evidence in the wrong form.
2. **Acceptance criteria carrying a human grant no agent can satisfy.** ORB-30 again: "Thomas has
   opened the page and approved the direction. This is a human grant (D13); no gate and no agent may
   substitute for it." Run as one ticket that produces a failed verdict however good the work is, so
   ask whether to split the grant out or accept the ticket stopping short of it.
3. **Tickets with a real behavioral or deployment boundary**, where one coherent ticket can become
   independently mergeable tickets without temporary bypasses or incomplete behavior. Size alone
   never creates a question and needs no human approval.
4. **Tickets whose body delegates a choice to the implementer**: "pick a library", "either approach
   works", an open acceptance criterion. A worker will choose and justify, and nobody sees what it
   chose until the pull request exists.
5. **Tickets needing something the repository cannot supply**: a product call, a copy string, a
   price, a brand choice, a physical device, a vendor console, a production write.

Anything a COMMENT raises belongs here too: split this, do it differently, this is already done.

Ask all of them in ONE `AskUserQuestion` batch, or one message if there are more than four. **If an
answer removes a ticket, remove it from the queue before the run starts** rather than spawning a
worker that will fail.

**What this gate cannot do, stated plainly rather than implied.** It asks only what is derivable from
the tickets UP FRONT. It cannot predict what a worker hits mid-run: a dependency that turns out to be
missing, a test that was already broken, an API whose real response contradicts the ticket. Those
still surface as failed verdicts. This gate removes the class of failure that was knowable before the
first worktree, and nothing else, and it is not a promise of an uninterrupted night.

## Step 2. Scope review, judged for every admitted ticket before any worker spawns

File and diff-line estimates are planning and review signals, never correctness rules. No ticket is
rejected, skipped, deferred, or held In Progress solely because it is large, and no marker or human
approval exists for size. Record expected and actual counts as advisory information.

Keep one atomic behavior complete. A migration stays with its model change and generated Designer
output; generated contracts stay with their schema; architecture artifacts stay with the route or
module change that requires regeneration; lockfiles and codemod output stay with their source. Split
only where behavior or deployment is independently complete. Never create a temporary bypass,
broken drift gate, partial behavior, or detached migration merely to reduce a number.

## Step 3. Worktree

```bash
orca worktree create --repo path:<repo> --name <slug> --base-branch main \
  --linear-issue ORB-N --no-parent --comment "<one line>" --json
```

Orca creates `refs/heads/<gituser>/<name>`. That is not the contract branch. In the worktree run
`git switch -c feature/orb-N-<slug>` (`fix/` for a bug ticket) and confirm HEAD landed on it. The
branch is never left to the worker to remember.

### Stacking, when the plan says so

A ticket whose plan entry carries a `stackParent` **branches from that parent's branch, not from
main**, and its pull request targets that branch:

```bash
git switch -c feature/orb-N-<slug> feature/orb-<parent>-<slug>
# and the worker's finishing contract opens the PR with:  --base feature/orb-<parent>-<slug>
```

Pass the parent branch to `verify-delivery.mjs` as `--base` too, or `git rev-list --count
main..HEAD` counts the parent's commits as this ticket's and the size caps read the wrong diff.

**Why stack at all.** Nothing merges overnight, so a second ticket that depends on the first cannot
branch from main: main will not contain the first ticket's work until Thomas merges it in the
morning. Stacking is the only way a blocked ticket runs the same night as its blocker.

**And why a ticket that cannot stack cannot run either.** A branch has ONE parent, so a ticket whose
same-repo blockers do not form a chain has no branch that carries all of them. It does not get to
open against main instead: the same sentence above says main lacks that work until morning. A wave
orders tickets in TIME, and time confers no code, so a later wave is not a substitute for a
dependency. `plan-queue.mjs` defers it as `UNSTACKABLE_BLOCKERS_IN_QUEUE` and the rest of the board
still plans, which is the whole difference from the exit-2 refusal this replaced.

There is no live "have the blockers merged yet" check to write, because the answer is fixed by
construction: a blocker whose work already merged is Done in Linear and was deferred as `CLOSED`
before it could count. Every blocker still counted is open, in this queue, and cannot merge before
the ticket waiting on it.

After the last pull request in a stack is open, link them on GitHub:

```bash
gh stack init --base main <parent-branch> <child-branch> [<grandchild-branch> ...]
gh stack submit          # links the existing PRs into a Stack; --open marks them ready
gh stack view --json     # machine-readable state, for the final report
```

**Merging a layer auto-rebases and auto-retargets every pull request above it**, so Thomas has no
rebasing to do. `gh stack` needs `gh` 2.90.0 or newer.

**A stack lives in ONE repository.** GitHub requires it, so `plan-queue.mjs` never sets a
`stackParent` across repos. A UI ticket blocked by an API ticket stays two independent pull requests
and the API one merges and deploys first, which is the standing deploy-API-first rule.

**Two layers of one stack never run concurrently**, even under `--parallel`. A stack is sequential by
construction: the child's branch cannot exist until the parent's does.

## Step 4. Compose the prompt

```bash
node tools/compose-prompt.mjs --issue ORB-N --repo <key> --out <scratchpad>/orb-N-prompt.md \n  --worktree <worktree path> --branch <contract branch> --base <base branch>
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
node tools/verify-delivery.mjs --issue ORB-N --worktree <p> --branch <b> --repo <key> --wait-ci <seconds> [--codex-only]
```

It is the SOLE authority for the word "delivered". Exit 0 means `DELIVERED`.

| Verdict | Meaning |
|---|---|
| `DELIVERED` | every check below passed |
| `NO_COMMIT` | `git rev-list --count main..HEAD` is 0. **This and nothing else** |
| `DIRTY_TREE` | commits exist AND the tree is dirty |
| `UNPUSHED` | commits exist above `origin/<branch>` |
| `NO_PR` | `gh pr list --head <branch>` returned 0, or more than 1 |
| `STALE_PR` | the PR's `headRefOid` is not the branch head |
| `OUT_OF_DATE` | GitHub compare says `behind_by > 0`; reports the base SHA, head SHA and count |
| `CI_FAILING` | a required or gating check concluded red on the current head |
| `CI_PENDING` | nothing is red but checks are still running |

### `DRAFT` is mandatory to clear here, before step 8

`gh pr ready <n>`, then re-run `verify-delivery.mjs`. There is no reading of `DRAFT` that lets the
run continue, because a draft attracts **no** Codex connector review, ever. Not a late one, not a
slow one: none. Measured 2026-08-08, three of five pull requests opened as drafts (ORB-7 #464,
ORB-214 #57, ORB-188 #465) and each needed a human. An unattended run that carried a draft past this
point would burn the full 900 second connector budget at step 12 and report `NO_REVIEW` on a pull
request nobody could review, then stop with a blocker it created itself.

`compose-prompt.mjs` now forbids the worker from opening a draft at all, so reaching this verdict
means the worker's tooling did it anyway. Clear it here rather than waiting to discover it at
step 12.

`checks.sizeAdvisory` always records `changedFiles`, additions, deletions and total diff lines with
`blocking: false`. Those values never alter the verdict. A 14-file/700-line PR, migrations with
generated Designer output, mandatory architecture artifacts, generated contracts, lockfiles and
codemod output are admitted when the behavioral delivery checks pass.

### `DIRTY_TREE` with commits is the one failed verdict worth a human look

Measured on ORB-39, 2026-08-06. The tool short-circuited on the dirty tree, printed a `checks` object
with ONE key, and called it `NO_COMMIT`. There WAS a commit: 7c726189, 8 files, 221 insertions,
carrying the entire ticket across both platforms with its tests. `NO_COMMIT` reads as "produced
nothing", and had it been trusted that work would have been binned and re-run from scratch. It became
PR #690 with zero re-work instead.

So the two states are now two verdicts, because their recoveries have nothing in common:

- **dirty tree, 0 commits** -> nothing survived; the ticket genuinely needs re-running.
- **dirty tree, commits present** -> the work may be complete. Read `hasCommits.headStat`, which the
  report now carries, before deciding anything.

`checks.cleanTree` inventories every path. Only untracked runtime residue, including untracked
`.orca/`, may be discarded. A tracked `.orca/` path is source, just like any other tracked change,
and is never silently deleted. Source left mid-edit is somebody's unfinished thinking and is never
yours to throw away.

**That is not the banned auto-relaunch.** No new model session starts and no code is written outside
the worker's own commit; the run is pushing a commit that already exists. `allDiscardable` false, or
anything ambiguous, hands over with the paths named.

### A red pull request was never delivered

For its whole life this step read eight artifacts and not the one that decides whether the work can
land. Measured on PR #685, the run that found it: `DELIVERED` twice, while five required-or-gating
checks were red. An unattended night would have stacked those up and called every one clean.

**`CI_FAILING` feeds the existing bounded fixer and is not a review round.** After each new commit,
discard every old CI/review/connector/thread receipt and re-verify the new head. Stop only at the
configured bound or a genuine permission, external, or human-only blocker, with the exact decision
required.

**Read what actually failed before fixing anything.** Preserve each failed check's run/check ID,
details URL, workflow, name, status and conclusion. `gh run view <id> --json jobs` names the failed
STEP. A failure at `Set up job` is GitHub infrastructure, not the diff, and the repair is a re-run:
all five reds on #685 were one Actions outage, and every hypothesis about their content was wrong.
Never fix a diff to satisfy a check that never ran.

`CI_PENDING` is its own verdict rather than a pass or a stop. Pass `--wait-ci <seconds>` to let
checks settle; without it the state is reported immediately and the run does not sit on it.

### Salvage: what you may do to a dead worker's worktree without asking

The most common real outcome is neither delivered nor empty: a worker COMMITTED complete work and
then died, at the hard ceiling, at the no-progress kill, or because it was stopped. That happened
four times on 2026-08-06 (ORB-39, ORB-98, ORB-213, ORB-92) and each time this step had no rule, so
the run asked Thomas. **A harness converting its own gap into an interruption is the defect.** So:

**You MAY, without asking:**

- **Discard only inventoried untracked runtime residue** and say so, naming every path. Tracked
  files, including `.orca/`, remain source.
- **Run the caller-specified touched-workspace test in the worktree and persist its successful
  command, exit code, head and timestamp receipt. Only then stage every intended path by name,
  commit, push, and open or update the pull request.** Before testing, salvage proves the checked-out
  symbolic branch exactly matches `--branch` and refuses protected `main`. Broad staging (`git add -A`, `git add --all`,
  `git add -u`, `git add --update`, dot, wildcard, or non-literal magic pathspecs) is forbidden by
  both the prompt and command hook. Use Git's literal pathspec mode for explicit names containing
  pathspec metacharacters.
- **Re-run a CI job whose failure you have READ and attributed to infrastructure or flake**, naming
  the evidence: a failed STEP of `Set up job`, or an assertion that touches no file in the diff.

**You MAY NOT, ever:** invent a green test receipt, write new implementation code yourself,
force-push, or merge. Those are the line between finishing a delivery and doing the ticket.

**Never push a worker's uncommitted work without running its tests first.** That is a precondition,
not a preference. Both salvages that worked that night, ORB-39 and ORB-98, were verified before the
push, and both pull requests were correct.

**A salvaged pull request RE-ENTERS this algorithm at step 7 and runs every remaining step exactly as
a worker-delivered one does.** Opening the pull request is the MIDDLE of salvage, never the end. Add
its `{repositoryKey, prNumber, receiptPath}` identity to `pullRequests` in the run record the moment
it opens, initialized as unreviewed. It remains outstanding until current-head delivery, clean
independent review, current connector review, zero threads, `behind_by=0`, and Linear synchronization
are all recorded for the same head/base pair.

Measured, and the reason this sentence is here: PR #690 (ORB-39) was salvaged by hand, cleaned,
pushed and opened, and then reported as finished except the visual check. It was carrying two failing
required checks (`Architecture map drift`, and SonarCloud coverage at 61.5% against a floor of 80%)
and one unresolved P2 bot thread. Nobody would have found out until the merge. A pull request that
skipped steps 7, 8 and 12 is not delivered, however it came to exist.

**Never read the worker's own exit code as proof of anything.** Three documented CLI bugs make it
meaningless: openai/codex#20919, openai/codex#19945, anthropics/claude-code#25629. Artifacts are the
only evidence.

`NO_COMMIT`, irreducibly dirty source, permission failures, and human-only decisions stop the ticket.
`CI_PENDING`, `CI_FAILING`, `OUT_OF_DATE`, stale receipts, connector findings, and open threads enter
the bounded proactive readiness loop below. Never relaunch the original implementation prompt.

A ticket that fails here and has children stacked behind it takes them with it: their branches were
to be cut from a branch whose work never landed. Say so by name in the report rather than attempting
them against main.

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

   **"Round" means a round of THIS review**, the frozen cross-vendor finding list. The Codex bot pass
   at step 12 is a separate reviewer with its own ruleset and its own configured cap of
   `caps.connectorFixAttempts` fixer commits, and it is not a
   third round of this one. Without that scoping the two contracts contradict each other, and a
   contradictory contract is how a run picks whichever half it read last.

**Why the cap exists.** PR #672 ran 9 review rounds over 38 hours and produced 19 findings: 19
unique, zero repeats, on a 7,078-line diff. Termination required "the
reviewer finds nothing", which on a diff that size has probability near zero. Rounds are capped
because convergence was never the terminating condition.

## Step 8. Review round 1

```bash
gh pr diff <n> > <scratchpad>/orb-N-r1.diff

# MATERIALIZE THE RUBRIC, and record where it came from. The reviewer reads THIS file, never the
# working tree, so a rubric edited by the change under review cannot become the rubric it is
# reviewed against.
#
#   repo carries the rubric at the PR's base (ui, api):   RUBRIC_REPO=<key>  RUBRIC_COMMIT=<base sha>
#   repo carries no rubric at all (landing):              RUBRIC_REPO=ui     RUBRIC_COMMIT=$(git -C <ui> rev-parse origin/main)
RUBRIC_BLOB=$(git -C <rubric repo> rev-parse "$RUBRIC_COMMIT:.claude/skills/pr-review/rubric.md")
git -C <rubric repo> cat-file blob "$RUBRIC_BLOB" > <scratchpad>/orb-N-rubric.md

# compose the review order into the scratchpad, then launch the reviewer through the launcher
node tools/launch-worker.mjs --issue ORB-N --review --repo <key> --prompt <scratchpad>/orb-N-review.md
```

**The review order MUST demand the four rubric provenance fields, and it must hand the reviewer the
materialized snapshot path.** `record-readiness.mjs` requires them and proves them with git, so a
review order that omits them produces a receipt that is refused and a whole review that must be
re-run. That happened to every review on 2026-08-08. Name in the order: `rubricRepositoryKey`
(`$RUBRIC_REPO`), `rubricCommitOid` (`$RUBRIC_COMMIT`), `rubricBlobOid` (`$RUBRIC_BLOB`) and
`rubricArtifactPath` (`<scratchpad>/orb-N-rubric.md`).

`--review` resolves the `reviewer` engine and the `review` model tier from
`.claude/orchestrator.json`, and runs in that repository's PRIMARY MAIN checkout. It refuses a
missing or unknown `--repo` and **refuses `--worktree`**: a reviewer
running inside the worktree reads the PR's own `AGENTS.md`, which is instructions written by the
change under review. Feed it the diff file and the frozen ruleset. It returns:

```json
{"reviewerKind":"independent","verdict":"CLEAN","rounds":1,"reviewedHeadOid":"<sha>","baseSha":"<sha>",
 "artifactPath":"<absolute path>","rubricRepositoryKey":"<key>","rubricCommitOid":"<sha>",
 "rubricBlobOid":"<sha>","rubricArtifactPath":"<absolute snapshot path>","findings":[]}
```

Write it to `<scratchpad>/orb-N-findings.json`. **The list is now frozen.** File every non-blocking
finding as its own follow-up Linear ticket immediately, then drop it from this run.

**Size never exempts the review.** A 355-file codemod still gets reviewed; it gets reviewed AS a
codemod. Change the order, never the depth: read the transform or the generator first,
decide whether it is correct in general, then spot-check its output where the transform is most
likely to be wrong (the odd import shape, the one file that was already different, anything the
transform touched twice). Reviewing 355 mechanically identical edits as 355 independent ones spends
the whole round proving the same thing 355 times, which is how a real defect in the transform gets
missed. A lockfile is the same shape: review the manifest change and the lockfile's own diff summary,
not the thousands of resolved lines. Say in the findings which reading you used.

## Step 9. Adjudicate

Zero blocking findings goes straight to **step 12, the Codex bot pass**. Otherwise, step 10.

The cleanest and most common path runs through step 12, not around it. A jump that skipped it here
would mean the PRs with nothing wrong are exactly the ones whose second reviewer nobody read.

## Step 10. Fixer, round 2 only

Compose a fixer prompt containing **ONLY the frozen blocking findings**. Not the ticket body, not
the non-blocking findings, not the reviewer's prose. Relaunch through `launch-worker.mjs` on the
same worktree and branch.

## Step 11. Verify-only pass

The reviewer answers `CLOSED` or `OPEN` for each frozen blocking finding, and nothing else. Hand it
`git diff <r1>..<r2> --unified=0` as the only surface on which a new finding is admissible.

- All `CLOSED` -> step 12.
- Any `OPEN` -> step 12 anyway, **report-only, no bot fix round**, then hand over with the open
  findings named. **There is no round 3.** The Codex threads are unread either way, and the hand-off
  is where Thomas reads them.

## Step 12. Clear the Codex reviewer's threads

Every pull request gets a second review from `chatgpt-codex-connector`, and until now nothing in this
harness has ever read it. Measured 2026-08-05 across PRs #676, #680 and #681: **8 inline threads
opened, 8 still unresolved, all three merged.**

```bash
node tools/list-bot-threads.mjs --pr <n> --repo <key> # posts "@codex review", THEN waits
```

| Verdict | What it means and what to do |
|---|---|
| `REVIEWED` | a review exists. Zero threads here genuinely means clean |
| `CHANGES_REQUESTED` | a review exists and blocks. This can carry **zero threads** |
| `DRAFT` | a draft attracts no review ever. Run `gh pr ready <n>` and re-read. Never "move on" |
| `NO_REVIEW` | none arrived inside the budget. **Never report this pull request as clean** |

**The request comes FIRST, not after the fix round.** The tool posts `@codex review` before it starts
the clock, gated on there being no review already pinned to the current head, so a reviewed pull
request is never nagged. This used to run the other way: wait the full budget, then ask, then wait a
second full budget from zero. Measured on #685, 900 seconds elapsed to `NO_REVIEW` on a review nobody
had requested. `--no-request` restores the old blind wait, and there is no good reason to pass it.

Because of that ordering, `NO_REVIEW` now carries `reviewRequested`, and the two readings mean
different things: asked-and-silent is evidence about the reviewer, never-asked is evidence about us.

**Never read the thread count as the verdict.** An empty list is ambiguous between "reviewed, found
nothing" and "has not run yet", and a body-level `CHANGES_REQUESTED` opens no thread at all. The tool
derives the verdict from the review itself for exactly this reason; do not re-derive it by eye.

**Triage each unresolved thread by its badge**, which mirrors the Blocking split in §5.3:

- **P1 -> fix it in this pull request.** A P1 is never closed by filing a ticket.
- **P2 or P3 -> fix it if cheap, otherwise file a follow-up Linear ticket** and close the thread
  naming it.
- **`isOutdated` is not evidence.** It means the code moved under the comment, not that anyone
  addressed it. #681's survivor is outdated and still unresolved. Treat it like any other thread.

**Every `--thread` value is COPIED from the `threads[].id` field of the `list-bot-threads.mjs` run
above, in this run.** Never typed, never remembered from an earlier ticket, and never passed with a
`||` fallback that lists fresh when it fails. Measured 2026-08-08: a typed
`PRRT_kwDOR5Siws6XdcAt` did not fail, because node ids are globally unique. It resolved to a live
CodeRabbit thread on a stranger's public repository and posted a reply there under Thomas's account,
then announced itself as `thomasluizon does not have the correct permissions to execute
ResolveReviewThread` and was filed as a transient glitch. Two gates now hold this:
`.claude/hooks/forbid-invented-identifier.mjs` refuses the command, and the tool itself refuses to
write unless the node's own `repository.nameWithOwner` equals what `--repo` resolves to.

**Every resolve posts a reply FIRST.** One of exactly three:

```bash
printf 'fixed in %s' "$sha"                 | node tools/resolve-bot-thread.mjs --thread PRRT_... --repo <key> --pr <number>
printf 'not applicable because %s' "$why"   | node tools/resolve-bot-thread.mjs --thread PRRT_... --repo <key> --pr <number>
printf 'filed as %s' "$ticket"              | node tools/resolve-bot-thread.mjs --thread PRRT_... --repo <key> --pr <number>
```

The tool refuses an empty body and never attempts the resolve if the reply failed, so a bare resolve
is impossible rather than merely discouraged. A thread closed with no reason is indistinguishable
from one nobody read, which is the whole defect this step exists to remove.

**A permissions error on any of these is a WRONG TARGET until proven otherwise.** The tool now names
the repository the node actually resolved to. Read that name before retrying anything.

If anything was fixed:

1. Re-run `node tools/verify-delivery.mjs`. The fix moved the head, so the earlier `DELIVERED` is
   stale until this re-runs. `DELIVERED` continues; `STALE_PR` means the push did not land.
2. Reply `fixed in <sha>` with the NEW sha, then resolve.
3. Post `@codex review` as a comment and read once more.

**Step 3 is not optional and not a courtesy: a re-review after a push is not guaranteed.** Both
shapes are measured, which is exactly why the run must not depend on either:

- **PR #676:** one review at `17:23:33Z`, commits continued to `17:35:14Z`, **no second review ever
  came.**
- **PR #682:** review at `16:43:46Z` on the old head, a push, then a review at `16:50:40Z` on the new
  head, so it **did** re-review.

Treat a re-review as luck, never as the mechanism. The reliable path is the explicit request, and
`list-bot-threads.mjs` is what makes the difference visible: it accepts either a GitHub Review
whose `review.commit.oid` equals the current head, or the connector's clean issue comment whose
`Reviewed commit` SHA prefix matches that full head. The issue-comment shape is measured live, not
inferred. Either surface pinned to a dead head reads as `NO_REVIEW` with the stale commit named.
Every GitHub child has a hard timeout with complete process-tree cleanup, and the bounded wait emits
progress rather than going silent. That is the trap
`An approval is only valid pinned to the head it was given on` records, closed by construction
rather than by remembering to check.

Repeat inside the bounded readiness loop until the connector pass is pinned to the current head and
every actionable thread has a commit/ticket-evidenced reply and is resolved. Count one connector
fix attempt for each commit made to address a connector pass; never exceed the positive
`caps.connectorFixAttempts` value from `.claude/orchestrator.json` (currently 3). A connector
failure that persists after that attempt is a named exhausted-fixer blocker, never a clean handoff.

## Step 13. Final-head readiness loop

Every open pull request gets one mechanical receipt keyed by repository and PR number. Persist at
least: repository key, PR number, base branch, current base SHA, current head SHA; independent
reviewer kind, verdict, rounds, `reviewedHeadOid`, artifact path; CI settled/green head; newest Codex
connector reviewed commit; unresolved Codex thread count and the head on which threads were listed;
`behind_by`; draft state; Linear status and last synchronization result.

The only READY state is simultaneous truth for one current head/base pair. Run
`record-readiness.mjs` after every artifact update. The recorder re-reads the live PR base/head,
draft state, newest required CI, current connector result, complete thread inventory, Linear state,
and compare `behind_by` at aggregation time; it never labels cached artifacts or the delivery
artifact's old SHAs as current. Its explicit stale/blocking verdicts include
`REVIEW_STALE`, `CI_STALE`, `BOT_REVIEW_STALE`, `OUT_OF_DATE`, `THREADS_OPEN`, and `LINEAR_STALE`.
Any commit, ordinary push, merge from main, or base advancement invalidates receipts tied to the old
head or base. Bare PR numbers are never sufficient run state.

For each existing PR, repeat within the configured `caps.connectorFixAttempts` fixer bound:

1. Read PR draft/head/base state and GitHub compare. If behind, merge current `main` into the branch
   without rebasing or force-pushing, push normally, and invalidate all earlier receipts.
2. Wait for all checks to settle. Preserve exact failed metadata. Rerun only a failure proven from
   its run/job steps to be infrastructure or a flake; send genuine failures through the existing
   fixer. A resulting commit invalidates both reviews and every head-bound receipt.
3. Obtain a CLEAN independent `pr-review` artifact on the current head from the target repo's primary
   main checkout. The UI copy is canonical; launch refuses if API's skill or rubric drifts. When
   round one is BLOCKING, immediately run the mechanical `--register-round-one` form above and store
   its returned ledger path in run-state before launching the one fixer transition; round two must
   match that independently persisted path/hash/base/head/frozen-ID identity.
4. Request the Codex connector on that head. Fix every actionable finding, reply with commit or
   Linear-ticket evidence, then resolve. Re-request after any push. Zero unresolved threads without
   a current-head connector review is `BOT_REVIEW_STALE`, never clean.
5. Synchronize Linear automatically, deduplicating the last posted state: work/PR opened or blocked
   -> In Progress with concise state comment; all technical readiness facts true -> In Review;
   visible-effect -> In Progress until human visual acceptance; exact permission/external/human-only
   blocker -> In Progress with the decision required. Never mark Done before merge. Size never
   affects Linear status.
6. Re-record and evaluate. READY ends the loop. A genuine permission, external, or human-only
   blocker, or exhaustion of the bounded fixer/review budget, produces a precise handoff and keeps
   the PR in the run record. Never merge.

In `--codex-only`, every PR body the harness creates or touches is mechanically rewritten so its
exact first line is `DEGRADED: same-vendor review`. The launcher enforces it after implementation;
every delivery verification reasserts it after later body edits; and final receipt aggregation
reasserts it once more. Pass `--codex-only` to both tools. The launcher, delivery verifier, and
receipt recorder all persist the same body-edit CI invalidation in shared repository Git metadata
until newer `Guards` check instances register, so another process or linked worktree cannot reuse
the pre-edit green rollup. A body touch cannot clear readiness while silently dropping the banner.

## Step 14. Hand over

Set `ORB-N` to In Review only from a READY receipt, **except for a `visible-effect` ticket**.

**A `visible-effect` ticket is never moved to In Review by this run.** It stops at the pull request
and prints `visual check owed`. Thomas runs `/dev-server` and looks at it himself, then moves it.
Only a human grants visual completion (D7), and with nothing merging unattended there is no reason
for a machine to assemble screenshots on his behalf. A ticket with no visible surface is unaffected.

**A worker producing visual evidence is never the mechanism, on any ticket.** It cannot be: only a
human grants visual completion (D7), the run merges nothing unattended, and a fresh worktree has no
seeded session, so the attempt can only ever end at a login page. Measured 2026-08-06 on two tickets
whose code was already committed and correct: ORB-39 started a dev server on :3920, wrote a
Playwright visual test, and was killed at the 45 minute ceiling with a dirty tree; ORB-98 opened
`/login?returnUrl=%2Fpreferences` and burned the rest of its budget. Two worker budgets, two dev
servers left listening, two deliveries a human had to rescue.

Both enforcement points are unconditional and neither is scoped to `visible-effect`, because the
first attempt WAS scoped and the scoping was the defect: `compose-prompt.mjs` puts the prohibition in
every worker prompt, and `.claude/hooks/forbid-worker-browser.mjs` refuses the command at act time
for any caller carrying the launcher marker or running inside a linked worktree. `/dev-server` is
untouched: it runs from the main checkout, which is Thomas.

Print:

- PR URL, its base branch, and diff size (additions + deletions).
- Verdict: clean after round 1, clean after round 2, or handed over with N open findings.
- Codex threads: `N found, F fixed, R filed, X not applicable, U left open`, or
  `BOT REVIEW ABSENT`.
- Every follow-up ticket filed, by identifier.
- `visual check owed` when the ticket is `visible-effect`.
- `DEGRADED: same-vendor review` when `--codex-only` was passed.

**Then, without `--sleep`: STOP and wait for Thomas to type `continue`.** Nothing polls and nothing
watches; zero tokens burn while it waits. **With `--sleep`: go straight to the next ticket.**

## Step 15. The report

Once the queue is exhausted, print one summary and stop:

- Every pull request opened, with repository, number, current base/head SHAs, advisory diff size,
  behind count and receipt verdict.
- **The stack layout**, so the merge order is stated rather than worked out at 08:00.
- Every ticket skipped, with its reason: a deferral from step 1 or a genuine delivery blocker.
- Every `visual check owed`.
- **The single command that merges the lot**, ready for Thomas to approve.

Append one JSON line per ticket outcome to `<scratchpad>/queue-run.jsonl` as the queue runs, not at
the end. A summary assembled only at the end does not survive a context reset in the middle of the
night.

## Step 16. Teardown

Per worktree, only after `gh pr view <n> --json state` reads `MERGED`:

```bash
node tools/teardown-worktree.mjs --issue ORB-N
```

Never tear down an unmerged worktree. The branch and its work are the only copy. In a queue this
runs for merged tickets only, which after an overnight run is usually none of them.

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

## §5.7 The queue

**`--sleep` opens pull requests. It never merges one.** Every piece of signing, provenance, ledger
and merge-sweep machinery the OLD `--sleep` needed stays deleted, because nothing here acts on a
receipt. What makes an unattended run trustworthy now is `verify-delivery.mjs`: it is the sole
authority for the word "delivered" and reads only git and GitHub artifacts, never a worker's
self-report. That is what was missing the first time, when a worker claimed work it had not done.

**`--sleep` asks everything it can BEFORE it starts.** Step 2b is the whole of it, and it runs in
both modes: plan the queue, read every admitted ticket and its comments, review scope for all
of them, collect every derivable decision, ask them in one batch. Under `--sleep` the run then works
the queue without stopping again; without it, the run also keeps its stop after every pull request.
It cannot ask what only a running worker discovers, and it does not pretend to.

**A failed worker attempt is recorded, but its ticket is not silently skipped.** Preserve its work,
use the step 7 salvage path when the caller-specified workspace test is green, and keep the PR in
the bounded readiness loop until CI, both reviews, threads, base freshness, and Linear agree on one
head/base pair. The queue may continue independent tickets while a wake source owns that debt. Only
a genuine permission, external, human-only, or exhausted bounded-fixer blocker permits handoff, and
the ticket remains In Progress with the exact decision required.

### Every turn under `--sleep` ends with a live wake source, named

**The invariant:** under `--sleep`, a turn may only end while at least one background task is still
running, and the turn's last line names it. Nothing else continues the run. Ending a turn with no
live task ends the night silently, and what it leaves behind is indistinguishable from a queue that
finished, so nobody goes looking. That is exactly how 2026-08-06 ended: the orchestrator said "CI
will wake me" with nothing scheduled.

**When there is genuinely nothing to wait on and work remains, LAUNCH THE NEXT TICKET.** All slots
free plus a non-empty queue is not a reason to end the turn; it is the definition of the next
action. `launch-worker.mjs` registers itself as a wake source, so starting the next worker satisfies
the invariant by construction.

**The gate:** `.claude/hooks/require-wake-source.mjs` runs on `Stop` and refuses the stop when the
run record says `--sleep` with tickets remaining and no registered wake source is a live process. So
maintain the record. Write it at step 2b and update it at step 13, in the checkout you are running
from:

```jsonc
// .git/orbit-orchestrate-run.json   (never committed; .git is not part of the tree)
{
  "sessionId": "<this session's id>",
  "sleep": true,
  "remaining": ["ORB-2", "ORB-3"],
  "pullRequests": [
    {"repositoryKey":"ui","prNumber":693,"receiptPath":"<absolute receipt path>"}
  ],
  "readinessLedger": [
    {"repositoryKey":"ui","prNumber":693,"receiptPath":"<absolute receipt path>"}
  ]
}
```

`pullRequests` holds repository-qualified identities and receipt paths for every pull request this
run opened. Within one exact `sessionId`, `writeRunState` mechanically unions those identities into
the append-only `readinessLedger`; later writes cannot erase them by setting `pullRequests: []`.
A new session starts with a fresh ledger and cannot inherit yesterday's completed PRs. A bare number is
invalid because UI and API can have the same PR number. The stop hook opens every ledger receipt,
matches its repository and PR identity, then boundedly rereads the live GitHub head/base/draft,
newest CI reruns and required-context inventory, current connector verdict and fully paginated
thread count, plus Linear status/visible-effect state. It allows completion only when the cached report is READY and
all live values still match that exact receipt. This is the
mechanical half of salvage: a pull request opened by hand and never re-verified cannot be reported
as a finished queue even if a fallible session clears the active list.

`sessionId` is what keeps yesterday's record from blocking today: a record whose session does not
match is ignored. When the queue really is done, write `remaining: []`; `pullRequests` may be empty,
but never remove `readinessLedger`. The READY receipts let the hook distinguish completion from a
mistakenly cleared queue, then the run may print the step 15 report.

What the gate can prove is that a registered pid is still alive, which is real evidence rather than a
claim, because only the launcher registers one. What it cannot prove is that the task will re-invoke
THIS session. That part is still yours, which is why the invariant says to name it.

**`--parallel` runs up to `caps.parallelTickets` tickets at once**, currently **3**, one worktree
each. Not eight: each worktree is a full install, build and test run plus its own model session, and
eight concurrent will thrash one laptop and hit rate limits. Raise it after measuring, not before.

Two rules bound it:

- **Never two layers of one stack.** A stack is sequential by construction.
- **Preflight 0b runs once per repo, before any fan-out.** Concurrent `fetch` and `merge --ff-only`
  against one checkout race on `.git/index`.

**`--auto` takes the scope from the board**, ordered by leverage: a ticket that unblocks three others
outranks three easy ones. `plan-queue.mjs --board` computes that ordering from the real `blockedBy`
graph, so it is derived rather than guessed.

**Check this session's own checkout ONCE, up front, before Thomas sleeps.** Step 0b refuses to switch
the repository this session is running from, and most tickets are `repo:ui`, so a session sitting on
the wrong branch loses the entire night. Discover it at the start, not at 03:00.

## Hard prohibitions

- **A machine never merges unasked.** No `gh pr merge`, no
  `PUT /repos/{owner}/{repo}/pulls/{number}/merge`, no GraphQL merge mutation, no `--admin` in any
  shape, **from inside a run**. Naming the raw API paths is deliberate: banning only the flag leaves
  them open. **The human merge gate is what makes this whole simplification possible.**

  The rule is about consent, not about who types the command. Thomas reads the pull requests and then
  asks for the merge; running `gh stack merge --squash` or `gh pr merge --squash` **in a later turn,
  on his explicit instruction**, is the intended path and is not a violation. What is forbidden is a
  machine merging work he has not looked at and approved.

  `--admin`, the raw REST and GraphQL merge paths, force pushes and pushes to `main` stay blocked in
  every case, run or no run. Those remain Thomas's alone.
- Never push to `main`. Never force-push. Never `--no-verify`, never `--no-gpg-sign`.
- The composed prompt is written to the scratchpad, never inside a repo.
- No auto-relaunch on a failed verdict. Stop and report.
- Never edit this skill, a tool under `tools/`, or a CI gate from inside a run. A run that edits the
  contract it is executing describes no consistent system afterwards. Record it, repair it after.
