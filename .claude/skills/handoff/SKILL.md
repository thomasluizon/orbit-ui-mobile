---
name: handoff
description: Carry a long-running effort into a fresh session. Updates the effort's spec file in this repo with everything durable the session established, then writes a short prompt that points at it. Use at the end of a session, when context is running out, or when the user says /handoff, hand this off, continue this in a new session. Pass --sleep to continue unattended in this session instead of handing to a person. It writes a spec and a prompt; it never does the work they describe.
argument-hint: "[--sleep] [extra instructions for the NEXT session]"
effort: high
---

# /handoff

**Input**: `$ARGUMENTS`. Empty means continue what this session was doing. `--sleep` or `/sleep`
anywhere in it means the run continues unattended, in this session, rather than waiting for a person
to paste anything. Anything else is extra work for the NEXT session. You never do that work now.

Two outputs, both committed files in this repo:

| file | what it is |
|---|---|
| `.claude/specs/<slug>.md` | the effort's living spec. One per effort. Survives every session. |
| `.claude/handoffs/NEXT.md` | the prompt for the next session. **Exactly one, always at this path.** |

## `/handoff` ENDS the session. Nothing more gets done in it.

Thomas, 2026-09-16: "after i run /handoff, the session is FINISHED, you cant continue working,
anything i ask, you put on the handoff prompt, not now."

The moment he runs `/handoff`, this session's working life is over. It writes the two files, commits
them, replies with the one line, and stops.

**Everything he asks for from that point goes into `NEXT.md`, not into the tree.** A new request
after `/handoff` is not a reason to reopen the session; it is more scope for the next one. Add it to
the prompt and say that is where it went.

That covers every shape of request: a one-line fix, a question about a ticket, a review round, a
merge, a "quick" anything. There is no size below which it is fine to just do it. The whole point of
the rule is that a handed-off session has already written down what it knows, and work done after
that is work the next session cannot see.

**The ONE exception**, and it has to be explicit: he says to do something now AND then hand off, in
so many words. "Do this now, then /handoff." Anything less direct is not the exception. If you are
weighing whether a message qualifies, it does not.

Under `--sleep` this reads differently: the run continues in this session by design, and the section
at the end of this file says how. The rule above is about an ATTENDED handoff, where a person is
going to open `NEXT.md` later.

**The prompt path never changes.** Thomas, 2026-09-15: "i want one handoff, always, just combine
both in one ... you need to put always in the same place, in a way that i can just ctrl + click and
open the file." Overwrite `NEXT.md` every time. Git history keeps every earlier version, so nothing
is lost by overwriting and he never has to pick between two files or read a timestamp to find the
current one.

A timestamped name is forbidden. So is a second prompt file.

## The spec is the memory; the prompt is the instruction

An effort that spans weeks cannot live in prompts. Each rewrite loses what the last one did not
think to repeat, which is how a rule set in week one disappears by week four.

So the spec holds everything durable and the prompt holds only what to do next. When they disagree
about where something goes, it goes in the spec.

## One spec per effort, ONE prompt for all of them

A session that opened from a handoff already has a spec; its path is in the opening prompt. Read the
first user message and use that one.

Otherwise match by scope, not by feel: a spec covers this work if the files you changed and the
tickets you touched fall inside the scope it names. Create a new spec only when none does.

**A session that moved more than one effort updates each effort's SPEC separately**, because folding
unrelated progress into whichever spec you happened to open loses it for the effort that owns it.

**But it writes exactly ONE prompt**, `NEXT.md`, covering every live effort. It opens by naming each
spec to read, states the goal for each, and says plainly which effort outranks the other when they
compete for the machine. Two prompt files is the failure Thomas named on 2026-09-15.

## What belongs in the spec

Write it for someone who was not here. Update in place: correct what changed, delete what is done,
keep what still binds.

- **What this effort is**, in one paragraph, in product terms.
- **How the work runs**: the entry point skill, who writes code, and a pointer to the rule file that
  carries the rest.
- **Standing instructions the user has given**, in his words, with the date.
- **Decisions**, each with its reasoning and a pointer to its ADR if one exists.
- **The brain notes this effort runs on**, named by their exact vault path, as a block the reader is
  told to open BEFORE acting, and told to open **through the Obsidian MCP**:
  `mcp__obsidian__obsidian_list_notes`, `mcp__obsidian__obsidian_get_note`, and
  `mcp__obsidian__obsidian_search_notes` when the idea is known but the filename is not. Say that in
  the spec, because `cat` and `ls` miss the frontmatter, tags and backlinks that record which
  decision superseded which. Orbit engineering ADRs are under
  `2 Areas/20-29 Orbit Engineering/Decisions/`.
  A filename is a lead to verify: list the directory through the MCP and copy the names that come
  back, never the names you remember.
  If this effort genuinely has no note, write "no brain note yet" and say what would earn one. An
  absent block reads as "there is nothing to read", and that is the failure this bullet prevents.
