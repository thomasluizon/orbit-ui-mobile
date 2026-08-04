#!/usr/bin/env node
/**
 * Prove a deleted path is DEAD, instead of asserting it. "I grepped and it was unused" is a
 * claim, and ORB-163 exists to remove the class of claim that reports green over a condition
 * nothing checked.
 *
 * Four arms, chosen because the three an earlier draft proposed would have caught almost none
 * of the real errors this ticket found: deleting the `dashes` and `copy` jobs from guards.yml,
 * deleting check-push-target.mjs from lefthook.yml, and deleting the merge sweep's two
 * feature-detector lines ALL pass check-lockstep, the tools harness and the hooks harness
 * cleanly. So the gate checks what those three do not.
 *
 *   1. references   no surviving TRACKED reference in any searched repository.
 *   2. harnesses    the three harness invocations still exist in CI, are scheduled to run for
 *                   this change, and carry recorded exit-0 verdicts supplied by the caller.
 *   3. guards jobs  every guards.yml job name present at the base ref is still present.
 *   4. protection   no context the deletion stops producing is a required status check.
 *
 * Arm 1 searches TRACKED content, never the working directory. During this very ticket a plain
 * `grep -rl` over a checkout reported .claude/audits/dual-engine-proposal.md and
 * .claude/reviews/pr-652-review.md as references. Both directories are gitignored and
 * `git ls-files` on them returns zero tracked files, so acting on that report would have
 * produced a pull request touching two files that exist for nobody else.
 *
 * Arm 2 does not run the harnesses. The tools suite alone takes about 25 minutes, so the caller
 * records each direct invocation and its exit code in --harness-verdicts after running it. The
 * tool refuses absent or malformed evidence, fails on a nonzero verdict, then independently
 * checks that the invocations still exist and this change actually triggers them. The scheduling
 * half is not decoration: guards.yml scopes both executions to a diff matching
 * ^(tools/|\.claude/), so deleting only a file under .github/workflows/ schedules NEITHER
 * harness, and "all three harnesses pass" would be a statement about a suite that never ran.
 *
 * Arm 4 reads branch protection, which needs a token carrying the Administration permission.
 * "Could not look" reports differently from "checked and aligned" and never reads as a pass:
 * without --protection-unchecked it exits 2, and with it the verdict says NOT CHECKED in both
 * the text and the JSON. That is the convention tools/check-required-gates.mjs already set for
 * the same lookup, kept rather than a second one invented beside it.
 */

