# Content centring surfaces

> **At a glance** - page-column alignment owners, responsive sweep results and floating-add clearance coverage.

The page column stays centred in its available container. A web scrollbar's reserved gutter is
outside that container's usable width. Text inside a centred column retains its own reading
alignment. The shell's create control occupies a separate band above notices and the composer,
so scrolling content cannot pass behind its target.

The source sweep follows every route's rendered owner and its width constraints. The columns
below record that inspection at each width; they do not claim a running-app or Android device
inspection. `fixed` identifies an alignment correction, including one inherited from a shared
frame. `aligned` means the existing owner already centres its column. Each phone cell covers
320, 360 and 412; desktop covers 1440. Fold cells cover both inner-screen orientations.

| Screen or surface | Phone | 480 | 840 | 1100 | 1352 | 1200 x 1600 | 1600 x 1200 | Desktop | Owner and result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Hoje | fixed | fixed | fixed | aligned | aligned | aligned | aligned | aligned | Shell reserves a create band on compact web and at every Android width. |
| Todos | fixed | fixed | fixed | fixed | fixed | fixed | fixed | fixed | Habit-list empty actions centre within their row. |
| Geral | fixed | fixed | fixed | fixed | fixed | fixed | fixed | fixed | Shares the Todos empty-state owner. |
| Novo hábito | fixed | fixed | fixed | fixed | fixed | fixed | fixed | fixed | HabitCreateFrame centres the capped form; web submit and explanation share its centre. |
| Habit detail and edit sheet | aligned | aligned | fixed | fixed | fixed | fixed | fixed | fixed | HabitDetailFrame on web and the inner Android FlowShell body now centre at their retained caps; navigation shares their edges. Shared Sheet already bounds editing. |
| Calendário, Mês | fixed | fixed | fixed | fixed | fixed | fixed | fixed | fixed | Month navigation already centres; figures now centre within their equal tracks below the day card. |
| Calendário, Semana | aligned | aligned | aligned | aligned | aligned | aligned | aligned | aligned | Shared navigation and bounded time-grid viewport. |
| Calendário, Período | fixed | fixed | fixed | fixed | fixed | fixed | fixed | fixed | Shares the corrected figures. |
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
| Suporte | aligned | aligned | fixed | fixed | fixed | fixed | fixed | fixed | Support column and nested form centre independently at their retained caps. |
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
| Conversation and ideas library | aligned | aligned | aligned | aligned | aligned | aligned | aligned | aligned | Shell conversation layer centres the same header, thread and composer column. |
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

`use-content-frame-style.test.tsx` measures every shared Android cap. The web
`foldable-shell-geometry.test.tsx` checks the corresponding content frame, shared shell,
orientation, safe-area and pinned-action geometry. Existing calendar, profile, subscription,
search and support suites retain their state and interaction checks.

The source sweep covers the remaining screen owners through those shared layout constraints;
it is separate from the rendered fixtures above. Complete application flows, screen-reader
walks and Android device rendering remain outside this hermetic verification.
