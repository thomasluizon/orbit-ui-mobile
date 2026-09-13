---
name: progress
description: Answer "where is the redesign" in product terms: what a person can now do in Orbit, what is half built, and what Thomas has to decide. Reads live state, never a remembered summary. Use when he asks for a progress update, how the redesign is going, or says /progress.
argument-hint: [optional area, for example "calendar" or "perfil"]
effort: medium
---

# Progress

**At a glance:** Thomas asks what the product does now. Answer in screens and behaviours. A ticket
number, a pull request number or a commit SHA belongs in this answer only when he asks which one.

## What he is asking

"Is the calendar redesigned yet." "Can someone see their Google events." "What is left."

He is not asking which tickets closed. Numbers are how the work is tracked, not what it is.

## Read live state first

Never answer from memory or from `hot.md`. Both go stale within a day.

1. `git fetch origin redesign/main`, then read `git log --oneline origin/main..origin/redesign/main`.
2. `gh pr list --repo thomasluizon/orbit-ui-mobile --state open` for what is mid flight.
3. For a screen you are unsure about, read its ticket body for the stage list and compare against
   the merged commits.

A stage that merged is shipped to `redesign/main`. Nothing on that branch reaches a real person
until the redesign ships, so say "built" rather than "live".

## The screens, and what each one means to a person

| ticket | say this |
|---|---|
| #56 | the calendar: month, week, range and agenda views, logging the last seven days, Google events beside habits, and the sync boundary |
| #63 | Wrapped, the year in review, and its share card |
| #67 | onboarding, the tour, and the feature guide |
| #71 | Perfil: your account, preferences, theme, Astra settings, API keys, sign out and delete |
| #73 | About, privacy, terms, and the support form |
| #76 | the Android home screen widget |
| #329 | Progresso, the screen that answers "am I moving" |

Name the behaviour, not the stage. "The calendar has its month, week and range views and logs the
last seven days" beats "stages 1 to 9 merged".

## Shape of the answer

Three things, in this order:

1. What a person can do now that they could not before.
2. What is half built, and what is missing from it.
3. What is waiting on Thomas, phrased as the decision, not the ticket.

Keep it under his writing contract: 12 lines, 200 words. If that will not fit, you are including
detail he did not ask for.

## Be honest about half done

A screen with six of nine stages built is not "nearly done", it is missing three behaviours. Name
them. A screen blocked on an `orbit-api` capability is blocked, not in progress.

If a defect shipped and was caught, say what it would have done to someone: "a second tap could
undo the first write" tells him more than "fixed a data-loss bug".

## When he names an area

`/progress calendar` answers for that screen only, in the same three parts, with room for one more
sentence of detail.
