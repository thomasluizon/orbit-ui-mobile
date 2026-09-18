# Orbit prod release

**At a glance:** the living spec for getting Orbit to a production release. One effort, one spec,
updated by every `/handoff`. Everything durable lives here; a handoff prompt carries only what to do
next. **Renamed from `orbit-redesign.md` on 2026-09-17**, when Thomas widened the goal from finishing
the redesign to clearing the whole board: "considering everything from the board needs to be done,
redesign continues to be the focus, also the google play page updated with the new designs, texts,
everything, and in the end, a complete /prod-readiness run, and every finding that comes from this
run gets also fixed".

## What this is

**The goal is a production release with an empty board.** The redesign stays the focus and is the
next thing to finish, but it is no longer the whole effort. The order is in
`## The order: the batches to a production release, redesign-gated` below, and that order is what a session works
from.

Orbit is being rebuilt screen by screen against a granted design canvas. Every screen lands on both
web and Android together. Nothing reaches a real person until the whole redesign ships, so
`redesign/main` is the branch and `main` stays untouched, except for a live defect under D99.

Thirteen screens. The calendar, Privacy and Terms, the Android widget, Perfil, Progresso and most of
About are finished. The rest are listed under State.

## Standing instructions from Thomas

These stay until he changes them. Keep his words.

- **2026-09-12** "finish every harness ticket, even the ones you filed today ... everytime i do a
  run, you file more harness tickets, its infinite. i want a permanent solution. then continue the
  redesign." Done. Do not file a harness ticket as a substitute for fixing something; record a real
  capability gap as a comment on the ticket that needs it.
- **2026-09-13** A progress update is in product terms. "i DONT CARE about this" said of ticket and
  PR numbers. Use `/progress`.
- **2026-09-13** Replies stay inside his writing contract. Do not send a long reply and let the Stop
  hook reject it; he sees the rejected draft and the rewrite both. Do not offload a long answer to a
  file either: "you answer normally here, without stop hook errors ... i just want you to stop
  rambling."
- **2026-09-13** Before asking him anything, run `/questions`. A question answered by the code, the
  ticket body OR ITS COMMENTS, `/brain`, or a web search is not his. "for this feature, do you
  prefer this simpler approach, or this more complete, more scalable and more correct approach" is
  never his either: the answer is always the correct one, "doesnt matter if it will add 1 million
  lines of code, if it will add changes on the other repo, WHATHEVER". More than four surviving
  questions get asked in rounds until all are answered.
- **2026-09-13** A screen question with one clearly better answer is decided, not asked. "if the
  question has two answers, one being trash and one being a lot better, just go with the better.
  ALWAYS FOLLOWING DESIGN.MD and BRAND.MD and /brain decisions." Only a real toss-up reaches him.
  **Read that last clause literally.** On 2026-09-14 a run overrode the granted canvas on its own
  judgement and Pullfrog caught it; see the Send-button entry under Decisions.
- **Standing** Always the best implementation, never a cheaper or partial option.
- **2026-09-14** **Copy is YOURS, not his.** "i never draft copies. you create them by following
  brand.md, like any other copy. i dont even have to approve". Write every user-facing string from
  `BRAND.md`, in `en.json` AND `pt-BR.json` in the same edit. This SUPERSEDES the earlier "copy is
  his" line, which stalled Wrapped stages 4 and 5, About stage 5 and Perfil stages 8 and 9 for a
  whole night over strings that were never his to write. Only pricing, positioning and brand
  DIRECTION remain his.
- **2026-09-14** **You merge `orbit-api` pull requests yourself.** "is it related to the redesign? if
  yes, just merge to redesign/main. if not, you can merge and deploy to main. my answer will always
  be this one." This SUPERSEDES "no `orbit-api` pull request merges unattended". The routing follows
  the WORK, never which branches exist: "theres absolutely no problem in creating a redesign/main on
  the api, you know that, right?" `orbit-api` `redesign/main` was created on 2026-09-14 from
  `fb61d921`.
- **2026-09-14** **A question whose recommended answer is obviously right is not a question.** On two
  strings that contradicted the product: "this question doesnt belong to me ... this is the obvious
  best approach, so you should've decided yourself, a questions about 'say the truth or lie' i will
  always answer with th truth. dumb question." Correctness, accuracy and honesty are never toss-ups.
- **2026-09-14** **`/questions` means ZERO questions remain afterwards.** "if i use this skill, you
  should have literally no more questions after i answer all of them ... why the fuck do you
  gatekeep QUESTIONS??" Asking four of six and closing the rest yourself is the failure. Ask every
  survivor, in rounds of four, and say how many rounds are left.
- **2026-09-14** **Any run ends only when this spec is done.** "ANY RUN ends only when the original
  spec is done ... anytime i run /handoff, the handoff needs to list a clear goal: finish the
  original spec. if its not done, then your work is not done, and if it means fixing blockers, taking
  decisions, whathever it takes, you will do it, until the spec is finished with the best approach
  possible." A blocker is the next piece of work, never an ending: "theres no blocker impossible of
  being fixed by you, you create the blockers, you fix them, always doing the best approach." Waiting
  on CI is waiting. A stacked child's blocker is its parent, which is the work. A finding too big for
  one pull request becomes a ticket AND gets picked up. A missing branch, gate or tool gets built. The
  only honest early ending is external: the allowance runs out, the machine stops, or he says stop,
  and you say which.
- **2026-09-15** **The suppressed lint violations are part of finishing the redesign, and speed
  matters.** "the lint violations fixes, and the redesign finished, as fast as possible." Said after
  being shown the 367 suppressed violations across 99 files. They are not a separate cleanup effort
  to be scheduled later: every screen ticket already requires its own share gone with a strict
  Suppressions Ratchet decrease, and that is now the largest remaining block of work. "As fast as
  possible" narrows HOW, never WHAT: it means stop idling a worker slot and stop opening fronts that
  do not close a ticket. It does not license a cheaper implementation, and it never overrides
  "always the best implementation".
- **2026-09-16** **Do not ask permission for work he already asked for.** After the beta release
  was held pending a confirmation he had already given in writing: "you shouldnt have asked me
  to say 'go', you could've just shipped it." A written instruction IS the authorisation.
  Ask again only when the scope or the inputs changed.
- **2026-09-16** Answered directly, both recorded on their tickets: **centred phone IS the
  large-screen answer**, so no tablet layout is filed and none should be; and the **public Play
  developer name becomes TL SOFTWARE ENGINEERING LTDA**.
- **2026-09-16** **The local worker cap is TWO, not three.** Four were killed at once for low
  memory, every one of them after committing. This supersedes D89's figure of three on this machine.
- **2026-09-16** **Copy he asks you to apply still gets both passes first.** On the Play listing
  text: "first make sure all the texts adhere to brand.md and run /humanizer on them." Copy being
  yours does not mean copy skips review; it means the review is yours to run, not his to sit through.
- **2026-09-16** **Beta licences the easy path on sequencing, and only on sequencing.** "i dont care,
  the app is in beta, and basically only i use it, theres no problem in doing the easy approach, no
  matter if it will break (for now)." This narrows deploy-API-first while the fleet is him alone. It
  does NOT narrow "always the best implementation": it buys a simpler deploy order, never simpler code.
- **Standing** Ticket `#74` owns existing copy.
- **2026-09-16** **An attended `/handoff` ENDS the session.** "after i run /handoff, the session is
  FINISHED, you cant continue working, anything i ask, you put on the handoff prompt, not now." The
  one exception is an explicit "do this now, then /handoff". `/wrap-up` shipped the same day and runs
  `/progress`, then `/questions`, then `/handoff`, passing `--sleep` through to the last one only.
  Both rules live in `.claude/skills/handoff/SKILL.md` and `.claude/skills/wrap-up/SKILL.md`; do not
  restate them here.
- **2026-09-16** **Device verification is NOT a gate on building something. Build it.** "just build
  it, we dont test now ... when we finish the WHOLE REDESIGN, i will generate an apk and test on my
  phone." Said when `#543`'s React Native feature-flag override was held back because no test can see
  whether it works and the emulator is his. So: "this needs a device to verify" is never a reason to
  stop, scale down, or hand the decision back. Build the correct thing, say plainly in the pull
  request body what only a device can confirm, and move on. He tests the whole redesign once, on his
  phone, from an APK he generates himself at the end.
- **Standing** Never boot the Android emulator. It is his visual testing surface.
- **Standing** `redesign/main` stays unprotected. Settled; never raise it.
- **2026-09-18** **THE GATE IS SET. NEVER ASK ABOUT IT AGAIN.** Asked whether nine merged screens
  earned an early internal build, given 16 tickets still open: "never ask me again about this. the
  gate is setted, when the whole redesign is done, you build the internal build, i dont care how much
  screens are missing". So the count of remaining screens is never a reason to revisit the sequence,
  and neither is how much has landed.
- **2026-09-18** **A killed worker is a relaunch, never an ending.** A session stopped after the host
  reaped two workers for system memory and reported the night as externally over. His correction:
  "wrong. the night doesnt end here. if you have any problem with the worker, just launch another
  one." So a harness kill, a host kill, a ceiling and a provider capacity error are all the same
  thing: launch another worker. The only endings remain the allowance running out and him saying stop.
- **2026-09-18** **Astra's rendering is a COMPLETE refactor, not a scope decision.** "astra rendering
  needs to be COMPLETELY refactored, using the beautiful ui.dev components, almost EVERYTHING that
  she renders need to be something VISUAL and beautiful, the only exception are simple sentences,
  idk, but everything else should be blockes, graphics, images, i dont know, we need to brainstorm
  this. NOT ON THIS SESSION THOUGH, ON THE HANDOFF." He also noted it was already decided: the
  2026-08-13 direction in the brain says Astra "must not return a wall of markdown text". The
  component source is **`beautifului.dev`**; the `beautifui.dev` spelling in `#318`'s body and in the
  vault does NOT resolve. The brainstorm is the next session's work, recorded on `#318`.
- **2026-09-18** **A ticket body can put words in his mouth, and quoting it back is on you.**
  `#573`'s body quoted him as saying the three-dot menu failed "after a search". He never said that:
  "why are you saying the dead three-dot tap is related to the search? i literally never said that".
  What he actually reported is two separate things, and only one of them is about search. **Read his
  own message, not the ticket's paraphrase of it, before repeating a cause back to him.**
