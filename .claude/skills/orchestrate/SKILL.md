---
name: orchestrate
description: Tickets in, reviewed pull requests out. Plans a queue from one ticket, several, or a milestone, then per ticket opens a worktree, launches a headless worker, verifies delivery from artifacts, and clears the Pullfrog review. --sleep works the whole queue unattended. The orchestrator may merge under D88/D90 standing authority at the exact approved head; workers never merge.
argument-hint: <ORB-N | #N | ticket references | milestone> [--sleep] [--parallel] [--cloud] [--auto]
effort: high
---

# /orchestrate: a queue of tickets, a stack of reviewed pull requests

Constants:

- Ticket repository `thomasluizon/orbit-tickets`; the configured Projects v2 board carries Status.
- The session always runs from orbit-ui-mobile (D17). Each worktree opens in whichever repo its
  ticket's `repo:*` label names.
- **Scratchpad** = this session's scratchpad directory. Every prompt, diff, log and findings file
  goes there. Never inside a repo: a file written into the worktree gets committed by the worker.

## Invocation

```
/orchestrate ORB-N                      one ticket, exactly as before
/orchestrate #N                         one post-migration GitHub ticket
/orchestrate ORB-A #123 #456            those tickets, in dependency order
/orchestrate "<milestone title>"        every open ticket in that milestone
/orchestrate --auto                     the whole board, highest leverage first
```

Flags, all combinable:

| Flag | Effect |
|---|---|
| `--sleep` | do not stop after each pull request; work the whole queue and report at the end |
| `--parallel` | run up to `caps.parallelTickets` local tickets at once, one worktree each; with `--cloud`, use `caps.cloudParallelTasks` |
| `--cloud` | run UI implementations in Codex Cloud, then materialize and deliver them locally |
| `--auto` | take the scope from the board rather than from an argument |

**Without `--sleep` the run stops after every pull request** and waits for Thomas to type
`continue`. Nothing polls, nothing watches, and zero tokens burn while it waits.

**One ticket with no flags behaves exactly as it did before: it runs locally.** `--cloud` and
`--parallel` remain opt-in. D89 governs how a redesign queue is invoked: use
`/orchestrate --cloud --parallel` for UI, reserving the small local pool for `orbit-api` and
`orbit-landing-page`. It does not redirect a bare invocation. Pool sizing is detailed below.

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
                     The classifier is evidence, not the boundary: ask ANYTHING unresolved.
                     CONVERSATION-FIRST ticket: --sleep -> already deferred NEEDS_CONVERSATION.
                     Attended -> converse ONE TOPIC AT A TIME, then write the decisions to the
                     ticket with comment-ticket.mjs BEFORE compose-prompt. No worker until answered.
                     THEN write .git/orbit-orchestrate-run.json: session, sleep, remaining[]
                                        ---- per ticket, in wave order ----
 3  Worktree         orca worktree create; git switch -c feature/<ticket-slug>-<slug>
                     stackParent set -> branch from ITS branch, not from main
 4  Compose prompt   ticket verbatim + comments + ORCHESTRATOR'S BRIEF + finishing contract
                     written to the scratchpad, never inside a repo
 5  Spawn worker     local: supervised headless worker · cloud: submit one receipt-backed task
  6  Watchdog         local: two clocks and process-tree kill · cloud: receipt watcher and one wall clock
 7  VERIFY OUT OF BAND
                     git status --porcelain            -> empty
                     git rev-list --count <base>..HEAD -> >= 1
                     git rev-list origin/<br>..HEAD    -> 0  (pushed)
                     gh pr list --head <br>            -> exactly 1, headRefOid matches
                     PR title or body names the actual ticket reference -> the branch alone is not the link
                     additions+deletions and changedFiles -> advisory review information only
                     compare base...head               -> behind_by = 0
                     statusCheckRollup, both node shapes -> no check red, none pending
                     DELIVERED · NO_COMMIT · DIRTY_TREE · UNPUSHED · NO_PR · UNLINKED_PR
                     · STALE_PR · OUT_OF_DATE · CI_FAILING · CI_PENDING
                     on EVERY worker exit, DELIVERED included: read the worker log tail for
                     NEEDS_DECISION and the PR body's ## Assumptions (attended: adjudicate
                     both with Thomas NOW, before step 8)
                     anything but DELIVERED enters the bounded readiness/fixer path or a real blocker
                     SALVAGE allowed: discard residue · test then commit+push what the worker
                     left · re-run a CI job proven infra. NEVER write code, revert, force, merge.
                     A SALVAGED PR RE-ENTERS HERE and runs 7, 8 and 9 like any other.
 8  CLEAR PULLFROG   Pullfrog reviews on open and re-reviews on every push. Ask for nothing.
                     node tools/list-bot-threads.mjs --pr <n> --repo <key> -> threads[] AND reviewBody
                     FIX every finding that breaks behaviour, security or data integrity
                     FILE every other finding as an orbit-tickets issue
                     REPLY AND RESOLVE every thread you filed, with resolve-bot-thread.mjs
                     resolve FIRST, then push. The push re-reviews both together.
                     bound: caps.reviewFixAttempts commits
 9  READINESS LOOP   wait CI, `pullfrog-approval` included · fix genuine failures · merge main
                     into branch when behind · rerun invalidated receipts · synchronize the ticket
                     READY only when every receipt names the same current head and base SHA
10  Hand over        PR URL, advisory diff size, receipt and READY verdict.
                     PRINT manual steps from THREE sources: the ticket (complete-ticket.mjs
                     --preflight) + the PR body's ## Manual steps + your own read of the diff
                     PRINT the adjudicated assumptions (decided at the step 7 worker-exit read,
                     never first seen here)
                     READY -> In Review.
                     UPDATE remaining[] in .git/orbit-orchestrate-run.json
                     no --sleep -> STOP and wait for `continue`  ·  --sleep -> next ticket
                     --sleep: a turn ends ONLY with a live background task, NAMED  [Stop hook]
                                        ---- end per ticket ----
11  Report           every PR opened, the stack order, every ticket skipped and why,
                     and merge evidence for D88/D90; hand off anything outside that authority.
