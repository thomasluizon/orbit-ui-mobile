#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const BASELINE_PATH = join(REPO_ROOT, "tools", "archaeology-baseline.json")
const BASELINE_REPO_PATH = "tools/archaeology-baseline.json"

/** Root docs the CLAUDE.md registry tells an agent to read before acting. */
const ROOT_INSTRUCTION_DOCS = new Set(["DESIGN.md", "TESTING.md", "RENDER-CORRECTNESS.md", "FEATURES.md"])

/**
 * Half of the finding: the clause says WHICH RUN or WHEN. A stamp alone is fine (a dated
 * decision attribution is provenance a reader can still act on).
 */
const RUN_STAMPS = [
  ["an ISO date", /\b\d{4}-\d{2}-\d{2}\b/],
  ["a ticket identifier", /\bORB-\d+\b/],
  // The preposition is load-bearing. Without it "a backstop that clears the longest measured
  // session" reads as a named run; that is a threshold justified by an observation, not a story.
  ["a named run", /\b(?:on|in|during|from)\s+(?:the|that|this)\s+[^.:;|]{0,48}?\b(?:run|launch|session)\b/i],
  ["a bare time reference", /\bat (?:that point|that time|the time)\b/i],
]

/**
 * The other half: the clause reports a figure. A measurement alone is fine (an unattributed
 * figure is a threshold, and a threshold is exactly what an instruction file should carry).
 */
const MEASUREMENTS = [
  ["a measurement word", /\bmeasur(?:ed|ement|ements)\b/i],
  [
    "a figure in a cost unit",
    /\b\d[\d.,]*\s*[km]?\s*(?:tokens?|lines?|bytes?|seconds?|minutes?|hours?|rounds?|defects?|files?|attempts?|occurrences?|pull requests?)\b/i,
  ],
]

/**
 * A clause ends at sentence punctuation, at a blank line, or where a new Markdown block
 * starts. The block boundary keeps a table or a list from being read as one long clause,
 * which would pair a stamp in one row with a figure in another.
 */