- **2026-09-16 evening** **A new report from him outranks the queue, immediately.** He reported
  three checklist defects mid-run and said "put it as a priority now", "target main (not
  redesign/main)", and "run /android-release to the beta track after you merge to main, you have
  my permission, no need to ask". A worker slot was freed by stopping the youngest running worker,
  not by waiting. Both halves of that instruction were executed without a second confirmation,
  which is D100.
- **2026-09-16 evening** **Gate BOTH listing and revoking API keys behind the emailed code.** Asked
  as one of three paths, he took the strictest. See `#529`, and note the switch it depends on.
- **2026-09-17** **The whole board ships, not just the redesign.** "considering everything from the
  board needs to be done, redesign continues to be the focus, also the google play page updated with
  the new designs, texts, everything, and in the end, a complete /prod-readiness run, and every
  finding that comes from this run gets also fixed". This spec was renamed for it, and
  `## The order` is the plan.
- **2026-09-17** **The redesign does not merge to `main` until he has tested it and approved it.**
  "when it finishes, i will test everything in the redesign/main branch, when i approve everything,
  THEN we merge to main, and only then the redesign is finished and we can continue to the other
  batches". See `### THE REDESIGN GATE`. This is the one place a session stops and waits for him.
- **2026-09-17** **The harness batch runs BEFORE the redesign**, not last. "i want this batch before
  the redesign." It is batch 0b.
- **2026-09-17** **The component-library migration happens AFTER the redesign**, decided with him
  from cited research: rn-primitives on mobile, Radix on web, one component shape, our tokens on top.
  Rejected on evidence, not taste: gluestack, react-native-reusables and HeroUI Native all require
  NativeWind or Uniwind, which this repository removed and gate-enforces out; Tamagui's compiler
  still emits wrong styles in production builds (`tamagui#4194`, 2026-08-30) and its native overlays
  depend on `react-native-teleport`, whose Fabric reparenting crashes recurred through 2026-09-10;
  React Native Paper carries Material into every component API. `#576` to `#581` carry it.
- **2026-09-17** **beautifului.dev is wanted for Astra, "wherever is possible to use, on both
  platforms if possible".** `#581` settles first whether it runs on React Native at all; if it is web
  only, mobile ports the patterns onto our own primitives rather than importing them.

## The order: the batches to a production release

Read live on 2026-09-17: **231 open tickets** across the three repositories, pulled in one
`gh issue list --limit 400` call and read in full. By repository: 137 `repo:ui`, 71 `repo:api`, 23
`repo:landing`. By milestone: 146 carry none, 25 are `539 Redesign`, 23 `562 Astra`, 16 `Launch`,
10 `Packaging: caps, quotas and tiers`, 7 `Harness Context and Calibration`, 4 `PostHog`.

The batches below are the whole board, plus `#585`, filed on 2026-09-17 after the count was taken.
A batch ships before the next one starts, because each one removes a reason the next would have to be
redone. Inside a batch, order is free.

### Batch 0a, first: make the gate affordable

`#585`: `node tools/test-tools.mjs` is 1,707 assertions, fully serial, about ten minutes, with no way
to run less of it. `CLAUDE.md` requires it after any change under `tools/**` or `.claude/**`, so a
one-string edit costs the same as a rewrite. Add `--only <name>`, keep the full run as the default
and the gate, print the elapsed time and the assertion count, and decide parallelism on a
measurement rather than a preference.

**Why before everything else:** this gate sits in front of every harness and orchestration change in
every batch below, including all of batch 10. It has already been starved twice on this machine, once
truncated at a 590-second timeout with zero failures and once stopped by the low-memory reaper, and a
ten-minute gate is the kind people find reasons to skip. Thomas stopped a run over it on 2026-09-17.
Paying this down first makes every later batch cheaper; leaving it makes them all slower.

### Batch 0b: the harness, before the redesign

**Moved here from last on 2026-09-17, on Thomas's instruction: "i want this batch before the
redesign."**

`#575`, `#560`, `#558`, `#559`, `#556`, `#546`, `#544`, `#542`, `#541`, `#530`, `#528`, `#525`,
`#521`, `#455`, `#234`, `#233`, `#230`, `#190`, `#187`, `#180`, `#303`, `#304`, `#306`, `#307`,
`#286`.

**Why it earns the front:** these are the gates and the orchestration that every batch below runs
THROUGH, and several are currently lying. `#546`: the Gate Charter never installs its dependency, so
the gate that closes every gate has never run. `#541`: the review reader accepts a Pullfrog progress
marker as a finished review, which is the defect that forced every approval on 2026-09-17 to be
re-read by hand. `#530`: a test that reads the real clock, green in CI and red locally. `#542`: a
review-fix worker pushes before its threads can resolve. `#544`: a Cloud command drops a file that
blocks the next commit. `#521`: a guardrail that refuses a legitimate redirect, which blocked three
commands in one session. A batch that runs on gates which do not gate produces work nobody can trust.

Two rules for this batch, both from Thomas:
- **Re-read each ticket against the tree before building it.** Several describe a state the last two
  weeks already changed. A ticket that reads blocked, or fixed, is a lead and not a fact.
- **2026-09-12 stands: a harness ticket is never filed as a substitute for fixing something.** This
  batch closes the existing ones; it does not license new ones.

### Batch 0c, shipping now: the live Android defect

**`#590`** (the three-dot tap and the search keyboard, pull request 1015 against `main`; `#573` was
CANCELED as superseded, its premise false), then `#574` (measure the habit
list's render counts, then cut them), then `#563` (three Android checklist defects), `#134` (the
three-dot menu ticket only Thomas can close, on-device).

**Why first:** these are defects a person hits in the shipped build today. `#573` and `#563` target
`main` under D99, and a release follows each with `/android-release` to the open track. Everything
else in this spec is work nobody outside this machine can see yet.

### Batch 1: close the redesign

The thirteen open pull requests, in the readiness order this spec's State section carries, then the
remaining `539 Redesign` screen tickets: `#67`, `#73`, `#63`, `#57`, `#74`, `#545`, `#543`, `#520`,
`#481`, `#479`, `#477`, `#476`, `#475`, `#473`, `#472`, `#461`, `#460`, `#336`, `#175`, `#217`,
`#320`, `#318`.

**Why second:** the redesign is the focus and it is nearly done. Every other UI batch below touches
screens these tickets are still rewriting, so doing anything else first means doing it twice. This
batch ends when `node tools/redesign-coverage.mjs` reports a valid mapping AND every screen ticket
closes against its own acceptance criteria.

### THE REDESIGN GATE, between batch 1 and batch 2a

**Thomas's instruction, 2026-09-17, and it is absolute:**

> work the batches until the redesign finishes, when it finishes, i will test everything in the
> redesign/main branch, when i approve everything, THEN we merge to main, and only then the redesign
> is finished and we can continue to the other batches

So the sequence at the end of batch 1 is:

1. Every screen ticket closes against its own acceptance criteria, and
   `node tools/redesign-coverage.mjs` reports a valid mapping with nothing missing.
2. **Stop. Tell him the redesign is ready to test on `redesign/main`.** Do not merge. Do not start
   batch 2a. Do not start anything else in this spec.
3. **Ship it to a CLOSED Play INTERNAL track**, answered 2026-09-17: he tests it as a real update
   rather than a sideloaded file. `/android-release` to the internal track, off `redesign/main`, not
   the open track and not `main`. This is the one release that leaves `redesign/main`.
4. He tests everything on his phone from that build.
5. **Only on his explicit approval** does `redesign/main` merge into `main`.
6. The redesign is finished at that merge, not before it. Then `/android-release` to the OPEN
   track off `main`, and batch 2a starts.

A session that reaches step 2 and keeps going has broken the one rule this gate exists for. If the
queue looks empty at step 2, that is correct: the run is waiting on him, and waiting on him is a
legitimate ending under `/sleep` as long as it is reported as blocked on his approval rather than as
finished.

### Why the order after the gate changed, 2026-09-17

Thomas read the first draft and found a real defect in it: the Play listing and the landing page sat
in batch 7 and 9, so **anyone downloading the open beta after the redesign shipped would see a store
page and a marketing site showing a product that no longer exists**, and that desync would last five
batches.

> what i propose: after the redesign, do every ticket that changes something on the UI, and after
> that, do the landing page and the play store update, then the rest, so we spend the least amount of
> time with those desynced

That is the order below. One mechanical correction was applied with his agreement: "every UI ticket"
is not one block, because batch 2b's screens read fields that do not exist until batch 2a deploys, so
the API contracts keep their place in front. And one refinement: **the component-library migration
changes ZERO visuals**, so it is invisible to the store and to the landing page and buys nothing by
coming first. It moved after them.

### Batch 2a: the API contracts the UI is already waiting on

`#391`, `#394`, `#387`, `#385`, `#389`, `#505`, `#483`, `#257`, `#571`, `#372`, `#369`, `#367`.

**Why it still leads:** each one is a field or an endpoint a batch 2b ticket is blocked on, and the
repository contract is deploy-API-first. Merging is not deploying: every one needs Thomas to deploy
before its consumer can merge. Twelve api-only tickets, nothing visible, so it is the shortest thing
standing between the redesign and the visible work.

### Batch 2b: every remaining ticket that changes what a person sees

The UI those contracts unblock: `#392`, `#395`, `#386`, `#390`, `#361`, `#572`, `#516`, `#297`,
`#181`, `#179`, `#178`, `#471`, `#454`, `#441`, `#222`, `#62`, `#28`, `#64`, `#216`, `#533`, `#532`,
`#214`.

The design system's own corrections: `#377`, `#370`, `#431`, `#424`, `#421`, `#519`, `#518`, `#497`,
`#509`, `#559`, `#535`, `#426`, `#434`, `#531`, `#465`, `#463`, `#466`, `#458`, `#499`.

The packaging and pricing changes that alter visible copy and gating: `#195`, `#196`, `#197`, `#199`,
`#200`, `#237`, `#238`, `#327`, `#328`.

**Why these run together and before the store:** every one changes a screen, a string or what a plan
includes. Shipping the store listing before them means writing it twice. `#531` also retires the four
`eslint-disable` comments pull request 1008 ships, and the packaging tickets settle what the pricing
copy says before anyone writes a store description against it.

### Batch 3: the landing page and the Play listing, together

Landing: `#78` (redesign against the new canon), `#209` (pricing and FAQ copy realigned), `#204`,
`#212`, `#206`, `#251`, `#250`, and the Turnstile and consent set `#269` to `#282`, `#285`, `#286`,
`#291`, `#292`, `#279`, `#280`, `#313`, `#107`, `#108`, `#114`.

