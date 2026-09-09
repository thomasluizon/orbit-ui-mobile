#!/usr/bin/env node
// Generates architecture.json, architecture.html and architecture.mmd at the
// repo root: the DERIVED architecture map (D12) an agent reads INSTEAD of
// exploring the codebase, the page Thomas reads instead of the JSON, and the
// Mermaid flowchart of the dependency graph.
//
// NONE OF THE THREE IS COMMITTED, and that is the whole of
// thomasluizon/orbit-tickets#470, settled together with #232. Storing a
// whole-file regeneration and gating on its exact bytes made the pair a
// guaranteed conflict between any two branches that touch module structure.
// Measured on one night, 2026-09-08: pull request 842 needed THREE base merges
// whose only conflict was architecture.html, each one invalidating
// pullfrog-approval and buying another forty-minute review cycle; 871 needed the
// same; 865, 867 and 872 carried the pair inside larger conflict lists; 874 and
// 875 went red on `Architecture map drift` alone. None of that was a defect in
// anybody's code. It was the cost of the storage choice.
//
// The two alternatives were weighed and refused. A `.gitattributes` `merge=ours`
// driver needs `git config merge.<name>.driver` set locally, which is not
// committed, so it silently does not apply for anyone who did not configure it,
// and where it does apply it turns a loud conflict into a quietly stale file.
// Having CI regenerate and push the refresh onto the pull request branch
// invalidates pullfrog-approval on every push, which automates the exact cost
// measured above.
//
// So the map is generated on demand. `CLAUDE.md` still tells every agent to read
// it instead of exploring the codebase; the path it names is one command,
// `node tools/arch-map.mjs`, and CI publishes the three files as a build
// artifact for anyone who does not want to run it.
//
// PROVENANCE (#232) is what makes an on-demand artifact trustworthy. The first
// key of architecture.json is a provenance block whose `generatedFrom` is a
// sha256 over every input path the generator actually read, concatenated with
// that file's contents, truncated to 12 hex characters. No clock and no git SHA:
// a wall-clock stamp changes on every run, and a HEAD SHA can never be the SHA
// of the commit that will contain the file. The hash changes if and only if an
// input the map depends on changes, so a reader holding a copy can tell whether
// it came from the tree in front of them. The input list is the RECORDED read
// set rather than a second glob, because a hand-kept list silently stops
// covering new files, which is the class of defect #232 was filed against.
//
// Five sections, every one computed from the tree, none hand-maintained:
//   1. routes        - web (Next App Router) + mobile (expo-router) routes,
//                      parity pairs, and the UNPAIRED lists (the mismatch is
//                      the signal the parity contract needs, so it is never
//                      hidden).
//   2. endpoints     - the API const tree from packages/shared/src/api,
//                      each with method (only when exactly one explicit
//                      `method:` appears at its callsites - fetch-default GET
//                      is NOT inferred, null is emitted instead of a guess),
//                      the web and mobile callsites referencing it, and the
//                      shared Zod types files those callsites import. Web
//                      scans the whole app (hooks, server components, the
//                      sanctioned BFF handlers), not only app/actions - reads
//                      never go through actions, so an actions-only scan
//                      mislabeled 39 shared endpoints mobile-only
//                      (2026-08-13). Both platforms exclude __tests__ -
//                      tests are section 5's axis, not a consumer.
//   3. dependencies  - directory-level import edges per workspace, including
//                      cross-package edges into @orbit/shared.
//   4. i18nOwnership - keys used by each route's source file, its layout
//                      chain, and the transitive closure of their repo
//                      imports, where a re-export edge is followed only for
//                      the names actually requested, type-only edges are
//                      skipped, and inside a file reached by named imports
//                      only module scope plus the requested exports' spans
//                      are scanned; every en.json leaf attributable to no
//                      route lands in `unowned` (again: the gap is the
//                      signal). One-level attribution left 1427 of 2332 keys
//                      unowned, a whole-file closure over-attributed through
//                      barrels (habits.generalHabit on 73 of 76 routes), and
//                      file-granularity scanning let an unrequested sibling
//                      export contribute ownership (common.select via
//                      RadioGlyph) - all three hid or drowned dead keys
//                      (2026-08-13/14). What remains unowned is dynamic
//                      construction or dead.
//   5. testCoverage  - which vitest files touch which top-level module dir,
//                      plus the dirs no test touches.
//
// Deterministic by construction: every list is stably sorted with a
// code-unit comparator, no timestamps, no git SHAs. Running twice yields
// byte-identical output - that is what .github/workflows/arch-map.yml asserts,
// by generating twice in one job and comparing the two runs to each other
// rather than to a committed copy.

