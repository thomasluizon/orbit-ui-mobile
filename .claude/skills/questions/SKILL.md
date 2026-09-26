---
name: questions
description: Filter every question you were about to ask the owner, answer the ones you can, and put only what survives to him through AskUserQuestion with a recommendation. Use before asking him anything, when a run is blocked on a decision, or when he says /questions.
argument-hint: [optional scope, for example "the redesign" or "ticket 67"]
effort: high
---

# Questions

Write decisions in tracked specs as current rules without dates, attributed quotes or session IDs.
Keep timed decision evidence in the session scratchpad outside the repository.

**At a glance:** most questions are not his. Answer them yourself, then ask what is left, all at
once, with a recommendation on each.

## List every candidate first, in writing

Before filtering anything, enumerate every open question you can find, as a written list. Read the
sources rather than your memory of them: the opening prompt of this session, the spec if one exists,
`questions.md`, each relevant ticket's body and comments, and any "blocked" or "needs the owner" note
anywhere in the run.

A question you never wrote down cannot be filtered, cannot be asked, and disappears silently. That
is the failure this list exists to prevent.

## Give every candidate a disposition

Each question on that list leaves with exactly one of these, and nothing else:

| disposition | what it requires |
|---|---|
| **answered** | the answer itself, plus where it came from: a file and line, a ticket comment, an ADR, a primary source |
| **decided** | the decision you made, plus the reasoning, recorded where the work will read it |
| **asked** | it went to him in an `AskUserQuestion` call |

"I could probably work this out" is not a disposition. Either produce the answer with its evidence
now, or ask. A question you set aside as settleable and did not settle is an asked question you
skipped.

**Cross-check before you finish.** Anything still open at the end of the run must appear in the
asked list. If a question is open and he was never asked it, the run failed; ask it.

**Never name an unasked question in a reply.** If you can write "this one is still yours", you could
have asked it in that same turn. Mentioning it instead of asking turns one grilling session into a
loop, which is the thing he does not want. Ask everything, then report.

## The filter, in order

Run every candidate question through these. Stop at the first that resolves it.

### 1. Is it already answered somewhere?

Check, in this order, and only the ones that could plausibly hold it:

- **The code.** Read the implementation, the contract type, the API source in the sibling repo.
  A question about what a field contains is a question about a file you have not opened yet.
- **The ticket, body AND comments.** The body often already decides what the question asks, and a
  worker's question is frequently a line it did not read. The comments hold what came later: an
  answer the owner gave, a capability the API does not have, a scope correction. Read both, because a
  decision recorded as a comment is the most recent one and the body will not mention it.
- **The brain.** `/brain` holds every decision the owner has made. A question shaped like "is this Pro
  or free", "did we keep X", "which direction did we pick" is almost always already an ADR.
- **The web.** A vendor limit, an API's real behaviour, a library's actual semantics. If a search
  settles it against a primary source, it was never his question.

### 2. Is it "simpler or more correct"?

If the question is some form of "do you want the quick version or the proper one", the answer is
the proper one. Always.

That holds no matter what it costs: more code, a change in the sibling repo, a new shared
abstraction, a migration, a longer run, more review rounds. Take the correct and scalable path and
say in one line what it costs.

This question never reaches him. Asking it is asking permission to do worse work.

### 3. Is it an engineering call?

Naming, structure, which layer owns something, how to test it, what to name a file: yours. Decide
it now and write the decision down. Deciding it later is not deciding it.

A question about what a screen SHOWS is yours too, whenever one answer is clearly better. Take the
better one. `DESIGN.md`, `BRAND.md`, `design/canvas/` under the D42 ladder, and the decisions in
`/brain` are the authority, and between them they settle most of these: a dead end loses to a way
forward, an honest state loses to nothing, a drawn behaviour wins over an invented one.

Only a real toss-up reaches him: two answers both defensible against all four of those, where the
difference is taste or positioning rather than quality.

### What survives

What is left is genuinely his: product, copy, pricing, positioning, brand, design direction, and
any choice where two answers are both defensible and only he knows which one he wants.

## Asking

`AskUserQuestion` takes at most four questions per call, so ask in rounds of four until every
surviving question is answered. Order the rounds by how much work each question unblocks.

Never drop a question because the list is long. A question you filtered out is answered; a question
you simply did not ask is still blocking something, and nobody knows it exists. Say how many rounds
are left when you send one, so he can see the end of it.

Each question carries:

- the decision stated plainly, checked against the owner's answer rather than a ticket paraphrase
- what goes wrong today if nobody decides, so he can see why it matters
- a recommendation FIRST, labelled `(Recommended)`, with the reason in its description
- two to four real options, each a path you would actually take

He can always type his own answer, so never add an "other" option yourself.

Write the options in product terms. He should be able to answer without opening a file.

## After he answers

Record each answer where the work will read it: a comment on the ticket that needed it, and an ADR
in the brain when it is a decision that outlives the ticket. Then unblock whatever was waiting.
