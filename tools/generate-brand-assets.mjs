#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import sharp from "sharp"

const USAGE = `usage: generate-brand-assets.mjs --write [--root <path>]

  Regenerates every Orbit platform raster from the two canonical sources under
  design/brand/: orbit-mascot.svg carries the live rig (planet, ring, moon and the two eyes) and
  orbit-mascot-small.svg carries the small static face every raster below 40px needs. Both are
  required. Existing generated files are replaced non-interactively.

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
const mascotPath = join(repositoryRoot, "design", "brand", "orbit-mascot.svg")
// The small static face for 16, 20 and 24 px. Its two symbols are native pixel-grid drawings, and
// its root draws the 24 size. A raster below 40px uses it, because the rig eye is below 2px there.
const smallPath = join(repositoryRoot, "design", "brand", "orbit-mascot-small.svg")

const CANVAS = "#09090B"
const FOREGROUND = "#F4F4F6"
const WHITE = "#FFFFFF"
const BLACK = "#000000"
// DESIGN.md Identity: the moon carries this on exactly one element, and it is the only non-state use
// of the accent in the whole system.
const ACCENT = "#C4530F"

// The rig box is 420 by 300 units. Each eye is 22 units wide.
const RIG_BOX_WIDTH = 420
const RIG_BOX_HEIGHT = 300
const EYE_UNITS = 22
// A live eye narrower than this on screen reads as a dot, so the live face never renders below it.
const EYE_FLOOR_PIXELS = 2
// Rasterise the rig at about 3x its box before the trim and the downscale, so a large asset never
// upscales a 420 px render. The sharp density is dots per inch and 72 maps one unit to one pixel.
const RENDER_DENSITY = 384

// Android adaptive icon: the logo must not exceed the 66 dp inner safe zone of the 108 dp layer
// (developer.android.com/develop/ui/views/launch/icon_design_adaptive). The mark has to fit a circle
// of 66/108 of the canvas, and its widest ink is the ring end pair, 380 units across the circle.
const ADAPTIVE_SAFE_FRACTION = 66 / 108
const MARK_CIRCLE_UNITS = 380
// The web maskable icon keeps its content inside a circle of radius 40% of the width
// (web.dev/articles/maskable-icon).
const MASKABLE_SAFE_FRACTION = 0.8

const generatedAssets = [
  // Canonical brand exports. The 16 px export draws the small static face in one ink. The larger
  // exports draw the whole rig box with its accent moon, on transparency.
  { path: "design/brand/png/orbit-mark-native-16.png", width: 16, height: 16, ink: FOREGROUND, face: "small", smallSize: 16 },
  { path: "design/brand/png/orbit-mark-accent-48.png", width: 48, height: 48, ink: FOREGROUND, face: "rig", accent: true, sourceCanvas: true },
  { path: "design/brand/png/orbit-mark-accent-128.png", width: 128, height: 128, ink: FOREGROUND, face: "rig", accent: true, sourceCanvas: true },
  { path: "design/brand/png/orbit-mark-accent-512.png", width: 512, height: 512, ink: FOREGROUND, face: "rig", accent: true, sourceCanvas: true },
  { path: "design/brand/png/orbit-platform-icon-512.png", width: 512, height: 512, ink: FOREGROUND, background: CANVAS, scale: 0.7, face: "icon", accent: true },
  // Console upload exports keep the same platform icon composition. OAuth gets a 24-bit opaque
  // PNG; Play requires a 32-bit PNG, so its alpha channel stays present with every pixel opaque.
  { path: "design/brand/exports/oauth-consent-logo-512.png", width: 512, height: 512, ink: FOREGROUND, background: CANVAS, scale: 0.7, face: "icon", accent: true, opaque: true },
  { path: "design/brand/exports/play-icon-512.png", width: 512, height: 512, ink: FOREGROUND, background: CANVAS, scale: 0.7, face: "icon", accent: true },
  { path: "apps/mobile/assets/adaptive-icon-background.png", width: 1024, height: 1024, background: CANVAS },
  // The adaptive layers keep the ring and the moon inside the 66 dp safe circle.
  { path: "apps/mobile/assets/adaptive-icon-foreground.png", width: 1024, height: 1024, ink: FOREGROUND, scale: "adaptive", face: "icon", accent: true },
  // The monochrome layer and the notification icon are one white ink. The eyes and the ring gap are
  // holes in that ink.
  { path: "apps/mobile/assets/adaptive-icon-monochrome.png", width: 1024, height: 1024, ink: WHITE, scale: "adaptive", face: "icon", holes: true },
  { path: "apps/mobile/assets/favicon.png", width: 64, height: 64, ink: FOREGROUND, background: CANVAS, scale: 0.7, face: "rig", accent: true },
  { path: "apps/mobile/assets/icon.png", width: 1024, height: 1024, ink: FOREGROUND, background: CANVAS, scale: 0.7, face: "icon", accent: true },
  { path: "apps/mobile/assets/logo-no-bg.png", width: 96, height: 96, ink: FOREGROUND, scale: 0.8, face: "rig", accent: true },
  // 96 because expo-notifications resizes this one input into every density bucket, and its largest
  // is xxxhdpi: BASELINE_PIXEL_SIZE 24 * scale 4 in
  // node_modules/expo-notifications/plugin/build/withNotificationsAndroid.js. A smaller source is
  // upscaled with resizeMode 'cover' and the silhouette softens on exactly the densest screens.
  { path: "apps/mobile/assets/notification-icon.png", width: 96, height: 96, ink: WHITE, scale: 0.8, face: "rig", holes: true },
  { path: "apps/mobile/assets/splash-icon.png", width: 1024, height: 1024, ink: FOREGROUND, scale: 0.4, face: "rig", accent: true },
  // Google Play accepts this listing asset as 24-bit RGB PNG but rejects an alpha channel, even
  // when every alpha value is opaque. Other canvases retain alpha because their platform contracts
  // need transparency or accept RGBA.
  { path: "apps/mobile/store/feature-graphic.png", width: 1024, height: 500, ink: FOREGROUND, background: CANVAS, scale: 0.36, face: "rig", accent: true, opaque: true },
  // Browser tabs render against uncontrolled light and dark chrome. The canvas disc keeps the face
  // visible in both. Below 40px the face is the small static face.
  { path: "apps/web/public/favicon-16.png", width: 16, height: 16, ink: FOREGROUND, face: "small", smallSize: 16, disc: true },
  { path: "apps/web/public/favicon-32.png", width: 32, height: 32, ink: FOREGROUND, face: "small", smallSize: 24, accent: true, disc: true },
  { path: "apps/web/app/apple-icon.png", width: 180, height: 180, ink: FOREGROUND, background: CANVAS, scale: 0.7, face: "icon", accent: true },
  { path: "apps/web/public/logo-no-bg.png", width: 96, height: 96, ink: FOREGROUND, scale: 0.8, face: "rig", accent: true },
  { path: "apps/web/public/og-image.png", width: 1200, height: 630, ink: FOREGROUND, background: CANVAS, scale: 0.36, face: "rig", accent: true },
  { path: "apps/web/public/pwa-192x192.png", width: 192, height: 192, ink: FOREGROUND, background: CANVAS, scale: 0.7, face: "icon", accent: true },
  { path: "apps/web/public/pwa-512x512.png", width: 512, height: 512, ink: FOREGROUND, background: CANVAS, scale: 0.7, face: "icon", accent: true },
  // apps/web/__tests__/manifest.test.ts requires this maskable copy to equal the canonical platform
  // icon byte for byte, so it takes the same entry and a regeneration cannot leave it behind.
  { path: "apps/web/public/pwa-maskable-512x512.png", width: 512, height: 512, ink: FOREGROUND, background: CANVAS, scale: 0.7, face: "icon", accent: true },
]

function assertSource(source, name, required) {
  if (!source.includes('fill="currentColor"')) {
    throw new Error(`${name} must paint with currentColor`)
  }
  if (/<(?:filter|image|linearGradient|radialGradient)\b/i.test(source)) {
    throw new Error(`${name} contains a banned raster or effect`)
  }
  for (const needle of required) {
    if (!source.includes(needle)) {
      throw new Error(`${name} must carry ${needle}`)
    }
  }
}

const MOON_FILL = "var(--primary, currentColor)"
const RING_OUTLINE_FILL = "var(--orbit-surface, var(--bg, #09090B))"
const EYE_FILL = "var(--bg, #09090B)"
const EYE_PATH = /<path fill="var\(--bg, #09090B\)"[^>]*\/>\n?/g

/** Resolve the four colour roles of the mascot. The moon expression holds `currentColor` as its own
 *  fallback, so it resolves first; the outline expression holds the eye expression, so it resolves
 *  before the eyes. The eyes and the ring outline take `groundInk`, the colour of the surface. */
function bakeColours(source, { ink, groundInk, accent }) {
  const baked = source
    .replaceAll(MOON_FILL, accent ?? ink)
    .replaceAll(RING_OUTLINE_FILL, groundInk)
    .replaceAll(EYE_FILL, groundInk)
    .replaceAll("currentColor", ink)
  if (baked.includes("currentColor") || baked.includes("var(")) {
    throw new Error("a mascot source still carries an unresolved colour after baking")
  }
  return baked
}

/** The icon face: the same rig with no eyes, so the planet, the ring and the moon remain. */
const withoutEyes = (source) => source.replace(EYE_PATH, "")

const rasterise = (svg, density = RENDER_DENSITY) => sharp(Buffer.from(svg), { density })

/** Ink width of the rig in units, measured from a trimmed render. */
async function measureInkUnits(source) {
  const baked = bakeColours(source, { ink: FOREGROUND, groundInk: CANVAS, accent: ACCENT })
  const { info } = await rasterise(baked)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer({ resolveWithObject: true })
  return (info.width * 72) / RENDER_DENSITY
}

/** The width in pixels of one eye when the rig ink is `inkPixels` wide. */
const eyePixels = (inkPixels, inkUnits) => (EYE_UNITS * inkPixels) / inkUnits

/** The mark scale (ink width over canvas width) the adaptive layers use: the ring and the moon fit
 *  the 66 dp safe circle, and the platform scale never exceeds it. */
const adaptiveScale = (inkUnits) => (ADAPTIVE_SAFE_FRACTION * inkUnits) / MARK_CIRCLE_UNITS

/** The measurement behind the app icon pick. RULING: the icon keeps the eyes only when each eye is at
 *  least 2px wide in the 48px render of the adaptive layer, the tightest of the icon layers. */
function measureIconVariant(inkUnits) {
  const scale = adaptiveScale(inkUnits)
  const eyeAt48 = eyePixels(48 * scale, inkUnits)
  return { scale, eyeAt48, hasEyes: eyeAt48 >= EYE_FLOOR_PIXELS }
}

function resolveScale(asset, iconVariant) {
  if (asset.scale === "adaptive") return Math.floor(iconVariant.scale * 100) / 100
  return asset.scale
}

/** Trim the baked rig, then scale it to `targetWidth`. Returns the PNG and its pixel size. */
async function renderTrimmedRig(svg, targetWidth) {
  const trimmed = await rasterise(svg)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  return sharp(trimmed)
    .resize({ width: targetWidth, fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer({ resolveWithObject: true })
}

/** One white ink with the eyes and the ring gap as holes. The rig is drawn white with the eyes and the
 *  outline black, then the black becomes transparency. */
async function punchHoles(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let index = 0; index < data.length; index += info.channels) {
    data[index + 3] = Math.round((data[index + 3] * data[index]) / 255)
    data[index] = 255
    data[index + 1] = 255
    data[index + 2] = 255
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer({ resolveWithObject: true })
}

/** The rig box, at `size` pixels wide, centred in a square canvas of that width. */
async function renderRigBox(source, asset, size) {
  const baked = bakeColours(source, { ink: asset.ink, groundInk: CANVAS, accent: ACCENT })
  const height = Math.round((size * RIG_BOX_HEIGHT) / RIG_BOX_WIDTH)
  const png = await sharp(Buffer.from(baked), { density: (72 * size) / RIG_BOX_WIDTH })
    .resize(size, height)
    .png()
    .toBuffer()
  return { png, left: 0, top: Math.floor((size - height) / 2) }
}

const SMALL_SYMBOLS = { 16: "small-16", 20: "small-20" }

/** The small static face as a standalone SVG. 16 and 20 are the native symbols; 24 is the root. */
function smallFaceSvg(source, size) {
  const symbolId = SMALL_SYMBOLS[size]
  if (!symbolId) {
    return source.replace(/<defs><symbol[\s\S]*<\/symbol><\/defs>/, "")
  }
  const match = new RegExp(`<symbol id="${symbolId}" viewBox="([^"]+)">([\\s\\S]*?)</symbol>`).exec(source)
  if (!match) throw new Error(`orbit-mascot-small.svg must carry the symbol ${symbolId}`)
  const [, viewBox, inner] = match
  const [, , width, height] = viewBox.split(" ")
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}" fill="none">${inner}</svg>`
}

