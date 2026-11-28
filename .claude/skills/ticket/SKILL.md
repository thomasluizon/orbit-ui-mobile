---
name: ticket
description: Turn anything, from a rough idea to a bug, into the best way to build it and 1 to N executable tickets, after one approval gate. Use for a new idea, a brainstorm, a feature, a bug, a chore or a list of problems. It researches, writes no code, and the driver builds the tickets. /ticket --auto --parked is the run of the driver that re-plans parked items, with no gate.
argument-hint: "<a bug, an idea, a chore, a feature, or a list of problems> | --auto --parked"
effort: high
---

# /ticket: anything in, 1 to N tickets out

Anything goes in, from a rough idea to an exact bug. One to N tickets come out. The tickets are the spec: no other spec file exists. There is one approval gate: show the best way, the split, the reason for each split, and each body. Create the tickets after the owner says yes.

## Before the split: find the best way

Do this for every ticket, of every type. A bug is included. The owner asks for the best approach, proven, for any request.

1. Name the real problem in one sentence. When it differs from the ask, say both.
2. Read everything the answer touches, in full: the code in all three repositories, `DESIGN.md`, `BRAND.md`, `FEATURES.md`, the decisions in `/brain`, and the open tickets near it. Write the list of what you read.
3. Search the web before any design, every time. Memory is not a source. Use web research subagents, one per question, each on live primary sources:
   - how the current official documentation says to build this, and how strong teams build it now;
   - the version installed in each repository (read `package.json`, the lock files and the `.csproj` files) and the newest stable version, with the changes between them that matter here;
   - every outside fact the design leans on: a vendor limit, a price, an API field, a platform rule.
   Record each source with its link, its date and the version it covers.
   Ask this concrete question: "which real product already solved this, and with what?" Write the links. Each precedent is a real product, what it uses for this exact problem, and a link to a primary source.
4. Write 3 to 5 candidates from that research. The candidate set holds the precedent's approach and the ready tool (a library, a service or a platform feature that already does the job). One removes something instead of adding. One is "do nothing". Score each on what it costs to live with: upkeep, size, parity on web and mobile, contract changes, risk to old mobile clients. The cost to build decides nothing.
5. Set the `Measure:` line before you score. Name what you measure, the target value, and where, on the real target: the device class, production data or the real API. A proxy decides nothing. A Node script, a laptop, a mock and a desktop browser for a phone cost are proxies. Run the measure when it is cheap. Write `Measure: none: <reason>` only when nothing can be measured.
6. Pick the simplest candidate that fully solves the problem: the fewest files, layers, dependencies and settings. Prefer what the platform or an installed library already does over new code. Then cut the winner until nothing more can go. The number on the real target decides.
7. At the gate, show: the problem, the recommendation, one line on why each other candidate lost, the cost, the fact that would make it wrong, and the sources. The tickets follow, and each one carries its sources, links and versions in Technical details, so the worker builds on them and not on memory.

The proven-best rule has four points. Every skill, order and rule file states them in the same words:

- Ask the question "which real product already solved this, and with what?" and write the links.
- The candidate set holds the precedent's approach and the ready tool.
- The number on the real target decides. "Defer until a profile shows a cost" is not allowed.
- An objection counts only with a precedent link or a measured number. Without one, it falls, and the loop ends.

Ask the owner only what reading cannot answer: product, copy, pricing, brand or a real toss-up. Ask it with a recommendation, at the gate.

An owner order gets a ticket in the session in which it arrives.

This skill writes no code, no branch and no worktree.

## The ticket is the order

A headless worker receives the ticket as its order. The worker cannot read this session. Write the ticket so that it stands alone:

- Quote the owner's words with their dates, and write each override he gave into the body.
- Deliver his whole scope: list every item of his order and map each item to a ticket or a part. An item with no ticket is lost.
- Name the exact files, rules, numbers, commands and checks.
- Write plain English with short sentences. Use no dash as punctuation.

## Body sections

1. Problem and why
2. Scope
3. Out of scope
4. Expected behaviour
5. Technical details
6. Affected files
7. Acceptance criteria
8. Test scenarios
9. Rollout or Events, where risk or measurement exists
10. `## Best approach`, in every ticket
11. `## Every place`, in every ticket

`## Best approach` holds these lines:

- One or more `Precedent: <product>: <what it uses for this problem>: https://<primary source>` lines. When no product exists, write `Precedent: none: <the searches that found no product>`.
- One `Measure: <what is measured>, <target value>, <where, on the real target>` line, or `Measure: none: <reason>`.
- One `Rejected: <candidate>: <the precedent, the source or the number that rejected it>` line for each losing candidate.

`## Every place` holds the search command that finds the same pattern in every repository, then one list item for each hit with its path. Each hit is in scope, or it has a written reason.

The last pull request of a ticket whose `Measure:` is not `none` carries a `Measured: <value> on <where>` line.

A `Bug` ticket carries a `Class: <name>` line and a `## Permanent fix` section. The section names the code that holds the class (a path under `eslint-rules/`, a primitive file or a test file), or reads `none: <reason>`. A repeat of a class names the code of the earlier ticket.

For a defect, run a red-capable command at least once before the ticket exists, and put it first in Test scenarios. For other work, write no red case that does not exist.

## Labels

