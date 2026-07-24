#!/usr/bin/env node
// Generates architecture.json + architecture.html at the repo root: the
// DERIVED architecture map (REBUILD.md 6.4) an agent reads INSTEAD of
// exploring the codebase, and the page Thomas reads instead of the JSON.
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
//                      the web action files and mobile callsites referencing
//                      it, and the shared Zod types files those callsites
//                      import. Mobile callsites exclude __tests__ - tests are
//                      section 5's axis, not a consumer.
//   3. dependencies  - directory-level import edges per workspace, including
//                      cross-package edges into @orbit/shared.
//   4. i18nOwnership - keys used by each route's source file + its one-level
//                      imports; every en.json leaf attributable to no route
//                      lands in `unowned` (again: the gap is the signal).
//   5. testCoverage  - which vitest files touch which top-level module dir,
//                      plus the dirs no test touches.
//
// Deterministic by construction: every list is stably sorted with a
// code-unit comparator, no timestamps, no git SHAs (a HEAD SHA can never
// match the commit that contains it, so it would make the CI drift check
// unsatisfiable). Running twice yields byte-identical output - that is what
// .github/workflows/arch-map.yml asserts on every PR.

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
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
const MOBILE_ROUTE_ALIASES = new Map([["(onboarding)/index", "/onboarding"]])

const USAGE = `arch-map - derive architecture.json + architecture.html at the repo root.

Usage:
  node tools/arch-map.mjs [--help]

Writes architecture.json (routes + parity, endpoints, dependency edges,
i18n ownership, test coverage) and architecture.html (self-contained viewer,
embeds the JSON so file:// works). Both are committed; the arch-map CI job
regenerates them and fails on drift.

Exit codes:
  0  both files written
  1  derivation failed (missing tree, unparseable endpoints const)
`

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
  const webActionFiles = sourceFilesOf("apps/web").filter((path) => path.startsWith("apps/web/app/actions/"))
  const mobileFiles = sourceFilesOf("apps/mobile").filter(
    (path) => !TEST_FILE.test(path) && !path.includes("/__tests__/"),
  )
  const exportMap = typesExportMap()

  return endpoints.map(({ name, path }) => {
    const reference = new RegExp(`\\bAPI\\.${name.replace(/\./g, "\\.")}\\b`)
    const referenceAll = new RegExp(reference.source, "g")
    const webActions = webActionFiles.filter((file) => reference.test(read(file)))
    const mobileCallsites = mobileFiles.filter((file) => reference.test(read(file)))
    const callsites = [...webActions, ...mobileCallsites]

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
      usedBy: { webActions, mobileCallsites },
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

function keysUsedBy(files, leafKeys) {
  const used = new Set()
  const resolveKey = (candidate) => {
    if (leafKeys.has(candidate)) used.add(candidate)
    for (const suffix of PLURAL_SUFFIXES) if (leafKeys.has(candidate + suffix)) used.add(candidate + suffix)
  }
  for (const file of files) {
    const source = read(file)
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

function buildI18nOwnership(routes) {
  const messages = JSON.parse(read("packages/shared/src/i18n/en.json"))
  const leafKeys = new Set(flattenMessages(messages, "", []))
  const byRoute = routes.map((route) => {
    const oneLevel = [route.sourceFile, ...importsOf(route.sourceFile)]
    return { platform: route.platform, routePath: route.routePath, sourceFile: route.sourceFile, keys: keysUsedBy(oneLevel, leafKeys) }
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
<p class="sub">Derived by <code>tools/arch-map.mjs</code>, CI-verified fresh. Unpaired routes, unowned keys and untested dirs are the signal, not noise.</p>
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
  table("endpoints", ["name", "method", "path", "web actions", "mobile callsites", "zod types files"], d.endpoints.map(e => [
    code(e.name), e.method ?? "?", e.path,
    e.usedBy.webActions.length ? e.usedBy.webActions.map(f => f.replace("apps/web/app/actions/", "")).join(", ") : muted("none"),
    String(e.usedBy.mobileCallsites.length), e.zodSchemas === null ? muted("null") : (e.zodSchemas.map(f => f.replace("packages/shared/src/types/", "")).join(", ") || muted("none")),
  ]))
  const depRows = []
  for (const ws of Object.keys(d.dependencies)) for (const edge of d.dependencies[ws]) depRows.push([ws, code(edge.from), "\\u2192", code(edge.to)])
  table("deps", ["workspace", "from", "", "to"], depRows)
  document.getElementById("unowned-sub").textContent = d.i18nOwnership.unowned.length + " en.json leaf keys not attributable to any route's source file or its one-level imports."
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
  let map
  try {
    map = buildMap().map
  } catch (error) {
    process.stderr.write(`arch-map: ${error.message}\n`)
    return 1
  }
  writeFileSync(join(REPO_ROOT, "architecture.json"), JSON.stringify(map, null, 2) + "\n", "utf8")
  writeFileSync(join(REPO_ROOT, "architecture.html"), renderHtml(map), "utf8")

  const edgeCount = Object.values(map.dependencies).reduce((total, edges) => total + edges.length, 0)
  process.stdout.write("wrote architecture.json + architecture.html\n")
  process.stdout.write(`  routes       web ${map.routes.web.length} / mobile ${map.routes.mobile.length}\n`)
  process.stdout.write(`  parity       ${map.routes.parityPairs.length} pairs / ${map.routes.unpaired.web.length} web + ${map.routes.unpaired.mobile.length} mobile unpaired\n`)
  process.stdout.write(`  endpoints    ${map.endpoints.length}\n`)
  process.stdout.write(`  dep edges    ${edgeCount}\n`)
  process.stdout.write(`  i18n         ${map.i18nOwnership.unowned.length} unowned keys\n`)
  process.stdout.write(`  tests        ${map.testCoverage.untested.length} untested module dirs\n`)
  return 0
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) process.exit(main())
