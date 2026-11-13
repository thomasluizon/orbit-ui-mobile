# Orbit brand assets

> **At a glance** - the Orbit mascot, its five state faces and the three type families.

## The mascot

Orbit is one mark: a filled planet with two vertical pill eyes, one orbital ring and one moon. The mascot is an SVG rig drawn for Orbit. Mood shows through the eyes only, and Orbit never shows a sad face.

| file | what it is |
|---|---|
| `orbit-mascot.svg` | the rig at rest, in the Parado face. The box is `-210 -150 420 300`, the planet has radius 100 and each eye is 22 by 56. At a drawn width of 48 an eye is 2.51px wide |
| `orbit-mascot-feliz.svg` | the Feliz face: two upward arcs |
| `orbit-mascot-pensando.svg` | the Pensando face: pills, raised |
| `orbit-mascot-descansando.svg` | the Descansando face: two closed lines |
| `orbit-mascot-small.svg` | the small static face for 16, 20 and 24. It is a new drawing on the pixel grid, not a scaled rig. The symbols `small-16` and `small-20` hold the native 16 and 20 drawings, and the root holds the 24 drawing |
| `orbit-lockup.svg` | the horizontal lockup: the small static face as a 28 mark, a 12 gap and a 22 wordmark, 89.3959 by 17.7428 |

Olhando has no file. It is the Parado face with the eyes moved.

The planet and the ring paint with `currentColor`. The moon paints with `var(--primary, currentColor)`, so a viewer that defines no `--primary` still draws the whole mark. The eyes paint with `var(--bg, #09090B)`, and the ring outline paints with `var(--orbit-surface, var(--bg, #09090B))`, so a viewer with no tokens still shows the face. No file carries a background rectangle.

**Set `color` on whatever renders the mascot.** `DESIGN.md` puts the planet and the ring in `--fg-1`, so a component renders the file with `color: var(--fg-1)`. A standalone viewer that sets no `color` falls back to the browser default, which is black on white.

**Inline these files. Never load one through an image primitive.** `currentColor` and the custom properties resolve against the render tree the SVG participates in. An `<img src>`, a CSS `background-image` or a React Native `<Image source>` puts the file in its own document, where the surrounding `color` does not reach it. A surface that needs a flat file takes a baked raster instead.

**There is no 24 grid variant of the rig.** The live mascot renders at 48, 96 and 128 and never below 40, because each eye needs at least 2px. From 16 to 24 the mark is the small static face. Export sizes stay 16, 48, 128 and 512.

**The accent tints exactly one element.** `DESIGN.md` gives the accent four roles and this is the fourth: the moon carries it and nothing else does. A second tinted element is a violation, not a variation.

**The pixel-grid inputs of the raster pipeline.** `orbit-mark.svg`, `orbit-mark-16.svg` and `orbit-mark-accent.svg` are the old hollow-ring sources. They stay in this folder only as the inputs of `tools/generate-brand-assets.mjs` until the raster pipeline reads the mascot sources, and no in-app surface draws them.

**The lockup's 28 measures the MARK, not a 28 box.** `DESIGN.md:269` says so explicitly. The 1024
art carries wide empty margin, so a literal 28 box draws ink about 8px tall beside a 15.4px cap
height and the word swamps the mark. Sized on the ink it stands 15.04px and the pair reads as one
lockup.

**The lockup's 12 separates ink from ink**, not bounding boxes. The wordmark's `O` carries a left
side bearing, so placing the text origin 12 from the mark would have left a 13.15 visual gap.

**The lockup's viewBox IS its ink**, 89.3959 by 17.7428, with no baked margin. Clear space is the
consumer's to add. A logo file that carries its own padding cannot be aligned to anything.

Both numbers are solved from the curve extrema, not measured off a render. A pixel measurement
rounds to the render grid and can clip the `O`'s overshoot at 24.292.

**`tools/check-lockup-crop.mjs` holds this.** It parses the committed file, re-solves the bounds and
fails if any edge is off by more than 1e-6. It runs in `guards.yml` and on pre-commit. The gate reads
the shipped bytes so rounded generator values cannot hide a clipped edge. Run that check when
regenerating the lockup; a raster cannot prove the bounds are correct.

**The lockup's wordmark is outlined**, so it renders identically without Space Grotesk installed and
carries no `<text>`. It cannot be restyled, re-tracked or re-set; a different wordmark size is a new
asset, not a CSS override.

## Raster exports, in `png/`

`node tools/generate-brand-assets.mjs --write` rebuilds these files together with every consumer
asset. The transparent 16px export uses the native redraw and stays monochrome. The larger
transparent marks use the granted 1024 canvas and preserve the accent moon. The platform icon puts
the accent mark at 60% on the flat `#09090B` canvas and leaves its corners square for the platform
mask.

| file | contract |
|---|---|
| `orbit-mark-native-16.png` | 16px native redraw, monochrome `--fg-1`, transparent |
| `orbit-mark-accent-48.png` | 48px granted mark, accent moon, transparent |
| `orbit-mark-accent-128.png` | 128px granted mark, accent moon, transparent |
| `orbit-mark-accent-512.png` | 512px granted mark, accent moon, transparent |
| `orbit-platform-icon-512.png` | 512px square platform icon on `#09090B` |

## Manual upload exports, in `exports/`

These files use the same platform icon composition and are regenerated with the rest of the set.
They are committed so the console updates do not depend on a local render at upload time.

| file | target surface |
|---|---|
| `oauth-consent-logo-512.png` | Google Auth Platform Branding page app logo |
| `play-icon-512.png` | Google Play Console store listing app icon |

The Play feature graphic remains at `apps/mobile/store/feature-graphic.png` because it is a mobile
store asset rather than a reusable brand export.

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

Use the TTF files here for anything that renders new copy, and keep pt-BR in mind.
