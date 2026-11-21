---
name: ticket
description: Turn anything that needs work into 1 to N executable GitHub tickets after one approval gate. Use for a bug, an idea, a chore, a feature or a list of problems. It writes no code. The delivery driver picks the tickets up.
argument-hint: <a bug, an idea, a chore, a feature, or a list of problems>
effort: high
---

# /ticket: anything in, 1 to N tickets out

Anything goes in. One to N tickets come out. There is one approval gate: show the split, the reason for each split, and each body. Create the tickets after the owner says yes.

An owner order gets a ticket in the session in which it arrives.

This skill writes no code, no branch and no worktree.

## The ticket is the order

A headless worker receives the ticket as its order. The worker cannot read this session. Write the ticket so that it stands alone:

- Quote the owner's words with their dates.
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

For a defect, put a red-capable command first in Test scenarios. For other work, write no red case that does not exist.

## Labels

- Exactly one of `repo:ui`, `repo:api` or `repo:landing`.
- Exactly one type: `Bug`, `Feature` or `Improvement`.
- A ui ticket carries `parity:yes` or `parity:no`, with its reason in the body.
- `owner-work` when the owner's own session must run the ticket: Chrome, the Keychain, the release tools or the owner's hands.
- `deploy-first:<environment>/<task>` on a blocker whose deployment a later ticket needs.
- `needs:owner` when a store or production check must pass first.

## Size

One ticket is one repository. It ships as one or more pull requests. Each pull request is independently mergeable and holds one behaviour. Each pull request `Tracks` the ticket. The last one says `Remaining: none`.

Cross-repository work is an api ticket that blocks a ui ticket.

## Parts

Write the work of a large ticket as numbered comments, "Part n of m". Each part is one behaviour. Each part is small enough for one Sonnet order under the 45 minute ceiling. That is about 300 to 1,500 changed lines. A pure deletion part can be larger.

Each part names its files, its cascade edits and its checks. Add a `Paths:` line when the part can run beside other parts. Add `Kind: find` for a read-only find part.

## Commands

- Create: `node tools/create-ticket.mjs --title "<t>" --body-file <file> --label "<label>" [--label ...] [--blocked-by "#<N>"]`
- Add a part: `gh issue comment <N> --repo thomasluizon/orbit-tickets --body-file <file>`
- Fix a body: `gh issue edit <N> --repo thomasluizon/orbit-tickets --body-file <file>`

Copy every issue number from this run's output. Read the milestones live with `gh api 'repos/thomasluizon/orbit-tickets/milestones?state=all&per_page=100' --paginate --jq '.[].title'`. Never create a milestone named `Backlog`.
