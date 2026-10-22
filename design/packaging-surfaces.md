# Packaging surfaces

**At a glance:** habit capacity, free sub-habit creation and daily Astra allowance owners,
with matching web and Android behavior and verification boundaries.

| Surface and states | Web owner | Android owner |
|---|---|---|
| Create habit, default and habit ceiling | `components/habits/create-habit-modal.tsx` | `components/habits/create-habit-modal.tsx` |
| Create sub-habit, free account and older API refusal | `components/habits/create-habit-modal.tsx` | `components/habits/create-habit-modal.tsx` |
| Create disclosure with free sub-habit editor; edit disclosure without an empty section | `components/habits/habit-form-fields.tsx` | `components/habits/habit-form-fields.tsx` |
| Astra breakdown, free account and input retained after downgrade | `components/habits/create-habit-modal/apply-suggestion.ts` | `components/habits/create-habit-modal/apply-suggestion.ts` |
| Habit list and drill, add sub-habit menu and row | `components/habits/habit-list.tsx` | `components/habit-list.tsx` |
| Habit detail, add sub-habit row | `components/habits/habit-detail-screen.tsx` | `components/habits/habit-detail-screen.tsx` |
| Shell and conversation composer, allowance below threshold, near and exhausted | `components/shell/composer.tsx`, `hooks/use-chat-composer.ts` | `components/shell/composer.tsx`, `hooks/use-chat-composer.ts` |
| Subscription usage, free and Pro allowances | `components/upgrade/usage-stats.tsx` | `components/upgrade/usage-card.tsx` |

The habit ceiling uses the existing neutral `CapacityNotice` beside submit. An Astra refusal
belongs beside its own control. Neither refusal clears the form. A retry remains available.
Sub-habits keep the existing count and nesting validation; their availability does not depend on
Pro. Other Pro actions retain their own gates. A Pro refusal offers one small Upgrade action;
its form keeps the discard guard and completes sheet dismissal before navigation.

The composer counter and reserved allowance space appear only with two or fewer messages left.
Below that threshold, the composer keeps its compact inset. Near capacity and exhausted states
share a text-measured notice above the input. Near capacity shows live suggestions and the counter,
or the counter and renewal when no suggestions are available. Exhaustion shows its reason and
renewal. The upcoming notice measures the space while hidden from sight and assistive technology,
so the populated composer stays in place without a fixed spacer.

The Pro pitch, tier cards, onboarding paywall and annual billing retain their compositions.
Retrospective has no route; its former annual entitlement is removed from shared utilities.
Help and obsolete feature comparison copy have no live surface on the redesign.

Behavior tests mount the owning forms and exercise request rejection, retry and navigation.
Web geometry tests use the repository's isolated Chromium lifecycle; Android style tests inspect
native layout and neutral tokens. These checks do not establish device rendering, screen-reader
behavior or visual acceptance. The worker does not start an app server, browser session or emulator.