import { spawnSyncHidden as spawnSync } from "./lib/subprocess-options.mjs"
import { existsSync, readFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const GATE_WORKFLOW = ".github/workflows/guards.yml"
const MARKER = "dead-path-ok:"
const MINIMUM_REASON = 12
const MINIMUM_SEARCH_KEY = 4

const HARNESSES = [
  { label: "tools", invocation: "tools/test-tools.mjs", command: "node tools/test-tools.mjs" },
  { label: "hooks", invocation: ".claude/hooks/test-hooks.mjs", command: "node .claude/hooks/test-hooks.mjs" },
  { label: "lockstep", invocation: "tools/check-lockstep.mjs", command: "node tools/check-lockstep.mjs" },
]

const USAGE = `usage: check-dead-path.mjs [--path <repo-relative>]... [options]

  Proves that deleting a path leaves nothing behind that still needs it: no surviving
  tracked reference, the CI harnesses still wired and scheduled, no guards.yml job gone
  with it, and no branch-protection required context left with no producer.

  --path <p>              a deleted repo-relative path; repeatable. Omit to take every
                          deletion in the change under test.
  --base <ref>            the ref the change is measured against; default origin/main.
  --repo-root <path>      the checkout the deletion is in; default this script's repository.
  --search-root <path>    a repository to search; repeatable. Given even once, it REPLACES
                          the default set, which is --repo-root plus every other repository
                          in .claude/orchestrator.json's repos.
  --harness-verdicts <path>
                          REQUIRED JSON record of the three direct harness invocations. It must
                          carry exactly tools, hooks and lockstep, each as an object with the exact
                          command and an integer exitCode from 0 through 255. Capture each exit code
                          directly after its command, never through a pipe. Example:
                            {
                              "tools": { "command": "node tools/test-tools.mjs", "exitCode": 0 },
                              "hooks": { "command": "node .claude/hooks/test-hooks.mjs", "exitCode": 0 },
                              "lockstep": { "command": "node tools/check-lockstep.mjs", "exitCode": 0 }
                            }
  --protection-file <owner/name>=<path>
                          read a recorded protection payload for that repository instead of
                          the API; repeatable.
  --protection-unchecked  proceed when branch protection cannot be read. Prints a loud
                          banner and reports the arm as NOT CHECKED, never as aligned.
  --json                  print the result as machine-readable JSON.
  --help, -h              print this usage and exit 0.

exit codes: 0 every applicable arm checked and clean
            1 a surviving reference, a failed, missing or unscheduled harness, a lost
              guards.yml job, or a required context the deletion stops producing
            2 usage, invalid harness evidence, or a lookup this tool refuses to guess at

The search key is the basename with its final extension removed, matched as a
case-insensitive substring of tracked content, so two deleted wrappers with different final
extensions share one search. A basename whose stem is shorter than ${MINIMUM_SEARCH_KEY} characters is refused
rather than searched for, because a substring that short reports the whole repository.

THE BOUNDARY, AS A RULE RATHER THAN A LIST

  The vault is not searched, and that is a rule, not an omission. The gate is about a path
  with no remaining CALLER, and a decision record naming a workflow that used to exist is a
  record. Nothing dereferences it at run time, and deleting history to satisfy a grep
  destroys the reason the sweep happened.

  Inside a repository a surviving reference is one of exactly three things:

    CALLER    it is dereferenced at run time and the deletion breaks it, or it stops the
              deletion from taking effect. The fix is to delete the reference, or to admit
              the path is not dead yet.
    DETECTOR  it exists in order to observe the path's ABSENCE, and it is correct precisely
              because the path is gone. The merge sweep positively detects that
              the configured review workflow no longer exists and fails closed if that
              lookup breaks; deleting that line would break the deletion, not complete it.
    RECORD    it describes history and drives nothing.

  NO TOOL CAN TELL THEM APART, and this one does not try. Intent is not in the text: a
  detector assigning the deleted path to a variable and a caller assigning it are
  byte-identical, and a comment explaining a deletion reads exactly like a comment
  explaining a dependency. So every surviving reference is reported as UNCLASSIFIED and the
  run fails. The gate's claim is only that a human looked, never that a machine decided.

  The human's decision is then recorded where the reference lives, on its own line or the
  line directly above it:

      ${MARKER} <reason, at least ${MINIMUM_REASON} characters>

  Inline, and nowhere else. A central exemption file is how the last sweep's sediment
  survived: an entry outlives its reason, nobody re-reads it, and the next sweep inherits a
  list instead of an argument. A marker lives and dies with the line it excuses, appears in
  the diff that adds it, and cannot be added for a file that no longer has the reference. A
  marker with no reason fails exactly like no marker. The cost is real and is accepted on
  purpose: a script detecting one absence in several places carries a marker on each of those
  lines. A file-scoped marker would cost less and would silently excuse the next reference
  somebody adds to that file, which is the hole this gate exists to close.

  Only a DETECTOR earns a marker. A caller has to go. A RECORD that lives in a repository is
  reported too, and its fix is to move it out of the search scope rather than to mark it,
  because a record filed where a grep reads it will be read as a caller by the next sweep.
  That is already this repository's rule for durable knowledge (CLAUDE.md: research reports
  and ADRs live in the vault), so a changelog entry or a superseded ADR copy naming a deleted
  path is itself the defect. Git history is the changelog and git history is not searched, so
  moving one loses nothing.

  A test fixture that deliberately contains the name is not a fourth kind. It asserts
  something about the path, so it is a detector when it asserts the absence and a caller when
  it asserts the presence, and the assertion tells you which.`

const VALUE_FLAGS = new Set(["--path", "--base", "--repo-root", "--search-root", "--harness-verdicts", "--protection-file"])

const fail = (message) => {
  console.error(`check-dead-path: ${message}`)
  process.exit(2)
}

function parseArguments(argumentList) {
  const parsed = { paths: [], searchRoots: [], protectionFiles: new Map(), json: false, protectionUnchecked: false, base: "origin/main", harnessVerdicts: null }
  for (let index = 0; index < argumentList.length; index++) {
    const argument = argumentList[index]
    if (argument === "--json") {
      parsed.json = true
      continue
    }
    if (argument === "--protection-unchecked") {
      parsed.protectionUnchecked = true
      continue
    }
    if (!VALUE_FLAGS.has(argument)) fail(`unknown argument: ${argument}\n\n${USAGE}`)
    const value = argumentList[++index]
    if (value === undefined || value.startsWith("--")) fail(`${argument} requires a value\n\n${USAGE}`)
    if (argument === "--path") parsed.paths.push(value.replaceAll("\\", "/").replace(/^\.\//, ""))
    else if (argument === "--search-root") parsed.searchRoots.push(value)
    else if (argument === "--base") parsed.base = value
    else if (argument === "--repo-root") parsed.repoRoot = value
    else if (argument === "--harness-verdicts") {
      if (parsed.harnessVerdicts !== null) fail("--harness-verdicts may be given only once")
      parsed.harnessVerdicts = value
    }
    else {
      const separator = value.indexOf("=")
      if (separator === -1) fail(`--protection-file takes <owner/name>=<path>, got: ${value}`)
      parsed.protectionFiles.set(value.slice(0, separator), value.slice(separator + 1))
    }
  }
  return parsed
}

const git = (root, argv) => {
  const result = spawnSync(process.env.GIT_BIN ?? "git", ["-C", root, ...argv], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  if (result.error) fail(`could not run git in ${root}: ${result.error.message}`)
  return { status: result.status, stdout: result.stdout ?? "", stderr: (result.stderr ?? "").trim() }
}

/** owner/name for a checkout, or null when it has no resolvable origin. */
const checkoutRepository = (root) => {
  const remote = git(root, ["remote", "get-url", "origin"])
  if (remote.status !== 0) return null
  const parts = remote.stdout.trim().replace(/\.git$/, "").split(/[/:]/).filter(Boolean)
  return parts.length >= 2 ? `${parts.at(-2)}/${parts.at(-1)}` : null
}

/**
 * Job ids and display names from a workflow file. check-required-gates.mjs has a reader of the
 * same shape, and this is the SECOND use, not the third: importing that one would execute its
 * whole script body, which parses argv and exits, so sharing it means moving it, which is a
 * change to a file this slice does not own. The block bodies are what arm 2 needs and that
 * reader does not return them.
 */
export function workflowJobs(source) {
  const lines = source.split(/\r?\n/)
  const start = lines.findIndex((line) => /^jobs:\s*$/.test(line))
  if (start === -1) return []
  const jobs = []
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break
    const jobId = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line)
    if (jobId) {
      jobs.push({ id: jobId[1], name: jobId[1], named: false, body: [] })
      continue
    }
    const current = jobs.at(-1)
    if (!current) continue
    const jobName = /^ {4}name:\s*(.+?)\s*$/.exec(line)
    if (jobName && !current.named) {
      current.name = jobName[1].replace(/^["']|["']$/g, "")
      current.named = true
    }
    current.body.push(line)
  }
  return jobs
}

/** The reason on a dead-path-ok marker, or null when the line carries no marker. */
export const markerReason = (line) => {
  const at = line.indexOf(MARKER)
  return at === -1 ? null : line.slice(at + MARKER.length).trim()
}

const fileLines = (root, path, cache) => {
  const key = `${root} :: ${path}`
  if (!cache.has(key)) {
    const absolute = join(root, path)
    cache.set(key, existsSync(absolute) ? readFileSync(absolute, "utf8").split(/\r?\n/) : [])
  }
  return cache.get(key)
}

/**
 * Every tracked line in `root` carrying `key`, with the deleted paths themselves excluded so
 * the same run works before and after the files leave the tree. `git grep` with no ref reads
 * TRACKED files only, which is the whole point: an untracked local artifact is not a caller
 * for anybody but this machine.
 */
function trackedHits(root, key, excluded) {
  const pathspec = ["--", ".", ...excluded.map((path) => `:(exclude)${path}`)]
  const search = (argv) => {
    const result = git(root, ["grep", "--no-color", "-i", "-F", ...argv, "-e", key, ...pathspec])
    if (result.status === 1) return []
    if (result.status !== 0) fail(`git grep for "${key}" in ${root} exited ${result.status}: ${result.stderr}`)
    return result.stdout.split(/\r?\n/).filter(Boolean)
  }
  const hits = search(["-n", "-I"]).map((line) => {
    const path = line.slice(0, line.indexOf(":"))
    const rest = line.slice(path.length + 1)
    const number = Number(rest.slice(0, rest.indexOf(":")))
    return { path, line: number, text: rest.slice(String(number).length + 1) }
  })
  /**
   * -I skips a file git reads as binary, and a single stray NUL byte is enough to make git
   * read a source file that way. This tool shipped with one for an afternoon, which would
   * have made its own source invisible to its own search. A binary match has no line and no
   * marker, so it is reported as its own kind rather than dropped.
   */
  const textFiles = new Set(hits.map((hit) => hit.path))
  const binaryMatches = search(["-l"]).filter((path) => !textFiles.has(path))
  return [...hits, ...binaryMatches.map((path) => ({ path, line: 0, text: "", binary: true }))]
}

/**
 * A hit survives the gate only when it, or the line directly above it, declares why. Nothing
 * here reads intent out of the text, because intent is not in the text: a detector assigning
 * the deleted path to a variable and a caller assigning it are byte-identical.
 */
function classifyHits(hits, root, cache) {
  const surviving = []
  const declared = []
  for (const hit of hits) {
    if (hit.binary) {
      surviving.push({ ...hit, why: "matched in a file git reads as binary, where no marker can be read" })
      continue
    }
    const lines = fileLines(root, hit.path, cache)
    const reasons = [markerReason(hit.text), hit.line >= 2 ? markerReason(lines[hit.line - 2] ?? "") : null].filter((reason) => reason !== null)
    const reason = reasons.find((candidate) => candidate.length >= MINIMUM_REASON)
    if (reason !== undefined) declared.push({ ...hit, reason })
    else if (reasons.length > 0) surviving.push({ ...hit, why: `the ${MARKER} marker carries no reason` })
    else surviving.push({ ...hit, why: "unclassified" })
  }
  return { surviving, declared }
}

function resolveSearchRoots(parsed, repoRoot) {
  if (parsed.searchRoots.length > 0) return parsed.searchRoots.map((root) => ({ root: resolve(root), repository: checkoutRepository(resolve(root)) }))
  const configPath = join(repoRoot, ".claude", "orchestrator.json")
  if (!existsSync(configPath)) fail(`no ${configPath} to take the sibling repositories from; pass --search-root for each repository to search`)
  const declared = JSON.parse(readFileSync(configPath, "utf8")).repos ?? {}
  const own = checkoutRepository(repoRoot)
  const roots = [{ root: repoRoot, repository: own }]
  for (const [name, path] of Object.entries(declared)) {
    const candidate = resolve(path)
    const repository = checkoutRepository(candidate)
    if (repository === null) {
      fail(
        `.claude/orchestrator.json declares repos.${name} at ${candidate}, which is not a checkout this run can search.\n` +
          "     Refusing rather than searching fewer repositories than the verdict claims. Pass --search-root for each repository to search.",
      )
    }
    if (repository === own || roots.some((entry) => entry.repository === repository)) continue
    roots.push({ root: candidate, repository })
  }
  return roots
}

function harnessSchedule(jobs, changedPaths) {
  return HARNESSES.map(({ label, invocation }) => {
    const job = jobs.find((candidate) => candidate.body.some((line) => line.includes(invocation)))
    if (!job) return { label, invocation, present: false, scheduled: false }
    const scope = /grep -Eq '([^']*)'/.exec(job.body.join("\n"))?.[1] ?? null
    if (scope === null) return { label, invocation, present: true, job: job.name, scope: null, scheduled: true }
    if (scope.includes("[[:")) fail(`guards.yml job "${job.name}" scopes on a POSIX character class this reader cannot translate: ${scope}`)
    let pattern = null
    try {
      pattern = new RegExp(scope)
    } catch (error) {
      fail(`could not read the scope filter of guards.yml job "${job.name}" as a regular expression: ${error.message}`)
    }
    return { label, invocation, present: true, job: job.name, scope, scheduled: changedPaths.some((path) => pattern.test(path)) }
  })
}

const readJsonFile = (path, label) => {
  let contents
  try {
    contents = readFileSync(path, "utf8")
  } catch (error) {
    fail(`could not read ${label} at ${path}: ${error.message}`)
  }
  try {
    return JSON.parse(contents)
  } catch (error) {
    fail(`${label} at ${path} is not valid JSON: ${error.message}`)
  }
}

function readHarnessVerdicts(path) {
  const payload = readJsonFile(path, "the harness verdicts")
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    fail("the harness verdicts must be a JSON object")
  }

  const expectedKeys = HARNESSES.map((harness) => harness.label).sort()
  const actualKeys = Object.keys(payload).sort()
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    fail(`the harness verdicts must carry exactly these keys: ${expectedKeys.join(", ")}`)
  }

  return HARNESSES.map((harness) => {
    const verdict = payload[harness.label]
    if (verdict === null || typeof verdict !== "object" || Array.isArray(verdict)) {
      fail(`the ${harness.label} harness verdict must be an object`)
    }
    const verdictKeys = Object.keys(verdict).sort()
    if (verdictKeys.length !== 2 || verdictKeys[0] !== "command" || verdictKeys[1] !== "exitCode") {
      fail(`the ${harness.label} harness verdict must carry exactly command and exitCode`)
    }
    if (verdict.command !== harness.command) {
      fail(`${harness.label} command must be exactly "${harness.command}"`)
    }
    if (!Number.isInteger(verdict.exitCode) || verdict.exitCode < 0 || verdict.exitCode > 255) {
      fail(`${harness.label} exitCode must be an integer from 0 through 255`)
    }
    return { ...harness, exitCode: verdict.exitCode }
  })
}

