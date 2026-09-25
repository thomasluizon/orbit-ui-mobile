#!/usr/bin/env node
// Derives the visual-surface inventory for BOTH apps and writes
// .claude/manifests/surfaces.json. The manifest is the DENOMINATOR: the
// complete list of things a whole-app visual pass must touch. It is committed,
// so the denominator survives between sessions instead of being rediscovered.
//
// What changed on 2026-07-19 (the harness rebuild) and why:
//
// 1. BOTH PLATFORMS. The previous inventory globbed apps/web only, so all 224
//    cells were web and apps/mobile (451 files, larger than web) was invisible
//    while the number was read as whole-app coverage. Mobile routes are
//    enumerated from expo-router's app/ directory here, and every output
//    states its own platform scope.
// 2. THE COMPONENT GRAPH, NOT FILENAMES. Overlays used to be found with
//    /(modal|dialog|sheet|drawer)/i over basenames, which silently missed the
//    command palette and the onboarding wizard (it lives inside layout.tsx).
//    An overlay is now any component that RENDERS an overlay primitive,
//    detected by walking import edges - a file is what it imports, not what it
//    is called.
// 3. A STATE AXIS. There was none, so empty/error states were structurally
//    unphotographable and a human found an empty-state defect in 10 seconds
//    that ~100 judge votes never saw. A surface that imports an empty-state
//    component now carries an `empty` cell too.
// 4. FROZEN OWNERSHIP. Each surface records the files it exclusively owns.
//    Ownership is computed here and COMMITTED rather than recomputed at check
//    time: reach-count is a global property, so an unrelated second surface
//    importing a shared file would otherwise silently un-own it and move a
//    third surface's status with nobody editing it. Regenerating the manifest
//    is a visible git diff; a silent recompute is not.
//
// There is deliberately no status field, and no field describing what evidence
// a cell could carry. D13 retired the per-cell completion oracle and forbids
// rebuilding one; #422 then deleted the last capture tooling. This file is an
// INVENTORY of surfaces and their ownership, and nothing here records, implies,
// or grants completion. tools/redesign-coverage.mjs validates the group
// assignments; visual completion requires review of the running app.

