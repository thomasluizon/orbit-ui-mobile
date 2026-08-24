#!/usr/bin/env node
// The lockup asset claims its viewBox IS its ink: no clipped overshoot, no baked margin. That
// claim is only worth making if something checks it, so this parses the COMMITTED file, solves
// the real path bounds from the curve extrema, applies the serialized transforms, and compares.
//
// It reads the shipped bytes on purpose. An earlier revision asserted the invariant inside its
// generator against pre-rounded floats, passed, and still shipped a file whose ink sat 2.5e-4
// outside the viewBox once the numbers were formatted.
//
// Solving beats sampling here. A raster shows ink on an edge whether the geometry touches that
// edge or runs past it, so a render can confirm contact and never detect clipping.

import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: check-lockup-crop.mjs [--file <path>]

  Asserts design/brand/orbit-lockup.svg's viewBox equals its ink bounds within 1e-6.

  --file <path>  check this SVG instead of the default
  --help, -h     print this usage and exit 0

exit codes: 0 the crop is exact, 1 the crop clips or pads, 2 usage error`

const argv = process.argv.slice(2)
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const DEFAULT_FILE = join(REPO_ROOT, "design/brand/orbit-lockup.svg")

let file = DEFAULT_FILE
const flagIndex = argv.indexOf("--file")
if (flagIndex !== -1) {
  if (!argv[flagIndex + 1]) {
    console.error("check-lockup-crop: --file needs a path\n")
    console.error(USAGE)
    process.exit(2)
  }
  file = resolve(argv[flagIndex + 1])
} else if (argv.length > 0) {
  console.error(`check-lockup-crop: unexpected arguments: ${argv.join(" ")}\n`)
  console.error(USAGE)
  process.exit(2)
}

const TOLERANCE = 1e-6

const cubicAt = (p0, p1, p2, p3, t) => {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}
const quadAt = (p0, p1, p2, t) => {
  const u = 1 - t
  return u * u * p0 + 2 * u * t * p1 + t * t * p2
}

const cubicExtrema = (p0, p1, p2, p3) => {
  const a = 3 * (-p0 + 3 * p1 - 3 * p2 + p3)
  const b = 6 * (p0 - 2 * p1 + p2)
  const c = 3 * (p1 - p0)
  const out = []
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) out.push(-c / b)
  } else {
    const disc = b * b - 4 * a * c
    if (disc >= 0) {
      const r = Math.sqrt(disc)
      out.push((-b + r) / (2 * a), (-b - r) / (2 * a))
    }
  }
  return out.filter((t) => t > 0 && t < 1)
}

const quadExtremum = (p0, p1, p2) => {
  const den = p0 - 2 * p1 + p2
  if (Math.abs(den) < 1e-12) return []
  const t = (p0 - p1) / den
  return t > 0 && t < 1 ? [t] : []
}

const ARG_COUNT = { M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4, Z: 0 }

// Solves the tight bounds of one path, curve extrema included. A control-point box would
// overshoot and a sampled box would round; either would make this gate lie.
const pathBounds = (d) => {
  const tokens = d.match(/[MmLlHhVvCcQqZz]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) ?? []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const see = (x, y) => {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  let cur = [0, 0]
  let start = [0, 0]
  let cmd = null
  let i = 0

  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i])) {
      cmd = tokens[i]
      i += 1
      if (cmd === "Z" || cmd === "z") {
        cur = [...start]
        see(cur[0], cur[1])
      }
      continue
    }
    if (cmd === null) {
      console.error(`check-lockup-crop: path data starts with a number, not a command`)
      process.exit(1)
    }

    const up = cmd.toUpperCase()
    const rel = cmd === cmd.toLowerCase()
    const need = ARG_COUNT[up]
    const args = []
    while (args.length < need && i < tokens.length && !/^[A-Za-z]$/.test(tokens[i])) {
      args.push(Number(tokens[i]))
      i += 1
    }
    if (args.length < need) break

    if (up === "M") {
      cur = rel ? [cur[0] + args[0], cur[1] + args[1]] : [args[0], args[1]]
      start = [...cur]
      see(cur[0], cur[1])
      cmd = rel ? "l" : "L"
    } else if (up === "L") {
      see(cur[0], cur[1])
      cur = rel ? [cur[0] + args[0], cur[1] + args[1]] : [args[0], args[1]]
      see(cur[0], cur[1])
    } else if (up === "H") {
      see(cur[0], cur[1])
      cur = [rel ? cur[0] + args[0] : args[0], cur[1]]
      see(cur[0], cur[1])
    } else if (up === "V") {
      see(cur[0], cur[1])
      cur = [cur[0], rel ? cur[1] + args[0] : args[0]]
      see(cur[0], cur[1])
    } else if (up === "C") {
      const p1 = rel ? [cur[0] + args[0], cur[1] + args[1]] : [args[0], args[1]]
      const p2 = rel ? [cur[0] + args[2], cur[1] + args[3]] : [args[2], args[3]]
      const p3 = rel ? [cur[0] + args[4], cur[1] + args[5]] : [args[4], args[5]]
      see(cur[0], cur[1])
      see(p3[0], p3[1])
      for (const t of cubicExtrema(cur[0], p1[0], p2[0], p3[0])) {
        see(cubicAt(cur[0], p1[0], p2[0], p3[0], t), cubicAt(cur[1], p1[1], p2[1], p3[1], t))
      }
      for (const t of cubicExtrema(cur[1], p1[1], p2[1], p3[1])) {
        see(cubicAt(cur[0], p1[0], p2[0], p3[0], t), cubicAt(cur[1], p1[1], p2[1], p3[1], t))
      }
      cur = p3
    } else if (up === "Q") {
      const p1 = rel ? [cur[0] + args[0], cur[1] + args[1]] : [args[0], args[1]]
      const p2 = rel ? [cur[0] + args[2], cur[1] + args[3]] : [args[2], args[3]]
      see(cur[0], cur[1])
      see(p2[0], p2[1])
      for (const t of quadExtremum(cur[0], p1[0], p2[0])) {
        see(quadAt(cur[0], p1[0], p2[0], t), quadAt(cur[1], p1[1], p2[1], t))
      }
      for (const t of quadExtremum(cur[1], p1[1], p2[1])) {
        see(quadAt(cur[0], p1[0], p2[0], t), quadAt(cur[1], p1[1], p2[1], t))
      }
      cur = p2
    }
  }

  if (!Number.isFinite(minX)) {
    console.error("check-lockup-crop: a path produced no points")
    process.exit(1)
  }
  return { minX, minY, maxX, maxY }
}

const svg = readFileSync(file, "utf8")

const viewBoxMatch = svg.match(/viewBox="([^"]+)"/)
if (!viewBoxMatch) {
  console.error(`check-lockup-crop: ${file} has no viewBox`)
  process.exit(1)
}
const [vx, vy, vw, vh] = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number)

// Each <g> carries at most one translate and one uniform scale, which is all this asset uses.
const groups = [...svg.matchAll(/<g\b[^>]*transform="([^"]*)"[^>]*>([\s\S]*?)<\/g>/g)]
if (groups.length === 0) {
  console.error(`check-lockup-crop: ${file} has no transformed groups`)
  process.exit(1)
}

let ink = null
for (const [, transform, body] of groups) {
  const translate = transform.match(/translate\(\s*(-?[\d.eE+-]+)[\s,]+(-?[\d.eE+-]+)\s*\)/)
  const scale = transform.match(/scale\(\s*(-?[\d.eE+-]+)\s*\)/)
  const tx = translate ? Number(translate[1]) : 0
  const ty = translate ? Number(translate[2]) : 0
  const s = scale ? Number(scale[1]) : 1

  for (const [, d] of body.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)) {
    const b = pathBounds(d)
    const box = {
      minX: tx + b.minX * s,
      minY: ty + b.minY * s,
      maxX: tx + b.maxX * s,
      maxY: ty + b.maxY * s,
    }
    ink = ink
      ? {
          minX: Math.min(ink.minX, box.minX),
          minY: Math.min(ink.minY, box.minY),
          maxX: Math.max(ink.maxX, box.maxX),
          maxY: Math.max(ink.maxY, box.maxY),
        }
      : box
  }
}

if (!ink) {
  console.error(`check-lockup-crop: ${file} has no paths inside a transformed group`)
  process.exit(1)
}

const deltas = [
  ["left", ink.minX - vx],
  ["top", ink.minY - vy],
  ["right", ink.maxX - (vx + vw)],
  ["bottom", ink.maxY - (vy + vh)],
]
const bad = deltas.filter(([, delta]) => Math.abs(delta) > TOLERANCE)

if (bad.length > 0) {
  console.error(`check-lockup-crop: the crop is not the ink in ${file}`)
  console.error(`  viewBox ${vx} ${vy} ${vw} ${vh}`)
  console.error(`  ink     ${ink.minX} ${ink.minY} ${ink.maxX} ${ink.maxY}`)
  for (const [edge, delta] of bad) {
    const how = delta > 0
      ? (edge === "left" || edge === "top" ? "pads" : "clips")
      : (edge === "left" || edge === "top" ? "clips" : "pads")
    console.error(`  ${edge}: off by ${delta.toExponential(4)} (${how})`)
  }
  console.error(`  tolerance ${TOLERANCE}`)
  process.exit(1)
}

console.log(`check-lockup-crop: ${file} crop is exact (all four edges within ${TOLERANCE})`)
