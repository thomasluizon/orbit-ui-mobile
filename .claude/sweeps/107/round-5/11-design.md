# Round-5 sweep #11 — Design-system compliance (issue #107) — FINAL VERIFICATION

Baseline: ui-mobile `3520d10` (committed green). Read-only. Round 3 was already ZERO FINDINGS; this pass re-confirms D9 motion / status-text tokens / accent literals / em dashes held through the r4 splits, and validates the NEW `--fg-on-bad` token introduced by the r4 a11y work (commit c8f4292).

## NEW `--fg-on-bad` token — correct, symmetric

Introduced for the destructive-confirm pill (status-bad fill needs an AA foreground):
- **Web** — `apps/web/app/globals.css:199` (light `#020618`) / `:244` (dark `#ffffff`); consumed ONLY at `apps/web/components/ui/confirm-dialog.tsx:241` `color: destructive ? 'var(--fg-on-bad)' : 'var(--fg-on-primary)'`.
- **Mobile** — defined in `packages/shared/src/theme/neutral-ramp.ts:218` (light `#020618`) / `:226` (dark `#ffffff`), surfaced via `apps/mobile/lib/theme.ts:210,247`, consumed ONLY at `apps/mobile/components/ui/confirm-dialog.tsx:269` `confirmLabelDestructive: { color: tokens.fgOnBad }`.

Same values both platforms, applied as the FOREGROUND label on the `status-bad`/`statusBad` destructive button (readable text on the red pill) — semantically correct, not misapplied as a background. The only other references are the byte-exact `theme.test.ts` fixtures (mobile + shared) — expected per derivation rule 4 / calibration register, not findings.

## Re-confirmed clean (held through r4 splits)

- **D9 motion (transform/opacity only)** — `transition-all` ZERO repo-wide. The new r4 split files (`chat/chat-composer-bar.tsx`, calendar-sync) carry ZERO layout-property (`width`/`height`/`top`/`left`) animations; their `transition-[…]` name only `background-color`/`box-shadow`/`transform`/`opacity`/`color`. The round-3 motion-rewrite batch (onboarding/tour `scaleX`, collapsible instant-container, refetch `scaleY`) is undisturbed.
- **Accent literals** — the only `#7f46f7` / `127, 70, 247` in web `app/`+`components/` are the canonical purple-scheme token defs in `globals.css:136,138,153`. ZERO in mobile `app/`+`components/` production code. (Mobile `lightColor` resolves through the shared theme token, fixed in round 3.)
- **Status-text tokens** — still consumed across components (`status-overdue-text`, `status-bad` text consumers in calendar/chat). No reversion to base-token-as-text.
- **Em dashes in copy** — ZERO `—` (U+2014) across `packages/shared/src/i18n/en.json` + `pt-BR.json`. The r4 additions (`goals.dragItem`, `offline.*`) introduced none.

## Verdict

**ZERO FINDINGS.** The new `--fg-on-bad`/`fgOnBad` token is defined with matching values on both platforms and applied correctly as the destructive-confirm foreground. D9 motion (transform-only), status-text token usage, accent-literal absence, and em-dash-free copy all held through the r4 chat/calendar splits. Net: round-3 ZERO → round-5 ZERO.
