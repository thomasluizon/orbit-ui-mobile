# The prompt for the next session

Copy the fenced block below into a fresh Claude Code session started in `orbit-ui-mobile`.

Written 2026-08-20, during the review pass. The previous handoff existed because the design was
complete and Thomas had not gone through it. That review is now **11 of 21 screens done** and the four
missing components are built. This handoff exists to finish the remaining screens without re-deriving
what the last session already traced to code.

---

```
Continue Orbit ticket #36, the canvas-first redesign. The four components are BUILT and the review
pass with Thomas is 11 of 21 screens through. Finish it.

## Read these first, in this order

1. `design/prompts/screens.md` - the file of record for every prompt this project has run. Its last
   section, "The review pass with Thomas, 2026-08-20", is the most recent state.
2. The vault at `C:/Users/thoma/Documents/Programming/Projects/brain`:
   - `2 Areas/20-29 Orbit Engineering/20-29 Orbit Engineering.md`, the "Shipped (2026-08-20)" section
   - `2 Areas/20-29 Orbit Engineering/Decisions/Enforce a design rule in the contract, not in prose.md` (D71)
   - `2 Areas/20-29 Orbit Engineering/Decisions/Astra is a layer with a front door, not a fourth tab.md` (D69)
   - `2 Areas/20-29 Orbit Engineering/Decisions/Pro is Astra without the daily ceiling, and goals leave the paywall.md` (D70, AMENDED 2026-08-20)
   - `hot.md`

Do NOT re-read the full decision register unless something below is unclear. The last session read it
end to end and everything load bearing is carried here.

## Thomas's standing instructions. These bind every turn.

1. **"my answer is always the same: the best approach, no unfinished features, nothing to reduce
   time, its the best implementation always."** Never offer him a cheaper or partial option. Take the
   best one and say what you took. A question only earns his time when both paths ARE the best
   implementation and they differ in what the product should be, or in taste.
2. **Plain words, not design jargon.** He stopped a round to say it. Jargon makes him answer "i dont
   know", which costs a round rather than saving one.
3. **Ask one question per decision.** Never bundle.
4. He wants you to keep working without stopping to report. Continue until you have a real question
   or the work is done.

## What is DONE, so do not redo it

**Phase 1 is complete.** `DayCell`, `MonthGrid`, `Pager`, `Columns` built, `OtpInput` rebuilt around
one real input with a REQUIRED `onChange` and no `activeIndex`. No new token was added. Both shells
now discriminate on `nav`. `SegmentedControl` and `StepUp` are new. The design system readme's market
claim is corrected.

**Calendario and Wrapped are rewired** onto the new components, verified: Calendario uses DayCell 16
times, MonthGrid 6, EventRow 4, Skeleton 9; Wrapped uses Pager and Columns and its hand-built segment
row and column divs are gone. Wrapped's share action is intact.

**Screens reviewed and corrected with Thomas**: Onboarding, Hoje, Habit Create, Habit Detail.
**Read and diagnosed but corrections NOT ALL SENT**: Astra Conversation, Progresso, Pro, Assinatura,
Perfil, Avisos, Verificacao, Sobre.
**Not read at all**: Entrar, Busca, Celebracao, Estados, Offline, Sobreposicoes, Widget Android.

**Note: there are 21 documents, not 20.** `Orbit Sobre.dc.html` covers about, privacy, terms and
support. The previous handoff's list of 20 missed it. Review it too.

## FIRST: verify what was in flight when the last session ended

Two canvas turns were still running. Read both through the MCP and confirm they landed before doing
anything else. If either did not, resend it from `screens.md`.

1. **Screens project**: a correction to `Orbit Verificacao.dc.html` and `Orbit Perfil.dc.html`
   (the step-up numbers and the operation set, detailed below).
2. **Design system project**: `StepUp` narrowed to two operations, plus closing the i18n audit across
   thirteen components.

## The remaining corrections, with their evidence already traced

Every finding below was verified against code by the last session. Do not re-derive them; do check
that the file and line still say what is quoted, because that is the rule that catches drift.

### Orbit Wrapped
- **Weekday copy: use the short form everywhere.** Thomas's decision, 2026-08-20. `quarta-feira` is
  the widest line the share card holds and it breaks first. Three letters always fit in both
  languages. The `days` array currently holds full names and is used by `p4Body` and by `cardBest` on
  the share card.
- **The `open` item about an unopened period is ANSWERED**: every past period stays reachable,
  permanently. Thomas, 2026-08-20. Delete the open item and name ticket **`#341`**.