- **Constraints** that are not obvious from the code: what the API cannot do, what a gate enforces,
  what is blocked and on what.
- **State**: what is built, what is half built and what is missing from it, what is open.
- **Open questions**, each with who has to answer it and what it blocks.

These seven are a floor. Add a section when something durable has no home in them, and say in it why
it is durable. Never delete a section you did not understand.

Do not restate what a skill, a rule file or `CLAUDE.md` already says. Point at it.

### Keep the standing instructions from rotting

That section is the one that decays, and it is the one he notices.

Every run, read each existing instruction against everything he has said since. Mark one superseded
with a pointer to what replaced it rather than deleting it silently, and fold two into one when the
later narrows the earlier. An instruction nobody has contradicted stays, however old.

### The spec is shared state

Another session may be editing it. Re-read the file from disk immediately before you write, and
diff it against what you read at the start of this run. If it changed, MERGE rather than overwrite:
a plain markdown write has no union-forward, so an overwrite silently drops whatever the other
session just added.

That re-read narrows the race but does not close it: a write can land between your check and yours.
Let git be the compare-and-swap rather than trusting the check.

- Commit the spec, then PUSH. A rejected push means someone else got there first.
- On rejection, never force and never `--ours`. Pull, merge the two versions by hand so both sets of
  additions survive, and push again. Repeat until it lands.
- After it lands, re-read the committed file and confirm BOTH your additions and theirs are in it.
  A clean merge that dropped a section is still a loss.

The same rule covers the prompt. Its unique name usually avoids the collision, but if a conflict
does arise on either file, keep both sides: another session's prompt carries an inventory and next
steps that exist nowhere else, and resolving in your own favour deletes them.

## Re-derive before you write

Everything you carry gets checked in the same run that writes it. Your own recall is a draft.

Open every ticket, ADR, document and branch the spec cites. Read `git log` and the open pull
requests rather than remembering them. Correct a stale source, or say it is stale and how.

That includes the brain notes. List the vault's `Decisions/` directory through
`mcp__obsidian__obsidian_list_notes` and confirm every filename the spec names still exists, because
a note gets renamed when its decision is superseded, and a pointer to a file that is gone sends the
next session looking for reasoning it will never find.

The failure this prevents: a 2026-08-22 handoff carried six confident facts and every one was wrong
by the time it was read. The checks that feel most redundant after a long session are the ones that
catch this.

Where checking a fact is slow, write the command instead of the answer.

## Inventory everything in flight

Run each of these commands and put its RESULT in the prompt, **including when the result is empty**.
"Checked, none" and "never checked" look identical otherwise, which is how an item goes missing.

Run them in EVERY repository the effort touches, not just the one you are standing in: a sibling
checkout, a submodule, anywhere a change had to land for this work to function. Cross-repo work is
the easiest to lose, because the repo you are in looks finished.

| what | how you find it | why it hides |
|---|---|---|
| open pull requests | `gh pr list` | ones this session never touched are the ones that sit for days |
| open tickets this effort owns | `gh issue list` | a ticket the spec does not cite is exactly the one that goes missing |
| uncommitted work, merges in progress | `git status` per worktree | |
| unpushed commits | `git log @{u}..` per branch | a CLEAN worktree can hold finished work that exists only on this machine |
| branches with no pull request | compare branches against `gh pr list` | |
| commits on a detached HEAD | `git worktree list`, then `git log` where HEAD is detached | reachable from no branch and no remote, so they are garbage collected and gone |
| stashes | `git stash list` | a stash leaves the worktree clean, so nothing else here reveals it |
| work under ignored paths | `git status --ignored` and this session's scratchpad | a gitignored file crosses no boundary at all. A decision log, a generated map, a run state file or anything else there is gone the moment the session ends. Copy what is durable into the spec, or commit it |
| running workers | the harness's own worker list | its result arrives after you hand over and lands nowhere durable |

Every item leaves with a disposition: drive it, merge it, close it, or explicitly leave it and why.
An item listed without one is not handed over.

For a running worker, record the worktree, the branch and the log path, say what it was sent to do,
and say the outcome is unknown. The next session reads those worktrees first, because a finished
worker leaves commits, a dirty tree, or nothing, and each means something different.

Say which pull requests are approved and which only carry comments: an unapproved one needs its
findings cleared before it can merge, and that is work the next session has to plan for.

When a list is long, the prompt carries what is next and the spec's state section carries the rest,
with the count and the query that reproduces it. Summarising is allowed; omitting a category is not.