import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = process.env.ORBIT_SURFACE_ROOT
  ? resolve(process.env.ORBIT_SURFACE_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..")
const MANIFEST_PATH = join(REPO_ROOT, ".claude", "manifests", "surfaces.json")

const THEMES = ["light", "dark"]
const LOCALES = ["en", "pt-BR"]

// The commit the whole-app pass started from. A surface whose owned files have
// the same visual signature here and at HEAD cannot have been worked on.
const DEFAULT_BASELINE_REF = "7d7c42c3"

const SOURCE_EXTENSIONS = [".tsx", ".ts", ".css"]

// How many surfaces may reach a file before it stops counting as any one
// surface's own work.
//
// This is 1, and the value is load-bearing. Raising it to 2 was tried on
// 2026-07-19 to fix a real hole (a component two sibling surfaces share is
// owned by neither, so editing it moves nothing) and it immediately broke the
// property that matters more: `route-explore`, which is byte-identical to the
// pre-#539 baseline, flipped to touched 4/4 because a single nav component it
// shares with one other surface had changed. A relaxed bound leaks the shared
// shell back in one hop at a time.
//
// The hole is therefore ACCEPTED and documented rather than fixed: a file
// reached by 2+ surfaces belongs to none of them, so work confined to such a
// file does not move any surface's touched flag. Since `touched` can only
// VETO and never grant, the cost is a surface that stays vetoed until
// something it exclusively owns changes - conservative in the safe direction.
const OWNERSHIP_MAX_REACH = 1
const SHARED_ALIAS = ["@orbit/shared/", "packages/shared/src/"]

// A component is an overlay when it DIRECTLY pulls in one of the real overlay
// bases, or mounts its own portal/modal. Direct imports matter: transitive
// reachability makes every page an "overlay" (the app shell reaches a dialog),
// which is how a first cut of this file produced 15 false overlays and lost all
// 24 real ones. These module names were read out of the codebase, not guessed.
// R1 (#42) collapsed the five web bases and the two mobile ones into a single
// `Sheet` per platform, so one list serves both: the same five modules exist
// under `components/ui/` on web and on mobile. `sheet` is the base; the
// other four are the wrappers a caller actually imports, and each one presents
// through `sheet` rather than beside it. A caller that imports `confirm-sheet`
// never imports `sheet`, and this check is deliberately direct-import only, so
// omitting a wrapper drops every one of its callers from the inventory.
//
// `step-up` is NOT here on purpose: it renders inline content with no sheet, no
// portal and no modal, and a caller places it INSIDE a `Sheet`. Listing it would
// count the caller twice and count `step-up` itself as a surface it is not.
const OVERLAY_BASES = [
  "components/ui/sheet",
  "components/ui/menu",
  "components/ui/confirm-sheet",
  "components/ui/date-field",
  "components/ui/time-field",
]

// The command palette mounts its own portal and imports no overlay base, so a
// base-import check alone misses it entirely - that miss is one of the named
// inventory holes this rebuild had to close.
const WEB_SELF_MOUNTED_OVERLAY = /\bcreatePortal\b/
const MOBILE_SELF_MOUNTED_OVERLAY = /<Modal[\s/>]/

// A surface importing one of these renders a distinct empty state worth its own cell.
const EMPTY_STATE_MARKERS = ["empty-state", "empty-view", "no-results"]

const USAGE = `surface-manifest - derive the visual-surface inventory for web AND mobile.

Usage:
  node tools/surface-manifest.mjs [--baseline <ref>] [--json | --check] [--help]

Writes .claude/manifests/surfaces.json (committed). Each cell is
{ surfaceId, platform, kind, state, sourceFile, theme, locale, href }.
Each surface additionally records { ownedFiles } - the files no other surface
reaches - frozen at generation time.

Flags:
  --baseline  the pre-redesign ref surfaces are compared against (default ${DEFAULT_BASELINE_REF})
  --json      print the manifest to stdout instead of a human summary
  --check     write nothing; compare the committed manifest against this tree and exit 1 on drift
  --help      this text

Exit codes:
  0  manifest written, or --check found no drift
  1  inventory could not be derived (missing tree, duplicate surface id), or --check found drift
  2  usage error
`

const toPosix = (absolutePath) => relative(REPO_ROOT, absolutePath).split("\\").join("/")

function walk(dir, found = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "__tests__") continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, found)
    else found.push(full)
  }
  return found
}

function resolveSpecifier(specifier, fromFile) {
  let base = null
  if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier)
  else if (specifier.startsWith("@/")) {
    const sourcePath = toPosix(fromFile)
    const appRoot = sourcePath.startsWith("apps/mobile/") ? "apps/mobile/" : "apps/web/"
    base = resolve(REPO_ROOT, appRoot + specifier.slice(2))
  } else if (specifier.startsWith(SHARED_ALIAS[0])) {
    base = resolve(REPO_ROOT, SHARED_ALIAS[1] + specifier.slice(SHARED_ALIAS[0].length))
  }
  if (!base) return null
  // Only real source files may enter a closure. Resolving a bare specifier used
  // to admit `apps/web/package.json` (about/page.tsx imports it for the version
  // string), which no other surface reaches - so route-about "owned" it, and
  // any dependency bump moved that surface's signature with zero pixels
  // changed. A manifest is not a render-affecting file.
  const candidates = [
    ...SOURCE_EXTENSIONS.map((extension) => base + extension),
    ...SOURCE_EXTENSIONS.map((extension) => join(base, "index" + extension)),
    ...(SOURCE_EXTENSIONS.some((extension) => base.endsWith(extension)) ? [base] : []),
  ]
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate
    } catch {
      continue
    }
  }
  return null
}

const IMPORT_PATTERN =
  /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const importCache = new Map()

function importsOf(absolutePath) {
  const cached = importCache.get(absolutePath)
  if (cached) return cached
  let source = ""
  try {
    source = readFileSync(absolutePath, "utf8")
  } catch {
    /* unreadable files contribute no edges */
  }
  const edges = []
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const resolved = resolveSpecifier(match[1] ?? match[2], absolutePath)
    if (resolved) edges.push(resolved)
  }
  importCache.set(absolutePath, edges)
  return edges
}

/** Every source file transitively reachable from an entry file, including itself. */
export function closureOf(entryAbsolute) {
  const seen = new Set()
  const stack = [entryAbsolute]
  while (stack.length > 0) {
    const file = stack.pop()
    if (!file || seen.has(file)) continue
    seen.add(file)
    for (const edge of importsOf(file)) stack.push(edge)
  }
  return seen
}

