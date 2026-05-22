# Orbit Design System

## Identity

Orbit is a **Linear-tactical, phone-frame habit tracker**. Dark by default. OKLCH neutrals tinted toward the active brand hue. Single-accent restraint: one `--primary` per scheme, used for completion, focus, and the rare primary CTA — never for decoration. The canvas is a 412px-wide phone shell on both web and native; web is mobile-first inside `--app-max-w: 640px`.

Hierarchy is built from **weight, color, and hairlines** — not size jumps, not cards-in-cards, not gradients. Motion is short, eased out-quart, and only on `transform` + `opacity`.

## Anchor: Linear-tactical

Pick this anchor every session. Commit fully. Do not hybridise with Aurora, Brutalist, Organic, or any maximalism. The output should read as **dense, technical, quietly luxurious** — software-craft documentation, not a marketing page.

### Borrowed from Linear

- Surface ladder by **lift, not shadow** (`--bg-sunk` → `--bg` → `--bg-elev`).
- Text hierarchy through **four neutrals** (`--fg-1/2/3/4`), not size escalation.
- Monospace **eyebrows and metadata** (`t-eyebrow`, `t-meta`) on mono-tabular nums.
- **Hairline borders** (`--hairline`, `--hairline-strong`) carry structure; shadows stay subtle.
- **Single chromatic accent** reserved for primary action, completion, focus ring.
- Motion: ease-out-quart `cubic-bezier(0.16, 1, 0.3, 1)`, durations 120–280ms.
- No true black canvas; OKLCH `0.16 0.012 hue` reads as warm-cool near-black.

### Omitted from Linear (does not fit a phone shell)

- 1280→1024→768 desktop responsive ladder (we cap at 640).
- 3-up / 2-up card grids (we have a single column).
- 96px section separators (we use 24/32).
- Display-xl 80px headlines with -3.0px tracking (we top out at `--fs-3xl: 44px`).
- Multi-pane shells, sidebars, in-app marketing rails.
- Custom Linear Display/Text/Mono webfont (we ride Geist sans + Geist mono).
- Product-screenshot-as-protagonist composition (Orbit has no screenshots inside itself).

## Tokens (canonical, defined in `apps/web/app/globals.css`)

### Surfaces & neutrals (per-scheme, OKLCH)

```css
/* dark */
--bg:              oklch(0.16 0.012 var(--hue));
--bg-elev:         oklch(0.20 0.014 var(--hue));
--bg-sunk:         oklch(0.13 0.010 var(--hue));
--hairline:        oklch(0.27 0.014 var(--hue));
--hairline-strong: oklch(0.34 0.016 var(--hue));
--fg-1:            oklch(0.965 0.014 var(--hue));
--fg-2:            oklch(0.74  0.014 var(--hue));
--fg-3:            oklch(0.58  0.014 var(--hue));
--fg-4:            oklch(0.42  0.012 var(--hue));
--fg-on-primary:   oklch(0.99 0 0);

/* light — same structure, ramps inverted */
--bg:              oklch(0.985 var(--chroma-bg) var(--hue));
--bg-elev:         oklch(0.995 var(--chroma-bg) var(--hue));
--bg-sunk:         oklch(0.965 var(--chroma-bg) var(--hue));
--hairline:        oklch(0.905 calc(var(--chroma-bg) * 1.4) var(--hue));
--hairline-strong: oklch(0.84  calc(var(--chroma-bg) * 1.6) var(--hue));
```

### Accent (scheme-driven)

`--primary`, `--primary-pressed` — switches on `.scheme-purple|blue|green|rose|orange|cyan` × `.dark|.light`. Default scheme: purple dark, `#8b5cf6`.

### Status

```css
--status-done:    var(--primary);
--status-empty:   oklch(0.42 0.012 var(--hue));   /* neutral, not red */
--status-skip:    oklch(0.58 0.014 var(--hue));   /* neutral, not amber */
--status-overdue: oklch(0.74 0.10 60);
--status-bad:     oklch(0.65 0.12 20);
--status-frozen:  oklch(0.72 0.07 235);
```

### Type scale (size + the semantic classes that own it)

