#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { basename, dirname, extname, join, posix, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// GitHub rejects a comment above this many characters. The value comes from a real post, not from memory.
const DEFAULT_MAX_CHARS = 60000
// The hygiene finder of /prod-readiness judges at most this many candidates of one repository.
const CANDIDATE_CAP = 300
// The first kind whose signal fires names a candidate, so the outdated rows that feed the High tier come first.
const CANDIDATE_KINDS = ["outdated", "temporary", "duplicate", "old"]
// Git ignores this folder, and a workflow agent of a session in this checkout reads it without an approval prompt.
const CANDIDATES_FOLDER = posix.join(".claude", "sweeps", "hygiene")


// ---------------------------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------------------------

const CODE_EXTENSIONS = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts", ".astro", ".css", ".scss", ".cs", ".py",
  ".sh", ".ps1", ".bat", ".cmd", ".rs", ".kt", ".java", ".swift", ".sql", ".vue", ".svelte", ".m", ".mm",
  ".h", ".c", ".cpp",
])
const ASSET_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".ico", ".icns", ".bmp", ".tiff", ".woff",
  ".woff2", ".ttf", ".otf", ".eot", ".mp4", ".mov", ".webm", ".mp3", ".wav", ".pdf", ".html", ".htm",
])
const DOC_EXTENSIONS = new Set([".md", ".mdx", ".txt"])
const AGENT_INSTRUCTION_NAMES = new Set(["CLAUDE.md", "AGENTS.md", "GEMINI.md", "opencode.json"])
const AGENT_INSTRUCTION_FOLDERS = new Set([".agents", ".codex", ".opencode"])
const TEMPORARY_EXTENSIONS = [".bak", ".tmp", ".orig", ".rej", ".old"]
const TEMPORARY_SEGMENTS = new Set(["superseded", "unused", "backup", "backups", "scratch", "archive", "drafts"])
const VERDICTS = ["keep", "update", "delete", "other-ticket"]
const CLASSES = ["config", "agent", "doc", "asset", "test", "source"]

const isTestPath = (path) => path.includes("__tests__") || path.includes(".test.") || `/${path}`.includes("/tests/")

const classify = (path) => {
  if (path.startsWith(".claude/")) return "agent"
  const extension = extname(path).toLowerCase()
  if (DOC_EXTENSIONS.has(extension)) return "doc"
  if (isTestPath(path)) return "test"
  if (CODE_EXTENSIONS.has(extension)) return "source"
  if (ASSET_EXTENSIONS.has(extension)) return "asset"
  return "config"
}

const isAgentInstruction = (path) => {
  const segments = path.split("/")
  return AGENT_INSTRUCTION_NAMES.has(segments.at(-1)) || segments.some((segment) => AGENT_INSTRUCTION_FOLDERS.has(segment))
}

const temporaryPatternOf = (path) => {
  const segments = path.split("/")
  const name = segments.at(-1).toLowerCase()
  const extension = TEMPORARY_EXTENSIONS.find((candidate) => name.endsWith(candidate))
  if (extension) return `extension:${extension}`
  if (name.endsWith("~")) return "suffix:~"
  for (const segment of segments.map((part) => part.toLowerCase())) {
    if (TEMPORARY_SEGMENTS.has(segment)) return `segment:${segment}`
    if (segment.startsWith("previous-")) return "segment:previous-*"
  }
  if (name.includes("backup")) return "basename:backup"
  if (name.includes(" copy")) return "basename: copy"
  return null
}

const nameToSearch = (path, fileClass) => {
  const name = basename(path)
  return fileClass === "source" ? name.slice(0, name.length - extname(name).length) || name : name
}