import { createHash } from "node:crypto"
import { readFileSync as readFileSyncRaw, readdirSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/** ARCH_MAP_ROOT is the test seam: the regression cases stage a fixture tree and derive from it. */
const REPO_ROOT = process.env.ARCH_MAP_ROOT
  ? resolve(process.env.ARCH_MAP_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..")
const WORKSPACES = ["apps/web", "apps/mobile", "packages/shared"]
const SOURCE_EXTENSIONS = [".tsx", ".ts"]
const SKIP_DIRS = new Set(["node_modules", ".next", ".expo", "dist", "coverage", "e2e", "test-mocks"])
const TEST_FILE = /\.(test|spec)\.(ts|tsx)$/
const HTTP_METHOD = /method:\s*['"](GET|POST|PUT|PATCH|DELETE)['"]/

// Web and mobile screens whose names diverge on purpose; keyed by the mobile
// app-relative path (no extension), value = the web route it represents.
// WHY each entry exists is the only thing that keeps this map SMALL:
//   (onboarding)/index - mobile mounts onboarding as its own group root
//                        (href "/", colliding with (tabs)/index) while web
//                        serves the same screen at /onboarding.
// NOT an alias: web /u/[slug] (the public VIEW page) has no mobile mirror on
// purpose - a shared profile link opens in the browser. Mobile
// public-profile.tsx is the SETTINGS screen and pairs by name with web
// /public-profile; aliasing it to /u/[slug] mispairs both (proven 2026-08-13).
const MOBILE_ROUTE_ALIASES = new Map([["(onboarding)/index", "/onboarding"]])

const USAGE = `arch-map - derive architecture.json, architecture.html and architecture.mmd at the repo root.

Usage:
  node tools/arch-map.mjs [--help]

Writes architecture.json (a provenance block, then routes + parity, endpoints,
dependency edges, i18n ownership, test coverage), architecture.html (a
self-contained viewer that embeds the JSON so file:// works), and
architecture.mmd (a Mermaid flowchart of the dependency graph).

NONE of the three is committed (#470). Run this to produce them; the arch-map CI
job generates twice, compares the two runs for determinism, and publishes them as
a build artifact. architecture.json carries a provenance block whose
generatedFrom is a sha256 over the paths and contents of every input read,
truncated to 12 hex, so a copy can be checked against the tree in front of you.

Exit codes:
  0  all three files written
  1  derivation failed (missing tree, unparseable endpoints const, node cap exceeded)
  2  usage error
`

/**
 * Bumped by hand when the extraction logic changes what the five content keys mean, so a reader can
 * tell a map produced by an older generator from a stale map produced by this one.
 */
const GENERATOR_VERSION = 1

/**
 * Every path the generator actually reads, recorded so the provenance hash covers the real input set
 * (#232). Deliberately not a second glob: a hardcoded or re-derived list stops covering new files the
 * moment the walk changes, and reads as coverage while it does.
 */
const inputFiles = new Map()
const readFileSync = (path, encoding) => {
  const body = readFileSyncRaw(path, encoding)
  if (typeof body === "string") inputFiles.set(toPosix(path), body)
  return body
}

const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const toPosix = (absolutePath) => relative(REPO_ROOT, absolutePath).split("\\").join("/")

function walk(dir, found = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of [...entries].sort((a, b) => byCode(a.name, b.name))) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, found)
    else found.push(full)
  }
  return found
}

const sourceCache = new Map()
function read(posixPath) {
  const cached = sourceCache.get(posixPath)
  if (cached !== undefined) return cached
  let text = ""
  try {
    text = readFileSync(join(REPO_ROOT, posixPath), "utf8")
  } catch {
    /* unreadable files contribute nothing */
  }
  sourceCache.set(posixPath, text)
  return text
}

function workspaceOf(posixPath) {
  return WORKSPACES.find((workspace) => posixPath.startsWith(workspace + "/")) ?? null
}

const IMPORT_PATTERN =
  /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g

/** Resolve one import specifier from one file to a repo-relative source file, or null. */
function resolveSpecifier(specifier, fromPosix) {
  const workspace = workspaceOf(fromPosix)
  let base = null
  if (specifier.startsWith(".")) base = resolve(REPO_ROOT, dirname(fromPosix), specifier)
  else if (specifier === "@orbit/shared") base = resolve(REPO_ROOT, "packages/shared/src/index")
  else if (specifier.startsWith("@orbit/shared/"))
    base = resolve(REPO_ROOT, "packages/shared/src/" + specifier.slice("@orbit/shared/".length))
  else if (specifier.startsWith("@/") && workspace) base = resolve(REPO_ROOT, workspace, specifier.slice(2))
  if (!base) return null
  const candidates = [
    ...(SOURCE_EXTENSIONS.some((extension) => base.endsWith(extension)) ? [base] : []),
    ...SOURCE_EXTENSIONS.map((extension) => base + extension),
    ...SOURCE_EXTENSIONS.map((extension) => join(base, "index" + extension)),
  ]
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return toPosix(candidate)
    } catch {
      continue
    }
  }
  return null
}

const importEdgeCache = new Map()
function importsOf(posixPath) {
  const cached = importEdgeCache.get(posixPath)
  if (cached) return cached
  const edges = []
  for (const match of read(posixPath).matchAll(IMPORT_PATTERN)) {
    const resolved = resolveSpecifier(match[1] ?? match[2] ?? match[3], posixPath)
    if (resolved) edges.push(resolved)
  }
  const unique = [...new Set(edges)].sort(byCode)
  importEdgeCache.set(posixPath, unique)
  return unique
}

function sourceFilesOf(workspace) {
  return walk(join(REPO_ROOT, workspace))
    .map(toPosix)
    .filter((path) => SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension)))
    .sort(byCode)
}

// ---------- 1. routes ----------

function layoutChain(sourceFile, appRoot, layoutName) {
  const layouts = []
  const segments = sourceFile.slice(appRoot.length + 1).split("/").slice(0, -1)
  for (let depth = 0; depth <= segments.length; depth += 1) {
    const candidate = [appRoot, ...segments.slice(0, depth), layoutName].join("/")
    if (read(candidate) !== "") layouts.push(candidate)
  }
  return layouts
}

function webRoutes() {
  const appRoot = "apps/web/app"
  return sourceFilesOf("apps/web")
    .filter((path) => path.startsWith(appRoot + "/") && path.endsWith("/page.tsx"))
    .map((sourceFile) => {
      const segments = sourceFile
        .slice(appRoot.length + 1)
        .replace(/\/?page\.tsx$/, "")
        .split("/")
        .filter((segment) => segment.length > 0 && !/^\(.+\)$/.test(segment))
      return {
        platform: "web",
        routePath: "/" + segments.join("/"),
        sourceFile,
        layouts: layoutChain(sourceFile, appRoot, "layout.tsx"),
      }
    })
}

