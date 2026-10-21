# Content centring surfaces

> **At a glance** - page-column alignment owners, responsive sweep results and floating-add clearance coverage.

The page column stays centred in its available container. A web scrollbar's reserved gutter is
outside that container's usable width. Text inside a centred column retains its own reading
alignment. The shell's create control floats above notices and the composer without a bottom-chrome
band or hairline. The bottom viewport reserves 96px of clearance inside its scrollable content
while the control is present, so page content cannot pass behind its target. Wide web uses sidebar
creation and reserves no floating-control clearance.

The source sweep follows every route's rendered owner and its width constraints. The columns
below record that inspection at each width; they do not claim a running-app or Android device
inspection. `fixed` identifies an alignment correction, including one inherited from a shared
frame. `aligned` means the existing owner already centres its column. Each phone cell covers
320, 360 and 412; desktop covers 1440. Fold cells cover both inner-screen orientations.

| Screen or surface | Phone | 480 | 840 | 1100 | 1352 | 1200 x 1600 | 1600 x 1200 | Desktop | Owner and result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Hoje | fixed | fixed | fixed | aligned | aligned | aligned | aligned | aligned | Shared bottom scrolling keeps floating-add clearance on compact web and at every Android width. |
| Todos | fixed | fixed | fixed | fixed | fixed | fixed | fixed | fixed | Habit-list empty actions centre within their row. |
| Geral | fixed | fixed | fixed | fixed | fixed | fixed | fixed | fixed | Shares the Todos empty-state owner. |
| Novo hábito | fixed | fixed | fixed | fixed | fixed | fixed | fixed | fixed | HabitCreateFrame centres the capped form; the submit and explanation retain their responsive shared start edge. |
| Habit detail and edit sheet | aligned | aligned | fixed | fixed | fixed | fixed | fixed | fixed | HabitDetailFrame on web and the inner Android FlowShell body now centre at their retained caps; navigation shares their edges. Shared Sheet already bounds editing. |
| Calendário, Mês | fixed | fixed | fixed | fixed | fixed | fixed | fixed | fixed | Month navigation and the figures row centre as a column; values and captions retain their start edges within equal tracks. |
| Calendário, Semana | aligned | aligned | aligned | aligned | aligned | aligned | aligned | aligned | Shared navigation and bounded time-grid viewport. |
| Calendário, Período | fixed | fixed | fixed | fixed | fixed | fixed | fixed | fixed | Shares the centred figures row with start-aligned values and captions. |
| Calendário, Agenda | aligned | aligned | aligned | fixed | fixed | fixed | fixed | fixed | Shared content frame centres its narrower wide column. |
| Progresso | aligned | aligned | aligned | aligned | aligned | aligned | aligned | aligned | ProgressContent uses the centred shell cap. |
| Sequência | aligned | aligned | aligned | aligned | aligned | aligned | aligned | aligned | ProgressSubscreen keeps the centred shell cap. |
| Metas | aligned | aligned | aligned | aligned | aligned | aligned | aligned | aligned | ProgressSubscreen and goal sheets keep their shared frames. |
| Conquistas | aligned | aligned | aligned | aligned | aligned | aligned | aligned | aligned | ProgressSubscreen keeps the centred shell cap. |
| Perfil | aligned | aligned | aligned | fixed | fixed | fixed | fixed | fixed | Shared content frame centres the capped settings column. |
| Conta | aligned | aligned | aligned | fixed | fixed | fixed | fixed | fixed | ProfileSubscreen consumes the shared content frame. |
| Preferências | aligned | aligned | aligned | fixed | fixed | fixed | fixed | fixed | ProfileSubscreen consumes the shared content frame. |
| Astra settings | aligned | aligned | aligned | fixed | fixed | fixed | fixed | fixed | ProfileSubscreen consumes the shared content frame. |
| Notificações settings | aligned | aligned | aligned | fixed | fixed | fixed | fixed | fixed | ProfileSubscreen consumes the shared content frame. |
| Avisos | aligned | aligned | aligned | fixed | fixed | fixed | fixed | fixed | NotificationList consumes the shared content frame. |
| Busca | aligned | aligned | fixed | fixed | fixed | fixed | fixed | fixed | Search column, input and results centre within the shell. |
| Suporte | aligned | aligned | fixed | fixed | fixed | fixed | fixed | fixed | Support column centres at its retained cap; its form retains the column inset and 520 cap. |
| Sobre | aligned | aligned | aligned | fixed | fixed | fixed | fixed | fixed | Shared content frame retains the about cap. |
| Orbit Pro and Assinatura | aligned | aligned | aligned | fixed | fixed | fixed | fixed | fixed | Shared content frame retains the pitch and billing caps. |
| Wrapped cover and player | aligned | aligned | aligned | aligned | aligned | aligned | aligned | aligned | Centred player and FlowShell; shorter prose retains its start edge. |
| Login and auth callback | aligned | aligned | aligned | aligned | aligned | aligned | aligned | aligned | LoginContent uses its centred bounded frame. |
| Notion callback | aligned | aligned | aligned | aligned | aligned | aligned | aligned | aligned | Centred callback state. |
| Onboarding | aligned | aligned | aligned | aligned | aligned | aligned | aligned | aligned | OnboardingFlow uses its centred frame and bounded forward action. |
| Step-up | aligned | aligned | aligned | aligned | aligned | aligned | aligned | aligned | Shared FlowShell. |
| Privacy and terms | aligned | aligned | aligned | aligned | aligned | aligned | aligned | aligned | LegalDocumentLayout centres the document and caps prose measure. |
| Not found and error states | aligned | aligned | aligned | aligned | aligned | aligned | aligned | aligned | Shared shell or centred standalone failure frame. |
| Account deletion instructions, web | aligned | aligned | aligned | aligned | aligned | aligned | aligned | aligned | Public page uses its centred bounded wrapper. |
| Conversation and ideas library | aligned | aligned | aligned | aligned | aligned | aligned | aligned | aligned | Shell conversation layer centres the same header, thread and composer column; Ideas keeps one column of intent actions within that allocation. |
| Sheets, dialogs and command palette | aligned | aligned | aligned | aligned | aligned | aligned | aligned | aligned | Shared overlay owners bound their panels; ordinary ActionRow consumers retain trailing actions. |