const usage = () => `usage: file-ledger.mjs [--repo <path>] [--also-search <path>]...
       file-ledger.mjs --verify <ledger> --base <commit> [--repo <path>] [--other-ticket <ID>]
       file-ledger.mjs --render <ledger> --out-dir <dir> [--repo <path>] [--base <commit>] [--max-chars <n>]
       file-ledger.mjs --candidates <ledger> [--repo <path>]

  The file ledger: one row for each tracked file of a repository, with the evidence a reviewer needs to
  decide whether the file keeps its current form. The default verdict for every file is delete or update.
  A relative path in a flag resolves against the working directory.

  Mode 1, emit (default). Writes one JSON line for each tracked file, in path order, to stdout.
  Two runs on one commit give the same bytes.
    --repo <path>         root of a git repository (default: the orbit-ui-mobile root)
    --also-search <path>  root of a sibling repository to search for readers; repeat for each one

  Mode 2, verify. Exits 0 only when the ledger, with the fields verdict, reader, checked and note added to
  each row, is complete and true at HEAD. Verdicts: keep, update, delete, other-ticket.
    --verify <ledger>     the filled ledger, one JSON line for each row
    --base <commit>       the commit the branch started from (required)
    --other-ticket <ID>   the ticket that owns each row with the verdict other-ticket; the note must hold the ID
  Checks: rows with a verdict other than delete are exactly the tracked files at HEAD; rows with the verdict
  delete are exactly the files that base tracks and HEAD does not; a keep row has a reader and a checked value
  and unchanged content; an update row has a reader and a checked value and changed content or a new path; a
  delete row has a note; an other-ticket row has unchanged content; a reader is never empty, none, unknown or n/a. Prints a summary on stdout (a table with
  one row for each class and a total row, the bytes that the deletes removed and the duplicate groups at base
  and at HEAD) and each defect with its path on stderr.

  Mode 3, render. Writes Markdown parts that each fit in one pull request comment.
    --render <ledger>     the verified ledger
    --out-dir <dir>       folder for ledger-part-NN-of-MM.md (older files of this name are removed first)
    --base <commit>       base commit for the first line (default: the merge base with origin/main)
    --max-chars <n>       longest part in characters (default: ${DEFAULT_MAX_CHARS})
  The first line of each part names the repository, the part number, the count of parts and the two commit
  SHAs. Each row is in exactly one part. Rows with other-ticket fold to one line for each class.

  Mode 4, candidates. Selects the rows that the hygiene finder of /prod-readiness judges, writes them to a
  file and prints the hygiene entry of the repository for the Workflow call, so the call never carries rows.
    --candidates <ledger>  the emitted ledger of the repository at --repo; it must list exactly the files
                           that the repository tracks
  A candidate gets the first kind whose signal fires, in this order (${CANDIDATE_KINDS.join(", ")}):
    outdated   unresolvedReferences is not empty; or agentInstruction is true and a second instruction file
               in the same folder has different content
    temporary  temporaryPattern is not null; or git does not track or ignore the file (a row with path,
               class and untracked: true)
    duplicate  duplicateOf or crossRepositoryDuplicateOf is not empty
    old        inboundByPath, inboundByBasename and each crossRepositoryInbound count are zero; the oldest
               lastCommit comes first
  A record is never a candidate: a file under src/Orbit.Infrastructure/Migrations/, a Decisions/ folder,
  5 Journal/ or 0 Inbox/raw/; a .md, .mdx or .txt file in the folder of a meta.md that says
  "**Status**: Published"; a file in a folder under .claude/skills/ that skills-lock.json lists or
  .claude/skills/VENDOR.md names in backticks.
  The finder judges at most ${CANDIDATE_CAP} candidates of the repository. Each kind gets an equal share of that cap,
  and a share that one kind leaves unused goes to the other kinds. The judged rows, each with its kind, go to
  ${CANDIDATES_FOLDER}/<repository>.jsonl in the checkout that holds this tool, one JSON line each. Git
  ignores that folder, and a workflow agent of a session in this checkout reads it without an approval prompt.
  Stdout is one JSON line, {"root", "candidatesFile", "counts": {<kind>: {"judged", "deferred"}}}: the counts
  come from every candidate, so a deferred row never reads as judged or as absent.

  Row fields: path; class; agentInstruction; bytes; lastCommit (date of the last commit that changed the
  path); inboundByPath (other tracked files that contain the path); inboundByBasename (other tracked files
  that contain the basename, or the stem for a source file); crossRepositoryInbound (the same two counts in
  each --also-search root, by repository name); duplicateOf (other paths with the same blob hash);
  crossRepositoryDuplicateOf (paths in an --also-search root with the same blob hash, as <repository>/<path>);
  unresolvedReferences; empty; temporaryPattern.

  Class rule, first match wins:
    a path under .claude/ is agent; .md, .mdx and .txt are doc; a path that contains __tests__, .test. or a
    tests/ segment is test; a code extension is source (${[...CODE_EXTENSIONS].join(" ")});
    an image, font, video, PDF or HTML extension is asset (${[...ASSET_EXTENSIONS].join(" ")});
    each other file is config.
  agentInstruction is true for CLAUDE.md, AGENTS.md, GEMINI.md, opencode.json and each file under .agents/,
  .codex/ or .opencode/.
  Temporary patterns: the extensions .bak .tmp .orig .rej .old; a name that ends with ~; a path segment
  superseded, unused, backup, backups, scratch, archive or drafts, or one that starts with previous-; a
  basename that contains backup or " copy".

  unresolvedReferences holds each path that a doc, an agent file or a text config file names and that
  resolves to nothing. A reference is a path inside backticks or the target of a Markdown link. Fenced code
  blocks are skipped. A reference resolves when: it names a tracked path, the end of a tracked path or a
  tracked folder; it exists on disk (an ignored file counts); tools/root-allowlist.json of the repository
  lists it; or an --also-search root tracks it (a leading ../ and the repository name are ignored). A bare
  file name resolves when one tracked file has that basename. A URL, a glob, a placeholder in angle brackets,
  a flag, an absolute path, a bare extension such as .dc.html, a branch prefix such as feature/ and a word
  without a known file extension are never references. The tool prefers a miss over a false hit. A source
  file, a test and an asset get an empty list.

  Untracked files that git does not ignore are listed on stderr with the counts by class.

exit codes: 0 done, 1 verify found defects, 2 usage error, unreadable input, a ledger that does not match --repo or a
path that is not a git repository`

// ---------------------------------------------------------------------------------------------
// Git
// ---------------------------------------------------------------------------------------------

class UsageError extends Error {}

const git = (repository, args, input) => {
  const result = spawnSync("git", ["-C", repository, ...args], { maxBuffer: 1 << 30, input })
  if (result.error) throw new UsageError(`cannot run git: ${result.error.message}`)
  return { status: result.status, stdout: result.stdout, stderr: result.stderr.toString("utf8").trim() }
}

const gitText = (repository, args, input) => {
  const result = git(repository, args, input)
  if (result.status !== 0) throw new UsageError(`git ${args.join(" ")} failed in ${repository}: ${result.stderr}`)
  return result.stdout.toString("utf8")
}

const requireRepository = (repository) => {
  if (!existsSync(repository)) throw new UsageError(`${repository} does not exist`)
  const top = git(repository, ["rev-parse", "--show-toplevel"])
  if (top.status !== 0) throw new UsageError(`${repository} is not a git repository`)
  if (realpathSync(top.stdout.toString("utf8").trim()) !== realpathSync(repository)) {
    throw new UsageError(`${repository} is not the root of a git repository`)
  }
  return realpathSync(repository)
}

const byPath = (left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)

/** The index: one entry for each tracked path with its blob hash. */
const readIndex = (repository) => {
  const entries = new Map()
  for (const record of gitText(repository, ["ls-files", "-s", "-z"]).split("\0")) {
    const tab = record.indexOf("\t")
    if (tab === -1) continue
    const [, hash] = record.slice(0, tab).split(" ")
    const path = record.slice(tab + 1)
    if (!entries.has(path)) entries.set(path, { path, hash })
  }
  return [...entries.values()].sort(byPath)
}