Play: the new screenshots and feature graphic from the finished app, the updated store description
and ASO copy against `BRAND.md`, and `#33` (7 demo clips and 2 landing videos). **`#34` is CLOSED**:
the LTDA address, the contact address and the ADHD ASO keywords already landed, so this batch does
not reopen it.

**Why here and not last:** this is the whole point of the reorder. The moment batch 2b ships, the app
a person downloads and the pages selling it are the same product, and the window where they disagree
is one batch wide instead of five.

**Who does what, answered 2026-09-17: THOMAS captures the screenshots on his phone.** He is already
testing on device at the gate, so the screens are in front of him. **The run never boots the emulator
for this**, which keeps his standing rule intact. What the run owes him is the exact shot list,
naming each screen, its state and its locale, ready before he tests, plus every caption, the store
description and the ASO copy written from `BRAND.md` and passed through `/humanizer`, per his
2026-09-16 instruction that copy he asks for still gets both passes.

### Batch 4: the component-library migration

`#576` first, alone, because it installs the layer and proves it loads on Expo SDK 57 / RN 0.86.3.
Then `#577`, `#578`, `#579`, `#580` in any order, then `#581` (Astra on beautifului.dev).

**Why it is here and not before the redesign:** doing it first would rewrite every primitive under
thirteen screens that had thirteen open pull requests against them, and every one would conflict.
**Why it is not before the store either:** it changes no visuals at all. It swaps the behaviour layer
under primitives whose look is unchanged, so a store listing written before it stays true after it.

### Batch 5: Astra

`#16`, `#582`, `#583`, `#584` (cost and analytics) first, then `#17`, `#18`, `#21`, `#19`, `#23`,
`#24`, `#25`, `#26`, `#49`, `#48`, `#201`, `#202`, `#236`, `#244`, `#245`, `#246`, `#247`, `#248`,
`#259`, `#264`, `#265`, `#319`, `#396`, `#418`, `#513`, `#514`.

**Why after the migration:** `#581` builds the Astra chat surface, and `#24` is the
preview-confirm-edit pattern that surface renders. Astra has its own milestone, its own security work
(`#17`, `#18`) and its own eval gate (`#26`). `#319`, the crisis response to a self-harm disclosure,
ships inside this batch and never after it.

**Note on the store:** Astra IS user-visible, so if this batch materially changes what Orbit offers,
the listing gets a second, smaller pass at the end of it. That is one revisit, not five.

### Batch 6: security, correctness and the deletions

`#101`, `#102`, `#115`, `#208`, `#325`, `#324`, `#323`, `#330`, `#500`, `#501`, `#493`, `#495`,
`#527`, `#526`, `#529`, `#569`, `#562`, `#549`, `#556`, `#568`, `#564`, `#565`, `#566`, `#567`,
`#227`, `#225`, `#205`, `#218`, `#235`, `#239`, `#299`, `#300`, `#301`, `#302`, `#249`, `#253`,
`#254`, `#255`, `#260`, `#262`, `#263`, `#311`, `#89`, plus the analytics set `#83`, `#84`, `#82`,
`#213`, and the Sentry triage `#32`, `#31`.

**Why before the readiness run:** every one of these is a thing `/prod-readiness` would find anyway.
Fixing them first makes that run a verification rather than a second backlog.

### Release cadence, answered 2026-09-17

**One release per batch, to the OPEN track.** Every batch from 2a onward ends with
`/android-release` to the open beta, so a defect surfaces against a known, small change set, which is
how the two releases before this worked. The harness, API-contract and readiness batches release too:
a batch that changes nothing a person sees still ships, because a version with no visible change is
cheaper to diagnose than several batches arriving at once.

Two exceptions, both already stated above: the gate build goes to the CLOSED internal track off
`redesign/main`, and the `main` merge that ends the redesign gets its own open-track release before
batch 2a starts.

### Batch 7: the production readiness run, and its findings

`#315`: run `/prod-readiness` with the board clear. It fans out security, tests, performance,
code-quality, an ops audit, a static WCAG 2.2 AA sweep, a dependency sweep across both repositories
and an architecture-drift sweep, then consolidates into one ticket set behind one approval gate.

**Every finding it raises is fixed before release.** The run is not the finish line; the empty board
after it is. Then the release: `/android-release` to the open track, Thomas's device pass, and
promotion.

## How the work runs

Every session enters through `/orchestrate`. Codex workers make every code change; Claude
orchestrates and never edits code. `.claude/rules/core.md` is the operating contract and carries the
rest, D89 and D90 included.

## Decisions this effort runs on

**The ADRs live in the brain vault. Read them before you act on anything below.** This spec carries
pointers; the reasoning, the options that were rejected and the cost of each are only in the note.

**Read them through the Obsidian MCP, not the filesystem.** `mcp__obsidian__obsidian_list_notes` to
see what exists, `mcp__obsidian__obsidian_get_note` to read one, and
`mcp__obsidian__obsidian_search_notes` when you know the idea but not the filename. The vault is also
on disk at `C:/Users/thoma/Documents/Programming/Projects/brain`, but `cat` and `ls` miss the
frontmatter, the tags and the backlinks that say which decision superseded which. Use the MCP.

- `2 Areas/20-29 Orbit Engineering.md` is the area note and the way in.
- `2 Areas/20-29 Orbit Engineering/Decisions/` holds one note per decision. The ones this effort
  runs on, by exact filename:
  - `Stop the canvas pass and move the redesign into real code as tickets.md`
  - `The unit of redesign delivery is a whole screen with nothing old left on it.md`
  - `Every redesign screen runs a design-first loop in conversation, never autonomously.md`
  - `Run the rest of the redesign unattended and review it once as a whole.md`
  - `Run the redesign cloud-first at max parallelism and carry the operating contract into every session.md`
  - `Claude orchestrates only in redesign build sessions, Codex workers make every code change.md`
  - `Redesign PRs target redesign-main only until the redesign ships.md`
  - `A screen PR never merges on green and approval alone, only Thomas's eyes clear it.md`
  - `Merge readiness during the redesign is a fresh approval plus a disclosed artifact.md`
  - `A run must not edit the gate it is judged by.md`
  - `A gate PR merges only when every check is green with nothing excused.md`
  - `An unattended run proves an external interface from installed source, never a live call.md`
  - `Ship a sleep skill so an unattended session always takes the best approach and logs every decision.md`
  - `Codex Cloud is disabled by default after repeated empty-diff failures.md`
  - `Habit row actions that are not day-scoped stay available on every day.md`
  - `handoff writes one fixed NEXT.md path never a timestamped file.md`
  - `The shipping branch outranks the redesign when the machine cannot run both.md`
  - `A written instruction is the authorization ship on it without asking again.md`
  - `A contract change needs its caller sweep in the same run.md`

  **All nineteen were re-confirmed through the Obsidian MCP on 2026-09-18 at 00:30**, by listing
  `2 Areas/20-29 Orbit Engineering/Decisions/` with `obsidian_list_notes` and copying the names that
  came back. The MCP is UP; `obsidian_search_notes` needs `mode: "text"`. Historical note: The Obsidian MCP was still
  unreachable (`fetch failed`, Obsidian not running), so the listing came from the `vault-fs` MCP,
  which reads the same vault from disk AND returns frontmatter, so `status` and `superseded_by`
  were checked rather than guessed. None carries a `superseded_by`. What that path still misses is
  backlinks. **Re-confirm through the Obsidian MCP when it is up.**
- `2 Areas/20-29 Orbit Engineering/Orbit debloat and redesign master plan 2026-08-05.md` is the plan
  the screen list came from.
- `2 Areas/20-29 Orbit Engineering/The ui-skills shortlist for the Orbit redesign.md` is why the
  review sweep uses the skills it uses.

A note that contradicts this spec is the authority, because the note is where Thomas decided it. Say
so rather than following the stale line here, and fix the line.

Pointers, not restatements. The reasoning lives in the ADR.
- D70: Pro is Astra without the daily ceiling; goals left the paywall. The daily summary and
  proactive check ins stayed behind the gate, and the server agrees at
  `ProcessUserChatCommand.Ai.cs:120` and `ProactiveCheckinSchedulerService.cs:58-60`.
- D92: the Gate Charter closes every gate into one registry that fails closed.
- D42: `design/canvas/` outranks `DESIGN.md` prose, except `## Information architecture` and
  `## Bans`.
- 2026-09-13: `Lint Severity` is changed-files scoped AND blocking.
- **SUPERSEDED 2026-09-14 by Thomas: "no `orbit-api` pull request merges unattended".** You merge
  them. See the standing instruction above. `orbit-api` now has its own `redesign/main`.
- **SUPERSEDED 2026-09-14 by Thomas: "a worker never writes a user-facing string".** A worker order
  may now ask for strings, and should. Copy is ordinary work written from `BRAND.md`.
- **2026-09-14: a test that has only ever been green has not been shown to notice anything.** Every
  fix is proven by reproducing the break first. This held again all night: eleven separate rounds on
  2026-09-15 each recorded a red run before its fix, and the two defects nobody had caught were
  both in code whose tests had never failed.
- **2026-09-14: worker cost is capped in the harness, not by intention.** `caps.workerLaunchesPerBranch`
  is 2 and `--tier mechanical` selects `model_reasoning_effort="medium"`. **LIVE since 2026-09-15**:
  pull request 964 merged and `launch-worker.mjs` accepts `--tier <default|mechanical>` and
  `--relaunch-reason <text>`. Batch a review's findings into ONE order regardless.
- **2026-09-14: a concurrency gate decides by claiming a name, never by counting.** Three races were
  found in the launch cap before it was right. The answer is N fixed slot names claimed with an
  exclusive create, so the create IS the decision.
- **2026-09-14: every new guard is proven by breaking what it guards.**
- **2026-09-15: copy that carries a NUMBER or a DATE is checked against the rule that produces it,
  never only against its sibling strings.** Three strings written on 2026-09-14 were each wrong the
  same way. A fourth joined them on 2026-09-15: `profile.support.offlineReason` promised "the message
  will go out when your connection returns" and neither platform has a queued send at all.
- **2026-09-15: a parent pull request must be correct WITHOUT its children.** `960` shipped a goals
  slide that a goal-only recap could not reach, with the fix sitting in its child `961`. "They land
  together" is an assumption, not a property: a child can be reworked or delayed. The fix moved down.
