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
  being shown the 367 suppressed violations across 99 files. They were not a separate cleanup effort
  to be scheduled later: every screen ticket carried its own share, and the screen tickets drove both
  baselines to zero. `#175` then deleted them and the ratchet that read them. "As fast as
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
- **2026-09-24** **The new machine takes more workers.** "this is a macbook pro with m5 pro and 64gb
  of ram, which means we can probably use a lot more workers." This supersedes the cap of two above:
  `caps.parallelTickets` is 6 (see "The machine, and the real worker cap"). Same message: "change
  the default worker to codex, and make it use GPT-6 Sol as the model."
- **2026-09-16** **Copy he asks you to apply still gets both passes first.** On the Play listing
  text: "first make sure all the texts adhere to brand.md and run /humanizer on them." Copy being
  yours does not mean copy skips review; it means the review is yours to run, not his to sit through.
- **2026-09-16** **Beta licences the easy path on sequencing, and only on sequencing.** "i dont care,
  the app is in beta, and basically only i use it, theres no problem in doing the easy approach, no
  matter if it will break (for now)." This narrows deploy-API-first while the fleet is him alone. It
  does NOT narrow "always the best implementation": it buys a simpler deploy order, never simpler code.
- **Standing** Ticket `#74` owns existing copy.
- **2026-09-16, clarified 2026-09-24** **`/handoff` always ENDS the session.** "after i run /handoff,
  the session is
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
- **2026-09-18** **A worker editing `node_modules` is YOUR failure, and the question is closed.**
  Asked a fifth time where two edited files inside `node_modules/react-native` came from: "IT WAS NOT
  ME, ITS YOUR WORKERS DOING THIS SHIT, AND I ALREADY TOLD YOU TO STOP DOING THAT. YOU CREATE THE
  WORKERS, THIS IS YOUR RESPONSIBILITY." Never ask him again, never investigate the origin, and never
  let a session re-open it. Every worker order forbids editing anything under `node_modules`; a
  dependency that genuinely needs changing means `patch-package`, a config plugin, or stopping and
  reporting. `#601` carries the prohibition, the hook and the detection.
- **2026-09-18** **The failed-delete toast pauses on hover and focus.** Offered a pause, a Dismiss
  button, or leaving it as it was, he took the pause. It is a granted design-system change and the
  one action stays Retry. Recorded on `#460`.
- **2026-09-24** **A blocker is acted on in the same run.** After a run marked a PR blocked on the
  review-fix cap: "a blocker is something you act now, stop being lazy / just fix the damn thing".
  A spent cap, a missing secret or a missing log is the next piece of work, never a stopping point.
- **2026-09-24** **CI congestion is fixed permanently, before anything else.** "put on the handoff
  that the FIRST PRIORITY is to fix this CI congestion permanently, this cant happen again." Then, at
  `/handoff`: "handoff fixes the ci congestion, merge the prs and continue the work in sleep mode."
  The evidence and the candidate fixes are in `### The CI congestion, measured` under the
  2026-09-24 night section at the end of this file.
- **2026-09-25** **Route by subject, and never ask about it again.** "i already said a million times
  anything related to the redesign stays on redesign/main anything NOT RELATED to the redesign goes to
  main, as simple as that". Asked anyway about `api#531`: "this is related to the redesign, so keep on
  the redesign/main branch on the backend, stop asking me about this". This restates the 2026-09-14
  `orbit-api` line above and extends it to every repository. A bug fix to shipped behaviour, a harness
  or CI change and a security fix target `main`; redesign-only work targets `redesign/main`. When a
  non-redesign fix depends on redesign-only code, it lands on `redesign/main` AND gets a `main`
  backport PR (the `ui#1057` / `ui#1052` pattern). Brain ADR D80 carries the amendment.

- **2026-09-25** **The Mac never sleeps mid-session.** "fix this problem now and continue the work. my
  computer cant go to sleep mid-response." A run died when macOS idle-slept (`pmset` sleep is 1
  minute). Fixed by a user-scope hook, `~/.claude/hooks/keep-awake.mjs` on SessionStart and
  UserPromptSubmit, which holds `/usr/bin/caffeinate -ims -w <claude pid>`. Closing the lid still
  sleeps the Mac; only `sudo pmset -a disablesleep 1` stops that.
- **2026-09-25** **The CI multipliers are the priority.** Asked whether the admission cap was a real fix:
  "prioritize this work now", then "just go with your recommended" (raise the cap for this run only to
  launch `#667` and `#668`, then revert; done and reverted).
- **2026-09-25** **Turn off "require branches to be up to date" on `main` in both code repositories.**
  Answered at `/wrap-up` ("Turn it off"). Merge queue is impossible here: GitHub's docs source
  (`data/reusables/gated-features/merge-queue.md`) says merge queues are "available in any public
  repository owned by an organization", and both repositories are User-owned. DONE 2026-09-25 (session
  `205c74ca`), brain ADR D138.
- **2026-09-25** **Turnstile goes live only after sign-in sends a token.** "Add it to sign-in, then turn
  on." Recorded on `#107`. The landing waitlist already renders the widget; web and Android sign-in do
  not, so the API check stays off until they do.
- **2026-09-25** **Never put the locale in an auth or deep-link URL.** Asked whether every redirect URL
  needs a `pt-BR` twin: no route or callback has ever carried the locale (`[locale]` route dirs: 0 on
  both branches), so one callback URL serves every language. The two `/pt-BR/auth-callback` entries in
  Supabase are dead and can be deleted.

## The order: the batches to a production release

**Re-read live on 2026-09-19 and rebuilt from the board, not from the previous ordering.** 103 open
tickets across the three repositories, down from 231 on 2026-09-17. By repository: 78 `repo:ui`, 24
`repo:api`, 1 `repo:landing`. By milestone: 96 carry none, 3 `562 Astra`, 2 `Harness Context and
Calibration`, 1 `539 Redesign`, 1 `Launch`.

**Every open ticket appears in exactly one batch below.** A batch ships before the next one starts,
because each removes a reason the next would have to be redone. Inside a batch, order is free.

**Twenty tickets were filed on 2026-09-18 into 09-19 and are placed here for the first time**:
`#610`, `#611`, `#612`, `#613`, `#615`, `#616`, `#618`, `#619`, `#620`, `#621`, `#622`, `#623`,
`#624`, `#625`, `#626`, `#627`, `#628`, `#631`, `#632`, and `#614`. Three more were filed and then
cancelled the same night: `#586`, `#629` and `#630`, all killed when Thomas decided a widget row
should only open the app.

### Batch 0a: DONE

`#585` is closed. `node tools/test-tools.mjs` now takes `--only <name>`, which is what made every
harness ticket below affordable to verify. It still carries `#627`.

### Batch 0b: the harness, before the redesign

**Thomas moved this ahead of the redesign on 2026-09-17: "i want this batch before the redesign."**

Still open from the original list: `#575`, `#560`, `#559`, `#558`, `#556`, `#546`, `#544`, `#542`,
`#541`, `#530`, `#528`, `#525`, `#521`, `#455`, `#598`.

**New, and three of them cost real time on 2026-09-18 into 09-19:**

- **`#627`** — two `create-worktree` cases use one number as both the kill deadline and the pass
  budget, so they fail inside the full gate and pass 9 of 9 alone. Measured both ways. **Take this
  first in the batch**: it makes every other ticket here verifiable without a false red.
- **`#624`** — the order generator never tells a worker to commit per layer, never says pushing is
  not delivering, and never says the pull request body is part of the work. Three workers stopped one
  step short of delivery in one night, once with 84 files staged and zero commits.
- **`#610`** — `salvage-worker` reports a green suite as failed, because `spawn` cannot start a
  `.cmd` on Windows and four outcomes share one exit code. **Pull request 1033 is open and has never
  been reviewed.**
- **`#611`** — refuse a worker launch into an occupied worktree.
- **`#613`**, **`#618`**, **`#619`** — three gates that do not gate: two never run their check on a
  pull request, an eslint `ignores` entry silences a `local/*` rule with both gates green, and seven
  `guards.yml` predicates skip green when the base ref fails to resolve.

**Why it earns the front, unchanged:** these are the gates every batch below runs THROUGH, and
several are lying. A batch that runs on gates which do not gate produces work nobody can trust.

Two standing rules for this batch: **re-read each ticket against the tree before building it**,
because several describe a state the last two weeks already changed; and a harness ticket is never
filed as a substitute for fixing something.

### Batch 0c, shipping now: the live Android defects

`#574` (measure the habit list's render counts, then cut them), `#563` (three Android checklist
defects), `#557` (Android says you were signed out while the session is alive), `#500` (a dismissed
reminder can still be presented), `#495` and `#493` and `#499` and `#501` (the widget: reintroduced
size-keyed RemoteViews, the previous account's rows held on screen, an unannounced refresh spinner,
and a colour generator run on an undeclared file).

**Why first:** these are defects a person hits in the shipped build today. They target `main` under
D99, and a release follows with `/android-release` to the open track. Everything else in this spec is
work nobody outside this machine can see yet.

### Batch 1: close the redesign

**The account-change family is the spine of this batch and it is nearly done.** In dependency order:

1. **`#612`** — web overlays keep the previous account's content. **Pull request 1029 is open at
   `a0f53299` with a P1**: its own round 3 broke a cold load of `/step-up`, so 13 tests fail with an
   empty body. Round 4 is written at `.claude/handoffs/` and six dirty files are preserved in
   `ticket-612-web-overlays`.
2. **`#615`** — gate every web Server Action write by the account that formed it. **Pull request 1030
   is open** and took the type narrowing that makes a mutating call impossible to write without an
   account. Needs a re-review at its round 2 head.
3. **`#600`** — the stores, the twin of `#612`.
4. **`#622`** — detect an account replacement on the step-up route. Related to `#612`'s P1 and worth
   reading together.
5. **`#625`** — an onboarding flush that finishes under the next account.
6. **`#631`** — **the most serious thing filed all night.** The browser keeps the last Google
   signer's Supabase session, `supabase.auth.signOut()` appears nowhere in `apps/web`, and the public
   `/auth-callback` accepts `INITIAL_SESSION`, so a later visit silently signs that browser back in
   as them. Verified on all three legs.