/** The committed tree of a commit: path to blob hash. */
const readTree = (repository, commit) => {
  const tree = new Map()
  for (const record of gitText(repository, ["ls-tree", "-r", "-z", commit]).split("\0")) {
    const tab = record.indexOf("\t")
    if (tab === -1) continue
    tree.set(record.slice(tab + 1), record.slice(0, tab).split(" ")[2])
  }
  return tree
}

/** One pass over the history, newest first: the date of the last commit that changed each path. */
const readLastCommitDates = (repository) => {
  const dates = new Map()
  const log = gitText(repository, ["log", "-z", "--name-only", "--no-renames", "--format=%x01%cs"])
  for (const chunk of log.split("\u0001")) {
    const separator = chunk.indexOf("\0")
    if (separator === -1) continue
    const date = chunk.slice(0, separator)
    const names = chunk.slice(separator + 1).replace(/^\n/, "").split("\0")
    for (const name of names) if (name && !dates.has(name)) dates.set(name, date)
  }
  return dates
}

const readUntracked = (repository) =>
  gitText(repository, ["ls-files", "-z", "--others", "--exclude-standard"]).split("\0").filter(Boolean).sort()

const emptyBlobHash = (repository) => gitText(repository, ["hash-object", "--stdin"], "").trim()

const repositoryName = (repository) => {
  const origin = git(repository, ["remote", "get-url", "origin"])
  if (origin.status === 0) {
    const name = basename(origin.stdout.toString("utf8").trim()).replace(/\.git$/, "")
    if (name) return name
  }
  return basename(repository)
}

// ---------------------------------------------------------------------------------------------
// Aho-Corasick search: every pattern against every file in one pass
// ---------------------------------------------------------------------------------------------

const buildAutomaton = (patterns) => {
  const transitions = [new Map()]
  const patternAt = [-1]
  patterns.forEach((pattern, id) => {
    let node = 0
    for (let position = 0; position < pattern.length; position += 1) {
      const code = pattern.charCodeAt(position)
      let child = transitions[node].get(code)
      if (child === undefined) {
        child = transitions.length
        transitions.push(new Map())
        patternAt.push(-1)
        transitions[node].set(code, child)
      }
      node = child
    }
    patternAt[node] = id
  })
  const failure = new Int32Array(transitions.length)
  const outputLink = new Int32Array(transitions.length).fill(-1)
  const queue = [...transitions[0].values()]
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const parent = queue[cursor]
    for (const [code, child] of transitions[parent]) {
      let fallback = failure[parent]
      while (fallback !== 0 && !transitions[fallback].has(code)) fallback = failure[fallback]
      failure[child] = transitions[fallback].get(code) ?? 0
      outputLink[child] = patternAt[failure[child]] === -1 ? outputLink[failure[child]] : failure[child]
      queue.push(child)
    }
  }
  return { transitions, patternAt, failure, outputLink }
}

const findPatterns = ({ transitions, patternAt, failure, outputLink }, text, onPattern) => {
  let node = 0
  for (let position = 0; position < text.length; position += 1) {
    const code = text.charCodeAt(position)
    while (node !== 0 && !transitions[node].has(code)) node = failure[node]
    node = transitions[node].get(code) ?? 0
    for (let hit = patternAt[node] === -1 ? outputLink[node] : node; hit !== -1; hit = outputLink[hit]) {
      onPattern(patternAt[hit])
    }
  }
}

const readText = (root, path) => {
  const full = join(root, path)
  let stat
  try {
    stat = lstatSync(full)
  } catch {
    return null
  }
  if (!stat.isFile()) return null
  const buffer = readFileSync(full)
  return buffer.subarray(0, 8192).includes(0) ? null : buffer.toString("utf8")
}

/** Maps each distinct search string to the rows that own it, then builds one automaton for all of them. */
const buildSearch = (rows) => {
  const ids = new Map()
  const owners = []
  const own = (text, rowIndex, kind) => {
    if (!text) return
    if (!ids.has(text)) {
      ids.set(text, owners.length)
      owners.push([])
    }
    owners[ids.get(text)].push({ rowIndex, kind })
  }
  rows.forEach((row, rowIndex) => {
    own(row.path, rowIndex, "byPath")
    own(nameToSearch(row.path, row.class), rowIndex, "byBasename")
  })
  return { automaton: buildAutomaton([...ids.keys()]), owners, stamps: new Int32Array(owners.length), scans: 0 }
}

/** Counts, for each row, the files of `root` that contain the row's path and name. */
const countInbound = ({ search, root, paths, counters, skipSelf }) => {
  const { automaton, owners, stamps } = search
  paths.forEach((path, fileIndex) => {
    const text = readText(root, path)
    if (text === null) return
    search.scans += 1
    const stamp = search.scans
    findPatterns(automaton, text, (id) => {
      if (stamps[id] === stamp) return
      stamps[id] = stamp
      for (const { rowIndex, kind } of owners[id]) {
        if (skipSelf && rowIndex === fileIndex) continue
        counters[rowIndex][kind] += 1
      }
    })
  })
}

// ---------------------------------------------------------------------------------------------
// Unresolved references
// ---------------------------------------------------------------------------------------------