function slug(value) {
  return value
    .replace(/\[(\.\.\.)?([^\]]+)\]/g, "$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
}

/** Route identity for a Next.js app-router page, with (group) segments dropped. */
export function webRouteIdentity(posixPath) {
  const segments = posixPath
    .replace(/^apps\/web\/app\/?/, "")
    .replace(/\/?page\.tsx$/, "")
    .split("/")
    .filter((segment) => segment.length > 0 && !/^\(.+\)$/.test(segment))
  const isDynamic = segments.some((segment) => segment.startsWith("["))
  return { href: isDynamic ? null : "/" + segments.join("/"), label: segments.join("/") }
}

/**
 * Route identity for an expo-router screen file. The (group) segments are
 * dropped from the URL but KEPT in the label, because `(onboarding)/index` and
 * `(tabs)/index` are two different screens that collide without them.
 */
export function mobileRouteIdentity(posixPath) {
  const all = posixPath.replace(/^apps\/mobile\/app\/?/, "").replace(/\.tsx$/, "").split("/").filter(Boolean)
  const routable = all.filter((segment) => !/^\(.+\)$/.test(segment))
  const href = "/" + routable.join("/").replace(/\/?index$/, "")
  return { href, label: all.join("/") || "index" }
}

/**
 * True when this file is itself an overlay: it directly imports an overlay base
 * for its platform, or mounts its own portal/modal.
 * @param {string} posixPath repo-relative path
 * @param {string[]} bases overlay base module fragments for the platform
 * @param {RegExp} selfMounted pattern for a component that mounts its own overlay
 */
export function isOverlaySource(posixPath, bases, selfMounted) {
  if (bases.some((base) => posixPath.includes(base))) return true
  const absolute = join(REPO_ROOT, posixPath)
  for (const edge of importsOf(absolute)) {
    const target = toPosix(edge)
    if (bases.some((base) => target.includes(base))) return true
  }
  let source = ""
  try {
    source = readFileSync(absolute, "utf8")
  } catch {
    return false
  }
  return selfMounted.test(source)
}

function hasEmptyState(closure) {
  for (const file of closure) {
    const posix = toPosix(file).toLowerCase()
    if (EMPTY_STATE_MARKERS.some((marker) => posix.includes(marker))) return true
  }
  return false
}

function hasDefaultExport(sourceFile) {
  let source = ""
  try {
    source = readFileSync(join(REPO_ROOT, sourceFile), "utf8")
  } catch {
    return false
  }
  return /\bexport\s+default\b|\bexport\s*\{[^}]*\bas\s+default\b[^}]*\}/s.test(source)
}

function specialSurfaceLabel(sourceFile, filename) {
  const pathWithoutRoot = sourceFile.replace(/^apps\/web\/app\/?/, "").replace(new RegExp(`\/?${filename}\\.tsx$`), "")
  const segments = pathWithoutRoot.split("/").filter(Boolean).map((segment) => segment.replace(/^\((.+)\)$/, "$1"))
  return slug(segments.join("-")) || "root"
}

function chatBlockEntries(platform, routeSurfaceId, hostSourceFile) {
  const hostClosure = closureOf(join(REPO_ROOT, hostSourceFile))
  const componentsRoot = join(REPO_ROOT, "apps", platform, "components")
  // Sorted AFTER the conversion, never before it. An absolute path carries the platform separator,
  // and `\` (0x5C) sorts after `/` (0x2F), so a Windows run and a Linux run can order two absolute
  // paths differently. The condition is narrower than "a directory name prefixes a sibling file
  // name": the character right after the shared prefix has to sort BETWEEN those two bytes. A
  // sibling `chat2.tsx` flips, because `2` is 0x32; a sibling `chat-header.tsx` never flips,
  // because `-` is 0x2D and sorts before both separators.
  const candidates = walk(join(componentsRoot, "chat"))
    .concat(join(componentsRoot, "shell", "composer.tsx"))
    .concat(platform === "mobile" ? [join(REPO_ROOT, "apps", "mobile", "components", "message-bubble.tsx")] : [])
    .filter((file) => file.endsWith(".tsx") && hostClosure.has(file) && file !== join(REPO_ROOT, hostSourceFile))
    .map(toPosix)
    .sort()

  return candidates.map((sourceFile) => {
    const componentsMarker = platform === "web" ? "apps/web/components/chat/" : "apps/mobile/components/chat/"
    const label = sourceFile.startsWith(componentsMarker)
      ? sourceFile.slice(componentsMarker.length).replace(/\.tsx$/, "")
      : sourceFile.split("/").at(-1).replace(/\.tsx$/, "")
    return {
      surfaceId: `${platform === "mobile" ? "m-" : ""}block-chat-${slug(label)}`,
      platform,
      kind: "block",
      sourceFile,
      href: "/chat",
      parentSurfaceId: routeSurfaceId,
    }
  })
}

