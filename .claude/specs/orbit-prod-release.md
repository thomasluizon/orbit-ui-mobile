# Orbit prod release

## What this is

The goal is a production release with an empty ticket board. Complete the redesign on web and Android, obtain the owner's whole-redesign approval, then complete the remaining batches and `/prod-readiness` findings. Use the granted canvas under `DESIGN.md` and keep web and mobile behavior aligned.

## Standing rules

- Finish the original spec. A blocker becomes the next task. An early stop needs an external cause: allowance exhaustion, machine stop, or the owner's stop request.
- Finish harness work before the redesign. Fix a harness defect in the current run; file a separate ticket only for a real capability gap.
- Report progress in product terms through `/progress`, with short replies that meet the writing contract.
- Run `/questions` before asking the owner anything. Check code, ticket comments, decisions and research first. Ask every surviving question in rounds of at most four.
- Decide questions with a clearly better answer. Follow `DESIGN.md`, `BRAND.md`, the granted canvas and brain decisions. Send genuine product, brand, price and design choices to the owner.
- Choose the complete, correct implementation. Speed changes scheduling, never quality.
- Write user-facing copy from `BRAND.md` in both locales. Review copy against the brand and `/humanizer`; reserve pricing, positioning and brand direction for the owner.
- Route redesign-only work to `redesign/main`; route shipped defects, harness work, CI and security work to `main`. If a shared fix depends on redesign code, land it on `redesign/main` and backport it to `main`.
- Keep `redesign/main` unprotected. The whole redesign receives one closed Play INTERNAL build and one owner review before merging to `main`; do not request an earlier gate.
- Use the configured local worker cap. Relaunch killed workers after checking their worktrees for commits.
- Written authorization covers the requested scope. Ask again only if scope or inputs change.
- The centered phone layout is the large-screen answer. The public Play developer name is TL SOFTWARE ENGINEERING LTDA.
- Build device-dependent work without treating device inspection as an implementation gate. The owner tests the whole redesign from an APK at the redesign gate. Do not boot the owner's Android emulator.
- Gate both listing and revoking API keys behind the emailed code.
- Render Astra responses with visual blocks wherever useful; simple sentences may stay text. Check `#318` before implementing the component plan. Use `beautifului.dev` when it supports the platform.
- Never repeat a paraphrased user report as a verified cause; check the original report.
- New reports affecting the shipped product take priority over the queue.
- Never edit `node_modules`. Confirm installed interfaces by reading them, and implement supported changes in repository code or config plugins.
- Route component-library migration after the redesign: rn-primitives on mobile and Radix on web, with shared component shape and Orbit tokens.
- The failed-delete toast pauses on hover and focus; Retry remains its sole action.
- Keep the Mac awake while a session runs. A closed lid still sleeps it.
- Turnstile enforcement starts only after web and Android sign-in send a token.
- Keep locale out of auth and deep-link URLs.
- `/handoff` ends its session after committing the spec and one `NEXT.md`. `/wrap-up` runs `/progress`, `/questions`, then `/handoff`.
- The orchestrator merges a pull request with `gh pr merge --squash --match-head-commit <sha>` after the exact head has green checks, a Pullfrog approval submitted after its push, and zero unresolved threads. Redesign-only work merges to `redesign/main`; other work merges to `main`. Deploy an `orbit-api` merge to `main`.
- Admin merges happen only inside `/merge-prs` after the owner invokes it for an approved frozen set. Never use a direct merge API.
- Launch Codex workers about 90 seconds apart, never several in the same second. Never pipe a launcher into `head`, because its final line dies on EPIPE.
- Start a waiter only as a background task. A trailing `&` does not wake the session.
- Check every colour, size and shape a worker adds against `DESIGN.md` before pushing. Read the worker's diff for gate edits before pushing (D95).
- After `merge-review-batch-body.mjs`, grep the body for superseded design claims that survived the merge.
- Link tickets in `orbit-api` and `orbit-landing-page` pull request bodies as `thomasluizon/orbit-tickets#N`; a bare `#N` points to that repository's issues.
- When a pull request body edit re-runs Guards, its concurrency group cancels the push's run. Read `gh run list --commit <sha>` before calling a check red.
- A pull request behind `redesign/main` may merge at its approved head after the merge result passes locally: both type checks, three Vitest suites and i18n usage for `orbit-ui-mobile`; `dotnet build` and `dotnet test` for `orbit-api` (D115).
- Until `#697` merges, count a Pullfrog approval only if submitted after the head's push time. Read that time from the `GET /repos/{owner}/{repo}/activity?ref=refs/heads/<branch>` entry whose `after` is the head.
- Pullfrog and Codex share one OpenAI allowance. When exhausted, use Claude headless through the same launcher under `.claude/skills/orchestrate/SKILL.md` §5.4.1, never a subagent.
- Keep `CODEX_HOME` short enough for the macOS 104-byte socket limit; a longer path fails with `path must be shorter than SUN_LEN`.
- The beta fleet permits a simpler deploy order while the owner is the only user, including relaxing deploy-API-first. Keep the full code contract.
- `#74` owns existing copy. Never revisit the redesign gate's timing because of how many screens remain.