`--fs-xs 12` `--fs-sm 14` `--fs-base 16` `--fs-md 18` `--fs-lg 22` `--fs-xl 28` `--fs-2xl 34` `--fs-3xl 44` `--fs-4xl 60`. Tracking: `-0.02em` tight, `0.04em` wide, `0.12em` widest. Weights 300–700.

Use the classes, not raw sizes: `.t-eyebrow .t-display .t-hero .t-h1 .t-h2 .t-row .t-body .t-secondary .t-meta .t-num .t-num-xl`. Hierarchy comes from `--fg-1/2/3` swapping and weight shifts, not from jumping two scale steps.

### Motion & hit targets

`--ease-standard: cubic-bezier(0.2,0,0,1)` · `--dur-base: 220ms` · `--hit-min: 44px` · `--hit-comfortable: 56px`.

## Canonical primitives

Web in `apps/web/components/`, mobile parallels in `apps/mobile/components/`. Same name, same props, same behavior.

| Primitive | Purpose |
|---|---|
| **AppBar** | 52px compact header: back/leading icon, title + optional mono subtitle, trailing cluster, optional hairline. |
| **SectionLabel** | Flush-left 13px/600 `--fg-3` label with optional trailing slot. Groups list rows. |
| **HabitRow** | Single-line tappable row: name, optional meta, trailing StatusDot or ring. The list atom. |
| **StatusDot** | 8–10px dot keyed to `--status-*`. Communicates done/empty/skip/overdue/bad/frozen without text. |
| **ParentRing** | Compact concentric arc for parent habits with sub-progress. Outer ring `--hairline-strong`, fill `--primary`. |
| **Chip** | Hairline-ringed text chip, 26px tall. Active = `--bg-elev` fill + `--fg-3` ring. Used for filters/tags. |
| **SettingsRow** | Label + value/control + optional chevron. Hairline-bottom. The settings atom. |
| **InfoRow** | Two-line read-only key/value row for metadata panels. |
| **PullQuote** | Mono eyebrow + large `t-display` body. Used in chat and empty states. |
| **ConfirmDialog** | Modal sheet: title, body, hairline-bordered cancel + `--primary`-text confirm. No red fill. |
| **RingMotif** | The Orbit mark: concentric arcs animated on completion. Used for celebration moments only. |

## Bans (project-specific)

- No `--color-background`, `bg-surface-*`, `bg-card`, `border-border` — those alias to v8 tokens but new code uses the v8 vars directly (`--bg`, `--bg-elev`, `--hairline`).
- No semantic amber/red fill buttons for warnings or destructive actions. Use a hairline-bordered button with `--primary` (or `--status-bad`) text.
- No `transition-all`. Animate `transform` and `opacity` only, named explicitly.
- No `h-screen`. Use `min-h-dvh` so mobile chrome doesn't clip.
- No card-on-card nesting. One elevated surface per row.
- No colored side-stripe borders (left-bar accents). Status reads from StatusDot / ParentRing.
- No gradient text. No glassmorphism by default — the only sanctioned blur surfaces are `.nav-glass`, `.chat-glass`, and `.habit-actions-menu`.
- No em dashes in copy. Use a comma, period, or hyphen.
- No Inter, no default Tailwind indigo/blue. Geist sans + Geist mono only.
- No emojis in code, copy, or alt text.

## Working model (from `impeccable`)

1. **Context** — state the screen's job in one sentence. Who, what density, what mood.
2. **Anchor** — already chosen: **Linear-tactical**. Do not re-pick.
3. **Differentiator** — name the one memorable move for this screen (e.g., "monospace streak counter that ticks", "ring fills on log"). One sentence. Visible in the build.
4. **System** — use the v8 tokens above. No new colors, no new font families, no new radii.
5. **Implementation** — outline structure, then build. Then run the two tests below.

### AI-slop test

Before shipping, scan for the tells: Inter for everything, purple-to-blue gradients, cards-in-cards, gray text on colored backgrounds, rounded-square icon tiles above headings, semantic-red destructive buttons, oversized centered H1, decorative gradient borders. If you find any, delete them.

### Scene-sentence test

Describe the rendered screen in one sentence as if narrating a film scene. If the sentence reads like every other SaaS app ("a clean modern dashboard with cards"), the design is generic — rework until the sentence specifically names Orbit's tactical-monospace character.
