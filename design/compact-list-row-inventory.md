# Compact ListRow surface inventory

The scope is ListRow density across every direct consumer and the first five account and preference rows in Perfil. It covers ten surface families on web and mobile, twenty platform surfaces in total, implemented by eighteen paired consumer files. A consumer inherits a meaningful density change through the shared primitive even when its own file needs no edit. This inventory does not expand the task into rebuilding its parent screens or overlays.

Shared implementations: `apps/web/components/ui/list-row.tsx` and `apps/mobile/components/ui/list-row.tsx`.

## Density contract

- Plain rows default to a 52px minimum height, following `tokens/spacing.css` in the granted design system. The content floor is 44px, with 4px block padding and 16px inline padding.
- Described rows preserve the existing 76px minimum and 16px block padding. They can grow for wrapped descriptions and localized content. A compact row also uses a minimum rather than clipping content to a fixed height.
- Only the drawn Hoje drill navigation/add rows and Progresso linked-habit/action rows opt into the 56px regular floor. Their consumer files set `compact={false}` explicitly.
- An explicitly compact form row keeps its established 12px inline inset. Form rows without that explicit variant use the default 16px inset. Bare rows retain zero inline padding.
- Per-row actions remain independent 44px by 44px targets, centered beside the body without overlapping it. Read-only rows remain content rather than controls.
- Perfil's account row retains its chevron and address. The first five rows have no leading icons, and the four preference rows have no chevrons. The separate export row retains its drawn download icon.

## Paired consumers

Each numbered family has both a web and mobile surface. States below identify source branches affected by row density or unchanged branches where no ListRow renders; they are not claims of live visual acceptance. The row primitives retain the existing theme tokens and en/pt-BR locale paths.

### 1. Sobre destinations

Owner: `/about`, with the guide overlay and support, terms and privacy destinations.

| Web consumer | Mobile consumer | Rows and states | Density |
|---|---|---|---|
| `apps/web/app/(app)/about/page.tsx` | `apps/mobile/app/about.tsx` | Four destination rows; guide closed/open; long localized destination labels | Explicit compact, 52px floor |

### 2. Perfil settings and API keys

Owner: `/profile`, with name editing, preference pickers, widget information, fresh-start and account-deletion overlays. API-key rows own the step-up entry, scoped-create sheet and revoke confirmation.

| Web consumer | Mobile consumer | Rows and states | Density |
|---|---|---|---|
| `apps/web/app/(app)/profile/_components/profile-settings-content.tsx` | `apps/mobile/app/(tabs)/profile/_components/profile-settings-content.tsx` | Account and four preferences; export idle/preparing/error; locked Astra features; More rows with/without descriptions; sign-out, fresh-start and deletion | Plain rows 52px; account and described/error rows preserve growth |
| `apps/web/components/profile/profile-api-keys.tsx` | `apps/mobile/components/profile/profile-api-keys.tsx` | Free unlock, Pro step-up locked/unlocked, busy entry, empty/loading/error list, populated key rows and revoke actions | Explicit compact rows, 52px floor; actions 44px |

### 3. Calendario agenda and selected day

Owner: `/calendar`, including the agenda view, selected-day content and selected-day sheet.

| Web consumer | Mobile consumer | Rows and states | Density |
|---|---|---|---|
| `apps/web/components/calendar/calendar-agenda-view.tsx` | `apps/mobile/app/(tabs)/calendar.tsx` | Agenda loading, dates without entries, populated read-only entries, wrapped titles and optional times | Explicit compact, 52px floor |
| `apps/web/components/calendar/calendar-day-detail.tsx` | `apps/mobile/app/(tabs)/calendar/_components/calendar-day-detail.tsx` | Selected day without habits; read-only completed/unlogged habit rows with trailing rings; navigation row; interactive log rows use CheckRow separately | ListRow branches explicitly compact, 52px floor |

### 4. Hoje habit drill

Owner: the Hoje habit list, nested drill navigation and add-sub-habit entry.

| Web consumer | Mobile consumer | Rows and states | Density |
|---|---|---|---|
| `apps/web/components/habits/habit-list/habit-drill.tsx` | `apps/mobile/components/habit-list/habit-drill.tsx` | Deeper drill home row; parent add row with/without Pro badge; loading, error and empty child-list branches | Explicit regular, 56px floor, drawn in Orbit Hoje |

### 5. Progresso goal detail

Owner: `/progress` inline goal detail and the goal-detail overlay opened from the conversation. Edit and deletion overlays remain owned by goal detail.

| Web consumer | Mobile consumer | Rows and states | Density |
|---|---|---|---|
| `apps/web/components/goals/goal-detail-sections.tsx` | `apps/mobile/components/goals/goal-detail-sections.tsx` | Empty/populated linked habits; optional streak value | Explicit regular, 56px floor |
| `apps/web/components/goals/goal-detail-drawer/goal-action-footer.tsx` | `apps/mobile/components/goals/goal-detail-drawer/goal-action-footer.tsx` | Edit/delete; active abandonment; abandoned reactivation; updating disables status actions | Explicit regular, 56px floor, drawn in Orbit Progresso |

