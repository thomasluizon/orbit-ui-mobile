# Redesign questions

**At a glance: no open questions.** Record only decisions that still guide implementation.

## Decision bar

Ask the owner only when `design/canvas/`, `DESIGN.md` and the current contract leave a product decision unresolved. Implementation choices follow those sources.

## Settled decisions

- **Pushed page header, ticket 856:** Pushed pages use the start-aligned sentence-case page header drawn in Busca, Sobre, Pro, Assinatura and Avisos. Object views keep NavHeader. Undrawn pushed pages follow their neighbouring pushed pages.
- **Current navigation position, ticket 856:** Busca keeps the destination the person came from; a direct load selects Hoje. Upgrade selects Perfil.
- **Compact search entry, ticket 856:** Hoje adds an icon-only search button at the end of its date row. Destination roots render no shell title bar. The sidebar search control remains the wide entry.
- **Progresso gap repair, ticket 329:** Use optional `RepairableGapDates` for one atomic `POST /api/gamification/streak/repair-gap` action. When absent or null, use the server-owned single-day `RepairDate` offer.
- **Habit form picker motion, ticket 409:** Android keeps native TrueSheet motion. Web uses 220ms scale/fade entrance and 165ms exit. Both platforms keep `Sheet` ownership of dismissal. The installed TrueSheet interface exposes `animated?: boolean` and `initialDetentAnimated?: WithDefault<boolean, true>` but no duration, easing, scale or opacity input. Changing Android motion requires replacing the native sheet library.
- **Notification text contrast, ticket 459:** Body and metadata use `--fg-2` on both platforms. The target icon may retain `--fg-4` because it repeats the adjacent label. Keep the `primary` focus ring and its `fg1` contour. Android uses a solid 4px `fg1` border because inset shadows require API 29 or later; the app supports API 24. Verify focus, press and blur on API 24 to 28 in both themes.
- **Entrar lockout recovery, ORB-63:** After three failed attempts, verification locks for 15 minutes. A new code is required after the lock. The referral banner stays on both steps. The offline notice asks for reconnection and retry; no offline request queue exists.
- **Upgrade type roles, ticket 421:** The granted Pro drawing supplies `display-heading` at Space Grotesk 500, -0.02em, fg-1, 28px/1.18 compact and 34px/1.15 wide. It supplies `allowance` at Space Grotesk 600, -0.02em, fg-1, tabular, 34px/1.05 compact and 44px/1.02 wide. Keep the existing `sm` boundary at 40rem web and 640 logical pixels mobile.
- **Upgrade price loading, ticket 421:** Keep the drawing's three settings skeleton rows per tier. Reserve the measured loaded card height, including annual, monthly and coupon content, to prevent layout shift.
- **Review timing, D90:** Work proceeds without per-screen owner review. The whole redesign receives one owner review at the end.
- **Perfil Notificações rows, tickets 906, 917, 959 and 963:** The group renders the drawn product-email answer, the device row and the reminders note. The device row's "Este aparelho" line carries this device's push switch, the only place to turn push on or off for this device. The group adds one undrawn row: the "Análise de uso" switch, without a description. It has no persistent reminder row, because `DESIGN.md` lists that feature under `Surfaces that no longer exist`. On start, Android removes the old ongoing notification, its channel and its stored switch from a device that still carries them.
- **Generic error reassurance, ticket 338:** Generic boundaries cannot promise rollback. Both locales show the circumstance, retry, and sign-out-and-back-in instruction. Show a reference only when the API supplies a request ID.