/** The small static face, rasterised on its pixel grid. No trim and no rescale. */
async function renderSmallFace(source, asset) {
  const baked = bakeColours(smallFaceSvg(source, asset.smallSize), {
    ink: asset.ink,
    groundInk: CANVAS,
    accent: asset.accent ? ACCENT : null,
  })
  return sharp(Buffer.from(baked)).png().toBuffer({ resolveWithObject: true })
}

/** The CANVAS shape a transparent asset draws behind its mark: a full disc, or an inset rounded tile. */
function backgroundShapeSvg({ width, height, disc, tile }) {
  if (disc) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><circle cx="${width / 2}" cy="${height / 2}" r="${width / 2}" fill="${CANVAS}"/></svg>`
  }
  if (tile) {
    const side = width - 2 * tile.margin
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect x="${tile.margin}" y="${tile.margin}" width="${side}" height="${side}" rx="${tile.radius}" ry="${tile.radius}" fill="${CANVAS}"/></svg>`
  }
  return null
}

/** The mark layer of one asset: the PNG and where it sits on the canvas. */
async function renderMarkLayer(context, asset) {
  const { sources, inkUnits, iconVariant } = context
  if (asset.face === "small") {
    const { data, info } = await renderSmallFace(sources.small, asset)
    return {
      png: data,
      left: Math.floor((asset.width - info.width) / 2),
      top: Math.floor((asset.height - info.height) / 2),
    }
  }
  if (asset.sourceCanvas) {
    return renderRigBox(sources.rig, asset, asset.width)
  }

  const showEyes = asset.face === "rig" || iconVariant.hasEyes
  const rig = showEyes ? sources.rig : withoutEyes(sources.rig)
  const baked = asset.holes
    ? bakeColours(rig, { ink: asset.ink, groundInk: BLACK, accent: null })
    : bakeColours(rig, { ink: asset.ink, groundInk: CANVAS, accent: asset.accent ? ACCENT : null })
  const markFrameWidth = asset.tile ? asset.width - 2 * asset.tile.margin : asset.width
  const targetWidth = Math.round(markFrameWidth * resolveScale(asset, iconVariant))
  const rendered = await renderTrimmedRig(baked, targetWidth)
  const { data: png, info } = asset.holes ? await punchHoles(rendered.data) : rendered
  const measured = eyePixels(info.width, inkUnits)
  if (showEyes && measured < EYE_FLOOR_PIXELS) {
    throw new Error(`${asset.path ?? `the ${asset.width}px layer`} draws an eye ${measured.toFixed(2)}px wide, under the ${EYE_FLOOR_PIXELS}px floor`)
  }
  return {
    png,
    left: Math.floor((asset.width - info.width) / 2),
    top: Math.floor((asset.height - info.height) / 2),
  }
}

