---
name: auto-work
description: Keep the canonical unattended orchestrator working across an empty queue. Each cycle drives in-flight work, investigates Sentry, reads the Orbit mailbox and store reviews, and admits the board. Default pace; --crank explicitly enables crank and --disable restores normal sleep completion.
argument-hint: "[--crank] [--disable] [optional focus]"
---

# /auto-work

**At a glance:** continuous intake on the existing `/sleep` lifecycle. An empty admitted queue
starts another intake cycle after a registered wait. It never creates a second scheduler,
relaxes a quality gate or changes merge and release authority.

## Entry and mode

Read `.claude/skills/sleep/SKILL.md` and enter through that skill, including relay adoption,
the initial write and readback, the scratchpad decision log and canonical orchestrator entry.
After its initial state write or adoption, enable this mode before canonical queue selection
or dispatch, so a fresh session with an empty board still reaches the first intake cycle.
An existing run keeps its admitted queue, readiness ledger, relay and decision log. With no
focus, use `/sleep`'s `/orchestrate --auto` entry. Adopt a nominated relay before changing mode.

Run `node tools/auto-work-state.mjs --enable` in the orchestrating checkout. Read the state
back with `readRunState` from `tools/lib/run-state.mjs`, confirming this session and
`autoWork: true`. Preserve `intake` on every write. `writeRunState` carries both forward within
the session and into a relay successor. Change part of the record only through `updateRunState`,
which reads and writes under one lock. `updateRunState` refuses the change from a superseded session with
`session is superseded; run state write refused`, so the read-back then shows the successor's record unchanged.
An owner-started successor restores the prepared
handoff through `/sleep` entry before any ordinary state write. Each intake writer also reads
its write back.

Default entry leaves the existing `crank` value alone. Only an explicit `/auto-work --crank`
invokes `.claude/skills/crank/SKILL.md`; the owner's own `/crank` remains available. Never add
`--crank` to entry or relay just because auto-work is enabled. Inherited crank follows its
own skill. Log mode changes through `/sleep`'s decision format.

For `/auto-work --disable`, do not enter a new run. On the current run execute
`node tools/auto-work-state.mjs --disable`, read back `autoWork: false`, and retain sleep,
crank, queue, intake and ledger. Continue the ordinary `/sleep` completion condition.
With no run there is nothing to disable. An owner stop uses `/sleep`'s stop procedure.

## One cycle, in order

Run all steps on entry and on each wake that is not an idle waiter wake. A wake from the idle
waiter runs only the steps for the sources it names (see Idle and relay). A relay drain follows
the canonical relay protocol before any new admission; unfinished intake remains in run state
for the successor.

1. Answer any owner message first, as `/orchestrate` requires. Apply changed instructions
   before continuing intake or queue work.
2. Drive in-flight pull requests, reviews, releases and waiters through `/orchestrate`.
   Start each wake with `node tools/run-status.mjs --session <session id>` and act on its
   observations, then follow its `INTAKE` action through steps 3 through 7. After an idle
   waiter wake with reason `SOURCE`, the `INTAKE` action covers only the steps for the sources
   in its `wakes` list. An active auto-work run receives `INTAKE` instead
   of `NO_ACTION`; a relay drain still takes precedence. Admission caps, hard stops, quality gates and merge rules remain owned by
   `/sleep`, `/crank` and `/orchestrate`; this mode supplies no additional authority.
3. List every unresolved Sentry issue through the Sentry MCP in organization
   `orbit-ai-habit-tracker`, region `https://us.sentry.io`, without a project, recency or
   first-page-only filter. Discover the available MCP schema, use `is:unresolved`, and exhaust
   its pagination or continuation mechanism. Do not substitute the organization's old alias
   from an investigation example. Compare every issue with `intake.sentry` and the open board,
   including new events on already-ticketed issues. For an issue without a carrying ticket,
   execute `.claude/skills/investigate/SKILL.md`'s evidence procedure through verified root
   cause, then `.claude/skills/ticket/SKILL.md`'s ticket construction through
   `node tools/create-ticket.mjs`. Keep the event, code location and verified cause in the
   ticket; a hypothesis alone does not qualify. A live production defect gets its own ticket;
   fold it into an existing open ticket when that ticket already owns the affected area.
   Use `tools/comment-ticket.mjs` for the source evidence when folding. Persist the issue id,
   last observed event and carrying ticket in `intake.sentry`, then read back the state. Admit
   its worker through `/orchestrate` in this cycle, within existing capacity. Retain the
   standing release verification rule: resolve a Sentry issue only after its carrying release
   shows no new event. Ticketing, a merge or an empty local queue is insufficient.
