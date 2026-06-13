# Round-6 verify — Sweep #11 Design-system compliance — issue #107

READ-ONLY. Baseline: ui-mobile **1dd5c3d** (committed green). Verifies the r6 amber→`-text` migrations introduced no accent literals / non-transform motion, and the loading-bar transform rewrite is design-compliant.

## amber → `--status-overdue-text` migrations — token swaps only, no accent literals

r6 migrated every `--status-overdue`/`tokens.statusOverdue` **text** consumer to the `-text` token (the canon-prescribed AA fix). Read each diff — all are pure token reference swaps, ZERO raw hex / rgba introduced:

- **Web** (`--status-overdue` → `--status-overdue-text`): goal-card (`%` label `textColor` + ≤7-day deadline), advanced (`maxKeysReached`), delete-account-modal (×2 error), fresh-start-modal (error), login-sections (`LoginErrorMessage`), goal-detail-drawer (`loadError`), referral-drawer (error), create-api-key-modal (`keyCreatedWarning`), push-prompt (`retryHint`).
- **Mobile** (`tokens.statusOverdue` → `tokens.statusOverdueText`): goal-card (`progressTextColor` + deadline), advanced, login, goal-detail-drawer/styles, referral-drawer, create-api-key-modal, push-prompt — the exact twins.

Crucially, web goal-card **separates `textColor` from `color`**: the progress-ring fill keeps base `var(--status-overdue)`, only the `%` TEXT uses `var(--status-overdue-text)`. Mobile mirrors (`progressColor` for the ring, `progressTextColor` for the `%`). Correct semantic — `-text` is the readable-on-canvas variant, base stays the fill.

Token defs confirmed present (not dangling refs): `--status-overdue-text` at `globals.css:197` (light `#fe9a00`) / `:242` (dark `#b45b00`); mobile `statusOverdueText` via `theme.ts:208,245` (`status.overdueText`).

## accent literals — still ZERO in production source

Grep `#7f46f7` / `127, 70, 247` across `apps/mobile/**/*.{ts,tsx}`: all 10 hits are in `__tests__/` (theme fixtures + tag-color test data). ZERO in mobile `app/`+`components/` production code. r6 introduced none. Web's only canonical violet hex remains the purple-scheme token def in `globals.css`.

## loading-bar transform — D9 compliant

The r6 loading-bar rewrite (`globals.css`) now animates `transform: translateX(-50%)` → `translateX(50%)` on a 200%-wide `::after` pseudo — transform-only, the D9 "animate transform/opacity only" rule. The old `background-position` keyframe is gone. Compliant.

## r6 motion (reduced-motion gating) — D9 compliant

skeleton pulse = `opacity` (gated off on reduced-motion); habit-row CheckCircle pop = `scale`/`transform` (gated off on reduced-motion). Both transform/opacity-only. `transition-all` remains ZERO repo-wide. Em-dash-free copy held (no i18n copy changed in r6).

## Verdict

**ZERO FINDINGS.** The r6 amber→`-text` migrations are pure token swaps (web `--status-overdue-text`, mobile `tokens.statusOverdueText`) with no accent literals; web/mobile goal-card correctly separate the `%`-text `-text` token from the base ring-fill `color`. Token defs exist on both platforms. The loading-bar now animates `transform: translateX` (D9-compliant); reduced-motion gating is opacity/scale-only. Accent literals remain ZERO in production source. Net: round-5 ZERO → round-6 ZERO.
