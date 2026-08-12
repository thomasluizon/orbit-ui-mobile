---
paths:
  - "packages/shared/src/i18n/*.json"
  - "apps/web/app/globals.css"
  - "packages/shared/src/theme/**/*.ts"
  - "../orbit-landing-page/src/**/*"
---

# Standing product & content constraints

**At a glance:** 7 standing rules for i18n copy, the landing page, JSON-LD, the design system, and any subtraction pass. Judgement-bound; none is gate-checkable. See `README.md` for the tier's contract.

`DESIGN.md` is authoritative for all UI and wins over anything here. These are the constraints that sit alongside it and that no gate can see.

The landing is a live SEO surface and Vercel Analytics keys off its slugs, anchor ids, nav labels, and form field names. `core.md` rule 4 (always loaded) governs changing them.

## The design system

### 1. Expanding the system is a request, not a judgement call
When a change seems to need a token, colour, gradient, radius, shadow, font, or effect **the design system does not have** — stop and ask before adding it. Name three things:

1. the **exact addition**,
2. the **role** it would play,
3. **why the current system cannot do the job**.

If approved, **update the system in the same change as the implementation**.

`DESIGN.md` bans new colours/fonts/radii but gives no escalation path, so the ban is either obeyed or silently broken. This turns a ban into a protocol — which is exactly what a frozen design needs.

### 2. Classify every deviation's root cause before fixing it
Three causes, three different fixes:

| cause | what it means | the fix |
|---|---|---|
| **missing token** | the value should exist but doesn't | patch the token |
| **one-off implementation** | a shared component exists but wasn't used | swap to the shared component |
| **conceptual misalignment** | the flow/IA doesn't match its neighbours | rework the flow |

**Fixing the symptom without naming the cause is how drift compounds.** Orbit has a token system, a primitives kit, and a `design-reviewer`, but no stated method for classifying drift — so drift gets patched per-callsite, forever.

### 3. Removing the last route to a capability is a defect, not simplification
When a restraint pass removes an element or an option: **record why it was removed**, and **confirm the capability still has an access point**.

Nothing else protects against a subtraction pass silently orphaning a feature. **Directly load-bearing for #539**, which is a restraint pass. Distinct from `FEATURES.md`, which maps what exists rather than what a pass removed.

## Copy & i18n

### 4. One term per concept, everywhere, in both locales
Delete — not Delete/Remove/Trash. Settings — not Settings/Preferences/Options. **Keep a glossary; never vary for variety.**

Cross-cutting standing rule for `en.json` + `pt-BR.json`, audited by the i18n dimension of `.claude/skills/pr-review/rubric.md`.

### 5. Keep interpolated numbers out of sentence structure
`"New messages: {count}"` over `"You have {count} new messages"`. And **keep a full sentence as one string** — never concatenated fragments.

pt-BR word order differs from en, so a concatenated fragment is unlocalizable by construction. Not covered by the existing key-parity rule, which only checks that keys exist in both files.

### 6. Never hand-build plurals or formats
Plurals go through **the i18n library's plural rules** — never string concatenation. Dates, numbers, and currency go through **`Intl`** — never manual formatting.

pt-BR pluralization and number/date formats (`1.000` vs `1,000`) diverge from en. next-intl and i18next both handle this correctly and the repo had no standing rule saying to use them.

## Anti-fabrication

### 7. Never invent structured data; verify cards against a deployed URL
**Never invent ratings, reviews, prices, or organization details in JSON-LD.** Only add a structured-data block that maps to content **actually rendered on the page**. Verify a social card against a **real deployed URL, never localhost** — scrapers cannot reach localhost, so a local check proves nothing.

Sharply relevant right now: **Orbit's public rating starts at ZERO on launch day**, so any `aggregateRating` in the landing's JSON-LD would be fabricated. The landing also renders price copy that must match the real R$14,90 / R$99,90 table.