The chat and referral routes redirect into existing owners. The native-intent route dispatches
links and the web challenge bridge hosts a provider callback; neither owns a page column.

## Verification owners

Both platforms' `content-centering-geometry.test.tsx` cover Todos empty, habit creation,
calendar month navigation and figures, and floating-add clearance at 320, 360, 412, 480, 840,
1100, 1352 and 1440, plus 1200 x 1600 and 1600 x 1200. Web mounts the production components
with production CSS in isolated Vitest Chromium pages. The overlap guard intersects each
control with the scroller's visible bounds at the start, middle and end of a long list.
Wide web uses sidebar creation and has no floating add target.

Android mounts the production components and checks their resolved styles and Yoga geometry.
Its guard proves that the real Fab target lies outside the entire scrolling content region.
These tests do not measure Android font rendering.

## Short windows

The floating-add reservation, notices and composer share one bottom viewport. Its 64px minimum
keeps a full one-line composer pill revealable while the reservation scrolls away first. The
tab bar stays outside that scroller. Content-size and viewport-size changes reveal the trailing
composer controls without animation. With enough height, the floating target retains its normal
position above the composer and outside the page scroller.

When the header, minimum page region, composer and tabs cannot fit after safe-area insets,
the destination itself scrolls inside those insets. Android reuses FlowViewport; compact web
uses the destination viewport. Header and tab measurements retain taller chrome, and both
tab bars share their unchanged 80px minimum through `TAB_BAR_MIN_HEIGHT`.

The page scroller retains a 96px minimum so the date title and numeric date, and a two-line
habit-row control, fit with focus clearance when scrolled to the centre. The bottom viewport
yields height before the page region, and the destination viewport scrolls when both minimums
and the measured header and tabs exceed the window.
Android applies that minimum only while the floating target is present. Without it, the page
keeps its 48px minimum and the pinned action or composer owns its bounded ScrollView, preserving
the existing short-window budget. Only floating compositions enable shared bottom scrolling.
Both compositions retain the same bottom viewport and pinned ScrollView ancestry. Floating-add
visibility changes update their scrolling props, flex styles and clearance without remounting
the composer input or closing its action menu.
Wide web removes the destination viewport from layout and resets its overflow to visible.
Notices keep a measurable parent column with or without the floating target, including when
the wide shell no longer needs the bottom viewport.

Web reserves the trailing clearance with scroller padding. A full-height destination wrapper
therefore fits short content without a scrollbar; long content still clears the floating target.
The root-header geometry suite checks the shared bell edge with both content lengths at 320,
412, 600 and 840 and at default and doubled text size.

Both centring suites mount the production composer, Fab and BottomTabBar at 840 x 240 and
360 x 320, with a 48px header and both zero and 24px top/16px bottom insets. They check the minimum viewport, revealability of the input,
send, attachment and create controls, page separation and the tab bar's window bounds. Android
also drives the native layout and content-size callbacks to check the initial composer reveal.
The Yoga adapter includes ScrollView's installed flex and overflow defaults.

The Android shell transition cases mount the production Composer, focus its input and open its
attachment menu, then remove and restore only the floating-add prop. They require the same input
instance, native focus and expanded menu at phone, foldable, inner-screen orientation and short
window sizes. The web shell cases cover input focus and an expanded menu through the same
transition, including the sheet and anchored presentations. Web retains its existing div ancestry
and changes only layout classes when floating-add visibility changes.

`use-content-frame-style.test.tsx` measures every shared Android cap. The web
`foldable-shell-geometry.test.tsx` checks the corresponding content frame, shared shell,
orientation, safe-area and pinned-action geometry. Existing calendar, profile, subscription,
search and support suites retain their state and interaction checks.

The source sweep covers the remaining screen owners through those shared layout constraints;
it is separate from the rendered fixtures above. Complete application flows, screen-reader
walks and Android device rendering remain outside this hermetic verification.

## Retained child geometry

The centred frame supersedes wide start-edge pinning for Perfil and its sub-screens, Avisos,
Sobre, Suporte, Busca and Assinatura (#1570). Their caps, content widths and child insets
remain unchanged. Header back controls retain their shell inset and stable hydration position.
Calendar figures retain equal tracks, start-aligned values and single-line captions at default
text size. Habit creation retains its responsive submit cap and the explanation below it,
centred at compact width and aligned to the submit start at wider widths.

The web shell and habit-create columns use native automatic inline margins with their existing
maximum widths. Opposite margins remain equal, including at odd window widths. Android's Yoga
layout retains its native point rounding. The centring suites check
412, 480, 740, 840 and 1100, plus odd widths 841 and 1101.

The create disclosure has no scale under reduced motion, including its starting style. Its
checklist test mounts HabitFormFields inside HabitCreateFrame and ShellWide, opens the real
details control and pauses the entrance at its first frame. It requires the exact 8px gap in
both themes. The ordinary entrance and exit retain their existing scale and opacity treatment.
