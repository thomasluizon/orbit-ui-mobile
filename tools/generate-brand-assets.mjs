#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import sharp from "sharp"

const USAGE = `usage: generate-brand-assets.mjs --write [--root <path>]

  Regenerates every Orbit platform raster from the three canonical sources under
  design/brand/: orbit-mark.svg carries the 1024 geometry, orbit-mark-accent.svg
  carries the accent moon every coloured raster needs, and orbit-mark-16.svg is
  the native redraw every raster below roughly 20px needs. All three are required.
  Existing generated files are replaced non-interactively.

  --write        write the complete generated asset set
  --root <path>  repository root (defaults to the parent of tools/)
  --help, -h     print this usage and exit 0

exit codes: 0 assets generated, 1 generation failed, 2 usage error`

const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

let requestedRoot
let write = false
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index]
  if (argument === "--write") {
    write = true
  } else if (argument === "--root") {
    requestedRoot = args[index + 1]
    if (!requestedRoot) {
      console.error("generate-brand-assets: --root needs a path")
      process.exit(2)
    }
    index += 1
  } else {
    console.error(`generate-brand-assets: unknown argument: ${argument}`)
    process.exit(2)
  }
}

if (!write) {
  console.error("generate-brand-assets: --write is required")
  process.exit(2)
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(requestedRoot ?? join(scriptDirectory, ".."))
const markPath = join(repositoryRoot, "design", "brand", "orbit-mark.svg")
// DESIGN.md:267: "At 16 the mark is redrawn natively rather than scaled", because a stroke scaled
// down from the 24 grid renders soft. orbit-mark-16.svg is that redraw and carries its own geometry,
// so an asset marked `nativeMark` is rasterised at its designed size instead of being trimmed and
// rescaled from the 1024 source.
const mark16Path = join(repositoryRoot, "design", "brand", "orbit-mark-16.svg")
// DESIGN.md:261: "a surface takes the accent file and never tints the monochrome one itself". Every
// coloured raster of the mark comes from here, so the moon keeps the accent. The three that stay
// monochrome are named at their entries below, each for a reason the spec or the platform gives.
const markAccentPath = join(repositoryRoot, "design", "brand", "orbit-mark-accent.svg")

const CANVAS = "#09090B"
const FOREGROUND = "#F4F4F6"
const WHITE = "#FFFFFF"
// DESIGN.md:372. The mark carries this on exactly one element, its moon, and DESIGN.md:261 calls that
// the only non-state use of the accent in the whole system.
const ACCENT = "#C4530F"

const generatedAssets = [
  { path: "apps/mobile/assets/adaptive-icon-background.png", width: 1024, height: 1024, background: CANVAS },
  { path: "apps/mobile/assets/adaptive-icon-foreground.png", width: 1024, height: 1024, ink: FOREGROUND, scale: 0.6, accent: true },
  { path: "apps/mobile/assets/adaptive-icon-monochrome.png", width: 1024, height: 1024, ink: WHITE, scale: 0.6 },
  { path: "apps/mobile/assets/favicon.png", width: 64, height: 64, ink: FOREGROUND, background: CANVAS, scale: 0.6, accent: true },
  { path: "apps/mobile/assets/icon.png", width: 1024, height: 1024, ink: FOREGROUND, background: CANVAS, scale: 0.6, accent: true },
  { path: "apps/mobile/assets/logo-no-bg.png", width: 96, height: 96, ink: FOREGROUND, scale: 0.8, accent: true },
  // 96 because expo-notifications resizes this one input into every density bucket, and its largest
  // is xxxhdpi: BASELINE_PIXEL_SIZE 24 * scale 4 in
  // node_modules/expo-notifications/plugin/build/withNotificationsAndroid.js. A smaller source is
  // upscaled with resizeMode 'cover' and the silhouette softens on exactly the densest screens.
  { path: "apps/mobile/assets/notification-icon.png", width: 96, height: 96, ink: WHITE, scale: 0.8 },
  { path: "apps/mobile/assets/splash-icon.png", width: 1024, height: 1024, ink: FOREGROUND, scale: 0.4, accent: true },
  // Google Play accepts this listing asset as 24-bit RGB PNG but rejects an alpha channel, even
  // when every alpha value is opaque. Other canvases retain alpha because their platform contracts
  // need transparency or accept RGBA.
  { path: "apps/mobile/store/feature-graphic.png", width: 1024, height: 500, ink: FOREGROUND, background: CANVAS, scale: 0.36, accent: true, opaque: true },
  // app/icon.png is a Next.js App Router FILE CONVENTION, not an ordinary public asset. It is the
  // browser-tab icon Next serves for the app segment, so leaving it out of this list is how the old
  // mark survived every previous regeneration: it is the one icon that metadata.icons does not
  // reach. Same geometry as the public favicon, because it does the same job.
  { path: "apps/web/app/icon.png", width: 64, height: 64, ink: FOREGROUND, background: CANVAS, scale: 0.6, accent: true },
  // The browser tab draws a favicon at 16px. Downscaling the 64 into that slot is exactly the soft
  // stroke DESIGN.md:267 forbids, so this one comes from the native 16 redraw at its designed size.
  { path: "apps/web/public/favicon-16.png", width: 16, height: 16, ink: FOREGROUND, background: CANVAS, nativeMark: true },
  { path: "apps/web/public/favicon.png", width: 64, height: 64, ink: FOREGROUND, background: CANVAS, scale: 0.6, accent: true },
  { path: "apps/web/public/logo-no-bg.png", width: 96, height: 96, ink: FOREGROUND, scale: 0.8, accent: true },
  { path: "apps/web/public/og-image.png", width: 1200, height: 630, ink: FOREGROUND, background: CANVAS, scale: 0.36, accent: true },
  { path: "apps/web/public/pwa-192x192.png", width: 192, height: 192, ink: FOREGROUND, background: CANVAS, scale: 0.6, accent: true },
  { path: "apps/web/public/pwa-512x512.png", width: 512, height: 512, ink: FOREGROUND, background: CANVAS, scale: 0.6, accent: true },
]

function assertCanonicalSource(source, name) {
  if (!source.includes('fill="currentColor"')) {
    throw new Error(`${name} must paint with currentColor`)
  }
  if (/<(?:filter|image|linearGradient|radialGradient)\b/i.test(source)) {
    throw new Error(`${name} contains a banned raster or effect`)
  }
}

async function renderTrimmedMark(source, ink, targetWidth) {
  const bakedSource = source.replaceAll("currentColor", ink)
  const trimmed = await sharp(Buffer.from(bakedSource))
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  const { data: pixels, info } = await sharp(trimmed)
    .resize({ width: targetWidth, fit: "inside", withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const [red, green, blue] = ink
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16))
  for (let index = 0; index < pixels.length; index += info.channels) {
    pixels[index] = red
    pixels[index + 1] = green
    pixels[index + 2] = blue
  }

  return sharp(pixels, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer({ resolveWithObject: true })
}

/** The native redraw, rasterised at its designed size. No trim and no rescale: its margins are part
 *  of the drawing, and stripping them would put the geometry back on the scaled path this avoids. */
async function renderNativeMark(source, ink, size) {
  const bakedSource = source.replaceAll("currentColor", ink)
  return sharp(Buffer.from(bakedSource)).resize(size, size).png().toBuffer()
}

/** The accent treatment: body in `ink`, moon in the accent. Trimmed and resized like the monochrome
 *  path, but WITHOUT the flatten-every-pixel step, which is what would erase the moon.
 *
 *  The var() expression is substituted BEFORE `currentColor`, because it contains that literal as its
 *  own fallback and a naive replace would turn the moon back into the body colour. */
async function renderAccentMark(source, ink, accent, targetWidth) {
  const bakedSource = source
    .replaceAll("var(--primary, currentColor)", accent)
    .replaceAll("currentColor", ink)

  if (bakedSource.includes("currentColor") || bakedSource.includes("var(")) {
    throw new Error("orbit-mark-accent.svg still carries an unresolved colour after baking")
  }

  const trimmed = await sharp(Buffer.from(bakedSource))
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  return sharp(trimmed)
    .resize({ width: targetWidth, fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer({ resolveWithObject: true })
}

async function renderAsset(sources, asset) {
  const source = asset.nativeMark ? sources.mark16 : asset.accent ? sources.markAccent : sources.mark
  const background = asset.background ?? { r: 0, g: 0, b: 0, alpha: 0 }
  const canvas = sharp({
    create: {
      width: asset.width,
      height: asset.height,
      channels: 4,
      background,
    },
  })

  if (!asset.ink) {
    return canvas.png({ compressionLevel: 9 }).toBuffer()
  }

  if (asset.nativeMark) {
    const mark = await renderNativeMark(source, asset.ink, asset.width)
    return canvas
      .composite([{ input: mark, left: 0, top: 0 }])
      .png({ compressionLevel: 9 })
      .toBuffer()
  }

  const targetWidth = Math.round(asset.width * asset.scale)
  const { data: mark, info } = asset.accent
    ? await renderAccentMark(source, asset.ink, ACCENT, targetWidth)
    : await renderTrimmedMark(source, asset.ink, targetWidth)
  const left = Math.floor((asset.width - info.width) / 2)
  const top = Math.floor((asset.height - info.height) / 2)

  const composed = canvas.composite([{ input: mark, left, top }])
  if (asset.opaque) composed.removeAlpha()

  return composed
    .png({ compressionLevel: 9 })
    .toBuffer()
}

async function main() {
  const sources = {
    mark: await readFile(markPath, "utf8"),
    mark16: await readFile(mark16Path, "utf8"),
    markAccent: await readFile(markAccentPath, "utf8"),
  }
  assertCanonicalSource(sources.mark, "orbit-mark.svg")
  assertCanonicalSource(sources.mark16, "orbit-mark-16.svg")
  assertCanonicalSource(sources.markAccent, "orbit-mark-accent.svg")
  if (!sources.markAccent.includes("var(--primary, currentColor)")) {
    throw new Error("orbit-mark-accent.svg must carry the accent moon as var(--primary, currentColor)")
  }

  for (const asset of generatedAssets) {
    const outputPath = join(repositoryRoot, ...asset.path.split("/"))
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, await renderAsset(sources, asset))
  }

  console.log(
    `generated ${generatedAssets.length} brand assets from design/brand/orbit-mark.svg, orbit-mark-accent.svg and orbit-mark-16.svg`,
  )
}

main().catch((error) => {
  console.error(`generate-brand-assets: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