function webEntries() {
  const appDir = join(REPO_ROOT, "apps", "web", "app")
  const componentsDir = join(REPO_ROOT, "apps", "web", "components")
  const surfaces = []

  const pages = walk(appDir)
    .map(toPosix)
    .filter((path) => path.endsWith("/page.tsx"))
    .sort()
  if (pages.length === 0) throw new Error("no page.tsx found under apps/web/app")

  for (const sourceFile of pages) {
    const { href, label } = webRouteIdentity(sourceFile)
    const surface = { surfaceId: `route-${slug(label) || "root"}`, platform: "web", kind: "route", sourceFile, href }
    if (surface.surfaceId === "route-explore" || surface.surfaceId === "route-insights") {
      surface.counterpart = {
        status: "web-only",
        reason: "No mobile route exists; redesign coverage must account for this platform divergence.",
      }
    }
    surfaces.push(surface)
  }

  const errorFiles = walk(appDir)
    .map(toPosix)
    .filter((path) => path === "apps/web/app/global-error.tsx" || path.endsWith("/error.tsx"))
    .sort()
  for (const sourceFile of errorFiles) {
    const label = specialSurfaceLabel(sourceFile, "error")
    surfaces.push({ surfaceId: `error-${label}`, platform: "web", kind: "error", sourceFile, href: null })
  }

  const notFoundFiles = walk(appDir)
    .map(toPosix)
    .filter((path) => path === "apps/web/app/not-found.tsx" || path.endsWith("/not-found.tsx"))
    .sort()
  for (const sourceFile of notFoundFiles) {
    const label = specialSurfaceLabel(sourceFile, "not-found")
    surfaces.push({ surfaceId: `not-found-${label}`, platform: "web", kind: "not-found", sourceFile, href: null })
  }

  surfaces.push(...chatBlockEntries("web", "route-chat", "apps/web/app/(app)/layout.tsx"))

  // Overlays and any other non-route surface, found by what a component
  // RENDERS rather than by what it is named. This is what makes the command
  // palette and the layout-hosted onboarding wizard visible at all.
  const candidates = [...walk(componentsDir), ...walk(appDir)]
    .map(toPosix)
    .filter((path) => path.endsWith(".tsx") && !path.endsWith("/page.tsx"))
    .sort()
  const routeSourceFiles = new Set(surfaces.map((surface) => surface.sourceFile))

  for (const sourceFile of candidates) {
    if (routeSourceFiles.has(sourceFile)) continue
    if (!isOverlaySource(sourceFile, OVERLAY_BASES, WEB_SELF_MOUNTED_OVERLAY)) continue
    surfaces.push({ surfaceId: `overlay-${slug(overlayName(sourceFile))}`, platform: "web", kind: "overlay", sourceFile, href: null })
  }
  return surfaces
}

// Two overlays can share a basename across directories (profile/edit-name-sheet
// vs social/edit-name-sheet), so the id carries enough parent path to stay
// unique. Collisions are a hard error in buildManifest, never a silent drop.
function overlayName(sourceFile) {
  const parts = sourceFile.replace(/\.tsx$/, "").split("/")
  return parts.slice(-2).join("-")
}

