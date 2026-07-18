#!/usr/bin/env node
// Derives the visual-surface inventory from the codebase and writes
// .claude/manifests/surfaces.json. The manifest holds the EXPECTED inventory
// only: it carries NO status field, because completion is derived by
// tools/check-surface-coverage.mjs from artifacts on disk, never from a value a
// model can write. See .claude/rules/visual-delivery.md rules 1 and 5.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { dirname, join, relative, resolve, basename } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const MANIFEST_PATH = join(REPO_ROOT, ".claude", "manifests", "surfaces.json")
const WEB_APP_DIR = join(REPO_ROOT, "apps", "web", "app")
const WEB_COMPONENTS_DIR = join(REPO_ROOT, "apps", "web", "components")
const MULTI_VIEW_ROOT = "apps/web/app/(app)/page.tsx"
const VIEW_SOURCE = "apps/web/app/(app)/use-today-view-state.ts"

const THEMES = ["light", "dark"]
const LOCALES = ["en", "pt-BR"]
const OVERLAY_PATTERN = /(modal|dialog|sheet|drawer)/i

const USAGE = `surface-manifest - derive the visual-surface inventory from the codebase.

Usage:
  node tools/surface-manifest.mjs [--json] [--help]

Writes .claude/manifests/surfaces.json: { generatedFrom, generatedAt, themes,
locales, surfaceCount, cellCount, cells[] }. Each cell is
{ surfaceId, kind, sourceFile, theme, locale, href, needsOpener }.

There is deliberately no status field. Completion is computed from artifacts on
disk by tools/check-surface-coverage.mjs.

Flags:
  --json   print the manifest to stdout instead of a human summary
  --help   this text

Exit codes:
  0  manifest written
  1  inventory could not be derived (missing tree, duplicate surface id)
`

function toPosix(absolutePath) {
  return relative(REPO_ROOT, absolutePath).split("\\").join("/")
}

function walk(dir) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const found = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue
      found.push(...walk(full))
    } else if (entry.isFile()) {
      found.push(full)
    }
  }
  return found
}

function gitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim()
  } catch {
    return "unknown"
  }
}

function slug(value) {
  return value
    .replace(/\[(\.\.\.)?([^\]]+)\]/g, "$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
}

/**
 * Route identity for an app-router page file, with (group) segments dropped.
 * `href` is null when a dynamic segment makes the URL unresolvable without a
 * real id; `label` always names the route for the surface id.
 */
export function routeIdentityFor(posixPath) {
  const segments = posixPath
    .replace(/^apps\/web\/app\/?/, "")
    .replace(/\/?page\.tsx$/, "")
    .split("/")
    .filter((segment) => segment.length > 0 && !/^\(.+\)$/.test(segment))

  const isDynamic = segments.some((segment) => segment.startsWith("["))
  return { href: isDynamic ? null : "/" + segments.join("/"), label: segments.join("/") }
}

/** The multi-view root's view names, parsed from its TAB_VIEWS tuple. */
export function readRootViews(source) {
  const match = source.match(/const\s+TAB_VIEWS\s*=\s*\[([^\]]+)\]/)
  if (!match) throw new Error(`could not parse TAB_VIEWS from ${VIEW_SOURCE}`)
  return [...match[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] ?? m[2])
}

function collectSurfaces() {
  const surfaces = []

  const pageFiles = walk(WEB_APP_DIR)
    .map(toPosix)
    .filter((path) => path.endsWith("/page.tsx"))
    .sort()

  if (pageFiles.length === 0) throw new Error(`no page.tsx found under ${toPosix(WEB_APP_DIR)}`)

  for (const sourceFile of pageFiles) {
    if (sourceFile === MULTI_VIEW_ROOT) {
      const viewSourceAbs = join(REPO_ROOT, VIEW_SOURCE)
      const views = readRootViews(readFileSync(viewSourceAbs, "utf8"))
      for (const view of views) {
        surfaces.push({
          surfaceId: `view-${slug(view)}`,
          kind: "view",
          sourceFile,
          href: "/",
          needsOpener: false,
          viewState: view,
        })
      }
      continue
    }

    const { href, label } = routeIdentityFor(sourceFile)
    surfaces.push({
      surfaceId: `route-${slug(label) || "root"}`,
      kind: "route",
      sourceFile,
      href,
      needsOpener: href === null,
    })
  }

  const overlayFiles = [...walk(WEB_COMPONENTS_DIR), ...walk(WEB_APP_DIR)]
    .map(toPosix)
    .filter((path) => path.endsWith(".tsx") && OVERLAY_PATTERN.test(basename(path)))
    .filter((path) => path.startsWith("apps/web/components/") || /\/_components\//.test(path))
    .sort()

  for (const sourceFile of overlayFiles) {
    surfaces.push({
      surfaceId: `overlay-${slug(basename(sourceFile, ".tsx"))}`,
      kind: "overlay",
      sourceFile,
      href: null,
      needsOpener: true,
    })
  }

  const seen = new Map()
  for (const surface of surfaces) {
    const previous = seen.get(surface.surfaceId)
    if (previous) throw new Error(`duplicate surfaceId "${surface.surfaceId}": ${previous} and ${surface.sourceFile}`)
    seen.set(surface.surfaceId, surface.sourceFile)
    statSync(join(REPO_ROOT, surface.sourceFile))
  }

  return surfaces
}

function buildManifest() {
  const surfaces = collectSurfaces()
  const cells = []
  for (const surface of surfaces) {
    for (const theme of THEMES) {
      for (const locale of LOCALES) {
        cells.push({ ...surface, theme, locale })
      }
    }
  }

  return {
    generatedFrom: gitSha(),
    generatedAt: new Date().toISOString(),
    themes: THEMES,
    locales: LOCALES,
    surfaceCount: surfaces.length,
    cellCount: cells.length,
    cells,
  }
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(USAGE)
    return 0
  }

  let manifest
  try {
    manifest = buildManifest()
  } catch (error) {
    process.stderr.write(`surface-manifest: ${error.message}\n`)
    return 1
  }

  mkdirSync(dirname(MANIFEST_PATH), { recursive: true })
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8")

  if (args.includes("--json")) {
    process.stdout.write(JSON.stringify(manifest, null, 2) + "\n")
    return 0
  }

  const byKind = manifest.cells.reduce((acc, cell) => {
    acc[cell.kind] = (acc[cell.kind] ?? 0) + 1
    return acc
  }, {})

  process.stdout.write(`wrote ${toPosix(MANIFEST_PATH)}\n`)
  process.stdout.write(`  git sha      ${manifest.generatedFrom}\n`)
  process.stdout.write(`  surfaces     ${manifest.surfaceCount}\n`)
  process.stdout.write(`  cells        ${manifest.cellCount} (${THEMES.length} themes x ${LOCALES.length} locales)\n`)
  for (const [kind, count] of Object.entries(byKind).sort()) {
    process.stdout.write(`    ${kind.padEnd(8)} ${count / (THEMES.length * LOCALES.length)} surfaces / ${count} cells\n`)
  }
  return 0
}

process.exit(main())
