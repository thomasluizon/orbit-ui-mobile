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
]

const fixtureRoot = (label) => {
  const directory = join(root, "brand-assets", label)
  mkdirSync(join(directory, "design", "brand"), { recursive: true })
  // All three canonical sources: the 1024 monochrome mark, the accent treatment every coloured
  // raster comes from, and the native 16 redraw behind the favicon.
  for (const mark of ["orbit-mark.svg", "orbit-mark-16.svg", "orbit-mark-accent.svg"]) {
    cpSync(join(REPO_ROOT, "design", "brand", mark), join(directory, "design", "brand", mark))
  }
  return directory
}

const pixelAt = async (path, x, y) => {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const offset = (y * info.width + x) * info.channels
  return [...data.subarray(offset, offset + 4)]
}

export const cases = async () => {
  const outputRoot = fixtureRoot("complete")
  check(
    "generate-brand-assets.mjs",
    "writes the complete derived asset inventory",
    ["--write", "--root", outputRoot],
    { status: 0, stdout: /generated 24 brand assets/ },
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

  const faviconIco = readFileSync(join(outputRoot, "apps", "web", "app", "favicon.ico"))
  const layerCount = faviconIco.readUInt16LE(4)
  const layerSizes = Array.from({ length: layerCount }, (_, index) => {
    const directoryOffset = 6 + index * 16
    return [faviconIco.readUInt8(directoryOffset), faviconIco.readUInt8(directoryOffset + 1)]
  })
  T(
    "generate-brand-assets.mjs: favicon.ico carries native 16 plus canonical 32 and 48 layers",
    JSON.stringify(layerSizes) === JSON.stringify([[16, 16], [32, 32], [48, 48]]),
    `ICO layers ${JSON.stringify(layerSizes)}`,
  )

  const favicon16 = join(outputRoot, "apps", "web", "public", "favicon-16.png")
  const faviconCorner = await pixelAt(favicon16, 0, 0)
  const faviconCentre = await pixelAt(favicon16, 8, 8)
  T(
    "generate-brand-assets.mjs: tab icons use an opaque canvas disc on transparent corners",
    faviconCorner[3] === 0 && faviconCentre.join(",") === "9,9,11,255",
    `corner ${faviconCorner.join(",")}; centre ${faviconCentre.join(",")}`,
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
  T(
    "generate-brand-assets.mjs: adaptive mark occupies sixty percent of its square",
    foregroundInk.width === 614,
    `ink width ${foregroundInk.width}, expected 614`,
  )
  T(
    "generate-brand-assets.mjs: adaptive foreground keeps the hollow centre and transparent canvas",
    foregroundCenter[3] === 0 && foregroundCorner[3] === 0,
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
      if (data[index + 3] < 128) continue
      if (data[index] === 0xc4 && data[index + 1] === 0x53 && data[index + 2] === 0x0f) accent += 1
    }
    return accent
  }

  const pixelsOf = async (input) => sharp(input).ensureAlpha().raw().toBuffer()
  const nativeSource = readFileSync(join(REPO_ROOT, "design", "brand", "orbit-mark-16.svg"), "utf8")
    .replaceAll("currentColor", "#F4F4F6")
  const accentSource = readFileSync(join(REPO_ROOT, "design", "brand", "orbit-mark-accent.svg"), "utf8")
    .replaceAll("var(--primary, currentColor)", "#C4530F")
    .replaceAll("currentColor", "#F4F4F6")
  const canonicalSourceChecks = [
    ["design/brand/png/orbit-mark-native-16.png", Buffer.from(nativeSource), 16],
    ["design/brand/png/orbit-mark-accent-128.png", Buffer.from(accentSource), 128],
  ]
  for (const [relativePath, source, size] of canonicalSourceChecks) {
    const generated = join(outputRoot, ...relativePath.split("/"))
    const directSourceRender = await sharp(source).resize(size, size).png().toBuffer()
    const generatedPixels = await pixelsOf(generated)
    const sourcePixels = await pixelsOf(directSourceRender)
    let sourceCanvasMatches = generatedPixels.length === sourcePixels.length
    for (let index = 0; sourceCanvasMatches && index < generatedPixels.length; index += 4) {
      // Compositing onto a transparent Sharp canvas can round an anti-aliased RGB channel by one;
      // alpha must match exactly and no colour channel may move beyond that measured rounding.
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

  const icon = join(outputRoot, "apps", "mobile", "assets", "icon.png")
  const iconCorner = await pixelAt(icon, 0, 0)
  T(
    "generate-brand-assets.mjs: platform corners stay square for the platform mask",
    iconCorner.join(",") === "9,9,11,255",
    `corner ${iconCorner.join(",")}`,
  )

  const missingSourceRoot = join(root, "brand-assets", "missing-source")
  mkdirSync(missingSourceRoot, { recursive: true })
  check(
    "generate-brand-assets.mjs",
    "fails when the canonical mark is absent",
    ["--write", "--root", missingSourceRoot],
    { status: 1, stderr: /orbit-mark\.svg/ },
  )

  T(
    "generate-brand-assets.mjs: the fixture source remains unchanged",
    readFileSync(join(outputRoot, "design", "brand", "orbit-mark.svg"), "utf8") ===
      readFileSync(join(REPO_ROOT, "design", "brand", "orbit-mark.svg"), "utf8"),
    "generator modified its source mark",
  )
}