function mobileRoutes() {
  const appRoot = "apps/mobile/app"
  return sourceFilesOf("apps/mobile")
    .filter(
      (path) =>
        path.startsWith(appRoot + "/") &&
        path.endsWith(".tsx") &&
        !path.slice(appRoot.length + 1).split("/").some((segment) => segment.startsWith("_")),
    )
    .map((sourceFile) => {
      const appRelative = sourceFile.slice(appRoot.length + 1).replace(/\.tsx$/, "")
      const segments = appRelative.split("/").filter((segment) => !/^\(.+\)$/.test(segment))
      if (segments[segments.length - 1] === "index") segments.pop()
      return {
        platform: "mobile",
        routePath: "/" + segments.join("/"),
        sourceFile,
        appRelative,
        layouts: layoutChain(sourceFile, appRoot, "_layout.tsx"),
      }
    })
}

/**
 * Pair web and mobile routes representing the same screen. A pair forms only
 * when EXACTLY one route per platform lands on a normalized path - any
 * ambiguity leaves all parties unpaired, because a guessed pair is worse than
 * a visible gap.
 */
function pairRoutes(web, mobile) {
  const webByPath = new Map()
  for (const route of web) (webByPath.get(route.routePath) ?? webByPath.set(route.routePath, []).get(route.routePath)).push(route)
  const mobileByPath = new Map()
  for (const route of mobile) {
    const normalized = MOBILE_ROUTE_ALIASES.get(route.appRelative) ?? route.routePath
    ;(mobileByPath.get(normalized) ?? mobileByPath.set(normalized, []).get(normalized)).push(route)
  }
  const parityPairs = []
  const pairedWeb = new Set()
  const pairedMobile = new Set()
  for (const [path, webMatches] of [...webByPath.entries()].sort((a, b) => byCode(a[0], b[0]))) {
    const mobileMatches = mobileByPath.get(path) ?? []
    if (webMatches.length !== 1 || mobileMatches.length !== 1) continue
    parityPairs.push({ routePath: path, web: webMatches[0].sourceFile, mobile: mobileMatches[0].sourceFile })
    pairedWeb.add(webMatches[0].sourceFile)
    pairedMobile.add(mobileMatches[0].sourceFile)
  }
  return {
    parityPairs,
    unpaired: {
      web: web.filter((route) => !pairedWeb.has(route.sourceFile)).map((route) => route.routePath).sort(byCode),
      mobile: mobile.filter((route) => !pairedMobile.has(route.sourceFile)).map((route) => route.routePath).sort(byCode),
    },
    pairedWeb,
    pairedMobile,
  }
}

// ---------- 2. endpoints ----------

const ENDPOINTS_FILE = "packages/shared/src/api/endpoints.ts"

/** Evaluate the API const tree (types stripped) instead of hand-parsing it. */
function parseEndpointTree() {
  const source = read(ENDPOINTS_FILE)
  const start = source.indexOf("{", source.indexOf("export const API"))
  if (start === -1) throw new Error(`could not find the API const in ${ENDPOINTS_FILE}`)
  let depth = 0
  let end = -1
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1
    else if (source[index] === "}") {
      depth -= 1
      if (depth === 0) {
        end = index
        break
      }
    }
  }
  if (end === -1) throw new Error(`unbalanced braces in ${ENDPOINTS_FILE}`)
  const literal = source
    .slice(start, end + 1)
    .replace(/ as const/g, "")
    .replace(/\(\s*(\w+)\s*:\s*string\s*\)/g, "($1)")
  const tree = new Function(`return (${literal})`)()

  const endpoints = []
  const collect = (node, prefix) => {
    for (const key of Object.keys(node).sort(byCode)) {
      const value = node[key]
      const name = prefix ? `${prefix}.${key}` : key
      if (typeof value === "string") endpoints.push({ name, path: value })
      else if (typeof value === "function") {
        const parameters = (value.toString().match(/^\s*\(([^)]*)\)/)?.[1] ?? "")
          .split(",")
          .map((parameter) => parameter.trim())
          .filter(Boolean)
        const path = String(value(...parameters.map((parameter) => `{${parameter}}`)))
          .replace(/%7B/g, "{")
          .replace(/%7D/g, "}")
        endpoints.push({ name, path })
      } else if (value && typeof value === "object") collect(value, name)
    }
  }
  collect(tree, "")
  return endpoints
}

function typesExportMap() {
  const map = new Map()
  const register = (name, file) => {
    if (!map.has(name)) map.set(name, file)
  }
  for (const file of sourceFilesOf("packages/shared").filter((path) => path.startsWith("packages/shared/src/types/"))) {
    const source = read(file)
    for (const match of source.matchAll(/export\s+(?:const|type|interface|function|class|enum)\s+(\w+)/g))
      register(match[1], file)
    for (const match of source.matchAll(/export\s*\{([^}]+)\}/g))
      for (const raw of match[1].split(","))
        for (const name of [raw.replace(/^\s*type\s+/, "").split(/\s+as\s+/)[0].trim()]) if (name) register(name, file)
  }
  return map
}

function sharedNamedImports(posixPath) {
  const names = []
  for (const match of read(posixPath).matchAll(
    /import\s+(?:type\s+)?\{([^}]+)\}\s*from\s*['"]@orbit\/shared(?:\/[^'"]*)?['"]/g,
  ))
    for (const raw of match[1].split(",")) {
      const name = raw.replace(/^\s*type\s+/, "").split(/\s+as\s+/)[0].trim()
      if (name) names.push(name)
    }
  return names
}

