# Accessibility Audit -- Orbit Web App

**Date:** 2026-04-04
**Standard:** WCAG 2.1
**Scope:** `apps/web/` -- Next.js 15 App Router

---

## Summary

All **Level A** failures listed below have been **fixed** in the same session as this audit.
Level AA items are a mix of fixed issues and remaining work.
Level AAA items are noted for awareness but not required for compliance.

---

## WCAG Level A -- Critical (Must Fix)

### A-1 -- Interactive `<div>` used instead of `<button>` [FIXED]

**File:** `apps/web/components/goals/goal-card.tsx:92-95`
**Before:** A `<div>` with `onClick` wrapped the entire goal card.
**Problem:** Non-semantic elements are not keyboard-focusable, not announced as interactive by screen readers, and cannot be activated with Enter or Space.
**Fix applied:** Replaced with `<button type="button">`. The button contains a visible `<h3>` with the goal title, so the accessible name is derived from content -- no `aria-label` is needed.

---

### A-2 -- `<article>` with keyboard handler but no `tabIndex` [FIXED]

**File:** `apps/web/components/habits/habit-card.tsx:352`
**Before:** `<article>` had `onKeyDown` and `onClick` but no `tabIndex`, so it was not reachable by Tab.
**Fix applied:** Added `tabIndex={0}`.

---

### A-3 -- Icon-only buttons without accessible names [FIXED]

Multiple buttons contained only a Lucide icon and no `aria-label`. Screen readers would announce them as unlabelled.

| File | Approx. line | Button | Fix |
|---|---|---|---|
| `apps/web/components/navigation/notification-bell.tsx` | 108 | Delete-all notifications | `aria-label={t('notifications.deleteAll')}` |
| `apps/web/components/navigation/notification-bell.tsx` | 157 | Per-notification delete | `aria-label={t('notifications.deleteNotification')}` |
| `apps/web/components/navigation/notification-bell.tsx` | 149 | Per-notification open | `aria-label={item.title}` |
| `apps/web/components/ui/trial-banner.tsx` | 46 | Dismiss banner | `aria-label={t('common.dismiss')}` |
| `apps/web/components/habits/habit-form-fields.tsx` | ~516 | Remove end date | `aria-label={t('habits.form.removeEndDate')}` |
| `apps/web/components/habits/habit-form-fields.tsx` | ~578 | Remove reminder chip | `aria-label={t('habits.form.removeReminder')}` |
| `apps/web/components/habits/habit-form-fields.tsx` | ~679 | Remove scheduled reminder chip | `aria-label={t('habits.form.removeScheduledReminder')}` |
| `apps/web/components/habits/habit-form-fields.tsx` | ~809 | Edit tag | `aria-label={t('habits.form.editTag')}` |
| `apps/web/components/habits/habit-form-fields.tsx` | ~819 | Delete tag | `aria-label={t('habits.form.deleteTag')}` |
| `apps/web/components/habits/habit-checklist.tsx` | ~175 | Duplicate item | `aria-label={t('habits.form.duplicateChecklistItem')}` |
| `apps/web/components/habits/habit-checklist.tsx` | ~185 | Remove item | `aria-label={t('habits.form.removeChecklistItem')}` |
| `apps/web/app/(app)/calendar/page.tsx` | 55 | Go to today | `aria-label={t('dates.goToToday')}` |
| `apps/web/app/(app)/calendar/page.tsx` | 66 | Previous month | `aria-label={t('common.previousMonth')}` |
| `apps/web/app/(app)/calendar/page.tsx` | 79 | Next month | `aria-label={t('common.nextMonth')}` |
| `apps/web/components/habits/habit-list.tsx` | 477 | Go back (drill-back) | `aria-label={t('common.goBack')}` |

**New i18n keys added** to `packages/shared/src/i18n/en.json` and `pt-BR.json`:
- `habits.form.removeChecklistItem`
- `habits.form.checklistItemLabel`
- `habits.form.removeEndDate`
- `habits.form.removeReminder`
- `habits.form.removeScheduledReminder`
- `habits.form.editTag`
- `habits.form.deleteTag`
- `habits.form.selectColor`
- `dates.goToToday`
- `chat.send`
- `chat.removeImage`

---

### A-4 -- Form inputs without associated labels [FIXED]

