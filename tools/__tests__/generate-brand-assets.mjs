import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import sharp from "sharp"

import { REPO_ROOT, T, check, root } from "./_harness.mjs"

const expectedAssets = [
  ["design/brand/png/orbit-mark-native-16.png", 16, 16],
  ["design/brand/png/orbit-mark-accent-48.png", 48, 48],
  ["design/brand/png/orbit-mark-accent-128.png", 128, 128],
  ["design/brand/png/orbit-mark-accent-512.png", 512, 512],
  ["design/brand/png/orbit-platform-icon-512.png", 512, 512],
  ["design/brand/exports/oauth-consent-logo-512.png", 512, 512],
  ["design/brand/exports/play-icon-512.png", 512, 512],
  ["apps/desktop/src-tauri/icons/icon.png", 512, 512],
  ["apps/desktop/src-tauri/icons/tray.png", 48, 36],
  ["apps/desktop/src-tauri/icons/tray-windows-16.png", 16, 16],
  ["apps/desktop/src-tauri/icons/tray-windows-20.png", 20, 20],
  ["apps/desktop/src-tauri/icons/tray-windows-24.png", 24, 24],
  ["apps/desktop/src-tauri/icons/tray-windows-28.png", 28, 28],
  ["apps/desktop/src-tauri/icons/tray-windows-32.png", 32, 32],
  ["apps/desktop/src-tauri/icons/tray-windows-40.png", 40, 40],
  ["apps/desktop/src-tauri/icons/tray-windows-48.png", 48, 48],
  ["apps/mobile/assets/adaptive-icon-background.png", 1024, 1024],
  ["apps/mobile/assets/adaptive-icon-foreground.png", 1024, 1024],
  ["apps/mobile/assets/adaptive-icon-monochrome.png", 1024, 1024],
  ["apps/mobile/assets/favicon.png", 64, 64],
  ["apps/mobile/assets/icon.png", 1024, 1024],
  ["apps/mobile/assets/logo-no-bg.png", 96, 96],
  ["apps/mobile/assets/notification-icon.png", 96, 96],
  ["apps/mobile/assets/splash-icon.png", 1024, 1024],
  ["apps/mobile/store/feature-graphic.png", 1024, 500],
  ["apps/web/app/apple-icon.png", 180, 180],
  ["apps/web/public/favicon-16.png", 16, 16],
  ["apps/web/public/favicon-32.png", 32, 32],
  ["apps/web/public/logo-no-bg.png", 96, 96],
  ["apps/web/public/og-image.png", 1200, 630],
  ["apps/web/public/pwa-192x192.png", 192, 192],
  ["apps/web/public/pwa-512x512.png", 512, 512],
  ["apps/web/public/pwa-maskable-512x512.png", 512, 512],
]

const fixtureRoot = (label) => {
  const directory = join(root, "brand-assets", label)
  mkdirSync(join(directory, "design", "brand"), { recursive: true })
  // Both canonical sources: the live rig and the small static face behind every raster below 40px.
  for (const mark of ["orbit-mascot.svg", "orbit-mascot-small.svg"]) {
    cpSync(join(REPO_ROOT, "design", "brand", mark), join(directory, "design", "brand", mark))
  }
  return directory
}

const pixelAt = async (path, x, y) => {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const offset = (y * info.width + x) * info.channels
  return [...data.subarray(offset, offset + 4)]
}

/** The embedded PNG of every ICONDIRENTRY. The ICONDIR is 6 bytes, each entry 16 bytes, and a width
 *  of 0 means 256. */
const readIcoLayers = (path) => {
  const ico = readFileSync(path)
  return Array.from({ length: ico.readUInt16LE(4) }, (_, index) => {
    const entryOffset = 6 + index * 16
    const dataOffset = ico.readUInt32LE(entryOffset + 12)
    return {
      size: ico.readUInt8(entryOffset) || 256,
      png: ico.subarray(dataOffset, dataOffset + ico.readUInt32LE(entryOffset + 8)),
    }
  })
}

const isAccentPixel = (red, green, blue, alpha) =>
  alpha >= 128 && red > green * 2 && green > blue * 2

// The ICNS types that hold an "ARGB" image instead of a PNG, with their pixel size.
const ICNS_ARGB_SIZES = { ic04: 16, ic05: 32 }

/** An ICNS "ARGB" image: the four bytes "ARGB", then the alpha, red, green and blue planes, each one
 *  packed. A control byte below 0x80 copies the next control + 1 bytes; a control byte from 0x80
 *  repeats the next byte control - 0x80 + 3 times. Returns the image as a PNG, and the bytes after
 *  the blue plane: the writer must end with exactly one 0x00 byte, because Apple Silicon reads the
 *  last blue value as 0 when the blue plane is the last byte of the element. */
