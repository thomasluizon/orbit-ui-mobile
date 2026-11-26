# unslop-ui report for ticket 2176

The skill `.claude/skills/unslop-ui/` ran with `--surface` on `apps/web`, `apps/mobile` and `packages/shared`. The counts include tests. Rows with zero before and after are left out. Kept is how many of the After hits the procedure left on purpose. Every After hit is kept, and each one has its reason under "Kept on purpose".

## apps/web

| Rule | Before | After | Kept |
|---|---|---|---|
| U1 eyebrow | 11 | 11 | 11 |
| U2 decorative numbering | 44 | 44 | 44 |
| U6 status string | 35 | 35 | 35 |
| U9 badge word | 3 | 3 | 3 |
| U10 status dot | 7 | 7 | 7 |
| U11 emoji | 154 | 154 | 154 |
| U17 gradient or glow | 41 | 41 | 41 |
| U18 off-scale spacing | 2 | 0 | 0 |

## apps/mobile

| Rule | Before | After | Kept |
|---|---|---|---|
| U1 eyebrow | 14 | 12 | 12 |
| U2 decorative numbering | 47 | 47 | 47 |
| U6 status string | 16 | 16 | 16 |
| U9 badge word | 1 | 1 | 1 |
| U11 emoji | 139 | 139 | 139 |
| U15 chart scaffolding | 23 | 23 | 23 |

## packages/shared

| Rule | Before | After | Kept |
|---|---|---|---|
| U2 decorative numbering | 32 | 32 | 32 |
| U6 status string | 27 | 27 | 27 |
| U11 emoji | 643 | 643 | 643 |
| U13 reading instructions | 1 | 1 | 1 |

## Reading rules

The counter does not see U3, U4, U5, U7, U8 and U14. A read of all 3738 keys of `en.json` outside the legal text (`terms`, `privacy`, `orbitMcp`) found: U1 1 cut, U3 1 cut, U4 1 cut. U5, U7, U8 and U14 cut 0 after the drawing check.

## Rewritten

None. Every fix is a deletion, so no string needs `/second-opinion` approval.

## Kept on purpose

A drawing in `design/canvas/` and `DESIGN.md` outrank the skill. A hit that is code, a style definition or test text is not copy.