## What belongs in the prompt

Short. It points at the spec and says what to do next.

1. The spec path, first line, as the thing to read before anything else.
2. The entry point, singular: the one skill the next session works through.
3. **The goal: finish that spec.** Say it in one line, with the condition that proves it done and the
   query that lists what is left. Never scope the goal to the open pull requests or to whatever this
   session was mid-way through.
4. The in-flight inventory, one row per item with its disposition.
5. What to do, in the order it has to happen.
6. `$ARGUMENTS`, if any, as its own section.
7. One line: every identifier here came from a previous session, treat each as a lead to verify.

**Always name the entry point. Never restate what it does.** A session that does not know its entry
point starts by inventing its own way of working. Naming `/orchestrate` carries everything it does:
its review loop, its merge bar, its worker contract, who writes code. Repeating any of that is the
bloat that pushes out the delta only this session has. Cutting the restatement and the pointer
together is the failure mode; keep the pointer.

Under `--sleep` the entry point is the sleep skill, and it is the only one. It invokes the work
skill itself, so the prompt must not present the two as siblings.

## The goal is always the same: finish the spec

**Every run ends when its spec is done, and at no other point.** This is not a `--sleep` rule and it
is not about any one effort. A session working a spec is not finished while that spec has work left.

Thomas, 2026-09-14: "ANY RUN ends only when the original spec is done ... anytime i run /handoff, the
handoff needs to list a clear goal: finish the original spec. if its not done, then your work is not
done, and if it means fixing blockers, taking decisions, whathever it takes, you will do it, until
the spec is finished with the best approach possible."

So every prompt this skill writes states ONE goal, and it is finishing that spec. Not the open pull
requests, not the tickets this session happened to touch. Give it the termination condition in the
spec's own terms, and the query that re-derives what is left, so the next session never has to trust
your list:

    gh issue list --repo <ticket repo> --state open --label <the effort's label> --limit 200

**A blocker is not an ending. A blocker is the next piece of work.** "theres no blocker impossible of
being fixed by you, you create the blockers, you fix them, always doing the best approach."

- Waiting on CI or a review is waiting, not blocking. Start the next thing while it runs.
- A stacked branch is not blocked; its parent is the work.
- A finding too large for the pull request it appeared in becomes its own ticket AND that ticket gets
  picked up. Filing it is not a disposition.
- A missing capability is built. A missing branch, gate, tier, harness or tool is created, not
  reported.
- A decision nobody has taken is taken, with the best approach, and written down.
- A recorded blocker in a readiness ledger is a TODO, not a finish line.

The only honest ending short of a finished spec is EXTERNAL: the model allowance is exhausted, the
machine stops, or Thomas says stop. Those are not decisions the run makes. Say which one it was, and
never report it as the work being finished.

A prompt that permits a session to stop with its spec unfinished is a defective prompt. Check yours
against that before you commit it.

## Hand over

**Both files belong on the effort's integration branch**, the one every branch in the effort merges
into, not on whatever happens to be checked out. Otherwise they land on a feature branch that gets
squashed away, and a session opening anywhere else finds neither path. If the current branch is not
that one, write and commit them in the main checkout with the integration branch checked out.

**Always commit both files, by path, in their own commit**, whatever else is in the tree:
`git commit -- .claude/specs/<slug>.md .claude/handoffs/NEXT.md`. A pathspec commit takes only
those two, so unrelated work is untouched and nothing has to be stashed. Push if the branch has a
remote. If a hook rejects the commit, fix what it names and commit again; never bypass it and never
leave the files uncommitted.

Leaving them staged hands nothing over. A staged file lives in one worktree's index, so a session
opening elsewhere never sees it, and any reset destroys the whole handoff.

Then reply with one line: `.claude/handoffs/NEXT.md` and the branch it is on. If the tree still holds
unrelated uncommitted work, that fact belongs in the same line, because he is about to act on the
handoff and needs to know his tree is not clean. Nothing else, before or after.

### Under `--sleep`, do not stop there

`--sleep` means nobody is going to open that file. If this run ends after writing it, the night ends
silently and what it leaves behind looks exactly like a finished run, so nobody goes looking.

So after committing, continue in THIS session: read and execute `.claude/skills/sleep/SKILL.md`,
including writing run state under this session's own id and leaving a live wake source before the
turn ends. The files are the durable record; the sleep skill is what keeps the work moving.

## What this skill never does

The work. No code, no tickets, no board writes, and nothing `$ARGUMENTS` describes. If the session
left something half done, the spec records it and the prompt assigns it.

And after it runs, neither does the session. See the second section of this file: an attended
`/handoff` is the end. Whatever he asks next goes into `NEXT.md`.
