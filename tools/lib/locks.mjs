/**
 * The locked paths of the merge bar. A pull request that changes a locked path merges only when its ticket carries the owner's label.
 * Pure: the driver reads the files of main and the base and head text of the JSON files, and passes them in.
 *
 * `design-system`: the design rules and the checks that enforce them. `gate`: the code of the driver and its checks.
 */
import { posix } from "node:path"

export const DESIGN_LABEL = "design-system"
export const GATE_LABEL = "gate"

/** The entries of the import graph of the lint of the changed files. */
export const LINT_ENTRY = "tools/lint-changed.mjs"
/** The geometry test of the mobile rows. Only the helpers under its test folder join its graph. */
export const ROW_GEOMETRY_TEST = "apps/mobile/__tests__/components/ui/row-geometry.test.tsx"
export const ROW_GEOMETRY_FOLDER = "apps/mobile/__tests__/"
/** The entry of the import graph of the driver. */
export const DRIVER_ENTRY = "tools/drive.mjs"
/** A spec that asserts the label fit of the web layout. */
export const FIT_SPEC_PATTERN = "data-fit=[\"']?label"

const DESIGN_EXACT = new Set([LINT_ENTRY, ROW_GEOMETRY_TEST, "apps/web/e2e/layout/text-overflow-geometry.ts", ".github/workflows/test.yml", ".github/scripts/plan-test-jobs.mjs", ".github/scripts/changed-paths.sh"])
const DESIGN_PATTERN = /^eslint-rules\/|(?:^|\/)eslint\.config\.[^/]+$/
/** The driver files that exist today. They stay locked when the graph of main cannot be read. */
const GATE_EXACT = new Set([DRIVER_ENTRY, ...["worker", "escape-regex", "config", "bounded-process", "order", "github", "github-auth", "git-worktrees", "driver-pin", "locks"].map((name) => `tools/lib/${name}.mjs`),
  ".claude/orchestrator.json", ".github/scripts/check-pr-metadata.mjs", ".github/scripts/check-pr-metadata.test.mjs", ".github/workflows/pr-metadata.yml"])
/** The support helpers of the tools cases start with an underscore. */
const GATE_PATTERN = /^tools\/__tests__\/_[^/]+\.mjs$/

const JSON_NAME = /(?:^|\/)(?:package\.json|tsconfig[^/]*\.json)$/
const EXTENSIONS = ["", ".mjs", ".cjs", ".js", ".ts", ".tsx", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.mjs"]
const RELATIVE = /(?:\bfrom\s*|\bimport\s*\(?\s*|new URL\(\s*)["'](\.{1,2}\/[^"'\n]+)["']/g
const SCRIPT_NAME = /["'`]([\w.-]+\.(?:mjs|cjs|sh))["'`]/g

/** The test cases of a file of the graph: the case module of a tools file, or the `.test.mjs` beside a workflow script. */
const testsOf = (path) => {
  if (/^tools\/(?:lib\/)?[^/]+\.mjs$/.test(path)) return [`tools/__tests__/${posix.basename(path)}`]
  return /^\.github\/scripts\/[^/]+\.mjs$/.test(path) && !path.endsWith(".test.mjs") ? [path.replace(/\.mjs$/, ".test.mjs")] : []
}

/** The code of a file without its block comments and its line comments. A comment names a script that nothing starts. */
const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1")

/** The paths that a text refers to: its relative imports and `new URL` paths, and the bare names of scripts that exist beside tools. */
const referencesOf = (path, source) => {
  const text = withoutComments(source)
  const found = [...text.matchAll(RELATIVE)].map((match) => ({ path: posix.normalize(posix.join(posix.dirname(path), match[1])), exact: false }))
  for (const match of text.matchAll(SCRIPT_NAME)) {
    for (const folder of ["tools", "tools/lib", posix.dirname(path)]) found.push({ path: posix.join(folder, match[1]), exact: true })
  }
  return found
}

/**
 * The files that the entries import, with the entries that exist. `read(path)` gives the text of a file of main or null.
 * `within` limits the files that join the graph. A name that does not resolve to a file is no reference.
 */
export const importGraph = async (entries, read, { within = () => true } = {}) => {
  const seen = new Set()
  const queue = [...entries]
  while (queue.length > 0) {
    const path = queue.shift()
    if (seen.has(path)) continue
    const text = await read(path)
    if (text === null) continue
    seen.add(path)
    for (const reference of referencesOf(path, text)) {
      for (const extension of reference.exact ? [""] : EXTENSIONS) {
        const candidate = `${reference.path}${extension}`
        if (seen.has(candidate)) break
        if (within(candidate) && (await read(candidate)) !== null) { queue.push(candidate); break }
      }
    }
  }
  return [...seen].sort()
}

/** The text of a JSON file with comments and trailing commas, as a value, or `undefined` when it does not parse. */
export const parseJsonc = (text) => {
  let clean = ""
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at]
    if (char === "\"") {
      let end = at + 1
      while (end < text.length && text[end] !== "\"") end += text[end] === "\\" ? 2 : 1
      clean += text.slice(at, end + 1)
      at = end
    } else if (char === "/" && text[at + 1] === "/") {
      while (at < text.length && text[at] !== "\n") at += 1
      clean += "\n"
    } else if (char === "/" && text[at + 1] === "*") {
      at = text.indexOf("*/", at + 2)
      if (at < 0) return undefined
      at += 1
    } else clean += char
  }
  try { return JSON.parse(clean.replace(/,(\s*[}\]])/g, "$1")) } catch { return undefined }
}

