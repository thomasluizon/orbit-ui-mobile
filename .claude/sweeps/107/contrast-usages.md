# Wave-2 contrast migrations — CANON (wave 1) handoff

Source: `.claude/sweeps/107/round-1/04-a11y.md` Domain 7 + CANON computations (D4/D5/D6). The tokens below are LIVE on `chore/107-code-health-sweep` (shared theme + globals.css + mobile theme.ts). Wave-2 agents apply the per-component migrations listed here inside their own file ownership. All ratios are WCAG relative-luminance contrast.

## Final computed token values

### `--fg-on-primary` / `tokens.fgOnPrimary` (D5 — already wired; no component migration needed where components already consume the token)

| Scheme | Mode | Accent | white on accent | ink #020618 on accent | Resolved value |
|---|---|---|---|---|---|
| purple | dark | #7f46f7 | 5.10 | 3.96 | **#ffffff** |
| purple | light | #631df2 | 7.03 | 2.87 | **#ffffff** |
| blue | dark | #2b7fff | 3.76 | 5.36 | **#020618** |
| blue | light | #155dfc | 5.25 | 3.84 | **#ffffff** |
| green | dark | #00c950 | 2.22 | 9.09 | **#020618** |
| green | light | #00a63e | 3.22 | 6.26 | **#020618** |
| rose | dark | #ff2056 | 3.75 | 5.37 | **#020618** |
| rose | light | #ec003f | 4.53 | 4.45 | **#ffffff** |
| orange | dark | #ff6900 | 2.89 | 6.98 | **#020618** |
| orange | light | #f54900 | 3.60 | 5.60 | **#020618** |
| cyan | dark | #00b8db | 2.37 | 8.52 | **#020618** |
| cyan | light | #0092b8 | 3.62 | 5.57 | **#020618** |

Any component hardcoding `#fff`/`text-white` on a primary fill must switch to `var(--fg-on-primary)` / `tokens.fgOnPrimary` or it stays broken in the 8 flipped combos.

### `--status-overdue-text` / `--status-bad-text` (D6 — new tokens; text usages must migrate)

| Token | Dark | on bg / card | Light | on bg / white card |
|---|---|---|---|---|
| status-overdue-text | #fe9a00 (= base) | 9.44 / 8.49 | **#b45b00** (darkened from #e17100, hue 30.1°→30.3°) | 4.52 / 4.73 |
| status-bad-text | #fb2c36 (= base) | 5.29 / 4.76 | #e7000b (= base) | 4.56 / 4.77 |

Mobile: `tokens.statusOverdueText` / `tokens.statusBadText`. Dots, rings, icons KEEP the base tokens (3:1 non-text passes everywhere).

### Placeholder + fg-3 reference (D4 — central defaults already flipped to fg-3)

