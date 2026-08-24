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

## The variants, built by `#365`

| file | what it is |
|---|---|
| `orbit-mark-16.svg`, `astra-mark-16.svg` | the native 16 redraw. **Drawn at 16, not exported from 1024**, because a stroke scaled down from 1024 renders soft (`DESIGN.md:267`). Monochrome, no accent |
| `orbit-mark-accent.svg` | the accent treatment: the granted 1024 drawing with `var(--primary)` on the moon and `currentColor` everywhere else |
| `orbit-lockup.svg` | the horizontal lockup, 28 mark, 12 gap, 22 wordmark, 89.3955 by 17.8827 |

**There is no 24 grid variant, and there will not be one.** `#365` originally ordered one and this
list originally promised one. `DESIGN.md:267` overrules both: "Asset sizes are enumerated: 16, 48,
128, 512. The mark is neither type nor an icon, so it answers to neither the type scale nor the 24
icon grid." A mark sized to the Tabler grid is a mark being treated as an icon, which is the thing
that sentence exists to stop. Detail on `#365`.

**Pick by size, not by taste.** Below roughly 20px use the 16 pair; above that use the 1024
originals. The redraw is a simplification, so blowing a 16 up to 128 shows geometry that was chosen
to survive at 16 and nothing else.

**The accent tints exactly one element.** `DESIGN.md:261` gives the accent four roles and this is the
fourth: "The mark carries the accent on exactly one element, its moon." A second tinted element is a
violation, not a variation. The moon's fill falls back to `currentColor`, so a viewer or an upload
preview that defines no `--primary` still renders the whole mark rather than dropping the moon.

**The lockup's 28 measures the MARK, not a 28 box.** `DESIGN.md:269` says so explicitly. The 1024
art carries wide empty margin, so a literal 28 box draws ink about 8px tall beside a 15.4px cap
height and the word swamps the mark. Sized on the ink it stands 15.1px and the pair reads as one
lockup.

**The lockup's 12 separates ink from ink**, not bounding boxes. The wordmark's `O` carries a left
side bearing, so placing the text origin 12 from the mark would have left a 13.15 visual gap.

**The lockup's viewBox IS its ink**, 89.3955 by 17.8827, with no baked margin. Clear space is the
consumer's to add. A logo file that carries its own padding cannot be aligned to anything.

Both numbers are solved from the curve extrema, not measured off a render. A pixel measurement
rounds to the render grid: the first attempt cropped at 24.300 while the `O`'s overshoot reaches
24.292, and clipped 0.008 of it at every scale.

**The lockup's wordmark is outlined**, so it renders identically without Space Grotesk installed and
carries no `<text>`. It cannot be restyled, re-tracked or re-set; a different wordmark size is a new
asset, not a CSS override.

## Still to build

These are not done and nothing here should be treated as a complete asset set:

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
