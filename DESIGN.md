# Orbit Design System

Source of truth: the vendored handoff at `design/handoff/` (see its README for the canon table). This document is the distilled, authoritative spec. The token values live in `design/handoff/orbit/project/orbit-fig.css`; the primitive dimensions in `orbit-kit.jsx`; the screen compositions in the artboards of `Orbit App - Figma.html`.

**Authority note:** this DESIGN.md is authoritative over any generic or user-global design defaults — including the global anti-Inter and anti-violet rules. The handoff adopts Inter for display type and a violet accent deliberately; that deviation is documented here once and applies repo-wide. Deliberate emoji use (habit emojis, stat tiles, streak flame, celebrations) is part of the language and overrides the global anti-emoji rule for UI surfaces where the artboards show them.

## Identity & anchor (locked)

Orbit is a **navy-violet orbital habit tracker**. Dark slate-950 canvas primary, violet-500 accent, violet-950→transparent gradient headers, translucent slate cards on dark / opaque white cards on light, pill CTAs with glow, rounded geometry (8/12/16/20/999), Rubik/Inter/Roboto type, deliberate emoji.

The anchor is locked per session. Do not re-pick, do not hybridise. The output should read as **calm, spacious, quietly cosmic** — a personal orbit, not a SaaS dashboard.

## Tokens

Canonical CSS lives in `apps/web/app/globals.css`; the mobile equivalent is `createTokensV2` in `apps/mobile/lib/theme.ts`; shared ramp data in `packages/shared/src/theme/`.

### Type

- Families: `--font-sans` **Rubik** (UI), `--font-display` **Inter** (hero, big numerals), `--font-mono` **Roboto** (meta + tabular numerals — the "mono" role; intentionally NOT a true monospace; use `font-variant-numeric: tabular-nums` / RN `fontVariant: ['tabular-nums']`).
- Weights loaded: Rubik 400/500/600/700 · Inter 500/600/700 · Roboto 400/500/700. Weight scale is deliberately squashed: regular=400, medium/semibold=500, bold=600.
- Scale: `--fs-xs 12 / sm 14 / base 16 / md 18 / lg 22 / xl 28 / 2xl 34 / 3xl 44 / 4xl 60`. Line-heights: tight 1.15 / snug 1.3 / body 1.55 / loose 1.7. Tracking: tight −0.01em / wide 0.06em / widest 0.12em.

### Dark mode (the handoff's primary theme — purple-scheme values, byte-exact targets)

```
--bg            rgb(2,6,24)               /* slate-950 canvas */
--bg-elev       rgba(248,250,252,0.06)    /* THE translucent card */
--bg-elev-2     rgba(248,250,252,0.10)
--bg-sunk       rgba(0,0,0,0.28)          /* fields, wells */
--hairline      rgba(248,250,252,0.10)
--hairline-strong rgba(248,250,252,0.18)
--fg-1 rgb(248,250,252)  --fg-2 rgb(202,213,226)  --fg-3 rgb(144,161,185)  --fg-4 rgb(98,116,142)
--fg-on-primary rgb(255,255,255)
--status-done var(--primary) · empty rgba(248,250,252,0.22) · skip rgb(144,161,185)
--status-overdue rgb(254,154,0) · bad rgb(251,44,54) · frozen rgb(0,211,243)
--selection-bg rgba(var(--primary-rgb),0.32)
--gradient-header linear-gradient(180deg, rgb(34,9,79) 0%, rgba(2,6,24,0) 100%)   /* violet-950 → transparent */
```

### Light mode (MANDATORY — ships with every surface, all 6 schemes)

```
--bg rgb(248,250,252) · --bg-elev rgb(255,255,255) (opaque white cards) · --bg-elev-2 rgb(255,255,255) · --bg-sunk rgb(241,245,249)
--hairline rgba(2,6,24,0.08) · --hairline-strong rgba(2,6,24,0.16)
--fg-1 rgb(15,23,43) · --fg-2 rgb(49,65,88) · --fg-3 rgb(98,116,142) · --fg-4 rgb(144,161,185)
--status-empty rgba(2,6,24,0.18) · skip rgb(98,116,142) · overdue rgb(225,113,0) · bad rgb(231,0,11) · frozen rgb(0,146,184)
--selection-bg rgba(var(--primary-rgb),0.18)
--gradient-header linear-gradient(180deg, rgb(233,212,255) 0%, rgba(248,250,252,0) 100%)
```

### Per-scheme accents (exact)

