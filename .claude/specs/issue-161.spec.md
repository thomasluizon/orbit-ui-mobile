---
issue: 161
repo: thomasluizon/orbit-ui-mobile
title: "Play listing: replace personal address + Gmail with LTDA address + contact@useorbit.org"
status: blocked
next-action: "/drive 161"
---

# Drive spec — #161: Play listing identity swap

**BLOCKED — external dependency (D-U-N-S, delegated to the accountant). No code in any repo.**

The issue says it outright: "This is an **ops-only** issue — no code in either repo… the user
executes it in the Play Console and the Google payments profile."

## Why /drive cannot do this
Zero code. Every step is a Play Console / Google payments-profile dashboard action requiring
the account holder's authenticated session and identity documents. No CLI or MCP path.

## State (from the 2026-07-03 comments)
**Done:**
- Public contact email → `contact@useorbit.org`: mailbox live (#314 closed), swap proceeding.

**Ruled out:**
- Linking the LTDA payments profile to a personal developer account (Play does not allow it).
- Editing the personal profile's verified address self-serve (locked behind a request form +
  proof-of-address that does not exist for a company address under a personal name).

**Decided path — in-place account type change (pessoal → organização):** same developer
account ID, no app transfer, so the Play Billing infra (service account, RTDN Pub/Sub, GCP
linkage) is untouched. This supersedes the issue body's original new-account+transfer framing.

## Blocking chain (owner: user + accountant)
1. **D-U-N-S for TL SOFTWARE ENGINEERING LTDA** — delegated to the accountant, free, ~1-2 weeks.
   Data must match the cartão CNPJ exactly. **This is the long pole (~2026-08-05).**
2. On arrival — Play Console → Conta de desenvolvedor → "Mudança do tipo de conta" (~30 min:
   D-U-N-S + LTDA payments profile [verified ✓] + `contact@useorbit.org` [live ✓] + phone).
   NOT during an active release rollout, not during launch week.
3. Google org review: days to ~2 weeks; app stays live throughout (in-place).
4. After approval: verify the listing shows TL SOFTWARE ENGINEERING LTDA + Av. Nova
   Independência 651 (personal name AND home address both gone — better than the interim
   address-only fix); smoke-check one purchase verification + one RTDN delivery.

## Launch interaction
Launch is **not hard-blocked**. If launching before this completes, the current listing (home
address) is what launch traffic sees — prefer completing this first if the date allows ~3 weeks.

## Decisions
- 2026-07-16 — init: marked `blocked`. Not drivable — waiting on the accountant's D-U-N-S.

## Reconcile log
- 2026-07-16 — init. Ops-only, no code, no PR possible. Blocked on the D-U-N-S external dependency.