4. Read the Orbit mailbox with `node tools/orbit-mail.mjs --collect`. This uses the Gmail API
   as `contact@useorbit.org`; the claude.ai Gmail connection reads a different mailbox and
   cannot substitute. Exhaust all pages. The tool scans received message ids, including spam
   and trash, without an age cutoff or an ordering assumption; it fetches bodies only for ids
   absent from completed state and from completely read pending items. Every text MIME part
   behind `attachmentId` is fetched through Gmail's attachments endpoint. Unreadable parts
   retain their identifiers and mark the message incomplete; replies remain drafts regardless
   of classification. The next collection retries incomplete messages while preserving reply
   and send-attempt receipts. This costs an id listing per mailbox page
   but avoids timestamp ties, relay loss and expired history cursors. The client paces calls
   under Gmail's 6,000 quota units per minute per user (a full message read costs 60), so a
   first collection reads about 100 messages per minute. Run a large collection in the
   background or with a 600000 ms timeout. A rate-limit answer retries with jittered
   exponential backoff from one second, for 7 attempts at most. Two failures stop the
   collection: a rate limit that is still present after the last attempt, and any other
   failed list or message read. A failed attachment read does not stop it; that message
   becomes incomplete, as above. Classify every pending message using the disposition
   procedure in `disposition-and-setup.md`.
5. Collect the store reviews with `node tools/orbit-play-reviews.mjs --cycle`. This one command
   is the review cycle for the session and for the idle waiter. It persists a unique cycle in
   `intake.play.workflowCycle`, dispatches `.github/workflows/orbit-play-reviews.yml` on `main`
   with that cycle, and finds the exact run by its `displayTitle`. It imports every artifact of
   that run, then clears the cycle. A persisted cycle survives a relay, and the next call resumes
   it without a new dispatch. Run the command as an in-flight background task with
   `/orchestrate`'s registered file-waiter procedure; it can wait up to 600 seconds for the run.
   Intake of other sources and board admission can continue while it runs. It prints `keys`,
   the `pending` reviews, `backfillRequiredSince` and, for a partial collection, `failure`.
   A non-zero exit is a failed read: log its last stderr line and retry next cycle.
   The workflow alone reads `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, fetching all review pages for
   `org.useorbit.app` and `org.useorbit.app.staging`. No publishing key reaches the Mac.
   The cycle imports a partial artifact even when a package failed. Log the failure once per
   unchanged reason; the next cycle retries it without advancing its successful-collection mark.
   Classify every pending review. Versioned review ids include modification seconds and
   nanoseconds; equal timestamps never discard different reviews. High-water timestamps are
   diagnostic marks, not a filter that could miss ties or edits.
   Google exposes commented production reviews created or modified within the last week;
   star-only ratings and testing-track feedback are outside this API. If a package has no
   production review access, record the precise API failure and continue the other sources.
   A `backfillRequiredSince` flag means a collection gap exceeded that window: retain it,
   log the missing interval and recover the Play Console CSV before claiming full coverage.
6. Check the iOS app prerequisite `#1561`. Until it exists, record
   `intake.appStore.waitingOn: "#1561"` and log it once, preserving that marker across relays.
   Recheck the prerequisite each cycle without repeating the log. Once the app exists, the
   same review workflow's optional App Store job uses `ORBIT_IOS_APP_STORE_ID` and the existing
   iOS release credentials. The step 5 cycle imports its `orbit-app-store-reviews` artifact
   from the same run when the artifact is present.
   The reader exhausts App Store Connect's customer reviews pagination. It retains review id,
   creation timestamp and content hash in `intake.appStore`; Apple's review schema has no
   modification timestamp, so changed content creates a new version without inventing one.
   Apply the same disposition procedure and retain replies in the run log, acknowledging
   through `node tools/orbit-app-store-reviews.mjs --ack` with the same review receipt shape.
   Missing app credentials are a named external dependency, never an empty successful read.