async function renderAsset(context, asset) {
  const transparent = { r: 0, g: 0, b: 0, alpha: 0 }
  const shapeSvg = backgroundShapeSvg(asset)
  const background = shapeSvg ? transparent : asset.background ?? transparent
  const canvas = sharp({
    create: { width: asset.width, height: asset.height, channels: 4, background },
  })
  if (!asset.ink) {
    return canvas.png({ compressionLevel: 9 }).toBuffer()
  }

  const backgroundLayers = shapeSvg ? [{ input: Buffer.from(shapeSvg), left: 0, top: 0 }] : []
  const mark = await renderMarkLayer(context, asset)
  const composed = canvas.composite([...backgroundLayers, { input: mark.png, left: mark.left, top: mark.top }])
  if (asset.opaque) composed.removeAlpha()
  const composedPng = await composed.png({ compressionLevel: 9 }).toBuffer()
  // The small static face is as wide as the layer, so its ring ends reach the margin of an inset
  // tile. The tile shape clips them and the margin stays transparent.
  if (asset.tile && asset.face === "small") {
    return sharp(composedPng)
      .composite([{ input: Buffer.from(shapeSvg), blend: "dest-in" }])
      .png({ compressionLevel: 9 })
      .toBuffer()
  }
  return composedPng
}