### 6. Habit create, edit and detail

Owners: create/edit habit sheets and `/habits/[id]`; their disclosed fields open goal/tag pickers and a goal-create sheet. The schedule, reminders, tags and goals retain their existing editors.

| Web consumer | Mobile consumer | Rows and states | Density |
|---|---|---|---|
| `apps/web/components/habits/habit-form-fields.tsx` | `apps/mobile/components/habits/habit-form-fields.tsx` | Details disclosure closed/open; free slip-alert upgrade entry; Pro editor branch | Default plain 52px; bare disclosure keeps zero inline inset |
| `apps/web/components/habits/habit-detail-fields.tsx` | `apps/mobile/components/habits/habit-detail-fields.tsx` | Editable/read-only schedule; described slip alert with Pro switch/free gate; linked goals absent/present, closed/open | Plain/bare rows 52px; described slip alert preserves growth |
| `apps/web/components/habits/habit-detail-screen.tsx` | `apps/mobile/components/habits/habit-detail-screen.tsx` | Add-sub-habit with/without Pro badge; destructive deletion entry and its confirmation; loading/error owners precede detail content | Default plain 52px |
| `apps/web/components/habits/goal-linking-field.tsx` | `apps/mobile/components/habits/goal-linking-field.tsx` | Selected-goal count; picker closed/open; empty/populated goals; selection limit; search/virtualized list at 21 goals | Default plain 52px, 16px inline inset |
| `apps/web/components/habits/habit-form-fields/tag-picker-field.tsx` | `apps/mobile/components/habits/habit-form-fields/tag-picker-field.tsx` | Selected-tag count; picker closed/open; selection limit and pending mutation; search/virtualized list at 21 tags | Default plain 52px, 16px inline inset |

### 7. Checklist templates

Owners: checklist fields in create/edit habit sheets and habit detail, opening the template sheet.

| Web consumer | Mobile consumer | Rows and states | Density |
|---|---|---|---|
| `apps/web/components/habits/checklist-templates.tsx` | `apps/mobile/components/habits/checklist-templates.tsx` | Entry; sheet closed/open; empty/populated templates; save entry/form; named template rows with count description and delete action; save/delete failures use the existing toast | Explicit compact form entry 52px with 12px inline inset; plain save row 52px; described list rows preserve growth |

### 8. Astra account records

Owner: conversation message bubbles, in the shell conversation overlay/panel and chat route.

| Web consumer | Mobile consumer | Rows and states | Density |
|---|---|---|---|
| `apps/web/components/chat/account-rows-card.tsx` | `apps/mobile/components/chat/account-rows-card.tsx` | Read-only profile/plan/referral records; wrapped values; resting and partial-failure block branches; referral copy/share feedback | Default plain 52px; content may grow for wrapped values |

`chat/pending-operation-card.tsx` on each platform uses the unrelated ListRowFields record component, not ListRow, and is excluded from the direct-consumer count.

### 9. Subscription billing invoices

Owner: the existing subscription presentation on `/upgrade`; invoice rows belong to BillingDashboard, while PlayBillingDashboard is separate.

| Web consumer | Mobile consumer | Rows and states | Density |
|---|---|---|---|
| `apps/web/components/upgrade/billing-dashboard.tsx` | `apps/mobile/components/upgrade/billing-dashboard.tsx` | Empty/populated invoice history; dated descriptions; download action when a URL exists and the account is online; read-only without a URL or offline; mobile download failure | Described rows preserve 76px floor and wrapping growth; download target 44px |

### 10. Referral entry and statistics

Owners: reusable referral entry and the referral sheet opened by the shell prompt and Hoje overlays. The reusable card is included even though no active parent currently imports it.

| Web consumer | Mobile consumer | Rows and states | Density |
|---|---|---|---|
| `apps/web/components/referral/referral-card.tsx` | `apps/mobile/components/referral/referral-card.tsx` | Loading hint/populated progress description; entry with chevron or optional dismiss action | Described row preserves growth; dismiss target 44px |
| `apps/web/components/referral/referral-drawer.tsx` | `apps/mobile/components/referral/referral-drawer.tsx` | Sheet closed/open; loading/error/populated content; completed, pending and coupon statistic rows | Default plain read-only rows 52px |

## Evidence boundary

The repository's web Vitest geometry tests render actual ListRow markup with the compiled stylesheet and app fonts in headless Chromium. They measure Sobre at 412px and 1280px and cover regular, plain, read-only, described, bare, compact-form and sibling-action variants. Mobile Vitest checks source props and flattened mocked native styles; those checks do not measure an Android layout.

The layout guard covers Sobre and Perfil at 412px and 1280px in both locales. Its permitted runner is the pull request layout workflow. Source review and unit evidence do not grant human visual acceptance, which follows the active redesign contract.
