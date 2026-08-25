#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import sharp from "sharp"

const USAGE = `usage: generate-brand-assets.mjs --write [--root <path>]

  Regenerates every Orbit platform raster from design/brand/orbit-mark.svg.
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

const CANVAS = "#09090B"
const FOREGROUND = "#F4F4F6"
const WHITE = "#FFFFFF"

const generatedAssets = [
  { path: "apps/mobile/assets/adaptive-icon-background.png", width: 1024, height: 1024, background: CANVAS },
  { path: "apps/mobile/assets/adaptive-icon-foreground.png", width: 1024, height: 1024, ink: FOREGROUND, scale: 0.6 },
  { path: "apps/mobile/assets/adaptive-icon-monochrome.png", width: 1024, height: 1024, ink: WHITE, scale: 0.6 },
  { path: "apps/mobile/assets/favicon.png", width: 64, height: 64, ink: FOREGROUND, background: CANVAS, scale: 0.6 },
  { path: "apps/mobile/assets/icon.png", width: 1024, height: 1024, ink: FOREGROUND, background: CANVAS, scale: 0.6 },
  { path: "apps/mobile/assets/logo-no-bg.png", width: 96, height: 96, ink: FOREGROUND, scale: 0.8 },
  { path: "apps/mobile/assets/notification-icon.png", width: 64, height: 64, ink: WHITE, scale: 0.8 },
  { path: "apps/mobile/assets/splash-icon.png", width: 1024, height: 1024, ink: FOREGROUND, scale: 0.4 },
  { path: "apps/mobile/store/feature-graphic.png", width: 1024, height: 500, ink: FOREGROUND, background: CANVAS, scale: 0.36 },
  { path: "apps/web/public/favicon.png", width: 64, height: 64, ink: FOREGROUND, background: CANVAS, scale: 0.6 },
  { path: "apps/web/public/logo-no-bg.png", width: 96, height: 96, ink: FOREGROUND, scale: 0.8 },
  { path: "apps/web/public/og-image.png", width: 1200, height: 630, ink: FOREGROUND, background: CANVAS, scale: 0.36 },
  { path: "apps/web/public/pwa-192x192.png", width: 192, height: 192, ink: FOREGROUND, background: CANVAS, scale: 0.6 },
  { path: "apps/web/public/pwa-512x512.png", width: 512, height: 512, ink: FOREGROUND, background: CANVAS, scale: 0.6 },
]

function assertCanonicalSource(source) {
  if (!source.includes('fill="currentColor"')) {
    throw new Error("orbit-mark.svg must paint with currentColor")
  }
  if (/<(?:filter|image|linearGradient|radialGradient)\b/i.test(source)) {
    throw new Error("orbit-mark.svg contains a banned raster or effect")
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

async function renderAsset(source, asset) {
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

  const targetWidth = Math.round(asset.width * asset.scale)
  const { data: mark, info } = await renderTrimmedMark(source, asset.ink, targetWidth)
  const left = Math.floor((asset.width - info.width) / 2)
  const top = Math.floor((asset.height - info.height) / 2)

  return canvas
    .composite([{ input: mark, left, top }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

async function main() {
  const source = await readFile(markPath, "utf8")
  assertCanonicalSource(source)

  for (const asset of generatedAssets) {
    const outputPath = join(repositoryRoot, ...asset.path.split("/"))
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, await renderAsset(source, asset))
  }

  console.log(`generated ${generatedAssets.length} brand assets from design/brand/orbit-mark.svg`)
}

main().catch((error) => {
  console.error(`generate-brand-assets: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