const CLAUSE_BOUNDARY = /[.:;?!](?=\s|$)|\n[ \t]*\n|\n(?=[ \t]*[|#>]|[ \t]*[-*+][ \t]|[ \t]*\d+\.[ \t])/g

const USAGE = `usage: check-archaeology.mjs [--check | --write-baseline] [--json]

Bans run archaeology in instruction files: a measurement whose provenance is one past run.

THE DISTINCTION, IN ONE SENTENCE: a measurement that names WHAT it measured is a
justification and passes; a measurement that also names WHICH RUN or WHEN it came from is
archaeology and fails.

  passes  "budget roughly five seconds per worktree: measured at 4.9 s for one and 9.2 s
          for two" -- a threshold with the observation that set it.
  fails   "Measured on the ORB-N run: three reconciliation agents nobody asked for, about
          230k tokens" -- a story about one run.

An instruction file is read to decide what to do NOW. A threshold with its evidence is a
decision input. A paragraph about what one run cost in July is not, it is dead weight on
every future read, and it decays into a false claim the first time the harness changes
underneath it. Keep the rule and the number; move the run's name and date to the vault ADR
whose job is to record them.

Mechanically, a finding is one clause carrying BOTH:
  a run stamp    an ISO date, an ORB-<number>, "on|in|during|from the ... run|launch|session",
                 or "at that point" / "at that time" / "at the time"
  a measurement  the word measured / measurement, or a figure in a cost unit (tokens,
                 lines, bytes, seconds, minutes, hours, rounds, defects, files, attempts,
                 occurrences, pull requests)
Either one alone is not a finding, which is what keeps a dated decision attribution and an
unattributed threshold out of the report.

SCOPE: TRACKED Markdown this repository tells an agent to read before acting -- every
CLAUDE.md and AGENTS.md at any depth, every .md under .claude/, tools/*.md, and the root
registry docs (DESIGN.md, TESTING.md, RENDER-CORRECTNESS.md, FEATURES.md). This includes
.claude/playbooks/: a worked example may explain a decision, but attributing a measurement
to one past run is still archaeology and belongs in a record. Tracked, because an untracked
local artifact exists for nobody else. Nothing else is in scope: source is not read for
instructions, and a record is not an instruction. The brain vault is permanently out of
scope for that reason, not by exemption: an ADR naming a run is a RECORD, and it is where
this content is supposed to end up.

REACH, stated plainly: this gate sees files in THIS repository and nothing else. The
user-level Claude context (~/.claude/CLAUDE.md, ~/.claude/rules/*.md) and anything they
import, such as the brain vault's hot.md, are read on every turn and are the single largest
block of always-loaded instruction text, and no repository CI gate can reach any of them.
Archaeology there is real and this tool will never report it.

NO ESCAPE HATCH, deliberately. An inline suppression would let the next author write
archaeology at zero cost, which is the behaviour this gate exists to price. The only
accommodation is the shrink-only baseline, which can lose entries and never gain them.

  --check           fail on any occurrence above the target branch's baseline (default)
  --write-baseline  rewrite tools/archaeology-baseline.json from the current occurrences
  --json            print the result as machine-readable JSON
  --help, -h        print this usage and exit 0

exit codes:
  0  no instruction file carries more archaeology than the baseline allows, or written
  1  an instruction file carries more archaeology than the baseline allows
  2  invalid arguments, a malformed baseline, or a tool error`

// Playbooks are included deliberately. They instruct future runs; being example-shaped does not
// turn a run-specific measurement into a current decision input.
const isInstructionFile = (path) =>
  path === "CLAUDE.md" ||
  path.endsWith("/CLAUDE.md") ||
  path === "AGENTS.md" ||
  path.endsWith("/AGENTS.md") ||
  (path.startsWith(".claude/") && path.endsWith(".md")) ||
  (path.startsWith("tools/") && path.endsWith(".md")) ||
  ROOT_INSTRUCTION_DOCS.has(path)

function parseArguments() {
  const argumentsList = process.argv.slice(2)
  if (argumentsList.includes("--help") || argumentsList.includes("-h")) return { help: true }

  const known = new Set(["--check", "--write-baseline", "--json"])
  const unknown = argumentsList.find((argument) => !known.has(argument))
  const checks = argumentsList.filter((argument) => argument === "--check").length
  const writes = argumentsList.filter((argument) => argument === "--write-baseline").length
  const jsonFlags = argumentsList.filter((argument) => argument === "--json").length
  if (unknown || checks > 1 || writes > 1 || jsonFlags > 1 || (checks && writes)) {
    throw new Error(USAGE)
  }

  return { help: false, json: jsonFlags === 1, mode: writes === 1 ? "write" : "check" }
}

function runGit(argumentsList) {
  return spawnSync("git", argumentsList, { cwd: REPO_ROOT, encoding: "utf8", windowsHide: true })
}

function trackedInstructionFiles() {
  const listing = runGit(["ls-files", "-z", "--", "*.md"])
  if (listing.status !== 0) throw new Error("git ls-files failed; run this inside the repository's git checkout")
  return listing.stdout.split("\0").filter((path) => path !== "" && isInstructionFile(path))
}

function clauseSpans(text) {
  const spans = []
  let start = 0
  CLAUSE_BOUNDARY.lastIndex = 0
  let boundary
  while ((boundary = CLAUSE_BOUNDARY.exec(text)) !== null) {
    if (boundary.index > start) spans.push({ start, end: boundary.index })
    start = CLAUSE_BOUNDARY.lastIndex
  }
  if (start < text.length) spans.push({ start, end: text.length })
  return spans
}

const firstMatch = (patterns, clause) => {
  for (const [label, pattern] of patterns) {
    const found = clause.match(pattern)
    if (found) return { label, text: found[0].trim() }
  }
  return null
}

function findingsIn(file, text) {
  const findings = []
  for (const span of clauseSpans(text)) {
    const clause = text.slice(span.start, span.end)
    const stamp = firstMatch(RUN_STAMPS, clause)
    if (!stamp) continue
    const measurement = firstMatch(MEASUREMENTS, clause)
    if (!measurement) continue
    findings.push({
      file,
      line: text.slice(0, span.start).split("\n").length,
      stamp,
      measurement,
      clause: clause.replace(/\s+/g, " ").trim().slice(0, 160),
    })
  }
  return findings
}

function measureRepository() {
  const findings = []
  for (const file of trackedInstructionFiles()) {
    findings.push(...findingsIn(file, readFileSync(join(REPO_ROOT, file), "utf8")))
  }
  const files = {}
  for (const finding of findings) files[finding.file] = (files[finding.file] ?? 0) + 1
  return { findings, files, occurrences: findings.length }
}

function parseBaseline(text, source) {
  let baseline
  try {
    baseline = JSON.parse(text)
  } catch {
    throw new Error(`${source} is not valid JSON`)
  }

  const validFiles =
    baseline &&
    typeof baseline === "object" &&
    !Array.isArray(baseline) &&
    baseline.files &&
    typeof baseline.files === "object" &&
    !Array.isArray(baseline.files) &&
    Object.values(baseline.files).every((count) => Number.isInteger(count) && count > 0)
  const filesTotal = validFiles ? Object.values(baseline.files).reduce((total, count) => total + count, 0) : -1
  if (!validFiles || !Number.isInteger(baseline.occurrences) || baseline.occurrences !== filesTotal) {
    throw new Error(`${source} must contain matching positive integer occurrences and files values`)
  }
  return baseline
}

function resolveTargetRef() {
  const configured = process.env.ARCHAEOLOGY_BASE_REF?.trim()
  const githubBase = process.env.GITHUB_BASE_REF?.trim()
  const candidates = configured
    ? [configured]
    : githubBase
      ? [`refs/remotes/origin/${githubBase}`, githubBase]
      : ["refs/remotes/origin/main", "main"]

  for (const candidate of candidates) {
    if (runGit(["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`]).status === 0) return candidate
  }
  const requested = configured ?? githubBase ?? "origin/main or main"
  throw new Error(`target branch ${requested} is unavailable; fetch its history before checking`)
}

function readWorkingBaseline() {
  if (!existsSync(BASELINE_PATH) || !statSync(BASELINE_PATH).isFile()) return { occurrences: 0, files: {} }
  return parseBaseline(readFileSync(BASELINE_PATH, "utf8"), BASELINE_REPO_PATH)
}

function readComparisonBaseline() {
  const targetRef = resolveTargetRef()
  const listing = runGit(["ls-tree", "--name-only", targetRef, "--", BASELINE_REPO_PATH])
  if (listing.status !== 0) throw new Error(`could not inspect ${BASELINE_REPO_PATH} on target branch ${targetRef}`)
  if (listing.stdout.trim() === "") {
    return { ...readWorkingBaseline(), source: `${targetRef} (working tree bootstrap)` }
  }

  const blob = runGit(["show", `${targetRef}:${BASELINE_REPO_PATH}`])
  if (blob.status !== 0) throw new Error(`could not read ${BASELINE_REPO_PATH} from target branch ${targetRef}`)
  return {
    ...parseBaseline(blob.stdout, `${BASELINE_REPO_PATH} on target branch ${targetRef}`),
    source: targetRef,
  }
}

const WHY = [
  "why this shape is banned: an instruction file is read to decide what to do NOW. A measurement",
  "attributed to one past run is not a decision input, it is weight on every future read, and it",
  "decays into a false claim the moment the harness changes underneath it. Keep the rule and its",
  "number; move the run's name and date to the vault ADR whose job is to record them.",
]

function outputHuman(result) {
  console.log("Run archaeology in instruction files")
  console.log("")
  console.log(`scanned ${result.scannedFiles} tracked instruction files`)
  console.log(`occurrences: ${result.occurrences}    baseline: ${result.baselineOccurrences} (${result.baselineSource})`)
  if (result.baselined.length > 0) {
    console.log("")
    console.log("carried by the baseline, still owed a deletion:")
    for (const [file, count] of result.baselined) console.log(`  ${file}: ${count}`)
  }
  if (result.excess.length === 0) return

  console.log("")
  for (const finding of result.excess) {
    console.log(`${finding.file}:${finding.line}: run archaeology`)
    console.log(`  run stamp:   ${finding.stamp.label}, "${finding.stamp.text}"`)
    console.log(`  measurement: ${finding.measurement.label}, "${finding.measurement.text}"`)
    console.log(`  clause:      ${finding.clause}`)
  }
}

function main() {
  let argumentsParsed
  try {
    argumentsParsed = parseArguments()
  } catch (error) {
    console.error(error.message)
    return 2
  }
  if (argumentsParsed.help) {
    console.log(USAGE)
    return 0
  }

  try {
    const measurement = measureRepository()
    if (argumentsParsed.mode === "write") {
      const files = Object.fromEntries(Object.entries(measurement.files).sort(([a], [b]) => a.localeCompare(b)))
      writeFileSync(
        BASELINE_PATH,
        JSON.stringify({ occurrences: measurement.occurrences, files }, null, 2) + "\n",
      )
      if (argumentsParsed.json) console.log(JSON.stringify({ ...measurement, written: BASELINE_REPO_PATH }, null, 2))
      else console.log(`${BASELINE_REPO_PATH} written: ${measurement.occurrences} occurrences`)
      return 0
    }

    const baseline = readComparisonBaseline()
    const overFiles = Object.entries(measurement.files).filter(([file, count]) => count > (baseline.files[file] ?? 0))
    const overNames = new Set(overFiles.map(([file]) => file))
    const result = {
      ...measurement,
      scannedFiles: trackedInstructionFiles().length,
      baselineOccurrences: baseline.occurrences,
      baselineSource: baseline.source,
      baselined: Object.entries(measurement.files)
        .filter(([file]) => !overNames.has(file))
        .sort(([a], [b]) => a.localeCompare(b)),
      excess: measurement.findings.filter((finding) => overNames.has(finding.file)),
      status: overFiles.length === 0 ? "ok" : "over",
    }

    if (argumentsParsed.json) console.log(JSON.stringify(result, null, 2))
    else outputHuman(result)
    if (overFiles.length === 0) return 0

    if (!argumentsParsed.json) {
      console.error("")
      for (const [file, count] of overFiles) {
        console.error(`${file} carries ${count} occurrence(s); the baseline allows ${baseline.files[file] ?? 0}`)
      }
      console.error("")
      for (const line of WHY) console.error(line)
    }
    return 1
  } catch (error) {
    console.error(`check-archaeology: ${error.message}`)
    return 2
  }
}

process.exit(main())
