# Orbit brand assets

> **At a glance** - the real files behind the mark, the Astra glyph, the lockup and the three type
> families, extracted from `design/reference.html` for the Claude Design import. `SETUP.md` beside
> this file holds the five setup fields and the import checklist.

## The mark is a DRAFT

**This mark is not the final Orbit logo.** It exists for one reason: the accent decision needs a
surface that carries the accent, and the mark is that surface. Ticket `#79` owns the real mark, and
`#79` may replace every SVG in this directory.

Treat the geometry here as the current best draft, not as a locked asset. Do not build a store
listing, a press kit, or a favicon deploy on it.

## Provenance

Every path comes from `design/reference.html` on `redesign/main`, copied value for value. The page is
the authority over the prose in `DESIGN.md` (D42), so the page is what these files reproduce.

| geometry | source |
|---|---|
| mark, 24 grid | ellipse `cx 12 cy 12 rx 10.5 ry 6.5`, `rotate(-28)`, stroke 1.75, inside `translate(0,-0.5)`. Body circle `cx 17.14 cy 4.54 r 2.6` |
| mark, 16 native redraw | ellipse `cx 8 cy 8 rx 7 ry 4.9`, `rotate(-28)`, stroke 1.5. Body circle `cx 11.4 cy 3.1 r 2` |
| Astra glyph | ring `r 8.5` stroke 1.75, body `cx 18 cy 6.9 r 2.1`, core `r 2.4` |
| lockup | 28px mark, 12px gap, 22px wordmark, Space Grotesk 600, tracking `-0.02em` |

The ellipse aspect is `6.5 / 10.5 = 0.62`, which is the ratio `DESIGN.md` states. The 16 redraw sits
at `4.9 / 7 = 0.70`, because a flatter ellipse closes up at that size. That difference is the reason
`DESIGN.md` demands a native redraw at 16 rather than a scale.

## Colour

Each SVG carries a CSS custom property with a literal fallback, for example
`stroke="var(--fg-1, #F4F4F6)"`. A standalone viewer resolves the fallback, which is the dark value,
and dark is the primary mode. An inline copy inside the app resolves the live token instead, so light
mode works from the same file with no second asset.

The two icon files are the exception. `icon-512-*.svg` bakes literal hex, because a platform icon
sits on its own canvas and must never follow a page mode.

| token | dark | light |
|---|---|---|
| `--fg-1` | `#F4F4F6` | `#1A1A1D` |
| `--fg-2` | `#C9C9CC` | `#424247` |
| canvas | `#09090B` | `#FAFAFA` |
| accent, warm orange candidate | `#C4530F` | `#C4530F` |
| accent, rose candidate | `#BF4D8A` | `#BF4D8A` |

**The accent is not decided.** Thomas picks the exact byte on the Claude Design canvas. Both
candidates ship here so the decision has real assets on both sides.

## Files

### Vector

| file | what it is |
|---|---|
| `mark-24-neutral.svg` | treatment A. The whole mark in `--fg-1`. This is the monochrome lockup mark |
| `mark-24-orange.svg` | treatment B, warm orange body. Treatment B ships |
| `mark-24-rose.svg` | treatment B, rose body |
| `mark-16.svg` | the native 16 redraw. Monochrome, no accent, per `DESIGN.md` |
| `astra-24.svg` | the Astra glyph. It keeps a centre core, so it can never read as the Orbit mark |
| `lockup-horizontal-orange.svg` | mark plus wordmark, warm orange body |
| `lockup-horizontal-rose.svg` | mark plus wordmark, rose body |
| `lockup-horizontal-neutral.svg` | the monochrome lockup |
| `icon-512-orange.svg` | platform icon. Mark at 60% on the `#09090B` canvas, full bleed |
| `icon-512-rose.svg` | the same in rose |

The platform mask supplies the icon corner radius, so the icon files stay square. That mask is the one
radius outside the Orbit scale.

### Raster, in `png/`

| file | size | note |
|---|---|---|
| `orbit-mark-16.png` | 16 | from `mark-16.svg`, transparent |
| `orbit-mark-48-{orange,rose}.png` | 48 | transparent |
| `orbit-mark-128-{orange,rose}.png` | 128 | transparent |
| `orbit-mark-512-{orange,rose}.png` | 512 | transparent |
| `orbit-icon-512-{orange,rose}.png` | 512 | opaque `#09090B`, the store icon |
| `orbit-lockup-{orange,rose,neutral}.png` | 364x112 | the lockup at 4x, transparent |

### Type, in `fonts/`

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

## How to rebuild the PNG files

The PNG files derive from the SVG files with `sharp`, which the repo already installs. Each render is
vector native at its target size, so no step scales a raster.

```bash
node -e "
const sharp=require('sharp');const fs=require('fs');
const jobs=[
  ['mark-16.svg',16,'png/orbit-mark-16.png',16],
  ['mark-24-orange.svg',24,'png/orbit-mark-48-orange.png',48],
  ['mark-24-orange.svg',24,'png/orbit-mark-128-orange.png',128],
  ['mark-24-orange.svg',24,'png/orbit-mark-512-orange.png',512],
  ['mark-24-rose.svg',24,'png/orbit-mark-48-rose.png',48],
  ['mark-24-rose.svg',24,'png/orbit-mark-128-rose.png',128],
  ['mark-24-rose.svg',24,'png/orbit-mark-512-rose.png',512],
  ['icon-512-orange.svg',512,'png/orbit-icon-512-orange.png',512],
  ['icon-512-rose.svg',512,'png/orbit-icon-512-rose.png',512],
];
(async()=>{for(const [src,intrinsic,out,target] of jobs){
  const buf=fs.readFileSync('design/brand/'+src);
  await sharp(buf,{density:Math.round(72*target/intrinsic)}).png({compressionLevel:9}).toFile('design/brand/'+out);
  console.log(out);
}})();
"
```

The lockup PNG files need a real text render, because `sharp` does not load the Space Grotesk file.
Chrome does that job. Write one HTML page per variant that declares `@font-face` against
`fonts/SpaceGrotesk%5Bwght%5D.ttf`, inlines the lockup SVG markup, and then run:

```bash
chrome --headless --disable-gpu --hide-scrollbars --default-background-color=00000000 \
  --force-device-scale-factor=4 --window-size=91,28 --virtual-time-budget=6000 \
  --screenshot=orbit-lockup-orange.png file:///<the page>
```

An `<img src="...svg">` tag cannot see the page fonts, so the SVG markup must sit inline in the page.