- `packages/shared/src/i18n/en.json:761` (U3): `habits.allDoneHint` "Everything for today is done." is the `allDoneLine` of `Orbit Hoje.dc.html`, paired with the title at 8px. It is read by `HabitListAllDone` on web and mobile. The drawing outranks the skill.
- `apps/web/app/step-up/step-up-screen.tsx:358` (U1): "Confirming: {operation}" is the `eyebrow` field of `Orbit Verificacao.dc.html`. It names the operation the code authorises, so the screen does not read as a phishing page.
- `apps/mobile/app/step-up.tsx:502` (U1): the same drawn line on mobile.
- `apps/web/app/globals.css:1257` (U1): the `.t-eyebrow` type role, a row of the `DESIGN.md` type scale. It is a style definition, not copy.
- `apps/web/components/goals/edit-goal-modal.tsx:206` (U1): the one use of `.t-eyebrow`. It states the goal type and unit, a value of the goal that no field names. No heading repeats it.
- `apps/mobile/components/goals/edit-goal-modal/styles.ts:19` (U1): the same goal type line on mobile.
- `apps/web/components/command/command-menu-chrome.tsx:12` (U1): the palette group heading. `Orbit Busca.dc.html` draws it (`paletteGroup`), and each group name separates habits from actions.
- `apps/mobile/components/command/command-groups.tsx:29` (U1): the same palette group heading on mobile.
- `apps/mobile/components/search/search-list.tsx:103` (U1): the group heading of the search results. It separates the result kinds, as the palette groups do in `Orbit Busca.dc.html`.
- `apps/web/app/(app)/profile/_components/fresh-start-lists.tsx:28` (U1): the only heading of each list card. Uppercase is presentation, and no heading sits above it.
- `apps/mobile/app/(tabs)/profile/_components/fresh-start-lists.tsx:40` (U1): the same list card heading on mobile.
- `apps/web/components/ui/section-label.tsx:6` (U1): the `eyebrow` prop of SectionTitle in the `DESIGN.md` component table. No caller passes it, so it renders on no screen.
- `apps/mobile/components/ui/section-label.tsx:21` (U1): the same unused `eyebrow` style on mobile.
- `apps/mobile/components/ui/block-frame.tsx:347` (U1): the "Permanent" mark. It renders only when `item.irreversible` is true, so it states a real state of the row.
- `apps/mobile/components/ui/date-field.tsx:498` (U1): the weekday column heads of the date picker grid. They head columns and sit above no section heading.
- `apps/mobile/components/ui/select-check.tsx:137` (U1): the `tag` of an option row. It shows the `tag` value the row passes, a state of the option.
- `apps/web/app/(auth)/login/login-sections.tsx:34` (U1): the referral banner is a sentence that states a fact (the invitation applies when an account is created). It is not a label.
- `apps/mobile/app/login-styles.ts:22` (U1): the same referral banner on mobile.
- `apps/web/app/(app)/wrapped/_components/wrapped-styles.ts:75` (U1): the player eyebrow "Closing the week" is drawn in `Orbit Wrapped.dc.html`.
- `apps/mobile/app/wrapped-styles.ts:104` (U1): the same drawn eyebrow on mobile.
- `apps/web/components/gamification/celebration-panel.tsx:175` (U1): the `eyebrow` field of `Orbit Celebracao.dc.html`.
- `apps/mobile/components/gamification/celebration-panel.tsx:187` (U1): the same drawn eyebrow on mobile.
- `apps/web/components/milestone-share/milestone-share-card.tsx:19` (U1, U11): the "Streak milestone" eyebrow. The card leaves the app as an image, so the eyebrow is its only label for the kind.
- `apps/web/components/milestone-share/milestone-share-card.tsx:87` (U11): the flame emoji of the share card. `DESIGN.md` names celebration heroes as deliberate emoji.
- `apps/mobile/components/milestone-share/milestone-share-card.tsx:51` (U11): the same flame emoji on mobile.
- `apps/web/components/calendar/calendar-time-grid.tsx:241` (U2): `padStart(2, '0')` builds a clock time string for display. It is not numbering.
- `apps/mobile/app/(tabs)/calendar/_components/calendar-time-grid.tsx:321` (U2): the same time string on mobile.
- `apps/web/components/onboarding/onboarding-flow.tsx:177` (U2): the counter "Orbit · 01 / 05" is the `counterNode` of `Orbit Onboarding.dc.html`. The step order is real.
- `apps/mobile/components/onboarding/onboarding-flow.tsx:155` (U2): the same drawn counter on mobile.
- `apps/web/components/upgrade/billing-dashboard.tsx:105` (U2): `padStart` formats a card expiry month. It is not numbering.
- `apps/mobile/components/upgrade/billing-dashboard.tsx:101` (U2): the same expiry month on mobile.
- `apps/web/hooks/use-chat-composer-state.ts:93` (U2): `padStart` formats the recording timer. It is not numbering.
- `apps/mobile/hooks/use-chat-composer-state.ts:107` (U2): the same recording timer on mobile.
- `apps/mobile/components/ui/expiry-warning.tsx:32` (U2): `padStart` builds a hex colour byte. It is code, not copy.
- `apps/mobile/lib/theme.ts:186` (U2): `padStart` builds a hex colour byte. It is code, not copy.
- `apps/mobile/lib/theme.ts:260` (U2): `padStart` builds a hex colour byte. It is code, not copy.
- `apps/web/e2e/layout/interaction-fill-fixtures.ts:37` (U2): a test fixture date. It is not shown to a person.
- `apps/mobile/test-mocks/date-fns.ts:12` (U2): a test mock of a date function. It is not shown to a person.
- `apps/mobile/test-mocks/shared-dates.ts:3` (U2): a test mock of a date function. It is not shown to a person.
- `packages/shared/src/utils/time-parts.ts:16` (U2): `padStart` formats a time part. The other 15 non-test U2 hits of `packages/shared/src/utils` and `contracts` are the same two-digit date, clock and timer formatting or a hex byte, and they are not numbering.
- `apps/web/components/chat/goal-list-card.tsx:37` (U6): `join(' · ')` joins separate data of one goal record. It is not a status string.
- `apps/mobile/components/chat/goal-list-card.tsx:56` (U6): the same record data on mobile.
- `apps/web/components/chat/record-list-card.tsx:89` (U6): `join(' · ')` joins separate data of one record.
- `apps/mobile/components/chat/record-list-card.tsx:106` (U6): the same record data on mobile.
- `packages/shared/src/chat/habit-suggestion-view.ts:17` (U6): `join(' · ')` joins the schedule facts of one suggested habit.
- `packages/shared/src/chat/pending-operation-card-view.ts:365` (U6): `join(' · ')` joins the edited mark and the summary of one item.
- `packages/shared/src/chat/pending-operation-item-summary.ts:45` (U6): `join(' · ')` joins the cadence, interval, date and time of one item.
- `apps/web/components/habits/habit-row.tsx:335` (U6): the joined text is the accessible label of the row, read by a screen reader. The skill keeps screen-reader text.
- `apps/mobile/plugins/with-android-release-build-fixes.js:135` (U6): `join('|')` builds the `android:configChanges` value of the build. It is not UI.
- `packages/shared/src/utils/calendar-sync.ts:39` (U6): `join('|')` builds a cache key. It is not UI.
- `packages/shared/src/utils/habit-form-helpers.ts:229` (U6): a TypeScript union type (`HabitFormProposal | null`). It is code, not copy. Line 230 is the same.
- `packages/shared/src/i18n/en.json:1475` (U6): `charts.bar.selectedDay` chains three facts. Task 1 below holds the fix, which needs an owner choice.
- `apps/web/components/navigation/notification-row.tsx:44` (U10): the unread dot. It renders from `unread`, so it is a real state. Line 45 is the same dot.
- `apps/web/components/ui/toast.tsx:18` (U10): the `WorkingMark`. It is `aria-hidden` and shows only while a task runs. Lines 19 and 20 are the same mark.
- `apps/web/app/globals.css:125` (U17): the 19 hits of `globals.css` are `box-shadow: inset 0 0 0 Npx` selection and hairline rings of 1px and 2px. They are no glow and no gradient.
- `apps/web/components/auth/auth-page-panel.tsx:6` (U17): the same 1px hairline ring.
- `apps/mobile/lib/theme.ts:11` (U15): `shadowColor: '#000000'` is the neutral black of the card shadow tokens. It is not chart scaffolding.
- `apps/mobile/test-setup.ts:183` (U15): a test mock of the shadow tokens. It is not shown to a person. Lines 184 and 185 are the same.
- `apps/mobile/test-mocks/theme-provider.ts:4` (U15): a test mock of the shadow tokens. It is not shown to a person.
- `apps/mobile/test-mocks/use-app-theme.ts:6` (U15): a test mock of the shadow tokens. It is not shown to a person.
- `packages/shared/src/utils/habit-emoji-options.ts:30` (U11): the 414 hits are the emoji the user picks for a habit. The emoji is the stored value, not decoration.
- `packages/shared/src/utils/achievement-emoji.ts:2` (U11): the 31 hits map each achievement to its emoji value. The emoji is the value, not decoration.
- `packages/shared/scripts/contract-source.mjs:133` (U11): the "Generated by orval" header comment of a generated file. It is not shown to a person.
- `packages/shared/src/test-support/astra-offer-fixtures.ts:45` (U11): the emoji of the test fixtures (197 U11 hits in `packages/shared` tests and test support, for example `habit-ranking-fixtures.ts:17`). They are test data.
- `apps/web/__tests__/components/habits/reschedule-sheet.test.tsx:178` (U1): the one U1 hit of web tests. It asserts that the word Orbit is not uppercase. It is not a screen.
- `apps/web/__tests__/components/ui/list-row-geometry.test.tsx:164` (U9): the 3 web U9 hits are the Pro plan badge in a test fixture, a real plan state. They are not a screen. The other two are in `settings-switch-geometry.test.tsx:29` and `pages/progress.test.tsx:154`.
- `apps/mobile/__tests__/components/ui/row-geometry.test.tsx:185` (U9): the one mobile U9 hit is the Pro plan badge in a test fixture, a real plan state. It is not a screen.
- `apps/web/__tests__/components/ui/skeleton-blocks.test.tsx:19` (U10): an assertion that a skeleton block has no pulse. It is not a screen. `notification-bell.test.tsx:331` is the same.
- `packages/shared/src/i18n/en.json:3055` (U13): `wrapped.slides.consistency.note` is `p4Note` of `Orbit Wrapped.dc.html`. The drawing outranks the skill.
- `packages/shared/src/i18n/en.json:4687` (U1): `referral.loginBanner`, `celebration.*.eyebrow`, `wrapped.coverSubtitle`, `wrapped.slides.intro.caption`, `wrapped.slides.completions.caption`, `upgrade.convert.trustLine`, `upgrade.convert.cancelAnytime`, `upgrade.plans.yearly.heroLine`, `chat.operation.confirmNote`, `profile.support.description` and `profile.settingsRows.remindersNote` are drawn in `Orbit Wrapped`, `Orbit Celebracao`, `Orbit Pro`, `Orbit Astra Conversation`, `Orbit Sobre` and `Orbit Perfil`. The drawing outranks the skill. `trial.expired.paused` is the state of each feature row.