- Exactly one of `repo:ui`, `repo:api` or `repo:landing`.
- Exactly one type: `Bug`, `Feature` or `Improvement`.
- A ui ticket carries `parity:yes` or `parity:no`, with its reason in the body.
- `owner-work` when the owner's own session must run the ticket: Chrome, the Keychain, the release tools or the owner's hands.
- `deploy-first:<environment>/<task>` on a blocker whose deployment a later ticket needs.
- `needs:owner` when a store or production check must pass first.

## Split, name and link

1. Search the board first: `gh issue list --repo thomasluizon/orbit-tickets --state all --search "<key words>"`. When an open ticket owns the same area, add a part or a comment to it instead of a new ticket.
2. Split by repository and by root cause, never by symptom. One root cause with three symptoms is one ticket. Two root causes behind one symptom are two tickets.
3. Title each ticket with what a person can do or see when it is done, in plain words, under 100 characters, with no ticket number and no code name. Example: "Open Orbit on Android past the launch screen every time".
4. Set every real dependency with `--blocked-by`: the api ticket that a ui ticket needs, a ticket whose change this one builds on, and the open launch ticket for work that launch does not need. Before launch, only these run: a live defect in sign-in, habits, the AI or app start, a store or launch need, and what an owner order puts first.
5. A goal that spans several tickets gets one umbrella ticket, blocked by each step ticket. Each step title ends with "(step <n> of #<umbrella>)".
6. Paired tickets name each other in Technical details.

## Size

One ticket is one repository. It ships as one or more pull requests. Each pull request is independently mergeable and holds one behaviour. Each pull request `Tracks` the ticket. The last one says `Remaining: none`.

Cross-repository work is an api ticket that blocks a ui ticket.

## Parts

Write the work of a large ticket as numbered comments. The first line of each is exactly `## Part n of m: <title>`, with no ticket number before `Part`, or the driver reads no part. Each part is one behaviour. Each part is small enough for one Sonnet order under the 45 minute ceiling. That is about 300 to 1,500 changed lines. A pure deletion part can be larger.

Each part names its files, its cascade edits and its checks. Add a `Paths:` line when the part can run beside other parts. Add `Kind: find` for a read-only find part.

## Commands

- Create: `node tools/create-ticket.mjs --title "<t>" --body-file <file> --label "<label>" [--label ...] [--blocked-by "#<N>"]`
- Add a part: `gh issue comment <N> --repo thomasluizon/orbit-tickets --body-file <file>`
- Fix a body: `gh issue edit <N> --repo thomasluizon/orbit-tickets --body-file <file>`

Copy every issue number from this run's output. Read the milestones live with `gh api 'repos/thomasluizon/orbit-tickets/milestones?state=all&per_page=100' --paginate --jq '.[].title'`. Never create a milestone named `Backlog`.

## --auto --parked

The driver starts this run by itself, at most once in 24 hours, while an open item carries `parked`. This run asks nothing and has no approval gate. Decide each open choice with your recommendation. Write no code. Send no notification. This run has no subagent tool, so do the web search yourself.

List each open item that carries `parked`:

- Tickets: `gh issue list --repo thomasluizon/orbit-tickets --label parked --state open --json number,title`.
- Pull requests: `gh pr list --repo <repository> --label parked --state open --json number,title,body,headRefName`. Run it for `thomasluizon/orbit-ui-mobile`, `thomasluizon/orbit-api` and `thomasluizon/orbit-landing-page`.

Do these steps for each item. A pull request belongs to the ticket that its `Tracks` line names.

1. Read the item: `gh issue view <number> --repo thomasluizon/orbit-tickets --json body,comments,labels`. Read the `parked` comment, each `replan` comment and each `launch` record. The `parked` comment lists each pull request that the park closed, with its branch. The remote branches stay, so reuse their work in the new plan.
2. Read the failure history. The `log` field of a launch record names its files: `<log>.facts.json` and `<log>.log`. They are in `orbit-drive/logs`, in the directory that `git rev-parse --path-format=absolute --git-common-dir` prints. The last `result` line of a log holds the answer of the worker.
3. Find the cause and the best way. Use the research rules of "Before the split: find the best way".
4. Re-plan the item in one of these ways:
   - Write a new body: `gh issue edit <number> --repo thomasluizon/orbit-tickets --body-file <file>`. Keep the `## Owner decisions` section.
   - Post a new part set as plain comments. Make the total higher than each earlier total on the ticket. Keep each merged part and each part with a good open pull request, with its number and title.
   - Create new tickets with `node tools/create-ticket.mjs` and `--blocked-by`. Then close the old ticket: `gh issue close <number> --repo thomasluizon/orbit-tickets --comment "<the numbers of the new tickets>"`.
5. Close each open pull request of a plan that you replace. The park already closed the pull requests that its `parked` comment lists: `gh pr close <number> --repo <repository> --comment "<reason>"`. The driver builds the new plan on a new branch from `main`.
6. For a parked pull request with no open ticket, close it, add its `Tracks` line, or create the ticket that it needs.
7. Add `needs:owner` only for a step that needs the owner's hands, as section 6 of `.claude/skills/questions/SKILL.md` lists them. Write one comment that starts with `<!-- orbit-drive:needs-owner -->`. Name that step, where the owner does it, and what it unblocks. A pull request with no open ticket gets the comment and no label.
8. Remove `parked` last, because the driver can start the new plan at once. First run `gh pr edit <number> --repo <repository> --remove-label parked` for each pull request. Then run `gh issue edit <number> --repo thomasluizon/orbit-tickets --remove-label parked`.

End with one line for each item: what changed.
