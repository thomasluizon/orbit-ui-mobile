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
//
// It FAILS CLOSED. Every element, attribute and path command it cannot account for is an error,
// never a skip. An earlier revision inventoried only paths inside transformed groups, so a
// root-level path outside the viewBox passed silently. A gate that omits what it does not
// understand reports clean over geometry it never measured, which is worse than no gate.

import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: check-lockup-crop.mjs [--file <path>]

  Asserts design/brand/orbit-lockup.svg's viewBox equals its ink bounds within 1e-6.
  Rejects any SVG construct whose contribution to the ink it cannot compute.

  --file <path>  check this SVG instead of the default
  --help, -h     print this usage and exit 0

exit codes: 0 the crop is exact, 1 the crop is wrong or the file uses an unsupported construct,
            2 usage error`

const argv = process.argv.slice(2)
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
let file = join(REPO_ROOT, "design/brand/orbit-lockup.svg")

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
const fail = (message) => {
  console.error(`check-lockup-crop: ${message}`)
  process.exit(1)
}

/* ------------------------------------------------------------------ geometry */

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

// S, T and A are deliberately absent. Their coordinates would otherwise be read under the
// preceding command and silently misplace the bounds.
const ARG_COUNT = { M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4, Z: 0 }
const SUPPORTED_COMMANDS = /^[MmLlHhVvCcQqZz]$/

const pathBounds = (d) => {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) ?? []
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
      if (!SUPPORTED_COMMANDS.test(tokens[i])) {
        fail(`path uses the "${tokens[i]}" command, which this gate cannot solve.\n` +
             `  Supported: M L H V C Q Z. Rewrite the path or teach the gate that command.`)
      }
      cmd = tokens[i]
      i += 1
      if (cmd === "Z" || cmd === "z") {
        cur = [...start]
        see(cur[0], cur[1])
      }
      continue
    }
    if (cmd === null) fail("path data starts with a number, not a command")

    const up = cmd.toUpperCase()
    const rel = cmd === cmd.toLowerCase()
    const need = ARG_COUNT[up]
    const args = []
    while (args.length < need && i < tokens.length && !/^[A-Za-z]$/.test(tokens[i])) {
      args.push(Number(tokens[i]))
      i += 1
    }
    if (args.length < need) fail(`path ends mid-command after "${cmd}"`)

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
      for (const axis of [0, 1]) {
        for (const t of cubicExtrema(cur[axis], p1[axis], p2[axis], p3[axis])) {
          see(cubicAt(cur[0], p1[0], p2[0], p3[0], t), cubicAt(cur[1], p1[1], p2[1], p3[1], t))
        }
      }
      cur = p3
    } else if (up === "Q") {
      const p1 = rel ? [cur[0] + args[0], cur[1] + args[1]] : [args[0], args[1]]
      const p2 = rel ? [cur[0] + args[2], cur[1] + args[3]] : [args[2], args[3]]
      see(cur[0], cur[1])
      see(p2[0], p2[1])
      for (const axis of [0, 1]) {
        for (const t of quadExtremum(cur[axis], p1[axis], p2[axis])) {
          see(quadAt(cur[0], p1[0], p2[0], t), quadAt(cur[1], p1[1], p2[1], t))
        }
      }
      cur = p2
    }
  }

  if (!Number.isFinite(minX)) fail("a path produced no points")
  return { minX, minY, maxX, maxY }
}

/* ------------------------------------------------------------------ parsing */

// The asset is machine-generated and deliberately tiny, so a scanner is enough. What matters is
// that anything outside this shape is refused rather than skipped.
const ELEMENTS_WITHOUT_INK = new Set(["svg", "title", "desc"])

// Every attribute this gate understands, per element. Absent from the set means the gate cannot
// say what it does to the ink, so it refuses rather than measuring around it.
const ALLOWED_ATTRIBUTES = {
  svg: new Set(["xmlns", "xmlns:xlink", "viewBox", "width", "height", "fill", "role", "aria-labelledby"]),
  title: new Set(["id"]),
  desc: new Set(["id"]),
  // `translate` is the HTML attribute that keeps a wordmark out of machine translation. It is
  // not a transform and does not move anything.
  g: new Set(["transform", "translate"]),
  path: new Set(["d", "fill", "fill-rule"]),
}
const TRANSFORM = /^translate\(\s*(-?[\d.eE+-]+)[\s,]+(-?[\d.eE+-]+)\s*\)(?:\s*scale\(\s*(-?[\d.eE+-]+)\s*\))?$/

const svg = readFileSync(file, "utf8")
if (/<!--/.test(svg)) fail("the file carries a comment; this gate reads a generated asset, not hand-edited markup")

const viewBoxMatch = svg.match(/<svg\b[^>]*\bviewBox="([^"]+)"/)
if (!viewBoxMatch) fail(`${file} has no viewBox`)
const view = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number)
if (view.length !== 4 || view.some((n) => !Number.isFinite(n))) fail(`viewBox is not four numbers: ${viewBoxMatch[1]}`)
const [vx, vy, vw, vh] = view

const stack = []
let ink = null
const seen = { paths: 0 }

const TAG = /<(\/?)([A-Za-z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g
for (const match of svg.matchAll(TAG)) {
  const [, closing, name, attrText, selfClosing] = match

  if (closing) {
    const open = stack.pop()
    if (open !== name) fail(`markup is not well formed: </${name}> closes <${open ?? "nothing"}>`)
    continue
  }

  // Read BOTH quoting styles, then prove the whole attribute text was consumed. Reading only the
  // double-quoted form let style='stroke:red' through the refusals below while the tag scanner
  // happily matched it, so the gate passed a stroked path that painted outside the viewBox.
  const attrs = {}
  let residue = attrText
  for (const a of attrText.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[a[1]] = a[2] !== undefined ? a[2] : a[3]
    residue = residue.replace(a[0], "")
  }
  if (residue.trim() !== "") {
    fail(`<${name}> carries attribute text this gate cannot parse: ${JSON.stringify(residue.trim())}\n` +
         `  Every attribute must be name="value" or name='value'. An unread attribute could paint.`)
  }

  // The element has to be known before its attributes can be judged against a per-element set.
  if (!ALLOWED_ATTRIBUTES[name]) {
    fail(`<${name}> is not a construct this gate can measure.\n` +
         `  It paints, or may paint, and omitting it would report a crop over geometry never checked.\n` +
         `  Supported: ${Object.keys(ALLOWED_ATTRIBUTES).sort().join(", ")}.`)
  }

  // A CLOSED set, not a list of known-bad names. Refusing stroke and style one at a time left
  // filter, mask, clip-path, marker, paint-order and vector-effect accepted and unmodelled, so
  // the gate could still report exact ink over geometry something else had moved or widened.
  const allowed = ALLOWED_ATTRIBUTES[name]
  for (const attribute of Object.keys(attrs)) {
    if (!allowed.has(attribute)) {
      fail(`<${name}> carries ${attribute}="${attrs[attribute]}", which this gate does not model.\n` +
           `  Allowed on <${name}>: ${[...allowed].sort().join(", ")}.\n` +
           `  Anything else can move, clip, widen or hide the ink, and reporting an exact crop\n` +
           `  without modelling it would be a clean result over geometry never measured.`)
    }
  }
  // Every measured path must declare a visible fill. `fill` is INHERITED, and the root carries
  // fill="none", so a path that simply omits the attribute paints nothing while its geometry
  // would still have been counted as ink. Checking only for an explicit fill="none" missed that.
  if (name === "path") {
    if (attrs.fill === undefined) {
      fail("a <path> declares no fill, so it inherits the root's fill=\"none\" and paints nothing,\n" +
           "  yet its geometry would be counted as ink. Declare the fill this gate should measure.")
    }
    if (attrs.fill === "none" || attrs.fill === "transparent") {
      fail(`a <path> is fill="${attrs.fill}", so it paints nothing, or paints only a stroke this gate cannot measure`)
    }
  }

  if (name === "path") {
    const parent = stack[stack.length - 1]
    if (parent !== "g") fail(`a <path> sits directly inside <${parent ?? "nothing"}>; every path must be in a transformed <g> this gate can resolve`)
    if (!attrs.d) fail("a <path> carries no d attribute")
    if (attrs.transform) fail("a <path> carries its own transform; put the transform on its <g>")

    const g = stack.gTransform
    const b = pathBounds(attrs.d)
    const box = {
      minX: g.tx + b.minX * g.s,
      minY: g.ty + b.minY * g.s,
      maxX: g.tx + b.maxX * g.s,
      maxY: g.ty + b.maxY * g.s,
    }
    ink = ink
      ? { minX: Math.min(ink.minX, box.minX), minY: Math.min(ink.minY, box.minY),
          maxX: Math.max(ink.maxX, box.maxX), maxY: Math.max(ink.maxY, box.maxY) }
      : box
    seen.paths += 1
  } else if (name === "g") {
    if (stack[stack.length - 1] !== "svg") fail("nested <g> is not supported; this gate resolves one transform per path")
    const parsed = TRANSFORM.exec((attrs.transform ?? "").trim())
    if (!parsed) {
      fail(`<g> transform ${JSON.stringify(attrs.transform ?? "")} is not "translate(x y)" with an optional uniform scale.\n` +
           `  rotate, skew, matrix and non-uniform scale change the bounds in ways this gate does not solve.`)
    }
    stack.gTransform = { tx: Number(parsed[1]), ty: Number(parsed[2]), s: parsed[3] === undefined ? 1 : Number(parsed[3]) }
  } else if (!ELEMENTS_WITHOUT_INK.has(name)) {
    fail(`<${name}> is not a construct this gate can measure.\n` +
         `  It paints, or may paint, and omitting it would report a crop over geometry never checked.\n` +
         `  Supported: svg, title, desc, g, path.`)
  }

  if (!selfClosing) stack.push(name)
}

if (stack.length > 0) fail(`markup is not well formed: <${stack[stack.length - 1]}> is never closed`)
if (seen.paths === 0) fail(`${file} has no paths to measure`)
if (!ink) fail(`${file} produced no ink`)

/* ------------------------------------------------------------------ verdict */

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
    const leading = edge === "left" || edge === "top"
    console.error(`  ${edge}: off by ${delta.toExponential(4)} (${(delta > 0) === leading ? "pads" : "clips"})`)
  }
  console.error(`  tolerance ${TOLERANCE}`)
  process.exit(1)
}

console.log(`check-lockup-crop: ${file} crop is exact (${seen.paths} paths, all four edges within ${TOLERANCE})`)