- **The `figures` paragraph is FALSE and must be corrected.** It claims all four figures exist and
  "nothing is derived from a field the API does not return". Two problems: goal completions is NOT in
  `RetrospectiveMetrics` (`GetRetrospectiveQuery.cs:21-31`), and the calendar-month framing cannot be
  served at all, because `RetrospectivePeriodRange.Resolve` returns `(dateFrom, today)` for every
  period and `"month"` is `today.AddDays(-30)`, a rolling window. The screen says "Fechamento do mês"
  and "agosto de 2026". Record `#341` as the blocker.

### Orbit Pro
- **The price fixture is wrong.** The document hardcodes `monthlyAmount: '19,90'`,
  `annualAmount: '159,00'`, `savingsPercent: '33'`. Live Brazilian prices since `#144` shipped on
  2026-08-17 are **R$29,90/month and R$199/year**, which is R$16,58 a month and a **44%** saving.
- **The headline changes.** It reads "O Astra sem o limite do dia" / "Astra without the daily
  ceiling" at display size, directly above the card that says Pro is 50 a day. Thomas ruled the
  headline moves to the real arithmetic, something of the shape *ten times more Astra*. His reasoning
  is the rule: **a paywall is the worst place in the product to say something the next line
  contradicts.** D70 is already amended in the vault to record this.

### Orbit Assinatura
- **Same wrong price**: `SUB.annualAmount: '159,00'` should be R$199.
- **The lapsed-reason open item is decided**: name the reason when it is actionable, phrased as a
  circumstance and never as blame. A declined card is something the person can fix, so telling them is
  kinder than hiding it. This follows D69's standing copy rule, "copy names the circumstance, never the
  person".
- **The Play deep-link open item is decided**: deep link to the specific subscription rather than the
  dashboard. The implementing ticket must confirm the URL shape against Google's own documentation
  rather than assume it, per the never-assume-an-external-interface rule.

### Orbit Sobre
- **The nav row order is wrong, and its own report claims otherwise.** The report says the labels and
  order are "kept as given and in the given order". Both platforms ship **feature guide, support,
  terms, privacy** (`apps/web/app/(app)/about/page.tsx:60-79`,
  `apps/mobile/app/about.tsx:65-81`). The canvas drew privacy, terms, support: reversed. Correct it to
  **support, terms, privacy**, and correct the false claim. Dropping the feature guide row IS right,
  because D69 deleted the feature guide.
- **Drop "Feito no Brasil" / "Made in Brazil".** Thomas's call, 2026-08-20.

### Orbit Astra Conversation
- **Two `open` items are already answered** by the 2026-08-18 ANSWERS paste and should be deleted:
  step up is a hand off and never a credential field in a chat, and a partially failed bulk create
  keeps what it created and retries only the failures. The `open` list also starts at item 2, so a
  removed item left a hole in the numbering.
- **`needs api` should name ticket `#333`** rather than "the follow up ticket".

### Orbit Progresso
- **The `flag` is answered by D69 item 12.** It asks whether deleting the retrospective loses a
  surface. It does not: the retrospective survives, delivered by Astra on a cadence into the proactive
  line, with no navigation entry. Only its dedicated screen and its three dead states go.
- **`open` item 2 is answered by code.** It says no endpoint states the window for the four figures.
  `HabitMetricsCalculator.cs:28,29` computes a weekly rate over 7 days and a monthly one over 30. The
  document drew 30 and guessed right. Cite it and close the item.
- **The `derived` paragraph should name ticket `#340`**, and `needs api` items 2 and 3 are `#332`.

### Orbit Entrar
Not read yet. It needs the same **OtpInput rewire** Verificacao needed: Verificacao's own gaps
paragraph said the transparent-input workaround is "the same workaround the sign in screen needs".
OtpInput now takes a required `onChange`, an error state and disabled, so delete the local workaround.

## The Verificacao correction, in case it needs resending

This was the sharpest finding of the review and it is worth restating precisely.

The step-up screen printed three numbers and **all three came from the wrong subsystem**. It read
`AgentPlatformSettings.cs:9-11` (5 minute TTL, 60 second cooldown, 5 attempts), which governs the
**MCP agent** step-up for a pending agent operation. That is not this flow. The human confirming
something from Perfil hits the account-deletion challenge, whose real numbers are:

- **10 minutes**, not 5. `RequestAccountDeletionCommand.cs:44`, `TimeSpan.FromMinutes(10)`.
- **3 attempts**, not 5. `AppConstants.cs:42` `MaxVerificationAttempts`, checked at
  `ConfirmAccountDeletionCommand.cs:27`.
- **60 second cooldown**, which it had right. `RequestAccountDeletionCommand.cs:33`.
- **6 digits**, which it had right. `RandomNumberGenerator.GetInt32(100000, 1000000)`.