const argbToPng = async (body, size) => {
  if (body.subarray(0, 4).toString("latin1") !== "ARGB") return null
  const pixels = Buffer.alloc(size * size * 4)
  let position = 4
  for (const channel of [3, 0, 1, 2]) {
    for (let pixel = 0; pixel < size * size;) {
      const control = body[position++]
      if (control < 0x80) {
        for (let count = 0; count <= control; count += 1) pixels[(pixel++) * 4 + channel] = body[position++]
      } else {
        const value = body[position++]
        for (let count = 0; count < control - 0x80 + 3; count += 1) pixels[(pixel++) * 4 + channel] = value
      }
    }
  }
  if (position > body.length) return null
  return {
    png: await sharp(pixels, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer(),
    tail: body.subarray(position),
  }
}

/** The elements of an ICNS file: a four-byte type and a big-endian length that counts its header.
 *  `format` is "PNG", "ARGB" (planes and the one trailing 0x00 byte), "ARGB-tail-<hex>" (planes with
 *  any other tail) or "other", and `png` holds the image as a PNG for each one but "other". */
const readIcnsElements = async (path) => {
  if (!existsSync(path)) return { magic: "missing", length: 0, size: 0, elements: [] }
  const icns = readFileSync(path)
  const elements = []
  for (let offset = 8; offset < icns.length; offset += icns.readUInt32BE(offset + 4)) {
    const type = icns.subarray(offset, offset + 4).toString("latin1")
    const body = icns.subarray(offset + 8, offset + icns.readUInt32BE(offset + 4))
    const argbSize = ICNS_ARGB_SIZES[type]
    const argb = argbSize ? await argbToPng(body, argbSize) : null
    const argbFormat = argb && (argb.tail.equals(Buffer.from([0x00])) ? "ARGB" : `ARGB-tail-${argb.tail.toString("hex") || "none"}`)
    const format = argbFormat || (body.subarray(1, 4).toString() === "PNG" ? "PNG" : "other")
    elements.push({ type, format, png: argb?.png ?? body })
  }
  return { magic: icns.subarray(0, 4).toString("latin1"), length: icns.readUInt32BE(4), size: icns.length, elements }
}

// The eyes in design/brand/orbit-mascot.svg are 22 by 56 pills at x -46..-24 and 24..46, y -58..-2.
// The rig ink spans x -181.334 (the left ring end) to 181.752 (the right ring end) and y -100 to 100
// (the planet), so an eye centre and the planet between the eyes sit at these fractions of the ink box.
const RIG_INK = { left: -181.334, right: 181.752, top: -100, bottom: 100 }
const rigPoint = (x, y) => ({
  x: (x - RIG_INK.left) / (RIG_INK.right - RIG_INK.left),
  y: (y - RIG_INK.top) / (RIG_INK.bottom - RIG_INK.top),
})
const RIG_FACE = { leftEye: rigPoint(-35, -30), rightEye: rigPoint(35, -30), between: rigPoint(0, -30) }
// The small static face in design/brand/orbit-mascot-small.svg: the drawing size, and the pixel each
// eye fills in its straight part (its path starts at `M<x> <y>`, and the eye is 2 wide). The pixel two
// columns right of the left eye is planet ink between the eyes.
const SMALL_FACES = {
  16: { width: 16, height: 12, leftEye: [5, 4] },
  20: { width: 20, height: 15, leftEye: [7, 6] },
  24: { width: 24, height: 18, leftEye: [9, 6] },
}

const isMarkInk = (pixel) => pixel[3] >= 128 && Math.max(pixel[0], pixel[1], pixel[2]) >= 128
const isPlanetInk = (pixel) => pixel[3] >= 128 && Math.min(pixel[0], pixel[1], pixel[2]) >= 200
// An eye is the ground colour #09090B, or a hole in a one-ink layer.
const isEye = (pixel) => pixel[3] < 128 || Math.max(pixel[0], pixel[1], pixel[2]) < 64
// DESIGN.md Orbit: "The live face needs each eye at least 2px wide". An 8-bit pixel value carries a
// rounding error of 1/255, so the measured width keeps 0.01px of tolerance below the floor.
const EYE_FLOOR_PIXELS = 2
const EYE_WIDTH_TOLERANCE = 0.01

/** The width in pixels of the eye through (x, y): the sum of the eye coverage of each pixel in that
 *  row, out to the planet ink on both sides. Each pixel is laid on the #09090B ground first, so a
 *  ground eye and a hole read the same: coverage 0 at the colour `planet`, 1 at the ground. */
// `onPixelGrid` is the small static face. Its eye edges sit on pixel columns, but its round eye ends
// leave no row fully dark (the 20 face reads 16, not 9), so the sum is divided by the darkest pixel.
// The live rig is not on the grid, so its sum is the width as it is.
const eyeWidthAt = (pixelAt, width, x, y, planet, onPixelGrid) => {
  const onGround = (pixel) => (Math.min(pixel[0], pixel[1], pixel[2]) * pixel[3] + 9 * (255 - pixel[3])) / 255
  const planetValue = onGround(planet)
  const coverage = (column) => Math.min(1, Math.max(0, (planetValue - onGround(pixelAt(column, y))) / (planetValue - 9)))
  let total = coverage(x)
  let darkest = total
  if (total === 0) return 0
  for (const step of [-1, 1]) {
    for (let column = x + step; column >= 0 && column < width; column += step) {
      const value = coverage(column)
      if (value <= 0.02) break
      total += value
      darkest = Math.max(darkest, value)
    }
  }
  return onPixelGrid ? total / darkest : total
}

/** The two eye pixels, the planet pixel between them and the width of each eye in a raster that draws
 *  the mascot. A rig face is found from its ink box; a small static face sits on its pixel grid,
 *  centred in the canvas, drawn `pixelRatio` device pixels to each grid pixel. */
const facePixels = async (input, smallSize, pixelRatio = 1) => {
  if (typeof input === "string" && !existsSync(input)) return null
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const pixelAt = (x, y) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)]
  const face = (leftEye, rightEye, between) => ({
    leftEye: pixelAt(leftEye.x, leftEye.y),
    rightEye: pixelAt(rightEye.x, rightEye.y),
    between: pixelAt(between.x, between.y),
    leftEyeWidth: eyeWidthAt(pixelAt, info.width, leftEye.x, leftEye.y, pixelAt(between.x, between.y), Boolean(smallSize)),
    rightEyeWidth: eyeWidthAt(pixelAt, info.width, rightEye.x, rightEye.y, pixelAt(between.x, between.y), Boolean(smallSize)),
  })
  if (smallSize) {
    const small = SMALL_FACES[smallSize]
    const left = Math.floor((info.width - small.width * pixelRatio) / 2) + small.leftEye[0] * pixelRatio
    const top = Math.floor((info.height - small.height * pixelRatio) / 2) + small.leftEye[1] * pixelRatio
    return face({ x: left, y: top }, { x: left + 4 * pixelRatio, y: top }, { x: left + 2 * pixelRatio, y: top })
  }
  let [minX, minY, maxX, maxY] = [info.width, info.height, -1, -1]
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (!isMarkInk(pixelAt(x, y))) continue
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < 0) return null
  const at = ({ x, y }) => ({ x: Math.floor(minX + x * (maxX + 1 - minX)), y: Math.floor(minY + y * (maxY + 1 - minY)) })
  return face(at(RIG_FACE.leftEye), at(RIG_FACE.rightEye), at(RIG_FACE.between))
}

