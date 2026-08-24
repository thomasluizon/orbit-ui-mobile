# Orbit brand assets

> **At a glance** - the two real marks and the three type families. `SETUP.md` beside this file holds
> the Claude Design setup fields and the import checklist.

## The marks are FINAL

`orbit-mark.svg` and `astra-mark.svg` replace the draft assets that PR `#735` shipped. Those drafts
existed only to make the accent decidable and every one of them is deleted. Ticket `#79` owns the
mark, and these are its output.

| file | what it is |
|---|---|
| `orbit-mark.svg` | the Orbit mark. A planet drawn as a ring with an open centre, an orbital band crossing in front low and passing behind at the upper right, and a small solid moon above right |
| `astra-mark.svg` | the Astra glyph. A letter A carrying the same orbital band and the same solid dot |

**They are told apart by silhouette, not by a detail.** Orbit is a hollow ring; Astra is a solid
letterform. That distinction survives at 16px, which the old glyph's "circle with a core" did not.
It supersedes `DESIGN.md`'s "anything with a core is Astra, anything empty in the middle is Orbit",
which was written for the draft geometry.

Each file is one `fill-rule="evenodd"` path plus, on Orbit, the moon. Both paint with
`fill="currentColor"` and carry no hex at all, so one file serves every colour the mark is drawn
in: the `--fg-1` ink, white on an accent tile, and the warm orange itself. The consumer sets
`color`. Neither carries a background rectangle, so both are transparent. Neither carries C2PA
metadata.

**Set `color` on whatever renders the mark.** `DESIGN.md` puts the mark in `--fg-1` everywhere
except the accent treatment, so a component renders it with `color: var(--fg-1)`. A standalone
viewer that sets no `color` falls back to the browser default, which is black on white.

**Inline these files. Never load one through an image primitive.** `currentColor` resolves against
the render tree the SVG participates in, and an `<img src>`, a CSS `background-image` or a React
Native `<Image source>` puts the file in its own document, where the surrounding `color` does not
reach it and the mark renders black. That is why `DESIGN.md` states the rule as "one SVG, recoloured
per state ... strip any hardcoded `fill` on import": a mark that has to take `--fg-1`, white on an
accent tile, and the accent itself cannot be an external image. A surface that genuinely needs a
flat file takes a baked raster from `#80` instead, not one of these two.

## Provenance

Generated on Recraft with a paid Basic plan, so both carry full commercial rights and were generated
privately. Free tier output would have been Recraft owned, public and unlicensed, and could not have
shipped. This is D68's decision 10 pipeline, with one correction recorded below.

The Orbit mark needed one repair. Its source art carried a thin white crescent inside the planet, and
the fix merges that sliver into the planet's interior and emits a single hole boundary. Cutting it as
a second even-odd subpath does not work: overlapping holes XOR back to filled and the sliver returns
as a hairline.

**D68 names the wrong package.** Its pipeline calls for "the free `logo-generator` Claude skill",
but the package with that name requires a `GEMINI_API_KEY` and is not free. The zero cost native SVG
skill is `rknall/claude-skills@svg-logo-designer`. Neither was used in the end, because a diffusion
model cannot hold exact geometry and Recraft's native vector model can.

## Still to build

These are not done and nothing here should be treated as a complete asset set:

- the 24 grid viewBox variant, for the icon scale
- the accent treatment, the mark carrying `--primary` on the moon only
- the native 16px redraw, since a stroke scaled down from 1024 renders soft
- the horizontal lockup, 28px mark, 12px gap, 22px wordmark in Space Grotesk 600 at `-0.02em`
- the platform icon at 512 on the `#09090B` canvas
- the PNG set at 16, 48, 128 and 512

## Type, in `fonts/`

| file | family | version | axis |
|---|---|---|---|
| `Geist[wght].ttf` | Geist | 1.800 | `wght` 100 to 900 |
| `GeistMono[wght].ttf` | Geist Mono | 1.701 | `wght` 100 to 900 |
| `SpaceGrotesk[wght].ttf` | Space Grotesk | 2.000 | `wght` 300 to 700 |

All three come from `github.com/google/fonts`, the canonical OFL source. Each licence sits beside it
as `OFL-*.txt`. Orbit loads Geist Sans 400/500/600, Space Grotesk 500/600 and Geist Mono 400/500. No
other weight is legal.

**Two traps live in these files. Read both before you import them.**

1. The real family name of the sans is **`Geist`**, not `Geist Sans`. `Geist Sans` is the Orbit token
   name and exists only inside `@font-face` and `--font-sans`. A tool that matches on the family name
   needs `Geist`.
2. `SpaceGrotesk[wght].ttf` reports name ID 1 as **`Space Grotesk Light`** and defaults the `wght`
   axis to **300**. `DESIGN.md` bans weights below 300 and loads only 500 and 600, so any tool that
   takes the default instance renders the wrong weight. Set 500 or 600 by hand and check it.

The three `woff2` files inside `design/reference.html` are **subsets**, so they do not carry the whole
character set. Use the TTF files here for anything that renders new copy, and keep pt-BR in mind.