| Scheme | dark primary / pressed | light primary / pressed |
|---|---|---|
| purple | rgb(127,70,247) / rgb(99,29,242) | rgb(99,29,242) / rgb(81,15,211) |
| blue | rgb(43,127,255) / rgb(21,93,252) | rgb(21,93,252) / rgb(20,71,230) |
| green | rgb(0,201,80) / rgb(0,166,62) | rgb(0,166,62) / rgb(0,130,54) |
| rose | rgb(255,32,86) / rgb(236,0,63) | rgb(236,0,63) / rgb(199,0,54) |
| orange | rgb(255,105,0) / rgb(245,73,0) | rgb(245,73,0) / rgb(202,53,0) |
| cyan | rgb(0,184,219) / rgb(0,146,184) | rgb(0,146,184) / rgb(0,117,149) |

### Shape, shadow, motion, icons

- Radii: 8 / 12 / 16 / 20, pill 999. Cards 16–18, emoji wells 12–14, fields 14, sheets **26 top radius**, CTAs pill.
- Shadows: hairline `0 0 0 0.5px rgba(248,250,252,0.06)`, sh-1 `0 1px 2px rgba(0,0,0,.20)`, sh-2 `0 4px 16px rgba(0,0,0,.28)`, sh-3 `0 12px 40px rgba(0,0,0,.45)`. Primary glow `0 8px 28px rgba(var(--primary-rgb),0.45)`.
- Motion: `--ease-standard cubic-bezier(0.2,0,0,1)`, `--ease-out cubic-bezier(0.16,1,0.3,1)`, durations 160/220/280. Transform+opacity only. Presets stay in `packages/shared/src/theme/motion.ts`.
- Icons: Lucide (`lucide-react` web, `lucide-react-native` mobile), strokeWidth **1.8** default, **2.2** active/emphasis, size 22 default.
- Hit targets: 44 min / 56 comfortable.

### Derivation rules — per-scheme neutral tinting

The handoff hardcodes one navy canvas. We keep the existing *behavior*: each scheme tints the neutral ramp; dark/light/system per scheme; 12 variants total.

1. **Alpha tokens are scheme-independent constants** — `--bg-elev`, `--bg-elev-2`, `--bg-sunk`, both hairlines, `--status-empty` are white-alpha (dark) / ink-alpha (light) and inherit tint optically from the canvas beneath. They are identical across all 6 schemes. This is the handoff's own mechanism — preserve it.
2. **Opaque neutrals re-derive per scheme via OKLCH**: convert each handoff neutral (`--bg`, `--fg-1..4` dark; `--bg`, `--bg-sunk`, `--fg-1..4` light) to OKLCH; **lock L and C per token** (the ramp shape, shared by all schemes); hue varies per scheme.
3. **Per-scheme neutral hue**: purple = the slate hue extracted from rgb(2,6,24) — exactly (computed to 4 decimal places so 8-bit RGB round-trips byte-identical). Other 5 schemes: `neutralHue(s) = accentHue(s) + Δ` where `Δ = slateHue − violetAccentHue`, then hand-tuned per scheme so each looks intentional (clamp chroma in the 50–170° hue band to avoid murk). Every hand-tune is one documented line below.
4. **Acceptance (testable)**: `createTokensV2('purple','dark')` and the web `.scheme-purple.dark` CSS resolve to exactly `#020618` bg, `#F8FAFC` fg-1, `#CAD5E2` fg-2, `#90A1B9` fg-3, `#62748E` fg-4. Light purple: `#F8FAFC` bg, white cards, `#0F172B` fg-1. A shared unit test asserts this.
5. **Status colors**: overdue/bad/frozen are fixed (not scheme-tinted) per mode, from the spec above. `--status-done = var(--primary)`.
6. **Gradient header per scheme**: dark = accent-hue at violet-950's OKLCH L/C → transparent canvas; light = accent-hue at rgb(233,212,255)'s L/C → transparent canvas. Purple must equal the handoff literals exactly.
7. **Primary-derived tints** (the kit uses the accent at α = 0.08/0.10/0.12/0.15/0.18/0.28/0.45-glow): web exposes `--primary-rgb` per scheme×mode; mobile gets `tintFromPrimary(tokens, alpha)` in `lib/theme.ts`. Never hardcode violet rgba in components.
8. **Raw-slate mapping rule** (the kit was authored dark-first with raw `--slate-*` refs): when porting, translate `--slate-200/300→fg-2`, `--slate-400→fg-3`, `--slate-500/600→fg-4`, `rgba(248,250,252,α)→surface/hairline tokens`, literal `#fff` on primary→`fg-on-primary`. **Never copy a raw slate var into app code** — this is what makes light mode and non-purple schemes work.

Hand-tune log (rule 3):