// The Windows icon keeps the platform icon artwork on an inset tile with a little rounding, as on the
// Orca icon (tile 80.5% of the canvas, radius 22.4% of the tile). Windows draws these layers at 1:1,
// so a small layer gets the smallest whole-pixel margin that leaves a transparent ring and a radius
// near 21% of its tile. Below 40px a layer draws the small static face, because the live eye is under
// 2px wide there.
const windowsIconLayer = (size, margin, radius, mark) =>
  ({ width: size, height: size, ink: FOREGROUND, tile: { margin, radius }, ...mark })
const iconMark = { face: "icon", accent: true, scale: 0.7 }
const windowsIconLayers = [
  windowsIconLayer(16, 1, 3, { face: "small", smallSize: 16 }),
  windowsIconLayer(24, 1, 4, { face: "small", smallSize: 20, accent: true }),
  windowsIconLayer(32, 2, 6, { face: "small", smallSize: 24, accent: true }),
  windowsIconLayer(48, 4, 9, iconMark),
  windowsIconLayer(64, 6, 11, iconMark),
  windowsIconLayer(256, 24, 44, iconMark),
]

/** The one ICO writer, for favicon.ico and icon.ico. It stores every layer as an embedded PNG, the
 *  layout Tauri's own icon command writes and every browser Orbit supports reads. A BMP layer costs
 *  more bytes at 256 and needs an AND mask. The ICONDIR is 6 bytes, each ICONDIRENTRY 16 bytes, and
 *  a width or height of 0 means 256. */