const KNOWN_FILE_EXTENSIONS = new Set([
  "md", "mdx", "txt", "json", "jsonc", "yml", "yaml", "toml", "js", "jsx", "ts", "tsx", "mjs", "cjs", "mts",
  "cts", "css", "scss", "html", "htm", "svg", "png", "jpg", "jpeg", "webp", "gif", "ico", "icns", "sh", "ps1",
  "cs", "csproj", "sln", "tf", "sql", "kt", "kts", "java", "swift", "plist", "xml", "gradle", "properties",
  "lock", "example", "mp4", "pdf", "woff", "woff2", "ttf", "otf", "rs", "astro",
])
const PRODUCT_NAMES_WITH_DOT_JS = /^(?:next|node|vue|react|three|express|nuxt|chart|socket|alpine|ember|backbone)\.js$/i
const NON_PATH_CHARACTERS = /[*?{}<>$|()[\]=\\\s"'`;,!^]/

const REFERENCE_CLASSES = new Set(["doc", "agent", "config"])

const isScannedForReferences = (path, fileClass) =>
  REFERENCE_CLASSES.has(fileClass) && !CODE_EXTENSIONS.has(extname(path).toLowerCase())

const stripFencedBlocks = (text) => {
  let inside = false
  return text
    .split("\n")
    .filter((line) => {
      if (/^\s*(?:```|~~~)/.test(line)) {
        inside = !inside
        return false
      }
      return !inside
    })
    .join("\n")
}

const decodePercent = (text) => {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

const cleanToken = (raw) =>
  decodePercent(raw)
    .replace(/^[("'[]+/, "")
    .replace(/[)"'\],.;:!]+$/, "")
    .replace(/#.*$/, "")
    .replace(/:\d+(?:[:-]\d+)*$/, "")

const looksLikePath = (token) => {
  if (!token || NON_PATH_CHARACTERS.test(token) || token.includes("://") || token.startsWith("mailto:")) return false
  if (/^[-/~@#%]/.test(token)) return false
  // A dot folder such as .claude/ or .github/ is a real path; a bare dotted name such as .dc.html is an extension.
  if (token.startsWith(".") && !/^(?:\.{1,2}|\.[\w-]+)\//.test(token)) return false
  const segments = token.split("/").filter(Boolean)
  if (segments.some((segment) => /^\.{3,}$/.test(segment))) return false
  if (token.endsWith("/")) return segments.length >= 2
  const last = segments.at(-1) ?? ""
  const dot = last.lastIndexOf(".")
  if (dot <= 0 || dot === last.length - 1) return false
  if (!KNOWN_FILE_EXTENSIONS.has(last.slice(dot + 1).toLowerCase())) return false
  return segments.length > 1 || !PRODUCT_NAMES_WITH_DOT_JS.test(last)
}

const suffixesOf = (path) => {
  const segments = path.split("/")
  return segments.map((_, start) => segments.slice(start).join("/"))
}

/** The names that a reference can resolve to: every tail of every tracked file and of every folder. */
const buildNameIndex = (paths) => {
  const names = new Set()
  for (const path of paths) {
    for (const suffix of suffixesOf(path)) names.add(suffix)
    const segments = path.split("/")
    for (let end = 1; end < segments.length; end += 1) {
      for (const suffix of suffixesOf(segments.slice(0, end).join("/"))) names.add(suffix)
    }
  }
  return names
}

const readAllowedRootNames = (root) => {
  try {
    const allowlist = JSON.parse(readFileSync(join(root, "tools", "root-allowlist.json"), "utf8"))
    return [...(allowlist.files ?? []), ...(allowlist.directories ?? [])]
  } catch {
    return []
  }
}

const createResolver = ({ root, names, alsoNames, alsoRepositoryNames, allowedRootNames }) => {
  const inAlsoSearch = (candidate) => {
    const stripped = candidate.replace(/^(?:\.\.\/)+/, "")
    const [first, ...rest] = stripped.split("/")
    const forms = [stripped, ...(alsoRepositoryNames.includes(first) ? [rest.join("/")] : [])]
    return forms.some((form) => alsoNames.some((index) => index.has(form)))
  }
  const resolvesOnDisk = (candidate) => !candidate.startsWith("..") && existsSync(join(root, candidate))
  const isAllowed = (candidate) => allowedRootNames.includes(candidate)
  return (token, fromDirectory) => {
    const direct = posix.normalize(token).replace(/\/$/, "")
    const relative = posix.normalize(posix.join(fromDirectory, token)).replace(/\/$/, "")
    return [direct, relative].some(
      (candidate) =>
        names.has(candidate) || resolvesOnDisk(candidate) || isAllowed(candidate) || inAlsoSearch(candidate),
    )
  }
}

const referenceSpans = (text) => {
  const body = stripFencedBlocks(text)
  const spans = [...body.matchAll(/`([^`\n]+)`/g)].map((match) => match[1].trim())
  const links = [...body.matchAll(/\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((match) => match[1])
  return { spans, links }
}

const unresolvedIn = (text, fromDirectory, resolves) => {
  const { spans, links } = referenceSpans(text)
  const unresolved = new Set()
  // A space inside a span or a decoded link can belong to the path, so the shape test reads it as one character.
  const judge = (token) => {
    const cleaned = cleanToken(token)
    if (looksLikePath(cleaned.replaceAll(/\s/g, "_")) && !resolves(cleaned, fromDirectory)) unresolved.add(cleaned)
  }
  for (const span of spans) {
    const tokens = span.split(/\s+/)
    const whole = cleanToken(span)
    // One path with a space: it resolves whole, or its folders sit before the space and its last part has none.
    const spacedPath = tokens.length > 1 && looksLikePath(whole.replaceAll(/\s/g, "_")) &&
      (resolves(whole, fromDirectory) || (!tokens.at(-1).includes("/") && tokens.slice(0, -1).some((token) => token.includes("/"))))
    for (const token of spacedPath ? [span] : tokens) judge(token)
  }
  for (const link of links) judge(link.replace(/\?.*$/, ""))
  return [...unresolved].sort()
}

// ---------------------------------------------------------------------------------------------
// Mode 1: emit
// ---------------------------------------------------------------------------------------------

const emptyCrossCounts = () => ({ byPath: 0, byBasename: 0 })

const readAlsoSearchRoot = (alsoRoot) => {
  const root = requireRepository(alsoRoot)
  const entries = readIndex(root)
  return { name: basename(root), root, entries, paths: entries.map((entry) => entry.path) }
}

const statBytes = (root, path) => {
  try {
    return lstatSync(join(root, path)).size
  } catch {
    return null
  }
}

const groupByHash = (entries, emptyHash) => {
  const groups = new Map()
  for (const { path, hash } of entries) {
    if (hash === emptyHash) continue
    groups.set(hash, [...(groups.get(hash) ?? []), path])
  }
  return groups
}

const buildLedgerRows = ({ root, entries, alsoRoots, emptyHash }) => {
  const dates = readLastCommitDates(root)
  const groups = groupByHash(entries, emptyHash)
  const rows = entries.map(({ path, hash }) => {
    const bytes = statBytes(root, path)
    return {
      path,
      class: classify(path),
      agentInstruction: isAgentInstruction(path),
      bytes,
      lastCommit: dates.get(path) ?? null,
      inboundByPath: 0,
      inboundByBasename: 0,
      crossRepositoryInbound: Object.fromEntries(alsoRoots.map((also) => [also.name, emptyCrossCounts()])),
      duplicateOf: (groups.get(hash) ?? []).filter((other) => other !== path),
      crossRepositoryDuplicateOf: alsoRoots.flatMap((also) =>
        also.entries.filter((other) => other.hash === hash && hash !== emptyHash).map((other) => `${also.name}/${other.path}`),
      ),
      unresolvedReferences: [],
      empty: bytes === 0,
      temporaryPattern: temporaryPatternOf(path),
    }
  })
  return rows
}

const applyInboundCounts = ({ root, rows, alsoRoots }) => {
  const search = buildSearch(rows)
  const own = rows.map(() => ({ byPath: 0, byBasename: 0 }))
  countInbound({ search, root, paths: rows.map((row) => row.path), counters: own, skipSelf: true })
  rows.forEach((row, index) => {
    row.inboundByPath = own[index].byPath
    row.inboundByBasename = own[index].byBasename
  })
  for (const also of alsoRoots) {
    const counters = rows.map(() => ({ byPath: 0, byBasename: 0 }))
    countInbound({ search, root: also.root, paths: also.paths, counters, skipSelf: false })
    rows.forEach((row, index) => {
      row.crossRepositoryInbound[also.name] = counters[index]
    })
  }
}

const applyUnresolvedReferences = ({ root, rows, alsoRoots }) => {
  const resolves = createResolver({
    root,
    names: buildNameIndex(rows.map((row) => row.path)),
    alsoNames: alsoRoots.map((also) => buildNameIndex(also.paths)),
    alsoRepositoryNames: alsoRoots.map((also) => also.name),
    allowedRootNames: readAllowedRootNames(root),
  })
  for (const row of rows) {
    if (!isScannedForReferences(row.path, row.class)) continue
    const text = readText(root, row.path)
    if (text !== null) row.unresolvedReferences = unresolvedIn(text, posix.dirname(row.path), resolves)
  }
}

const printEmitSummary = (rows, root, name) => {
  const byClass = CLASSES.map((fileClass) => `${fileClass} ${rows.filter((row) => row.class === fileClass).length}`)
  const duplicateGroups = new Set(rows.filter((row) => row.duplicateOf.length > 0).map((row) => [row.path, ...row.duplicateOf].sort()[0]))
  const untracked = readUntracked(root)
  console.error(`file-ledger: ${name}: ${rows.length} tracked files (${byClass.join(", ")})`)
  console.error(`file-ledger: duplicate groups: ${duplicateGroups.size}`)
  console.error(`file-ledger: untracked files that git does not ignore: ${untracked.length}`)
  for (const path of untracked) console.error(`  ${path}`)
}

const emit = ({ repo, alsoSearch }) => {
  const root = requireRepository(repo)
  const alsoRoots = alsoSearch.map(readAlsoSearchRoot)
  const names = alsoRoots.map((also) => also.name)
  if (new Set(names).size !== names.length) throw new UsageError(`--also-search roots share a name: ${names.join(", ")}`)
  const entries = readIndex(root)
  const rows = buildLedgerRows({ root, entries, alsoRoots, emptyHash: emptyBlobHash(root) })
  applyInboundCounts({ root, rows, alsoRoots })
  applyUnresolvedReferences({ root, rows, alsoRoots })
  process.stdout.write(rows.map((row) => `${JSON.stringify(row)}\n`).join(""))
  printEmitSummary(rows, root, repositoryName(root))
  return 0
}

// ---------------------------------------------------------------------------------------------
// Mode 2: verify
// ---------------------------------------------------------------------------------------------

const readLedger = (ledgerPath) => {
  let text
  try {
    text = readFileSync(resolve(ledgerPath), "utf8")
  } catch (error) {
    throw new UsageError(`cannot read ${ledgerPath}: ${error.message}`)
  }
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, index) => {
      try {
        const row = JSON.parse(line)
        if (row === null || typeof row !== "object" || typeof row.path !== "string") throw new Error("no path field")
        return row
      } catch (error) {
        throw new UsageError(`${ledgerPath} line ${index + 1} is not a ledger row: ${error.message}`)
      }
    })
}

const REJECTED_READERS = new Set(["", "none", "unknown", "n/a"])
const hasText = (value) => typeof value === "string" && value.trim() !== ""

const checkRow = ({ row, headTree, baseTree, otherTicket }) => {
  const problems = []
  const needsEvidence = row.verdict === "keep" || row.verdict === "update"
  if (needsEvidence) {
    if (!hasText(row.reader) || REJECTED_READERS.has(row.reader.trim().toLowerCase())) problems.push(`${row.verdict} row has no real reader`)
    if (!hasText(row.checked)) problems.push(`${row.verdict} row has no checked value`)
  }
  const changed = headTree.get(row.path) !== baseTree.get(row.path)
  if (row.verdict === "keep" && headTree.has(row.path) && changed) problems.push("keep row, but the content differs from base")
  if (row.verdict === "update" && headTree.has(row.path) && !changed) problems.push("update row, but the content equals base")
  if (row.verdict === "delete" && !hasText(row.note)) problems.push("delete row has no note with the search terms and the result")
  if (row.verdict === "other-ticket") {
    // A file that this branch changes is this branch's to judge, with a reader and a check.
    if (headTree.has(row.path) && changed) problems.push("other-ticket row, but this branch changed the file")
    if (!otherTicket) problems.push("other-ticket row, but --other-ticket was not given")
    else if (!hasText(row.note) || !row.note.includes(otherTicket)) problems.push(`other-ticket row note does not hold ${otherTicket}`)
  }
  return problems
}

const compareTrees = ({ rows, headTree, baseTree }) => {
  const defects = []
  const seen = new Set()
  for (const row of rows) {
    if (seen.has(row.path)) defects.push({ path: row.path, message: "more than one row for this path" })
    seen.add(row.path)
    if (!VERDICTS.includes(row.verdict)) defects.push({ path: row.path, message: `verdict must be one of ${VERDICTS.join(", ")}` })
  }
  const rowsByVerdict = (isDelete) => rows.filter((row) => (row.verdict === "delete") === isDelete && VERDICTS.includes(row.verdict))
  const keptPaths = new Set(rowsByVerdict(false).map((row) => row.path))
  const deletedPaths = new Set(rowsByVerdict(true).map((row) => row.path))
  for (const path of headTree.keys()) if (!keptPaths.has(path) && !deletedPaths.has(path)) defects.push({ path, message: "tracked file has no row" })
  for (const path of keptPaths) if (!headTree.has(path)) defects.push({ path, message: "row for a path that HEAD does not track" })
  for (const path of deletedPaths) {
    if (headTree.has(path)) defects.push({ path, message: "delete row, but HEAD still tracks the path" })
    else if (!baseTree.has(path)) defects.push({ path, message: "delete row, but base did not track the path" })
  }
  for (const path of baseTree.keys()) {
    if (!headTree.has(path) && !deletedPaths.has(path)) defects.push({ path, message: "path deleted since base has no delete row" })
  }
  return defects
}

const countDuplicateGroups = (tree, emptyHash) => {
  const counts = new Map()
  for (const hash of tree.values()) if (hash !== emptyHash) counts.set(hash, (counts.get(hash) ?? 0) + 1)
  return [...counts.values()].filter((count) => count > 1).length
}

const bytesRemoved = (root, baseTree, deletedPaths) => {
  if (deletedPaths.length === 0) return 0
  const input = deletedPaths.map((path) => `${baseTree.get(path)}\n`).join("")
  return gitText(root, ["cat-file", "--batch-check=%(objectsize)"], input)
    .split("\n")
    .filter(Boolean)
    .reduce((total, size) => total + Number(size), 0)
}

const tableRowFor = (label, inScope, { baseTree, headTree, rows }) => {
  const verdictCount = (verdict) => rows.filter((row) => row.verdict === verdict && inScope(row.path)).length
  const before = [...baseTree.keys()].filter(inScope).length
  const after = [...headTree.keys()].filter(inScope).length
  return `| ${label} | ${before} | ${after} | ${verdictCount("keep")} | ${verdictCount("update")} | ${verdictCount("delete")} | ${verdictCount("other-ticket")} |`
}

const summaryTable = ({ rows, headTree, baseTree, root, emptyHash }) => {
  const context = { rows, headTree, baseTree }
  const lines = ["| Class | Files before | Files after | keep | update | delete | other-ticket |", "|---|---:|---:|---:|---:|---:|---:|"]
  for (const fileClass of CLASSES) lines.push(tableRowFor(fileClass, (path) => classify(path) === fileClass, context))
  lines.push(tableRowFor("total", () => true, context))
  const deleted = rows.filter((row) => row.verdict === "delete").map((row) => row.path)
  lines.push(
    "",
    `bytes removed by deletes: ${bytesRemoved(root, baseTree, deleted)}`,
    `duplicate groups at base: ${countDuplicateGroups(baseTree, emptyHash)}, at head: ${countDuplicateGroups(headTree, emptyHash)}`,
  )
  return lines.join("\n")
}

const requireCommit = (root, commit) => {
  const check = git(root, ["rev-parse", "--verify", "--quiet", `${commit}^{commit}`])
  if (check.status !== 0) throw new UsageError(`${commit} is not a commit in ${root}`)
  return check.stdout.toString("utf8").trim()
}

const verify = ({ repo, ledger, base, otherTicket }) => {
  const root = requireRepository(repo)
  const baseSha = requireCommit(root, base)
  const rows = readLedger(ledger)
  const headTree = readTree(root, "HEAD")
  const baseTree = readTree(root, baseSha)
  const defects = compareTrees({ rows, headTree, baseTree })
  for (const row of rows) {
    if (!VERDICTS.includes(row.verdict)) continue
    for (const message of checkRow({ row, headTree, baseTree, otherTicket })) defects.push({ path: row.path, message })
  }
  console.log(summaryTable({ rows, headTree, baseTree, root, emptyHash: emptyBlobHash(root) }))
  if (gitText(root, ["status", "--porcelain", "--untracked-files=no"]).trim() !== "") {
    console.error("file-ledger: warning: the working tree has uncommitted changes; verify reads the commit at HEAD")
  }
  for (const { path, message } of defects) console.error(`defect: ${path}: ${message}`)
  if (defects.length > 0) console.error(`file-ledger: ${defects.length} defect(s)`)
  return defects.length > 0 ? 1 : 0
}

// ---------------------------------------------------------------------------------------------
// Mode 3: render
// ---------------------------------------------------------------------------------------------

const MAX_CELL_CHARS = 2000
const HEADER_RESERVE = 200

const cell = (value) => {
  const text = String(value ?? "").replaceAll("|", "\\|").replaceAll(/\s*\n\s*/g, " ").trim() || "-"
  return text.length > MAX_CELL_CHARS ? `${text.slice(0, MAX_CELL_CHARS)}...` : text
}

const renderRowLine = (row) => {
  const evidence = row.verdict === "delete" ? row.note : [row.checked, row.note].filter(hasText).join("; ")
  return `| ${cell(`\`${row.path}\``)} | ${cell(classify(row.path))} | ${cell(row.verdict)} | ${cell(row.reader)} | ${cell(evidence)} |`
}

const foldedLines = (rows) =>
  CLASSES.flatMap((fileClass) => {
    const group = rows.filter((row) => classify(row.path) === fileClass)
    if (group.length === 0) return []
    const notes = [...new Set(group.map((row) => row.note).filter(hasText))].slice(0, 3).join("; ")
    return [`| ${group.length} files | ${fileClass} | other-ticket | - | ${cell(notes)} |`]
  })

const chunkLines = (lines, allowance) => {
  const parts = [[]]
  let used = 0
  for (const line of lines) {
    if (line.length + 1 > allowance) throw new UsageError(`--max-chars is too small for one row of ${line.length} characters`)
    if (used + line.length + 1 > allowance && parts.at(-1).length > 0) {
      parts.push([])
      used = 0
    }
    parts.at(-1).push(line)
    used += line.length + 1
  }
  return parts
}

const render = ({ repo, ledger, base, outDir, maxChars }) => {
  const root = requireRepository(repo)
  const baseSha = base ? requireCommit(root, base) : gitText(root, ["merge-base", "HEAD", "origin/main"]).trim()
  const headSha = requireCommit(root, "HEAD")
  const rows = readLedger(ledger).sort(byPath)
  const lines = [
    ...rows.filter((row) => row.verdict !== "other-ticket").map(renderRowLine),
    ...foldedLines(rows.filter((row) => row.verdict === "other-ticket")),
  ]
  const tableHead = ["| path | class | verdict | reader | check or note |", "|---|---|---|---|---|"]
  const name = repositoryName(root)
  const allowance = maxChars - HEADER_RESERVE - name.length - tableHead.join("\n").length
  const parts = chunkLines(lines, allowance)
  mkdirSync(outDir, { recursive: true })
  for (const stale of readdirSync(outDir).filter((file) => /^ledger-part-\d+-of-\d+\.md$/.test(file))) rmSync(join(outDir, stale))
  const width = Math.max(2, String(parts.length).length)
  parts.forEach((partLines, index) => {
    const label = `${String(index + 1).padStart(width, "0")}-of-${String(parts.length).padStart(width, "0")}`
    const first = `${name} | ledger part ${index + 1} of ${parts.length} | base ${baseSha} | head ${headSha}`
    const body = [first, "", ...tableHead, ...partLines].join("\n")
    const target = join(outDir, `ledger-part-${label}.md`)
    writeFileSync(target, `${body}\n`)
    console.log(target)
  })
  return 0
}

// ---------------------------------------------------------------------------------------------
// Mode 4: candidates
// ---------------------------------------------------------------------------------------------

const PUBLISHED_STATUS = /^\s*-\s*\*\*Status(?:\*\*:|:\*\*)\s*Published\b/im

const readJson = (root, path) => {
  const text = readText(root, path)
  try {
    return text === null ? null : JSON.parse(text)
  } catch {
    throw new UsageError(`${join(root, path)} is not JSON`)
  }
}

/** The skill folders that skills-lock.json lists or that .claude/skills/VENDOR.md names in backticks. */
const pinnedSkillFolders = (root) => {
  const locked = Object.keys(readJson(root, "skills-lock.json")?.skills ?? {})
  const named = [...(readText(root, ".claude/skills/VENDOR.md") ?? "").matchAll(/`([\w.-]+)`/g)].map((match) => match[1])
  return new Set([...locked, ...named].map((name) => `.claude/skills/${name}/`))
}

/** Each record is a file that keeps its history by design, so it is never a hygiene candidate. */
const createRecordTest = (root, paths) => {
  const pinned = pinnedSkillFolders(root)
  const posts = paths
    .filter((path) => posix.basename(path) === "meta.md" && PUBLISHED_STATUS.test(readText(root, path) ?? ""))
    .map((path) => `${posix.dirname(path)}/`)
  return (path) => {
    const folders = path.split("/").slice(0, -1)
    if (path.startsWith("src/Orbit.Infrastructure/Migrations/") || folders.includes("Decisions")) return true
    if (path.startsWith("5 Journal/") || path.startsWith("0 Inbox/raw/")) return true
    if (DOC_EXTENSIONS.has(extname(path).toLowerCase()) && posts.some((folder) => path.startsWith(folder))) return true
    return [...pinned].some((folder) => path.startsWith(folder))
  }
}

/** The instruction files that share a folder with a second instruction file of different content. */
const conflictingInstructions = (rows) => {
  const byFolder = Map.groupBy(rows.filter((row) => row.agentInstruction), (row) => posix.dirname(row.path))
  const sameContent = (row, other) => row.duplicateOf.includes(other.path) || (row.empty && other.empty)
  return new Set(
    [...byFolder.values()].flatMap((group) => group.filter((row) => group.some((other) => other !== row && !sameContent(row, other)))).map((row) => row.path),
  )
}

const hasNoReader = (row) =>
  row.inboundByPath === 0 &&
  row.inboundByBasename === 0 &&
  Object.values(row.crossRepositoryInbound).every((counts) => counts.byPath === 0 && counts.byBasename === 0)

const kindOf = (row, conflicting) => {
  if (row.untracked) return "temporary"
  if (row.unresolvedReferences.length > 0 || conflicting.has(row.path)) return "outdated"
  if (row.temporaryPattern !== null) return "temporary"
  if (row.duplicateOf.length > 0 || row.crossRepositoryDuplicateOf.length > 0) return "duplicate"
  return hasNoReader(row) ? "old" : null
}

/** The judged count of each kind: an equal share of the cap each, and a share that a small kind leaves unused goes to the others. */
const shareCap = (groups, cap) => {
  const taken = new Map(CANDIDATE_KINDS.map((kind) => [kind, 0]))
  let left = cap
  let open = CANDIDATE_KINDS.filter((kind) => groups.get(kind).length > 0)
  while (left > 0 && open.length > 0) {
    const share = Math.max(1, Math.floor(left / open.length))
    for (const kind of open) {
      const take = Math.min(share, groups.get(kind).length - taken.get(kind), left)
      taken.set(kind, taken.get(kind) + take)
      left -= take
    }
    open = open.filter((kind) => taken.get(kind) < groups.get(kind).length)
  }
  return taken
}

const candidates = ({ repo, ledger }) => {
  const root = requireRepository(repo)
  const rows = readLedger(ledger)
  const tracked = readIndex(root).map((entry) => entry.path)
  const listed = new Set(rows.map((row) => row.path))
  if (listed.size !== rows.length || listed.size !== tracked.length || tracked.some((path) => !listed.has(path))) {
    throw new UsageError(`${ledger} does not list exactly the tracked files of ${root}; run the emit mode on it again`)
  }
  const isRecord = createRecordTest(root, tracked)
  const conflicting = conflictingInstructions(rows)
  const untracked = readUntracked(root).map((path) => ({ path, class: classify(path), untracked: true }))
  const groups = new Map(CANDIDATE_KINDS.map((kind) => [kind, []]))
  let records = 0
  for (const row of [...rows, ...untracked]) {
    const kind = kindOf(row, conflicting)
    if (kind === null) continue
    if (isRecord(row.path)) records += 1
    else groups.get(kind).push({ ...row, kind })
  }
  const dateOf = (row) => row.lastCommit ?? ""
  groups.get("old").sort((left, right) => (dateOf(left) < dateOf(right) ? -1 : dateOf(left) > dateOf(right) ? 1 : 0))
  const taken = shareCap(groups, CANDIDATE_CAP)
  const judged = CANDIDATE_KINDS.flatMap((kind) => groups.get(kind).slice(0, taken.get(kind)))
  const counts = Object.fromEntries(CANDIDATE_KINDS.map((kind) => [kind, { judged: taken.get(kind), deferred: groups.get(kind).length - taken.get(kind) }]))
  const name = repositoryName(root)
  const candidatesFile = join(defaultRepository, CANDIDATES_FOLDER, `${name}.jsonl`)
  mkdirSync(dirname(candidatesFile), { recursive: true })
  writeFileSync(candidatesFile, judged.map((row) => `${JSON.stringify(row)}\n`).join(""))
  console.log(JSON.stringify({ root, candidatesFile, counts }))
  const summary = CANDIDATE_KINDS.map((kind) => `${kind} ${counts[kind].judged} of ${counts[kind].judged + counts[kind].deferred}`).join(", ")
  console.error(`file-ledger: ${name}: judged candidates ${summary}; ${records} records left out; wrote ${candidatesFile}`)
  return 0
}

// ---------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------

const VALUE_FLAGS = ["--repo", "--also-search", "--verify", "--render", "--candidates", "--base", "--other-ticket", "--out-dir", "--max-chars"]
const MODE_FLAGS = { "--verify": "verify", "--render": "render", "--candidates": "candidates" }
const ALLOWED_FLAGS = {
  emit: ["--repo", "--also-search"],
  verify: ["--verify", "--repo", "--base", "--other-ticket"],
  render: ["--render", "--repo", "--base", "--out-dir", "--max-chars"],
  candidates: ["--candidates", "--repo"],
}

const parseArguments = (argv) => {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage())
    process.exit(0)
  }
  const options = { alsoSearch: [] }
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!VALUE_FLAGS.includes(flag)) throw new UsageError(`unknown argument: ${flag}`)
    if (value === undefined || value.startsWith("--")) throw new UsageError(`${flag} needs a value`)
    if (flag === "--also-search") options.alsoSearch.push(value)
    else if (options[flag] !== undefined) throw new UsageError(`${flag} was given twice`)
    else options[flag] = value
  }
  const modeFlags = Object.keys(MODE_FLAGS).filter((flag) => options[flag] !== undefined)
  if (modeFlags.length > 1) throw new UsageError(`${modeFlags.join(" and ")} are separate modes`)
  const mode = modeFlags.length === 0 ? "emit" : MODE_FLAGS[modeFlags[0]]
  const given = [...Object.keys(options).filter((key) => key.startsWith("--")), ...(options.alsoSearch.length > 0 ? ["--also-search"] : [])]
  const misplaced = given.filter((flag) => !ALLOWED_FLAGS[mode].includes(flag))
  if (misplaced.length > 0) throw new UsageError(`${misplaced.join(", ")} does not apply to the ${mode} mode`)
  if (mode === "verify" && options["--base"] === undefined) throw new UsageError("--verify needs --base <commit>")
  if (mode === "render" && options["--out-dir"] === undefined) throw new UsageError("--render needs --out-dir <dir>")
  const maxChars = options["--max-chars"] === undefined ? DEFAULT_MAX_CHARS : Number(options["--max-chars"])
  if (!Number.isInteger(maxChars) || maxChars < 1000) throw new UsageError("--max-chars must be an integer of at least 1000")
  return { mode, options, maxChars }
}

const defaultRepository = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const main = () => {
  const { mode, options, maxChars } = parseArguments(process.argv.slice(2))
  const repo = options["--repo"] === undefined ? defaultRepository : resolve(options["--repo"])
  if (mode === "verify") return verify({ repo, ledger: options["--verify"], base: options["--base"], otherTicket: options["--other-ticket"] })
  if (mode === "render") {
    return render({ repo, ledger: options["--render"], base: options["--base"], outDir: resolve(options["--out-dir"]), maxChars })
  }
  if (mode === "candidates") return candidates({ repo, ledger: options["--candidates"] })
  return emit({ repo, alsoSearch: options.alsoSearch.map((path) => resolve(path)) })
}

try {
  process.exitCode = main()
} catch (error) {
  if (!(error instanceof UsageError)) throw error
  console.error(`file-ledger: ${error.message}\n`)
  console.error("run with --help for usage")
  process.exitCode = 2
}
