# Padding surface inventory

> **At a glance** - the owners of the shared screen, card, section, row and sheet padding
> contract, its drawn variants, the fixed daily-summary and date-boundary gaps and its geometry evidence on web and Android.

`DESIGN.md` defines the roles. `packages/shared/src/theme/spacing.json` owns their values on the
existing scale. Native styles read `PADDING` or `SPACING`. Web reads those constants for inline
styles and the generated aliases for CSS and Tailwind utilities, including numeric scale utilities.

| Surface family | Web owner | Android owner | Padding ownership |
|---|---|---|---|
| Hoje | `app/(app)/today-page-client.tsx`, `components/today/today-ai-summary.tsx`, `components/habits/habit-list.tsx` | `app/(tabs)/index.tsx`, `components/today/today-ai-summary.tsx`, `components/habit-list.tsx`, `components/habit-list/styles.ts` | One 16 gutter; proactive-line to date gap scales from 24 with text enlargement; fixed 24 from the date to the daily summary or boundary notice and from either surface to the list; habit-family wrappers stay unpadded, with 8 body insets and 4 on child rows |
| Calendário | `app/(app)/calendar/page.tsx`, `components/calendar/` | `app/(tabs)/calendar.tsx`, `app/(tabs)/calendar/_components/` | One 16 gutter in each mode; 24 between sections; day card owns its 24 inset |
| Progresso | `app/(app)/progress/_components/progress-content.tsx` | `components/progress/progress-content.tsx` | Overview, Sequência, Metas and Conquistas share the 16 gutter and 32 section stack; overview title gap is 12, goal and achievement records keep their drawn 16 inset, streak content keeps its drawn 16 gap, and category groups retain 16 with 12 from each category title to its grid |
| Perfil | `app/(app)/profile/`, `components/profile/profile-settings-frame.tsx` | `app/(tabs)/profile.tsx`, `components/profile/profile-settings-frame.tsx`, `hooks/use-content-frame-style.ts` | 16 gutter, 32 group stack, 12 title gap; RowList adds no second content inset |
| Conta, Preferências, Astra and Notificações | `app/(app)/profile/_components/` | `app/(tabs)/profile/_components/` | Shared content frame; ListRow owns 16 inline and 12 block; allowance card owns its drawn 16 inset |
| Habit creation and edit | `components/habits/create-habit-modal/`, `components/habits/habit-form-fields/` | `components/habits/habit-create-frame.tsx`, `components/habits/habit-form-fields/` | Frame or Sheet owns outer inset; field and group spacing use the shared scale |
| Habit detail and checklist | `components/habits/habit-detail-screen.tsx`, `components/habits/habit-checklist.tsx` | `components/habits/habit-detail-screen.tsx`, `components/habits/habit-checklist.tsx` | Object frame owns gutter; fields, checklist add input and rows retain their drawn scale insets |
| Goal creation, edit, detail and linking | `components/goals/`, `components/habits/create-goal-from-habit/` | `components/goals/`, `components/habits/create-goal-from-habit/` | Sheet or inline frame owns inset; record, field and action spacing stay on scale |
| Astra conversation and generated blocks | `components/chat/`, `components/shell/composer.tsx` | `components/chat/`, `components/message-bubble.tsx`, `components/shell/composer.tsx` | Conversation, composer and block owners retain their drawn scale insets |
| Avisos and notification detail | `components/navigation/notification-list.tsx`, `components/navigation/notification-row.tsx` | Same component family | Rows own their content inset; detail sheet uses the shared primitive |
| Busca | `components/search/` | `app/search.tsx`, `components/search/` | Frame and result rows read the shared scale |
| Pro and Assinatura | `components/upgrade/` | `components/upgrade/`, `app/upgrade.tsx` | Shared frame and drawn record insets; action target clearance remains separate |
| Entry and step-up | `components/auth/`, `app/step-up/` | `components/auth/`, `app/login-styles.ts`, `app/step-up.tsx` | Auth frame and fields read the shared scale; locked pill geometry stays in `BUTTON_SIZES` |
| Onboarding | `components/onboarding/` | `components/onboarding/` | Flow and sheet primitives own outer inset; content uses scale utilities or constants |
| Wrapped and sharing | `app/(app)/wrapped/`, `components/share/`, `components/milestone-share/` | `components/wrapped/`, `components/share/`, `components/milestone-share/` | Player, slide and sharing owners read the scale; system safe areas are added separately |
| Sobre, privacy and terms | `app/(app)/about/`, `components/legal-document-layout.tsx` | `app/about.tsx`, `components/legal-document-layout.tsx` | Shared content frame and on-scale prose spacing |
| Support, offline, errors and empty states | `app/(app)/support/`, `components/ui/`, `components/ui/offline-refusal.tsx` | `app/support.tsx`, `components/ui/`, `components/offline-notice.tsx` | State and frame owners read the shared scale |
| Sheets, menus and confirmations | `components/ui/sheet.tsx`, `app/globals.css` | `components/ui/sheet.tsx`, `components/ui/menu.tsx` | Primitive owns 8 top, 24 inline and 24 bottom; header and footer use the shared aliases; callers add group spacing only |

The widget and header-control gap have separate owners under #1404 and #1405. This contract does
not change their geometry. Header-related substitutions only name existing scale values.

## Verification

`apps/web/e2e/layout/padding-contract.spec.ts` covers all four destinations in both locales at
412, 840 and 1352. The layout workflow owns execution. Vitest also measures the Progresso contract
in isolated Chromium and the Hoje section gaps through the owning composition.

Android coverage renders the owning Hoje list and screen, Calendário frame and day card, Progresso
screen and Perfil frame at the same widths. The row and card suites use Yoga for geometry and
preserve their enlarged-text cases. These renderer cases do not claim device-rendered text evidence.
The owning Hoje composition also measures the proactive-line gap at both text scales while
keeping the daily-summary section gap at 24. Date-boundary cases on both platforms cover the
last loggable day, the read-only past and the future at 320, 412, 840 and 1352 with text scales
1 and 2, keeping 24 from the date control to the notice and from the notice to the list.
Android renders the real boundary lookup and notice; dates without a boundary prove that no
notice or extra gap remains.

The sharing sheet renders native feedback text only while an error or save message is active,
retaining stable polite live-region containers and error priority. Native geometry counts empty Text
hosts as a line, so inactive feedback cannot pass the zero-trailing-space assertion as an empty
Yoga leaf. Cases at 412, 840 and 1352 cover inactive, error, saved, overlapping and cleared feedback.
The web mirror keeps stable alert and status paragraphs; Chromium verifies that both empty
paragraphs have zero height and add no trailing space.

The spacing rule covers padding and margins in style factories, branches and class aliases. The
CSS guard scans declarations and `@apply` utilities in every source stylesheet without a
violation baseline and checks generated aliases.
Regenerate aliases with `npm run spacing:generate -w @orbit/eslint-rules` and verify them with
`npm run spacing:check -w @orbit/eslint-rules`.