## The order

Reconcile the open board with these batches before each handoff. Place each new ticket exactly once. A batch completes before the next begins. Within a batch, use dependency order; drive already open pull requests first.

### Batch 0a: DONE

`#585` closed; `node tools/test-tools.mjs` takes `--only <name>`.

### Batch 0b: the harness, before the redesign

- `#708` UI main timeless-text gate and cleanup
- `#709` API main timeless-text gate and cleanup
- `#710` Landing main timeless-text gate and cleanup
- `#711` UI redesign/main harness prose cleanup
- `#712` UI redesign/main harness code cleanup
- `#713` UI redesign/main product code and documents cleanup
- `#714` UI redesign/main gate port
- `#715` API redesign/main cleanup
- `#716` Landing redesign/main cleanup
- `#717` Make the bounded-process tree-kill test deterministic under load
- Place any cleanup ticket named in a later orchestrator comment here before the other Batch 0b work.

These are the gates every later batch runs through. Re-read each ticket against the tree before building it, and never
file a harness ticket as a substitute for a fix.

- `#556` redesign/main no longer contains main, and the staleness guard blocks every orchestrator tool
- `#616` Delete the three dead local/max-button-words disable directives
- `#655` Detect caller and StyleSheet graphic surfaces in scope guard
- `#656` Classify motion paragraph color as text in surface scope guard
- `#661` Rerun a required check that an out-of-order concurrency admission cancelled on the current head
- `#662` Make the spacing-scale evaluator follow control-flow reachability and logical-expression values
- `#664` Keep optional response removals failing the OpenAPI gate after the oasdiff-action upgrade (orbit-api PR 530)
- `#697` Reject a Pullfrog review that GitHub re-pointed onto a later base-merge head (`ui#1123` open)
- `#702` Contract rebaseline pull requests start no required checks because GITHUB_TOKEN opens them (`main` half merged (`ui#1124`); `redesign/main` port and the owner's GitHub App setup pending)
- `#535` Layout guard covers no 320px width and no Wrapped page, so reflow findings cannot be proven
- `#686` Correct the refuted all-Modals-wedge claim in the mobile guidance
- `#180` Give the audits a concurrency dimension, and reach it from pr-review
- `#190` Workflow-drift proposer that stages candidates for /lesson
- `#230` API gate parity, part 2: clear the 95 hand written pragmas and 7 SuppressMessage
- `#234` Delete FEATURES.md and repoint its seven consumers at the generated artifact
- `#299` sonar-project.properties keeps 27 exclusions naming deleted social files
- `#303` The audit equivalence corpus does not hold its change-one-change-both claim
- `#304` resolvePerformanceMeasurement silently keeps the last duplicate queryId
- `#306` measurementFinderFailed is dead by construction in audit.mjs
- `#307` Align the inlined applyMeasuredQueryContexts guard with its lib sibling

### Batch 0c: live defects in the shipped product, on `main`

Defects a person hits in the shipped build today (web on `main`, Android from `main`, the `orbit-api`
`main` deploy). They target `main` under D99 and the route-by-subject rule; an Android fix is followed by
`/android-release` to the open track.

- `#330` Restore Android push notifications in standalone builds (High: push is off in every standalone Android build)
- `#134` Habit row three-dot menu does not reliably open on Android (fix shipped in Android 1.3.32 (`#633`); verify on a device, then close)
- `#214` Android software keyboard covers the Astra chat input
- `#297` A continuously foregrounded Today view never reflects a change made from another device
- `#178` Un-selecting a cascade-selected sub-habit does nothing
- `#216` Fix the UI claims that are not true, starting with delete cannot be undone
- `#684` Return a distinct error code at the habit ceiling (API first: unblocks `#30`)
- `#30` Preserve upstream error shape through web mutation Server Actions instead of masking to 500 (after `#684` deploys)
- `#565` Root-cause the Today-page non-array map failure
- `#566` Resolve orphan offline IDs before reorder mutations expire
- `#567` Keep handled Astra daily-limit responses out of web Sentry
- `#654` Mobile chat stream IDs collide within one millisecond
- `#704` orbit-api formats numbers and dates with the host culture, so English text gets pt-BR decimals and months (`api#569` open)
- `#665` Record whether a habit log was a slip when it is written, so lastCompletionDate survives a habit type change (`api#574` open, changes requested)
- `#323` Google sign-in retries the losing user insert after a concurrent first login
- `#390` Restore deferred bulk mutations and settle parents from the replay once the API is idempotent (`#389` is live (`api#567`), so the UI can queue bulk writes again)
- `#225` Three habit-model defects: checklist never resets on a flexible habit, dead EndDate on general, the reminder rule is not an invariant
- `#253` use-habits.ts follow-ups from ORB-183: XP guard, its deleted test, and two lost WHY comments

### Batch 1: close the redesign

Every ticket whose work lands on `redesign/main` in either code repository, including the API halves the
redesign screens wait on. **This batch ends** when `node tools/redesign-coverage.mjs` reports a valid mapping
AND every screen ticket closes against its own acceptance criteria.

- `#675` Send a Turnstile token from web and Android sign-in (`ui#1111` open)
- `#653` Use the account day for Today habit logging gates (`ui#1125` open)
- `#622` Detect an account replacement on the step-up route (`ui#1127` open)
- `#705` Move the runtime React hooks out of packages/shared on redesign/main before the import boundary lint arrives (`ui#1126` open)
- `#706` Page Astra record list cards past ten rows, send key state as data, and include unearned achievements in the streak card (`api#571` open (orbit-api `redesign/main`))
- `#607` Stop selling Pro for an accent colour that no longer varies (`api#573` open (orbit-api `redesign/main`))
- `#681` Render the goal, day, streak, calendar, record list and account blocks in Astra (blocked by `#706`)
- `#24` Chat surface UX: localized tool-result cards and the preview, confirm, edit pattern for bulk and destructive intents (Stage 3 (per-item edit and reject in the preview) unblocks `#682`)
- `#682` Show diff rows in Astra previews, a thinking trace, and follow-up chips (blocked by `#24` Stage 3)
- `#625` Abandon an onboarding flush whose account changed mid-flight, instead of writing to the next account
- `#497` Collapse the six colour schemes to the one granted accent, UI half
- `#533` Point Perfil's Support row at the Astra conversation (`#532` is closed, so it is unblocked)
- `#464` Resolve the support and legal defects found by the #462 sweep
- `#589` Import a fortnightly weekday calendar event instead of refusing it, and stop mapping INTERVAL onto frequencyQuantity
- `#592` Convert a timed UNTIL in the event's own timezone once the API projects it
- `#614` Let a long sub-habit title render its own message, not the habit one
- `#632` Gate a habit log against an implausible date arriving from a deep link
- `#647` Measure and reduce the 60-row All-to-Today view switch cost
- `#393` Restore the Today screen's main-thread headroom so the LCP budget holds on a slow runner

### THE REDESIGN GATE, between batch 1 and batch 2a

Unchanged and absolute. Once every screen ticket is done, a run **stops** and ships a closed Play
INTERNAL build off `redesign/main` for the owner to test as a real update. It does not merge to `main`
and does not start the next batch. **Only the owner's approval merges `redesign/main` to `main`.**

**The merge carries one protection change in the same moment.** `main` requires
`Suppressions Ratchet` again, because `main` still has both `eslint-suppressions.json` baselines and
no `Lint Severity` job, so the `#617` swap had made every pull request to `main` unmergeable. The
`redesign/main` into `main` pull request deletes the ratchet and brings `Lint Severity`, so swap the
required context back to `Lint Severity` when that pull request is ready to merge. Payload shape:
`gh api -X PATCH repos/thomasluizon/orbit-ui-mobile/branches/main/protection/required_status_checks
--input <json>` with `{strict: true, checks: [{context, app_id}]}` (`app_id` 15368 for Actions).

### Batch 2a: the API contracts the UI is waiting on

API first, deploy, then the UI half in 2b.

- `#483` Yearly gap repair needs the streak engine's own window widened
- `#606` Give every FluentValidation rule an error code and localized copy
- `#387` Add a from and to range to the habit logs endpoint so a habit's full history is readable
- `#394` Expose the stable recurrence origin on the habit detail response
- `#385` Return the discount-aware billed amount on the billing details response
- `#179` Add a bulk reparent endpoint so a selected set of habits moves in one request
- `#257` Add optional habitIds to the shared create-goal contract
- `#259` Test create_goal enforces MaxHabitsPerGoal on the Astra path
- `#28` Make the referral reward platform-agnostic Pro days with an atomic idempotent grant

### Batch 2b: every remaining ticket that changes what a person sees

Includes the packaging changes (milestone "Packaging: caps, quotas and tiers") and the PostHog flags and
analytics work.

- `#395` Anchor habit history on the stable recurrence origin once the API exposes it (after `#394` deploys)
- `#386` Show the billed charge on the subscription screen once the API returns it (after `#385` deploys)
- `#181` Bulk-move selected habits, and open the move picker at the habit's current position (after `#179` deploys)
- `#62` Show and explain the Pro-days referral reward on the surfaces users actually see (after `#28` deploys)
- `#222` Linking a habit becomes the primary route into creating a goal
- `#195` Habit-limit paywall copy removed; new at-capacity state
- `#196` AI quota copy becomes daily across web and mobile
- `#197` Retrospective unlocks on any Pro plan; remove the yearlyPro entitlement
- `#199` Remove rewarded ads from the client, the AdMob SDK and the privacy policy (with `#200`)
- `#200` Remove the rewarded-ad backend and its DTO field
- `#237` Sub-habits leave Pro: remove the server gate and unseed the flag
- `#238` Sub-habits leave Pro (UI): drop the matrix row and the copy that sells depth (with `#237`)
- `#82` Migrate feature flags to a PostHog-backed provider behind a switch (expand phase)
- `#83` Add PostHog client analytics to the web and mobile apps
- `#84` Add an analytics opt-out preference toggle on web and mobile
- `#213` Define the retention cohort and stand up the recurring read
- `#25` Consume PostHog feature flags on web and mobile and wire the Astra kill switch

### Batch 3: the landing page and the Play listing, together

- `#78` Redesign the landing page against the new canon (L2)
- `#204` Fix the landing today: real numbers, drop the payer stat, drop the badge and the two missing spaces
- `#209` Landing pricing and FAQ copy realigned to the new packaging
- `#212` Add llms.txt to the landing for the AI crawlers robots.txt already invites
- `#269` Waitlist Turnstile can render two widgets into one container, orphaning the first
- `#270` A transient Turnstile script-load failure disables the waitlist form with no retry path
- `#271` Waitlist Turnstile receives pt-BR where Cloudflare documents pt-br, so the widget may render in English
- `#272` PUBLIC_TURNSTILE_SITE_KEY is undocumented, so a build without it silently disables waitlist signups
- `#273` Turnstile error-callback fights its own auto-retry, forcing a reset loop on any persistent widget error
- `#274` Turnstile flexible size overflows its clipped card below a 374px viewport
- `#275` Missing Turnstile sitekey re-announces the same error to screen readers on every keystroke
- `#276` Turnstile widget keeps its first language and does not follow the runtime language toggle
- `#277` Recovered Turnstile challenge leaves stale failure copy above an enabled submit button
- `#278` Turnstile init hangs silently when the script loads but never executes: no load fallback, no timeout
- `#280` Landing analytics consent cannot be withdrawn once granted: no manage-consent affordance
- `#282` A CTA click between consent grant and PostHog readiness is silently dropped
- `#285` Fixing the Lighthouse blocklist silently dropped the accessibility gate from the waitlist-confirmed page
- `#286` The 404 Lighthouse carve-out records what it excludes but not the measurement that justifies it
- `#292` A failed Turnstile script load re-appends a script tag on every input event, with no backoff or attempt cap
- `#313` Turnstile error codes are discarded, so a hard failure like 400020 reaches no log and no human
- `#328` Move goals to the free plan on the landing pricing table
- `#249` BRAND.md copy and format cleanups from the ORB-209 review

### Batch 4: the component-library migration

D101, and strictly after the redesign ships.

- `#576` Put a headless behaviour layer under our primitives: rn-primitives on mobile, Radix on web, one shape
- `#577` Rebuild the anchored menus and popovers on the headless layer, both platforms
- `#578` Rebuild the confirm and general dialogs on the headless layer, both platforms
- `#579` Rebuild the select and the pickers on the headless layer, both platforms
- `#580` Rebuild the toast, tabs and form controls on the headless layer, both platforms
- `#581` Build the Astra chat surface from beautifului.dev, on both platforms where it can run

### Batch 5: Astra

Milestone "562 Astra" and every Astra or MCP tool ticket not already in Batch 1.

- `#16` Cut Astra chat input tokens roughly 35 percent via tool gating, schema trim, and a smaller history window
- `#17` Harden MCP auth and wire content moderation into the chat and MCP input paths
- `#18` Bound per-user AI spend and close the residual MCP authz gaps: tool-boundary scope check, ownership map, idempotency, distributed OAuth code store
- `#19` Execute Astra bulk intents server side on the full matching set and report the true affected count
- `#21` Constrain Astra free text answers to tool returned facts
- `#23` Localize Astra tool result card text via structured message keys in the contract
- `#26` Build the Astra prompt to behavior eval harness and gate launch on it
- `#48` Ground the Astra daily summary in real multi-day adherence data
- `#49` Localize the Astra action-chip labels for UpdateChecklist and the other unmapped tool types
- `#201` Persist Astra conversations so failures are debuggable
- `#202` Astra builds an invalid payload for date-specific tasks
- `#236` Astra tells free users that XP, levels and streak freezes are Pro. They are not.
- `#244` Astra crashes the chat turn when asked to log a habit already logged for that date
- `#245` The agent audit write commits the caller's uncommitted work and loses the row when it matters
- `#246` Astra cannot unmark a habit: add unlog_habit
- `#247` Astra logs habits that are not due, because its habit listing never says so
- `#248` The habit list does not refresh after Astra unmarks a habit
- `#254` Chat habit-tool follow-ups from ORB-23: unproven ownership scoping, changed failure contract, test gaps
- `#260` CanSendAiMessage is orphaned after the atomic reservation migration
- `#264` Every added limiter test calls TryApplyMcpRateLimitsAsync directly, so removing the new middleware invocation leaves the suite green while restoring an unbounded MCP endpoint.
- `#265` The new get_retrospective AI classification has no rate-limit regression test, so deleting or misspelling that entry leaves every test green and gives the AI tool the general limit.
- `#396` Register an AI tool for the proactive Astra setting so Astra can change it
- `#418` Let Astra retry a rejected tool call safely, without trusting the model to identify the retry
- `#514` Extend the #318 capability inventory to the MCP surface and to field level, and file the gaps
- `#582` Move Astra to the current cheap model tier and send a per-user prompt cache key
- `#583` Make every Astra tool schema strict, with enums for every closed set of values
- `#584` Emit one PostHog LLM analytics event per Astra model call

### Batch 6: security, correctness and the deletions

- `#101` Cut the access token lifetime to 15 minutes and make logout actually revoke it
- `#102` Close the account enumeration timing split in the user provisioning path
- `#114` Partition the anonymous auth and waitlist rate limits by IP as well as email
- `#115` Cancel the Stripe and Play subscription when a user confirms account deletion
- `#568` Make destructive EF schema changes safe across rolling deploys
- `#718` Drop the habit-log slip insert trigger and make `IsSlip` non-nullable after the `#665` deploy replaces old instances
- `#621` Stop controllerActions reading as enforcement, because 51 capabilities declare it and nothing reads it at request time
- `#623` Give BuildLegacyMatchKey one definition, because the writer and the reader each carry their own copy
- `#626` Make the calendar reconciler and the suggestion writer agree on an unrepresentable projection
- `#660` Refuse access tokens without a session claim once pre-deploy tokens have expired
- `#685` Delete the colour-scheme write path once no supported client writes it (ORBIT-API-5)
- `#687` Confirm MCP over OAuth enforces the same Pro gate as API keys
- `#218` Delete the social layer (API), part 1: challenges and accountability
- `#235` Delete AI memory (API): UserFacts, AiFactExtractionBatches, the batch poller, 3 chat tools, 3 MCP tools and the Pro gate
- `#239` Delete the social layer (API), part 2: friend graph, feed, cheers, blocks, reports, public profile and the drop migration
- `#227` Habit model: split StartDate from NextDueDate and replace the three flags with enum HabitSchedule
- `#205` Behaviour test suite for Google Calendar import and auto-sync
- `#250` Drop the hard-coded Supabase URL fallback from the web CSP builder
- `#251` Re-exclude _next/static and _next/image from the web proxy matcher
- `#206` Serve a real robots.txt on the web app and stop the auth proxy swallowing root text files
- `#208` Turn on 3D Secure for the Stripe card flow
- `#262` The end-date reactivation gate is not exercised through UpdateHabitCommandHandler, so removing the new handler call would leave all added tests green and allow at-cap reactivation through PUT /api/habits/{id}.
- `#255` Parent-prompt follow-ups from ORB-86: isFlexible check, re-prompt guard cleared on every fetch, frozen test clock
- `#279` The privacy policy discloses no cookie or consent information, so the landing consent banner cannot obtain informed consent
- `#301` Sweep the 13 surviving social references ORB-201 part 1 left behind
- `#302` Legacy buddies-tab notifications fall to the default glyph after ORB-201 part 1

### Batch 7: the production readiness run

`/prod-readiness`, then fix what it finds, then ship. The launch chores that require the owner
(`#33` demo clips, `#89` account migration) sit here too.

- `#315` Run /prod-readiness once the board is clear
- `#31` Triage and root-cause every open orbit-api Sentry issue
- `#32` Triage and root-cause the open web and mobile Sentry issues
- `#33` Record the 7 demo clips and 2 landing videos
- `#89` Map and migrate every third-party account onto contact@useorbit.org
- `#311` Recheck the image-size advisories once a fixed version ships

## How the work runs

Use `/sleep` for unattended work and `/orchestrate` for one ticket at a time. Pullfrog reviews each pull request. Use the current head, latest review and required checks to decide readiness. `/handoff` updates this spec and overwrites `.claude/handoffs/NEXT.md`; it does not append a session chapter. Read `.claude/skills/orchestrate/SKILL.md`, `.claude/skills/handoff/SKILL.md` and `CLAUDE.md` for operating detail.

## Decision pointers

The ADRs live in the brain vault under `2 Areas/20-29 Orbit Engineering/Decisions/`. Verify filenames through the Obsidian MCP before relying on them. D69 covers parity, D76 the screen loop, D80 branch routing, D88 and D90 the redesign gate, D89 worker caps, D95 approvals, D99 shipped defects, D100 written authorization, D101 the component library, and D138 branch protection. The ADR identifiers remain stable; current operational rules above take precedence when a record conflicts.

## Constraints

- `apps/mobile/android/` is Expo prebuild output. Native fixes belong in app config or a config plugin.
- Mobile ICU syntax treats an apostrophe before `{`, `}` or `#` as a quote. Double it when the apostrophe must render. Test mobile strings through the app's i18n instance.
- Account deletion deactivates with a bounded grace period. Sign-in cancels deactivation; never claim deletion has no recovery.
- A streak freeze is banked automatically and spent by hand. `RepairableGapDates` does not depend on the freeze bank.
- `useCalendarEvents` is a bounded manual-import feed, not a complete events endpoint. The events API reports the event timezone.
- Retrospective access is controlled by the API setting; clients read the server answer rather than hard-coding Pro access.
- A Server Action strips thrown errors to `digest`; return serializable `ActionResult` values across that boundary.
- An Android accessibility node with zero opacity or fully off-screen is ignored. Use `AccessibilityInfo.announceForAccessibility` for announcements.
- Expo SAF copy deletes an existing destination document. Copy into the directory with the correctly named source.
- Android's key map emits arrow keys but no Home or End key names.
- `Harness Calibration` hashes complete normalized file content. Reseed after changing calibrated files and reconsider the verdict.
- `local/*` lint rules run at `error` with zero violations. Do not restore a suppression baseline or weaken a rule. Sweep callers before changing a shared primitive.
- A closed allowlist only shrinks. When a fix removes suppressions, lower `orbit-api` `tools/suppression-allowlist.json` to the observed count.
- Put parity mirror hook pairs in `sonar.cpd.exclusions`. Shared logic belongs in a React-free core in `packages/shared`; each app keeps only its React wiring.
- SonarCloud's API refuses pull requests targeting `redesign/main`. Read its gate from the check run's `output.summary`.
- Run the `orbit-api` suite with `LANG` unset and with `LC_ALL=en_US.UTF-8` to catch host-culture formatting.
- Run both harness suites after `.claude/**` changes: `node tools/test-tools.mjs` and `node .claude/hooks/test-hooks.mjs`.
- Pullfrog readiness depends on the last review of the exact head and the newest `pullfrog-approval` check. Review body findings count even when unresolved thread count is zero.
- A `parity:exempt` label does not change a run created before the label. Trigger a fresh pull request event after applying it.
- Regenerate the surface manifest when a drawn surface changes; record deleted IDs with their decision in `tools/redesign-groups.json`.
- Use `npx turbo run type-check --force` for evidence when cache freshness matters. Run type checks from the repository root.
- Installed dependencies are read-only evidence. Check their integrity with `node tools/check-dependency-edits.mjs` before citing them.
- Keep decision logs with times in the scratchpad, outside the repository. Tracked specs, prompts and skill output carry rules and current state without session history, dates, attribution or machine paths.

## Current state

The open pull request inventory is a snapshot. Refresh it before acting with `gh pr list` in each repository.

- UI redesign: `#1127` account replacement; `#1126` shared hooks; `#1125` account-day gates; `#1123` review head validation; `#1111` Turnstile sign-in.
- API main: `#574` habit completion date after type changes; `#569` culture formatting.
- API redesign: `#571` Astra card data and paging.
- This cleanup is `#711` in Batch 0b. The remaining cleanup tickets are `#708` through `#716` as listed above.
- The owner must create the GitHub App for `#702` with Contents and Pull requests read/write on `orbit-ui-mobile`, then set `CONTRACT_REBASELINE_APP_ID` and `CONTRACT_REBASELINE_APP_PRIVATE_KEY`.
- Turnstile enforcement waits for sign-in tokens and the owner's Cloudflare secret. The three-dot Android menu needs device confirmation at the redesign gate.
