#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import sharp from "sharp"
import pngToIco from "png-to-ico"

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
  // Canonical brand exports. The native 16 drawing stays monochrome; the larger marks preserve the
  // 1024 source canvas and the identity's accent moon. These are source assets for consumers that
  // do not own a platform-specific canvas contract.
  { path: "design/brand/png/orbit-mark-native-16.png", width: 16, height: 16, ink: FOREGROUND, nativeMark: true },
  { path: "design/brand/png/orbit-mark-accent-48.png", width: 48, height: 48, ink: FOREGROUND, accent: true, sourceCanvas: true },
  { path: "design/brand/png/orbit-mark-accent-128.png", width: 128, height: 128, ink: FOREGROUND, accent: true, sourceCanvas: true },
  { path: "design/brand/png/orbit-mark-accent-512.png", width: 512, height: 512, ink: FOREGROUND, accent: true, sourceCanvas: true },
  { path: "design/brand/png/orbit-platform-icon-512.png", width: 512, height: 512, ink: FOREGROUND, background: CANVAS, scale: 0.6, accent: true },
  // Console upload exports keep the same platform icon composition. OAuth gets a 24-bit opaque
  // PNG; Play requires a 32-bit PNG, so its alpha channel stays present with every pixel opaque.
  { path: "design/brand/exports/oauth-consent-logo-512.png", width: 512, height: 512, ink: FOREGROUND, background: CANVAS, scale: 0.6, accent: true, opaque: true },
  { path: "design/brand/exports/play-icon-512.png", width: 512, height: 512, ink: FOREGROUND, background: CANVAS, scale: 0.6, accent: true },
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
  // Browser tabs render against uncontrolled light and dark chrome. The canvas disc keeps the
  // hairline mark visible in both, while the native 16 redraw avoids downscaling the 1024 geometry.
  { path: "apps/web/public/favicon-16.png", width: 16, height: 16, ink: FOREGROUND, nativeMark: true, disc: true },
  { path: "apps/web/public/favicon-32.png", width: 32, height: 32, ink: FOREGROUND, scale: 0.68, accent: true, disc: true },
  { path: "apps/web/app/apple-icon.png", width: 180, height: 180, ink: FOREGROUND, background: CANVAS, scale: 0.6, accent: true },
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

function bakeAccentSource(source, ink, accent) {
  const bakedSource = source
    .replaceAll("var(--primary, currentColor)", accent)
    .replaceAll("currentColor", ink)

  if (bakedSource.includes("currentColor") || bakedSource.includes("var(")) {
    throw new Error("orbit-mark-accent.svg still carries an unresolved colour after baking")
  }

  return bakedSource
}

/** A canonical export keeps the complete source viewBox. The source's margins are part of the
 *  granted drawing; platform-specific assets use the trimmed scale path below instead. */
async function renderSourceCanvasMark(source, ink, accent, size) {
  const bakedSource = bakeAccentSource(source, ink, accent)
  return sharp(Buffer.from(bakedSource)).resize(size, size).png().toBuffer()
}

/** The accent treatment: body in `ink`, moon in the accent. Trimmed and resized like the monochrome
 *  path, but WITHOUT the flatten-every-pixel step, which is what would erase the moon.
 *
 *  The var() expression is substituted BEFORE `currentColor`, because it contains that literal as its
 *  own fallback and a naive replace would turn the moon back into the body colour. */
async function renderAccentMark(source, ink, accent, targetWidth) {
  const bakedSource = bakeAccentSource(source, ink, accent)

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
  const transparent = { r: 0, g: 0, b: 0, alpha: 0 }
  const background = asset.disc ? transparent : asset.background ?? transparent
  const canvas = sharp({
    create: {
      width: asset.width,
      height: asset.height,
      channels: 4,
      background,
    },
  })
  const backgroundLayers = asset.disc
    ? [{
        input: Buffer.from(
          `<svg width="${asset.width}" height="${asset.height}" viewBox="0 0 ${asset.width} ${asset.height}"><circle cx="${asset.width / 2}" cy="${asset.height / 2}" r="${asset.width / 2}" fill="${CANVAS}"/></svg>`,
        ),
        left: 0,
        top: 0,
      }]
    : []

  if (!asset.ink) {
    return canvas.png({ compressionLevel: 9 }).toBuffer()
  }

  if (asset.nativeMark) {
    const mark = await renderNativeMark(source, asset.ink, asset.width)
    return canvas
      .composite([...backgroundLayers, { input: mark, left: 0, top: 0 }])
      .png({ compressionLevel: 9 })
      .toBuffer()
  }

  if (asset.sourceCanvas) {
    const mark = await renderSourceCanvasMark(source, asset.ink, ACCENT, asset.width)
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

  const composed = canvas.composite([...backgroundLayers, { input: mark, left, top }])
  if (asset.opaque) composed.removeAlpha()

  return composed
    .png({ compressionLevel: 9 })
    .toBuffer()
}

const faviconLayerAssets = [
  generatedAssets.find(({ path }) => path === "apps/web/public/favicon-16.png"),
  generatedAssets.find(({ path }) => path === "apps/web/public/favicon-32.png"),
  { width: 48, height: 48, ink: FOREGROUND, scale: 0.68, accent: true, disc: true },
]

if (faviconLayerAssets.some((asset) => !asset)) {
  throw new Error("favicon PNG assets must exist before the ICO layers are assembled")
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

  const renderedAssets = new Map()
  for (const asset of generatedAssets) {
    const outputPath = join(repositoryRoot, ...asset.path.split("/"))
    await mkdir(dirname(outputPath), { recursive: true })
    const renderedAsset = await renderAsset(sources, asset)
    renderedAssets.set(asset.path, renderedAsset)
    await writeFile(outputPath, renderedAsset)
  }

  const faviconLayers = await Promise.all(
    faviconLayerAssets.map((asset) =>
      asset.path ? renderedAssets.get(asset.path) : renderAsset(sources, asset),
    ),
  )
  const faviconPath = join(repositoryRoot, "apps", "web", "app", "favicon.ico")
  await mkdir(dirname(faviconPath), { recursive: true })
  await writeFile(faviconPath, await pngToIco(faviconLayers))

  console.log(
    `generated ${generatedAssets.length + 1} brand assets from design/brand/orbit-mark.svg, orbit-mark-accent.svg and orbit-mark-16.svg`,
  )
}

main().catch((error) => {
  console.error(`generate-brand-assets: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
