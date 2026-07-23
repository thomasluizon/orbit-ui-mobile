#!/usr/bin/env node
// Composes every captured artifact into one scannable HTML grid at
// .artifacts/contact-sheet.html, so a reviewer eyeballs 200+ thumbnails in a
// minute instead of trusting a paragraph. Missing cells render as explicit gaps
// -- the sheet shows the shortfall, it never hides it.

import { readFileSync, writeFileSync, statSync, mkdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { evaluateManifest } from "./check-surface-coverage.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const MANIFEST_PATH = join(REPO_ROOT, ".claude", "manifests", "surfaces.json")
const SHEET_PATH = join(REPO_ROOT, ".artifacts", "contact-sheet.html")

const USAGE = `contact-sheet - compose captured surface artifacts into one reviewable HTML grid.

Usage:
  node tools/contact-sheet.mjs [--help]

Writes .artifacts/contact-sheet.html (self-contained: inline CSS, relative <img>
paths). Cells with no valid artifact render as a labelled gap.

Exit codes:
  0  sheet written
  2  manifest absent or unreadable
`

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char])
}

function cellHtml(result) {
  const label = `${result.theme} / ${result.locale}`
  if (!result.ok) {
    return `<figure class="cell gap"><div class="miss"><span class="reason">${escapeHtml(result.reason)}</span></div><figcaption>${escapeHtml(label)}</figcaption></figure>`
  }
  const src = "surfaces/" + result.artifact.split("/").pop()
  return `<figure class="cell"><a href="${escapeHtml(src)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(src)}" alt="${escapeHtml(result.surfaceId + " " + label)}" loading="lazy"></a><figcaption>${escapeHtml(label)}</figcaption></figure>`
}

function surfaceHtml(surfaceId, results) {
  const first = results[0]
  const verified = results.filter((result) => result.ok).length
  const state = verified === results.length ? "complete" : verified === 0 ? "untouched" : "partial"
  return `<section class="surface" data-state="${state}">
  <header><h2>${escapeHtml(surfaceId)}</h2><span class="meta">${escapeHtml(first.kind)} &middot; ${escapeHtml(first.sourceFile)}</span><span class="score ${state}">${verified}/${results.length}</span></header>
  <div class="grid">${results.map(cellHtml).join("")}</div>
</section>`
}

const STYLES = `
:root { color-scheme: dark; --bg:#0b1020; --panel:#141a2e; --line:#243049; --fg:#e6e9f2; --dim:#8d97b0; --ok:#43c08a; --bad:#e2685f; --mid:#e0a64a; }
* { box-sizing: border-box; }
body { margin:0; padding:24px; background:var(--bg); color:var(--fg); font:14px/1.5 ui-sans-serif, system-ui, sans-serif; }
h1 { font-size:20px; margin:0 0 4px; }
.summary { color:var(--dim); margin-bottom:24px; }
.summary strong { color:var(--fg); }
.surface { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px; margin-bottom:16px; }
.surface header { display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
.surface h2 { font-size:15px; margin:0; }
.meta { color:var(--dim); font-size:12px; font-family:ui-monospace, monospace; }
.score { margin-left:auto; font-weight:600; font-size:12px; padding:2px 8px; border-radius:999px; }
.score.complete { color:var(--ok); background:rgba(67,192,138,.12); }
.score.partial { color:var(--mid); background:rgba(224,166,74,.12); }
.score.untouched { color:var(--bad); background:rgba(226,104,95,.12); }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:12px; }
.cell { margin:0; }
.cell img { width:100%; height:200px; object-fit:cover; object-position:top; border-radius:8px; border:1px solid var(--line); background:#000; display:block; }
.cell figcaption { color:var(--dim); font-size:11px; margin-top:6px; font-family:ui-monospace, monospace; }
.miss { height:200px; border-radius:8px; border:1px dashed var(--bad); display:flex; align-items:center; justify-content:center; background:rgba(226,104,95,.06); }
.reason { color:var(--bad); font-size:12px; font-family:ui-monospace, monospace; }
`

function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    process.stdout.write(USAGE)
    return 0
  }

  let manifest
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
  } catch (error) {
    process.stderr.write(`contact-sheet: cannot read the manifest (${error.message}). Run: npm run surfaces:manifest\n`)
    return 2
  }

  const verdict = evaluateManifest(manifest)
  const byId = new Map()
  const failuresByArtifact = new Map(verdict.failures.map((failure) => [failure.artifact, failure]))

  for (const cell of manifest.cells) {
    const artifact = `.artifacts/surfaces/${cell.surfaceId}--${cell.theme}--${cell.locale}.png`
    const failure = failuresByArtifact.get(artifact)
    const result = { ...cell, artifact, ok: !failure, reason: failure?.reason ?? null }
    if (!byId.has(cell.surfaceId)) byId.set(cell.surfaceId, [])
    byId.get(cell.surfaceId).push(result)
  }

  const ordered = [...byId.entries()].sort((a, b) => {
    const scoreOf = (results) => results.filter((result) => result.ok).length / results.length
    return scoreOf(a[1]) - scoreOf(b[1]) || a[0].localeCompare(b[0])
  })

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Orbit surface contact sheet</title><style>${STYLES}</style></head>
<body>
<h1>Orbit surface contact sheet</h1>
<p class="summary"><strong>${verdict.verified}/${verdict.total}</strong> cells verified across ${byId.size} surfaces &middot; manifest @ ${escapeHtml(verdict.generatedFrom)} &middot; generated ${escapeHtml(new Date().toISOString())}<br>Least-complete surfaces first. A gap means no valid artifact on disk, which means that surface is not done.</p>
${ordered.map(([surfaceId, results]) => surfaceHtml(surfaceId, results)).join("\n")}
</body></html>
`

  mkdirSync(dirname(SHEET_PATH), { recursive: true })
  writeFileSync(SHEET_PATH, html, "utf8")
  const { size } = statSync(SHEET_PATH)
  process.stdout.write(`wrote .artifacts/contact-sheet.html (${size} bytes, ${verdict.verified}/${verdict.total} cells verified)\n`)
  return 0
}

process.exit(main())