7. Read `node tools/plan-queue.mjs --board` and use `/orchestrate`'s `--auto` selection to admit
   every finishable open ticket in that order within the current run. Append newly admitted
   tickets to `remaining` through `updateRunState` and read back the queue; never enter a second
   orchestrator or replace admitted and in-flight work. Skip only a ticket
   awaiting the owner personally or a named third party; log the reason once per ticket in
   `intake.boardBlocked`, updating it only when the reason changes. Dependency ordering and
   admission limits postpone launches under the canonical scheduler; they do not discard
   tickets. The end of the spec is not the end of this mode.

On any source failure, preserve its pending items and marks, log the concrete failure and
continue independent sources and in-flight work. Retry next cycle. Never record a failed read
as an empty source or claim that missing root-cause evidence was verified.

## Disposition of each message or review

Read `.claude/skills/auto-work/disposition-and-setup.md`, section "Disposition of each message or review", before you classify a pending message or review. It holds the classification, the send authority and the acknowledgement receipts.

## Idle and relay

When nothing is launchable, keep `autoWork: true` and register
`node tools/wait-auto-work.mjs` as a background task using `/orchestrate`'s wake protocol.
Confirm the source is live and name it on the last line of the turn. At the end of each
fifteen-minute interval, the waiter checks the sources itself, with no model call:

- the board, through `listBoardState` in `tools/lib/github-issues.mjs`. It reads the open
  tickets on the configured project one page of 100 at a time and calls no classifier. One key
  is the ticket number, its `updatedAt` and its open blockers. Thus a new ticket, an edited
  ticket or a blocker that closes is a new key. Only a successful read with no tickets is an
  empty board.
- the mailbox, through `node tools/orbit-mail.mjs --unseen` (ids absent from completed and
  pending state);
- the reviews, through the step 5 command `node tools/orbit-play-reviews.mjs --cycle` (pending
  Play and App Store review ids).

A key absent from `intake.wake.seen` is new. The waiter exits only for one of these causes:

- a new item;
- a source failure with a signature that differs from `intake.wake.failures`;
- the Sentry listing is due;
- the owning mode changes or a relay becomes pending.

An interval with nothing new does not wake the model. A repeated identical failure wakes the
model only once. The waiter has no read-only Sentry token, so its `sentryMode` is `mcp-hourly`.
It wakes the model once an hour after the last Sentry listing, and that wake runs step 3
through the Sentry MCP.

The waiter prints one JSON line. A `SOURCE` result has a `wakes` list, and each entry has a
`source` (`board`, `mail`, `reviews` or `sentry`) and a `kind`:

- `new` gives the new keys in `items`. Run the step for that source: `mail` runs step 4,
  `reviews` classifies the pending reviews of steps 5 and 6, and `board` runs step 7. The
  waiter already ran the review cycle, so the pending reviews are in `intake.play.pending` and
  `intake.appStore.pending`; read them with `readRunState` and do not start another cycle.
- `failure` gives the signature in `failure`. Log it once, then run the step for that source,
  which retries the read and keeps its pending items and marks.
- `due` (only `sentry`) runs step 3.

Then register a new waiter. The waiter writes its seen keys, failure signatures and the Sentry
listing time to `intake.wake`, so a relay or a new waiter keeps them. Work already in flight
keeps its own wake sources and takes priority on wake.

On a context relay, follow `.claude/skills/handoff/SKILL.md` with `--relay --sleep`. The adopted
run carries `autoWork`, `intake` and its pending workflow identity; `NEXT.md` starts with exactly
`/auto-work` and retains the canonical Sleep section, spec and inventory. Include crank only
when already enabled. The relay tool validates this entry, stops idle waiters at succession
and retains the original source marks. The successor re-enters through this skill's `/sleep`
adoption path, reads state back and resumes pending work before collecting again.

## Mailbox setup

The one-time Gmail grant and the Play Console reply permission are in `.claude/skills/auto-work/disposition-and-setup.md`, section "One-time mailbox setup, after merge". Read it only when a mailbox read fails on the grant.