/** True when a changed file names a JSON file whose lint script or file lists the lock covers. */
export const isLockedJsonName = (path) => JSON_NAME.test(path)

/** The value that the lock reads from a JSON file: the `scripts.lint` of a package, or the `include` and `exclude` of a tsconfig. */
const lockedValueOf = (path, text) => {
  const value = text === null ? {} : parseJsonc(text)
  if (value === undefined) return { unreadable: text }
  return posix.basename(path) === "package.json" ? { lint: value?.scripts?.lint } : { include: value?.include, exclude: value?.exclude }
}

/** True when the lint script of a package or the include and exclude of a tsconfig differ between base and head. A file that does not parse counts as a change when its text differs. */
export const jsonLockChanged = (path, base, head) => JSON.stringify(lockedValueOf(path, base)) !== JSON.stringify(lockedValueOf(path, head))

/**
 * The files of main that the locks add to the fixed lists: `read` gives the text of a file of main or null, and `grep` gives the paths of main whose text matches a pattern.
 * Returns `{ design, gate }`: the exact locked paths of each label.
 */
export const lockSetsOf = async ({ read, grep }) => {
  const specs = (await grep(FIT_SPEC_PATTERN)).filter((path) => /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(path))
  const design = [...await importGraph([LINT_ENTRY], read), ...await importGraph([ROW_GEOMETRY_TEST], read, { within: (path) => path.startsWith(ROW_GEOMETRY_FOLDER) }), ...specs]
  const graph = await importGraph([DRIVER_ENTRY], read)
  return { design: [...new Set(design)].sort(), gate: [...new Set([...graph, ...graph.flatMap(testsOf)])].sort() }
}

/**
 * The changed files that each owner label covers, as `{ "design-system": [...], gate: [...] }`. A label with no file is absent.
 * `sets`: `{ design, gate, changedJson }`. `changedJson` lists the changed JSON files whose locked value differs between base and head.
 */
export const lockedPathsOf = (files, sets = {}) => {
  const design = new Set([...DESIGN_EXACT, ...(sets.design ?? []), ...(sets.changedJson ?? [])])
  const gate = new Set([...GATE_EXACT, ...(sets.gate ?? [])])
  const covered = {
    [DESIGN_LABEL]: files.filter((file) => design.has(file) || DESIGN_PATTERN.test(file)),
    [GATE_LABEL]: files.filter((file) => gate.has(file) || GATE_PATTERN.test(file)),
  }
  return Object.fromEntries(Object.entries(covered).filter(([, paths]) => paths.length > 0))
}