## Tasks

- [ ] `packages/shared/src/i18n/en.json:1475` U14, U6 `charts.bar.selectedDay` "{date} · {rate}% · {done} of {scheduled}": the rate shows twice (percent and fraction) and three facts chain. Keep one of the two figures after the owner picks which. The drawing does not fix it.
- [ ] `packages/shared/src/i18n/en.json:391` U3 `astraRail.title` and `astraRail.subtitle` ("Your habit copilot"): no code reads these keys, and the subtitle is a U3 subtitle. Delete both keys in both locales in a cleanup ticket.
- [ ] `packages/shared/src/i18n/en.json:2891` U3 `profile.subscription.proHint`, with `freeHint` at line 2893 and `trialEndedHint` at line 2898: no code reads these keys. Delete the three keys in both locales in a cleanup ticket.
- [ ] `packages/shared/src/i18n/en.json:3584` U8 `onboarding.featureGuide.astraSection.toolsBreadthTitle` "71 Built-In Tools", with `connectSection.assistantCanDoTitle` "93 tools" at line 3604: the UI cannot confirm these counts. Check them against the tool registry or remove the numbers.
- [ ] `packages/shared/src/i18n/en.json:3519` U3 `onboarding.featureGuide.*Desc` (about 60 long help paragraphs): a manual that narrates the screens. Ask the owner whether the guide stays at this length.