export const cases = async () => {
  const outputRoot = fixtureRoot("complete")
  check(
    "generate-brand-assets.mjs",
    "writes the complete derived asset inventory",
    ["--write", "--root", outputRoot],
    { status: 0, stdout: /generated 36 brand assets/ },
  )

  for (const [relativePath, width, height] of expectedAssets) {
    const path = join(outputRoot, ...relativePath.split("/"))
    const metadata = existsSync(path) ? await sharp(path).metadata() : {}
    T(
      `generate-brand-assets.mjs: ${relativePath} has the specified PNG canvas`,
      metadata.format === "png" && metadata.width === width && metadata.height === height,
      `${relativePath}: ${JSON.stringify(metadata)}`,
    )
  }

  const faviconLayers = readIcoLayers(join(outputRoot, "apps", "web", "app", "favicon.ico"))
  T(
    "generate-brand-assets.mjs: favicon.ico carries the small static face at 16 and 32 plus the live rig at 48",
    JSON.stringify(faviconLayers.map(({ size }) => size)) === JSON.stringify([16, 32, 48]),
    `ICO layers ${JSON.stringify(faviconLayers.map(({ size }) => size))}`,
  )

  const faviconLayerAccentPixelCount = async (size) => {
    const layer = faviconLayers.find((candidate) => candidate.size === size)
    if (!layer) return -1

    const { data, info } = await sharp(layer.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let accent = 0
    for (let index = 0; index < data.length; index += info.channels) {
      if (isAccentPixel(data[index], data[index + 1], data[index + 2], data[index + 3])) accent += 1
    }
    return accent
  }
  for (const size of [32, 48]) {
    T(
      `generate-brand-assets.mjs: favicon.ico ${size}px layer keeps the accent moon`,
      (await faviconLayerAccentPixelCount(size)) > 0,
      `favicon.ico ${size}px layer carries no #C4530F pixel`,
    )
  }
  T(
    "generate-brand-assets.mjs: favicon.ico 16px layer carries no accent",
    (await faviconLayerAccentPixelCount(16)) === 0,
    "favicon.ico 16px layer unexpectedly carries an accent pixel",
  )

  // The Windows icon keeps the platform artwork on an inset, rounded tile. A full-bleed square
  // reads as a hard edge beside other Windows apps, so every layer keeps a transparent margin.
  const windowsLayers = readIcoLayers(join(outputRoot, "apps", "desktop", "src-tauri", "icons", "icon.ico"))
  T(
    "generate-brand-assets.mjs: Windows icon.ico carries PNG layers at 16, 24, 32, 48, 64 and 256",
    JSON.stringify(windowsLayers.map(({ size }) => size)) === JSON.stringify([16, 24, 32, 48, 64, 256]),
    `layers ${JSON.stringify(windowsLayers.map(({ size }) => size))}`,
  )
  T(
    "generate-brand-assets.mjs: both ICO files store every layer as an embedded PNG",
    [...faviconLayers, ...windowsLayers].every(({ png }) => png.subarray(1, 4).toString() === "PNG"),
    "an ICO layer is not an embedded PNG",
  )
  for (const { size, png } of windowsLayers) {
    const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const alphaAt = (x, y) => data[(y * size + x) * 4 + 3]
    T(
      `generate-brand-assets.mjs: Windows icon.ico ${size}px layer is an inset tile with transparent corners`,
      alphaAt(0, 0) === 0 && alphaAt(size - 1, size - 1) === 0 && alphaAt(size >> 1, 0) === 0 && alphaAt(size >> 1, size >> 1) === 255,
      `${size}px layer corner ${alphaAt(0, 0)}, edge ${alphaAt(size >> 1, 0)}, centre ${alphaAt(size >> 1, size >> 1)}`,
    )
  }

  const favicon16 = join(outputRoot, "apps", "web", "public", "favicon-16.png")
  const faviconCorner = await pixelAt(favicon16, 0, 0)
  const { data: faviconPixels } = await sharp(favicon16).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let hasOpaqueCanvasPixel = false
  for (let index = 0; index < faviconPixels.length; index += 4) {
    if (
      faviconPixels[index] === 9 &&
      faviconPixels[index + 1] === 9 &&
      faviconPixels[index + 2] === 11 &&
      faviconPixels[index + 3] === 255
    ) {
      hasOpaqueCanvasPixel = true
      break
    }
  }
  T(
    "generate-brand-assets.mjs: tab icons use an opaque canvas disc on transparent corners",
    faviconCorner[3] === 0 && hasOpaqueCanvasPixel,
    `corner ${faviconCorner.join(",")}; opaque canvas pixel ${hasOpaqueCanvasPixel}`,
  )

  const featureGraphic = join(outputRoot, "apps", "mobile", "store", "feature-graphic.png")
  const featureGraphicMetadata = await sharp(featureGraphic).metadata()
  T(
    "generate-brand-assets.mjs: Play feature graphic is a 24-bit RGB PNG with no alpha channel",
    featureGraphicMetadata.channels === 3 && featureGraphicMetadata.hasAlpha === false,
    JSON.stringify(featureGraphicMetadata),
  )

  const oauthLogo = join(outputRoot, "design", "brand", "exports", "oauth-consent-logo-512.png")
  const oauthLogoMetadata = await sharp(oauthLogo).metadata()
  T(
    "generate-brand-assets.mjs: OAuth consent logo is opaque and under one megabyte",
    oauthLogoMetadata.channels === 3 && oauthLogoMetadata.hasAlpha === false && readFileSync(oauthLogo).byteLength < 1_000_000,
    JSON.stringify(oauthLogoMetadata),
  )

  const playIcon = join(outputRoot, "design", "brand", "exports", "play-icon-512.png")
  const playIconMetadata = await sharp(playIcon).metadata()
  const playIconCorner = await pixelAt(playIcon, 0, 0)
  T(
    "generate-brand-assets.mjs: Play icon is a 32-bit PNG with no transparent pixels and is under one megabyte",
    playIconMetadata.channels === 4 && playIconMetadata.hasAlpha === true && playIconCorner.join(",") === "9,9,11,255" && readFileSync(playIcon).byteLength < 1_000_000,
    `${JSON.stringify(playIconMetadata)}; corner ${playIconCorner.join(",")}`,
  )

  const foreground = join(outputRoot, "apps", "mobile", "assets", "adaptive-icon-foreground.png")
  const { info: foregroundInk } = await sharp(foreground)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer({ resolveWithObject: true })
  const foregroundCenter = await pixelAt(foreground, 512, 512)
  const foregroundCorner = await pixelAt(foreground, 0, 0)
  // Android adaptive icon: the logo must stay inside the 66 dp safe circle of the 108 dp layer. The
  // ring ends are the widest ink, 380 units across the circle that holds the mark, and the mark ink
  // is 363 units wide, so the ink width allowed is 66/108 * 363 / 380 of the canvas.
  const safeInkWidth = Math.floor(1024 * (66 / 108) * (363 / 380) * 1.03)
  T(
    "generate-brand-assets.mjs: adaptive mark stays inside the 66 dp safe zone of its square",
    foregroundInk.width > 0 && foregroundInk.width <= safeInkWidth,
    `ink width ${foregroundInk.width}, safe ink width ${safeInkWidth}`,
  )
  T(
    "generate-brand-assets.mjs: adaptive foreground keeps the planet centre filled and the canvas transparent",
    foregroundCenter[3] === 255 && foregroundCorner[3] === 0,
    `centre ${foregroundCenter.join(",")}; corner ${foregroundCorner.join(",")}`,
  )

  const monochrome = join(outputRoot, "apps", "mobile", "assets", "adaptive-icon-monochrome.png")
  const { data: monochromePixels } = await sharp(monochrome).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let monochromeIsWhite = true
  let visiblePixels = 0
  for (let index = 0; index < monochromePixels.length; index += 4) {
    if (monochromePixels[index + 3] === 0) continue
    visiblePixels += 1
    if (monochromePixels[index] !== 255 || monochromePixels[index + 1] !== 255 || monochromePixels[index + 2] !== 255) {
      monochromeIsWhite = false
      break
    }
  }
  T(
    "generate-brand-assets.mjs: monochrome is one white silhouette on transparency",
    visiblePixels > 0 && monochromeIsWhite,
    `visible pixels ${visiblePixels}; one-colour ${monochromeIsWhite}`,
  )
  const notificationPath = join(outputRoot, "apps", "mobile", "assets", "notification-icon.png")
  const notificationPixels = await sharp(notificationPath).ensureAlpha().raw().toBuffer()
  let notificationOtherPixels = 0
  for (let index = 0; index < notificationPixels.length; index += 4) {
    const white = notificationPixels[index] === 255 && notificationPixels[index + 1] === 255 && notificationPixels[index + 2] === 255
    if (notificationPixels[index + 3] !== 0 && !white) notificationOtherPixels += 1
  }
  // The eyes are holes in the planet, so the pixel at the left eye centre is transparent.
  const eyeCentre = await pixelAt(notificationPath, 41, 40)
  T(
    "generate-brand-assets.mjs: notification icon is white or transparent and its eyes are holes",
    notificationOtherPixels === 0 && eyeCentre[3] < 64,
    `non-white visible pixels ${notificationOtherPixels}; eye alpha ${eyeCentre[3]}`,
  )

  // DESIGN.md:261: the mark carries the accent on exactly one element, its moon, and a surface takes
  // the accent file rather than tinting the monochrome one. Before this, every coloured raster was
  // flattened to one ink and the moon disappeared from the launcher, splash, PWA, OG and store art.
  const accentPixelCount = async (relativePath) => {
    const { data, info } = await sharp(join(outputRoot, ...relativePath.split("/")))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    let accent = 0
    for (let index = 0; index < data.length; index += info.channels) {
      if (isAccentPixel(data[index], data[index + 1], data[index + 2], data[index + 3])) accent += 1
    }
    return accent
  }

  const pixelsOf = async (input) => sharp(input).ensureAlpha().raw().toBuffer()
  const rigSource = readFileSync(join(REPO_ROOT, "design", "brand", "orbit-mascot.svg"), "utf8")
    .replaceAll("var(--primary, currentColor)", "#C4530F")
    .replaceAll("var(--orbit-surface, var(--bg, #09090B))", "#09090B")
    .replaceAll("var(--bg, #09090B)", "#09090B")
    .replaceAll("currentColor", "#F4F4F6")
  // The rig box is 7:5, centred in the square canvas of the export.
  const rigBoxRender = async (size) => {
    const height = Math.round((size * 300) / 420)
    const box = await sharp(Buffer.from(rigSource), { density: (72 * size) / 420 }).resize(size, height).png().toBuffer()
    return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: box, left: 0, top: Math.floor((size - height) / 2) }])
      .png()
      .toBuffer()
  }
  const canonicalSourceChecks = [
    ["design/brand/png/orbit-mark-accent-128.png", await rigBoxRender(128), 128],
  ]
  for (const [relativePath, source, size] of canonicalSourceChecks) {
    const generated = join(outputRoot, ...relativePath.split("/"))
    const directSourceRender = source
    const generatedPixels = await pixelsOf(generated)
    const sourcePixels = await pixelsOf(directSourceRender)
    let sourceCanvasMatches = generatedPixels.length === sourcePixels.length
    for (let index = 0; sourceCanvasMatches && index < generatedPixels.length; index += 4) {
      sourceCanvasMatches =
        generatedPixels[index + 3] === sourcePixels[index + 3] &&
        Math.abs(generatedPixels[index] - sourcePixels[index]) <= 1 &&
        Math.abs(generatedPixels[index + 1] - sourcePixels[index + 1]) <= 1 &&
        Math.abs(generatedPixels[index + 2] - sourcePixels[index + 2]) <= 1
    }
    T(
      `generate-brand-assets.mjs: ${relativePath} is a direct render of its canonical source canvas`,
      sourceCanvasMatches,
      `${relativePath} does not match a direct ${size}px source render`,
    )
  }

  for (const relativePath of [
    "design/brand/png/orbit-mark-accent-48.png",
    "design/brand/png/orbit-mark-accent-128.png",
    "design/brand/png/orbit-mark-accent-512.png",
    "design/brand/png/orbit-platform-icon-512.png",
    "apps/mobile/assets/icon.png",
    "apps/web/public/favicon-32.png",
    "apps/web/public/pwa-512x512.png",
  ]) {
    T(
      `generate-brand-assets.mjs: ${relativePath} keeps the accent moon`,
      (await accentPixelCount(relativePath)) > 0,
      `${relativePath} carries no #C4530F pixel`,
    )
  }

  // The three that must stay monochrome, each for a stated reason: the Android monochrome layer is
  // one flat colour by platform rule, the notification icon is a white silhouette by platform rule,
  // and DESIGN.md:267 says the 16 redraw is "monochrome --fg-1 with no accent".
  for (const relativePath of [
    "apps/mobile/assets/adaptive-icon-monochrome.png",
    "apps/mobile/assets/notification-icon.png",
    "apps/web/public/favicon-16.png",
    "design/brand/png/orbit-mark-native-16.png",
  ]) {
    T(
      `generate-brand-assets.mjs: ${relativePath} carries no accent`,
      (await accentPixelCount(relativePath)) === 0,
      `${relativePath} unexpectedly carries an accent pixel`,
    )
  }

  // apps/web/__tests__/manifest.test.ts requires the maskable PWA asset to equal the canonical
  // platform icon byte for byte, so the generator writes it and a regeneration cannot leave it behind.
  T(
    "generate-brand-assets.mjs: the maskable PWA icon is byte-identical to the canonical platform icon",
    existsSync(join(outputRoot, "apps", "web", "public", "pwa-maskable-512x512.png")) &&
      readFileSync(join(outputRoot, "apps", "web", "public", "pwa-maskable-512x512.png")).equals(
        readFileSync(join(outputRoot, "design", "brand", "png", "orbit-platform-icon-512.png")),
      ),
    "pwa-maskable-512x512.png is missing or differs from orbit-platform-icon-512.png",
  )

  // web.dev/articles/maskable-icon: the safe zone is a centred circle with a radius of 40% of the
  // icon width. Every pixel that is not the #09090B canvas is mark ink and must sit inside it.
  const { data: maskablePixels, info: maskableInfo } = await sharp(join(outputRoot, "apps", "web", "public", "pwa-maskable-512x512.png"))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const maskableCentre = maskableInfo.width / 2
  let inkOutsideSafeCircle = 0
  for (let index = 0; index < maskablePixels.length; index += maskableInfo.channels) {
    const pixel = index / maskableInfo.channels
    const x = (pixel % maskableInfo.width) + 0.5
    const y = Math.floor(pixel / maskableInfo.width) + 0.5
    const canvas = Math.abs(maskablePixels[index] - 9) <= 2 && Math.abs(maskablePixels[index + 1] - 9) <= 2 && Math.abs(maskablePixels[index + 2] - 11) <= 2
    if (!canvas && Math.hypot(x - maskableCentre, y - maskableCentre) > 0.4 * maskableInfo.width) inkOutsideSafeCircle += 1
  }
  T(
    "generate-brand-assets.mjs: the maskable PWA icon keeps its mark inside the 40% radius safe circle",
    inkOutsideSafeCircle === 0,
    `${inkOutsideSafeCircle} mark pixels lie outside the maskable safe circle`,
  )

  const icon = join(outputRoot, "apps", "mobile", "assets", "icon.png")
  const iconCorner = await pixelAt(icon, 0, 0)
  T(
    "generate-brand-assets.mjs: platform corners stay square for the platform mask",
    iconCorner.join(",") === "9,9,11,255",
    `corner ${iconCorner.join(",")}`,
  )

  // Every raster that draws the mascot carries both eyes: the planet ink between the eyes surrounds two
  // pixels in the ground colour, or two holes in a one-ink layer. The small static face serves 16 to 24.
  const mascotRasters = [
    ...[
      "design/brand/png/orbit-mark-accent-48.png",
      "design/brand/png/orbit-mark-accent-128.png",
      "design/brand/png/orbit-mark-accent-512.png",
      "design/brand/png/orbit-platform-icon-512.png",
      "design/brand/exports/oauth-consent-logo-512.png",
      "design/brand/exports/play-icon-512.png",
      "apps/desktop/src-tauri/icons/icon.png",
      "apps/mobile/assets/adaptive-icon-foreground.png",
      "apps/mobile/assets/adaptive-icon-monochrome.png",
      "apps/mobile/assets/favicon.png",
      "apps/mobile/assets/icon.png",
      "apps/mobile/assets/logo-no-bg.png",
      "apps/mobile/assets/notification-icon.png",
      "apps/mobile/assets/splash-icon.png",
      "apps/mobile/store/feature-graphic.png",
      "apps/web/app/apple-icon.png",
      "apps/web/public/logo-no-bg.png",
      "apps/web/public/og-image.png",
      "apps/web/public/pwa-192x192.png",
      "apps/web/public/pwa-512x512.png",
      "apps/web/public/pwa-maskable-512x512.png",
    ].map((relativePath) => ({ label: relativePath, input: join(outputRoot, ...relativePath.split("/")) })),
    { label: "design/brand/png/orbit-mark-native-16.png", input: join(outputRoot, "design", "brand", "png", "orbit-mark-native-16.png"), smallSize: 16 },
    { label: "apps/web/public/favicon-16.png", input: join(outputRoot, "apps", "web", "public", "favicon-16.png"), smallSize: 16 },
    { label: "apps/web/public/favicon-32.png", input: join(outputRoot, "apps", "web", "public", "favicon-32.png"), smallSize: 24 },
    ...faviconLayers.map(({ size, png }) => ({ label: `favicon.ico ${size}px layer`, input: png, smallSize: { 16: 16, 32: 24 }[size] })),
    ...windowsLayers.map(({ size, png }) => ({ label: `icon.ico ${size}px layer`, input: png, smallSize: { 16: 16, 24: 20, 32: 24 }[size] })),
  ]

  // `iconutil -c icns` writes the 16 and 32 px images as "ARGB" elements ic04 and ic05, and every
  // larger image as a PNG element. macOS reads a PNG in icp4 or icp5 as scrambled pixels. Each ARGB
  // element ends with one 0x00 byte after its blue plane, or Apple Silicon reads the last blue run as 0.
  const icns = await readIcnsElements(join(outputRoot, "apps", "desktop", "src-tauri", "icons", "icon.icns"))
  const icnsSizes = await Promise.all(
    icns.elements.map(async ({ type, format, png }) =>
      `${type}:${format}:${format === "other" ? 0 : (await sharp(png).metadata()).width}`),
  )
  T(
    "generate-brand-assets.mjs: macOS icon.icns carries ARGB elements with one trailing 0x00 byte at 16 and 32 and a PNG element for each larger size",
    icns.magic === "icns" &&
      icns.length === icns.size &&
      icnsSizes.join(" ") ===
        "ic04:ARGB:16 ic05:ARGB:32 ic11:PNG:32 ic12:PNG:64 ic07:PNG:128 ic13:PNG:256 ic08:PNG:256 ic14:PNG:512 ic09:PNG:512 ic10:PNG:1024",
    `${icns.magic} ${icns.length}/${icns.size}: ${icnsSizes.join(" ")}`,
  )
  for (const [index, { type, png }] of icns.elements.entries()) {
    const width = Number(icnsSizes[index].split(":")[2])
    mascotRasters.push({ label: `icon.icns ${type} ${width}px element`, input: png, smallSize: { 16: 16, 32: 24 }[width] })
  }

  // The macOS menu bar tray draws the image that build_tray in menus.rs loads with
  // tauri::include_image!, or, with no such image, app.default_window_icon(): on macOS tauri-codegen
  // takes that from the first PNG of bundle.icon (tauri-codegen 2.7.4 src/context.rs). tray-icon 0.25.1
  // draws it 18pt tall, so the test draws it 36px tall for a Retina display and 18px tall for a 1x one.
  const desktopRoot = ["apps", "desktop", "src-tauri"]
  const menusSource = readFileSync(join(REPO_ROOT, ...desktopRoot, "src", "menus.rs"), "utf8")
  const tauriConfig = JSON.parse(readFileSync(join(REPO_ROOT, ...desktopRoot, "tauri.conf.json"), "utf8"))
  const trayImage =
    /#\[cfg\(target_os = "macos"\)\]\s*let icon = tauri::include_image!\("([^"]+)"\)/.exec(menusSource)?.[1] ??
    tauriConfig.bundle.icon.find((path) => path.endsWith(".png"))
  const trayPath = join(outputRoot, ...desktopRoot, ...trayImage.split("/"))
  T(
    "generate-brand-assets.mjs: the generator writes the image the macOS tray loads",
    existsSync(trayPath),
    `${trayImage} is missing from the generated set`,
  )
  for (const pixelRatio of [2, 1]) {
    if (!existsSync(trayPath)) break
    mascotRasters.push({
      label: `macOS tray ${trayImage} at 18pt on a ${pixelRatio}x display`,
      input: await sharp(trayPath).resize({ height: 18 * pixelRatio }).png().toBuffer(),
      smallSize: trayImage === "icons/tray.png" ? 24 : undefined,
      pixelRatio,
    })
  }

  // The Windows notification area draws the tray image at SM_CXSMICON, the small icon size of the system
  // DPI (NOTIFYICONDATAW: a larger icon is "scaled down when they are displayed in the System Tray").
  // build_tray loads the image that windows_tray_image in menus.rs maps from the largest of
  // WINDOWS_TRAY_SIZES no larger than SM_CXSMICON. With no such map, the tray takes
  // default_window_icon(): the icon.ico layer at SM_CXICON (tauri 2.12.5 src/image/mod.rs
  // default_window_icon_from_app_icon_resource), the smallest layer no smaller than it.
  const windowsTraySizes = /WINDOWS_TRAY_SIZES: \[i32; \d+\] = \[([\d, ]+)\]/.exec(menusSource)?.[1].split(",").map(Number)
  const windowsTrayImages = new Map(
    [...menusSource.matchAll(/(\d+|_) => tauri::include_image!\("(icons\/tray-windows-[^"]+)"\)/g)].map(([, size, path]) => [size, path]),
  )
  // The small static face and pixel ratio of each Windows tray image, from windowsTrayLayers in the generator.
  const WINDOWS_TRAY_FACES = { 16: [16, 1], 20: [20, 1], 24: [20, 1], 28: [24, 1], 32: [24, 1], 40: [20, 2], 48: [20, 2] }
  // SM_CXSMICON and SM_CXICON at each display scale.
  for (const [scale, smallIcon, largeIcon] of [["100%", 16, 32], ["125%", 20, 40], ["150%", 24, 48], ["175%", 28, 56], ["200%", 32, 64], ["250%", 40, 80], ["300%", 48, 96]]) {
    if (windowsTraySizes) {
      const size = windowsTraySizes.filter((candidate) => candidate <= smallIcon).at(-1) ?? windowsTraySizes[0]
      const image = windowsTrayImages.get(String(size)) ?? windowsTrayImages.get("_")
      const path = join(outputRoot, ...desktopRoot, ...image.split("/"))
      const [faceSize, facePixelRatio] = WINDOWS_TRAY_FACES[size] ?? []
      mascotRasters.push({
        label: `Windows tray at ${scale}: ${image} drawn at ${smallIcon}px`,
        input: existsSync(path) ? await sharp(path).resize({ width: smallIcon, height: smallIcon }).png().toBuffer() : path,
        smallSize: smallIcon === size ? faceSize : undefined,
        pixelRatio: facePixelRatio,
      })
    } else {
      const layer = windowsLayers.find(({ size }) => size >= largeIcon) ?? windowsLayers.at(-1)
      mascotRasters.push({
        label: `Windows tray at ${scale}: icon.ico ${layer.size}px layer drawn at ${smallIcon}px`,
        input: await sharp(layer.png).resize({ width: smallIcon, height: smallIcon }).png().toBuffer(),
      })
    }
  }

  for (const { label, input, smallSize, pixelRatio } of mascotRasters) {
    const face = await facePixels(input, smallSize, pixelRatio)
    T(
      `generate-brand-assets.mjs: ${label} draws the mascot with both eyes`,
      face !== null && isEye(face.leftEye) && isEye(face.rightEye) && isPlanetInk(face.between),
      `${label}: ${face ? `left eye ${face.leftEye}, right eye ${face.rightEye}, between ${face.between}` : "no mark ink or no file"}`,
    )
    T(
      `generate-brand-assets.mjs: ${label} draws each eye at least ${EYE_FLOOR_PIXELS}px wide`,
      face !== null &&
        face.leftEyeWidth + EYE_WIDTH_TOLERANCE >= EYE_FLOOR_PIXELS &&
        face.rightEyeWidth + EYE_WIDTH_TOLERANCE >= EYE_FLOOR_PIXELS,
      `${label}: ${face ? `left eye ${face.leftEyeWidth.toFixed(2)}px, right eye ${face.rightEyeWidth.toFixed(2)}px` : "no mark ink or no file"}`,
    )
  }

  const missingSourceRoot = join(root, "brand-assets", "missing-source")
  mkdirSync(missingSourceRoot, { recursive: true })
  check(
    "generate-brand-assets.mjs",
    "fails when the canonical mark is absent",
    ["--write", "--root", missingSourceRoot],
    { status: 1, stderr: /orbit-mascot\.svg/ },
  )

  T(
    "generate-brand-assets.mjs: the fixture source remains unchanged",
    readFileSync(join(outputRoot, "design", "brand", "orbit-mascot.svg"), "utf8") ===
      readFileSync(join(REPO_ROOT, "design", "brand", "orbit-mascot.svg"), "utf8"),
    "generator modified its source mark",
  )
}