12  Teardown         per worktree, only after gh pr view reads MERGED
```

## The tools

These interfaces are fixed. Do not invent flags or variants.

```
node tools/plan-queue.mjs        (--tickets ORB-1,ORB-2 | --board) [--format markdown] [--sleep]
node tools/comment-ticket.mjs    --issue "<ticket-ref>" --body-file <path|->
node tools/complete-ticket.mjs   --issue "<ticket-ref>" [--preflight]
node tools/compose-prompt.mjs    --issue "<ticket-ref>" --repo <key> --out <file> [--worktree <p>] [--branch <b>] [--base <ref>] [--cloud]
node tools/launch-worker.mjs     --issue "<ticket-ref>" --worktree <p> --prompt <f> [--hard-ceiling-minutes <n>]
node tools/submit-cloud-worker.mjs --issue "<ticket-ref>" --env <id> --branch <b> --order <f> --worktree <p>
node tools/submit-cloud-worker.mjs --watch <receiptPath>
node tools/submit-cloud-worker.mjs --clear-unknown <reservation-file> --assert-no-task-exists
node tools/materialize-cloud-result.mjs --receipt <f> [--allow-abandoned]
node tools/verify-delivery.mjs   --issue "<ticket-ref>" --worktree <p> --branch <b> --repo <key> [--base <ref>] [--wait-ci <s>]
node tools/list-bot-threads.mjs  --pr <n-or-url> --repo <key> [--wait-seconds <s>]
node tools/resolve-bot-thread.mjs --thread <PRRT_...> --repo <key> --pr <number>   # reply body on stdin
node tools/salvage-worker.mjs    --issue "<ticket-ref>" --repo <key> [--pr <n>] --worktree <p> --branch <b> --run-root <p> --test-command <json> --test-receipt <json> --message <m> --path <path>...
node tools/sync-issue-state.mjs  --issue "<ticket-ref>" --repo <key> --pr <n> --state <working|blocked|ready> --head-sha <sha> --base-sha <sha> --message-file <path|->
node tools/record-readiness.mjs  --repo <key> --pr <n> --delivery <json> --ticket <json>
node tools/teardown-worktree.mjs --issue "<ticket-ref>" --repo <key>
```

The local launcher and cloud submitter are the only sanctioned ways to start a model session. A raw
`claude`, `codex exec`, or `codex cloud exec` from an orchestrating session is refused by
`.claude/hooks/orchestrator-guardrails.mjs`. Read-only `codex cloud list|status|diff` calls are
allowed. Raw `codex cloud apply` stays refused; materialization goes through the named tool above.

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

Expected state: `~/.claude/skills/` holds exactly 16 dirs (`brain`, `brain-agenda`, `brain-capture`,
`brain-decide`, `brain-review`, `computer-use`, `diagnosing-bugs`, `find-skills`,
`g-best-implementation`, `g-deep-research`, `g-simplify`, `g-video`, `grilling`, `orca-cli`,
`orchestration`, `tdd`) and none of them may also exist under `.claude/skills/`.

## Step 1. Plan the queue

```bash
node tools/plan-queue.mjs --tickets ORB-A,#123           # explicit list
node tools/plan-queue.mjs --board                        # --auto
```

For a milestone scope, first read its live membership with `gh issue list --repo
thomasluizon/orbit-tickets --milestone "<exact title>" --state open --limit 1000 --json number`.
Pass only the returned issue numbers to `plan-queue.mjs --tickets`. Do not substitute the whole
Projects v2 board. A milestone is a completion body; the board also contains the holding pen.

It returns `admitted`, `deferred`, `waves` and `stacks`. **Print the plan and every deferral before
any work starts.** A ticket dropped at 03:00 that Thomas only discovers at 08:00 is a wasted night;
the same ticket named at the start is a decision he can make before he goes to bed.

Then read each admitted ticket in full **with its comments**, because the plan carries titles and
labels, not bodies:

```bash
gh issue view <ticket-number> --repo thomasluizon/orbit-tickets --comments
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
| `UNSTACKABLE_BLOCKERS_IN_QUEUE` | two or more same-repo blockers that do not chain. A branch has ONE parent and the planned base does not yet carry all of them, so no branch can carry their work. Run it after they merge |
| `NO_REPO_LABEL` | no `repo:*` label, so the target repository is unknown. Never guess it |
| `AMBIGUOUS_REPO` | two `repo:*` labels. `repo:both` does not exist (D4) |
| `CLOSED` | already Done, Canceled or Duplicate |
| `NOT_REPRODUCED` | the body says NOT REPRODUCED, asks for a device or emulator repro, or makes obtaining one the first Scope item. ORB-128 and ORB-208 are both Android runtime bugs whose competing hypotheses only a device can tell apart |
| `NOT_CODE_WORK` | the body says no code in any repo, Ops-only, or HUMAN-ONLY. ORB-27, ORB-28, ORB-83 |
| `MULTI_PR` | the body scopes itself to several pull requests, which breaks D4 before the harness sees it. ORB-25, ORB-26 |
| `NEEDS_CONVERSATION` | **`--sleep` only.** The ticket can be executed headlessly, but not CORRECTLY without asking first: a human grant in its acceptance criteria, a body that contradicts itself about which tool is current, a choice left to the implementer, or a product/brand/copy/price call the repository cannot supply. Thomas is asleep, so it defers WITH its open questions printed. ORB-30 (#36) |

The last four are the executability pass, added after the Onda 1 queue admitted 71 tickets and
deferred none while eleven of them could not be executed by a headless agent at all. Two things it is
deliberately careful about, and you should be too when you read its output: **a keyword match is
evidence, not a verdict** (the same sentence under Out of scope means the opposite of what it means
under Scope), and **counting bullets under Affected modules over-counts**, because that list carries
test files and read-only references. ORB-86 named two orbit-api files it never touched. A marginal
count is therefore a `warnings` entry on an ADMITTED ticket, not a deferral. Print those warnings.

## Step 2b. The question gate, BOTH modes

**Every question the queue raises, asked once, before the first worktree exists.**

**It runs in both modes, and the position is the point.** The only human checkpoint used to sit at
step 10, AFTER the pull request exists, and nothing at all sat between step 4 and step 5. So the run
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

### The conversation-first exception: some tickets need a talk, not a batch

`plan-queue.mjs` classifies each ticket for the four signals above and returns
`conversation: {source, signals, questions}` on the admitted entry, plus a `CONVERSATION FIRST`
warning. Pass `--sleep` to the planner when the run has it, and those tickets defer as
`NEEDS_CONVERSATION` with their questions printed instead.

The label `needs:conversation` forces it on and `needs:no-conversation` forces it off; either
overrides the body. Use `needs:no-conversation` once the questions are already answered in a comment,
so the ticket runs headless the next night.

**Under `--sleep`, never attempt one.** A conversation cannot happen while Thomas is asleep. The
ticket defers before any worker spawns and its open questions go in the step 11 report, so he wakes
to a decision list rather than a confidently wrong pull request.

**Attended, converse before you compose.** The one-batch rule above is right for "should this ticket
run at all" and wrong for "design this with me". So for a conversation-first ticket:

1. Ask **one topic at a time**. Show the contradiction or the grant, state the options, recommend one,
   and wait. Rule 7 of `.claude/rules/core.md` still holds: assert the obvious option and ask for
   confirmation rather than presenting a menu.
2. **Never spawn the worker until the open questions are answered.** A product, brand, copy, price or
   design call is not something to proceed on under an assumption.
3. **Write the decisions back to the ticket as a comment, before composing the worker prompt.** This
   needs no new machinery and is the whole trick: a comment is already part of the work order and the
   LATER comment already wins, and `compose-prompt.mjs` already passes comments through to the
   worker. So the answers reach the implementer over a path that already exists, and they are durable
   and auditable instead of living in this session's scrollback. Post it with
   `node tools/comment-ticket.mjs --issue "<ticket-ref>" --body-file <scratchpad-file>`, never a raw
   `gh issue comment`.

### The classifier is evidence; unresolved uncertainty is the gate

`plan-queue.mjs`'s signals and the `needs:conversation` label are detection aids, not the boundary
of asking. Attended, ask Thomas ANY question the run raises, at any step, at the moment it appears:
a contradiction found while reading, a tool the ticket names that is not wired, a dependency that
does not exist. One topic at a time, your recommended answer first (core rule 7). A decision that
belongs to Thomas (product, brand, copy, price, design direction, or which of two contradictory
instructions is current) is never proceeded on by assumption, at any step, in either mode. Under
`--sleep` the same discovery defers the ticket with its question in the step 11 report. Write every
answer to the ticket with `comment-ticket.mjs` so it reaches the worker and survives the session.

**What this gate cannot do, stated plainly rather than implied.** It asks only what is derivable from
the tickets UP FRONT. What a worker hits mid-run (a dependency that turns out to be missing, a test
that was already broken, an API whose real response contradicts the ticket) surfaces later: as a
`NEEDS_DECISION` question when it is a decision (step 7), or as a failed verdict when it is a defect.
This gate removes the class of failure that was knowable before the first worktree, and nothing
else, and it is not a promise of an uninterrupted night.

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
  --issue <ticket-number> --no-parent --comment "<one line>" --json
```

Orca creates `refs/heads/<gituser>/<name>`. That is not the contract branch. Derive the ticket slug
from its actual reference: `orb-N` for a migrated ORB identifier, or `ticket-N` for a GitHub-only
`#N`. In the worktree run `git switch -c feature/<ticket-slug>-<slug>` (`fix/` for a bug ticket) and
confirm HEAD landed on it. Never invent an ORB identifier. The branch is never left to the worker
to remember.

### Stacking, when the plan says so

A ticket whose plan entry carries a `stackParent` **branches from that parent's branch, not from
main**, and its pull request targets that branch:

```bash
git switch -c feature/<ticket-slug>-<slug> feature/<parent-ticket-slug>-<slug>
# and the worker's finishing contract opens the PR with:  --base feature/<parent-ticket-slug>-<slug>
```

Pass the parent branch to `verify-delivery.mjs` as `--base` too, or `git rev-list --count
main..HEAD` counts the parent's commits as this ticket's and the size caps read the wrong diff.

**Why stack at all.** A dependent ticket needs its parent's code before implementation starts.
When the parent's work has not merged into the base, branch from its contract branch. A later wave
alone supplies no code. `plan-queue.mjs` defers same-repo blockers that do not form one chain as
`UNSTACKABLE_BLOCKERS_IN_QUEUE`; the rest of the board still plans.

The queue describes dependencies at planning time. D88/D90 may allow a parent to merge during a run.
If a planned parent merges before its child starts, refresh the base and re-plan the remaining
queue before creating that child's worktree. Do not reuse a squash-merged branch or assume that an
old stack plan still describes the current base.

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
node tools/compose-prompt.mjs --issue "<ticket-ref>" --repo <key> --out <scratchpad>/<ticket-slug>-prompt.md \n  --worktree <worktree path> --branch <contract branch> --base <base branch>
```

The file carries, in order:

1. The ticket body VERBATIM plus every chronological comment.
2. **The orchestrator's brief:** target repo and its absolute path, the branch already checked out,
   the base branch, the affected-file list from step 2, and the scope boundary as a hard limit.
3. **The mode-specific finishing contract:** compile and run focused tests; commit before broader
   verification. Local workers then push and open or update exactly one non-draft PR against the
   supplied base branch, linking the ticket. They report the URL and tests and stop without polling
   CI. The orchestrator owns CI waiting, review fixes and final readiness verification.
   Cross-platform parity and i18n key parity land in the same commit.
   **The worker never merges and never opens a second PR.**

Write it to the scratchpad. A prompt file inside the worktree gets committed by the worker.

For Cloud execution, pass `--cloud` to `compose-prompt.mjs`. That selects the container brief and
`CLOUD_FINISHING_CONTRACT` from `tools/lib/cloud-worker.mjs` instead of local push/PR instructions.
The submitter appends that same contract only when absent and hashes both forms in the receipt.
Never submit a locally composed prompt to Cloud or append a second completion contract by hand.
The Cloud contract leads with the commit requirement and its consequence, before every other step:

> Commit the implementation. Without a commit there is no diff and the work is lost.

Then edit, compile, run focused tests and commit named paths before broader verification. A hook
failure is reported with its exact output; never bypass hooks or change baselines to force a commit.
Never push, create a branch or open a PR from Cloud. Report the commit and tests and stop without
polling CI. The orchestrator materializes and delivers the change locally and owns CI waiting.
The order also requires `.claude/cloud-handoff.json` in the committed diff, with the schema in
`CLOUD_FINISHING_CONTRACT`. Container terminal output is supplementary, never the handoff channel.

## Steps 5 and 6. Spawn the worker

### Cloud execution

`--cloud` is available only for the repository bound to the environment by `cloud.repositoryKey` in
`.claude/orchestrator.json`. Submission and materialization both verify that local Git identity.
Publish the contract branch, then submit each implementation with `submit-cloud-worker.mjs`:

```bash
# Publication belongs to orchestration so the submitter stays read-only toward Git remotes and keeps refusing unpublished or stale branch tips.
git push -u origin <contract-branch>
node tools/submit-cloud-worker.mjs --issue "<ticket-ref>" --env <id> --branch <contract-branch> --order <f> --worktree <p>
# Read receiptPath from the submitter's JSON, then launch this as a background task.
node tools/submit-cloud-worker.mjs --watch <receiptPath>
```

The submitter verifies that the remote branch SHA exactly matches the worktree HEAD. The receipt
records the exact pushed branch SHA that the container starts from, the order hashes, target
worktree, submission time, and the deadline at `timeouts.cloudCeilingMinutes`. Its stable mirror
under the shared Git directory is the recovery source after a crashed session. The composed order
is sent through stdin so its size is not constrained by the Windows command line limit.

Under combined `--sleep --cloud`, immediately launch `--watch` as a background task for every
confirmed receipt. The watcher registers its own live PID in the orchestrating checkout, polls the
Cloud task, and reconciles each observation into the receipt. The local deadline records result
abandonment, but the watcher stays alive until the remote task reaches `ready`, `applied`, or `error`.
Its exit wakes the session and starts the next scheduler pass, which materializes or quarantines the result. Name that
watcher as the turn's final live wake source. Submission alone is not a wake source.

Persisting the reservation happens before `codex cloud exec`. A local timeout or crash can leave the
remote outcome unknown, so that reservation continues to consume capacity and blocks the same
ticket. Absence cannot be proven from `codex cloud list` because the CLI exposes no create to list
visibility bound. `--clear-unknown` alone therefore refuses. Open the task list in the Codex UI and
confirm no task exists for the reservation, then add `--assert-no-task-exists`. That flag is a human
assertion, not a deduction from the listing, and the receipt records the assertion and its time. If
a visible task exists, run `--abandon-known <reservation> --task-id <task_e_id>`. This binds the task
only for terminal status tracking. It does not adopt the task and its diff is never applied. The
reservation keeps consuming capacity and blocking its ticket until a scheduler pass observes that
task in `ready`, `applied`, or `error`, then releases it. Never assert absence while the UI shows a
task.

Cloud has one wall-clock ceiling and no no-progress clock. Across one observed run, `updated_at` did
not move while the task was running and moved at the transition. The CLI reference does not define
the field or its mutation rules, so the harness records and validates it only as diagnostic data.
On each scheduler pass, and inside each live receipt watcher, read the stable receipts and
`codex cloud list --env <id> --json`. Fleet
capacity is unknown submissions plus every remotely nonterminal receipt, including a locally
abandoned one. Same ticket Cloud admission is stricter: every unresolved receipt blocks, including
`ready` and an abandoned remote task that is still pending.
Never maintain a counter. When this harness first observes `ready`, record that local observation
time and keep it unchanged. The receipt is on time only when that first observation is at or before
its deadline. Otherwise, once the deadline passes, write `abandoned` with the time and last observed
status. A successfully materialized receipt is never abandoned by a later refresh. Abandonment
quarantines the result and permits a local requeue, but it releases Cloud capacity and same-ticket
Cloud admission only after terminal observation. Requeue the ticket through the local path by default.

An abandoned task may finish late. Record that terminal observation but keep the result
quarantined. `materialize-cloud-result.mjs` refuses it unless `--allow-abandoned` is explicit, and
the exact base SHA check still applies. Cloud implementations use `caps.cloudParallelTasks`; local
materialization is serial across the fleet; GitHub-calling readiness work stays capped at 3.

When a task receipt reaches any terminal status, run `materialize-cloud-result.mjs` in the local
control plane. For `error` and `applied`, it records the distinct unusable result and resolves the
receipt without applying. For `ready`, it requires a clean worktree whose HEAD is byte-for-byte the
receipt base SHA. List summary statistics are advisory and never decide whether a diff exists, so a
ready task is applied even when `summary.files_changed` is zero. A successful apply leaves staged
changes and never moves HEAD. Consume the Cloud handoff below before the existing local test,
signed commit, push, pull request, and readiness flow. The cloud tool never performs those actions.

**Cloud handoff, before local delivery.** New submissions set `handoffRequired: true`. The worker
commits `.claude/cloud-handoff.json`; materialization reads the staged artifact, validates its
required fields and preserves the complete object in `materialized.handoff` in both receipt copies.
Read that object on every materialization, including retries. Exit 10 with `CLOUD_HANDOFF_INVALID`
means the receipt is terminally unusable and ticket admission is released. The reason is durable in
both receipt copies; retries return the same outcome without applying again. Preserve the staged
patch in its worktree for manual delivery and record the blocker. The recovery marker is cleared
only after receipt resolution is durable. Exit 10 with `NEEDS_DECISION` preserves the handoff
and refuses delivery. Route its question through step 7 (under `--sleep`, log it as blocked), and
do not run readiness or merge until Thomas answers and the resulting work is verified.

On success, read `assumptions` using step 7's adjudication rule, and carry them verbatim into the PR
body's `## Assumptions`. Carry `manualSteps` into `## Manual steps`, including each exact key,
location and proof, and carry `testResults` into validation. Save the resulting PR body in the
scratchpad before delivery. Only after reading the durable receipt, restore
`.claude/cloud-handoff.json` to HEAD in the index and worktree, removing a newly added artifact if
needed; it is transport, not product source. Receipt retries return the preserved handoff without
reapplying the diff. A legacy receipt without `handoffRequired` has no such proof: recover the full
handoff explicitly or record a blocker before delivery; an absent report never means no decisions.

If materialization exits 9 with `APPLIED_RECEIPT_WRITE_FAILED`, cloud apply already succeeded and
the diff is staged. Only the bounded receipt write lock timed out. Leave the worktree unchanged and
rerun the same `materialize-cloud-result.mjs --receipt <f>` command. The retry fetches the task's
unified diff, compares it byte-for-byte with the staged Git patch, and records materialization without
applying the cloud task a second time. The pre-apply marker identifies the interrupted attempt; it is
not asked to contain evidence that could only be written after the interruption point.

A durably materialized receipt is an idempotent success. A retry returns `MATERIALIZED`, removes a
stale recovery marker when possible, and never calls Cloud apply again. If a `ready` task applies no
changes or apply fails without touching the worktree, the tool reads the authoritative raw task diff.
Only the measured no-diff response, exit 1 with zero stdout bytes and the exact task-bound no-diff
stderr, records `CLOUD_TASK_EMPTY` as unusable and releases ticket admission. Any other failure or
a non-empty diff keeps the task unresolved.

### Local execution

```bash
node tools/launch-worker.mjs --issue "<ticket-ref>" --worktree <p> --prompt <f> [--hard-ceiling-minutes <n>]
```

Headless, `stdin=NUL`, `cwd` = the worktree, log to the scratchpad.

`launch-worker.mjs` runs in the FOREGROUND as its own watchdog and owns both clocks: the hard
ceiling and the no-progress cap from `.claude/orchestrator.json` (currently 45 and 10 minutes),
killing the whole process tree on either. Pass `--hard-ceiling-minutes` at launch for a ticket the
plan already shows outrunning the fleet-wide ceiling: a large migration, a subsystem ticket, or one
whose test matrix is the work. Three finished workers died at the fixed 45 on 2026-08-22 for
exactly that shape.

The orchestrator launches it as a **background shell task and ends its turn.** Zero tokens burn
while the worker runs, and the process exiting is what wakes the session.

**Death is the wake signal.** A dead worker can never hang the session, because the session is not
running. There is nothing to poll, nothing to babysit, and no monitor to arm.

## Step 7. Verify delivery, out of band

```bash
node tools/verify-delivery.mjs --issue "<ticket-ref>" --worktree <p> --branch <b> --repo <key> --wait-ci <seconds>
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
run continue: the readiness receipt reports `DRAFT` for a draft pull request, so a draft never
reaches READY however good the code is. Measured 2026-08-08, three of five pull requests opened as
drafts (ORB-7 #464, ORB-214 #57, ORB-188 #465) and each needed a human.

`compose-prompt.mjs` now forbids the worker from opening a draft at all, so reaching this verdict
means the worker's tooling did it anyway. Clear it here rather than carrying it into step 9.

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

**`CI_FAILING` feeds the existing bounded fixer.** After each new commit,
discard every old CI and readiness receipt and re-verify the new head. Stop only at the
configured bound or a genuine permission, external, or human-only blocker, with the exact decision
required.

**Read what actually failed before fixing anything.** Preserve each failed check's run/check ID,
details URL, workflow, name, status and conclusion. `gh run view <id> --json jobs` names the failed
STEP. A failure at `Set up job` is GitHub infrastructure, not the diff, and the repair is a re-run:
all five reds on #685 were one Actions outage, and every hypothesis about their content was wrong.
Never fix a diff to satisfy a check that never ran.

`CI_PENDING` is its own verdict rather than a pass or a stop. Pass `--wait-ci <seconds>` to let
checks settle; without it the state is reported immediately and the run does not sit on it.

### `NEEDS_DECISION` and `## Assumptions`, read at EVERY worker exit

For Cloud workers, read `materialized.handoff` through the Cloud handoff procedure above before
delivery. Its `needsDecision`, `assumptions` and `manualSteps` replace the local worker log and
not-yet-created PR body as inputs to this step. Missing metadata blocks, even if the diff applied.

The composed prompt forbids a worker from guessing a decision that belongs to Thomas: it commits
what is already safe and ends its output with `NEEDS_DECISION: <question>`. Read the tail of the
worker log for that line on EVERY worker exit, `DELIVERED` included, before diagnosing anything
else. `verify-delivery.mjs` reads git and GitHub artifacts and never the log, so a delivered branch
proves nothing about an unanswered question: a worker can deliver the safe half completely and
still end on the question that scopes the rest. On a failed verdict the line also explains it: a
worker that stopped on a question often leaves `NO_COMMIT` or a partial branch behind, and neither
means the work failed.

- **Attended:** ask Thomas the question, the worker's recommended answer first. Write the answer to
  the ticket with `comment-ticket.mjs`. No delivery yet: recompose the prompt and launch a fresh
  worker, which is a NEW work order carrying the answer, not the banned auto-relaunch of a failed
  prompt. Delivered PR in hand: the answer either confirms the PR complete or becomes fixer work on
  it inside the step 9 bound.
- **`--sleep`:** the question goes to the step 11 decision list, exactly like a
  `NEEDS_CONVERSATION` deferral. A delivered PR carrying an open `NEEDS_DECISION` stays in the run
  record but its ticket is synchronized as In Progress with the decision required, never In Review:
  Thomas wakes to a question instead of a confidently wrong pull request.

**The PR body's `## Assumptions` section is read at the same moment.** The contract makes
assumptions mechanical by definition (a Thomas-owned decision hiding in that list is a
`NEEDS_DECISION` and is treated as one). Attended: put them to Thomas as one batch here, BEFORE the
step 8 and 9 loops run, so an answer that invalidates work becomes ordinary bounded-fixer work and
no receipt has to be revoked after the fact. Under `--sleep`: they go to the step 11 decision list;
being mechanical, they do not block readiness.

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
it opens. It remains outstanding until current-head delivery, green CI with `pullfrog-approval`
included, `behind_by=0`, and ticket synchronization are all recorded for the same head/base pair.

Measured, and the reason this sentence is here: PR #690 (ORB-39) was salvaged by hand, cleaned,
pushed and opened, and then reported as finished. It was carrying two failing
required checks (`Architecture map drift`, and SonarCloud coverage at 61.5% against a floor of 80%)
and one unresolved P2 bot thread. Nobody would have found out until the merge. A pull request that
skipped steps 7, 8 and 9 is not delivered, however it came to exist.

**Never read the worker's own exit code as proof of anything.** Three documented CLI bugs make it
meaningless: openai/codex#20919, openai/codex#19945, anthropics/claude-code#25629. Artifacts are the
only evidence.

`NO_COMMIT`, irreducibly dirty source, permission failures, and human-only decisions stop the ticket.
`CI_PENDING`, `CI_FAILING`, `OUT_OF_DATE`, stale receipts and Pullfrog findings enter
the bounded proactive readiness loop below. Never relaunch the original implementation prompt.

A ticket that fails here and has children stacked behind it takes them with it: their branches were
to be cut from a branch whose work never landed. Say so by name in the report rather than attempting
them against main.

## Step 8. Clear the Pullfrog review

Pullfrog is the only reviewer of an Orbit pull request. It runs in GitHub Actions on both code
repositories and publishes `pullfrog-approval`, a required status check on `main` in each of them.
The verdict therefore reaches readiness through the required contexts `record-readiness.mjs` already
reads, and no receipt of this harness owns it.

**Pullfrog reviews automatically when the pull request opens, and it re-reviews on every push.** The
request comment is therefore redundant on a normal run. `list-bot-threads.mjs` still posts
`@pullfrog review` first, and only when no review of the current head exists yet, which covers a pull
request opened before automatic review existed. Pass `--no-request` to suppress that comment.

Its review instructions live in the Pullfrog console, on the server, and in no file of either
repository. That placement is the point. A pull request may edit any file on its own head, so a
review rubric kept in the tree is a rubric the change under review can rewrite before the review
reads it. The console sits outside every diff.

Read the findings:

```bash
node tools/list-bot-threads.mjs --pr <n> --repo <key>
```

**Never read the thread count as the verdict.** An empty list is ambiguous between "reviewed, found
nothing" and "has not run yet", and a body-level verdict opens no thread at all. The tool derives
the verdict from the review itself for exactly this reason; do not re-derive it by eye.

**A finding reaches you on TWO surfaces: `threads[]` and `reviewBody`.** The tool carries the review
body for every accepted state except `APPROVED`, because a review that did not approve states its
complaint there and no thread has to repeat it. `counts{}` describes threads only, so `REVIEWED`
with zero threads is a clean pull request only when `reviewBody` is null as well. Read a non-null
`reviewBody` and split it exactly like a thread.

**A body finding you FILE rather than fix needs its own transition, and this is the one place the
loop can fail to converge.** It carries no thread id, so `resolve-bot-thread.mjs` cannot answer it.
Filing changes no code, so nothing pushes, so the head never moves and the red
`pullfrog-approval` is never re-adjudicated. Do this instead, and never invent an empty commit to
manufacture a push:

1. Post the disposition as a pull request comment. Name the ticket you filed.
2. Re-adjudicate the same head:

```bash
node tools/list-bot-threads.mjs --pr <n> --repo <key> --re-review --wait-seconds 900
```

`--re-review` posts `@pullfrog review` even though the head is already reviewed, and it accepts
only a review submitted AFTER the one that was present when the run started. That timestamp
comparison is what makes it terminate: without it the run reads back the review it was sent to
replace and reports the finding it just answered.

A body finding you FIX needs none of this. The fix moves the head, and the push re-reviews it.

**Split every unresolved finding two ways, and act on both halves:**

- **FIX it in this pull request** when it breaks behaviour, security or data integrity. Such a
  finding is never closed by a ticket.
- **FILE it as an `orbit-tickets` issue** otherwise, name that issue in the reply, and drop it from
  this run.

**`isOutdated` is not evidence.** It means the code moved under the comment, not that anyone
addressed the comment. Treat that thread like any other.

**Reply to and resolve every thread you FILED rather than fixed.** Here is the reason, stated
inline because a run that skips this leaves a pull request nobody can merge. Pullfrog retires a
thread only when it judges the thread addressed. A filed finding is addressed in the ticket, not in
the diff, so Pullfrog cannot see the answer. A thread you file and leave open therefore keeps
`pullfrog-approval` red forever. Your reply is the only thing that closes it.

```bash
printf 'filed as %s' "$ticket"              | node tools/resolve-bot-thread.mjs --thread PRRT_... --repo <key> --pr <number>
printf 'not applicable because %s' "$why"   | node tools/resolve-bot-thread.mjs --thread PRRT_... --repo <key> --pr <number>
printf 'fixed in %s' "$sha"                 | node tools/resolve-bot-thread.mjs --thread PRRT_... --repo <key> --pr <number>
```

The tool refuses an empty body and never attempts the resolve if the reply failed, so a bare resolve
is impossible rather than merely discouraged. A thread closed with no reason is indistinguishable
from one nobody read, which is the whole defect this step exists to remove.

**Every `--thread` value is COPIED from the `threads[].id` field of the `list-bot-threads.mjs` run
above, in this run.** Never typed, never remembered from an earlier ticket, and never passed with a
`||` fallback that lists fresh when it fails. Measured 2026-08-08: a typed
`PRRT_kwDOR5Siws6XdcAt` did not fail, because node ids are globally unique. It resolved to a live
CodeRabbit thread on a stranger's public repository and posted a reply there under Thomas's account,
then announced itself as `thomasluizon does not have the correct permissions to execute
ResolveReviewThread` and was filed as a transient glitch. Two gates now hold this:
`.claude/hooks/forbid-invented-identifier.mjs` refuses the command, and the tool itself refuses to
write unless the node's own `repository.nameWithOwner` equals what `--repo` resolves to.

**A permissions error on any of these is a WRONG TARGET until proven otherwise.** The tool names the
repository the node actually resolved to. Read that name before you retry anything.

**Resolve FIRST, then push.** Keep that order; it is not a matter of tidiness. The push fires the
incremental re-review. That re-review reads the fixes and the resolved threads together, then posts
one fresh `pullfrog-approval` over both. Push first and the re-review runs while the threads you are
about to resolve are still open, so it reports findings you already answered.

After the push, re-run `node tools/verify-delivery.mjs`. The fix moved the head, so the earlier
`DELIVERED` is stale until this re-runs. `DELIVERED` continues; `STALE_PR` means the push did not
land.

**Count one review fix attempt for each commit you make to answer a Pullfrog pass, and never exceed
the positive `caps.reviewFixAttempts` value from `.claude/orchestrator.json` (currently 3).** A
Pullfrog pass that still blocks after that bound is a named exhausted-fixer blocker, never a clean
handoff.

**Why a bound at all.** PR #672 ran 9 review rounds over 38 hours and produced 19 findings: 19
unique, zero repeats, on a 7,078-line diff. Termination required "the reviewer finds nothing", which
on a diff that size has probability near zero. The bound exists because convergence was never the
terminating condition.

**Size never exempts the review, and it never exempts this step.** A 355-file codemod still gets
read; it gets read AS a codemod. Change the order, never the depth: read the transform or the
generator first, decide whether it is correct in general, then spot-check its output where the
transform is most likely to be wrong (the odd import shape, the one file that was already different,
anything the transform touched twice). A lockfile is the same shape: read the manifest change and
the lockfile's own diff summary, not the thousands of resolved lines.

## Step 9. Final-head readiness loop

Every open pull request gets one mechanical receipt keyed by repository and PR number. Persist at
least: repository key, PR number, base branch, current base SHA, current head SHA; CI settled/green
head; `behind_by`; draft state; ticket status and last synchronization result.

The only READY state is simultaneous truth for one current head/base pair. Run
`record-readiness.mjs` after every artifact update:

```bash
node tools/record-readiness.mjs --repo <key> --pr <n> --delivery <json> --ticket <json>
```

The recorder re-reads the live PR base/head, draft state, the base branch's required status checks
with the newest run of each, the compare `behind_by`, and the live ticket at aggregation time; it
never labels cached artifacts or the delivery artifact's old SHAs as current. `pullfrog-approval` is
one of those required checks, so the review verdict is read here with the rest of CI and needs no
axis of its own. Its explicit stale/blocking verdicts are `DRAFT`, `OUT_OF_DATE`, `CI_STALE` and
`TICKET_STALE`. Any commit, ordinary push, merge from main, or base advancement invalidates receipts
tied to the old head or base. Bare PR numbers are never sufficient run state.

For each existing PR, repeat within the configured `caps.reviewFixAttempts` fixer bound:

1. Read PR draft/head/base state and GitHub compare. If behind, merge current `main` into the branch
   without rebasing or force-pushing, push normally, and invalidate all earlier receipts.
2. Wait for all checks to settle. Preserve exact failed metadata. Rerun only a failure proven from
   its run/job steps to be infrastructure or a flake; send genuine failures through the existing
   fixer. A resulting commit invalidates every head-bound receipt.
3. Clear the Pullfrog review on that head exactly as step 8 says: fix the blocking findings, file
   the rest, reply to and resolve every thread you filed, and only then push. A red
   `pullfrog-approval` is not settled CI, and no bound is cleared by ignoring it.
4. Synchronize the ticket automatically, deduplicating the last posted state: work/PR opened or blocked
   -> In Progress with concise state comment; all technical readiness facts true -> In Review; exact
   permission/external/human-only blocker -> In Progress with the decision required. Never mark Done
   before merge. Size never affects ticket status.
5. Re-record and evaluate. READY ends the loop. A genuine permission, external, or human-only
   blocker, or exhaustion of the bounded fixer budget, produces a precise handoff and keeps
   the PR in the run record. A READY result permits a merge only under the D88/D90 conditions
   in Hard prohibitions; a blocked result never does.

## Step 10. Hand over

Set the actual ticket reference to In Review only from a READY receipt.

**A worker never produces visual evidence.** A fresh worktree has no seeded session, so the attempt
can only ever end at a login page. Measured 2026-08-06 on two tickets
whose code was already committed and correct: ORB-39 started a dev server on :3920, wrote a
Playwright visual test, and was killed at the 45 minute ceiling with a dirty tree; ORB-98 opened
`/login?returnUrl=%2Fpreferences` and burned the rest of its budget. Two worker budgets, two dev
servers left listening, two deliveries a human had to rescue.

Both enforcement points are unconditional. `compose-prompt.mjs` puts the prohibition in every
worker prompt, and `.claude/hooks/forbid-worker-browser.mjs` refuses the command at act time for any
caller carrying the launcher marker or running inside a linked worktree. `/dev-server` is untouched:
it runs from the main checkout, which is Thomas.

Print:

- PR URL, its base branch, and diff size (additions + deletions).
- The `pullfrog-approval` conclusion on the current head, and the head SHA it names.
- Pullfrog findings: `N found, F fixed, R filed, X not applicable, U left open`.
- Every follow-up ticket filed, by identifier.
- **Every manual step, merged from three sources and deduplicated.** (1) The ticket's own sections:
  run `node tools/complete-ticket.mjs --issue "<ticket-ref>" --preflight` and take its `manualSteps`
  verbatim; it writes nothing. (2) The PR body's `## Manual steps` section, which the composed
  prompt requires of the worker whenever its change needs an action outside the repository. (3)
  Your own read of the diff: a new configuration or environment key, a secret, a feature flag, or a
  vendor-console dependency the change introduces that neither the ticket nor the worker named. An
  env var read in the diff with no value set anywhere IS a manual step, whether or not anybody
  wrote it down. Post the merged list to the ticket with `comment-ticket.mjs` so it survives
  scrollback, and print it here. Silence stays the normal answer when all three sources are empty.
- **The PR body's `## Assumptions` section, with each one's adjudication.** The adjudication itself
  happened at the step 7 worker-exit read, before the step 8 and 9 loops ran; this stop only prints
  the outcomes. An assumption first discovered here is a step 7 miss, and it is adjudicated now
  rather than skipped. Under `--sleep`: the assumptions go to the step 11 decision list, so Thomas
  reads them before he merges anything.

**Why a manual step is printed here and not only at merge.** orbit-tickets#81 said "merge, deploy to
Render, then set `PostHog:ApiKey` in the Render env. The code path is inert until the key exists." The
pull request was perfect, review was clean, CI was green, the ticket closed Done on 2026-08-08, and
nothing anywhere in that path ever mentioned the key. The key turned out to be set already (verified
live 2026-08-10: `posthog-dotnet` events since 2026-07-25, nothing lost), so this is a near miss
rather than an incident. The missing thing is not the key, it is any mechanism that knew. Every gate
in this harness measures the PULL REQUEST; that step is not in one, so it has to be carried to the
human at the moments a human is reading. 13 of the 166 open tickets carry a step of the same shape.
And the ticket section is only ONE of the shapes: the equally common one is a worker introducing
the out-of-repo dependency mid-implementation, which no ticket section can know in advance. That is
why the PR body and your own diff read are sources beside the ticket, not decoration on it.

**Then, without `--sleep`: STOP and wait for Thomas to type `continue`.** Nothing polls and nothing
watches; zero tokens burn while it waits. **With `--sleep`: go straight to the next ticket.**

## Step 11. The report

Once the queue is exhausted, print one summary and stop:

- Every pull request opened, with repository, number, current base/head SHAs, advisory diff size,
  behind count and receipt verdict.
- **The stack layout**, so the merge order is stated rather than worked out at 08:00.
- Every ticket skipped, with its reason: a deferral from step 1 or a genuine delivery blocker. For a
  `NEEDS_CONVERSATION` deferral, print its open questions too, so the night ends in a decision list.
- **Every manual step across the whole queue, in one "still outstanding" list**, merged from all
  three step 10 sources. These are Thomas's clicks, not the harness's, and they are the only work
  the merge does not finish.
- **Every open decision, in one list**: each `NEEDS_DECISION` question a worker raised and each
  unadjudicated PR-body assumption, beside the `NEEDS_CONVERSATION` questions, so the night ends in
  a decision list rather than a guess list.
- **Merge evidence for work merged under D88/D90**, plus the remaining PRs needing Thomas.

Append one JSON line per ticket outcome to `<scratchpad>/queue-run.jsonl` as the queue runs, not at
the end. A summary assembled only at the end does not survive a context reset in the middle of the
night.

## Step 12. Teardown

Per worktree, only after `gh pr view <n> --json state` reads `MERGED`:

```bash
node tools/teardown-worktree.mjs --issue "<ticket-ref>" --repo <key>
```

Never tear down an unmerged worktree. The branch and its work are the only copy. In a queue this
runs for merged tickets only, including those merged under D88/D90 standing authority.

## §5.4 Model routing

| Role | Model |
|---|---|
| Orchestrator | Opus 5 @ high, or Sol @ high |
| Implementer | `codex exec` Astra @ high, resolved from `.claude/orchestrator.json` |

The reviewer is absent from this table because this harness launches none. Pullfrog reviews in
GitHub Actions, and its model and effort are set in the Pullfrog console rather than in any file
here. `launch-worker.mjs` resolves one model tier, so a run cannot route a review at all.

## §5.7 The queue

**`--sleep` opens pull requests and may merge under D88/D90 standing authority.** The exact-head
approval, green checks and zero unresolved threads in Hard prohibitions remain mandatory. Use
ordinary squash merge only, never `--admin` or direct merge APIs. Outside that authority, hand off.

**`--sleep` asks everything it can BEFORE it starts.** Step 2b is the whole of it, and it runs in
both modes: plan the queue, read every admitted ticket and its comments, review scope for all
of them, collect every derivable decision, ask them in one batch. Under `--sleep` the run then works
the queue without stopping again; without it, the run also keeps its stop after every pull request.
It cannot ask what only a running worker discovers, and it does not pretend to.

**A failed worker attempt is recorded, but its ticket is not silently skipped.** Preserve its work,
use the step 7 salvage path when the caller-specified workspace test is green, and keep the PR in
the bounded readiness loop until CI with `pullfrog-approval`, base freshness, and the ticket agree
on one head/base pair. The queue may continue independent tickets while a wake source owns that debt. Only
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
action. `launch-worker.mjs` registers itself as a local wake source, and
`submit-cloud-worker.mjs --watch <receiptPath>` does the same for a Cloud task. Starting the next
worker or watcher satisfies the invariant by construction.

**The gate:** `.claude/hooks/require-wake-source.mjs` runs on `Stop` and refuses the stop when the
run record says `--sleep` with tickets remaining and no registered wake source is a live process. So
maintain the record. Write it at step 2b and update it at step 9, in the checkout you are running
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
matches its repository and PR identity, and allows completion only when that receipt reports READY.
It reads disk alone and never calls GitHub: an earlier revision revalidated every ledger row against
live GitHub on every `Stop` of every session, and on 2026-08-09 that alone spent the whole
5,000-point per-user GraphQL budget and stalled all work. Whether a receipt is stale against live
GitHub is `record-readiness.mjs`'s question, answered once at readiness time. This is the
mechanical half of salvage: a pull request opened by hand and never re-verified cannot be reported
as a finished queue even if a fallible session clears the active list.

`sessionId` is what keeps yesterday's record from blocking today: a record whose session does not
match is ignored. When the queue really is done, write `remaining: []`; `pullRequests` may be empty,
but never remove `readinessLedger`. The READY receipts let the hook distinguish completion from a
mistakenly cleared queue, then the run may print the step 11 report.

What the gate can prove is that a registered pid is still alive, which is real evidence rather than a
claim, because only the launcher registers one. What it cannot prove is that the task will re-invoke
THIS session. That part is still yours, which is why the invariant says to name it.

**D89: a redesign queue uses `/orchestrate --cloud --parallel` for UI**, up to
`caps.cloudParallelTasks`, currently **8**. A no-flag single ticket still runs locally; neither flag's
behavior changes. `--cloud` is bound to one repository through `cloud.repositoryKey`, currently `ui`,
so `orbit-api` and `orbit-landing-page` tickets use the small local pool:
**`--parallel` runs up to `caps.parallelTickets`
local tickets at once**, currently **3**, one worktree each.

Size that pool against the serial materialization lane. `materialize-cloud-result.mjs` is serial
across the whole fleet: local test, build, signed commit, push and pull request run on this laptop,
one ticket at a time, with GitHub-calling readiness work capped at 3. Filling all eight cores with local implementers
starves that lane. This cap applies during both attended and `--sleep` runs (D89 supersedes D81).

Measured 2026-09-05: Intel Core Ultra 7 258V, 8 physical and 8 logical cores, 31.5 GB RAM; two live
Codex workers held about 290 MB and about 20 percent of the CPU each.

Drop below the active cap if workers return `KILLED_HARD_CEILING`, or if elapsed delivery time rises
well beyond a smaller fan-out. Those are the signals CPU starvation produces here.

Cloud removes local CPU pressure, not the shared GitHub GraphQL budget.

**It will NOT show up as `KILLED_NO_PROGRESS`.** `launch-worker.mjs` counts process-tree CPU above
1.5% of one core as progress, so a starved worker is still burning CPU and keeps resetting the stall
clock. It runs slower, not quieter, until the unchanged 45 minute `hardCeilingMinutes` wall ends it.
`KILLED_NO_PROGRESS` stays what it was built for: a tree silent across files, logs AND CPU.

Model rate limits are the other ceiling and are not measurable from this file.

Three rules bound it:

- **Never two layers of one stack.** A stack is sequential by construction.
- **Preflight 0b runs once per repo, before any fan-out.** Concurrent `fetch` and `merge --ff-only`
  against one checkout race on `.git/index`.
- **Never more than 3 GitHub-calling children alive at once, across every repo.** The GraphQL
  budget is 5,000 points per USER per hour, shared by ui, api and landing alike. Eight concurrent
  `list-bot-threads.mjs` pollers exhausted it three times in one night (2026-08-09, roughly 90
  minutes lost). Run bot waits and readiness passes at most three at a time; the poller itself
  reads the free REST `rate_limit` before each GraphQL spend and waits out an empty window, but
  that is self-defence, not a licence to fan out.

**`--auto` takes the scope from the board**, ordered by leverage: a ticket that unblocks three others
outranks three easy ones. `plan-queue.mjs --board` computes that ordering from the real `blockedBy`
graph, so it is derived rather than guessed.

**Check this session's own checkout ONCE, up front, before Thomas sleeps.** Step 0b refuses to switch
the repository this session is running from, and most tickets are `repo:ui`, so a session sitting on
the wrong branch loses the entire night. Discover it at the start, not at 03:00.

## Hard prohibitions

- **Standing merge authority belongs to the orchestrator, never an implementation worker.** D88
  authorizes groundwork merges without asking when checks are green, Pullfrog approved the exact
  current head, and zero unresolved threads remain. D90 applies the same terms to screens for the
  remainder of the redesign, suspending the per-screen merge hold. During that period, use only
  ordinary `gh pr merge --squash` against `redesign/main`, with `--match-head-commit <sha>` for the
  head just verified. Log the evidence. Outside that authority, leave the PR ready for Thomas.
  A green check alone is not an exact-head approval.
- **Never `--admin` inside `/orchestrate` or `/sleep`.** Per `CLAUDE.md`, that exception belongs only
  to the canonical `/merge-prs` skill after Thomas explicitly invokes it for an already-approved
  frozen PR set. Standing ordinary merge authority does not invoke that skill. Direct merge APIs
  remain forbidden without exception: no `PUT /repos/{owner}/{repo}/pulls/{number}/merge` and no
  GraphQL `mergePullRequest` mutation.
- Never push to `main`. Never force-push. Never `--no-verify`, never `--no-gpg-sign`.
- The composed prompt is written to the scratchpad, never inside a repo.
- No auto-relaunch on a failed verdict. Stop and report.
- Never edit this skill, a tool under `tools/`, or a CI gate from inside a run. A run that edits the
  contract it is executing describes no consistent system afterwards. Record it, repair it after.