- **2026-09-15: the granted canvas outranks a run's own reasoning, including a good one.** A run
  ordered the support Send button to stop gating on an empty subject, reasoning that a disabled
  control with no stated reason tells a person nothing. `design/canvas/Orbit Sobre.dc.html:484` reads
  `disabled: send === 'sending' || offline || !subject || !message.length`. The concern was real and
  the override was not: the right answer was the canvas behaviour PLUS a stated reason, which the new
  `Input` `hint` contract now makes possible. **Applied again on 2026-09-15**: rather than build a
  queued send to make a false string true, the string was corrected, because the canvas draws a
  DISABLED send with a reason and a message leaving silently later is not what it specifies.
- **2026-09-15: a client may mirror a server rule only with a one-line WHY naming its file and
  lines.** The delete-account modal has to reproduce `ConfirmAccountDeletionCommand.cs:31-33` because
  the API exposes no preview of the scheduled date. Write that path by opening it, not from memory: a
  WHY comment whose link 404s is worse than no comment.
- **2026-09-15: a run MAY edit its own contract, and the amended rule says when.**
  `SKILL.md`'s old "never edit this skill from inside a run ... repair it after" had no "after": every
  session here is a run, so it made its own repair impossible and left three pull requests permanently
  unlandable. The rule now bans the case it was reaching for, an edit that changes what THIS run is
  judged by or excuses its own review, and says a contract change takes effect for the NEXT run. D95
  is unchanged and still absolute for gates.
- **2026-09-15: when a gate and a review disagree about ORDER, the gate decides.** 890 and 964 blocked
  each other: the review wanted the documentation first, and `test-hooks.mjs` refuses documentation
  that prescribes a flag the checked-in tool rejects. So the activation merged first and the docs
  second. Posting the five FAIL lines on 964 is what moved it.
- **2026-09-15: a stale FACT in a granted canvas is not a design authority.** `Orbit Wrapped.dc.html`
  said in five places that goal completions had no producer while
  `GetRecapQuery.cs:22,167,245-259` counts them on `main`. Those sentences were corrected and nothing
  drawn was touched. Verify the claim in the other repository BEFORE editing a canvas, and never let
  a correction reach a token, colour, radius, shadow, font, spacing, size or element: that is still
  Thomas's.
- **2026-09-15: a parameter added with NO default turns a missed caller into a compile error.** Used
  three times that night, on `buildShareCardStats`, `deriveProgressViewState` and the goal count, and
  it caught a caller each time. The converse also bites: a parameter whose every caller now passes one
  literal value is DEAD and gets deleted, which is how `useProgressRetrospective(enabled)` was caught.
- **2026-09-15: enabling a previously disabled request inherits the whole fetch layer, not just the
  response shape.** Making Progresso's retrospective query always fire was correct, and it introduced
  a worse defect than it fixed: `apps/web/lib/api-fetch.ts:103-107` sets
  `globalThis.location.href = '/upgrade'` on a 403 `PAY_GATE` unless the caller passes
  `{ handlesPayGate: true }`, so a free account was navigated off Progresso before the locked card
  could render. Reason about what the TRANSPORT does with a response, not only about its body.
- **2026-09-15: the version metadata on a support request rides in the MESSAGE, with the client
  reserving room.** Compute the message field's `maxLength` as `SUPPORT_API_MESSAGE_MAX_LENGTH` minus
  the exact version-suffix length, so nothing can be typed that will not fit and nothing is ever
  truncated. Rejected: raising the API cap, which puts a live validator change and a deploy on the
  critical path for about fifteen characters; and moving it into Subject, which turns a four-option
  CATEGORY into a variable string nothing can filter on.

## Constraints that are not obvious from the code

- **Mobile parses ICU now, and an apostrophe next to ICU syntax is the trap.** `#540` merged as 966
  on 2026-09-15: `apps/mobile/lib/i18n.ts` uses `i18next-icu/cjs`, so the eleven plural strings that
  rendered as garbage on Android now render. Two consequences that bind every new string:
  - **In ICU an apostrophe FOLLOWED by `{`, `}` or `#` opens a quoted literal**, so `'{name}'`
    renders the literal `{name}` and never substitutes. Double it: `''{name}''` renders `'Corrida'`.
  - A guard in `packages/shared/src/__tests__/i18n.test.ts` walks every key in both locale files and
    fails on an unpaired apostrophe next to ICU syntax. Any new string has to pass it.
- **A MOBILE test must render through the app's own i18n instance**, imported from `@/lib/i18n`, not
  through next-intl's `createTranslator`. Web keeps `createTranslator`.
- **Deleting an account DEACTIVATES, and the schedule has two gates.**
  `ConfirmAccountDeletionCommand.cs:31-35` takes the EARLIER of plan expiry plus seven days and
  `nowAtUtc + AppConstants.MaxDeletionGraceDays`, which is **30**. `VerifyCodeCommand.cs:104-110` and
  `GoogleAuthCommand.cs:139-149` cancel the deactivation on sign in. **`#71`'s acceptance criterion
  "Delete account says there is no way back" is WRONG about the product and must never be executed.**
  954 landed the honest wording; an errata sits on the ticket.
- **A streak freeze is banked automatically and spent by hand.** `AwardStreakFreezeIfEligible` banks
  one per `StreakDaysPerFreeze` (7) days of streak, capped at `MaxStreakFreezesAccumulated` (3) held;
  `MaxStreakFreezesPerMonth` (3) caps SPENDING. `UserStreakService.EvaluateRepair:193` offers a repair
  for YESTERDAY only. Nothing applies a freeze on its own. This does NOT contradict D73: banking is
  automatic, spending is by hand, and `#57`'s criterion is about applying.
- **`RepairableGapDates` is independent of the freeze bank, on purpose.**
  `GetRepairableGapDatesAsync:84-127` walks SCHEDULED occurrences back from yesterday, and
  `EvaluateGapRepair:169-242` never reads `StreakFreezesAccumulated`. The wire type is nullable:
  `openapi.json` declares `"type": ["null", "array"]`.
- **No display-complete calendar events endpoint.** `useCalendarEvents` is the manual-import feed:
  bounded to 60 days ahead, keeps only the first occurrence of a repeating event, and strips
  already-imported ids. Recorded as a comment on ticket `#56`.
- **`/api/calendar/events` reports the EVENT's timezone, not the account's.** Ticket `#526`,
  orbit-api pull request 521, still open on `main` with one live finding.
- **The retrospective is Pro-only BY DEFAULT and CONFIG-CONTROLLED, not by construction.**
  `PayGateService.cs:131-142` reads `AppConfigKeys.RetrospectiveProOnly`, default true, and only then
  checks `HasProAccess`. So a client must never hard-code `hasProAccess` for it; it reads the server's
  answer. `gamification_free_tier` is a different thing again: a PostHog flag evaluated PER USER,
  returned as `canViewGamification` by `GetProfileQuery.cs:83-84`.
- **Listing and revoking API keys are protected by Pro entitlement only.** `GetApiKeysQuery.cs:30`
  and `RevokeApiKeyCommand.cs:22` check no step-up grant. Ticket `#529`, and see the deploy-order
  conflict recorded as a comment on it.
- **The API's create-key grant is one use AND expires.** `ConfirmApiKeyCreationChallengeCommand.cs:31-34`
  calls `AuthorizeOnce`, `CreateApiKeyCommand.cs:72-75` consumes it, and
  `ResultActionResultExtensions.cs:49` maps the failure to `428` with
  `errorCode = API_KEY_CREATION_CHALLENGE_REQUIRED`. The failure body is exactly `{ error, errorCode }`.
- **The support endpoint's real limits**, read at
  `src/Orbit.Application/Support/Validators/SendSupportCommandValidator.cs`: Subject `MaximumLength(200)`,
  Message `MaximumLength(5000)`, both `NotEmpty`. `send_support_request` activates only on five literal
  phrases, `ChatToolGroups.cs:28-29`.
- **The Astra tool count "81 tools across 15 areas" is CORRECT**, counted 2026-09-14: 96 matches of
  `[McpServerTool` minus the 15 `[McpServerToolType]` class attributes. The prefix match is a trap.
