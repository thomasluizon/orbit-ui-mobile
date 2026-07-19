---
issue: 387
repo: thomasluizon/orbit-ui-mobile
title: "Tighten DMARC to quarantine then reject after 2-4 weeks of clean rua reports"
status: blocked
next-action: "/drive 387"
---

# Drive spec — #387: DMARC staged tightening

**BLOCKED — deliberate observation window, not a code gate. No code in any repo.**

Blocked reason: the issue's own staged plan holds `p=none` until **~2026-07-25** (≈3 weeks
clean). Today is 2026-07-16 — **9 days early**. Advancing now would violate the issue's
explicit rule: "Do not advance a stage until the current stage's reports are clean — a
premature ratchet silently drops or spam-files legitimate mail."

## Why /drive cannot do this
Zero code. Each ratchet is a one-line TXT edit to `_dmarc.useorbit.org` at **Spaceship**
(the DNS host) — a dashboard action with no CLI/MCP path available in this session. The
stage-2 gate is the passage of the observation window plus a fresh `rua` re-pull.

## State (from the 2026-07-15 status comment)
Stage 1 (`p=none`) is **clean**. Published: `v=DMARC1; p=none; rua=mailto:contact@useorbit.org`.

| Stream | DNS (DKIM + SPF) | Proven in reports |
|---|---|---|
| `send.` (Resend transactional) | both ✅ | **5/5 pass**, aligned (relaxed) |
| `updates.` (Resend broadcast) | both ✅ | no data — zero broadcast volume yet |
| root (Google Workspace `contact@`) | both ✅ | no data — no reported external sends yet |

## Remaining stages (owner: user, in the Spaceship DNS dashboard)
1. **~2026-07-25** — re-pull `rua`, confirm still clean, ratchet to `p=quarantine`
   (`v=DMARC1; p=quarantine; rua=mailto:contact@useorbit.org`). Low risk: the only stream with
   real volume is proven-aligned on both mechanisms, and quarantine is recoverable.
2. **`p=reject`** — gated on the first real `updates.` broadcast AND some `contact@` outbound
   both appearing clean in reports (launch-tied, likely August+). Irreversible; it earns the wait.

## What I CAN do, unblocked
Re-pull and parse the Google aggregate `rua` reports on/after 2026-07-25 and hand you the
verdict + the exact TXT value to paste. Offer at the gate: schedule that as a reminder?

## Decisions
- 2026-07-16 — init: marked `blocked`. Not drivable before 2026-07-25 by the issue's own gate.

## Reconcile log
- 2026-07-16 — init. Ops-only, no code, no PR possible. Blocked on the observation window (9 days out).
