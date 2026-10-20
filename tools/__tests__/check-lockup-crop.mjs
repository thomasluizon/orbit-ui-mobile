import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { check, root, toolPath } from "./_harness.mjs"

// Each fixture is a whole SVG, because the tool's contract is about the bytes that ship. Testing
// the bounds solver alone would have missed the defect that produced this gate: the generator's
// own assertion passed against pre-rounded floats while the written file clipped.
const stage = (label, svg) => {
  const directory = join(root, "lockup-crop", label)
  mkdirSync(directory, { recursive: true })
  const file = join(directory, "lockup.svg")
  writeFileSync(file, svg)
  return file
}

// A 10 by 10 square at the origin, scaled by 2 and translated by 1, so its ink is exactly
// 1,1 to 21,21. Every fixture below moves the viewBox around that known box.
const SQUARE = "M0 0L10 0L10 10L0 10Z"
const wrap = (viewBox, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none">\n${body}\n</svg>\n`
const grouped = (d = SQUARE, transform = "translate(1 1) scale(2)") =>
  `<g transform="${transform}">\n<path fill="currentColor" d="${d}"/>\n</g>`
const svgWith = (viewBox, d = SQUARE, transform = "translate(1 1) scale(2)") =>
  wrap(viewBox, grouped(d, transform))

export const cases = () => {
  check(
    "check-lockup-crop.mjs",
    "accepts a viewBox that is exactly the ink",
    ["--file", stage("exact", svgWith("1 1 20 20"))],
    { status: 0, stdout: /crop is exact/ },
  )

  check(
    "check-lockup-crop.mjs",
    "rejects a viewBox that clips the bottom",
    ["--file", stage("clips-bottom", svgWith("1 1 20 19.9"))],
    { status: 1, stderr: /bottom.*clips/ },
  )

  check(
    "check-lockup-crop.mjs",
    "rejects a viewBox that pads the left",
    ["--file", stage("pads-left", svgWith("0 1 21 20"))],
    { status: 1, stderr: /left.*pads/ },
  )

  // The regression this gate was written for: 2.5e-4 is far too small to see in a render and far
  // too large to ship in a file that claims to be ink-tight.
  check(
    "check-lockup-crop.mjs",
    "rejects a sub-pixel overrun a raster cannot show",
    ["--file", stage("subpixel", svgWith("1 1 20 19.99975"))],
    { status: 1, stderr: /bottom/ },
  )

  // A curve's extremum sits outside its control points' span, so a control-point box would call
  // this exact and a solved box does not.
  check(
    "check-lockup-crop.mjs",
    "solves curve extrema rather than trusting control points",
    ["--file", stage("curve", svgWith("0 0 10 7.5", "M0 0C0 10 10 10 10 0Z", "translate(0 0) scale(1)"))],
    { status: 0, stdout: /crop is exact/ },
  )

  /* ---------------------------------------------------------------- fails closed */

  // Pullfrog's reproduction against the first revision: an exact grouped square plus root-level
  // geometry far outside the viewBox. That revision inventoried only grouped paths and exited 0.
  check(
    "check-lockup-crop.mjs",
    "rejects a root-level path instead of omitting it",
    ["--file", stage("root-path", wrap("1 1 20 20", `${grouped()}\n<path fill="currentColor" d="M900 900L910 910Z"/>`))],
    { status: 1, stderr: /path.*directly inside/ },
  )

  check(
    "check-lockup-crop.mjs",
    "rejects a painted element that is not a path",
    ["--file", stage("circle", wrap("1 1 20 20", `${grouped()}\n<circle cx="900" cy="900" r="5" fill="currentColor"/>`))],
    { status: 1, stderr: /<circle> is not a construct/ },
  )

  check(
    "check-lockup-crop.mjs",
    "rejects an arc command rather than misreading its coordinates",
    ["--file", stage("arc", svgWith("1 1 20 20", "M0 0A5 5 0 0 1 10 10Z"))],
    { status: 1, stderr: /"A" command/ },
  )

  check(
    "check-lockup-crop.mjs",
    "rejects a smooth-curve command",
    ["--file", stage("smooth", svgWith("1 1 20 20", "M0 0C0 5 5 5 5 0S10 5 10 0Z"))],
    { status: 1, stderr: /"S" command/ },
  )

  check(
    "check-lockup-crop.mjs",
    "rejects a stroke, which widens ink past the path bounds",
    ["--file", stage("stroke", wrap("1 1 20 20", `<g transform="translate(1 1) scale(2)">\n<path fill="none" stroke="currentColor" d="${SQUARE}"/>\n</g>`))],
    { status: 1, stderr: /stroke/ },
  )

  check(
    "check-lockup-crop.mjs",
    "rejects a rotate transform it cannot solve",
    ["--file", stage("rotate", svgWith("1 1 20 20", SQUARE, "translate(1 1) rotate(30)"))],
    { status: 1, stderr: /translate\(x y\)/ },
  )

  check(
    "check-lockup-crop.mjs",
    "rejects a matrix transform it cannot solve",
    ["--file", stage("matrix", svgWith("1 1 20 20", SQUARE, "matrix(2 0 0 2 1 1)"))],
    { status: 1, stderr: /translate\(x y\)/ },
  )

  check(
    "check-lockup-crop.mjs",
    "rejects a nested group",
    ["--file", stage("nested", wrap("1 1 20 20", `<g transform="translate(0 0)">\n${grouped()}\n</g>`))],
    { status: 1, stderr: /nested <g>/ },
  )

  check(
    "check-lockup-crop.mjs",
    "rejects a transform on the path itself",
    ["--file", stage("path-transform", wrap("1 1 20 20", `<g transform="translate(1 1) scale(2)">\n<path transform="translate(5 5)" fill="currentColor" d="${SQUARE}"/>\n</g>`))],
    { status: 1, stderr: /does not model/ },
  )

  check(
    "check-lockup-crop.mjs",
    "rejects a style attribute it does not read",
    ["--file", stage("style", wrap("1 1 20 20", `<g transform="translate(1 1) scale(2)">\n<path style="stroke:red" fill="currentColor" d="${SQUARE}"/>\n</g>`))],
    { status: 1, stderr: /does not model/ },
  )

  // The tag scanner accepts single quotes, so the attribute reader must too. Reading only the
  // double-quoted form let this exact file pass with a stroke painting outside the viewBox.
  check(
    "check-lockup-crop.mjs",
    "rejects a single-quoted style attribute",
    ["--file", stage("style-single", wrap("1 1 20 20", `<g transform="translate(1 1) scale(2)">\n<path style='stroke:red' fill="currentColor" d="${SQUARE}"/>\n</g>`))],
    { status: 1, stderr: /does not model/ },
  )

  check(
    "check-lockup-crop.mjs",
    "rejects a single-quoted stroke attribute",
    ["--file", stage("stroke-single", wrap("1 1 20 20", `<g transform="translate(1 1) scale(2)">\n<path stroke='currentColor' fill="none" d="${SQUARE}"/>\n</g>`))],
    { status: 1, stderr: /stroke/ },
  )

  // The attribute set is closed, so a paint attribute the gate does not model is refused whether
  // or not anyone thought to name it. Refusing stroke and style one at a time left all of these
  // accepted and unmodelled.
  for (const [label, attribute] of [
    ["opacity", 'opacity="0.5"'],
    ["a filter", 'filter="url(#f)"'],
    ["a mask", 'mask="url(#m)"'],
    ["a clip path", 'clip-path="url(#c)"'],
    ["paint-order", 'paint-order="stroke"'],
    ["vector-effect", 'vector-effect="non-scaling-stroke"'],
  ]) {
    check(
      "check-lockup-crop.mjs",
      `rejects ${label}, which it does not model`,
      ["--file", stage(`attr-${label.replaceAll(/[^a-z]/g, "-")}`, wrap("1 1 20 20", `<g transform="translate(1 1) scale(2)">\n<path ${attribute} fill="currentColor" d="${SQUARE}"/>\n</g>`))],
      { status: 1, stderr: /does not model/ },
    )
  }

  check(
    "check-lockup-crop.mjs",
    "rejects a fill=none path, which paints nothing or only a stroke",
    ["--file", stage("fill-none", wrap("1 1 20 20", `<g transform="translate(1 1) scale(2)">\n<path fill="none" d="${SQUARE}"/>\n</g>`))],
    { status: 1, stderr: /cannot prove paints/ },
  )

  // There is no finite list of ways to write invisible, so the gate enumerates what it knows
  // paints. Naming `none` and `transparent` left every zero-alpha spelling counted as ink.
  for (const [label, value] of [
    ["rgba zero alpha", "rgba(0, 0, 0, 0)"],
    ["a four-digit hex with zero alpha", "#0000"],
    ["hsl with zero alpha", "hsl(0 0% 0% / 0)"],
    ["an opaque hex the gate cannot prove", "#C4530F"],
  ]) {
    check(
      "check-lockup-crop.mjs",
      `rejects ${label}`,
      ["--file", stage(`fill-${label.replaceAll(/[^a-z]/g, "-")}`, wrap("1 1 20 20", `<g transform="translate(1 1) scale(2)">
<path fill="${value}" d="${SQUARE}"/>
</g>`))],
      { status: 1, stderr: /cannot prove paints/ },
    )
  }

  check(
    "check-lockup-crop.mjs",
    "rejects a fill=transparent path",
    ["--file", stage("fill-transparent", wrap("1 1 20 20", `<g transform="translate(1 1) scale(2)">\n<path fill="transparent" d="${SQUARE}"/>\n</g>`))],
    { status: 1, stderr: /cannot prove paints/ },
  )

  // `fill` is inherited and the root carries fill="none", so a path that omits the attribute
  // paints nothing. Checking only for an explicit fill="none" counted this geometry as ink.
  check(
    "check-lockup-crop.mjs",
    "rejects a path that inherits fill=none by declaring no fill",
    ["--file", stage("fill-inherited-none", wrap("1 1 20 20", `<g transform="translate(1 1) scale(2)">\n<path d="${SQUARE}"/>\n</g>`))],
    { status: 1, stderr: /declares no fill/ },
  )

  check(
    "check-lockup-crop.mjs",
    "rejects an unquoted attribute value it cannot read",
    ["--file", stage("unquoted", wrap("1 1 20 20", `<g transform="translate(1 1) scale(2)">\n<path opacity=1 fill="currentColor" d="${SQUARE}"/>\n</g>`))],
    { status: 1, stderr: /cannot parse/ },
  )

  check(
    "check-lockup-crop.mjs",
    "rejects a file with no paths rather than passing vacuously",
    ["--file", stage("empty", wrap("0 0 1 1", "<title>nothing</title>"))],
    { status: 1, stderr: /no paths to measure/ },
  )

  check(
    "check-lockup-crop.mjs",
    "reports a missing viewBox rather than passing",
    ["--file", stage("no-viewbox", `<svg xmlns="http://www.w3.org/2000/svg">\n${grouped()}\n</svg>\n`)],
    { status: 1, stderr: /no viewBox/ },
  )

  check(
    "check-lockup-crop.mjs",
    "reports markup that is not well formed",
    ["--file", stage("unclosed", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">\n<g transform="translate(0 0)">\n<path fill="currentColor" d="${SQUARE}"/>\n`)],
    { status: 1, stderr: /never closed/ },
  )

  check("check-lockup-crop.mjs", "prints usage for --help", ["--help"], { status: 0, stdout: /usage: check-lockup-crop/ })
  check("check-lockup-crop.mjs", "rejects --file with no path", ["--file"], { status: 2, stderr: /needs a path/ })

  // The default target is the real asset, so the gate fails loudly if the committed lockup drifts.
  check(
    "check-lockup-crop.mjs",
    "checks the committed lockup by default",
    [],
    { status: 0, stdout: /crop is exact/ },
    { path: toolPath("check-lockup-crop.mjs") },
  )
}