function buildEndpoints() {
  const endpoints = parseEndpointTree()
  const notTest = (path) => !TEST_FILE.test(path) && !path.includes("/__tests__/")
  const webFiles = sourceFilesOf("apps/web").filter(notTest)
  const mobileFiles = sourceFilesOf("apps/mobile").filter(notTest)
  const exportMap = typesExportMap()

  return endpoints.map(({ name, path }) => {
    const reference = new RegExp(`\\bAPI\\.${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`)
    const referenceAll = new RegExp(reference.source, "g")
    const webCallsites = webFiles.filter((file) => reference.test(read(file)))
    const mobileCallsites = mobileFiles.filter((file) => reference.test(read(file)))
    const callsites = [...webCallsites, ...mobileCallsites]

    const methods = new Set()
    for (const file of callsites) {
      const source = read(file)
      for (const match of source.matchAll(referenceAll)) {
        const windowEnd = source.indexOf("API.", match.index + match[0].length)
        const window = source.slice(match.index, windowEnd === -1 ? match.index + 400 : Math.min(windowEnd, match.index + 400))
        const explicit = window.match(HTTP_METHOD)
        if (explicit) methods.add(explicit[1])
      }
    }

    const schemas = new Set()
    for (const file of callsites)
      for (const importedName of sharedNamedImports(file)) {
        const typesFile = exportMap.get(importedName)
        if (typesFile) schemas.add(typesFile)
      }

    return {
      name,
      method: methods.size === 1 ? [...methods][0] : null,
      path,
      usedBy: { webCallsites, mobileCallsites },
      zodSchemas: callsites.length === 0 ? null : [...schemas].sort(byCode),
    }
  })
}

// ---------- 3. dependencies ----------

function directoryGroup(posixPath) {
  const workspace = workspaceOf(posixPath)
  const parts = posixPath.slice(workspace.length + 1).split("/")
  if (parts.length < 2) return workspace + "/(root)"
  if (parts[0] === "src") return parts.length > 2 ? `${workspace}/src/${parts[1]}` : `${workspace}/src`
  return `${workspace}/${parts[0]}`
}

function buildDependencies() {
  const edgesByWorkspace = {}
  for (const workspace of WORKSPACES) {
    const edges = new Set()
    for (const file of sourceFilesOf(workspace)) {
      const from = directoryGroup(file)
      for (const target of importsOf(file)) {
        const to = directoryGroup(target)
        if (to !== from) edges.add(`${from} -> ${to}`)
      }
    }
    edgesByWorkspace[workspace] = [...edges].sort(byCode).map((edge) => {
      const [from, to] = edge.split(" -> ")
      return { from, to }
    })
  }
  return edgesByWorkspace
}

// ---------- 4. i18n ownership ----------

function flattenMessages(node, prefix, out) {
  for (const key of Object.keys(node).sort(byCode)) {
    const value = node[key]
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === "object") flattenMessages(value, path, out)
    else out.push(path)
  }
  return out
}

const PLURAL_SUFFIXES = ["_zero", "_one", "_two", "_few", "_many", "_other"]