function mobileEntries() {
  const appDir = join(REPO_ROOT, "apps", "mobile", "app")
  const componentsDir = join(REPO_ROOT, "apps", "mobile", "components")
  const surfaces = []

  // expo-router treats every .tsx under app/ as a route EXCEPT layouts and the
  // private _components/ folders, which are implementation detail.
  const screens = walk(appDir)
    .map(toPosix)
    .filter(
      (path) =>
        path.endsWith(".tsx") &&
        !/\/_layout\.tsx$/.test(path) &&
        !/\/_components\//.test(path) &&
        !/\/\+not-found\.tsx$/.test(path) &&
        hasDefaultExport(path),
    )
    .sort()

  for (const sourceFile of screens) {
    const { href, label } = mobileRouteIdentity(sourceFile)
    surfaces.push({ surfaceId: `m-route-${slug(label)}`, platform: "mobile", kind: "route", sourceFile, href })
  }

  const notFoundSource = "apps/mobile/app/+not-found.tsx"
  if (hasDefaultExport(notFoundSource)) {
    surfaces.push({ surfaceId: "m-not-found-root", platform: "mobile", kind: "not-found", sourceFile: notFoundSource, href: null })
  }

  const errorSource = "apps/mobile/components/ui/app-error-boundary.tsx"
  if (hasDefaultExport(errorSource) || statExists(errorSource)) {
    surfaces.push({ surfaceId: "m-error-root", platform: "mobile", kind: "error", sourceFile: errorSource, href: null })
  }

  surfaces.push(...chatBlockEntries("mobile", "m-route-chat", "apps/mobile/app/_layout.tsx"))

  const candidates = [...walk(componentsDir), ...walk(appDir)]
    .map(toPosix)
    .filter((path) => path.endsWith(".tsx"))
    .sort()
  const screenSet = new Set(screens)
  const globalOverlayHost = join(REPO_ROOT, "apps", "mobile", "components", "global-overlays.tsx")
  const nonSurfaceHostImports = new Set([
    "apps/mobile/components/onboarding/onboarding-actions-context.tsx",
    "apps/mobile/components/tour/tour-provider.tsx",
  ])
  const globalOverlaySources = new Set(
    importsOf(globalOverlayHost)
      .map(toPosix)
      .filter((path) => path.startsWith("apps/mobile/components/") && path.endsWith(".tsx") && !nonSurfaceHostImports.has(path)),
  )
  for (const sourceFile of candidates) {
    if (screenSet.has(sourceFile)) continue
    if (!globalOverlaySources.has(sourceFile) && !isOverlaySource(sourceFile, OVERLAY_BASES, MOBILE_SELF_MOUNTED_OVERLAY)) continue
    surfaces.push({ surfaceId: `m-overlay-${slug(overlayName(sourceFile))}`, platform: "mobile", kind: "overlay", sourceFile, href: null })
  }

  // The widget is the one surface whose ownership comes from a directory rather than from import
  // edges, so it is the one place a file that is not in git can reach the manifest. git answers
  // that question exactly, where a hand-written path list only guesses at it: .gitignore already
  // ignores apps/mobile/modules/*/android/local.properties, which Android Studio writes on first
  // open, and the directory exclusions below never named it. A regeneration on a machine that had
  // opened the Android project would then disagree with the CI one over an untracked file, and
  // Surface Manifest Drift would go red on a pull request whose author cannot reproduce it.
  // check-copy.mjs and check-dashes.mjs already enumerate the tree through `git ls-files`.
  // The build-tree exclusion below can no longer fire against this repository: .gitignore ignores
  // apps/mobile/modules/*/android/{build,.gradle,.cxx}, so `git ls-files` never lists one. It stays
  // as the guard for the one way such a path could still arrive, a `git add -f` on a build artifact.
  const widgetFiles = trackedFiles("apps/mobile/modules/orbit-widget")
    .filter(
      (path) =>
        !path.includes("/ios/") &&
        !/\/android\/(?:build|\.gradle|\.cxx)\//.test(path) &&
        !path.endsWith(".web.ts") &&
        !path.endsWith(".web.tsx"),
    )
    .sort()
  const widgetSource = "apps/mobile/modules/orbit-widget/android/src/main/res/layout/widget_layout.xml"
  if (widgetFiles.includes(widgetSource)) {
    surfaces.push({
      surfaceId: "m-widget-orbit-widget",
      platform: "mobile",
      kind: "widget",
      sourceFile: widgetSource,
      href: null,
      ownedFilesOverride: widgetFiles,
    })
  }
  return surfaces
}

function statExists(sourceFile) {
  try {
    return statSync(join(REPO_ROOT, sourceFile)).isFile()
  } catch {
    return false
  }
}

