# #539 — user-found visual defects (Thomas, live QA 2026-07-18)

Every item here was found by a human looking at pixels, after all lint gates were green.
Fix each at its ROOT CAUSE, land the mobile mirror, then verify by rendering the surface.

| # | surface | defect | file | root cause (missing token / one-off impl / conceptual misalignment) |
|---|---------|--------|------|--------------------------------------------------------------------|
| 1 | command palette + "Buscar hábitos" | double focus border (ring on wrapper AND on `<input>`); input overflows its container horizontally | shared input primitive | one-off implementation |
| 2 | ~17 pages incl. `/public-profile` | double page title — `AppBar` title AND page `<h1>` render the same string | app shell / AppBar contract | conceptual misalignment |
| 3 | `/calendar` | entirely default-styled: grid, Mês/Semana/Intervalo/Agenda tabs, and "Este mês" stat tiles whose labels ("Melhor sequência", "Total de registros") wrap and misalign | `app/(app)/calendar/**`, `components/calendar/**` | never touched — needs real redesign |
| 4 | create-habit modal → checklist | `MODELOS:` label rendered inline as a peer of the template chips, optically misaligned against the 36px pill; row mixes `gap-3`/`gap-2`; inconsistent with the "Checklist" label above it | `components/habits/checklist-templates.tsx:85-95` | one-off impl (`components/ui/section-label.tsx` exists, unused) + conceptual misalignment (group label belongs above its group) |
| 5 | generic `confirm-dialog` / edit-name | `Salvar` pill stretches full-bleed on desktop instead of hugging | `components/ui/confirm-dialog.tsx` | one-off implementation (DESIGN.md L258 + L455) |
| 6 | habit list depth-2 | 3rd tier renders LEFT of the 2nd — leaf reserves no chevron column | habit-list tree indentation | one-off implementation |
| 7 | Astra chat — tool-operation result card | ugly raw dump: purple monospace-ish list `BulkUpdateHabitEmojis: Updated emojis for 185 habit(s): Clean Guitars 📚, ... and 173 more` — no card hierarchy, operation name shown as a raw PascalCase symbol | `apps/web/components/chat/pending-operation-card.tsx`, `apps/web/components/chat/message-bubble.tsx` (+ mobile mirror) | one-off implementation (default-styled, in G11-chat scope) |
| 8 | Astra chat — operation summary text | rendered in **English even when the app is pt-BR** ("Updated emojis for 185 habit(s)", "and 173 more", raw tool name). NOT covered by the taste pass — this is an i18n defect; confirm whether the string is client-formatted (localize in `pending-operation-card.tsx`) or server-returned from orbit-api (localize at source / return a key) | `apps/web/components/chat/pending-operation-card.tsx` + possibly orbit-api operation-summary | conceptual misalignment (untranslated load-bearing string) |
| 9 | habit-list empty state (Today/All/General, both platforms) | the stacked "Ask Astra" (primary, filled) / "Create manually" (secondary, ghost) CTA pair reads as visually mismatched — PARTIALLY FIXED 2026-07-19 (commit `3fc0b598`): shortened `habits.createManually` to "Create"/"Criar" per DESIGN.md's over-wordy-button rule, verified 24/24 tests pass. Live pixel measurement confirmed BOTH pills share identical height/padding/font (`BUTTON_SIZES.md`) — the "not standardized" read is purely `PillButton`'s hug-to-content width responding to unequal label length. The wordiness half is fixed; the width-mismatch half is NOT — shortening "Create manually"→"Create" flipped the gap direction (was ~49px too-wide, now ~60px too-narrow) rather than closing it, because `PillButton` is contractually hug-only (DESIGN.md: never hand-tune per call). Closing the width gap for real needs either a sanctioned width-matching exception added to the design system (a Thomas decision per the product-and-content standing rule, not a unilateral one) or accepting the residual gap as within taste tolerance — OPEN, needs Thomas's call | `apps/web/components/habits/habit-list/empty-state.tsx`, `apps/web/components/ui/pill-button.tsx`, `packages/shared/src/i18n/{en,pt-BR}.json` (`habits.askAstra`/`habits.createManually`) | conceptual misalignment (two CTAs of different visual weight/length stacked with no width-matching convention) — copy fixed, geometry question open |

Note (2026-07-18): rows 7-8 were filed AFTER the in-flight taste workflow started, so its agents will not see them — handle in the follow-up pass. The bulk-cap correctness bug behind row 8's "185 of thousands" is orbit-api #420 (separate from the i18n rendering fix here).
Note (2026-07-19): row 9 filed after Thomas's live QA of the General view mid-run; the copy half landed same-session, the geometry half is open pending a design-system decision — see row 9 itself.

## Row 10-12: app-wide button-wordiness audit (2026-07-19)

Thomas asked for every button's size/character-count standardized after row 9. A read-only audit of
all `PillButton` usage across web+mobile found the app is largely already compliant (no ad-hoc/raw
buttons bypassing `PillButton`, no size-for-weight inconsistencies) — only 3 remaining wordiness
violations, all belonging to bundles still in the live drive queue at audit time. Fix each as part of
that bundle's own pass, not as a separate sweep:

| # | surface | defect | file | root cause |
|---|---------|--------|------|-------------|
| 10 | onboarding wizard — save-plan step | CTA `onboarding.saveYourPlan.cta` = "Create account & save"/"Criar conta e salvar" (4 words both locales) — over the 1-2 word rule | `apps/web/app/(app)/layout.tsx` (onboarding wizard) | conceptual misalignment (button restates what the step title already says) — belongs to `chat-onboarding-auth` bundle scope |
| 11 | onboarding wizard — import step | CTA `onboarding.wizard.importButton` = "Import with Astra"/"Importar com a Astra" (3-4 words) | `apps/web/app/(app)/layout.tsx` (onboarding wizard) | same as row 10 — belongs to `chat-onboarding-auth` bundle scope |
| 12 | trial-expired modal | CTA `trial.expired.continueFree` = "Continue with Free"/"Continuar no plano grátis" (3-4 words) | `apps/web/components/ui/trial-expired-modal.tsx:65` | one-off wordiness — already named in the `overlays-misc` bundle's explicit scope ("trial-expired") |

Two more violations from the same audit (`challenges.empty.create` "Create a challenge"/"Criar um
desafio", `challenges.empty.join` "Join with a code"/"Entrar com um código" — both in
`apps/web/app/(app)/social/challenges/_components/challenge-list.tsx:34-38`) belong to the ALREADY-
MERGED `social` bundle, so they were fixed directly instead of filed here — see git log for the
follow-up commit.

## Standing lesson

All six passed every gate. The gates are subtractive (`no-decorative-glow`, `no-raw-gradient`,
`no-arbitrary-zindex`) so they prove banned things are ABSENT and say nothing about whether a
surface is good. Green gates never close a taste task — only a rendered artifact does.
