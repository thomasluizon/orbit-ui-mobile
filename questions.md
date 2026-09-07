# Questions for Thomas

Questions raised by the unattended redesign run (**D90**). The run does not stop on anything here; it
works around the question and records it.

**The bar for putting a question here**, applied literally before anything is added: ask "if Thomas
answers *follow the best approach*, can I continue?" If yes, it is not a question. Decide it against
`design/canvas/`, `DESIGN.md` and the brain, and move on. Only a question that survives that test
belongs in this file.

**At a glance: one open question and the recorded redesign decisions, including notification text contrast (#459).**

**Status: one open question, below. It does not block anything; `thomasluizon/orbit-tickets#329` is deferred for a
different reason.**

---

## Open: what does Progresso show for a multi-day gap it cannot repair?

Raised 2026-09-06 by the `thomasluizon/orbit-tickets#329` worker, which stopped rather than guess:

> The existing repair endpoint only repairs yesterday and rejects additional request fields. Its
> handler spends exactly one freeze, so it cannot support the canvas’s “Spend 2 freezes” action.

The drawing gives the gap state one action, “Spend N freezes”, and a separate no-freeze variant whose
line says the bank is empty. Neither fits a gap the API cannot repair while the bank is full. So:

- The **action** cannot render, because pressing it would fail.
- The **no-freeze line** cannot render, because it would blame an empty bank that is not empty.
- An undrawn third variant, the gap stated plainly with nothing to press, is what the run would take
  as the best approach, and it is genuinely a new state nobody drew.

This survives the test: “follow the best approach” produces a state that does not exist in the granted
drawing, on a screen a person sees. Adding it is a design decision, not an implementation detail.

**What the run did instead of deciding it:** filed the API work as `thomasluizon/orbit-tickets#442`,
an atomic multi-day repair endpoint, and recorded `thomasluizon/orbit-tickets#329` as blocked by it. So the question only needs
answering if you want Progresso to ship before that endpoint does.

**If you do**, the reversible default is the third variant above: render the gap well, state the gap,
offer nothing, and say nothing false about why.

---

## Answered without asking, and why

Kept so the same question is not raised twice.

### Habit form picker motion (ticket 409)

Thomas settled this on 2026-09-07: Android keeps native TrueSheet motion. The requested
220ms scale/fade entrance and 165ms scale/fade exit apply on web; they are not built on Android.
Both platforms keep `Sheet` ownership of dismissal.

Verified again in the installed `@lodev09/react-native-true-sheet` source:
`src/TrueSheet.types.ts:592`, `:606`, `:614`, and `:659` expose only `animated?: boolean`
on presentation and dismissal. `src/fabric/TrueSheetViewNativeComponent.ts:105` exposes
`initialDetentAnimated?: WithDefault<boolean, true>`. Neither interface accepts a duration,
easing, scale, or opacity input for the native presentation.

Reversing this decision requires replacing the native sheet library. Thomas can confirm or
override it at the whole redesign review; implementation and delivery continue now.

### Notification text contrast (thomasluizon/orbit-tickets#459)

Thomas settled the existing `--fg-2` token for notification body and metadata text on both
platforms in the 2026-09-07 ticket comment. This changes two roles in the granted
`design/canvas/Orbit Avisos.dc.html` drawing:

- Body, lines 59 and 105: `font-size:14px;line-height:1.5;color:var(--fg-3);text-wrap:pretty`.
- Timestamp, lines 57 and 103: `flex:0 0 auto;font-family:var(--font-mono);font-size:12px;color:var(--fg-4)`.
- Target icon, lines 61 and 107: `display:grid;place-items:center;width:14px;height:14px;color:var(--fg-4)`.
- Target label, lines 64 and 110: `font-family:var(--font-mono);font-size:12px;color:var(--fg-4)`.

`DESIGN.md`, Accessibility, defines the role: "**Non-text UI elements meet 3:1 against their
adjacent surface.** `--fg-4` is derived to exactly this floor at 3.03:1."
Body and metadata are text and must clear 4.5:1. The target icon repeats the adjacent destination
label and carries no unique meaning, so it retains `--fg-4`. Size (14px body, 12px mono metadata),
weight and spacing retain hierarchy without relying on colour alone. Detail metadata uses `--fg-2`
as well; its body already did. No global token changed.

The merged bell opens `/notifications` on both platforms; there is no bell popover to measure.
The actual layers are the inbox canvas, unread `bgCard` over that canvas, `bgHover` over the
read or unread row on hover (web) or press (Android), and the opaque detail `bgSheet`.
The theme resolvers in `apps/web/lib/theme-dom.ts` and `apps/mobile/lib/theme.ts` map these to
`packages/shared/src/theme/neutral-ramp.ts`, with `bgSheet` equal to `bgElev`.

Source-composited sRGB measurements, alpha blended in paint order and rounded to 8-bit channels:

| Surface | Dark background | Dark fg2 | Light background | Light fg2 |
|---|---|---|---|---|
| Inbox, read row | `#09090B` | 12.0415:1 | `#FAFAFA` | 9.5719:1 |
| Inbox, unread row | `#131315` | 11.2313:1 | `#FFFFFF` | 9.9909:1 |
| Read row hover or press | `#2B2B2C` | 8.5611:1 | `#ECECEC` | 8.4570:1 |
| Unread row hover or press | `#333335` | 7.6305:1 | `#F0F0F0` | 8.7669:1 |
| Detail sheet | `#1C1C1E` | 10.2980:1 | `#FFFFFF` | 9.9909:1 |

The old body measured 3.9132:1 on the dark unread hover or press pair. The old metadata measured
1.9212:1 there and 2.5928:1 on the dark detail sheet. All corrected pairs exceed 7.63:1.
These are calculations from the resolved production tokens and component layer composition,
not browser or device measurements: the worker work order forbids opening either.
Thomas confirms or overrides the deviation at the whole redesign review; work proceeds now.

The text decision does not authorize a neutral focus ring. Review round 2 restores the existing
`primary` accent on both platforms, with a 2px outline at offset -3px over a zero-blur 4px inset
`fg1` contour. The contour separates both edges of the accent from the row surface. This retains
the current-position semantic without changing or adding a global token. The earlier plain accent
ring measured 2.7564:1 against the dark unread hover or press surface.

The accent against its adjacent contour measures 4.1638:1 dark and 3.7963:1 light in every state.
The contour against the adjacent row surfaces measures:

| Row state | Web dark | Android dark | Web light | Android light |
|---|---|---|---|---|
| Resting read | 18.1120:1 | 18.1120:1 | 16.6356:1 | 16.6356:1 |
| Resting unread | 16.8934:1 | 16.8934:1 | 17.3637:1 | 17.3637:1 |
| Hovered unread | 11.4772:1 | 16.8934:1 | 15.2365:1 | 17.3637:1 |
| Pressed unread | 11.4772:1 | 11.4772:1 | 15.2365:1 | 15.2365:1 |

Android has no row hover fill, so hovering retains the resting unread surface. Web pointer press
retains its hover fill; a keyboard or touch press without hover retains the resting surface.
Read hover or press measures 12.8770:1 dark and 14.6979:1 light. These are source-composited
measurements, with Vitest checks on the actual focus styles, not browser or device pixel samples.

Review round 3 replaces only the Android focus contour's inset shadow with a solid 4px `fg1`
border. React Native 0.86.3 creates inset shadows only at API 29 and later, while this app's
Expo prebuild configuration resolves to minimum API 24. Border and outline creation have no SDK
gate. The 2px accent outline at offset -3 stays inside the border, leaving 1px of `fg1` on
each edge. A permanent transparent border and 12px padding retain the original 16px content
inset without focus layout movement. Web keeps its round 2 outline and inset shadow; the
contrast pairs above remain the same. These are source assertions. Runtime verification on
an API 24 to 28 device or emulator has not been done; Thomas or a delegated Android tester
needs to check focus, press and blur in both themes on that device range.

### Entrar lockout recovery (ORB-63, ticket 69)

The 2026-09-07 work order replaces the sentence at `design/canvas/Orbit Entrar.dc.html:263`
and `:226` which promised that the current code survives a lock. The implementation says:
"After 3 attempts, verification is locked for 15 minutes. Ask for a new code when the time has passed."
The pt-BR key carries the approved translation in the same edit.

The four API sources are `src/Orbit.Application/Auth/Commands/SendCodeCommand.cs:56`
(five-minute lifetime), `src/Orbit.Application/Common/AppConstants.cs:43` (three attempts),
`src/Orbit.Application/Common/AppConstants.cs:44` (15-minute window), and
`src/Orbit.Application/Auth/Commands/VerifyCodeCommand.cs:87` (the lock's expiry).
They were read again for this implementation. A five-minute code cannot survive a 15-minute lock.
The numbers retain the drawing's `data-mock` annotation on web; native text carries the same values.
Thomas can restore the drawing's sentence as the reversible alternative at the whole-redesign review.

The referral banner continues on both steps, as the work order directs. Moving it into the email
branch remains the reversible alternative. The offline notice reuses `auth.errors.offline`, which
asks for reconnection and retry, instead of the drawing's unsupported automatic-send promise.
No offline request queue was introduced.

### The three design-system gaps on the upgrade screen (ticket 421)

`.claude/rules/core.md` rule 6 says expanding the design system is Thomas's call, and the ticket body
repeats it, so this looked like a genuine question.

It fails the test. The granted drawing already specifies the values: `design/canvas/Orbit Pro.dc.html`
gives the display-face heading as Space Grotesk, 28px/1.18 at the 412 shell and 34px/1.15 wide, weight
500, tracking `-0.02em`. Encoding a value the canvas has already decided is not an expansion of the
system, it is the system catching up to its own granted authority. Rule 6 governs a value the system
LACKS and nobody has chosen. This one is chosen.

So: build the gaps to the drawing's values. Where the drawing is silent on a gap, that specific gap
comes back here.

### Price-loading skeleton composition (thomasluizon/orbit-tickets#421)

Settled by the orchestrator against the drawing under D90. The drawing specifies three settings skeleton rows per tier.
Asking for tier-shaped skeleton geometry was asking to invent a new shape; it fails the
"follow the best approach" test. Keep the drawn rows and reserve the height occupied by the loaded
tier cards so the price response does not shift the layout. Height reservation is composition,
not a new token, radius, colour or spacing value, so core rule 6 does not block it.

Measure the loaded cards, including annual, monthly and coupon content, rather than copying the
ticket's approximate 260px. If the reservation requires an off-scale spacing value, record that
specific measured value here.

### Whether a screen still waits for review before merging

Answered by D90 itself. It does not, for the rest of the redesign. Everything else stands: the canvas,
`DESIGN.md` and its precedence ladder, the step 6 sweep, Pullfrog, and the gates.

### Generic error reassurance (thomasluizon/orbit-tickets#338)

The generic boundaries receive arbitrary errors and cannot prove a write was rolled back.
The canvas voice rule at `Orbit Estados.dc.html:129` therefore wins over its unsupported
reassurance in `failBody`, as Thomas's later ticket comment confirms. Both locales omit that
reassurance, keep the circumstance and the retry and sign-out-and-back-in instruction, and
show a reference only when the error carries a real API request ID. No question remains.