/** Attach each surface's frozen exclusive-ownership set and its state axis. */
function attachOwnershipAndStates(surfaces) {
  const closures = new Map()
  for (const surface of surfaces) closures.set(surface.surfaceId, closureOf(join(REPO_ROOT, surface.sourceFile)))

  const reachCount = new Map()
  for (const closure of closures.values())
    for (const file of closure) reachCount.set(file, (reachCount.get(file) ?? 0) + 1)

  for (const surface of surfaces) {
    const closure = closures.get(surface.surfaceId)
    // Ownership is NARROW but not strictly exclusive. Strict exclusivity
    // (reach === 1) orphaned real files: the eight onboarding STEP components
    // are reached by both the onboarding flow and the app layout, so they
    // belonged to no surface and editing them moved nothing. Anything reached
    // by at most OWNERSHIP_MAX_REACH surfaces is attributed to each of them -
    // both genuinely changed when it changes. The shared app shell sits far
    // above this bound (~100 reachers), so it still belongs to nobody, which
    // is what keeps an untouched surface untouched.
    const owned = surface.ownedFilesOverride
      ? surface.ownedFilesOverride
      : [...closure].filter((file) => reachCount.get(file) <= OWNERSHIP_MAX_REACH).map(toPosix).sort()
    // A surface that owns nothing under that bound (a thin re-export) still
    // owns its own entry file for the purposes of "was this worked on".
    surface.ownedFiles = owned.length > 0 ? owned : [surface.sourceFile]
    surface.states = hasEmptyState(closure) ? ["default", "empty"] : ["default"]
  }
  return surfaces
}

/**
 * Every tracked path under a directory, repository-relative and posix-separated. `-z` is what
 * keeps it faithful: without it git C-quotes any path outside plain ASCII, and the quoted string
 * would not match the tree it names. The Set is for an unresolved merge: `git ls-files` prints an
 * unmerged path once per index stage, so a regeneration during a widget conflict would otherwise
 * write the same path two or three times into ownedFiles.
 */
function trackedFiles(pathspec) {
  const listed = execFileSync("git", ["ls-files", "-z", "--", pathspec], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean)
  return [...new Set(listed)]
}

function gitSha(ref) {
  try {
    return execFileSync("git", ["rev-parse", ref], { cwd: REPO_ROOT, encoding: "utf8" }).trim()
  } catch {
    return null
  }
}

function buildManifest(baselineRef) {
  const surfaces = attachOwnershipAndStates([...webEntries(), ...mobileEntries()])

  const seen = new Map()
  for (const surface of surfaces) {
    const previous = seen.get(surface.surfaceId)
    if (previous) throw new Error(`duplicate surfaceId "${surface.surfaceId}": ${previous} and ${surface.sourceFile}`)
    seen.set(surface.surfaceId, surface.sourceFile)
  }

  const cells = []
  for (const surface of surfaces)
    for (const state of surface.states)
      for (const theme of THEMES)
        for (const locale of LOCALES) {
          const { states, ownedFilesOverride, ...rest } = surface
          cells.push({ ...rest, state, theme, locale })
        }

  const resolvedBaseline = gitSha(baselineRef)
  if (!resolvedBaseline) throw new Error(`baseline ref "${baselineRef}" does not resolve - pass --baseline <ref>`)

  return {
    baselineRef,
    baselineSha: resolvedBaseline,
    themes: THEMES,
    locales: LOCALES,
    platforms: ["web", "mobile"],
    surfaceCount: surfaces.length,
    cellCount: cells.length,
    cells,
  }
}

function cellsBySurfaceId(manifest) {
  const bySurfaceId = new Map()
  for (const cell of Array.isArray(manifest.cells) ? manifest.cells : []) {
    const records = bySurfaceId.get(cell?.surfaceId) ?? []
    records.push(cell)
    bySurfaceId.set(cell?.surfaceId, records)
  }
  return bySurfaceId
}