And the operation set is **two, not three**:
- **Account deletion** keeps it. Real and shipping: `AuthController.cs:295-325`.
- **API keys** keep it. Today `ApiKeysController.cs` creates a key behind ordinary session auth with
  no re-check. Thomas ruled it should ask for a code; backend is ticket **`#342`**.
- **Billing loses it entirely.** It hands off to the Stripe customer portal, which authenticates the
  person itself, so a code before opening it is friction that buys no security.

## Tickets filed this session, all in the 539 Redesign milestone

- **`#340`** (api) - a `Standard` goal ignores its linked habits, so D69's derive rule is only half
  implemented. `GoalType` has exactly two values and only `Streak` has a sync path. No design is
  blocked; the canvas drew today's behaviour correctly.
- **`#341`** (api) - **Wrapped has no endpoint.** The retrospective is Pro-gated
  (`PayGateService.cs:141`, `RetrospectiveProOnly` defaults true), every window is rolling and ends
  today, and `"month"` is 30 rolling days rather than a calendar month. A Pro-gated viral loop is not
  a viral loop: the growth research is the only note that says why Wrapped exists, and it calls a
  client-side shareable recap card the minimum viable viral loop. **This blocks Wrapped shipping at
  all.**
- **`#342`** (api) - creating an API key needs no re-authentication while deleting the account does.

`#331` to `#339` were filed by earlier sessions and still stand.

## Still open, and each needs Thomas rather than a worker

- `#329`'s body still specifies the deleted Satellite glyph for the Progresso empty state, which
  contradicts `DESIGN.md`. Never corrected.
- `--status-skip` binds to nothing since skip stopped being a row state. Deleting a token is a design
  system contraction, so it is his call.
- The titles of `#44`, `#46` and `#50` still describe the pre-D69 app. A hook blocks title edits, so
  each carries a correction erratum in its body instead. `#42` also needs repointing.

## How to work

**Read documents through the MCP, never by opening a canvas turn.** `DesignSync`, `method:
"get_file"`, project `87c2d1c5-d02d-4840-98e8-3abc270d2928` for screens and
`918bd5d7-839c-4dd0-811b-4a8781f60507` for the design system. Reading is free; canvas turns are not. A
document runs 50 to 100 KB, so grep the report block rather than reading the whole file into context.

**The two projects can run in parallel** in two browser tabs. The last session did, and it roughly
halved the wall clock.

**Driving the canvas through claude-in-chrome**, with the traps that cost the last session time:
- Assert the composer before pasting. `eds[0]` is the composer at `left: 21`; a second contenteditable
  at `left: 670` is the document editor. Pasting into the wrong one edits the project readme.
- Never type multi line text; the composer sends on Enter. Set the text and dispatch a synthetic
  `ClipboardEvent('paste')`.
- **Anything over about 2,500 characters becomes a `Pasted text` attachment**, not inline text. That
  works, but add one short line above it saying the attachment is the brief. The 5,000 figure in the
  older notes is wrong.
- **The model picker will not apply a change while a generation is running**, and it raises a
  **"Switch model?" confirm dialog** that silently swallows the click if nothing answers it, so the
  label keeps reading the old model and the change looks like it failed. Answer the dialog, then
  re-read the label.
- The document viewer's phone frame has its own inner scroller inside an iframe that does not respond
  to synthetic scroll. To show Thomas something below the fold, send him the URL with
  `?file=Orbit+Name.dc.html` rather than fighting it.

**Both canvases are on Fable 5 Max**, at Thomas's instruction. The composer warns it draws down the
weekly Claude Design budget **2x faster than Opus 5**. Read the usage banner after each send, stop at
98 percent, and tell him where you stopped.

## Standing rules

- Never write an em dash or an en dash. The gate is `node tools/check-dashes.mjs --files <paths>`.
- Work on `redesign/main`. It has no CI and no Pullfrog, so a green push is not a reviewed push.
- **Never name a state, field, number or gate the code cannot produce.** This session caught seven,
  including three numbers read off the wrong subsystem. Every claim about cost, storage or what an
  endpoint returns gets traced to a file and a line, or it does not go in.
- **Never remove a capability the app has today unless a decision removed it.** The canvas dropped
  `Select` from the habit menu even though both platforms ship it. Thomas caught that, not the review.
- **Prefer enforcing a rule in a contract over stating it in prose.** That is D71, and it is why
  `DayCell` is a discriminated union rather than a review note.
- Ask Thomas on any product or taste call. Make mechanical choices yourself and say what you chose.
- Take every identifier from live output in this run, never from memory.
```