/** Required contexts for one repository, or a stated reason the lookup could not happen. */
function requiredContexts(repository, branch, recordedPath) {
  const payload = recordedPath
    ? readJsonFile(recordedPath, `the recorded protection payload for ${repository}`)
    : (() => {
        const result = spawnSync(process.env.GH_BIN ?? "gh", ["api", `repos/${repository}/branches/${branch}/protection`], { encoding: "utf8" })
        if (result.error) return { unreadable: `could not run gh: ${result.error.message}` }
        if (result.status !== 0) return { unreadable: `gh exited ${result.status}: ${(result.stderr || "").trim()} (reading branch protection needs the Administration permission)` }
        try {
          return JSON.parse(result.stdout)
        } catch (error) {
          return { unreadable: `gh returned unparseable JSON: ${error.message}` }
        }
      })()
  if (payload.unreadable) return { repository, branch, unreadable: payload.unreadable }
  const contexts = payload?.required_status_checks?.contexts
  if (!Array.isArray(contexts)) {
    return { repository, branch, unreadable: "the payload carries no required_status_checks.contexts array, and reading that as \"nothing is required\" is the failure this gate exists to prevent" }
  }
  return { repository, branch, contexts }
}

function protectionArm(atRisk, repoRoot, parsed) {
  const manifestPath = join(repoRoot, "tools", "required-gates.json")
  /**
   * A --protection-file naming a repository the manifest does not declare would be ignored, and
   * the run would quietly read the live API instead of the payload the caller supplied. Silently
   * doing something other than what was asked is the shape of defect this gate exists for.
   */
  if (parsed.protectionFiles.size > 0) {
    if (!existsSync(manifestPath)) fail(`--protection-file was given but there is no ${manifestPath} declaring which repositories are checked`)
    const declared = Object.keys(readJsonFile(manifestPath, "the required-gates manifest").repositories ?? {})
    const unknown = [...parsed.protectionFiles.keys()].filter((repository) => !declared.includes(repository))
    if (unknown.length > 0) fail(`--protection-file names ${unknown.join(", ")}, which ${manifestPath} does not declare. Its payload would be ignored and the live API read instead.`)
  }
  if (atRisk.length === 0) {
    return { status: "not-applicable", checked: false, detail: "no deleted path stops producing a status context", repositories: [], problems: [] }
  }
  if (!existsSync(manifestPath)) fail(`no ${manifestPath}, so the repositories whose protection to read are unknown`)
  const manifest = readJsonFile(manifestPath, "the required-gates manifest")
  const readings = Object.entries(manifest.repositories ?? {}).map(([repository, declaration]) =>
    requiredContexts(repository, declaration.branch, parsed.protectionFiles.get(repository)),
  )
  if (readings.length === 0) fail(`${manifestPath} declares no repositories, so this arm would check nothing`)
  const unreadable = readings.filter((reading) => reading.unreadable)
  if (unreadable.length > 0 && !parsed.protectionUnchecked) {
    fail(
      `branch protection could not be read for ${unreadable.map((reading) => reading.repository).join(", ")}.\n` +
        unreadable.map((reading) => `     ${reading.repository}: ${reading.unreadable}`).join("\n") +
        "\n     Pass --protection-unchecked to proceed with this arm reported as NOT CHECKED. It will not read as aligned.",
    )
  }
  const problems = []
  for (const reading of readings) {
    for (const entry of atRisk) {
      if (reading.contexts?.includes(entry.context)) {
        problems.push(
          `"${entry.context}" is a required status check on ${reading.repository}@${reading.branch} and ${entry.path} is the only thing that reports it. Remove the required context FIRST or the branch waits forever for a status nobody posts; orbit-api #440 and #441 sat in exactly that state for two days with every reported check green.`,
        )
      }
    }
  }
  return {
    status: problems.length > 0 ? "fail" : unreadable.length > 0 ? "not-checked" : "ok",
    checked: unreadable.length === 0,
    repositories: readings.map((reading) => ({ repository: reading.repository, branch: reading.branch, unreadable: reading.unreadable ?? null })),
    atRisk,
    problems,
  }
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const parsed = parseArguments(process.argv.slice(2))
if (parsed.harnessVerdicts === null) fail("--harness-verdicts is required")
const harnessVerdicts = readHarnessVerdicts(resolve(parsed.harnessVerdicts))
const repoRoot = resolve(parsed.repoRoot ?? SELF_ROOT)
if (!existsSync(join(repoRoot, ".git"))) fail(`--repo-root ${repoRoot} is not a git checkout`)

const baseCommit = git(repoRoot, ["rev-parse", "--verify", `${parsed.base}^{commit}`])
if (baseCommit.status !== 0) fail(`--base ${parsed.base} does not resolve to a commit in ${repoRoot}: ${baseCommit.stderr}`)
const mergeBase = git(repoRoot, ["merge-base", parsed.base, "HEAD"])
if (mergeBase.status !== 0) fail(`no merge base between ${parsed.base} and HEAD in ${repoRoot}: ${mergeBase.stderr}`)
const since = mergeBase.stdout.trim()

/**
 * The change under test is the merge base against the WORKING TREE, not against HEAD. A gate
 * meant to run at the moment of deletion has to see the deletion, and at that moment it is
 * uncommitted. With a clean tree this is exactly the three-dot diff CI computes.
 */
const changedPaths = git(repoRoot, ["diff", "--name-only", "--diff-filter=ACMRD", since]).stdout.split(/\r?\n/).filter(Boolean)
const deletedPaths = [
  ...new Set(
    parsed.paths.length > 0
      ? parsed.paths
      : git(repoRoot, ["diff", "--name-only", "--diff-filter=D", since]).stdout.split(/\r?\n/).filter(Boolean),
  ),
]
if (deletedPaths.length === 0) {
  fail(`nothing to prove dead: ${parsed.base}...working tree deletes no path and no --path was given`)
}

const searchKeys = deletedPaths.map((path) => {
  const name = basename(path)
  const stem = name.replace(/(?!^)\.[^.]+$/, "")
  if (stem.length < MINIMUM_SEARCH_KEY) {
    fail(`"${name}" leaves the search key "${stem}", which is shorter than ${MINIMUM_SEARCH_KEY} characters. A substring that short reports the whole repository, so this deletion cannot be proven by search.`)
  }
  return { path, key: stem, stillPresent: existsSync(join(repoRoot, path)) }
})

/**
 * Deleted paths with the same basename stem share one search key, so the search runs per key and
 * not per extension. Reporting the same line twice trains a reader to skim the list.
 */
const keyGroups = [...new Map(searchKeys.map((entry) => [entry.key, searchKeys.filter((other) => other.key === entry.key).map((other) => other.path)])).entries()]

const searchRoots = resolveSearchRoots(parsed, repoRoot)
const lineCache = new Map()
const references = []
for (const { root, repository } of searchRoots) {
  for (const [key, paths] of keyGroups) {
    const excluded = root === repoRoot ? deletedPaths : []
    const { surviving, declared } = classifyHits(trackedHits(root, key, excluded), root, lineCache)
    references.push({ root, repository: repository ?? root, paths, key, surviving, declared })
  }
}
const survivingReferences = references.flatMap((entry) =>
  entry.surviving.map((hit) => ({ repository: entry.repository, paths: entry.paths, at: hit.binary ? hit.path : `${hit.path}:${hit.line}`, why: hit.why, text: hit.text.trim().slice(0, 160) })),
)

const gateAfter = existsSync(join(repoRoot, GATE_WORKFLOW)) ? workflowJobs(readFileSync(join(repoRoot, GATE_WORKFLOW), "utf8")) : []
const gateBeforeSource = git(repoRoot, ["show", `${since}:${GATE_WORKFLOW}`])
const gateBefore = gateBeforeSource.status === 0 ? workflowJobs(gateBeforeSource.stdout) : []
const afterNames = new Set(gateAfter.map((job) => job.name))
const lostJobs = gateBefore.map((job) => job.name).filter((name) => !afterNames.has(name))

const harnesses = harnessSchedule(gateAfter, changedPaths)
const missingHarnesses = harnesses.filter((harness) => !harness.present)
const scheduledHarnesses = harnesses.filter((harness) => harness.scheduled)
const failedHarnesses = harnessVerdicts.filter((harness) => harness.exitCode !== 0)

const atRisk = [
  ...deletedPaths
    .filter((path) => /^\.github\/workflows\/.+\.ya?ml$/.test(path))
    .flatMap((path) => {
      const before = git(repoRoot, ["show", `${since}:${path}`])
      return before.status === 0 ? workflowJobs(before.stdout).map((job) => ({ context: job.name, path })) : []
    }),
  ...lostJobs.map((name) => ({ context: name, path: GATE_WORKFLOW })),
]
const protection = protectionArm(atRisk, repoRoot, parsed)

const arms = {
  references: {
    status: survivingReferences.length > 0 ? "fail" : "ok",
    detail:
      survivingReferences.length > 0
        ? `${survivingReferences.length} surviving tracked reference(s) across ${new Set(survivingReferences.map((hit) => hit.repository)).size} repository/repositories`
        : `no tracked reference in ${searchRoots.length} repository/repositories, ${references.reduce((total, entry) => total + entry.declared.length, 0)} declared with ${MARKER}`,
  },
  harnesses: {
    status: failedHarnesses.length > 0 || missingHarnesses.length > 0 || scheduledHarnesses.length === 0 ? "fail" : "ok",
    detail:
      failedHarnesses.length > 0
        ? `${failedHarnesses.map((harness) => `${harness.label} recorded exit ${harness.exitCode}`).join(", ")}`
        : missingHarnesses.length > 0
        ? `${missingHarnesses.map((harness) => harness.invocation).join(", ")} is invoked by no ${GATE_WORKFLOW} job`
        : scheduledHarnesses.length === 0
          ? `none of the three harnesses is scheduled by this change, so nothing in the harness layer will look at it`
          : `${harnessVerdicts.map((harness) => `${harness.label} recorded exit ${harness.exitCode}`).join(", ")}; ${harnesses.map((harness) => `${harness.label} ${harness.scheduled ? "scheduled" : "not scheduled"}`).join(", ")}`,
  },
  guardsJobs: {
    status: lostJobs.length > 0 ? "fail" : "ok",
    detail: lostJobs.length > 0 ? `${lostJobs.length} job name(s) lost: ${lostJobs.join(", ")}` : `${gateBefore.length} job name(s) at the base ref, none lost`,
  },
  protection: {
    status: protection.status,
    detail:
      protection.status === "not-applicable"
        ? protection.detail
        : protection.status === "not-checked"
          ? `NOT CHECKED: ${protection.repositories.filter((entry) => entry.unreadable).map((entry) => `${entry.repository} (${entry.unreadable})`).join("; ")}`
          : protection.problems.length > 0
            ? protection.problems.join(" ")
            : `no at-risk context (${atRisk.map((entry) => `"${entry.context}"`).join(", ")}) is required by ${protection.repositories.map((entry) => `${entry.repository}@${entry.branch}`).join(" or ")}`,
  },
}

const failed = Object.values(arms).some((arm) => arm.status === "fail")

if (parsed.json) {
  console.log(
    JSON.stringify(
      { base: parsed.base, mergeBase: since, repoRoot, searchRoots: searchRoots.map((entry) => entry.repository ?? entry.root), deletedPaths: searchKeys, changedPaths, arms, survivingReferences, declaredReferences: references.flatMap((entry) => entry.declared.map((hit) => ({ repository: entry.repository, at: `${hit.path}:${hit.line}`, reason: hit.reason }))), harnessVerdicts, harnesses, lostJobs, protection },
      null,
      2,
    ),
  )
} else {
  if (protection.status === "not-checked") {
    console.log("PROTECTION NOT CHECKED: this run could not read branch protection, so arm 4 proves nothing.")
  }
  console.log(`check-dead-path: ${deletedPaths.length} deleted path(s) against ${parsed.base} (${since.slice(0, 8)})`)
  for (const entry of searchKeys) console.log(`  ${entry.path}${entry.stillPresent ? " (still in the tree; the verdict is what happens once it is gone)" : ""}`)
  console.log("")
  for (const [name, arm] of Object.entries(arms)) {
    console.log(`  ${name.padEnd(12)} ${arm.status.toUpperCase().padEnd(15)} ${arm.detail}`)
  }
  if (survivingReferences.length > 0) {
    console.log("")
    for (const hit of survivingReferences) {
      console.log(`  - ${hit.repository} ${hit.at} still references ${hit.paths.join(" / ")} (${hit.why})`)
      console.log(`      ${hit.text}`)
    }
    console.log(
      `\n  Each is a CALLER (delete it), a DETECTOR of the path's absence (declare it inline with "${MARKER} <reason>")\n` +
        "  or a RECORD (move it to the vault, where a later grep cannot read it as a caller). This tool cannot tell\n" +
        "  them apart from the text and does not guess; see --help for why the classification is yours.",
    )
  }
}

process.exit(failed ? 1 : 0)