- **Ramp hue drift (all schemes):** the handoff slate ramp is not iso-hue; each neutral token carries its handoff hue offset relative to the canvas hue (fg-1 −17.27° → bg 0°), preserved across schemes so purple stays byte-exact.
- **green:** Δ-derived hue 121.74° sat in the 50–170° murk band (olive); nudged to 140 with chroma ×0.6 on both groups → cool sage instead of khaki.
- **orange:** Δ-derived hue 18.36° read rose-tinted; nudged to 32 (warm brown-black canvas).
- **blue / cyan:** canvas chroma gamut-clamped at the locked L (scaleBg 0.6226 / 0.5167); cyan fg ramp also clamped (scaleFg 0.843). Values are the sRGB gamut ceiling ×0.985 so web CSS and the TS pipeline resolve identical bytes.
- **Light gradient stops:** purple keeps the handoff's +21.71° lilac rotation from the accent hue (byte-exact `#e9d4ff`); the rotation misreads on rose (peach) and cyan (periwinkle), so all non-purple schemes use their light accent hue directly at the locked L/C, chroma gamut-clamped.

## Type roles

Use the semantic classes (web `.t-*`) / shared role data (`packages/shared/src/theme/type-roles.ts`), not raw sizes.

| Role | Family | Size/Weight | Extras | Color |
|---|---|---|---|---|
| eyebrow | Rubik | 12/500 | +0.08em, UPPERCASE | fg-3 |
| display | Rubik | 34/500 | tight tracking, lh 1.15 | fg-1 |
| hero | Inter | 60/700 | −0.02em, lh 1.15 | fg-1 |
| h1 | Rubik | 28/500 | tight, lh 1.3 | fg-1 |
| h2 | Rubik | 22/500 | −0.01em, lh 1.3 | fg-1 |
| row | Rubik | 18/400 | lh 1.3 | fg-1 |
| body | Rubik | 16/400 | lh 1.55 | fg-1 |
| secondary | Rubik | 14/400 | lh 1.55 | fg-2 |
| meta | Roboto | 12/400 | +0.02em, tabular | fg-3 |
| num | Roboto | —/500 | tabular | fg-1 |
| num-xl | Inter | 44/700 | −0.02em, lh 1, tabular | fg-1 |

## Primitives kit

Exact dimensions in `design/handoff/orbit/project/orbit-kit.jsx`. Web in `apps/web/components/`, mobile mirror in `apps/mobile/components/` — same name, same props, same behavior.

| Primitive | Key specs | Web | Mobile |
|---|---|---|---|
| NavHeader | 56px, centered UPPERCASE Rubik 13/500 +0.09em title, back chevron 26/2.0, right slot help (40px circled, inset 1.5px hairline-strong ring) / close / share | `ui/app-bar.tsx` | `ui/app-bar.tsx` |
| GradientTop | absolute 260–300px `--gradient-header` backdrop, zIndex 0 | `ui/gradient-top.tsx` | `ui/gradient-top.tsx` |
| SectionTitle | Rubik 20/500 −0.01em, 24/14 padding | `ui/section-label.tsx` | `ui/section-label.tsx` |
| ListRow | 16/20 padding, icon 22/1.8 in 26px slot, title Rubik 18/400, desc 14 fg-3, trailing + chevron 22 fg-4, optional divider, danger=status-bad | `ui/settings-row.tsx` | `ui/settings-row.tsx` |
| Switch | 48×28 pill, 22px white thumb, on=primary / off=rgba(fg,0.16) | inside settings-row | inside settings-row |
| Radio/RadioRow | 24px, selected=primary fill + 9px white dot, else inset 2px fg-4 ring | `ui/select-check.tsx` | `ui/select-check.tsx` |
| Badge | pill 3/9px, 10.5/600 +0.06em UPPERCASE; tones violet/soft/outline/amber | `ui/badge.tsx` (+ pro-badge) | same |
| Pill / WhitePill / GhostPill | pill CTA: primary bg + glow, 15/26 padding, Rubik 16/500; white: fg-1 bg + canvas text; ghost: inset 1.5px hairline-strong | `ui/pill-button.tsx` | `ui/pill-button.tsx` |
| StatTile | radius 18, rgba(fg,0.05) + inset hairline ring, emoji 28, value Inter 24/700, label 15 fg-2 | `ui/stat-tile.tsx` | same |
| PlanCard | radius 18, selected = primary 0.10 tint + inset 1.5px primary ring; price Inter 22/700 | `upgrade/plan-card.tsx` | same |
| InfoCard | radius 18, primary 0.08 tint bg + inset ring primary 0.28, icon 24/1.9 accent | `ui/info-card.tsx` | same |
| Field | min-height 54, radius 14, rgba(fg,0.05) fill + inset hairline, label 14/500 fg-2 | `ui/field-input.tsx` | `ui/app-text-input.tsx` |
| OTP | 6 boxes 48×58, radius 14, filled well, active inset 2px primary, Roboto 26/500 | `ui/code-input.tsx` | `ui/code-input.tsx` |
| Sheet | backdrop rgba(0,0,0,0.55), panel 26px top radius, grabber 44×5 hairline-strong, title Rubik 24/500 | `ui/app-overlay.tsx` | `bottom-sheet-modal.tsx` |
| TabBar + FAB | top hairline, opaque canvas bg, icon 24 (active primary 2.2 / inactive fg-4 1.8), label 11; FAB 60px primary circle, ring 0 0 0 6px var(--bg) + glow | `navigation/bottom-tab-bar.tsx` | `navigation/bottom-tab-bar.tsx` |
| Satellite | 96px empty-state glyph, fg-4 strokes + primary arc | `ui/satellite-glyph.tsx` | same (react-native-svg) |
| VerifiedBadge | scalloped check, primary 0.15 disc | `ui/verified-badge.tsx` | same |
| ProgressBar | 8px pill track rgba(fg,0.08), primary fill | `ui/progress-bar.tsx` | same |
| HabitCard | radius 18 translucent card 0.04 + inset hairline, 46px emoji well radius 14 fill 0.06, name Rubik 16/500, meta 13 fg-3 + streak flame, trailing 30px check circle | `habits/habit-row.tsx` | `habits/habit-row.tsx` |