| Color (purple) | dark on bg / card | light on bg / white |
|---|---|---|
| fg-4 (#62748e dark / #90a1b9 light) | 4.23 / 3.80 | 2.51 / 2.63 |
| fg-3 (#90a1b9 dark / #62748e light) | 7.66 / 6.89 | 4.55 / 4.76 |

Already done centrally (wave 1): `apps/web/components/ui/field-input.tsx`, `apps/web/app/globals.css` `.form-input`, `apps/mobile/components/ui/app-text-input.tsx` default.

## Migration rules

1. fg-4 used as TEXT (any size in light mode; <24px in dark) → fg-3. fg-4 stays for decorative icons and disabled states (D4).
2. Status-colored TEXT → the `-text` tokens; status dots/rings/icons keep base (D6).
3. Explicit `fg4` placeholder overrides → fg-3 (or drop the prop where the central default now applies).

## fg-4-as-text sites (04-a11y Domain 7 HIGH)

### Upgrade / billing
- apps/web/app/(app)/upgrade/page.tsx:549,635,819 (fine print)
- apps/mobile/app/upgrade.tsx:473,705,870

### Auth / login
- apps/web/app/(auth)/login/email-step.tsx:67,92
- apps/mobile/app/login.tsx:717,724

### Advanced settings
- apps/web/app/(app)/advanced/page.tsx:556,577
- apps/mobile/app/advanced.tsx:307,407

### Streak / retrospective
- apps/web/app/(app)/streak/_components/streak-sections.tsx:96,141
- apps/mobile/app/streak-sections.tsx:105
- apps/web/app/(app)/retrospective/page.tsx:243,255
- apps/mobile/app/retrospective.tsx:430,435

### Today / AI summary
- apps/web/components/habits/today-ai-summary.tsx:184
- apps/mobile/components/habits/today-ai-summary.tsx:204

### Profile / API keys / notifications
- apps/web/components/ui/create-api-key-modal.tsx:466
- apps/web/components/navigation/notification-bell.tsx:285
- apps/web/components/navigation/notification-detail-modal.tsx:73

### Calendar (weekday headers)
- apps/web/components/calendar/calendar-grid.tsx:144
- apps/web/components/habits/habit-calendar.tsx:139
- apps/mobile/app/(tabs)/calendar.tsx:330

### Shared pickers (mobile)
- apps/mobile/components/ui/app-select.tsx:146
- apps/mobile/components/ui/app-date-picker.tsx:253,318
- apps/mobile/components/ui/app-time-picker.tsx:242

## Explicit fg-4 placeholder overrides (bypass the new central fg-3 defaults)

### Web (`placeholder:text-[var(--fg-4)]` → `--fg-3`)
- apps/web/components/habits/create-habit-modal.tsx:290
- apps/web/components/habits/checklist-templates.tsx:132
- apps/web/components/habits/habit-form-fields.tsx:152,577
- apps/web/components/habits/habit-checklist.tsx:280
- apps/web/app/(app)/support/page.tsx:65
- apps/web/components/goals/create-goal-modal.tsx:507
- apps/web/components/goals/edit-goal-modal.tsx:377

### Mobile (`placeholderTextColor={tokens.fg4}` → `tokens.fg3`)
- apps/mobile/components/ui/bottom-sheet-app-text-input.tsx:101 (central default for sheet inputs — `?? tokens.fg4` → `?? tokens.fg3`)
- apps/mobile/components/ui/field-input.tsx:39 (mirror of web field-input — parity-critical)
- apps/mobile/app/(tabs)/profile.tsx:855,1016
- apps/mobile/components/habits/habit-form-fields/habit-emoji-selector.tsx:119
- apps/mobile/components/habits/habit-checklist.tsx:361
- apps/mobile/components/habits/create-habit-modal/sub-habit-editor.tsx:66
- apps/mobile/components/goals/create-goal-modal.tsx:229,301,321
- apps/mobile/components/goals/edit-goal-modal.tsx:197
- apps/mobile/components/goals/goal-detail-drawer/goal-progress-form.tsx:64

## Status base→`-text` migration sites (04-a11y Domain 7 MED; status color used as TEXT)

### Habits / today list
- apps/web/components/habits/habit-row.tsx:266 (streak), 465 (Skip menu item), 619 (overdue meta token)
- apps/mobile/components/habits/habit-row.tsx:340,349
- apps/web/components/habits/habit-list/date-group-section.tsx:66 (overdue group header)
- mobile date-group-section mirror :59 (under apps/mobile/components/habit-list/)

### Badges (amber tone)
- apps/web/components/ui/badge.tsx:23-24
- apps/mobile/components/ui/badge.tsx:56-57

### Goals
- apps/web/components/goals/goal-detail-sections.tsx:184
- apps/web/components/goals/edit-goal-modal.tsx:251,395
- apps/web/components/goals/create-goal-modal.tsx:381,523

### Calendar sync / warnings / misc
- apps/mobile/app/calendar-sync.tsx:552,567,742 + the web calendar-sync equivalents (apps/web/app/(app)/calendar-sync/page.tsx — locate amber text)
- apps/mobile/components/ui/expiry-warning.tsx:151,156
- apps/mobile/app/(tabs)/profile.tsx:1060
- apps/mobile/app/login.tsx:691

## Adjacent Domain-7 findings NOT covered by the new tokens (computed reference)

- ConfirmDialog danger pill, white text on `--status-bad` fill: dark 3.81 (fails), light 4.77. Ink #020618 on dark bad fill = 5.29 (passes) — apps/web/components/ui/confirm-dialog.tsx:229-239 + apps/mobile/components/ui/confirm-dialog.tsx:239-241,253-257. Text-on-fill, so neither `-text` token applies; needs the D5 ink-flip pattern or a darker fill.
- Inactive bottom-tab icons use fg-4: light 2.51 < 3:1 non-text minimum — apps/web/components/navigation/bottom-tab-bar.tsx:126 + apps/mobile/components/navigation/bottom-tab-bar.tsx:144 (fg-3 light = 4.55, passes).
- Unchecked control boundaries drawn with fg-4 fail 3:1 in light: select-check (web:14, mobile:18), plan-card (web:84, mobile:65), habit-checklist (web:231,361, mobile:449,491), habit-form-fields.tsx:1470 (web), calendar-day-detail.tsx:110 (web), breakdown-suggestion (web:284, mobile:417).
- `--primary` as small text: purple dark 3.96, green light 3.08, orange light 3.44, cyan light 3.46, rose light 4.33 — no decision covers this; carry to the round-2 register if unaddressed by area agents.
