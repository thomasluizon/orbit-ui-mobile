# Upgrade/Paywall Redesign — design brief (PR 6, task #7)

Research-backed. Anchor: navy-violet orbital per DESIGN.md (semantic tokens only, ONE filled CTA, no countdowns/urgency).

## Core insight (fixes the repetition + the yearly-only-feature problem)
- **Chooser = 3 plan cards** (Free · **Pro-Yearly hero, center** · Pro-Monthly).
- **Matrix = only 2 columns (Free vs Pro), placed BELOW the cards.** Monthly & yearly are the same Pro product minus one perk → the matrix never forks into near-identical columns (that *is* the current repetition).
- Cards demote to **3–4 differentiators + price + CTA**; yearly card says **"Everything in Pro Monthly, plus AI Retrospective."** Matrix is the single exhaustive list.

## Data-model change (also fixes the retrospective bug)
`packages/shared/src/utils/upgrade.ts` — the matrix cell currently has `freeEnabled/proEnabled` booleans and retrospective is hacked `proEnabled:false`. Add a **third Pro state**: `pro: 'yearly' | true | false`. Render `'yearly'` as `✓` + a small inline **`Yearly`** pill. Shrink `upgrade.plans.proFeatures` to ~3–4 marquee keys; `trial.expired` points at the same source (no third copy).

## Post-#186 entitlement matrix (reflect the free-tier rebalance — the screen is built on #186)
| Feature | Free | Pro |
|---|---|---|
| Habits | 10 | Unlimited |
| Sub-habits, Goals | ✗ | ✓ |
| AI messages | 20/mo | 500/mo |
| AI memory, Daily summary, Slip alerts, API keys | ✗ | ✓ |
| Current/longest streak, XP/Level, Streak-freeze | **✓ (free, per #186)** | ✓ |
| Achievements & XP system | ✗ | ✓ |
| **AI Retrospective** | ✗ | **✓ `Yearly`** |
| Themes/colors, Calendar, Ad-free | 1 theme | all |
Mark availability **positively** (checks for what you get); **value-text for quantities** ("10"/"Unlimited"/"500/mo"); **"Not included"** text not a bare dash (a11y); grouped categories (Habits / AI / Insights / Personalization) + sticky header row.

## Web layout (~640px cap)
Gradient header (existing GradientTop) → ONE promise line (said once) → 3 cards: Free ($0, muted, outline "Stay free") · **Yearly center, raised+glow, violet badge "Save X%", filled glow pill CTA, per-month price + "billed $XX/yr · Save $Z a year"** · Monthly (right, outline, higher per-month = price anchor). Per-month price on ALL three (ascending $0→$X→$Y). Then "Compare every feature" → the 2-col matrix. Price in Inter (num), billing line Roboto (meta), else Rubik.

## Trial framing (convert-not-start — trial is a backend signup grant; stores charge immediately)
The paywall is a CONVERT surface, not trial-start. State-aware CTA:
- Trial active → "Pro Trial · N days left", loss-aversion ("Keep your Pro features"), CTA **"Subscribe to keep Pro"**, "Cancel anytime."
- Expired/free → "Your Pro trial ended…", CTA **"Upgrade to Pro."**
- The "no card was ever taken · you dropped to Free automatically" line is a genuine trust differentiator — state it plainly.
- Reassurance microcopy directly UNDER the CTA (not footer). First-person CTA ("…my…").
- Discount: per-month-billed-annually as the big number + **"Save $Z a year"** (dollar > %); keep the "Save %" badge; use **"2 months free"** if the real discount is ~15–20%. Real discount only (no phantom monthly).

## Mobile (~412px) — stack, don't shrink
Header → **stacked full-width selectable cards** (Yearly hero pre-selected on top + "Save X%", Monthly below, Free as a quiet "Stay on Free" link) → 3–5 marquee differentiators (icon list, not a checkmark wall) → **"Compare all features" accordion** hiding the full matrix → **single sticky bottom glow-pill CTA** echoing the selected plan's price+terms → "No card · Cancel anytime" under it.

## Forks decided (per "no more questions" — confirm later if wanted)
1. Column order: **center-stage Yearly** (Free·Yearly·Monthly).
2. Discount copy: **per-month + "Save $Z/year"** (+ "2 months free" if ~15–20%).
3. Trial surface: **convert-not-start**, in-app CTA "Subscribe to keep Pro".

## Files (from the inventory)
shared: `utils/upgrade.ts` (the cell-state model + shrink proFeatures), i18n both locales. web: `app/(app)/upgrade/page.tsx`, `components/upgrade/{pricing-section,plan-selection,plan-comparison-cards}.tsx`. mobile: `app/upgrade.tsx` + `components/upgrade/*`. Verify whether phase-4 (#186) touched `upgrade.ts` before branching to avoid a merge conflict; set the matrix to the post-#186 split regardless.