Then the remaining screen and polish tickets: `#620`, `#616` (closes with `#615`'s pull request),
`#603`, `#602`, `#608`, `#609`, `#604`, `#587`, `#593`, `#518`, `#519`, `#531`, `#549`, `#463`,
`#464`, `#465`, `#466`, `#458`, `#535`, `#572`, `#589`, `#592`, `#516`, `#527`, `#530`, `#533`,
`#497`.

Then **Thomas's own three**, which only he can close: `#217`, `#318`, `#320`.

**This batch ends** when `node tools/redesign-coverage.mjs` reports a valid mapping AND every screen
ticket closes against its own acceptance criteria.

### THE REDESIGN GATE, between batch 1 and batch 2a

Unchanged and absolute. Once every screen ticket is done, a run **stops** and ships a closed Play
INTERNAL build off `redesign/main` for Thomas to test as a real update. It does not merge to `main`
and does not start the next batch. **Only his approval merges `redesign/main` to `main`.**

**The merge carries one protection change, in the same moment (added 2026-09-24).** `main` requires
`Suppressions Ratchet` again, because `main` still has both `eslint-suppressions.json` baselines and
no `Lint Severity` job, so the `#617` swap had made every pull request to `main` unmergeable. The
`redesign/main` into `main` pull request deletes the ratchet and brings `Lint Severity`, so swap the
required context back to `Lint Severity` when that pull request is ready to merge. Payload shape:
`gh api -X PATCH repos/thomasluizon/orbit-ui-mobile/branches/main/protection/required_status_checks
--input <json>` with `{strict: true, checks: [{context, app_id}]}` (`app_id` 15368 for Actions).

### Batch 2a: the API contracts the UI is already waiting on

`#526` (calendar events report the account timezone day and time), `#591` (project the recurrence
timezone so a UNTIL bound converts), `#588` (the bulk habit endpoint drops IntervalWeeks), `#606`
(give every FluentValidation rule an error code and localized copy), `#628` (the standalone
sub-habit validator sends the plain habit message; **`#614` is blocked on it**), `#505` (the streak
read exposes no repairable gap), `#483` (yearly gap repair needs the streak window widened), `#571`
(record whether a freeze was spent automatically or by hand), `#454` and `#471` (descendant search),
`#532` (a Support conversation cannot reach the support tool).

**Two are already built and waiting on a deploy**: `api#521` and `api#534` are both APPROVED and need
Thomas to merge and deploy by hand on or after 2026-09-22.

### Batch 2b: every remaining ticket that changes what a person sees

`#614` (blocked on `#628`), `#632` (gate a habit log against an implausible date from a deep link;
**low priority, and confirm the deep link reaches the screen before building anything**), `#567`,
`#566`, `#565`, `#569`, `#607`.

### Batch 3: the landing page and the Play listing, together

`#509` is the only open `repo:landing` ticket. The Play listing work is done: `#34` is fully closed.

### Batch 4: the component-library migration

D101, and strictly after the redesign ships: `#576`, `#577`, `#578`, `#579`, `#580`, `#581`.

### Batch 5: Astra

`#582`, `#583`, `#584`, plus `#513` and `#514` on the MCP surface, and `#599`, whose **pull request
534 is APPROVED after five rounds** and waits on the same 2026-09-22 deploy.

### Batch 6: security, correctness and the deletions

`#529` (listing and revoking API keys need step-up; **built, inert, and it needs
`RequireApiKeyCreationStepUp` flipped to `true` only AFTER `api#534` deploys**), `#621`
(`controllerActions` reads as enforcement on 51 capabilities and enforces nothing), `#623`
(`BuildLegacyMatchKey` duplicated in the calendar writer and reader), `#626` (the calendar
reconciler disagrees with its own writer), `#564` and `#568` (Hangfire stream writes, destructive EF
schema changes).

### Batch 7: the production readiness run

Unchanged. `/audit-prod-readiness`, then fix what it finds, then ship.

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
on disk at `~/Developer/brain` on the Mac (the Windows path is gone), but `cat` and `ls` miss the
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
  - `A guard a normal refactor walks through is not a guard.md`
  - `Prefer a type nobody can spell around to a lint rule anybody can.md`
  - `Name where a guard regress stops rather than chase it forever.md`
  - `A review-harness gate that checks for a heading is gameable so run the real lanes.md`
  - `Read the tree before correcting a contradicting reviewer in public.md`
  - `A round that lands mergeable work beats a round that improves parked work.md`
  - `The redesign gate ships a closed internal build for Thomas's approval before any merge to main.md`
  - `Never end an unattended run for a machine-resource guard, drop workers and relaunch instead.md`

  **Re-confirmed through the Obsidian MCP on 2026-09-24** (`obsidian_list_notes` on the
  `Decisions/` directory, 86 notes): all twenty-seven names above exist. The last two were added
  that day; the second one is the ADR the paragraph below said was missing.

  **The six before them were added on 2026-09-19.** They already existed in the vault and were missing from
  this list, and each one is a lesson the night of 2026-09-18 into 09-19 paid for in review rounds:
  a guard beaten by `confirmationToken: default` and then by `??=`, a lint rule beaten by
  `as RequestInit` where the type held with zero call-site changes, five rounds on one test file
  before a stopping bar was written down, a green review-harness gate with a body that had never run
  its lanes, two reviewers contradicting each other where the tree settled it, and a free slot given
  to the round that could merge over the round that could not.

  **All twenty-five were re-confirmed through the Obsidian MCP on 2026-09-19**, by listing
  `2 Areas/20-29 Orbit Engineering/Decisions/` with `obsidian_list_notes` and copying the names that
  came back. The directory held 81 notes then. The "no ADR for the rule that a machine resource is
  never a blocker" gap noted here is closed: see the 2026-09-24 re-confirmation above.

  Superseded by the above, kept for the record: the earlier note said nineteen, confirmed on
  2026-09-18 at 00:30, by listing
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

- **NOTHING writes inside `node_modules`, and a citation of installed source is checked before it
  is published.** A worker edited two files inside `node_modules/react-native` on 2026-09-16 and
  nothing detected it for two days, so four contradictory citations of those two files were
  published across three sessions and **every one was accurate about the tree its author read**.
  Code standard 8 did not fail, its premise did: it says to confirm an external interface against
  the installed source, and it assumes the installed source is what the lockfile says. Three things
  hold that premise up now, all landed by `#601`: every order `tools/compose-prompt.mjs` generates
  carries the prohibition, `.claude/hooks/forbid-node-modules-write.mjs` refuses the write at act
  time for every caller, and `node tools/check-dependency-edits.mjs` walks every installed tree in
  about six seconds and names any file later than its own package's EARLIEST file. **A plain `npm
  install` does not repair an edited package**, because npm leaves a complete package alone; the
  repair is `rm -rf node_modules/<package>` plus an install.
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
  a generated baseline such as `tools/dash-baseline.json` or `tools/copy-baseline.json`, take the base
  wholesale and regenerate rather than hand-merging the two halves.
- **Run `npm run type-check` from the repository ROOT, never per workspace.**
- **`node tools/redesign-coverage.mjs` validates against a COMMITTED manifest, and since `#595` a CI
  job regenerates that manifest and diffs it.** `guards.yml#surface-manifest` ("Surface Manifest
  Drift", pull request 1024) runs `node tools/surface-manifest.mjs --check` and then
  `node tools/redesign-coverage.mjs`, on every pull request that touches an owned path and on every
  PUSH to `main` and `redesign/main`. The push leg is the one that matters: it skips the path filter
  and re-verifies the whole inventory on the merged tree, which is what closed the 64-commit gap.
  `--check` compares a FRESH regeneration, never `generatedFrom`, because a manifest whose
  `generatedFrom` was current still went stale on the next merge. **On `redesign/main` the job reports
  and cannot block, because that branch is unprotected; on `main` it blocks.**
  Any pull request that deletes a drawn surface still regenerates the manifest AND moves the ids into
  `tools/redesign-groups.json`'s `deleted` section with the decision that removed them, in the same
  commit. Two open pull requests owe exactly that: `ui#1007` loses
  `overlay-onboarding-onboarding-flow` and gains two `onboarding-create-habit` ids, and `ui#992`
  loses `m-overlay-ui-selection-field`.
- Worktree and branch debt is large and mostly harmless. Read 2026-09-15 at 14:04 UTC under State.

## The suppressed lint violations, closed by `#175`

This was the largest remaining block of work, and it is finished. The screen tickets that owned the
files drove both baselines to zero, and `#175` then deleted the two baseline files,
`tools/check-suppressions-ratchet.mjs`, and the `Suppressions Ratchet` job that read them.

**There is no lint baseline any more, in either app.** Every `local/*` rule runs at `error` against a
clean tree, so a violation fails the `Lint` check on the spot rather than being recorded. The
required `Lint Severity` context, backed by `tools/check-lint-severity.mjs`, fails if anyone
recreates a baseline file, points a `--suppressions-location` flag at one, lowers a `local/*` rule to
`warn`, or turns one `off` outside the five scoped blocks that tool declares by name.

Three rules survive this work:

- **A `local/*` rule ships at `error` with zero violations, or it does not ship.** Landing a rule
  alongside its own violation set is what created this block, and the new gate refuses it.
- **Fix the VALUE, never the count.** Never add an inline disable, and never remove a rule from the
  ESLint config to make a file pass.
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
- **A generated baseline is resolved by REGENERATING, never by hand-merging.** 1002's web lint
  baseline conflict was resolved by taking the base wholesale and regenerating, which removed 112
  lines and converged on what the linter actually finds. That baseline is gone, but the rule still
  governs `tools/dash-baseline.json` and `tools/copy-baseline.json`.
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

## What the day of 2026-09-18 added

This was an ATTENDED day session, not a night run, and its output was almost entirely **reviews that
found defects green CI had already passed**. Six pull requests were reviewed, five came back REQUEST
CHANGES, and every one of those five was green on 30-plus checks at the time.

### The reviewer is the thing that was missing, and it is now written down

Five of six reviews found a defect no gate models. In order of how badly they would have hurt:

1. **`ui#1019`** gated one notification mutation out of four, leaving SIX ungated write points. A
   late account-A rejection wrote account A's notification titles and bodies into account B's query
   client. Verified against installed `@tanstack/query-core` 5.101.4: `queryClient.clear()` only
   empties the maps, it never cancels the retryer or suppresses the callback.
2. **`ui#1019` again, on re-review**: `adoptSessionAccount` raised the generation, cleared pending
   deletes and dropped the user, but never cleared the query cache. Deterministic, not a race, and it
   fired AFTER the poll correctly detected the swap: the tab was account B and rendered account A's
   notifications, habits, goals and profile for 60 seconds to 5 minutes.
3. **`api#528`** would have broken Astra permanently the moment `RequireApiKeyCreationStepUp` flipped
   to true, and a web revoke consumed the grant so the key list then 428s.
4. **`ui#992`** made arrow keys the only keyboard route through a picker list and then fired
   `selectAndClose` on the first arrow press, so the sheet closed and committed the adjacent value.
   **Three tests asserted that behaviour as correct.**
5. **`ui#1007`** dropped or misreported the cadence the user typed, three separate ways.
6. **`api#521`** admits a recurring series on ONE sampled occurrence, so a Lisbon `BYDAY=TH` series
   ships to a Sao Paulo account one weekday and one hour wrong for half the year.

Only `ui#1021` came back APPROVE.

### Vacuous tests are the recurring shape

Four separate ones surfaced in one day, each passing while asserting nothing:

- `ui#992`: three tests asserted `onChange` fired after a directional key, but that callback only
  runs inside `closeSheet`, so they proved the sheet closed and called it correct.
- `ui#1007`: a mobile test asserted against `onboarding.flow.complete.recap.theme`, a key in neither
  locale file, so `i18n.t` returned the key string and `not.toContain` could never fail.
- `ui#1019`: two deleted `expo-secure-store` mocks asserted nothing and existed only to get past a
  missing global.
- `api#532`: a reflection test was needed to prove the error catalog total; without it the
  raw-English fallback stayed reachable.

**A test that passes whether or not the product code is right is worse than no test.** Every fix this
day was ordered red-first and the red output pasted into the report, which is what caught all four.

### Exit codes and escapes, twice each in one day

`| tail` masked a failing lint and then a failing commit for the `#67` worker. A separate `#75`
worker reported the dash gate clean because its own check used `git diff --name-only HEAD`, which
skips untracked files, and CI derives its list from `origin/main...HEAD`. And a bash heredoc ate one
backslash, writing a literal `0x08` byte into a test that the suite happily passed; only
`sonarjs/no-control-regex` caught it.

Both traps are already in memory and both cost a cycle anyway. Record exit codes to a log file and
write escaped strings through a file rather than a heredoc.

### Pullfrog and Codex share ONE OpenAI allowance

This corrects the 2026-09-17 into 09-18 entry, which framed them as two independent failures. Run
`35310279801` shows `providerID=openai modelID=gpt-5.6-sol` returning `The usage limit has been
reached`, which is the same allowance the Codex workers exhausted. One meter took down both the
writer and the reviewer.

`ui#1022` and `api#529` add a Claude fallback step to `.github/workflows/pullfrog.yml` in both
repositories, both merged. **It does not work for a real review, and the reason is worth keeping**:
the Pullfrog app sends a JSON payload, and that path resolves models SERVER SIDE where only the Codex
subscription is registered. A plain-text prompt uses the workflow credentials and does reach Claude,
proven by run `35350677932`. Thomas ran `pullfrog auth claude` and the console shows Claude Pro/Max
configured, yet the runner's BYOK list still enumerates 15 OpenAI models and no Anthropic one. That
looks like a Pullfrog-side scope bug and is worth reporting to them.

Rewriting the payload as a plain-text review order (`ecebe633`, on `chore/pullfrog-fallback-v2`, not
merged) does reach Claude, but the agent ran 25 minutes on `ui#992`, exhausted its context mid-review
and never posted. Treat that branch as an experiment, not a solution.

### When Codex is out, Claude is the worker, and never a subagent

`ui#1023` adds a `claude` engine to `.claude/orchestrator.json` beside `codex`, running Claude Code
headless through the same `launch-worker.mjs`, order file, worktree, timeouts and wake source.
`§5.4.1` of the orchestrate skill states the switch and forbids substituting a subagent.

**The committed default stays `codex`.** `tools/test-tools.mjs` pins the shipped default implementer
to `gpt-5.6-sol` at high effort, and committing `worker: "claude"` broke both assertions. Per D95 the
gate stood and the config yielded: running on Claude is an uncommitted operational switch a session
makes while the allowance is out. That took the harness from 61 failures to 1.

Why subagents are forbidden, measured this day: five ran as workers, every one died with the session,
none registered a wake source so `require-wake-source.mjs` correctly objected on every turn, and each
had to be individually told to commit and push before a handoff was possible at all. A headless
engine has none of those problems, because the process is external, its pid IS the wake source, and
its output is a commit rather than a conversation.

### Two things this session published and had to correct

Both are recorded because a run that hides its own errors is worse than one that makes them.

1. A review claimed `ReactNativeFeatureFlagsDefaults.kt:86,92` read `false` in installed react-native
   0.86.3. Both lines read `true`. The claim was posted to `ui#992` and corrected there. A review that
   cites installed source and gets it backwards is worse than one that does not cite it, because the
   citation is what makes it believable.
2. `worker: "claude"` was committed before the tools harness had been read, and the harness caught it.

### The machine, and the real worker cap

Five parallel workers each running a full turbo suite took the laptop to **67 node processes, 7.4 GB
and 6 GB free**, which Thomas reported as unusable. Killing the agents left **13 orphaned vitest
processes** still holding memory; they had to be swept by hand under `orca\workspaces`.

Capped to a serial turbo run with about two vitest workers, one worker sits at roughly 19 to 29 node
processes and 1.5 to 5.4 GB, with 10 to 15 GB free. Thomas, 2026-09-18: **"all these workers makes
the machine unusable, this is not good even if im not using it, because everything goes slow, use
less workers, at least 2"**. Two is the cap, and a capped run is slower and just as valid.

**Superseded 2026-09-24 by the new machine.** The run moved to a MacBook Pro M5 Pro with 64 GB and
18 cores (`sysctl hw.memsize hw.ncpu`), and Thomas: "we can probably use a lot more workers".
`caps.parallelTickets` is now **6**: six capped workers at the measured 5.4 GB peak come to about
33 GB. Memory pressure drops a worker and never ends a run. The same pull request moved the worker
to `gpt-6-sol`, confirmed live from 24 Codex replies on 2026-09-23, and ported the harness to macOS.

## What the night of 2026-09-18 into 09-19 added

This night merged ONE pull request and it was invisible to a person. Its real output was eight
independent reviews, six of which stopped a merge, and a root cause that had been corrupting this
repository's own evidence for two days.

### A WORKER edited `node_modules`, and that is what broke three sessions' citations

Four contradictory public citations of `ReactNativeFeatureFlagsDefaults.kt:86,92` and
`KeyEvent.kt` were published across three sessions. **Every one was accurate about the tree its
author read.** Exactly two files inside `node_modules/react-native` carried an mtime three hours
after the package was extracted, and they were precisely the two the record argued over. `npm
install` did not repair them, because npm leaves a complete package alone; `rm -rf
node_modules/react-native` plus an install did.

The edits flipped `enableImperativeFocus` and `enableKeyEvents` to `true` and added
`KEYCODE_MOVE_HOME` and `KEYCODE_MOVE_END` to both key maps, which is exactly what a worker would
change to make the `#543` focus work appear to run without its config plugin.

**Thomas, 2026-09-18, and he had answered it before:** "IT WAS NOT ME, ITS YOUR WORKERS DOING THIS
SHIT, AND I ALREADY TOLD YOU TO STOP DOING THAT. YOU CREATE THE WORKERS, THIS IS YOUR
RESPONSIBILITY." **Never ask him about this again and never investigate the origin.** `#601` owns
the fix and its scope is prevention, not archaeology: the prohibition goes into
`tools/compose-prompt.mjs` so every generated order carries it, a `PreToolUse` hook refuses any write
resolving inside `node_modules`, and an mtime walk catches anything that arrives another way.

Code standard 8 did not fail here; its premise did. It says to confirm against the installed source,
and it assumes the installed source is what the lockfile says. **Repaired and verified across all
five checkouts: one sha256, `124bef07c299`, and `enableImperativeFocus` defaults `false`**, so
`#543`'s config plugin is the mechanism the entry redirect needs rather than a redundant pin.

### The recurring shape, named: a fix removes a false promise and the same promise survives one surface away

It happened five times in one night, on four different pull requests.

- `ui#1019` cleared the query cache on an account change and left the Astra conversation; then it
  cleared the conversation and left the persisted DRAFT; then it cleared the draft on a swap and left
  it on the ordinary sign-out path; and `lastFailedSend` sat in a React hook a store reset cannot
  reach at all, with its Retry still armed.
- `ui#1007` removed "a general habit gets a reminder" from the remind screen and left the same lie on
  the done screen one step later, where its own new test fixture asserted it.
- `ui#1023` reconciled the merge bar in all four prose sections its ticket named, and the TOOL that
  enforces it still required Pullfrog.

**The rule that came out of it:** a fix that removes a false promise is chased to every surface that
repeats it, not only the one the review named. And state a store cannot reach subscribes to the
session itself rather than being reset by proxy.

### A test that pins presence and not absence is the same tautology as one that pins a value

`tools/__tests__/orchestrator-config.mjs` gained an assertion that the claude engine's args CONTAIN
`--strict-mcp-config`. The whole safety argument is that the flag carries **no `--mcp-config` beside
it**, so adding one keeps the test green while every server in `~/.claude.json` loads into a worker
running at `bypassPermissions`. The model-id version of the same shape was caught the round before:
`resolveWorkerInvocation` returns `model: entry.model` read from the block a test compares it
against, so `claude-opus-4-8`, a REAL catalog id, stayed green and would have run a whole night on
the wrong model.

### The readiness tool and the merge bar disagree, and only the tool binds

`tools/lib/readiness-receipt.mjs:493-494` returns no required checks for an unprotected base, and
`tools/record-readiness.mjs:151` then INJECTS `pullfrog-approval` itself. The only escape at
`readiness-receipt.mjs:215-218` accepts an APPROVED review by the Pullfrog APP alone. So **no receipt
can reach READY on `redesign/main` while the allowance is out**, `SKILL.md:1118` says a blocked
result never permits a merge, and `require-wake-source.mjs:29-33` will not let a `--sleep` night end.
One run merges and one run stops, from one tree. `#598` round 4 owns it, with a test, because prose
is what failed.

**This night ran on the other path** and it is the legitimate one: green checks at the exact head, an
independent review posted in full on the pull request naming the substitution, and Thomas's written
instruction at entry. Its ledger holds eight rows and zero receipts, and it ends on recorded named
blockers rather than on READY.

### Point a reviewer at the worktree that carries the head

The first three reviews ran against the base checkout and said so, which weakened every citation they
made about changed files. Every review after that named the worktree holding the exact head, and the
findings got sharper immediately. A worktree per open pull request already exists; use it.

## State

Read live 2026-09-19, at the `/wrap-up` of the 2026-09-18 night run.

`redesign/main` is **`0f96925b`**. `orbit-api` `main` is unchanged. **Orbit 1.3.31 (90) is on the
Play OPEN track** and nothing this night touched reaches a person.

**230 tickets open**, three of them filed this night. **12 open in the `539 Redesign` milestone**:
`#67`, `#75`, `#78`, `#175`, `#217`, `#318`, `#320`, `#367`, `#460`, `#543`, `#596`, `#597`. `#595`
closed with pull request 1024.

### Merged this night, one

- **`ui#1024`** to `redesign/main` as **`0f96925b`**, closing `#595`. The surface manifest was
  generated from `e2f34493` with 184 surfaces while the branch was 64 commits ahead, so **every green
  coverage report since then was measured against an inventory that did not describe the tree**. It
  now reads 186 surfaces and 800 cells, and a `Surface Manifest Drift` job regenerates and diffs on
  every pull request touching an owned path and on every PUSH to `main` and `redesign/main`. The push
  leg is what closes the gap permanently. Widget ownership comes from `git ls-files -z` rather than a
  directory walk, which is stronger than an ignore-based exclusion because a tracked file cannot be
  hidden by editing `.gitignore`. Proven red first: run `35371544289` failed on `a27d3a25` with
  `surface-manifest: the committed inventory does not describe this tree`.

### Filed this night, three

- **`#598`** harden the Claude worker engine. Three P1 on pull request 1023: `bypassPermissions` with
  no `--strict-mcp-config` let a headless worker reach `obsidian`, `vault-fs` and `circleci` from the
  user-scope `mcpServers` map with zero hook coverage, because `.claude/settings.json` matches only
  `Bash` and `PowerShell` and the guards read `tool_input.command`, which an MCP call has not;
  `claude -p` defaults to `--output-format text` so the launcher's log-growth progress signal was
  dead; and `SKILL.md` was edited without a reseed.
- **`#600`** four web stores keep the previous account's state through an account change:
  `onboarding-draft-store` (cleared only in `logout()`), `referral-prompt-store`, `ui-store` and
  `throttle-store`. **The referral one records a CONSENT decision**: `engagement-prompt-store.ts:29-30`
  says the marketing-consent milestone is asked at most once per account, the store persists with no
  account namespace, so account A dismissing it means account B is never asked and the app behaves as
  though B answered. `apps/mobile/stores/review-reminder-store.ts:83-90` is the pattern to copy.
- **`#601`** a worker edited `node_modules` and nothing forbade or detected it. See the night section
  above. Scope is prevention: the prohibition in `compose-prompt.mjs`, a `PreToolUse` hook, an mtime
  walk.

### Open pull requests, every one, with a disposition

Every head below was read live at wrap-up. **Every one carries a full independent review posted as a
pull request comment naming the substitution**, because Pullfrog cannot run.

| PR | base | head | state | disposition |
|---|---|---|---|---|
| `ui#1019` | `redesign/main` | `8dc8ecb5` + round 7 in flight | six rounds done | **Worker LIVE on round 7.** The chat reset became unconditional, so a same-account recovery loses the unsent Astra draft, against the round-4 principle that a same-account recovery must not blank the tab. Round 7 moves the reset to `logout()` and the `accountChanged` branch. |
| `ui#1007` | `redesign/main` | `4e17d0c5` | round 3 delivered and PUSHED | **Needs a review at this head, then merge.** The worker hit the ceiling AFTER pushing, so nothing was lost. CI 28 green, 0 failures, and **`Surface Manifest Drift` GREEN**, so its rebase and regeneration are proven. |
| `ui#992` | `redesign/main` | `24b2f7f6` | manifest round delivered | **Needs a review at this head, then merge.** Both P1 fixed and verified: zero `nextFocus` production hits, and the preference pickers hold a draft that only `onCommit` persists. Manifest at 185 surfaces, harness 1811 assertions. |
| `ui#1023` | `redesign/main` | `0efefd35` | round 3 done, round 4 ORDERED | The tool-versus-prose merge bar, the `--mcp-config` absence assertion, and three P3. Order is on `#598`. |
| `api#521` | `main` | `88c3de52` | round 6 delivered, **never re-reviewed at this head** | Review it. Cannot merge before 2026-09-22. |
| `api#528` | `main` | `3835402c` | findings 2, 4, 5 fixed | Findings 1 and 3 remain, ordered on `#529`. **Do NOT flip `RequireApiKeyCreationStepUp`.** Cannot merge before 2026-09-22. |
| `api#531` | `main` | `d652a1fd` | all three findings fixed | **Needs a review at this head.** Cannot merge before 2026-09-22. |
| `api#532` | `main` | `dd862844` + round 2 in flight | **Worker LIVE.** | Sixteen findings, four blocking. Cannot merge before 2026-09-22. |

Dependabot in both repositories and `orbit-landing-page`: leave, not this effort.

### In flight at wrap-up, exactly

| what | where | disposition |
|---|---|---|
| worker on `ui#1019` round 7 | `C:\Users\thoma\orca\workspaces\orbit-ui-mobile\ticket-460-notify-announce`, branch `fix/ticket-460-notify-announce`, log `%TEMP%\orbit-workers\#460-1789761460444.log`, launcher pid 12220 | ALIVE. **Outcome unknown, read the worktree first.** One unpushed commit at wrap-up. |
| worker on `api#532` round 2 | `C:\Users\thoma\orca\workspaces\orbit-api\ticket-75-emails`, branch `feature/ticket-75-emails`, log `%TEMP%\orbit-workers\ORB-69-1789761486866.log`, launcher pid 1296 | ALIVE. 13 modified files at wrap-up. **Outcome unknown.** |
| `1890341c` in `ticket-58-achievements` | branch `fix/ticket-461-notification-actions` | Unchanged, still the disposable pre-squash form of merged pull request 1014. |
| local `worker: "claude"` switch | `.claude/orchestrator.json`, uncommitted in the main checkout | Deliberate, and it now also carries the hardened args, which pull request 1023 commits. **Revert on 2026-09-22** with `git checkout -- .claude/orchestrator.json`, which after 1023 merges restores a tree that still has the engine. |

### Three findings that need tickets and did not get them

Recorded here so they are not lost. File each and pick it up.

- The web time picker is `role="listbox"` with `role="option"` while mobile is `radiogroup` with
  `radio`. Pre-existing; `ui#992` only added `tabIndex`, `onKeyDown` and refs on web.
- `isOnboardingHabitDueToday` reads the DEVICE day while `CreateHabitCommand.cs:65` resolves the day
  from the profile timezone, so a UTC laptop at 23:30 Sunday with a Sao Paulo profile disagrees with
  the server.
- `design/canvas/Orbit Onboarding.dc.html:82` and `:200` render the emoji with
  `aria-label="{{ emojiLabel }}"` and neither platform ever wired it. Under D42 the drawing outranks
  prose, so it is a canvas-conformance gap.

### The allowance

Codex and Pullfrog share one OpenAI meter, exhausted until **2026-09-22 07:23**. Every `orbit-api`
pull request targets protected `main` and needs `pullfrog-approval`, so none can merge before then or
without Thomas merging by hand. `redesign/main` is unaffected.

## Open questions

**None are his.** A `/questions` round at the 2026-09-19 wrap-up enumerated sixteen candidates and
exactly two reached him. He answered both and each is recorded on the ticket that needed it.
Everything else closed against the code, a ticket comment, the spec or a primary source.

**Answered 2026-09-18 at the wrap-up, and both are settled:**

- **The failed-delete toast PAUSES on hover and focus.** Offered a pause, a Dismiss button, or
  leaving it, he took the pause. That is a granted design-system change:
  `packages/shared/src/contracts/feedback/Toast.ts:13-14` currently forbids `kind: 'neutral'` a life
  with `doneAfterMs?: never` and `onDone?: never`, and it now gains one, routed through the same
  paused timer `apps/web/components/ui/toast.tsx:74` and `apps/mobile/components/ui/app-toast.tsx:36`
  already use for a `done` toast. **No Dismiss button; the one action stays Retry.** Recorded on
  `#460`, and it needs a caller sweep because the toast is a shared primitive.
- **The `node_modules` edits were a WORKER, and the question is closed forever.** See `#601` and the
  night section. Never ask him again and never investigate the origin.

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

## What the night of 2026-09-18 into 09-19 added

**Nine merged to `redesign/main`**, each at its exact approved head with `--match-head-commit` and
never `--admin`: `992`, `1023`, `1007`, `1025`, `1019`, `1027`, `1026`, `1028`, `1031`. All nine
verified as ancestors of `origin/redesign/main`, now `635c1e3a`. Tickets closed: `#543`, `#598`,
`#67`, `#601`, `#460`, `#597`, `#605`, `#595`, `#175`, `#594`, `#617`.

### Pullfrog was out all night, and the substitute review is now a known shape

Codex and Pullfrog share one exhausted OpenAI meter until 2026-09-22. Every review was an independent
subagent pointed at the worktree carrying the exact head, and **every posted review names the
substitution in its first lines** so nobody later reads a merge as having had the usual reviewer.

What made those reviews worth the substitution, and what to repeat:

- **Drive the code, never read the diff and infer.** The strongest reviews built the defect and
  watched it happen. `api#521`'s approval rested on a **43,200-case differential sweep** across 30
  source zones by 30 account zones by 48 wall clocks, whose decisive line was `withheld by head only
  = 0`: the fix relaxed the gate exactly where it was wrong and nowhere else. `ui#1031`'s rested on
  **2,485,728 compared pairs of which exactly 3 differ.** `ui#1032`'s reviewer could not run Gradle
  without recreating `android/`, so it transliterated the two Kotlin functions onto JDK `Calendar`
  and ran them instead, and said plainly that the 16 Kotlin assertions stayed unverified.
- **Attack the guard, not just the code.** `api#534` took **five rounds** because each round's new
  guard was defeated by an ordinary refactor: `confirmationToken: default` walked through a
  one-spelling whitelist, then a conditional expression walked through a `:` parser, then an omitted
  optional argument resolved to the callee's own parameter name, then a same-name overload made the
  scan read a method the tool never calls. **Report the attacks that FAILED too**: nine of thirteen
  did, and that is what made the two successes credible.
- **Write the stopping bar into the order.** A source-text scan is defeatable in principle, so the
  bar given to `api#534`'s reviewer was "every bypass a NORMAL REFACTOR could produce is closed and
  the prose claims no more than that". It used that bar to decline three of its own findings as
  sabotage-shaped. Without it the loop runs until someone gets bored.

### Five pull requests were blocked or corrected for a false claim in the body

This became the single most common finding, and it is worth naming as a class. A body squashes into
`main`'s history, so a false sentence outlives the branch and the next reader trusts it.

- `api#534` claimed twelve tools were "fixed by the same change" when two were not.
- `api#521` offered an unchanged `openapi.json` as proof a field stayed off the wire, when that file
  carries no schema for the response at all and the same argument would "prove" the opposite about a
  field that IS on the wire.
- `ui#1029` claimed an enumeration was complete when its own stated method could not find the key
  that mattered, and its Test evidence listed nine gates while omitting the one that was failing.
- `ui#1030` said "the type alone could not hold this line", and the reviewer disproved it by doing
  it: `Omit<RequestInit, 'method'> & { method?: 'GET' | 'HEAD' }` compiled with **zero call-site
  changes** and turned the hole into a compile error.
- `ui#1032` said no CI job runs the Kotlin tests, when `mobile-build.yml:74` runs `assembleRelease`
  and that is a passing check on the pull request.

**The lesson for an order: name the body as part of the deliverable, early.** One worker did the
one-word fixture rename it was given as item 4 and skipped items 1 to 3, which were the body
corrections blocking the merge. A louder list is not the fix; saying "the body IS this round" is.

### A widget row will only open the app. `#586` is cancelled.

Thomas, asked about a backfill window: **"i dont even think clicking the habit on the widget should
open it. i think it should only open the app"**. That is what the widget already does, so `ui#1032`
was closed unmerged after five commits and two review rounds, and `#586`, `#629` and `#630` are all
cancelled. The branch `fix/ticket-586-widget-destination` is left in place so the work is
recoverable. The guide copy on `redesign/main` already matches the wanted behaviour, so nothing
needed editing.

`#632` survives, rewritten: its widget framing is gone and the real route is an external
`orbit://habits/<id>?date=...` link, which `+native-intent.tsx` passes straight through today.

### Three rules the machine taught, the hard way

- **A machine resource is never a blocker.** A run ended BLOCKED on a low-memory reap, and Thomas:
  "YOU CANT END A RUN BECAUSE OF A MEMORY HOOK ... just use less workers or some shit, but never end
  the run." `.claude/hooks/_lib/rules-sleep.mjs` now refuses a blocker naming memory, disk, CPU, OOM
  or a reap, with nine cases in `test-hooks.mjs` proving it while leaving an exhausted allowance and
  a review verdict as legitimate endings. **One worker at a time on this machine**: two plus review
  subagents exhausts it.
- **Merging moves the base and the orchestrating checkout goes stale.** Three launches failed with
  "`.claude/orchestrator.json` disagrees with origin/redesign/main". The fix is three commands:
  `git checkout -- .claude/orchestrator.json`, `git merge --ff-only`, re-apply the `worker` flip.
  The refusal is correct and the flip disappears on 2026-09-22.
- **Write an order file with the Write tool, never a heredoc.** A heredoc ate a 120-line order and
  failed the launch on a parse error.

### `#617` is done, by hand, on Thomas's instruction

`main` required `Suppressions Ratchet`, a job `#175` deleted, so the first pull request there after
the redesign gate would have hung forever on a check that can never report. Read back after the
change: **21 contexts, `Lint Severity` present, `Suppressions Ratchet` gone, `strict` true,
`pullfrog-approval` untouched.** It had been filed as a request under D95, and Thomas overrode that
directly. `gh api -f strict=true` sends a string and is rejected; the payload must go in as JSON
through `--input`.

## What 2026-09-24 added: the new Mac, the dead three-dot menu found, and a priority insert

**Durable because** it changes the order of work, the machine every tool runs on, and the cause of a
bug that three earlier fixes missed.

### Thomas's instructions, 2026-09-24, in his words

- "change the default worker to codex, and make it use GPT-6 Sol as the model." Done in `ui#1035`.
- "this is a macbook pro with m5 pro and 64gb of ram, which means we can probably use a lot more
  workers." `caps.parallelTickets` is 6 in `ui#1035`.
- "IOS will come later, forget this right now." Do not file iOS tickets. He wants to TALK about iOS
  when he raises it again; the explanation already given is in that session's transcript only.
- **Priority insert, ahead of the whole batch order:** "the god damn 3 dots bug ... FIX IT, FOREVER,
  WITH THE BEST APPROACH POSSIBLE" and "when we click 'go to sub habits' (the drill) ... the 'show
  completed' toggle is not working on the drill." "i want both fixed in one pr per repo, prioritized
  and merged to main, and then you run the /android-release skill. after that, continue the original
  run." Also: "run /second-opinion, make sure you and codex agree on the problem and the fix." Done:
  GPT-6 Sol returned AGREE, high confidence.

### `ui#1035`: the harness now runs on macOS

The harness was Windows-only in four ways, each proven by a harness failure on the Mac: process
start identity had no darwin branch (every wake source read dead, `create-worktree` aborted), the
CPU progress probe was Windows-only, `/var -> /private/var` made one repo read as two roots (39
hook failures, one hung tools test), and Windows paths sat in the config, workflows and seven
skills. **Until `ui#1035` merges, `create-worktree`, `launch-worker` and `list-bot-threads` fail on
this Mac** (they read `C:\Users\thoma\...` from `.claude/orchestrator.json`). Pullfrog's third review
asked only for consistent zombie evidence in the PR body; that was fixed at the same head `4e2ccb47`
and a re-review was requested. Both harnesses were green at that head: 1822 tools assertions in 203 s,
hooks OK.

### The three-dot menu: root cause, proven (ticket `#633`, also `#134`)

Reproduced on the emulator on the exact shipped 1.3.31 bundle, then captured with an instrumented
release build of `main`. `anchored-menu.tsx` sets `shouldRender` during render and also from a
mount-time exit-animation callback. React queues that stale `false` update at Default lane, the tap
renders at Sync lane, and `rerenderReducer` never writes the render-phase `true` into the base state,
so React reverts it 1 ms later while `visible` stays `true`. Every later `open()` is a no-op for that
row. Full chain, log and renderer lines are in `#633`. It only fails when the tap is the row's first
render after mount, which is why adb taps passed 12 of 12 and Thomas's real taps failed.
**The next fix to this menu must be proven the same way: a failing run on a real build first.**

### The drill (also `#633`)

Drill children come straight from the detail endpoint and never pass through the shared visibility
helpers, on web and mobile. `redesign/main` deleted `anchored-menu.tsx` and `drill-view.tsx`; its
`habit-drill.tsx` needs the same drill fix as a separate backport PR after `#633` merges to `main`.

### Android tooling on this Mac, all set up and verified

- SDK at `~/Library/Android/sdk` (platform-tools, emulator, build-tools 36.0.0, cmdline-tools,
  `system-images;android-35;google_apis_playstore;arm64-v8a`). AVD `Orbit_Pixel_9_API_35`, arm64,
  logged in as Thomas. `tools/android-emulator.mjs` still hard-codes the x86_64 image: a Mac port
  item for its own ticket.
- A local release APK builds in about 9 minutes cold and 2.5 minutes warm with `npm run android:apk`,
  given `apps/mobile/google-services.json` (gitignored; rebuilt from the public values inside the
  shipped bundle) and `EXPO_PUBLIC_API_BASE`, `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the environment.
- To install over the Play-signed build and keep the login: set `app.json` `version` at or above the
  live one (a lower one hits the forced-update screen) and `versionCode` above 90, then zipalign and
  re-sign with `~/.android/debug.keystore`. `adb install -r -d` does not work on this user image.
- The Gmail connector is Thomas's WORK account. Sign-in codes for his Orbit account need him.

## What the 2026-09-24 sleep run added (session `dd9211b6`)

**Durable because** it pins the models every future change and review runs on, changes how the
orchestrator waits on reviews, and records five merges and the open set the next run drives.

### Thomas's instructions, 2026-09-24 afternoon, in his words

- "please let me know when the bugs that are going to the main branch gets merged, also i want you
  to run /android-release after they are merged. to the open beta track". That is `ui#1041` (`#633`).
  Merge it, tell him, run `/android-release` to the open track, tell him again.
- "yes, pullfrog at medium, workers at high, both at gpt-6 sol". **This supersedes every earlier
  model or effort note.** Codex workers: `gpt-6-sol`, `high` on the default tier, `medium` on the
  mechanical tier (unchanged in `.claude/orchestrator.json`). Pullfrog: `model: openai/gpt-6-sol`,
  `effort: medium` on the primary step, through PRs `ui#1046`, `api#537`, `landing#80` (tickets
  `#635`, `#636`, `#637`). Until they merge, reviews still run `gpt-5.6-sol` at `xhigh`: the
  `pullfrog/pullfrog@v0` tag (`ce127b38`) maps "GPT Sol" to `openai/gpt-5.6-sol`, and the console
  setting is effort 0.75. Read from the run log of Pullfrog run `36029721894`.
- "brain is private. no need to rotate it." Do not raise the Render token in `brain/.mcp.json` again.
- On usage: weekly Codex usage went 4% to 11% in one day. The run log showed about 40 Pullfrog runs in
  2.5 hours, a third of them duplicates. Keep reviews single (below) and do not open new fronts while
  more than about ten PRs wait for review.

### How to wait on Pullfrog without paying twice

`list-bot-threads.mjs` posts `@pullfrog review` when no review of the head exists yet, which is
always true right after a push, so every poll after a push bought a second full run. **Always pass
`--no-request`** to a waiting poll; Pullfrog reviews every push on its own. Use `--re-review` only
for a same-head re-adjudication (a body finding filed, or threads resolved after a worker pushed).
Resolve threads BEFORE pushing whenever the orchestrator pushes; `ui#1044` (`#542`) makes review
workers stop before pushing so that holds for worker rounds too.

**Every merge into `redesign/main` puts every other open PR one commit behind**, and the readiness
recorder refuses `OUT_OF_DATE`, so each merge costs a merge-forward and a short re-review per open
PR. Merge approved PRs back to back when several are ready, and merge-forward the rest once after.

**Review-fix fixes may be done by the orchestrator itself** (orchestrate step 8). Doing small ones
inline spends Claude, not the shared OpenAI allowance. This run did five inline.

### The Mac, as set up this run

- System sleep is 1 minute after the display turns off, on AC and battery. A session keeps the Mac
  awake with `caffeinate -i -w <claude pid>` as a background task; the display still sleeps. The lid
  must stay open.
- `/brain` MCP: the `obsidian` and `vault-fs` servers now live at USER scope in `~/.claude.json`
  (backup in `~/.claude/backups/`), with the Mac plugin's current key, so every project loads them.
  The stale Windows key was removed from `brain/.mcp.json` (brain commit `c9b2e05`, pushed by the
  Obsidian Git plugin). Both servers were smoke tested. A session started before that change has no
  `mcp__obsidian__*` tools; the handoff that wrote this section was one of them, so its brain reads
  fell back to files.

### Merged this run

| PR | into | merge | what a person gets |
|---|---|---|---|
| `api#534` (`#599`) | `orbit-api` `main` | `313b74b8` | MCP step-up tools stop being permanently refused (deploy on Render not verified) |
| `ui#1036` (`#627`) | `redesign/main` | `5ee77ba9` | the create-worktree test no longer goes red on a busy machine |
| `ui#1037` (`#634`) | `redesign/main` | `a7fac5f4` | `/handoff --sleep` ends the session |
| `ui#1043` (`#546`) | `redesign/main` | `7fb0ca56` | Gate Charter installs its dependency and runs |
| `ui#1038` (`#613`) | `redesign/main` | `759a243a` | two guards really run on pull requests |

Tickets closed: `#599`, `#627`, `#634`, `#546`, `#613`, `#560` (already done by PR 991), `#521`
(cancelled; its 2026-09-12 closure comment was never applied). Filed: `#634`, `#635`, `#636`, `#637`,
`#638` (lint gate misses a removed config), `#639` (Windows dangling file link).

### Open pull requests at the end of the run, each with its state

**Superseded** by the open-PR table in the next section (session `382214fc`, 2026-09-24 evening).

| PR | base | head | state |
|---|---|---|---|
| `ui#1041` (`#633`) | `main` | `89bb9be5` | **APPROVED, checks green, `mergeStateStatus` BLOCKED at handoff.** Find why, merge, release. |
| `ui#1046` (`#635`), `api#537` (`#636`), `landing#80` (`#637`) | `main` | `a361067a`, `0040b790`, `9bd718ce` | Pullfrog pin to gpt-6-sol medium; review owed |
| `ui#1030` (`#615`) | `redesign/main` | `02d3ce91` | APPROVED at `dbcdedfc`; CI fix pushed (gate charter entry, manifest); re-review owed |
| `ui#1033` (`#610`) | `redesign/main` | `ddd6ebf2` | APPROVED at `40e40e26`; merge-forward pushed; review cap spent, follow-up `#639` |
| `ui#1029` (`#612`) | `redesign/main` | `de0539e2` | round 4 pushed, both threads resolved, re-review owed |
| `ui#1039` (`#624`) | `redesign/main` | `2eb56ad3` | APPROVED at `ed38fba4`; merge-forward pushed, re-review owed |
| `ui#1040` (`#611`) | `redesign/main` | `c9496511` | round 3 pushed, threads resolved, re-review owed |
| `ui#1042` (`#618`) | `redesign/main` | `7fd04155` | body finding FILED as `#638`, same-head re-review requested |
| `ui#1044` (`#542`) | `redesign/main` | `25be139a` | fix pushed after resolving, review owed |
| `ui#1045` (`#541`) | `redesign/main` | `fd039109` | fix pushed after resolving, review owed |
| `ui#1047` (`#530`), `ui#1048` (`#528`), `ui#1049` (`#559`), `ui#1050` (`#525`), `ui#1051` (`#455`) | `redesign/main` | | new, first review owed |
| `api#521` (`#526`) | `orbit-api` `main` | `64ebb3eb` | round 7 pushed (year-long date and clock proof, originalStartTime, legacy refresh), re-review owed |

Unchanged and untriaged: dependabot `ui#1034`, `#801`, `#799`, `#798`; `api#536`, `#535`, `#530`;
`landing#73` to `#79`. Older `api#528`, `#531`, `#532`, `#533` still owe their rounds (batches 1, 2a, 6).

## What the 2026-09-24 evening sleep run added (session `382214fc`)

**Durable because** it records two production deploys, a Play release, a change to `main`'s branch
protection, the CI capacity limit every future run hits, and four instructions from Thomas on how an
unattended run behaves.

### Thomas's instructions, 2026-09-24 evening, in his words

- **A pasted `NEXT.md` IS the instruction.** "i pasted a prompt, you just execute whats on the
  prompt, why are you asking if you can do what i already asked you to do?"
- **A sleep run never asks anything.** "you are not allowed to stop a sleep run to ask me questions,
  you have to take every decision yourself ... JUST DO IT, DO THE RECOMMENDED ALWAYS". This covers
  decisions a rule reserves for him, including a D95 gate or protection edit: take the recommended
  option and log it.
- **Verify before naming a blocker, and keep a decision when asked why.** The run told him `#575`
  needed an OpenAI API key; it did not (`codex exec --output-schema` in the installed codex-cli
  0.156.1). His words: "why do you assume stuff without checking?" and "i feel really scared of how
  NOT CONFIDENT you are with your decisions". A "why" gets the evidence and the decision stands
  unless a fresh check contradicts it. Before anything reaches him as a blocker, every installed tool
  and existing account that could reach the same goal is tried and its result written down.
- **Approved at wrap-up: put that last rule in `.claude/rules/core.md` rule 8** ("Rule in core.md").
  Not done yet; it is the first item of the next run (own ticket, own PR, both harnesses).

### Shipped to real people

| what a person gets | how | verified |
|---|---|---|
| The three-dot habit menu opens; "show completed" works inside "go to sub habits" (web and Android) | `ui#1041` (`#633`) into `main` as `2809b017` | Android 1.3.32 (91) on the Play open track, run `36041553873` success; Vercel production deploy of `2809b017` |
| Recurring calendar series no longer withheld in 13 timezones | `api#521` (`#526`) into `orbit-api` `main` as `e315e06a` | Render deploy `dep-daqnn56q1p3s73ap22bg` live 19:37 UTC, `/health` Healthy |
| The landing page's six npm advisories (1 critical) are gone | `landing#81` (`#640`) as `daafa61c`; Node floor now `>=22.19.0` (undici 8) | Vercel production success, useorbit.org 200 |

Also verified: `api#534` (`#599`) went live on Render at 2026-09-24 16:16 UTC (`313b74b8`), which the
previous section listed as unverified.

### Merged into `redesign/main` (built, not shipped)

`ui#1033` (`#610`), `#1039` (`#624`), `#1040` (`#611`), `#1048` (`#528`), `#1045` (`#541`), `#1042`
(`#618`), `#1050` (`#525`), `#1051` (`#455`), `#1047` (`#530`), `#1053` (`#641`). Tickets closed as
already done by earlier PRs after a re-read against the tree: `#558` (PR 970), `#598` (PR 1023),
`#544` (PR 984), `#563` (PR 999 on `main`; `redesign/main` gets it through `#556`).

### Decisions this run took, with the evidence

- **`main`'s required checks: `Lint Severity` swapped back to `Suppressions Ratchet`.** See THE
  REDESIGN GATE for why and for the swap back. Before-state was `21 contexts, strict true`.
- **Landing merges follow Thomas's non-redesign API rule by analogy** ("merge and deploy to main").
- **`ui#1049` (`#559`) states a closed analysis boundary** (D117) after each review found new
  expression shapes; its PR body carries `## Analysis boundary`.
- **`#575` runs through `codex exec --output-schema`, not a raw API key**; scope change posted on the
  ticket.
- **`#557` needed a `main` backport**: PR 994 had fixed it on `redesign/main` only, so the shipped app
  still signed people out. `ui#1057` cherry-picks `ce5ad59a` onto `main`.
- **The three Pullfrog pin PRs wait on an external release**: npm `pullfrog` `latest` is 0.1.82, whose
  `models.ts` has no `openai/gpt-6-sol`, so `effort: medium` is not applied. `pullfrog/pullfrog`
  `main` (`32046f3c`) has it; release staged (`5edc3a07`). Comment on each PR.

### Constraints learned this run

- **GitHub Actions capacity is the bottleneck, not workers.** 72 queued runs against about 10 in
  progress. `guards.yml` and `dependency-review.yml` had no `concurrency` group; `ui#1058` (`#643`)
  adds one. Until it merges, cancel queued runs for heads a newer push replaced.
- **Pullfrog's incremental review can submit NO review.** After resolving threads, post one
  `--re-review` (`list-bot-threads.mjs --re-review --wait-seconds 1` posts it without waiting); a
  merge-forward push alone usually does get an automatic approval.
- **`list-bot-threads.mjs` waits 900 s by default**; use `--wait-seconds 0` for a single poll.
- **"Build web" can fail on a Google Fonts fetch** (`next-font-loader`: "Cannot read properties of
  null (reading '1')"). It is a flake: `gh run rerun <id> --failed`.
- **Render reads work with `RENDER_MCP_TOKEN`** from the environment; the `orbit-api` service is
  `srv-d6tc2isr85hc739bf75g` (autoDeploy on `main`).
- **A fix merged to `main` does not reach `redesign/main`.** `redesign-drift.yml` has failed on every
  `main` push since 2026-09-16; `main` is 12 commits ahead. That is `#556`, next after 1052 merges.
- **Shell traps on this Mac:** zsh treats `path` as `PATH`; `set -- $var` does not split; the
  orchestrator guardrail refuses a redirect whose target contains a variable (write to a literal
  path or use the Write tool); `ls` is aliased and rejects `-t`.
- **`.claude/pending-lessons.md` is tracked**, so staging a lesson there dirties the orchestrating
  checkout and blocks `create-worktree`. Stage in the run log or through a PR.
- **`caps.reviewFixAttempts` (3) was spent this run on `ui#1029`, `#1030` and `#1049`.** A new session
  starts a new count; if their next review still blocks, split the remaining findings into a ticket
  rather than looping.

### Open pull requests at the end of this run

| PR | base | head | state |
|---|---|---|---|
| `ui#1044` (`#542`) | `redesign/main` | `94a33e00` | APPROVED, 1 check pending: merge when green |
| `ui#1056` (`#639`) | `redesign/main` | `598da112` | APPROVED, 1 check pending: merge when green |
| `ui#1058` (`#643`) | `redesign/main` | `a18ca976` | APPROVED, CI pending: merge when green |
| `ui#1054` (`#619`) | `redesign/main` | `32f1dd90` | APPROVED, CI pending: merge when green |
| `ui#1052` (`#633` backport) | `redesign/main` | `2d7d1f93` | drill error scoped to the active parent; re-review owed |
| `ui#1030` (`#615`) | `redesign/main` | `ad6ba428` | null intent fails closed, chat and transcription carry the account; re-review owed |
| `ui#1055` (`#638`) | `redesign/main` | `ba74f7f5` | DESIGN.md gate list fixed; re-review owed |
| `ui#1049` (`#559`) | `redesign/main` | `c6dc9bfe` | CHANGES_REQUESTED, 2 new findings; review-fix cap spent this run |
| `ui#1029` (`#612`) | `redesign/main` | `2688894e` + worker | CHANGES_REQUESTED (chat SSE continuation, mobile delete-account navigation); a worker was mid-round at handoff |
| `ui#1057` (`#557` backport) | `main` | `bf779031` | first review owed; after merge, `/android-release` to the open track |
| `ui#1046`, `api#537`, `landing#80` (pins) | `main` | | wait for Pullfrog 0.1.83 |
| dependabot `ui#1034`, `#801`, `#799`, `#798`; `api#535`, `#538`, `#530` | `main` | | rebased; merge each Pullfrog approves with green CI |
| `api#528`, `#531`, `#532`, `#533` | `orbit-api` `main` | | older rounds owed (batches 1, 2a, 6) |

## What the 2026-09-24 night sleep run added (session `67f75f39`)

**Durable because** it measures the CI congestion that Thomas made the first priority of the next
run, records three changes that reached `main`, and records the rules this run paid for. Two of
Thomas's instructions from this run are in `## Standing instructions from Thomas`.

### The CI congestion, measured

Read with `gh run list --status queued|in_progress` in both code repositories:

- **At wrap-up: 259 queued runs (143 `ui`, 116 `api`) and 13 in progress.** At handoff: 206
  queued (116 `ui`, 90 `api`), 18 in progress, and 0 in progress on `api`.
- **GitHub Actions concurrency is account-wide.** The three repositories share one pool, so a busy
  `ui` queue starves `api` completely.
- **One push is expensive.** A `ui` pull request push starts 11 `pull_request` workflows and about
  30 jobs (`guards.yml` 14, `test.yml` 8). An `api` push starts 9 workflows and about 16 jobs.
- **`api` keeps stale runs.** 8 of its 9 `pull_request` workflows have no `concurrency` group (only
  `gating-matrix.yml` has one), so a superseded push keeps its queued runs. One pass of the
  cancel-superseded script cancelled 46 stale `api` runs. `ui` has groups on every workflow except
  `dependabot-auto-merge.yml` (`ui#1058` added the missing ones).
- **Strict `main` multiplies the cost.** Both code repositories require a branch to be up to date.
  Each merge to `main` puts every other open `main` pull request BEHIND. Each merge-forward reruns
  the full CI and needs a new Pullfrog review, and the incremental review often posts no
  `pullfrog-approval` check (see the constraints below). 18 `api` feature pull requests on `main`
  mean 18 serial full cycles.
- **The run itself caused the demand.** At D49 the run stopped new fronts (11 pull requests waiting,
  46 queued runs), then started them again: it opened about 35 pull requests after that point. The
  sleep skill's "stop opening new fronts once the open set is large" is prose, and nothing enforces
  it. That is the root cause the fix must remove, not only the symptom.

**Candidate permanent fixes, for the next run to weigh on evidence** (this list is a lead, not a
decision):

1. An admission gate in code: `tools/launch-worker.mjs` refuses a NEW ticket worker (review rounds
   and merge-forwards exempt) when open pull requests or queued runs exceed a threshold in
   `.claude/orchestrator.json`. Test it in `node tools/test-tools.mjs`.
2. A `concurrency` group with `cancel-in-progress` on every `api` `pull_request` workflow and on
   `ui`'s `dependabot-auto-merge.yml`.
3. Path filters, so a change to docs or tools only does not build the apps (required checks need a
   skip path that still reports).
4. A GitHub merge queue on `main` in place of strict up-to-date, so one merge stops invalidating
   every other pull request.
5. More supply: self-hosted runners on the M5 Pro (18 cores, 64 GB). Weigh the risk of running
   pull request code on this machine.

Record the chosen design as a brain ADR in `2 Areas/20-29 Orbit Engineering/Decisions/`.

### Changes that reached `main`

| what | PR | state |
|---|---|---|
| Dependabot pull requests can publish their required checks (CodeQL advanced setup, Sonar for Dependabot) | `ui#1062` as `d7b5448f` | merged |
| The 46 Dependabot alerts on `main` are cleared, `npm audit` 0 | `ui#1063` as `e0d82c6e` | merged |
| The reachable `decode-uri-component` advisory is closed | `ui#1070` as `af2acf56` | merged |
| API key creation needs an email or agent step-up (`#529`) | `api#528` as `b1593ff8` | deployed, Render `dep-daqqqdjrjlhs73cqkbcg`; `RequireApiKeyCreationStepUp` on |
| MCP tools read and set a habit's emoji (`#513`) | `api#546` as `90505807` | merged at wrap-up; Render deploy NOT verified |
| NuGet group bump | `api#538` as `dd9475ed` | merged |

No Android release this run: `ui#1057` did not merge.

### Merged into `redesign/main` (built, not shipped)

`ui#1044`, `#1054`, `#1055`, `#1056`, `#1058`, `#1059` (`core.md` rule 8 line), `#1060` (`#493`),
`#1061` (`#501`), `#1064` (`#574`: one habit log renders 1 row, not 120), `#1065` (`#499`), `#1073`
(`#527`). Landing `redesign/main`: `landing#82` (`#509`).

### Tickets

32 closed, including two board sweeps that closed tickets whose merged PR carried a cross-repo
`Closes` that never applied (`#187`, `#233`, `#327`, `#361`, `#370`, `#372`, `#377`, `#421`,
`#424`, `#431`, `#434`, `#441`, `#516`, plus `#454`, `#471`, `#495`). Filed: `#644` to `#657`
(`#644`, `#645`, `#652` are closed). 216 open at handoff.

### Items that need a person, each with what was tried (rule 8)

- **Supabase redirect allowlist** (for `ui#1066`, before the redesign ships). Goal: Google sign-in
  returns to `/auth-callback?authAttempt=<uuid>`. Tried: no `supabase` CLI, no `~/.supabase`, no
  `SUPABASE_ACCESS_TOKEN`, no keychain item; the Supabase MCP has no auth URL config tool. Needed:
  Thomas adds `https://app.useorbit.org/auth-callback\?authAttempt=*` in Supabase > Authentication >
  URL Configuration, or a personal access token lets a run `PATCH /v1/projects/{ref}/config/auth`.
- **Cloudflare Turnstile** (for `api#550`). Goal: bot protection on anonymous writes. NOT tried yet:
  the next run tries every Cloudflare tool and token on this machine before this reaches Thomas.
- **`#565`** (Today `t.map` crash). The worker rebuilt release `76e01034`, but the emitted chunk
  differs from the recorded one and no source map was uploaded. This machine has no Vercel CLI.
  Decided: upload source maps from the web build (own ticket) so the next event maps, then fix.
- **SONAR_TOKEN** is DONE: copied into `orbit-ui-mobile` Dependabot secrets by a temporary workflow
  that was deleted after the copy.

### Constraints learned this run

- **After a merge-forward on protected `main`, request a FULL re-review.** The incremental approval
  can leave the PR without the required `pullfrog-approval` check (`ui#1057`, `api#539`). The full
  re-review can also find new defects (`ui#1057` round 5 came from one).
- **Review workers commit and do not push.** The orchestrator resolves the threads, then pushes, so
  a round costs one Pullfrog review, not two.
- **Launch a worker with `run_in_background`, never a trailing `&`.** Killing the launcher does not
  kill `codex`; find and stop the orphaned processes too.
- **A restart of the Claude process kills every background launcher.** At this handoff the `#657`
  launcher died mid-round and left a dirty worktree with an unpushed commit.
- **`gh run rerun` reuses the original event payload.** A label added after the run is invisible to
  it; rerun the run that the label event created, or push a new head.
- **A failed branch lookup is not a new tip.** The cancel-superseded script cancels only when the
  tip is a 40-hex SHA; a dynamic CodeQL run that was cancelled cannot be rerun.
- **Read the commit result before a thread reply.** A pre-commit hook refused a fix, and the reply
  still said "fixed in" a commit that did not carry it.
- **CodeQL default setup is `not-configured` on `orbit-ui-mobile`.** The advanced `codeql.yml` owns
  scanning; a `main` PR without that file needs a merge-forward to get Analyze checks.
- **A cross-repo `Closes orbit-tickets#N` does not always close the ticket.** Run
  `node tools/complete-ticket.mjs` after every merge.
- **Pullfrog 0.1.83 is still not published** (`npm view pullfrog version` returns 0.1.82 on
  2026-09-24), so the three pin PRs still wait.

### Open pull requests at the end of this run

`gh pr list --state open` in each repository reproduces this. 29 `ui`, 21 `api`, 1 `landing`.

| PR | base | state at handoff | disposition |
|---|---|---|---|
| `ui#1068`, `#1074`, `#1075`, `#1076` | `redesign/main` | APPROVED at head, 1 Unit Tests pending | merge (Thomas authorized) |
| `api#539` (`#588`) | `main` | merged forward to `07d667fb` after `api#546`; CI and review owed | merge (Thomas authorized) |
| `ui#1071`, `#1078`, `#1081` | `redesign/main` | APPROVED at head | `#1078`: push local fix `e1033d6a` (en price wrap) first; merge each when green |
| `ui#1066`, `#1067`, `#1069`, `#1072` | `redesign/main` | APPROVED at an older commit | same-head re-review, then merge |
| `ui#1052` (`#633` backport) | `redesign/main` | DIRTY (conflict), last review COMMENTED | merge-forward, resolve, re-review, merge; then `#556` |
| `ui#1029` (`#612`) | `redesign/main` | CHANGES_REQUESTED, 1 open thread at `25211d1a` | fix round |
| `ui#1030` (`#615`) | `redesign/main` | CHANGES_REQUESTED | waits for `ui#1029` (same files) |
| `ui#1049` (`#559`) | `redesign/main` | CHANGES_REQUESTED, 2 open threads after the model rewrite | fix round |
| `ui#1077`, `#1079` to `#1090` | `redesign/main` | no review yet (`#1079` has a `pullfrog-approval` failure) | clear reviews |
| `ui#1057` (`#557` backport) | `main` | BEHIND, no approval | after `api#553` deploys: merge-forward, full re-review, merge, `/android-release` to the open track |
| `api#540` to `#544` | `main` | `pullfrog-approval` SUCCESS, BEHIND | merge one at a time, merge-forward just before each turn |
| `api#545`, `#547` | `main` | `pullfrog-approval` FAILURE | read findings, fix round |
| `api#548` to `#552`, `#554` | `main` | no review yet | clear reviews; `#550` also needs Turnstile |
| `api#553` (`#657`) | `main` | worker died mid-round | read worktree `ticket-657-logout-session-family` (1 unpushed commit `64b1a506`, 2 dirty files), finish, push |
| `api#531`, `#532`, `#533` | `main` | older rounds owed | batches 1, 2a, 6 |
| `api#535`, `#530` (Dependabot) | `main` | `#530` CHANGES_REQUESTED | merge each when approved and green |
| `ui#1046`, `api#537`, `landing#80` (pins) | `main` | wait for Pullfrog 0.1.83 | re-review after the release |

## What the 2026-09-25 sleep run added (session `707e6949`)

**Durable because** it records the CI admission design, the branch rule Thomas restated, and the
merge-order mistake this run paid for. The decision log (D1 to D126) was in the session scratchpad
and is gone; everything durable from it is here.

### The CI congestion fix

- **`api#555` (`#659`) merged** as `dc68392f`: every `orbit-api` `pull_request` workflow now has a
  `concurrency` group with `cancel-in-progress`.
- **`ui#1091` (`#658`) is OPEN, not merged.** It adds `tools/lib/admission.mjs` and
  `tools/wait-ci.mjs`. `launch-worker.mjs` refuses a NEW ticket worker (exit 8) above 10 open PRs or
  30 queued runs in the last 24 hours; a branch that already has an open PR is exempt, and the gate
  fails closed. `wait-ci.mjs` is a registered wake source that settles only when no check is pending,
  no workflow run for the head is queued or running, and the same completed set holds on two quiet
  polls. Harnesses at `bdcad824`: tools 2,151 OK, hooks OK. Last review COMMENTED at `15a0747d`.
  **It targets `redesign/main`, and by the 2026-09-25 rule it belongs on `main`.**
- Brain ADR D133: `An unattended run caps its own CI demand in code and waits on CI through a
  registered wake source.md`.
- CI queue at handoff: 8 queued on `ui`, 0 on `api` (was 259 at the previous wrap-up).
- Multipliers still open, each a ticket: `#661` (rerun a required check cancelled by concurrency),
  `#663` (every merge invalidates every PR's surface manifest), `#667` (serve web fonts from the repo;
  the `next/font` Google fetch fails `Build` at random), `#668` (every `orbit-api` contract merge turns
  Contract Drift red on every open `ui` PR).

### Rules this run paid for

- **Type-check the merge result before merging a PR whose base moved (D115).** `ui#1069` renamed
  `readOnly` to `completionReadOnly`; `ui#1052` merged after it with a test still passing `readOnly`
  and broke `redesign/main` type-check for every open PR. `#669` / `ui#1094` fixed it. Merging with
  `git merge --no-commit origin/redesign/main` then `npx tsc --noEmit` in both apps catches it.
- **Contract Drift on `redesign/main` is advisory when the PR touches no
  `packages/shared/src/types/`** (core rule 4: it regenerates from `orbit-api` live `main`, not from
  the PR). On `main` it is required; re-baseline the snapshot with `npx --yes orval@8.37.0` (main's
  lock), never the local 8.20.
- **Read the diff before replying on a thread.** Two replies this run claimed behaviour the code did
  not have and needed corrections.
- **Codex hung twice on one auth merge** (`KILLED_NO_PROGRESS`, zero tool calls). The second launch
  ran on the Claude engine per `orchestrate/SKILL.md` §5.4.1, config reverted after.
- **A bare `Fixes #N` in an `orbit-api` PR body points at an `orbit-api` issue.** Rewrite it to
  `thomasluizon/orbit-tickets#N` before merge, and run `node tools/complete-ticket.mjs` after.

### Shipped

- **Live:** Android 1.3.33 (92) on the Play open track from `main` `1ea4baab` (`ui#1057`, `#557`:
  an expired Android session recovers instead of signing out). `orbit-api` `main` merged and deployed
  by Render: `api#539` (bulk week interval), `#540` (freeze source), `#541` (support tool on the
  support entry), `#542` (repairable streak gap dates), `#543` (sub-habit title), `#546` (MCP emoji),
  `#547` (a crisis turn in Astra returns the fixed 988 / CVV 188 reply before any AI call), `#553`
  (logout revokes the whole refresh-token family, deployed 2026-09-25 03:41 UTC), `#533` (onboarding
  repeat interval), `#555` (concurrency). `#660` becomes due 168 hours after `#553`'s deploy.
- **Built on `redesign/main`, not shipped:** `ui#1029` (`#612` shared-browser account leak), `#1052`,
  `#1064`, `#1067`, `#1068`, `#1069`, `#1071` to `#1083`, `#1085`, `#1087`, `#1092` to `#1094`.
  Landing `redesign/main`: `landing#82`.

### Decided this run, recorded on the tickets

- `#392`: a bad-habit slip never sets `lastCompletionDate`; an empty Today shows returning guidance.
  `#665` carries recording the slip at write time.
- `api#547`: any detected crisis turn, even a figurative one, gets the fixed support reply. Safety
  over false positives.
- `ui#1080`: `DESIGN.md` ListRow chevron moved from `fg-4` to `fg-3` (`fg-4` on `bgElev` measures
  2.59:1, under the 3:1 graphic floor).
- `api#531` (`#367`, colour-scheme collapse) is redesign work: it moves to `orbit-api`
  `redesign/main` (Thomas, 2026-09-25). Recorded on the PR.

### Items that need a person, each with what was tried (rule 8)

- **Cloudflare Turnstile** for `api#550`: a widget for `useorbit.org` and Render
  `BotProtection__SecretKey`. Tried: `wrangler`, `cloudflared`, `flarectl` (none installed),
  `CLOUDFLARE*` / `CF_*` / `TURNSTILE*` env (none), keychain `cloudflare` (none), Render `orbit-api`
  env (52 vars, no Cloudflare key). `api#550` merges and deploys inert (`BotProtection__Enabled`
  unset), so it does not wait on this.
- **Supabase redirect allowlist** for `ui#1066`: unchanged from the previous section.
- **Live check of the crisis reply**: send a crisis message to Astra in production and confirm
  988 / 188 shows.

## What the 2026-09-25 day run added (session `77ddefe6`)

**Durable because** it records the CI-multiplier fixes Thomas made the priority, 17 merges, a live
security fix, Thomas's four answers at `/wrap-up`, and the rules this run paid for.

### Merged this session, 17

- **`orbit-api` `main`, all deployed** (Render, read back: `dep-dar8da2vcj2c73a5pvbg` live at `1e6f85f8`
  at 14:36 UTC, each earlier merge went live then was superseded): `api#544` (`#591`, recurrence time
  zone), `#545` (`#569`, BYDAY projection), `#548` (`#369`, closed week and year recaps), `#551`
  (`#324`, Google sign-in retry), `#557` (`#671`, **security**: a confirmed MCP call could run twice on
  one token; now claimed atomically), `#549` (`#391`, `lastCompletionDate`, durable across habit cleanup
  and parent cascades) as `7d13802b`.
- **`orbit-ui-mobile` `main`:** `ui#1097` (`#668`, Contract Drift pinned to one orbit-api commit plus a
  scheduled rebaseline job) as `6d2468ca`.
- **`orbit-ui-mobile` `redesign/main` (built, not shipped):** `ui#1089` (`#608`), `#1088` (`#593`),
  `#1086` (`#603`), `#1066` (`#631`, shared-browser Google session replay), `#1091` (`#658`, the
  admission gate and `tools/wait-ci.mjs`), `#1030` (`#615`), `#1095` (`#663`, manifest churn removed),
  `#1084` (`#572`).

### The CI congestion multipliers, where each stands

1. `orbit-api` concurrency groups: merged earlier (`api#555`).
2. Surface manifest churn: FIXED (`ui#1095`). Merges changed only `closureSize` and `generatedFrom`
   (96 and 520 lines per merge); both are gone, so one UI merge no longer conflicts every other.
3. `next/font` Google fetch flake: `ui#1096` (`#667`) open, local Latin fonts, build passes with Google
   blocked. `main` backport owed (main loads Rubik, Inter, Roboto).
4. Contract Drift: FIXED on `main` (`ui#1097`). A port to `redesign/main` is owed.
5. Strict up-to-date `main`: Thomas said turn it off; not yet done.

### Rules this run paid for

- **After a merge-only push, request the review; after a real commit, never.** A manifest-only or
  map-only merge got NO Pullfrog review (`ui#1066`, `#1095`, `api#548`, `api#557`); a duplicate request
  after a real commit bought a second review (`api#549`, which then found a real P1).
- **Match the build's error COUNT.** A grep for `Error(s)` pushed a non-compiling `api#549` merge; the
  fix was `StreakFreeze.Create`'s new `origin` parameter from `#540`.
- **Every orbit-api merge-forward conflicts on `architecture.html`.** Regenerate with
  `node tools/arch-map.mjs`, run it twice to prove stability, and run
  `dotnet ef migrations has-pending-model-changes` when two branches add migrations.
- **A branch that edits `.claude/orchestrator.json` must contain `origin/redesign/main` to run the
  harness.** Otherwise 58 cases fail on `assertNotStale`; merge the base first.
- **`main`'s harness is 157 files behind and fails in a macOS worktree** (`#672`). The redesign harness
  reaches `main` when the redesign merges; per-fix backports carry the urgent parts.
- **Never pass a hand-typed sha.** A merge call with a reconstructed sha was refused by the head check.

### Items that need a person

- Supabase callback allowlist: DONE by Thomas (`#631` comment). Optional: add
  `http://localhost:3000/auth-callback\?authAttempt=*`, delete the two dead `/pt-BR/auth-callback` rows.
- Turnstile: needs the sign-in widget first (a ticket to file), then Thomas pastes the Cloudflare secret.
- Crisis reply live check: unchanged.

## What the 2026-09-25 afternoon run added (session `205c74ca`, attended)

**Durable because** it records Thomas's answers to every `needs:conversation` ticket, the Astra rendering
program, the strict-mode change, 13 merges, and the rules this run paid for. The run record
(`.git/orbit-orchestrate-run.json`, session `205c74ca`) holds the ledger.

### Thomas's answers, in his words or his chosen option

- **"Turn it off"** (from `/wrap-up` 77ddefe6): DONE. `required_status_checks.strict` is `false` on `main` in
  `orbit-ui-mobile` and `orbit-api`, contexts unchanged (21 and 16). Brain ADR D138, `Turn off require branches
  up to date on main in both code repositories`. The harness still merges `main` into a behind branch; with
  strict off, a behind PR may instead merge after its merge result is built and tested locally (D115), which
  this run did for `api#530`, `#554` and `#559`. A required gate that diffs against `main` (the orbit-api
  `OpenAPI Breaking-Change Gate`) still forces a merge-forward when the head is stale.
- `#320` competitor study: **"Close stage 5"**. Closed as completed; the capture stays a known gap.
- `#217` first experience: **"Ask on reminder toggle"** (filed as `#674`), **"Keep pointing at Today"**, **"No"**
  chips on Today. Criteria verified against PR 1007; closed.
- `#318` Astra rendering: **"Prose only without data"**, **"Add a real chart"** (a granted design-system
  expansion), **"Bars per day"**, **"Neutral bars"** (no accent), **"Astra and Progresso"**, **"Real images
  only"**, follow-ups **"Astra, in the same reply"**, and beautifului.dev patterns "Insight Cards, Thinking trace,
  Follow-up chips, everything that makes sense". At the /ticket gate: **"Fewer, larger tickets"**, then "7
  tickets". Program: `#677` (goals-gate bug on `main`, merged), `#678` API-A every read card, `#679` API-B
  preview diffs + tool steps + follow-ups, `#680` UI-A bar chart in Progresso + metrics and insight blocks,
  `#681` UI-B the other read blocks, `#682` UI-C diff rows + thinking trace + chips (now also blocked by `#24`,
  whose Stage 3 adds the per-item edit and reject the preview lacks). `#318` closed. Deferred on purpose: the
  stale-block rule for read blocks, one later ticket for every block.
- `#666` (copy) and `#620` (container stretch, no new prop) were decided without him; both `needs:no-conversation`.
- `/questions` over the 26 open tickets with an "Open questions" section: **zero survived**; every answer is a
  comment on its ticket. Closed as superseded or duplicate: `#300`, `#263`, `#64`, `#108` (folded into `#675`).

### Merged this session, 13

- `orbit-api` `main`, deployed by Render: `api#552` (`#325`, duplicate habit-log recovery), `#530` (actions bump),
  `#550` (`#107`, Turnstile verification, **inert**: `BotProtection__Enabled` unset), `#559` (`#683`, stored week
  anchors plus the cache-miss week semantics), `#560` (`#677`, free users get goals in Astra, goal review not Pro).
- `orbit-api` `redesign/main`: `api#556` (`#670`, main sync plus the week-anchor fix), `#532` (`#75`, redesigned
  emails and error copy), `#531` (`#367`, colour schemes collapsed to one accent).
- `orbit-ui-mobile` `redesign/main`: `ui#1090` (`#392`, returning guidance), `#1096` (`#667`, local fonts).
- Earlier in the run: `api#556`, `#552` recorded above; `#667` stays OPEN until its `main` backport merges.

### Rules this run paid for

- **A review that loops on an evaluator is a scope problem, not a fix problem.** `ui#1049` took 37 P1 threads in
  7 rounds on a hand-written JS evaluator inside an ESLint rule. Round 7 cut the rule to the ticket's own
  contract (write-free local const object literals, checked with `scope.references`), 823 to 480 lines. When a
  third round finds a new edge case of the same machinery, shrink the contract to what the ticket asks.
- **Merge-forwards double generated or YAML blocks.** Two merges this run left a duplicate top-level
  `concurrency:` key in `dependency-review.yml` and `sonarcloud.yml`, which silently stops CI. After any
  merge-forward in orbit-api, `grep -c '^concurrency:' .github/workflows/*.yml` must print 1 per file.
- **A squash of `main` into `redesign/main` makes later merges conflict in files both sides already agree on.**
  Merge `origin/main` first, then `origin/redesign/main`; most conflicts collapse.
- **`list-bot-threads` can read the old head right after a push.** Sleep ~20 s after pushing before waiting.
- **Contract Drift stays red on every `redesign/main` PR until `ui#1098` merges** (it pins the redesign contract
  to orbit-api `redesign/main`). Merges this run treated it as advisory with a PR comment naming the reason.
- **Cloudflare publishes test secrets**, so a Siteverify contract can be proven live without a credential
  (`1x…AA` pass, `2x…AA` fail, `3x…AA` spent; dummy token `XXXX.DUMMY.TOKEN.XXXX`).
- **Never type a sha or reuse a `||` fallback on a write.** One ticket create used `||` after a usage error; no
  duplicate resulted, but the rule stands.

### Items that need a person

- Tap the three-dot menu on a habit row on Android 1.3.32 or later, then close `#134`.
- Turnstile switch-on (manual steps on `#675` and in `api#550`'s README): after `#675` ships on web and Play and
  the landing sends tokens, Thomas pastes the Cloudflare secret; the run sets Render `BotProtection__SecretKey`
  and `BotProtection__Enabled=true` and verifies all five routes.
- At the redesign release: raise `AppConfig.MinSupportedVersion` to the redesign Android build (`#367` comment).

## What the 2026-09-25 evening sleep run added (session `e6f854b8`)

**Durable because** it records 14 merges, the drift and sync discovery, the Pullfrog pin workaround,
Thomas's "fix everything" instruction, and three rules this run paid for. The decision log (D1 to D64)
lived in the session scratchpad and is gone; everything durable from it is here.

### Thomas's instruction, 2026-09-25 evening

- **"just fix everything and continue"**, said when the run reported `api#535` stuck on Dependabot and
  the pin PRs waiting on Pullfrog 0.1.83. Read as: a parked item is not parked, resolve it by hand now.

### Merged this session, 14

- `orbit-ui-mobile` `main`: `ui#1099` (`#667` local web fonts), `#1100` (`#631` Supabase session replay,
  plus a fix so a stale Google callback no longer erases the newer attempt), `#1101` (`#689` drift job
  broken pipe), `#1102` (`#615` intended-account checks on every web write, with the reload recovery on
  every refusal path), `#1103` (`#672` main harness runs in macOS worktrees), `#1104` (`#690` rebaseline
  write token isolated from install-time code), `#1105` (`#658` admission gate with atomic claims).
- `orbit-ui-mobile` `redesign/main`: `ui#1098` (`#668` redesign contract pin, two-job rebaseline).
- `orbit-api` `main`, deployed by Render (`api#554` read back live at `81b927c4`, `/health` 200): `api#554`
  (`#564` Hangfire idle disconnects), `#558` (Scalar 2.17.10), `#561` (`#673` tamper test), `#562` (`#676`
  goal clock), `#537` (`#636` Pullfrog pin).
- Closed without merging: `api#535` (every one of its 24 updates was already on `main`).

### What the run found

- **`redesign/main` had not contained `main` since 2026-09-15** (merge-base `d12d1772`, 20 commits). The
  drift job hid it behind a broken pipe (`#689`); after that fix it stops on real conflicts. `#691` /
  `ui#1107` is the sync. **It must land by fast-forwarding `redesign/main` to the approved head with a
  normal push, never a squash**: `allow_merge_commit` is false in both repos, and a squash drops the
  ancestry so the drift job stays red. Same review bar (Pullfrog at the exact head, green CI, zero
  threads). `#692` (redesign admission) and `#693` (main Android checklist keys) follow it.
- **The contract rebaseline job gave its write token to install-time code** (`npm ci` installs Lefthook
  hooks, then commit and push ran them with `GH_TOKEN`). Split into a read-only generate job and a write
  job that installs nothing, on both branches (`ui#1098`, `ui#1104`).
- **Pullfrog pin**: the published `pullfrog` 0.1.82 has no `gpt-6-sol` entry, so `effort: medium` was
  dropped. The pin PRs now run `pullfrog/pullfrog@405f60c2` with `PULLFROG_FORCE_LOCAL_CLI=1`, which makes
  `runCli.ts:272` run the checkout's own code (`models.ts:189-192` has `gpt-6-sol` with a medium rung).
  Live on `orbit-api` (`api#537`). **When `npm view pullfrog version` prints 0.1.83 or later, return all
  three to `@v0` and drop the variable.**

### Rules this run paid for

- **`packages/shared` never imports React, React Native or Next** (`packages/shared/CLAUDE.md:7`). Two
  workers put React hooks there tonight; each reached the web server Sentry config through the root
  barrel and broke `next build`. Shape: a React-free `*-core` in shared, a thin hook in each app.
  `#694` / `ui#1108` makes lint fail on it. Say this in every UI worker order until that merges.
- **Start a waiter about 20 seconds after a push**, or `wait-ci` reads the old head and ends
  `HEAD_MOVED`. Never start one with `& disown`: only a `run_in_background` task wakes the session.
- **A generated-files-only push gets no Pullfrog review and dismisses the old approval**: request one
  (`api#562`).
- **Read a claim before writing it on a PR.** A thread reply said a PR was approved when it was not;
  corrected at once in a comment. Check with `list-bot-threads.mjs` first.
- **A worker order that names a test boundary can change semantics**: "race at `limit - 1`" led a worker
  to flip D133's "refuse above the cap" to "at the cap"; restored. Name the rule, not a test shape.
- **Admission regress stops at a fixed window (D117)**: released claims hold both PR and queued-run
  capacity for 5 minutes, then expire.
- **`ui#1049` took 12 review rounds** on the spacing rule; rounds 8 to 12 were precedence edges of the
  round-7 contract, each under 30 lines. The PR body now states the full contract.

### Items that need a person

- Turnstile switch-on after `ui#1106` ships on web and Play: Cloudflare hostnames, the two site-key
  variables, then Thomas pastes the secret (steps in the `ui#1106` body).
- After the redesign `orbit-api` deploy of `api#564`: confirm `astra_change_preview_disabled`,
  `astra_tool_steps_disabled` and `astra_follow_ups_disabled` are absent or false in `AppFeatureFlags`.
- Unchanged: tap the three-dot menu on Android 1.3.32+ then close `#134`; live-check the crisis reply.
