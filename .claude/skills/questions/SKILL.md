---
name: questions
description: Answer every held decision of the board. It answers and decides what it can, then asks the owner only what is really his, with a recommendation. /questions --auto asks nothing. Use on /questions, when a run is blocked on a decision, or before you ask the owner anything.
argument-hint: "[--auto]"
effort: high
---

# /questions

Most questions are not the owner's. Answer them yourself. Ask him only what is left, all at once, with a recommendation on each.

## 1. List every candidate first, in writing

Read the sources, never your memory of them:

1. Every open `needs:owner` ticket: `gh issue list --repo thomasluizon/orbit-tickets --label needs:owner --state open --json number,title`.
2. Every held pull request in `thomasluizon/orbit-ui-mobile`, `thomasluizon/orbit-api` and `thomasluizon/orbit-landing-page`. Read them with `gh pr list --repo <repository> --state open --limit 100 --json number,title,body,labels,comments`. A pull request is held when it has the `needs:owner` label. A pull request with no open ticket gets no label: it is held when its newest `<!-- orbit-drive:needs-owner -->` comment has no later `<!-- orbit-drive:owner-answer -->` comment from the repository owner.
3. For each item, the newest `orbit-drive:needs-owner` comment (the question), the ticket body and every comment after it. With no open ticket, read the pull request body and its comments.
4. Each comment marked `<!-- orbit-drive:owner-question -->` or `<!-- owner-review -->` that has no owner answer after it. An `owner-review` item asks him to confirm or change a decision taken while he slept; when he changes it, write the new decision into the ticket body as in section 4.
5. Each open question of this session.

A question you never wrote down cannot be answered. It blocks the driver and nobody knows.

## 2. Give every candidate one disposition

- **answered**: the answer, plus where it came from (a file and line, a ticket comment, a decision note, a primary source).
- **decided**: the decision you made, plus the reason.
- **asked**: it went to the owner (manual mode), or it was queued for him (`--auto` with sleep off).

"I could probably work this out" is not a disposition. Produce the answer now, or ask.

## 3. The filter, in order

Stop at the first step that resolves the question.

0. **Does the open step need the owner's hands?** Read the open step in the ticket, the `needs-owner` comment and the `Remaining:` line. The steps that need his hands are the list in section 6. An item whose open step needs none of them is not his. Remove `needs:owner` from the ticket and from its open pull requests. Write the next step for the worker under `## Owner decisions`, (step 1 of section 4). Keep `needs:owner` only for the step that needs his hands. For an item that waits on another ticket, replace the label with a `--blocked-by` link.
1. **Is it already answered?** Read the code, the contract type, the API source in the sibling repository, the ticket body and its comments, `DESIGN.md`, `BRAND.md`, and the decisions in `/brain`. For how to build or fix something, search the web every time: the current official docs, the version installed in the repository and the newest stable one. Memory is not a source. Put the sources in the text of section 4.
2. **Is it "simpler or more correct"?** The answer is the correct one, always, whatever it costs. Say the cost in one line.
3. **Is it an engineering call?** Naming, structure, which layer owns something, how to test it, which allowed parity adapter applies: decide it now. A question about what a screen shows is yours too when one answer is clearly better.

The proof rule applies to every answer, every objection and every held decision:

- Ask the question "which real product already solved this, and with what?" and write the links.
- The candidate set holds the precedent's approach and the ready tool.
- The number on the real target decides. "Defer until a profile shows a cost" is not allowed.
- An objection counts only with a precedent link or a measured number. Without one, it falls, and the loop ends.

An item held only on an objection with no link and no number is not held. Decide it with the proven best way.

What is left is really his: product, copy, pricing, positioning, brand, design direction, and a choice where two answers are both defensible and only he knows which one he wants.

## 4. Record each answer and decision

1. Write the answer or the decision into the body of the ticket: the answer or the decision, the reason, and the exact next step for the worker. Put it under an `## Owner decisions` section, and add one line there for each new answer. Read the body with `gh issue view <number> --repo thomasluizon/orbit-tickets --json body`. Write it back with `gh issue edit <number> --repo thomasluizon/orbit-tickets --body-file <file>`. Every order carries the ticket body, so the next launch of every kind reads the answer. A comment alone reaches no worker. Then write the same text to a file and record it with `node tools/update-ticket.mjs note --decision --ticket <number> --body-file <file>`.
2. Comment `<!-- orbit-drive:owner-answer -->` and one line that names the decision on the ticket. Write it after the body edit. The driver counts the build and find launches of the ticket only after this comment, so a spent order gets new launches.
3. Remove `needs:owner` from the ticket and from its open pull request.
4. A pull request with no open ticket has no ticket body. Comment the answer or the decision on the pull request in place of steps 1 and 2. When the decision lets the driver merge it at the bar, start the comment with `<!-- orbit-drive:owner-answer -->`. That marker ends the hold. When the decision keeps the pull request on hold, write no marker.
5. A decision that outlives the ticket also goes to the brain with `/brain`.

## 5. What survives

**Manual mode** (`/questions`, typed by the owner):

- Ask with `AskUserQuestion`, at most 4 questions in a call, in rounds ordered by how much work each unblocks. Say how many rounds are left.
- Each question states the decision in product terms, what goes wrong if nobody decides, a recommendation first marked `(Recommended)`, and 2 to 4 real options.
- Record each answer as in section 4.

**`--auto` mode** (the driver, or `/sleep`) never calls `AskUserQuestion`. Read the sleep state: `cat "$(git rev-parse --git-common-dir)/orbit-drive/sleep.json"`. For a pull request with no open ticket, post each comment below on the pull request.

- Sleep on: decide each survivor with your recommendation and write it into the ticket body as in section 4, so the work goes on. Then comment it on the ticket, after the `<!-- orbit-drive:owner-answer -->` comment. Start that comment with `<!-- owner-review -->` and "Decided while the owner slept:". His next `/questions` asks him each one, so he confirms or changes it.
- Sleep off: comment the question, its options and your recommendation on the ticket, starting with `<!-- orbit-drive:owner-question -->`. The driver reads only this marker form as a kind. Keep `needs:owner`. His next `/questions` asks it.

## 6. Then the manual steps only he can do

After the questions, list each action the run cannot do. A step is his only when it needs his password, a 2FA prompt, a payment, a legal identity choice, a device in his hands, or a permission only his account can grant. Any step an installed tool (CLI, API, MCP server, the browser through `claude-in-chrome`) can do is the run's work: do it. Give each of his steps as one numbered action: where, what to enter, how he knows it worked, and what it unblocks.

## Report

End with one line: how many items were answered, decided, asked and queued, and how many items the driver can now take back.