- **No device list**, **no `uses24HourClock` write** (response-only at `GetProfileQuery.cs:147`),
  **no Astra eval trace** (`/api/chat` omits tool arguments, so `#26`'s assertion cannot be written).
- **`goals.filters.*` is dead**: seven keys in both locale files with zero production readers. The
  live filter strings are `progressScreen.goals.filterEmpty` and `clearFilter`. Recorded on `#53`.
- **Expo's SAF copy DELETES an existing destination document before writing to it.**
  `node_modules/expo-file-system/android/src/main/java/expo/modules/filesystem/fsops/CopyMoveStrategy.kt`,
  `class SAF`, `prepareAsDestination`: given a destination that is a FILE it calls
  `file.deleteRecursively()` and then returns a sink pointing at what it deleted. Given the DIRECTORY
  it finds the existing child by the source's file name, deletes that, and writes a fresh child. So
  always copy to the directory, and name the SOURCE correctly first. `Directory.createFile(name,
  mimeType)` is declared at `build/Directory.d.ts:39`; the `Directory` constructor takes `file:///`
  URIs only, so joining a name onto a `content://` tree URI is never right.
- **Android's key map carries no Home and no End.**
  `node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/uimanager/events/KeyEvent.kt`
  maps only four DPAD codes at `:149-152` to `ArrowUp`, `ArrowDown`, `ArrowLeft` and `ArrowRight`, and
  `:57` returns `KEY_NAME_MAP[keyCode] ?: UNIDENTIFIED` with `UNIDENTIFIED = "Unidentified"` at `:65`.
  A mobile test that fabricates `'Home'` or `'End'` asserts something the platform cannot produce.
- **Android ignores an accessibility node it considers invisible**, both at `opacity: 0` and fully
  off-screen. The answer is `AccessibilityInfo.announceForAccessibility`, declared at
  `AccessibilityInfo.d.ts:146`. Never hide a live region and expect it to announce.
- **A Server Action strips everything but `digest` from a thrown error.** Installed Next 16.3.4,
  `react-server-dom-webpack-server.node.production.js:1925-1928`: a thrown `ApiClientError` reaches
  the browser as `{ digest: string }` and nothing else. Return a serializable discriminated
  `ActionResult` instead; the shared one is `apps/web/app/actions/action-result.ts`. A test that
  rejects from a MOCKED action never crosses the boundary and so passes over the defect. **The same
  shape bit again on 2026-09-15**: a test that mocks a HOOK cannot see a redirect that lives in the
  fetch layer below it.
- **Editing any calibrated file invalidates its digest and fails `Harness Calibration`.**
  `tools/check-calibration.mjs:217` digests the file's complete normalized content. Run
  `node tools/reseed-calibration.mjs` in the same pull request AND reconsider the verdict, whose text
  lives in `VERDICTS` inside `tools/reseed-calibration.mjs`. On 2026-09-15 a reseed also caught two
  entries that had drifted earlier and never been reseeded, one of them from a DIRECT commit to
  `redesign/main` that ran no pull request checks.
- **A Codex Cloud command run from the repository root drops an `error.log` there and blocks the next
  commit.** `runCodex` at `tools/lib/cloud-worker.mjs:141` passes `cwd: options.cwd`, so a caller that
  omits it lets the CLI write into the orchestrator's working directory.
  `check-root-allowlist.mjs` then refuses the commit, and `.gitignore:98` hides the file from
  `git status`, so the symptom looks unrelated. Ticket **`#544`**. Until it lands, delete the stray
  file rather than declaring it in `root-allowlist.json`.
- **GitHub's `reviewDecision` is not the Pullfrog verdict.** Read `list-bot-threads.mjs` and the
  `pullfrog-approval` check, never the aggregate. **`counts.unresolved = 0` is not a clean review**:
  a finding can live in the review BODY with no thread. **A COMMENTED review with an EMPTY body and
  zero threads still leaves `pullfrog-approval` red.**
- **Pullfrog posts EMPTY-bodied COMMENTED reviews as progress markers while it works**, and
  `list-bot-threads.mjs` accepts the first one as `REVIEWED` and returns. Ticket `#541` owns the fix.
  Until it lands, the verdict is the `pullfrog-approval` CHECK RUN at the exact head.
- **Pullfrog runs on the SAME GPT Sol allowance as the local Codex workers.** On 2026-09-15 three
  review runs failed with `action failed: provider error: The usage limit has been reached`,
  `providerID=openai modelID=gpt-5.6-sol`. A failed Pullfrog run looks exactly like a pending review:
  read the linked workflow run, and `gh run rerun <id> --failed` rather than posting a fresh request.
- **Read only the LATEST check run per name.** A push while a workflow is in flight leaves the
  superseded run's `failure` on the same commit.
- **An APPROVED Pullfrog review is not the verdict, and this is the single most expensive thing
  tonight taught.** A later review of the SAME head can supersede it, and
  `list-bot-threads.mjs --re-review` returns on the first one. It happened four times in one
  evening, on 992, 986, 994 and `orbit-api` 521, and every superseding review carried a real
  defect. **Decide a merge on the LAST review of the exact head being APPROVED AND the newest
  `pullfrog-approval` check run at that head concluding `success`.** The measurements are on
  `#541`.
- **A `parity:exempt` label does not retro-fix a run already created.** A `Cross-Platform Parity`
  run created BEFORE the label is applied carries a payload without it and fails, while the run the
  label itself triggers skips correctly. Both 998 and 999 hit it. Fire a fresh `pull_request` event
  after labelling, for instance by editing the body, rather than reading the red as a finding.
- **`tools/resolve-bot-thread.mjs` replies and resolves in one step.** Use it only when the finding
  is actually fixed. Its reply body comes from stdin.
- **`list-bot-threads.mjs` posts "@pullfrog review" only when `--wait-seconds` is above 0.**
- **`orbit-api`'s Pullfrog runs by manual dispatch only.**
- **`gh api .../comments` without `--paginate` returns the OLDEST page**, so the newest comment looks
  missing. Always paginate when checking whether a routing comment landed.
- **The orchestrator guardrail refuses any shell redirect whose target contains a variable.** Write
  literal paths or a small node script.
- **`compose-prompt.mjs` appends EVERY ticket comment in order**, so the newest comment is the
  freshest instruction a worker sees. Post a routing comment LAST, naming the round.
- **Cloud is UNUSABLE and is being turned off by default.** On 2026-09-15 it returned an empty diff
  **five times out of five**: twice on `#76` stage 9, then on `#56` stage 13, `#545` stage 1 and
  `#547`. `materialize-cloud-result.mjs` exits 3 with `CLOUD_TASK_EMPTY` and classification
  `lost-work suspect`; the harness behaves correctly and the container is what fails. Thomas: "if
  cloud is bugged, just remove this funcionality ... just disable it by default". Ticket `#551`.
  **Do not pass `--cloud` until it lands.**
- **A Cloud container has NO origin remote, cannot fetch, and installs no dependencies reliably.** So
  a merge-forward is always local, and a Cloud handoff's `testResults` is a CLAIM. On 2026-09-15 a
  container reported "PASS: npm run type-check completed for @orbit/shared, @orbit/web, and
  @orbit/mobile" while the root type-check failed with five errors. **Re-run every check locally.**
- **SUPERSEDED: "the local worker pool is THREE". It is TWO.** See the standing instruction. On
  2026-09-16 the harness killed workers for low memory **with 11.3 GB of 31.5 GB free**, so the kill
  is a watchdog threshold rather than real exhaustion, and the machine's free memory tells you
  nothing about whether the next launch survives. **Every killed worker had already COMMITTED**, six
  of six that day. Read the worktree before assuming loss; the orchestrator then verifies and pushes
  that commit itself, which is delivery rather than editing and saves a launch.
- **Do not run a heavy local verification while two workers are up.** Every kill that day happened
  while a root `turbo type-check` or a vitest run was going at the same time as two workers. The
  pattern that worked: two workers, then verify serially once a slot frees.
- **A turbo `type-check` can report `FULL TURBO` on a file you just changed.** Trust it and you have
  proven nothing. Use `npx turbo run type-check --force` when the result is evidence, and say in the
  pull request body that it was forced.
- **`caps.workerLaunchesPerBranch` is 2 and it WILL refuse a legitimate review-fix round.** Pass
  `--relaunch-reason "<text>"` naming the new head and the new findings. Do not raise the cap.
- **The ORCHESTRATING checkout's dependencies go stale too.** On 2026-09-15 the root type-check
  failed with two `TS2307`s for `@resvg/resvg-js` and `@vvo/tzdb`, both DECLARED and both absent, so
  every local verification before the install was worthless. Install in the checkout doing the
  judging, not only in fresh worktrees.
- A stale eslint cache at `apps/mobile/.expo/cache/eslint` blocks every commit in a worktree.
- **`apps/mobile/__tests__/scripts/__snapshots__/widget-header.test.ts.snap` flips its line endings on
  its own.** Restore it and keep it out of every commit.
- **A squash merge duplicates content into every stacked branch.** Resolve by reading both sides. For
  `eslint-suppressions.json`, keep BOTH sides' deletions and the LOWER count, then prove it with
  `GITHUB_BASE_REF=redesign/main node tools/check-suppressions-ratchet.mjs`.
- **Run `npm run type-check` from the repository ROOT, never per workspace.**
- **`node tools/redesign-coverage.mjs` validates against a COMMITTED manifest that nothing regenerates
  automatically.** No CI job runs `surface-manifest.mjs` or `redesign-coverage.mjs`; they are a manual
  completion gate. So a change that deletes surfaces reports `valid` until the manifest is
  regenerated, and only then fails with `mapping surfaceId is absent from manifest`. Any pull request
  that deletes a drawn surface regenerates the manifest AND moves the ids into
  `tools/redesign-groups.json`'s `deleted` section with the decision that removed them, in the same
  commit.
- Worktree and branch debt is large and mostly harmless. Read 2026-09-15 at 14:04 UTC under State.

## The suppressed lint violations, which are now the largest block of work

Read live on `redesign/main` at `d6715cfb`, 2026-09-16 late afternoon:

    web      66 violations across 27 files   (was 180 across 54 on 52ec075e)
    mobile   90 violations across 22 files   (was 187 across 45)

**More than half went in one day**, through the screen tickets that owned them. Reproduce with a read
of both `eslint-suppressions.json` files; never trust this number, it moves every merge.

**Perfil and settings are DOWN TO ZERO**, apart from `apps/mobile/app/preferences-styles.ts` with 5,
which pull request 998 removes. What is left in those two files belongs to other screens: onboarding
(`#67`), the habit form and habit detail, the charts (`#329`), and a block of shared overlays and
primitives that no screen ticket obviously owns. **That last group needs a home.** Assign each file
to a screen ticket, or file one ticket for the shared surfaces, before the redesign can be called
finished; a suppression with no owner is how a file survives every screen pass.

**Every screen ticket already requires its own share gone**, with a strict Suppressions Ratchet
decrease, so this is not new scope: it is scope that was never counted. It is also the reason a screen
that "looks done" is not closeable, which is how `#56`, `#71` and `#76` were all found open after being
called finished.

Two rules for this work, both learned the hard way:

- **Fix the VALUE, never the count.** Never raise a count, never add an inline disable, and never
  remove a rule from the ESLint config to make a file pass.
- **A shared primitive needs a caller sweep before it is touched.** `settings-row.tsx`,
  `settings-group.tsx` and `settings-description.tsx` are used by more than one screen, so a spacing
  fix there moves gaps on surfaces the ticket does not own. Name what you found in the pull request
  body. `components/navigation/notification-bell` is navigation chrome and belongs to the shell, not
  to Perfil.

## How to run a stage, learned 2026-09-13 to 2026-09-15

- **List the open pull requests in the target repository before starting a ticket.**
- **A review order names the tests that pass with the bug present.**
- **Capture a test run to a file, never through `tail`.**
- **Read the worker's `## Assumptions` at EVERY exit, including a clean one.** They are also where a
  worker records that it corrected YOUR order. On 2026-09-15 one REFUSED an item and was right: the
  order demanded all 5,000 of a person's characters plus a version suffix inside a 5,000-character
  field. A refusal with a reason beats a guess.
- **Check the ticket's requirements against the tree, not against the worker's report.**
- **Judge a ticket against its own acceptance criteria before closing it.** Three tickets called
  finished were not: `#76` ships one empty widget string where the canvas owes two, `#56`'s calendar
  import prompt still carries three off-scale spacing suppressions, and `#71` carries thirteen files'
  worth. `redesign-coverage.mjs` cannot see any of this; it checks the MAPPING, not the ticket.
- **Grep for the BEHAVIOUR, not the identifier you expect.**
- **A stacked child is not blocked by a blocked parent.**
- **Retarget a stacked child onto the integration branch BEFORE merging its parent.**
- **Verify a Pullfrog finding against the tree before acting on it**, and verify an external-interface
  claim against the INSTALLED source. Three findings on 2026-09-15 were confirmed that way and one
  earlier one was dismissed as stale.
- **The orchestrator can clear a finding itself when the evidence is a read, not an edit.**
- **Measure a stacked branch's OWN diff BEFORE ordering its merge-forward**, against its parent's
  FINAL head rather than the head it was stacked on, with
  `git diff <parent final head>...<branch> --stat`, and put the figure in the order together with the
  check that proves it: after committing, `git diff origin/redesign/main...HEAD --stat` must report
  exactly those files.
- **A merge-forward order forbids fixing anything it finds.** Say it in the pull request body and give
  it its own round; a merge-forward carrying a behaviour change is a review nobody gave.
- **A worker order that says "read pull request N" or "fetch a branch" must run LOCAL.**
- **Post a routing comment LAST, naming the round.**


## What 2026-09-15 into 09-16 proved about reviews and checks

- **A forced `--re-review` is worth its cost.** Four times in one night it returned a NEW P1 on a
  head that already carried a green approval. The worst was 972: an empty rendered set fell back to
  a stale visibility calculation, so Select all reached habits the screen was not showing and bulk
  delete could remove them. Ask for one on any head that matters.
- **`pullfrog-approval` does not publish on a MERGE-ONLY head.** A push with a real diff publishes
  it; an `update-branch` or a bare merge commit does not, even though Pullfrog reviews and APPROVES
  that exact commit. It arrives later from the mention runs, so wait. **Never push an empty commit
  to manufacture a diff**: a required check satisfied by a commit written to satisfy it proves
  nothing.
- **A red check is not always a defect.** On 974 a `Type Check` red was `npm error code ECONNRESET`
  inside `npm ci`, while the same commit passed uncached locally. Read the log before ordering a
  round.
- **Rounds that keep opening new findings mean the STATE MODEL is wrong.** 973 took six. Rounds 3
  and 4 each fixed one finding and opened the next, until round 5 replaced four disagreeing replay
  flags with one state. Order the model change rather than a third guard.
- **A test that was never shown to fail has not been shown to notice anything.** 971 shipped eight
  press tests that all stayed green with both handlers replaced by no-ops. The order that fixed it
  required running that no-op experiment and capturing the output before and after.
- **A worker killed for memory or ceiling has usually COMMITTED.** All six did. Read the worktree
  before assuming loss. The orchestrator may then run the verification and push that commit itself,
  which is delivery rather than editing and saves a launch. Say so plainly in the pull request body,
  and never claim red-first runs that happened only inside the killed session.
- **A refusal with a reason beats a guess.** `#551` round 1 was pointed at `main`, where no Cloud
  system exists at all, and the worker stopped before editing anything rather than inventing a
  config block. Verify such a refusal, then fix the ORDER.
## What 2026-09-16 added, on top of the 09-15 lessons above

- **The orchestrator verifying and pushing a killed worker's commit is the normal path now, not a
  salvage.** Six times that day. The shape: read the worktree, restore the two snapshot files that
  flip their own line endings, re-run the checks from a clean tree, PROVE RED by reverting only the
  source files to the commit's parent and re-running the new test, restore, push. Then say plainly in
  the pull request body that the worker was killed and that none of ITS numbers are quoted.
- **Reverting only the source file is how you prove red after the fact.** `git checkout <sha>~1 --
  <source files>`, run, capture, `git checkout <sha> -- <same files>`, confirm the tree is clean. It
  works on a commit somebody else wrote, which a red-first run inside a dead session does not.
- **A worker that corrects your order is usually right.** Three times that day: the 543 worker put the
  React Native flag override in a config plugin instead of `MainApplication.kt`, because
  `.gitignore:86` ignores the generated `android/` tree; the 994 worker read why the Skip path routes
  with `from=onboarding` before deciding the empty-draft case; the 545 worker ran the lint rule rather
  than trusting the five line numbers the order listed, and two of them were already on scale.
- **A red check is not always a defect, and the log says which.** `React Doctor` on 994 was npm
  failing to resolve `@sentry/core@10.75.0`. `Type Check` on 974 was `ECONNRESET` inside `npm ci`.
  SonarCloud is red on 987 and 992 and does not gate `redesign/main` at all.
- **Cross-repo evidence closes a review finding without an edit.** Pullfrog blocked `orbit-api` 527
  for publishing a field no client consumes, which is what deploy-API-first REQUIRES. Quoting the
  ticket's own out-of-scope line, the consumer pull request and the repository contract cleared it and
  the check went green. Same on UI 997, where the canvas at
  `design/canvas/Orbit Widget Android.dc.html:57` already records the empty-line split as work the
  implementation owes, so no canvas edit was needed or allowed.
- **A sweep that finds more than its ticket owns files a ticket AND says so on the pull request.**
  `#473`'s sweep found eight more sheets that navigate while presented; `#561` carries them.

## What the night of 2026-09-16 added, on top of everything above

- **Recovering a killed worker's commit is now the normal path, and it ran FOUR more times.** Every
  worker the harness killed for low memory had already committed, and two of the four also left a
  clean tree. The shape that worked, in order: read the worktree, decide whether the tree is CLEAN
  or DIRTY, and let that decide who finishes it.
  - **CLEAN plus a complete commit: the orchestrator verifies and pushes it.** That is delivery, not
    editing, and it saves a launch. Done on `#473`, `#558` and `#560`.
  - **DIRTY with an unfinished edit: relaunch the worker.** No orchestrator verification can finish
    a half-written file, and committing one pushes a change nobody completed. Done on `#560`'s first
    kill, whose log ended mid-sentence on a test regex.
  The same session took both answers within an hour, and the input, not the preference, decided it.
- **Proving red AFTER the fact works on a commit somebody else wrote, and it is the only honest
  evidence for a dead session's work.** `git checkout <sha>~1 -- <only the source files>`, run the
  new test, capture, restore, confirm the tree is clean. It produced exactly the expected failures
  three times: one assertion on `#473`, two on `#560`, two on `#558`. **Never quote a killed
  worker's own numbers**; say in the pull request body that it was killed and that none of its
  figures are quoted.
- **`gh`'s own declared field set is installed-source proof, and it closed a finding with no code
  change.** `gh pr view <n> --repo <r> --json` with NO value makes the installed binary print every
  field it accepts. That settled whether `baseRefName` is real on `#558` without a live call and
  without `--help`. **The follow-up review then asked for the same proof to be IN THE PULL REQUEST
  BODY, not only in a thread reply, and it was right**: a reply is not the record.
- **An order can be wrong, and the worker that refuses it can be more right than the orchestrator.**
  On `#543` a worker stopped without editing and said the order contradicted the Android API. It was
  half right: `View.js:82-84` reads `processedProps.focusable = !tabIndex`, so `tabIndex` is only a
  spelling of `focusable` and one bit serves both arrow and Tab traversal. The order was corrected
  with `ReactViewManager.kt:204-211`, which wires `nextFocusForward` to `view.nextFocusForwardId`
  separately from that bit. **But the correction was ALSO wrong**, and the next review found three
  P1s proving it: a reusable `RadioGroup` cannot know what follows it, so "point `nextFocusForward`
  past the group" is unimplementable, and the worker built a transparent focusable sentinel view
  instead, which is an invisible keyboard stop. Neither `opacity: 0` nor
  `importantForAccessibility="no"` makes a view non-focusable.
  **The lesson is narrower than "listen to the worker": the roving single-tab-stop pattern is a WEB
  ARIA convention, and a native Android radio group is a set of individually focusable buttons.**
  An order that imports a web pattern into a platform adapter is the defect. The worker's first
  escalated option, accepting a focus stop per option, was the platform-correct answer all along.
- **A review that keeps finding the same class of defect after a model change means the model has a
  writer outside it, not that the model was wrong.** `#557` reached round 10. Round 9 collapsed
  `authTransitionInFlight` and `isAuthenticated` into one session phase and was correct; round 10
  then found `checkAuth` at `auth-store.ts:493` publishing `signed-in` directly, and round 11 found
  the token refresh at `:289` advancing `sessionGeneration` under an establishing login. Each is the
  same model with one more writer left outside it. Finish the model; do not guard it from outside.
- **Removal closes a review argument that four rounds of patching could not.** `orbit-api` 521 drew
  five reviews on one recurrence projection, and each was right. Round 4 DELETED it: 136 deletions
  against 3 insertions, and `dayShift` no longer appears under `src/`. All four open threads resolved
  on that evidence in one pass. When a computation cannot be made correct inside a pull request's
  scope, taking it out is the answer, and the defect it was circling gets its own ticket.
- **`list-bot-threads.mjs` with `--wait-seconds 0 --no-request` is the cheap read.** Without those
  flags it posts `@pullfrog review` and waits up to fifteen minutes, which cost one five-minute stall
  before the flags were used. It also RECORDS every thread id it prints, which is what clears
  `forbid-invented-identifier.mjs`: an id read through raw GraphQL is refused even when it is
  correct, and that refusal is right, because the rule is that the id must be mechanically traceable
  rather than merely true.
- **A background `timeout 590 node tools/test-tools.mjs` can exit 124 with zero failures when two
  workers are running.** The suite is not failing, it is being starved. Re-run it unbounded rather
  than reading the truncation as a result.

## What the night of 2026-09-17 added

- **A ticket that reads blocked is a lead, not a fact, and three were wrong in one night.** `#58` was
  already delivered by the `#329` stack; `#373` shipped in PR 997 the day before and nobody closed
  it; `#329` itself needed only one stale suppression removed. `#76` was recorded as blocked on api
  `#372`, and `orbit-api` PR **527 was already MERGED**, so the blocker had been gone for a day.
  **Check the tree against the acceptance criteria before you build or before you report a block.**
- **An already-done ticket gets a comment and a closure, never an empty pull request.** Two workers
  asked which; both times the answer is the closure. An empty pull request proves nothing, costs a
  Pullfrog review, and records a delivery that did not happen. Write the per-criterion evidence into
  the closing comment so the judgement is auditable.
- **A fresh worktree has NO `node_modules`, and a worker launched into one produces nothing.** `#63`
  burned a whole launch discovering it: every `rg` and every test failed and it exited clean with
  zero commits. `create-worktree.mjs` does not install. **Run `npm install` and confirm 961 entries
  before composing the prompt.** Two of the worktrees made that night did get dependencies and five
  did not, so check rather than assume.
- **A pull request body can lose every newline, and then a heading is not a heading.** 992's
  `Redesign Review Harness` failed three times reporting no `## Review harness` block while the block
  was plainly in the body: it sat mid-paragraph because the whole body was one line. Reflowing it
  without changing a word made the gate pass. **Read the body as the gate reads it before you
  re-run a sweep.**
- **`--match-head-commit` refuses a reconstructed sha, and that is the guard working.** A merge was
  rejected with `Head branch was modified` because the sha had been typed from memory rather than
  copied from the run's own output. Copy it from `gh pr view --json headRefOid` every time.
- **A label alone never fixes a red parity run.** 1006 needed `parity:exempt` AND a body edit to fire
  a fresh `pull_request` event, because the failed run carries a payload without the label. The body
  edit was already required for its sweep block, so one action cleared both.
- **`rmdir` is the safe tool for install debris, and a junction can point at the main checkout.**
  `tools/test-tools.mjs` died on `ERR_MODULE_NOT_FOUND` for `sharp`, then `fast-check`. Neither was
  missing: a worktree's `tools/node_modules` is a JUNCTION to `orbit-ui-mobile/node_modules`, and
  that directory held **956 empty package directories** left by an install the machine killed.
  `rmdir` cannot remove a populated directory, which is why it was the right tool. **Check for a
  junction before operating on any path inside a worktree.**
- **Docker's VM is what kills workers here, and it is not ours to stop.** `vmmemWSL` held 7.8 GB with
  `free -m` inside reporting 5,719 MB genuinely used against 719 MB of cache, while `leap-full`,
  `leap-pg-db` and `leap-redis` were running indinero work. `dotnet build-server shutdown` returns
  about 1.3 GB that api rounds leak into `VBCSCompiler`; beyond that, drop to one worker at a time.
- **A ticket body can carry an instruction that is actively wrong, and executing it destroys live
  work.** `#67` says to delete the feature guide. `#73` says in its own Problem section that this
  instruction is wrong and a worker must not execute it, and PR 1005 had rewritten that exact drawer
  hours earlier. The correction went onto `#67` as a comment BEFORE the prompt was composed, and the
  branch left the guide untouched. **Post the correction to the ticket, because the worker reads
  comments and not your reasoning.**

## What the night of 2026-09-17 into 09-18 added

- **A verification is only worth the tree it ran against.** Three tickets were verified for closure
  from an orchestrating checkout that was FIVE commits behind `origin/redesign/main`, because
  `git fetch` had run and `git merge --ff-only` had not. Every verdict survived the re-check, but one
  number in a durable closing comment was wrong and had to be corrected in public. **Fast-forward the
  root checkout after every merge, before reading the tree for anything.**
- **A ticket verification that finds a miss produces work, not a closure.** `#74` looked finished and
  was not: `goals.detail.askAstraEyebrow` was `"ASK ASTRA"` with no caller anywhere, and it was the
  only reason `tools/copy-baseline.json` had entries. The gate's own message says "the whole-app copy
  pass (R19) clears it", and R19 IS `#74`, so closing it would have signed off the one thing it
  exists to do. Shipped as 1013 instead.
- **A red `Unit Tests` can be a coverage FLOOR rather than a broken assertion.** 1001 failed with
  every test green: `ERROR: Coverage for functions (95.98%) does not meet global threshold (96%)`.
  Adding a branch without covering the file's untested functions moves a global ratio. Reproduce with
  `npm test -w @orbit/shared -- --coverage`; the fix is to cover the functions the pull request owns,
  never to move the floor.
- **`--only` changes how a contended failure is diagnosed.** `#585`'s full run produced one FAIL whose
  payload was `"results":[{"status":null,...}]`, a child killed by a SIGNAL under two workers. Proving
  it was contention cost 72 seconds with `--only create-worktree` instead of another fifteen minutes.
- **A printed number can disagree with the run that produced it.** `#585`'s per-tool tally was taken
  before the last assertion and printed afterwards, so every table summed one short. Pullfrog gave
  the exact arithmetic, `10 + 6` under `Assertions: 17`, and it reproduced first try.
- **The step 6 sweep finds things a diff review does not.** Running it on 1001 found that the row
  wrapper kept `hover:bg-[var(--bg-elev)]` while the button inside became `disabled`, so a refused
  event still lit up as actionable. Fetch both SKILL.md files by raw URL from
  `github.com/jakubkrehel/skills`; `npx ui-skills get` does not serve them.
- **`better-interface` rule 5 is a real constraint on what may be reported.** Whether a disabled
  control announces its `aria-describedby` is runtime behaviour, so it cannot be reported from source
  alone. A citation around a guess is still a guess.
- **A generated baseline is resolved by REGENERATING, never by hand-merging.** 1002's
  `apps/web/eslint-suppressions.json` conflict was resolved by taking the base wholesale and running
  `npm run lint:prune -w @orbit/web`, which removed 112 lines and converged on what the linter
  actually finds.
- **A squash merge retargets a stacked child by itself.** 1010 moved from
  `chore/ticket-560-sweep-order` to `redesign/main` the moment 991 merged. The trap is
  `--delete-branch`, which was never passed.
- **`complete-ticket.mjs` without `--preflight` closes silently and its output looks identical.**
  Post the evidence comment BEFORE calling it, or the closure lands with no record.
- **Provider capacity fails fast and clears fast.** One worker died in 19 seconds on
  `ERROR: Selected model is at capacity` while another launched a minute earlier ran fine. Relaunch;
  external is an ending only when it does not clear.
- **A worker that verifies before it commits can lose 45 minutes.** Two hit the ceiling with a dirty
  tree and zero commits. The continuation order that worked says: focused tests, COMMIT, then full
  verification.

## What the night of 2026-09-17 into 09-18 added, second pass

- **A ticket body's SUMMARY of a review finding is not the finding.** Two separate misreads in one
  night, both caught by opening the source. `#573`'s body said the three-dot menu failed "after a
  search", which Thomas never said. And a P1 titled "Depend on the stable permission callback" was
  judged unfixed from its title, when its body says the complaint is that the whole `push` OBJECT was
  a dependency, which had already been fixed. **Read the thread body and the tree, never the title or
  the paraphrase.**
- **`hitSlop` is dead on Android whenever an ancestor's box does not contain it.**
  `TouchTargetHelper.kt:186-208` descends into a child only when the point is inside the parent's
  bounds or its overflow inset; `:251-259` reads `hitSlop` only from the view that DECLARES it; and
  `SurfaceMountingManager.kt:920-927` derives the overflow inset from computed LAYOUT, so it never
  carries slop. **A negative margin on a control inside an unstyled wrapper shrinks the wrapper below
  the control and kills every pixel of its slop.** The fix is a real box, never more slop.
- **A squash merge's arrival proof is the MERGE commit, never the pull request head.**
  `git merge-base --is-ancestor <head> <base>` fails on every squash merge and looks like the merge
  did not land. Use the `mergeCommit.oid` that `gh pr view` returns.
- **`mergeStateStatus` reads `UNKNOWN` for about twenty seconds after a sibling merges**, while
  GitHub recomputes mergeability. Re-read it; do not act on it.
- **`list-bot-threads.mjs --re-review` still returns on an empty-bodied progress marker**, which is
  `#541`'s defect and it fired again tonight. The authority is the LAST review of the exact head plus
  the newest `pullfrog-approval` check run at that head. Both were read directly through
  `gh api .../reviews` and `.../check-runs` before every merge.
- **A red `pullfrog-approval` whose workflow run concluded `success` is a REVIEW verdict, not an
  infrastructure failure.** On 1015 the run succeeded at 21:49:43Z and the check still failed,
  because Pullfrog found a real P1. Read the run's conclusion before assuming provider overload.
- **The orchestrator finishing a killed worker's commit now has a companion rule: check WHAT is
  dirty, not just whether anything is.** Both reaped workers showed two modified files, and both were
  `widget-header.test.ts.snap` and `theme.test.ts.snap`, which flip their own line endings. That is
  the CLEAN case wearing the DIRTY case's clothes. Restore those two, then decide.
- **A worker stopped by the HOST for system memory is not the Orbit harness and not Thomas.** It
  leaves no `outcome` field, because the launcher itself is what died. Read the worktree; both had
  committed.
- **Splitting a round beats raising its ceiling.** `#67` round 4 carried five findings AND the step 6
  sweep and died at 75 minutes with two findings unreached. Round 5 carried two findings and no sweep
  and finished in 7m47s.
- **A pull request may ship without its `## Review harness` block, and the gate going red is
  correct.** 1017 and 1018 were delivered by the orchestrator after their workers were stopped before
  step 6. Writing seven lines for a sweep nobody ran is forbidden, so the block was omitted and both
  bodies say what is owed. The sweep is a separate round.
- **The step 6 sweep finds real defects, again.** `#481`'s sweep fixed focus timing, toast alignment,
  duplicate alerts and localized decimals, and checked all 14 input and 12 pressable production
  callers of the two shared primitives the diff touched.

## State

Read live 2026-09-18 at 00:35 UTC.

`redesign/main` is **`63e8774d`**. `main` is **`7771c79a`**, and **Orbit 1.3.30 (89) is on the Play
OPEN track** off it, run `35259661979`, which carries pull request 1011. `orbit-api` `main` is
unchanged at `fd219126`.

**224 tickets open** across the three repositories, down from 227. **15 open in the `539 Redesign`
milestone**: `#67`, `#75`, `#78`, `#175`, `#217`, `#318`, `#320`, `#367`, `#460`, `#475`, `#479`,
`#481`, `#520`, `#543`, `#545`.

No stashes and no detached HEADs in any repository. `orbit-api` and `orbit-landing-page` checkouts
are clean. Every `orbit-ui-mobile` worktree is clean; the only unpushed commit anywhere is
`1890341c` in `ticket-58-achievements`, which is the pre-squash form of merged pull request 1014 and
is therefore disposable.

### Merged this session, three

To `redesign/main`: `1012` (`23961de0`), `1014` (`38cca272`), `1010` (`63e8774d`). Each proven to
have arrived by the MERGE commit being an ancestor of `origin/redesign/main`. **For a squash merge
that is the only valid proof**: the pull request HEAD is never an ancestor, and checking the head
fails misleadingly.

### Closed this session, four

`#585`, `#570`, `#461` completed with a per-criterion table each. **`#573` CANCELED as superseded**,
because its title and body quoted Thomas saying the three-dot menu failed "after a search" and he
never said that. Its closing comment records what pull request 1011 did fix and what it did not.

### Filed this session, one

**`#590`**, the three-dot tap and the search keyboard, with the root cause proven from installed
source. See `### The three-dot defect, solved` below.

### Open pull requests, every one

| PR | base | ticket | disposition |
|---|---|---|---|
| **1015** | `main` | `#590` | **BLOCKED on one real P1.** `Keyboard.dismiss()` is reachable during React render, because `useTodayViewSync` calls `closeSearch` while rendering active-view and pinned-date changes. Thread `PRRT_kwDOR5Siws6ji8aZ`, `use-today-search.ts:22`. Move it to a committed lifecycle or event path. `Cross-Platform Parity` is also red and needs a fresh `pull_request` event after the `parity:exempt` label. |
| 1018 | `redesign/main` | `#481` | Sweep DONE and in the body; head `3da49c08`. Awaiting review. |
| 1017 | `redesign/main` | `#475` | A worker is on its step 6 sweep now. Head `99d74996` until it pushes. |
| 1016 | `redesign/main` | `#520` | Acceptance verified independently: `check-surface-scope.mjs` navigation findings 12 to 0. Needs its step 6 sweep and a review. |
| 1007 | `redesign/main` | `#67` | Head `8e297420`. All five P1 threads answered. Needs a fresh review. |
| 1002 | `redesign/main` | `#545` | Threads resolved at `60cd943d`. Awaiting a review that can approve. |
| 1001 | `redesign/main` | `#562` | Head `954c6279`, its one P1 replied and resolved. Coverage now 96.36 percent against the 96 floor, so **merging it also clears 992's red**. |
| 992 | `redesign/main` | `#543` | Head `e818a478`. Its `Unit Tests` red is that coverage floor; order it after 1001. |
| api 528, 521 | `main` | `#529`, `#526` | Untouched this session. Orders must be re-derived from the threads. 521's `Dash Ban` is already cleared. |
| Dependabot | both repos | | Leave. Not this effort. |
| `orbit-landing-page` | 5 open | | Leave. Batch 3 owns that repository. |

### The three-dot defect, solved

**This is the answer to the bug Thomas has reported since `#134` and nobody found.** It is NOT
related to search, and pull request 1011's `keyboardShouldPersistTaps` theory was refuted by his own
test on 1.3.30, the build that carries it.

Proven from installed source, every claim read rather than remembered:

- `habit-row-styles.ts` gave `menuButton` `width: 34, height: 34, margin: -3`.
- `MenuAnchorHost` in `anchored-menu.tsx` rendered `<View ref={anchorRef} collapsable={false}>` with
  **no style**, so the host sized to the child's MARGIN box: **28x28** around a 34x34 button.
- `habit-row-trailing.tsx` declared `hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}`.
- `TouchTargetHelper.kt:186-208` descends into a child only when the point is inside the parent's
  bounds or the parent's overflow inset. `:251-259` reads `hitSlop` ONLY from the view that declares
  it. `SurfaceMountingManager.kt:920-927` derives the overflow inset from Fabric's computed layout,
  never from hitSlop.

**So the declared hitSlop was entirely dead on Android** and the live target was 34dp, under
`DESIGN.md:688`'s floor of 44 minimum. `resolveTrailingLayout` put `cardPaddingRight: 16` of
handler-free card to its right, so a near miss landed on nothing. Deterministic by thumb position,
which is why it read as intermittent.

`redesign/main` already carried 44x44 with no margin and no hitSlop, which is the control for the
diagnosis, and 1015 converges `main` onto it. The 16dp gained is paid back exactly:
`cardPaddingRight` 16 to 8 and `trailing.gap` 10 to 8, so the glyph's right edge stays at 21dp.

**Ruled out, so nobody re-chases them:** `removeClippedSubviews={true}` on the All-view FlatList is
not the cause, because `ReactViewGroup.kt:540-544` recurses clipping only into a child that itself
sets it, and the date-group Views do not, so the clip unit is a whole off-screen cell. A drag gesture
is not the cause either: the All branch renders a plain `FlatList`.

**The search half, corrected.** Pull request 1011 DID fix the mobile X, verified by reading the
merged diff at `7771c79a`: the old handler was
`if (draft.length > 0) { setDraft(""); return } onCancel()` and 1011 replaced it with
`onPress={onCancel}`. What is still broken is the **soft keyboard**, which no path dismisses:
`ReactEditText.kt:864` `hideSoftKeyboard()` has exactly two callers, neither of them an unmount, and
`ReactTextInputManager.kt` declares no `onDropViewInstance` that hides it.

**`#134` stays open by design** and only Thomas closes it, by tapping the control on a device. Its
root cause is now recorded on it, replacing `apps/mobile/CLAUDE.md:32`'s wrong one, which blames a
react-native-screens patch that touches only iOS files on an Android-only product.

### The parallelism decision, measured and SHIPPED

Recorded here because `#585` is closed and the numbers must survive it. Taken on this machine under
the same two-worker load as the serial baseline:

| variant | elapsed | result |
|---|---|---|
| serial, what ships | **970.3s** | 1,765 assertions, 0 FAIL |
| parallel, 4-process pool from `7bbbb796` | **373s** | 0 FAIL |
| parallel, same code, next run | **454s** | **5 FAIL** |

Materially faster and NOT deterministic, so serial ships. The flaky cases are in
`create-worktree.mjs`, which stages temporary directories. Two earlier runs at 325s and 390s both
exited 1 for CONTAMINATION, not flakiness: staging `7bbbb796`'s harness into today's tree leaves
`lib/integration-branch.mjs` and `lib/review-harness.mjs` unregistered. Do not cite them.

**`node tools/test-tools.mjs --only <name>` now exists**, so re-checking one module costs about 5
seconds instead of roughly sixteen minutes.

### The redesign gate, measured

`node tools/redesign-coverage.mjs` reports **`redesign coverage valid: 184 manifest surfaces
accounted for, 14 deleted, 3 excluded`** at `63e8774d`. That half of batch 1's exit condition is MET
and was re-run on the current tree.

The other half is the 15 milestone tickets. Of the five verified unbuilt on 2026-09-17, **three are
now built and in review** (`#520` as 1016, `#475` as 1017, `#481` as 1018) and **two remain**:
`#460` and `#479`. `#460` has a worktree with dependencies installed at
`ticket-460-notify-announce`, branch `fix/ticket-460-notify-announce`, and no commits yet.
`#175` is blocked on the suppressions reaching zero, `#217` on `#67`, and `#318` needs Thomas.

### Tickets

Re-derive, never trust a list:

    gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400
    gh issue list --repo thomasluizon/orbit-tickets --state open --milestone "539 Redesign" --limit 400

### The suppressed lint violations

`redesign/main` reads 26 files on web and 20 on mobile. 1002 takes the entry counts to 20 and 16.
Reproduce with a read of both `eslint-suppressions.json` files; never trust this number, it moves
every merge.

## Open questions

**None are his.** A `/questions` round tonight enumerated twelve candidates and exactly one survived
the filter; he answered it and it is recorded on `#529`. Everything else closed against the code, a
ticket comment, a brain note or a primary source, and each disposition is on the ticket that needed
it.

The only external endings remain the GPT Sol allowance, which he resets by hand, and provider
capacity. If a worker or a Pullfrog run fails for quota or capacity rather than for code, that is
external and it is reported as external.

### Answered 2026-09-16 evening

- **API keys: gate BOTH listing and revoking.** Offered three paths, he took the strictest. The
  consequence that matters is on `#529`: the enforcement reads
  `AppConfigKeys.RequireApiKeyCreationStepUp`, which defaults to **false**, so the switch has to be
  flipped in `AppConfigs` AFTER the server deploy or the ticket ships inert.
- **The interval and ordinal calendar rules on `#562` are DECIDED, not his.** Both refuse, visibly,
  on the review surface before the person taps import. Importing a schedule the person did not pick
  is the worse failure.
  **CORRECTED 2026-09-17 into 09-18, against the installed `orbit-api` source.** The reason recorded
  here, that "neither shape can be encoded honestly", was half wrong and the halves need separating.
  - **The ORDINAL refusal is right and was too narrow.** `ORDINAL_WEEKDAY_PATTERN` only recognised
    the `2MO` prefix, so `BYDAY=MO;BYSETPOS=2` passed as importable and became every Monday. Google
    writes "the last weekday of the month" the same way, with `BYSETPOS=-1`. Fixed in `b1c2774b` on
    1001: either spelling now refuses.
  - **The INTERVAL refusal is wrong.** `Habit.IntervalWeeks` exists and
    `HabitScheduleService.IsActiveIntervalWeek:670-684` applies it as an active-week filter over
    `Days`, so "every other Monday and Wednesday" IS representable. What is missing is the ENDPOINT:
    `BulkHabitItemRequest` at `HabitsControllerRequests.cs:65-85` carries no `IntervalWeeks`, so
    `POST /api/habits/bulk` drops it while the single create and update endpoints accept it.
  - **A third defect sits underneath and the refusal was hiding it.**
    `parseCalendarSyncRecurrence:150-156` maps `INTERVAL` onto `frequencyQuantity`, which for a
    weekly rule means "twice a week" rather than "every second week". Lifting the refusal without
    fixing that mapping would import a WRONG schedule rather than none.
  - Filed as `#588` (api, add the field to the bulk item) and `#589` (ui, blocked by it).
- **991's "open question for the human" about the Cloud sweep is DECIDED**, not his: the sweep runs
  in the local materialization lane, because a Cloud container has no origin remote and cannot fetch,
  and the sweep is nothing but fetches.

## Copy, which is yours

Landed 2026-09-14 into 09-15: the deletion warning and its Pro variant,
`profile.freshStart.description`, the support field and send reasons, `shareCard.stats.goalsClosed`,
`wrapped.slides.goals.some`, `wrapped.slides.consistency.summary` and `.even`, the three
`progressScreen.streak.repair*` strings, `profile.support.offlineReason` rewritten to promise only
local retention, and `profile.support.subjectSendingReason`.

Still to write:

1. **The feature guide's rewritten entry sets** for About stage 3.
2. **Onboarding stages 2 to 9** (`#67`), almost entirely copy.
3. **The 32 shortened control labels** for ticket `#74`, across 58 sites in both locales.
4. **The widget's second empty string** for `#76` stage 9. Decided: `Nothing scheduled` and
   `Nada agendado`, with `widget_all_clear` untouched for the everything-done case.
5. **The support version line** for `#73`.
6. `progressScreen.achievements.lockedBody` was REVIEWED and KEPT as "Orbit Pro tracks achievements
   and XP." Do not reopen it.