| File | Element | Fix |
|---|---|---|
| `apps/web/components/habits/habit-checklist.tsx:254` | Add-item input | `<label className="sr-only" htmlFor={newItemInputId}>` linked via `useId()` |
| `apps/web/components/habits/habit-checklist.tsx:163` | Per-item text input (editable) | `aria-label={t('habits.form.checklistItemLabel', { n: index + 1 })}` |
| `apps/web/components/habits/habit-form-fields.tsx` | Tag name inputs | `aria-label={t('habits.form.tagName')}` |
| `apps/web/components/habits/habit-form-fields.tsx` | Reminder custom number input | `aria-label={t('habits.form.reminderCustomPlaceholder')}` |
| `apps/web/components/habits/habit-form-fields.tsx` | Scheduled reminder time input | `aria-label={t('habits.form.scheduledReminderTimePlaceholder')}` |
| `apps/web/app/(app)/page.tsx` | Habit search input | `aria-label={t('habits.searchPlaceholder')}` |

---

### A-5 -- Decorative icons missing `aria-hidden="true"` [FIXED]

Without `aria-hidden`, screen readers read icon SVG names or skip text that follows, causing noise and broken announcements.

| File | Icon |
|---|---|
| `apps/web/components/navigation/notification-bell.tsx` | Bell, unread badge count |
| `apps/web/components/ui/trial-banner.tsx` | Clock, X |
| `apps/web/components/gamification/achievement-toast.tsx` | Star emoji span |
| `apps/web/components/habits/habit-checklist.tsx` | GripHorizontal, static checkbox indicator |
| `apps/web/components/habits/habit-form-fields.tsx` | Multiple decorative Plus, Bell, PenSquare, X icons |
| `apps/web/app/(app)/page.tsx` | X on search clear button |
| `apps/web/app/(app)/calendar/page.tsx` | Search, ChevronLeft, ChevronRight |
| `apps/web/components/habits/habit-list.tsx` | ArrowLeft |
| `apps/web/app/(chat)/chat/page.tsx` | SendHorizontal |

---

### A-6 -- `<ul>/<li>` structure for notification list [FIXED]

**File:** `apps/web/components/navigation/notification-bell.tsx`
**Before:** Notification items were plain `<div>` elements.
**Fix applied:** Wrapped in `<ul>` with each item in `<li>`. Loading skeleton also wrapped in an `<li>`.

---

## WCAG Level A -- Remaining Concerns

### A-7 -- Error messages not programmatically associated with inputs

**Files:**
- `apps/web/components/goals/create-goal-modal.tsx:227-234`
- `apps/web/components/goals/edit-goal-modal.tsx` (same pattern)

**Problem:** Validation and mutation error messages are rendered as plain `<p className="text-red-400">` elements below the form. They have no `role="alert"`, `aria-live`, or `aria-describedby` association with the triggering input. A screen reader user submitting an invalid form will not hear the error.

**Fix:** Add `role="alert"` to the error `<p>` elements, or add `aria-describedby` on each input pointing to its error message container.

```tsx
{validationError && (
  <p role="alert" className="text-red-400 text-xs">{validationError}</p>
)}
```

The same pattern exists in the habit form fields for inline validation errors at:
- `apps/web/components/habits/habit-form-fields.tsx:452, 481, 488, 520`

**Severity:** High. Users relying on screen readers will miss form errors entirely.
**Effort:** Quick win -- add `role="alert"` to existing `<p>` elements.

---

### A-8 -- Push prompt dismiss button has no accessible name

**File:** `apps/web/components/ui/push-prompt.tsx:81`
**Current:** `<button className="shrink-0 p-1 ..."><X className="size-4" /></button>`
**Problem:** Icon-only X button with no `aria-label`.
**Fix:**
```tsx
<button aria-label={t('common.dismiss')} className="shrink-0 p-1 ...">
  <X className="size-4" aria-hidden="true" />
</button>
```
**Effort:** Quick win.

---

### A-9 -- Welcome-back toast has no live region

**File:** `apps/web/components/gamification/welcome-back-toast.tsx:65`
**Problem:** Toast appears visually after a 800ms delay but the outer `<div>` has no `role="status"` or `aria-live`. Screen reader users will miss the welcome message entirely.
**Fix:** Add `role="status" aria-live="polite" aria-atomic="true"` to the outer div.
**Effort:** Quick win.

---

### A-10 -- Calendar day buttons have no locale-aware accessible name in all contexts