function keysUsedBy(scannables, leafKeys) {
  const used = new Set()
  const resolveKey = (candidate) => {
    if (leafKeys.has(candidate)) used.add(candidate)
    for (const suffix of PLURAL_SUFFIXES) if (leafKeys.has(candidate + suffix)) used.add(candidate + suffix)
  }
  for (const { file, requested } of scannables) {
    const source = scanTextFor(file, requested)
    const namespaces = new Set()
    for (const match of source.matchAll(/useTranslations\(\s*['"]([^'"]+)['"]/g)) namespaces.add(match[1])
    for (const match of source.matchAll(/keyPrefix:\s*['"]([^'"]+)['"]/g)) namespaces.add(match[1])
    for (const match of source.matchAll(/\bt\(\s*(['"])((?:[\w.-]+))\1/g)) {
      resolveKey(match[2])
      for (const namespace of namespaces) resolveKey(`${namespace}.${match[2]}`)
    }
  }
  return [...used].sort(byCode)
}

const FROM_STATEMENT = /(?:^|\n)\s*(import|export)\s+([^;'"]*?)\s*from\s*['"]([^'"]+)['"]/g
const DYNAMIC_IMPORT = /import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g

/**
 * Import edges with the SYMBOLS each edge carries, so the ownership closure can
 * traverse a barrel's re-exports only for the names actually requested. A
 * whole-file closure attributed habits.generalHabit to 73 of 76 routes through
 * barrel edges nobody imported, hiding dead keys from the sweep (2026-08-13).
 * `names`/`exported` null means "all" (default, namespace, export *, dynamic).
 */
const importEdgeDetailCache = new Map()
function importEdgesOf(posixPath) {
  const cached = importEdgeDetailCache.get(posixPath)
  if (cached) return cached
  const edges = []
  const source = read(posixPath)
  for (const match of source.matchAll(FROM_STATEMENT)) {
    const [, keyword, clause, specifier] = match
    const target = resolveSpecifier(specifier, posixPath)
    if (!target) continue
    if (/^type\s/.test(clause.trim())) continue
    const braced = clause.match(/\{([^}]*)\}/)
    const outsideBraces = clause.replace(/\{[^}]*\}/, "").replace(/,/g, "").trim()
    const named = []
    if (braced)
      for (const raw of braced[1].split(",")) {
        if (/^\s*type\s/.test(raw)) continue
        const parts = raw.split(/\s+as\s+/).map((part) => part.trim())
        if (parts[0]) named.push(keyword === "export" ? { exported: parts[1] ?? parts[0], source: parts[0] } : { source: parts[0] })
      }
    if (keyword === "import") {
      /* a default or namespace clause evaluates the whole target module; a clause left empty after stripping type specifiers erases entirely */
      if (!outsideBraces && named.length === 0) continue
      edges.push({ target, kind: "import", names: outsideBraces ? null : named.map((entry) => entry.source) })
    } else {
      if (!outsideBraces.includes("*") && named.length === 0) continue
      edges.push(outsideBraces.includes("*")
        ? { target, kind: "reexport", exported: null }
        : { target, kind: "reexport", exported: new Map(named.map((entry) => [entry.exported, entry.source])) })
    }
  }
  for (const match of source.matchAll(DYNAMIC_IMPORT)) {
    const target = resolveSpecifier(match[1] ?? match[2], posixPath)
    if (target) edges.push({ target, kind: "import", names: null })
  }
  importEdgeDetailCache.set(posixPath, edges)
  return edges
}

/**
 * Every repo file reachable from the seeds through value imports, following a
 * re-export edge only for the requested names. Type-only edges are skipped:
 * they erase at runtime and can never render a key. Returns file -> "ALL" or
 * the Set of names requested through it, so attribution can also exclude the
 * unrequested sibling exports INSIDE a reached file.
 */
function importClosure(seeds) {
  /** file -> "ALL" once fully expanded, else the Set of names already requested through it */
  const expanded = new Map()
  const queue = seeds.map((file) => ({ file, names: null }))
  while (queue.length > 0) {
    const { file, names } = queue.shift()
    const state = expanded.get(file)
    if (state === "ALL") continue
    let requested = names
    if (names === null) expanded.set(file, "ALL")
    else {
      const seen = state ?? new Set()
      requested = names.filter((name) => !seen.has(name))
      if (requested.length === 0 && state !== undefined) continue
      for (const name of requested) seen.add(name)
      expanded.set(file, seen)
    }
    for (const edge of importEdgesOf(file)) {
      if (edge.kind === "import") {
        queue.push({ file: edge.target, names: edge.names })
        continue
      }
      if (edge.exported === null) queue.push({ file: edge.target, names: requested })
      else if (requested === null) queue.push({ file: edge.target, names: [...edge.exported.values()] })
      else {
        const carried = requested.filter((name) => edge.exported.has(name)).map((name) => edge.exported.get(name))
        if (carried.length > 0) queue.push({ file: edge.target, names: carried })
      }
    }
  }
  return expanded
}

const skipQuoted = (source, index) => {
  /* bails at a newline so a JSX apostrophe corrupts at most one line, an accepted fidelity bound */
  const quote = source[index]
  let cursor = index + 1
  while (cursor < source.length) {
    if (source[cursor] === "\\") cursor += 2
    else if (source[cursor] === quote) return cursor + 1
    else if (source[cursor] === "\n") return cursor
    else cursor += 1
  }
  return cursor
}

const skipTemplate = (source, index) => {
  let cursor = index + 1
  let interpolationDepth = 0
  while (cursor < source.length) {
    if (source[cursor] === "\\") cursor += 2
    else if (source[cursor] === "$" && source[cursor + 1] === "{") { interpolationDepth += 1; cursor += 2 }
    else if (source[cursor] === "}" && interpolationDepth > 0) { interpolationDepth -= 1; cursor += 1 }
    else if (source[cursor] === "`" && interpolationDepth === 0) return cursor + 1
    else cursor += 1
  }
  return cursor
}

function matchTopLevelDeclaration(rest) {
  let match
  if ((match = /^export\s+(?:async\s+)?function\*?\s+(\w+)/.exec(rest))) return { exported: [match[1]], localName: match[1] }
  if ((match = /^export\s+class\s+(\w+)/.exec(rest))) return { exported: [match[1]], localName: match[1] }
  if ((match = /^export\s+(?:const|let|var)\s+(\w+)/.exec(rest))) return { exported: [match[1]], localName: match[1] }
  if (/^export\s+default\b/.test(rest)) return { exported: ["default"], localName: null }
  if ((match = /^export\s*\{([^}]*)\}(?!\s*from)/.exec(rest))) {
    const aliases = match[1]
      .split(",")
      .map((raw) => raw.replace(/^\s*type\s+/, "").split(/\s+as\s+/).map((part) => part.trim()))
      .filter((parts) => parts[0])
      .map((parts) => ({ local: parts[0], exported: parts[1] ?? parts[0] }))
    return { exported: [], localName: null, aliases }
  }
  if (/^export\s+(?:type|interface|abstract)\b/.test(rest)) return { exported: [], localName: null }
  if ((match = /^(?:async\s+)?function\*?\s+(\w+)/.exec(rest))) return { exported: null, localName: match[1] }
  if ((match = /^(?:const|let|var)\s+(\w+)/.exec(rest))) return { exported: null, localName: match[1] }
  if (/^class\s+\w+/.test(rest)) return { exported: null, localName: null }
  return null
}

/**
 * Partition a file at its top-level declaration starts, so ownership can
 * exclude the spans of unrequested sibling exports. `exported: null` is module
 * scope (imports, local helpers, top-level constants): always scanned, because
 * reaching the file evaluates it. A named import owning a sibling export's
 * keys is the defect this exists to stop: /ai-settings imported RadioGlyph
 * alone and owned SelectCheck's common.select (2026-08-14).
 */
const exportSpanCache = new Map()
function exportSpansOf(posixPath) {
  const cached = exportSpanCache.get(posixPath)
  if (cached) return cached
  const source = read(posixPath)
  const starts = []
  let depth = 0
  let index = 0
  let lineStart = true
  while (index < source.length) {
    const character = source[index]
    if (character === "/" && source[index + 1] === "/") {
      const newline = source.indexOf("\n", index)
      index = newline === -1 ? source.length : newline
      continue
    }
    if (character === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2)
      index = end === -1 ? source.length : end + 2
      lineStart = false
      continue
    }
    if (character === "'" || character === '"') { index = skipQuoted(source, index); lineStart = false; continue }
    if (character === "`") { index = skipTemplate(source, index); lineStart = false; continue }
    if (character === "\n") { lineStart = true; index += 1; continue }
    if (/\s/.test(character)) { index += 1; continue }
    if ("{([".includes(character)) { depth += 1; index += 1; lineStart = false; continue }
    if ("})]".includes(character)) { depth -= 1; index += 1; lineStart = false; continue }
    if (depth === 0 && lineStart) {
      const declaration = matchTopLevelDeclaration(source.slice(index))
      if (declaration) starts.push({ index, ...declaration })
    }
    lineStart = false
    index += 1
  }
  const spans = starts.map((start, position) => ({
    start: start.index,
    end: position + 1 < starts.length ? starts[position + 1].index : source.length,
    exported: start.exported,
    localName: start.localName,
    aliases: start.aliases,
  }))
  /* export { a as b } points the exported name at a's own declaration span */
  for (const span of spans)
    if (span.aliases)
      for (const alias of span.aliases) {
        const declaration = spans.find((candidate) => candidate.localName === alias.local)
        if (declaration && declaration.exported !== null) declaration.exported.push(alias.exported)
        else if (declaration) declaration.exported = [alias.exported]
      }
  exportSpanCache.set(posixPath, spans)
  return spans
}

/** The scannable text of a file reached with `requested` names: module scope plus the requested exports' spans. */
function scanTextFor(file, requested) {
  const source = read(file)
  if (requested === "ALL") return source
  const excluded = exportSpansOf(file).filter(
    (span) => span.exported !== null && !span.exported.some((name) => requested.has(name)),
  )
  if (excluded.length === 0) return source
  let kept = ""
  let cursor = 0
  for (const span of excluded) {
    kept += source.slice(cursor, span.start) + "\n"
    cursor = span.end
  }
  return kept + source.slice(cursor)
}

function buildI18nOwnership(routes) {
  const messages = JSON.parse(read("packages/shared/src/i18n/en.json"))
  const leafKeys = new Set(flattenMessages(messages, "", []))
  const byRoute = routes.map((route) => {
    const reachable = importClosure([route.sourceFile, ...route.layouts])
    const scannables = [...reachable.entries()]
      .sort((a, b) => byCode(a[0], b[0]))
      .map(([file, names]) => ({ file, requested: names === "ALL" ? "ALL" : names }))
    return { platform: route.platform, routePath: route.routePath, sourceFile: route.sourceFile, keys: keysUsedBy(scannables, leafKeys) }
  })
  const owned = new Set(byRoute.flatMap((route) => route.keys))
  return { byRoute, unowned: [...leafKeys].filter((key) => !owned.has(key)).sort(byCode) }
}

// ---------- 5. test coverage ----------

function buildTestCoverage() {
  const modules = {}
  const moduleDirs = new Set()
  const allFiles = WORKSPACES.flatMap(sourceFilesOf)
  const testFiles = allFiles.filter((path) => TEST_FILE.test(path))
  for (const file of allFiles) {
    if (TEST_FILE.test(file) || file.includes("/__tests__/")) continue
    moduleDirs.add(directoryGroup(file))
  }
  for (const dir of [...moduleDirs].sort(byCode)) modules[dir] = []
  for (const testFile of testFiles)
    for (const imported of importsOf(testFile)) {
      if (TEST_FILE.test(imported) || imported.includes("/__tests__/")) continue
      const dir = directoryGroup(imported)
      if (modules[dir] && !modules[dir].includes(testFile)) modules[dir].push(testFile)
    }
  for (const dir of Object.keys(modules)) modules[dir].sort(byCode)
  return {
    modules,
    untested: Object.keys(modules).filter((dir) => modules[dir].length === 0).sort(byCode),
  }
}

// ---------- assembly ----------

function buildMap() {
  const web = webRoutes()
  const mobile = mobileRoutes()
  const { parityPairs, unpaired, pairedWeb, pairedMobile } = pairRoutes(web, mobile)
  const stripInternal = ({ appRelative, ...route }) => route
  const routes = {
    web: web.map(stripInternal),
    mobile: mobile.map(stripInternal),
    parityPairs,
    unpaired,
  }
  const endpoints = buildEndpoints()
  const dependencies = buildDependencies()
  const i18nOwnership = buildI18nOwnership([...web, ...mobile])
  const testCoverage = buildTestCoverage()
  return { map: { routes, endpoints, dependencies, i18nOwnership, testCoverage }, pairedWeb, pairedMobile }
}

/**
 * The provenance block, computed AFTER the map is built so the recorded read set is complete. Field
 * names and block position follow .claude/manifests/surfaces.json; `generatedFrom` is redefined as an
 * input content hash because that file's git-based baseline fields cannot exist here (#232). The path
 * is hashed alongside its contents, so moving a file changes the hash even when its bytes do not.
 */
function provenance() {
  const paths = [...inputFiles.keys()].sort(byCode)
  const hash = createHash("sha256")
  for (const path of paths) {
    hash.update(path, "utf8")
    hash.update("\0")
    hash.update(inputFiles.get(path), "utf8")
    hash.update("\0")
  }
  return { generatedFrom: hash.digest("hex").slice(0, 12), inputFiles: paths.length, generatorVersion: GENERATOR_VERSION }
}

/**
 * The ceiling the Mermaid emitter refuses to exceed. The graph is already aggregated to directory
 * groups by buildDependencies, so the real node count is around 30, not the 184 an earlier reading of
 * #321 assumed by counting EDGES (72 web, 75 mobile, 37 shared) as nodes. The cap guards against a
 * future restructure quietly producing a diagram no renderer will draw.
 */
const MERMAID_NODE_CAP = 64

/**
 * A deterministic Mermaid id for a directory-group path. Mermaid ids cannot carry `/`, and Next route
 * groups add `(` and `)`, so every unsafe character collapses to `_`. Collapsing can collide (`a/b`
 * and `a-b` both become `a_b`), so a colliding id takes a `__2`, `__3` suffix in the caller's sorted
 * order, which is stable across runs because the caller sorts first.
 */
function mermaidIds(paths) {
  const ids = new Map()
  const taken = new Map()
  for (const path of paths) {
    const base = `n_${path.replaceAll(/[^A-Za-z0-9]/g, "_")}`
    const seen = taken.get(base) ?? 0
    taken.set(base, seen + 1)
    ids.set(path, seen === 0 ? base : `${base}__${seen + 1}`)
  }
  return ids
}

/**
 * Serializes the SAME map object renderHtml receives into Mermaid `flowchart` source, so the two
 * artifacts cannot disagree: the tree is never re-walked here (#321). One subgraph per workspace,
 * nodes are the directory groups buildDependencies already aggregated to, edges deduped at that
 * grain, LF endings so a cross-OS byte comparison cannot flake on line endings.
 */
function renderMermaid(map) {
  const workspaceOfNode = (node) => WORKSPACES.find((workspace) => node === workspace || node.startsWith(`${workspace}/`)) ?? null
  const nodesByWorkspace = new Map(WORKSPACES.map((workspace) => [workspace, new Set()]))
  const orphanNodes = new Set()
  const edges = new Set()
  for (const workspace of Object.keys(map.dependencies).sort(byCode)) {
    for (const edge of map.dependencies[workspace]) {
      for (const node of [edge.from, edge.to]) {
        const owner = workspaceOfNode(node)
        if (owner) nodesByWorkspace.get(owner).add(node)
        else orphanNodes.add(node)
      }
      edges.add(`${edge.from}${"\u0000"}${edge.to}`)
    }
  }
  const allNodes = [...[...nodesByWorkspace.values()].flatMap((set) => [...set]), ...orphanNodes].sort(byCode)
  if (allNodes.length > MERMAID_NODE_CAP) {
    throw new Error(
      `the dependency graph has ${allNodes.length} directory-group nodes, over the Mermaid cap of ${MERMAID_NODE_CAP}; aggregate further before raising the cap`,
    )
  }
  const ids = mermaidIds(allNodes)
  const lines = ["flowchart LR"]
  for (const workspace of WORKSPACES) {
    const nodes = [...nodesByWorkspace.get(workspace)].sort(byCode)
    lines.push(`  subgraph ws_${workspace.replaceAll(/[^A-Za-z0-9]/g, "_")}["${workspace}"]`)
    for (const node of nodes) lines.push(`    ${ids.get(node)}["${node}"]`)
    lines.push("  end")
  }
  for (const node of [...orphanNodes].sort(byCode)) lines.push(`  ${ids.get(node)}["${node}"]`)
  for (const edge of [...edges].sort(byCode)) {
    const [from, to] = edge.split("\u0000")
    lines.push(`  ${ids.get(from)} --> ${ids.get(to)}`)
  }
  return `${lines.join("\n")}${"\n"}`
}

function renderHtml(map) {
  const embedded = JSON.stringify(map).replace(/</g, "\\u003c")
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Orbit architecture map</title>
<style>
:root{--bg:#f7f7f9;--card:#ffffff;--fg:#17171c;--fg2:#5b5b66;--hairline:#e3e3ea;--accent:#6d3ce0;--warn-bg:#fdf1e2;--warn-fg:#8a5312;--ok-bg:#e9f6ec;--ok-fg:#1d6b34}
@media (prefers-color-scheme: dark){:root{--bg:#0c0c14;--card:#15151f;--fg:#ececf2;--fg2:#9a9aa8;--hairline:#262632;--accent:#a586ff;--warn-bg:#3a2a10;--warn-fg:#e8b56b;--ok-bg:#12301b;--ok-fg:#7ed69a}}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--fg);font:14px/1.5 ui-sans-serif,system-ui,sans-serif;padding:24px;max-width:1180px;margin:0 auto}
h1{font-size:22px;margin-bottom:4px}
h2{font-size:16px;margin:32px 0 8px}
p.sub{color:var(--fg2);margin-bottom:16px}
.cards{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0}
.card{background:var(--card);border:1px solid var(--hairline);border-radius:10px;padding:10px 16px;min-width:120px}
.card b{display:block;font-size:20px}
.card span{color:var(--fg2);font-size:12px}
.scroll{overflow-x:auto;background:var(--card);border:1px solid var(--hairline);border-radius:10px}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{text-align:left;padding:6px 12px;border-bottom:1px solid var(--hairline);vertical-align:top;white-space:nowrap}
th{color:var(--fg2);font-weight:600;position:sticky;top:0;background:var(--card)}
tr:last-child td{border-bottom:0}
code{font:12px ui-monospace,monospace;color:var(--accent)}
.badge{display:inline-block;border-radius:999px;padding:1px 10px;font-size:12px}
.paired{background:var(--ok-bg);color:var(--ok-fg)}
.unpaired{background:var(--warn-bg);color:var(--warn-fg)}
.keylist{columns:3;column-gap:24px;font:12px ui-monospace,monospace;padding:12px 16px}
.keylist div{break-inside:avoid}
@media (max-width:700px){.keylist{columns:1}}
.muted{color:var(--fg2)}
</style>
</head>
<body>
<h1>Orbit architecture map</h1>
<p class="sub">Derived by <code>tools/arch-map.mjs</code> from <code>${map.provenance.inputFiles}</code> input files, generator v<code>${map.provenance.generatorVersion}</code>, <code>generatedFrom ${map.provenance.generatedFrom}</code>. Not committed: regenerate to refresh. Unpaired routes, unowned keys and untested dirs are the signal, not noise.</p>
<div class="cards" id="cards"></div>
<h2>Routes &amp; parity</h2><div class="scroll" id="routes"></div>
<h2>Endpoints</h2><div class="scroll" id="endpoints"></div>
<h2>Dependency edges</h2><div class="scroll" id="deps"></div>
<h2>i18n: unowned keys</h2><p class="sub" id="unowned-sub"></p><div class="scroll keylist" id="unowned"></div>
<h2>Untested module dirs</h2><div class="scroll keylist" id="untested"></div>
<script>
const EMBEDDED = ${embedded}
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n }
function table(container, headers, rows) {
  const t = el("table"); const tr = el("tr")
  for (const h of headers) tr.appendChild(el("th", null, h))
  t.appendChild(tr)
  for (const row of rows) { const r = el("tr"); for (const cell of row) { const td = el("td"); td.appendChild(cell instanceof Node ? cell : document.createTextNode(String(cell))); r.appendChild(td) } t.appendChild(r) }
  document.getElementById(container).appendChild(t)
}
function render(d) {
  const pairedPaths = new Map(d.routes.parityPairs.map(p => [p.web, p.mobile]))
  const cards = [
    ["web routes", d.routes.web.length], ["mobile routes", d.routes.mobile.length],
    ["parity pairs", d.routes.parityPairs.length],
    ["unpaired", d.routes.unpaired.web.length + d.routes.unpaired.mobile.length],
    ["endpoints", d.endpoints.length],
    ["dep edges", Object.values(d.dependencies).reduce((a, e) => a + e.length, 0)],
    ["unowned keys", d.i18nOwnership.unowned.length], ["untested dirs", d.testCoverage.untested.length],
  ]
  for (const [label, value] of cards) { const c = el("div", "card"); c.appendChild(el("b", null, value)); c.appendChild(el("span", null, label)); document.getElementById("cards").appendChild(c) }
  const mobileBySource = new Set(d.routes.parityPairs.map(p => p.mobile))
  const routeRows = []
  for (const r of d.routes.web) {
    const mate = pairedPaths.get(r.sourceFile)
    routeRows.push(["web", r.routePath, code(r.sourceFile), mate ? badge("paired", "paired: " + mate.replace("apps/mobile/app/", "")) : badge("unpaired", "unpaired")])
  }
  for (const r of d.routes.mobile) {
    routeRows.push(["mobile", r.routePath, code(r.sourceFile), mobileBySource.has(r.sourceFile) ? badge("paired", "paired") : badge("unpaired", "unpaired")])
  }
  table("routes", ["platform", "route", "source", "parity"], routeRows)
  table("endpoints", ["name", "method", "path", "web callsites", "mobile callsites", "zod types files"], d.endpoints.map(e => [
    code(e.name), e.method ?? "?", e.path,
    e.usedBy.webCallsites.length ? String(e.usedBy.webCallsites.length) : muted("none"),
    e.usedBy.mobileCallsites.length ? String(e.usedBy.mobileCallsites.length) : muted("none"),
    e.zodSchemas === null ? muted("null") : (e.zodSchemas.map(f => f.replace("packages/shared/src/types/", "")).join(", ") || muted("none")),
  ]))
  const depRows = []
  for (const ws of Object.keys(d.dependencies)) for (const edge of d.dependencies[ws]) depRows.push([ws, code(edge.from), "\\u2192", code(edge.to)])
  table("deps", ["workspace", "from", "", "to"], depRows)
  document.getElementById("unowned-sub").textContent = d.i18nOwnership.unowned.length + " en.json leaf keys not attributable to any route through its source file, layout chain, and symbol-filtered transitive imports: each is dynamically constructed or dead."
  for (const key of d.i18nOwnership.unowned) document.getElementById("unowned").appendChild(el("div", null, key))
  for (const dir of d.testCoverage.untested) document.getElementById("untested").appendChild(el("div", null, dir))
}
function code(text) { return el("code", null, text) }
function muted(text) { return el("span", "muted", text) }
function badge(kind, text) { return el("span", "badge " + kind, text) }
fetch("architecture.json").then(r => r.ok ? r.json() : EMBEDDED).catch(() => EMBEDDED).then(render)
</script>
</body>
</html>
`
}

function main() {
  if (process.argv.slice(2).some((argument) => argument === "--help" || argument === "-h")) {
    process.stdout.write(USAGE)
    return 0
  }
  if (process.argv.length > 2) {
    process.stderr.write(`arch-map: takes no arguments, got: ${process.argv.slice(2).join(" ")}\n\n${USAGE}`)
    return 2
  }
  let map
  let mermaid
  try {
    const content = buildMap().map
    // Computed here, after every input has been read, and placed FIRST so a reader sees which tree
    // produced the map before reading a word of it.
    map = { provenance: provenance(), ...content }
    mermaid = renderMermaid(map)
  } catch (error) {
    process.stderr.write(`arch-map: ${error.message}\n`)
    return 1
  }
  writeFileSync(join(REPO_ROOT, "architecture.json"), JSON.stringify(map, null, 2) + "\n", "utf8")
  writeFileSync(join(REPO_ROOT, "architecture.html"), renderHtml(map), "utf8")
  writeFileSync(join(REPO_ROOT, "architecture.mmd"), mermaid, "utf8")

  const edgeCount = Object.values(map.dependencies).reduce((total, edges) => total + edges.length, 0)
  process.stdout.write("wrote architecture.json + architecture.html + architecture.mmd\n")
  process.stdout.write(`  provenance   generatedFrom ${map.provenance.generatedFrom} over ${map.provenance.inputFiles} input files, generator v${map.provenance.generatorVersion}\n`)
  process.stdout.write(`  routes       web ${map.routes.web.length} / mobile ${map.routes.mobile.length}\n`)
  process.stdout.write(`  parity       ${map.routes.parityPairs.length} pairs / ${map.routes.unpaired.web.length} web + ${map.routes.unpaired.mobile.length} mobile unpaired\n`)
  process.stdout.write(`  endpoints    ${map.endpoints.length}\n`)
  process.stdout.write(`  dep edges    ${edgeCount}\n`)
  process.stdout.write(`  i18n         ${map.i18nOwnership.unowned.length} unowned keys\n`)
  process.stdout.write(`  tests        ${map.testCoverage.untested.length} untested module dirs\n`)
  return 0
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) process.exit(main())