function pngLayersToIco(layers) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(layers.length, 4)
  let offset = header.length + 16 * layers.length
  const entries = layers.map(({ size, png }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...layers.map(({ png }) => png)])
}

// The 48 px layer of favicon.ico is the one live rig below 64px. Its eye is 2.1px wide at this scale.
const faviconLayerAssets = [
  generatedAssets.find(({ path }) => path === "apps/web/public/favicon-16.png"),
  generatedAssets.find(({ path }) => path === "apps/web/public/favicon-32.png"),
  { width: 48, height: 48, ink: FOREGROUND, scale: 0.72, face: "rig", accent: true, disc: true },
]

if (faviconLayerAssets.some((asset) => !asset)) {
  throw new Error("favicon PNG assets must exist before the ICO layers are assembled")
}

async function main() {
  const sources = {
    rig: await readFile(mascotPath, "utf8"),
    small: await readFile(smallPath, "utf8"),
  }
  assertSource(sources.rig, "orbit-mascot.svg", [MOON_FILL, RING_OUTLINE_FILL, EYE_FILL])
  assertSource(sources.small, "orbit-mascot-small.svg", [MOON_FILL, 'id="small-16"', 'id="small-20"'])

  const inkUnits = await measureInkUnits(sources.rig)
  const iconVariant = measureIconVariant(inkUnits)
  const context = { sources, inkUnits, iconVariant }
  console.log(
    `app icon: each eye is ${iconVariant.eyeAt48.toFixed(2)}px wide in the 48px render at the ` +
      `${(iconVariant.scale * 100).toFixed(1)}% safe scale, the floor is ${EYE_FLOOR_PIXELS}px, ` +
      `so the icon ${iconVariant.hasEyes ? "keeps the eyes" : "is the filled planet with ring and moon and no eyes"}`,
  )

  const renderedAssets = new Map()
  for (const asset of generatedAssets) {
    const outputPath = join(repositoryRoot, ...asset.path.split("/"))
    await mkdir(dirname(outputPath), { recursive: true })
    const renderedAsset = await renderAsset(context, asset)
    renderedAssets.set(asset.path, renderedAsset)
    await writeFile(outputPath, renderedAsset)
  }

  const faviconLayers = await Promise.all(
    faviconLayerAssets.map(async (asset) => ({
      size: asset.width,
      png: asset.path ? renderedAssets.get(asset.path) : await renderAsset(context, asset),
    })),
  )
  const faviconPath = join(repositoryRoot, "apps", "web", "app", "favicon.ico")
  await mkdir(dirname(faviconPath), { recursive: true })
  await writeFile(faviconPath, pngLayersToIco(faviconLayers))

  const windowsIconPath = join(repositoryRoot, "apps", "desktop", "src-tauri", "icons", "icon.ico")
  await mkdir(dirname(windowsIconPath), { recursive: true })
  await writeFile(
    windowsIconPath,
    pngLayersToIco(
      await Promise.all(
        windowsIconLayers.map(async (asset) => ({
          size: asset.width,
          png: await renderAsset(context, asset),
        })),
      ),
    ),
  )

  console.log(
    `generated ${generatedAssets.length + 2} brand assets from design/brand/orbit-mascot.svg and orbit-mascot-small.svg`,
  )
}

main().catch((error) => {
  console.error(`generate-brand-assets: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