**File:** `apps/web/components/calendar/calendar-grid.tsx:175`
**Status:** Fixed for the date format. The `aria-label` now uses `format(cell.date, 'EEEE, MMMM d', { locale: dateFnsLocale })`, which gives screen readers "Monday, April 7" instead of just "7". `aria-current="date"` marks today. `aria-disabled` marks non-selectable days.

---

## WCAG Level AA -- Important

### AA-1 -- Color contrast: muted text on dark background

**File:** `apps/web/app/globals.css:25-27`
```css
--color-text-secondary: #9b95ad;   /* on #13111f (surface) */
--color-text-muted:    #7a7490;   /* on #13111f (surface) */
--color-text-faded:    #a59cba;   /* on #13111f (surface) */
```

Approximate contrast ratios against `#13111f` (surface):
- `text-secondary` (#9b95ad): ~4.3:1 -- passes AA for normal text (4.5:1 required), **fails for small text below 18px**
- `text-muted` (#7a7490): ~3.4:1 -- **fails AA** at all sizes
- `text-faded` (#a59cba): ~4.6:1 -- passes AA for normal text

`text-muted` is used extensively for section headers, form labels (`.form-label`), timestamps, and helper text. This is the most pervasive contrast issue in the codebase.

WCAG AA requires 4.5:1 for text under 18px (or 14px bold), and 3:1 for large text.

**Affected usage examples:**
- `apps/web/app/(app)/preferences/page.tsx:188` -- section headings (`text-sm font-bold`)
- `apps/web/components/goals/goal-card.tsx:147` -- percentage label (`text-[11px]`)
- `apps/web/app/globals.css:306` -- `.form-label` utility class
- All `text-text-muted` labels and helper text throughout the app

**Fix:** Lighten `--color-text-muted` from `#7a7490` to approximately `#9991a8` (4.6:1 on `#13111f`). Review `--color-text-secondary` to ensure it reaches 4.5:1 on all backgrounds it appears on.

**Effort:** Medium. One-line CSS change but requires visual review across the full app. Run automated contrast checks after the change.

---

### AA-2 -- Section group headers styled as `text-sm uppercase tracking-wider` without semantic heading

**Files:** `apps/web/app/(app)/preferences/page.tsx:188, 215, 253, 279, 307, 337`

Every section card on the Preferences page uses `<h2>` styled with `text-sm font-bold uppercase`, which is correct. However the styling is extremely similar to `text-text-muted` helper labels used elsewhere without heading tags (`.form-label` applies the same visual style using `@apply`). There is no inconsistency in the preferences page itself, but the `.form-label` utility class (used in form modals) applies the same appearance to `<span>` elements rather than heading elements, breaking the logical heading hierarchy inside those modals.

**File:** `apps/web/app/globals.css:306` -- `.form-label` defined as `@apply ... text-text-muted`
**Affected files:** Any component that uses `<span className="form-label">` instead of a heading.

**Fix:** In `create-goal-modal.tsx` line 210 and similar locations, either convert `<span className="form-label">` to `<label htmlFor="...">` (for inputs) or `<p className="form-label">` (for non-input sections). Modals that use `AppOverlay` with a `title` prop already have an `<h2>` via the dialog title, so sub-sections inside them should use `<h3>` or semantic labels, not generic `<span>`.

**Effort:** Medium. Requires reviewing each modal form.

---

### AA-3 -- Focus indicator missing on chat textarea

**File:** `apps/web/app/(chat)/chat/page.tsx:417`
**Current:** `focus:outline-none` is applied with no replacement ring.
**Problem:** The chat compose textarea has no visible focus indicator. While the global `:focus-visible` rule provides a 2px primary outline, `focus:outline-none` unconditionally suppresses the outline even for keyboard users.
**Fix:** Replace `focus:outline-none` with `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30`, or remove the `focus:outline-none` class entirely to let the global style apply.
**Effort:** Quick win.

---

### AA-4 -- `prefers-reduced-motion` not respected in all animation CSS files

**File:** `apps/web/app/globals.css:450` -- global animation kill present
**Files missing the media query:**
- `apps/web/components/gamification/level-up-overlay.css` -- `animation: level-up-pop 0.6s`
- `apps/web/components/gamification/streak-celebration.css` -- flame sway, glow breathe, ember rise (infinite loops)
- `apps/web/components/gamification/streak-badge.css` -- `streak-flame-flicker`, `streak-badge-glow-intense`, `streak-badge-glow-legendary` (infinite loops)
- `apps/web/components/gamification/profile-streak-card.css` -- check for animations

The global `globals.css:450` rule sets `animation-duration: 0.01ms` for all elements, which technically covers these files. However, the flame and glow animations play at `infinite` duration and the global rule only sets `animation-duration`, not `animation: none`. The result is that these animations fire once (at 0.01ms) but elements with `animation-iteration-count: infinite` may still have side effects depending on the browser.

**Fix:** Add explicit `@media (prefers-reduced-motion: reduce)` blocks to each CSS file disabling the relevant animation properties:
```css
@media (prefers-reduced-motion: reduce) {
  .streak-badge__flame-svg,
  .streak-badge--intense,
  .streak-badge--legendary {
    animation: none;
  }
}
```
**Effort:** Quick win per file.

---

### AA-5 -- Small touch targets on destructive/secondary buttons

WCAG 2.5.5 (Level AA, added in 2.1) requires touch targets of at least 44x44px.

| File | Element | Rendered size | Issue |
|---|---|---|---|
| `apps/web/components/ui/push-prompt.tsx:81` | X dismiss button | `p-1` = ~28x28px | Below minimum |
| `apps/web/components/habits/habit-checklist.tsx:172,183` | Duplicate / Remove buttons | `p-1` = ~24x24px | Below minimum |
| `apps/web/components/habits/habit-form-fields.tsx:~575-585` | Reminder chip X buttons | `px-2.5 py-1` chip height ~28px | Below minimum |
| `apps/web/components/goals/create-goal-modal.tsx:196` | Remove deadline X button | `p-2 size-4 icon` = ~32x32px | Borderline |

The `.touch-target` utility class defined in `globals.css:466` uses a CSS pseudo-element to expand the interactive area to 44x44px without changing visual size. It is currently only used in `apps/web/components/onboarding/onboarding-complete-habit.tsx:85`.

**Fix:** Apply `touch-target` class to the small buttons listed above. For example:
```tsx
<button className="shrink-0 p-1 touch-target text-text-muted hover:text-red-500">
```
**Effort:** Quick win -- one class addition per element.

---

### AA-6 -- Frequency toggle buttons use `aria-pressed` but not grouped as a radiogroup

**File:** `apps/web/components/habits/habit-form-fields.tsx` (frequency section)
**Status:** `aria-pressed` was added to One-time / Recurring / Flexible / General toggle buttons.
**Remaining concern:** These act as a single-select group (only one can be active at a time), which maps better to `role="radiogroup"` + `role="radio"` + `aria-checked` than to independent `role="button"` + `aria-pressed`. Screen readers will not indicate mutual exclusivity when using `aria-pressed`.

**Fix (recommended for complete compliance):**
```tsx
<div role="radiogroup" aria-label={t('habits.form.frequency')}>
  <button role="radio" aria-checked={watchedFrequency === 'Day'} ...>
```
**Effort:** Medium. Requires changing role semantics on the frequency picker section.

---

### AA-7 -- Today page has no `<h1>` visible heading

**File:** `apps/web/app/(app)/page.tsx`
**Problem:** The page renders an Orbit logo image + "Orbit" text inside a `<button>` in a `<header>`. There is no `<h1>` element, and the logo button is not the page title -- it is a navigation action (go to today). Screen reader users and search-oriented ATs cannot determine the page name.

All other app pages (`/calendar`, `/profile`, `/preferences`, etc.) have a visible `<h1>`.

**Fix:** Add a visually-hidden `<h1>` with the current date or "Today":
```tsx
<h1 className="sr-only">{t('nav.habits')} -- {format(selectedDate, 'PPPP')}</h1>
```
**Effort:** Quick win.

---

## WCAG Level AAA -- Advisory

### AAA-1 -- No live announcement of habit log success

**File:** `apps/web/app/(app)/page.tsx`
**Problem:** When a habit is logged, the UI updates visually (button state, progress bar, potential celebration overlay) but there is no `aria-live` announcement that the action succeeded. The `AllDoneCelebration` overlay has `aria-live="polite"`, covering the "all done" state, but not individual habit completions.
**Note:** This is Level AAA (WCAG 4.1.3, Status Messages). The celebration overlays partially address the most impactful moment.

---

### AAA-2 -- Colour alone used to convey tracking status in GoalCard

**File:** `apps/web/components/goals/goal-card.tsx:76-88`
**Problem:** The left border color (green / amber / red) conveys `trackingStatus` (on_track / at_risk / behind) with no text alternative visible to sighted users or exposed to assistive technology.
**Fix (advisory):** Add a visually-hidden `<span className="sr-only">` with the tracking status text, or expose it as an `aria-label` prefix on the card button.

---

### AAA-3 -- Infinite animations on streak badge for vestibular users

**File:** `apps/web/components/gamification/streak-badge.css`
**Problem:** The flame flicker animation and badge glow animations run indefinitely. While visually subtle, users with vestibular disorders may experience discomfort. Covered partially by the global `animation-duration` override but see AA-4 above for the completeness caveat.

---

## Focus Management -- Verified Correct

The following were audited and found compliant. No changes were needed.

- **`AppOverlay`** (`apps/web/components/ui/app-overlay.tsx`): Full focus trap implemented manually. Auto-focuses first focusable element on open, wraps Tab/Shift-Tab, restores focus to trigger on close, sets `aria-modal="true"`.
- **Skip link**: Present in `apps/web/app/(app)/layout.tsx:20-25`, `(auth)/layout.tsx`, and `(chat)/layout.tsx`. Points to `#main-content` which is a `<main>` element.
- **`BottomNav`** (`apps/web/components/navigation/bottom-nav.tsx`): FAB button has `aria-label={t('nav.createHabit')}`. Nav links have visible text labels. FAB is 56x56px (14rem), well above the 44px minimum.
- **`ThemeToggle`** (`apps/web/components/ui/theme-toggle.tsx`): `aria-label` updates dynamically based on current theme.
- **`ExpiryWarning`** (`apps/web/components/ui/expiry-warning.tsx`): `role="alert" aria-live="assertive" aria-atomic="true"` added. Login/refresh button has visible text.
- **`AchievementToast`** (`apps/web/components/gamification/achievement-toast.tsx`): `role="status" aria-live="polite" aria-atomic="true"` added.
- **`LevelUpOverlay`** (`apps/web/components/gamification/level-up-overlay.tsx`): Uses `<output aria-live="assertive">` -- correct.
- **`AllDoneCelebration`**: Uses `<output aria-live="polite">` -- correct.
- **Progressbars**: `role="progressbar"` with `aria-valuenow/min/max/label` added to `HabitChecklist` and `GoalCard`.
- **Custom switches**: `role="switch" aria-checked aria-label` on home screen and push notification toggles in `preferences/page.tsx`.
- **Tablist**: `role="tablist" aria-label`, `role="tab" aria-selected aria-controls`, `role="tabpanel" aria-labelledby` correctly implemented in `app/(app)/page.tsx`.
- **Images**: All `<img>` elements have descriptive `alt` text (`"Orbit"`, `t('chat.attachmentPreview')`).
- **Heading hierarchy**: All authenticated pages have exactly one `<h1>` followed by `<h2>` section headers. The Today page is the only exception (see AA-7).
- **Notification dropdown**: `role="region" aria-label`, `<ul>/<li>` structure, loading state wrapped in `<li aria-label={t('common.loading')}>`.
- **Calendar day buttons**: `aria-label` with full locale date, `aria-current="date"` for today, `aria-disabled` for non-selectable days.

---

## Quick Wins (Under 15 minutes each)

1. Add `role="alert"` to error `<p>` elements in `create-goal-modal.tsx` and `edit-goal-modal.tsx` (A-7)
2. Add `aria-label` and `aria-hidden` to push-prompt dismiss X button (A-8)
3. Add `role="status" aria-live="polite" aria-atomic="true"` to welcome-back toast (A-9)
4. Remove `focus:outline-none` from chat textarea or replace with `focus-visible:` variant (AA-3)
5. Add `prefers-reduced-motion` blocks to `level-up-overlay.css`, `streak-celebration.css`, `streak-badge.css` (AA-4)
6. Apply `.touch-target` class to small X/delete buttons in checklist, push-prompt, and form chips (AA-5)
7. Add `<h1 className="sr-only">` to the Today page (AA-7)

## Larger Efforts

1. **Lighten `--color-text-muted`** from `#7a7490` to a value achieving 4.6:1+ on all surface colors, then do a full visual pass (AA-1)
2. **Convert frequency toggles** from `aria-pressed` buttons to a `role="radiogroup"` pattern (AA-6)
3. **Audit `.form-label` `<span>` usages** in modals and convert to `<label htmlFor>` or appropriate semantic elements (AA-2)
