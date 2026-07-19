# #539 — overlay capture-opener spec (for tools/capture-surfaces.mjs)

Read-only map (2026-07-18) of how to open every overlay + dynamic route so the coverage
capture can reach all 56 surfaces, not just the 30 plain routes. Apply AFTER the taste
workflow lands (the `data-testid` additions below touch apps/ and belong in the same PR).

## Global facts
- `AppOverlay` overlays render `<dialog aria-modal="true">` with an `<h2>` title → wait `getByRole('dialog')`.
- `ConfirmDialog` → `role="alertdialog"`. `RailDrawer` → `role="dialog"` + aria-label.
- No overlay is URL-addressable except invite/redirect. Captures run en AND pt-BR, so text/aria-name
  selectors match only one locale — **add data-testids to triggers** (table below) for locale independence.
- Existing locale-independent hooks: `data-tour="tour-fab-button"`, `data-tour="tour-notification-bell"`,
  `data-testid="habit-row"`, `data-habit-title`, `data-tour="tour-goal-card"`, `data-testid="habit-create-submit"`,
  `data-testid="reschedule-accept"`.
- FAB `[data-bottom-nav] [data-tour="tour-fab-button"]` is `md:hidden` (≥768 hidden). For a ≥768 capture
  viewport use the desktop sidebar "Create" (`onCreate`, name `t('nav.create')`).

## Group A — no seeded data
- **create-habit-modal** (reference, implemented): `/` → click FAB → wait `getByTestId("habit-create-submit")`. Blocker: free user w/ ≥10 habits redirects `/upgrade` → use pro/fresh session.
- **create-goal-modal**: `/` goals view → goals empty-state "Create" (`goals-view.tsx:69`) or FAB. **Pro-gated.**
- **referral-drawer**: `/profile` → click `ReferralCard` (`profile/page.tsx:49`).
- **share-card-sheet**: `/profile` → ProfileActionButton `t('shareCard.entry')`.
- **feature-guide-drawer**: `/about` → SettingsRow `t('onboarding.featureGuide.openButton')` (`about/page.tsx:59`).
- **preference-picker-sheet**: `/preferences` → click **language** row (theme/scheme have side effects; scheme can redirect `/upgrade`).
- **edit-name-sheet / fresh-start-modal / delete-account-modal / tour-replay-modal**: all via `ProfileModals` on `/profile`. Triggers: identity-header edit; account-actions "Fresh start"/"Delete account"; feature-sections "replay tour" (**mobile viewport only**). Delete: open only, do NOT click send-code (real deletion).
- **create-api-key-modal**: `/advanced` → ApiKeysSection "create key". **Pro-gated** (section renders only if hasProAccess).
- **confirm-dialog** (generic): `/` → FAB → type title (dirty) → Escape → wait `getByRole('alertdialog')` (discard-changes).

## Group B — need seeded entities
- **habit-detail-drawer**: `/` → `getByTestId('habit-row').first().click()`. Needs ≥1 habit. HIGH confidence.
- **edit-habit-modal**: habit row overflow (`aria-label t('habits.actions.more')`) → "Edit". Needs habit.
- **reschedule-sheet**: **overdue** habit row → overflow → "Reschedule". Body testids `reschedule-accept`(pro)/`reschedule-free-prompt`(free).
- **confirm-dialogs** (habit delete/duplicate/skip): habit overflow menu → item → `getByRole('alertdialog')`.
- **edit-goal-modal**: goals view → right-click goal card (`data-tour="tour-goal-card"`) → "Edit". **Pro + goal.**
- **goal-detail-drawer**: goals view → click goal card (`data-tour="tour-goal-card"`). **Pro + goal.** HIGH.
- **edit-handle-sheet**: `/social` → identity-bar edit (`aria-label t('social.identity.editAria')`). Needs social opt-in + handle.
- **notification-detail-modal**: click bell `[data-tour="tour-notification-bell"]` → notification row. Needs ≥1 notification.

## Group C — self-gating / hard blockers
- **trial-expired-modal**: self-opens on any (app) route when profile trial-expired & `localStorage.orbit_trial_expired_seen` unset. **Seed trial-expired state.**
- **rail-drawer**: viewport **768–1279px**, on `/` habits view → RailToggle (`aria-haspopup="dialog"`, `aria-label t('shell.openRail')`). Hidden at default 1280 width.

## Dynamic routes (fixtures)
- **route-r-code** (`/r/[code]`): server redirect; needs a **valid referral code** (from `get_referral_code` / ReferralDrawer / DB). Authed → redirects to `/social?invite=<code>` (which opens invite-confirm-sheet).
- **overlay-invite-confirm-sheet**: `/social?invite=<code>` auto-opens. Needs valid code + social opt-in.
- **route-social-challenges-id** (`/social/challenges/[id]`): needs a **real challenge id** (from `/social/challenges` list) + membership.
- **route-u-slug** (`/u/[slug]`): **public, no auth**; needs a valid public-profile slug (enable public profile at `/public-profile`).

## missingTestIds — add to the TRIGGER (locale-independent openers), fold into this PR
| Surface | trigger file:line | testid |
|---|---|---|
| create-goal-modal | `goals-view.tsx:69` + goals FAB | `goal-create-open` |
| edit-habit-modal | `habit-row-trailing.tsx:152` + `habit-row-menu.tsx` | `habit-row-more`, `habit-menu-edit` |
| reschedule-sheet | habit menu "Reschedule" | `habit-menu-reschedule` |
| confirm-dialogs (habit) | habit menu delete/duplicate/skip | `habit-menu-delete`/`-duplicate`/`-skip` |
| edit-goal-modal | `goal-card.tsx:112` context "Edit" | `goal-menu-edit` |
| notification-detail-modal | `notification-bell.tsx:95` row button | `notification-row` |
| edit-handle-sheet | `social-identity-bar.tsx:45` | `edit-handle-open` |
| feature-guide-drawer | `about/page.tsx:59` | `feature-guide-open` |
| referral-drawer | `profile/page.tsx:49` | `referral-card-open` |
| share-card-sheet | `share-card-entry-button.tsx:25` | `share-card-open` |
| preference-picker-sheet | `preference-settings-list.tsx` rows | `pref-open-language`/`-theme`/`-scheme`/`-weekStart` |
| edit-name/fresh-start/delete-account/tour-replay | `profile-identity-header.tsx`, `profile-account-actions.tsx`, `profile-feature-sections.tsx` | `profile-edit-name`/`-fresh-start`/`-delete-account`/`-tour-replay` |
| create-api-key-modal | `advanced-sections.tsx` ApiKeysSection | `api-key-create-open` |
| rail-drawer | `rail-drawer.tsx:113` | `rail-toggle` |

## Seed implications (the fixture must include)
Pro session (create-goal, api-key, edit/detail-goal, reschedule-pro) · ≥1 habit incl. one **overdue** ·
≥1 goal · social opt-in + handle · ≥1 notification · a referral code · a challenge (membership) ·
a public-profile slug · trial-expired variant for that one modal. Some cells need distinct account states
(trial-expired vs pro) — capture those in a second pass with the alternate session.
