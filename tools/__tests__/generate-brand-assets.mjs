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
  T(
    "generate-brand-assets.mjs: both ICO files store every layer as an embedded PNG",
    [...faviconLayers, ...windowsLayers].every(({ png }) => png.subarray(1, 4).toString() === "PNG"),
    "an ICO layer is not an embedded PNG",
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

  // Both eyes of the mascot are dark pixels inside the planet ink. The rig sits in a 420 by 300 box centred in the
  // square canvas, with the eyes at x -35 and 35, y -30 from its centre.
  const eyeSize = 512
  const eyePath = join(outputRoot, "design", "brand", "png", "orbit-mark-accent-512.png")
  const scale = eyeSize / 420
  const eyeY = Math.round(eyeSize / 2 - 30 * scale)
  const [leftEye, rightEye, between] = await Promise.all(
    [-35, 35, 0].map((offset) => pixelAt(eyePath, Math.round(eyeSize / 2 + offset * scale), eyeY)),
  )
  const isDark = (pixel) => pixel[3] < 128 || Math.max(pixel[0], pixel[1], pixel[2]) < 64
  T(
    "generate-brand-assets.mjs: the 512 accent mark draws both eyes as dark pixels in the planet",
    isDark(leftEye) && isDark(rightEye) && !isDark(between),
    `left ${leftEye}, right ${rightEye}, between ${between}`,
  )

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