## Surface rules

- Translucency ladder on dark: 0.04 card / 0.05 field / 0.06 well / 0.10 elev-2 (white-alpha over canvas).
- Opaque white cards on light — never translucent.
- Inset 1px hairline rings instead of borders (web `box-shadow: inset 0 0 0 1px var(--hairline)`; RN border with the same color reads equivalently).
- No opaque card-on-card on dark; surfaces stack by alpha, not by lighter hexes.
- Gradient-header usage: profile, paywall, auth, onboarding, celebrations, Início.

## Status, emoji, icons

- done = primary · overdue = amber · bad/danger = red · frozen = cyan · skip/empty = neutral (exact values in the token spec).
- Emoji deliberately, where the artboards show them: habit emoji wells, stat tiles, streak flame, celebration heroes. Never as decoration elsewhere.
- Lucide 22px, strokeWidth 1.8 (2.2 active/emphasis).

## Motion

Unchanged philosophy: transform + opacity only, durations 160/220/280, `--ease-standard` for state changes, `--ease-out` for entrances. Presets in `packages/shared/src/theme/motion.ts`. Respect `prefers-reduced-motion`.

## Bans

- No raw `--slate-*` references in app code — semantic tokens only (the raw-slate mapping rule above).
- No hardcoded violet rgba — tints come from `--primary-rgb` / `tintFromPrimary`.
- No opaque card-on-card on dark.
- No borders-as-borders where the kit uses inset rings.
- No `transition-all`. Animate `transform` and `opacity` only, named explicitly.
- No `h-screen`. Use `min-h-dvh`.
- No new font families, radii, or colors outside this spec. The old Vercel sans/mono families are gone — Rubik/Inter/Roboto only.
- No per-component scheme branches — schemes resolve through tokens only.
- No em dashes in copy. Use a comma, period, or hyphen.

## Working model (from `impeccable`)

1. **Context** — state the screen's job in one sentence. Who, what density, what mood.
2. **Anchor** — already chosen and locked: **navy-violet orbital**. Do not re-pick.
3. **Differentiator** — name the one memorable move for this screen (e.g., "the day's progress is a violet pill that fills like an orbit completing"). One sentence. Visible in the build.
4. **System** — use the tokens above. No new colors, no new font families, no new radii.
5. **Implementation** — outline structure, then build. Then run the two tests below.

### AI-slop test

Before shipping, scan for the tells: gradients used as decoration outside the sanctioned gradient-header, cards-in-cards, gray text on colored backgrounds, rounded-square icon tiles above headings, semantic-red destructive fills where the artboard shows a text pill, oversized centered H1 outside hero contexts, decorative gradient borders. If you find any, delete them.

### Scene-sentence test

Describe the rendered screen in one sentence as if narrating a film scene. If the sentence reads like every other SaaS app ("a clean modern dashboard with cards"), the design is generic — rework until the sentence specifically names Orbit's navy-cosmic, violet-glow character.