/** Every way the committed inventory disagrees with one derived from the tree, named precisely. */
export function inventoryDifferences(committed, current) {
  const differences = []
  for (const field of [...new Set([...Object.keys(committed), ...Object.keys(current)])].sort()) {
    if (field === "cells") continue
    const before = JSON.stringify(committed[field])
    const after = JSON.stringify(current[field])
    if (before !== after) differences.push(`${field}: committed ${before}, derived from this tree ${after}`)
  }
  const committedCells = cellsBySurfaceId(committed)
  const currentCells = cellsBySurfaceId(current)
  for (const surfaceId of [...currentCells.keys()].sort()) {
    if (!committedCells.has(surfaceId)) differences.push(`surface missing from the committed manifest: ${surfaceId}`)
  }
  for (const surfaceId of [...committedCells.keys()].sort()) {
    if (!currentCells.has(surfaceId)) differences.push(`committed surface no longer exists in the tree: ${surfaceId}`)
  }
  for (const surfaceId of [...currentCells.keys()].sort()) {
    if (!committedCells.has(surfaceId)) continue
    if (JSON.stringify(committedCells.get(surfaceId)) !== JSON.stringify(currentCells.get(surfaceId))) {
      differences.push(`committed surface record no longer matches the tree: ${surfaceId}`)
    }
  }
  return differences
}

function checkCommittedManifest(manifest) {
  let committed
  try {
    committed = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
  } catch (error) {
    process.stderr.write(`surface-manifest: the committed manifest could not be read: ${error.message}\n`)
    return 1
  }
  const differences = inventoryDifferences(committed, manifest)
  if (differences.length > 0) {
    process.stderr.write(`surface-manifest: the committed inventory does not describe this tree\n`)
    for (const difference of differences) process.stderr.write(`  - ${difference}\n`)
    process.stderr.write(`Regenerate it with: node tools/surface-manifest.mjs\n`)
    return 1
  }
  process.stdout.write(
    `surface-manifest: the committed inventory matches this tree (${manifest.surfaceCount} surfaces, ${manifest.cellCount} cells).\n`,
  )
  return 0
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(USAGE)
    return 0
  }
  const baselineIndex = args.indexOf("--baseline")
  const baselineRef = baselineIndex !== -1 ? args[baselineIndex + 1] : DEFAULT_BASELINE_REF

  const known = new Set(["--baseline", "--json", "--check"])
  const baselineValueIndex = baselineIndex === -1 ? -1 : baselineIndex + 1
  const unknown = args.find((argument, index) => index !== baselineValueIndex && !known.has(argument))
  if (unknown) {
    process.stderr.write(`surface-manifest: unknown argument: ${unknown}\n\n${USAGE}`)
    return 2
  }
  if (args.includes("--check") && args.includes("--json")) {
    process.stderr.write(`surface-manifest: --check and --json cannot be combined\n\n${USAGE}`)
    return 2
  }

  let manifest
  try {
    manifest = buildManifest(baselineRef)
  } catch (error) {
    process.stderr.write(`surface-manifest: ${error.message}\n`)
    return 1
  }

  // Before the first write, so a check can never repair the drift it exists to report.
  if (args.includes("--check")) return checkCommittedManifest(manifest)

  mkdirSync(dirname(MANIFEST_PATH), { recursive: true })
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8")

  if (args.includes("--json")) {
    process.stdout.write(JSON.stringify(manifest, null, 2) + "\n")
    return 0
  }

  const tally = (predicate) => manifest.cells.filter(predicate).length
  process.stdout.write(`wrote ${toPosix(MANIFEST_PATH)}\n`)
  process.stdout.write(`  HEAD         ${gitSha("HEAD") ?? "unknown"}\n`)
  process.stdout.write(`  baseline     ${manifest.baselineRef} (${manifest.baselineSha.slice(0, 8)})\n`)
  process.stdout.write(`  surfaces     ${manifest.surfaceCount}\n`)
  process.stdout.write(`  cells        ${manifest.cellCount} (state x ${THEMES.length} themes x ${LOCALES.length} locales)\n`)
  for (const platform of manifest.platforms) {
    const surfaces = new Set(manifest.cells.filter((cell) => cell.platform === platform).map((cell) => cell.surfaceId))
    process.stdout.write(`    ${platform.padEnd(7)} ${String(surfaces.size).padStart(3)} surfaces / ${String(tally((cell) => cell.platform === platform)).padStart(4)} cells\n`)
  }
  for (const state of ["default", "empty"]) {
    process.stdout.write(`    state=${state.padEnd(8)} ${tally((cell) => cell.state === state)} cells\n`)
  }
  return 0
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) process.exit(main())
