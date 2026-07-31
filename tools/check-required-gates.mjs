#!/usr/bin/env node
/**
 * Every deterministic gate must be a REQUIRED check, or it cannot block a merge. Proof that a
 * gate which cannot block is a log line: PR #654's `review` concluded `failure` and merged 91
 * minutes later.
 *
 * This reads the workflow files, reads the branch-protection API, and diffs them:
 *   - a job defined in an ENFORCED workflow with no matching required context, and
 *   - a required context produced by no enforced workflow job and not declared external.
 *
 * The enforced set is declared in tools/required-gates.json rather than inferred from "every
 * job on a pull_request workflow", which would name the architecture map, the mutation report,
 * the perf budget, the visual gate and the review workflow itself, none of which are meant to
 * block. Every exemption in that manifest carries its reason, so the file is the argument.
 *
 * Reading protection needs the **Administration** permission; a non-admin identity gets 403.
 * `GET /repos/{owner}/{repo}/rules/branches/main` is NOT a substitute: verified live, it
 * returns `[]` on all three repos, which use classic branch protection rather than rulesets.
 *
 * --head additionally reads the check runs on a commit and applies the correction that cost a
 * false red on 2026-07-31: `guards.yml` triggers on `edited`, so a body edit posts a SECOND
 * check run per job on the same head SHA, and GitHub honours only the LATEST run per context.
 * A tool that scans the whole rollup reports failures GitHub does not honour.
 *
 * Invoked by the Harness Execution job in guards.yml; see tools/README.md for the catalog row.
 */

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const USAGE = `usage: check-required-gates.mjs --repo <owner/name> [options]

  Diffs the jobs defined in the enforced workflows against the branch-protection
  required contexts, and exits non-zero naming every side of the difference.

  --repo <owner/name>        repository to check (required)
  --branch <name>            protected branch; default: the manifest's branch
  --manifest <path>          default: tools/required-gates.json
  --workflows-dir <path>     default: .github/workflows
  --protection-file <path>   read a recorded protection payload instead of the API
  --head <sha>               also report required contexts with no honoured check run
  --check-runs-file <path>   read recorded check runs instead of the API
  --report-only              print the verdict and exit 0
  --json                     print the result as machine-readable JSON
  --help, -h                 print this usage and exit 0

exit codes: 0 aligned (or --report-only), 1 a difference, 2 usage or lookup error`

const FLAGS_WITH_VALUES = new Set(["--repo", "--branch", "--manifest", "--workflows-dir", "--protection-file", "--head", "--check-runs-file"])
const BOOLEAN_FLAGS = new Set(["--report-only", "--json"])

const fail = (message) => {
  console.error(`check-required-gates: ${message}`)
  process.exit(2)
}

function parseArguments(argumentList) {
  const parsed = { reportOnly: false, json: false }
  for (let index = 0; index < argumentList.length; index++) {
    const argument = argumentList[index]
    if (BOOLEAN_FLAGS.has(argument)) {
      parsed[argument === "--report-only" ? "reportOnly" : "json"] = true
      continue
    }
    if (!FLAGS_WITH_VALUES.has(argument)) fail(`unknown argument: ${argument}\n\n${USAGE}`)
    const value = argumentList[++index]
    if (value === undefined || value.startsWith("--")) fail(`${argument} requires a value\n\n${USAGE}`)
    parsed[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value
  }
  return parsed
}

/**
 * Job display names from a workflow file, without a YAML dependency: a job id is a two-space
 * key under `jobs:`, and its `name:` is the four-space key inside it. A name carrying a `${{ }}`
 * expression is a matrix job whose real context names cannot be resolved statically, so it is
 * reported as such rather than guessed at.
 */
export function workflowJobNames(source) {
  const lines = source.split(/\r?\n/)
  const start = lines.findIndex((line) => /^jobs:\s*$/.test(line))
  if (start === -1) return []
  const jobs = []
  let currentId = null
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break
    const jobId = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line)
    if (jobId) {
      currentId = jobId[1]
      jobs.push({ id: currentId, name: currentId, dynamic: false })
      continue
    }
    const jobName = /^ {4}name:\s*(.+?)\s*$/.exec(line)
    if (jobName && currentId) {
      const name = jobName[1].replace(/^["']|["']$/g, "")
      const entry = jobs.at(-1)
      entry.name = name
      entry.dynamic = name.includes("${{")
    }
  }
  return jobs
}

/** The latest honoured run per context: group by name, then keep the last to complete. */
export function latestRunPerContext(runs) {
  const byName = new Map()
  for (const run of runs) {
    if (!run || typeof run.name !== "string") continue
    const instant = Date.parse(run.completed_at ?? run.started_at ?? "") || 0
    const held = byName.get(run.name)
    if (!held || instant >= held.instant) byName.set(run.name, { instant, run })
  }
  return [...byName.values()].map(({ run }) => run)
}

function readJsonFile(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    fail(`could not read ${label} at ${path}: ${error.message}`)
  }
}

function readFromApi(endpoint, label) {
  // No shell: the endpoint carries a repository, branch and SHA from the caller, and a shell
  // would let any of them run a command. GH_BIN is how the harness substitutes its stub.
  const result = spawnSync(process.env.GH_BIN ?? "gh", ["api", endpoint, "--paginate"], { encoding: "utf8" })
  if (result.error) fail(`could not run gh for ${label}: ${result.error.message}`)
  if (result.status !== 0) {
    fail(`gh api ${endpoint} exited ${result.status}: ${(result.stderr || "").trim()}\n     reading branch protection needs the Administration permission`)
  }
  try {
    return JSON.parse(result.stdout)
  } catch (error) {
    fail(`gh api ${endpoint} returned unparseable JSON for ${label}: ${error.message}`)
  }
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}
const argumentsParsed = parseArguments(process.argv.slice(2))
if (!argumentsParsed.repo) fail(`--repo <owner/name> is required\n\n${USAGE}`)
if (!/^[^/\s]+\/[^/\s]+$/.test(argumentsParsed.repo)) fail(`--repo must be <owner/name>, got: ${argumentsParsed.repo}`)

const manifestPath = argumentsParsed.manifest ?? join(REPO_ROOT, "tools", "required-gates.json")
const manifest = readJsonFile(manifestPath, "the required-gates manifest")
const declaration = manifest?.repositories?.[argumentsParsed.repo]
if (!declaration) fail(`${argumentsParsed.repo} is not declared in ${manifestPath}. Add it, with its enforced workflows and the reason for every exemption.`)

const branch = argumentsParsed.branch ?? declaration.branch
if (!branch) fail(`no branch for ${argumentsParsed.repo}: pass --branch or declare one in the manifest`)

const workflowsDirectory = argumentsParsed.workflowsDir ?? join(REPO_ROOT, ".github", "workflows")
if (!existsSync(workflowsDirectory)) fail(`no workflow directory at ${workflowsDirectory}`)

const enforcedWorkflows = declaration.enforcedWorkflows ?? []
const externalContexts = declaration.externalContexts ?? {}
const exemptJobs = declaration.exemptJobs ?? {}

const missingWorkflows = enforcedWorkflows.filter((file) => !existsSync(join(workflowsDirectory, file)))
if (missingWorkflows.length > 0) {
  fail(`enforced workflow file missing from ${workflowsDirectory}: ${missingWorkflows.join(", ")}`)
}
const presentWorkflows = readdirSync(workflowsDirectory).filter((file) => /\.ya?ml$/.test(file))
if (presentWorkflows.length === 0) fail(`${workflowsDirectory} contains no workflow files, so this gate would prove nothing`)

const definedJobs = enforcedWorkflows.flatMap((file) =>
  workflowJobNames(readFileSync(join(workflowsDirectory, file), "utf8")).map((job) => ({ ...job, workflow: file })),
)

const protection = argumentsParsed.protectionFile
  ? readJsonFile(argumentsParsed.protectionFile, "the recorded protection payload")
  : readFromApi(`repos/${argumentsParsed.repo}/branches/${branch}/protection`, "branch protection")

const requiredContexts = protection?.required_status_checks?.contexts
if (!Array.isArray(requiredContexts)) {
  fail(`branch protection for ${argumentsParsed.repo}@${branch} carries no required_status_checks.contexts array. Refusing rather than reading an unconfirmed shape as "nothing is required".`)
}

const problems = []
const dynamicJobs = definedJobs.filter((job) => job.dynamic)
for (const job of dynamicJobs) {
  if (externalContexts[`${job.workflow}:${job.id}`]) continue
  problems.push(`${job.workflow} job "${job.id}" has a templated name (${job.name}); a static reader cannot resolve its contexts. Declare them in externalContexts, or drop the workflow from enforcedWorkflows.`)
}
const definedNames = new Set(definedJobs.filter((job) => !job.dynamic).map((job) => job.name))

for (const job of definedJobs) {
  if (job.dynamic) continue
  if (requiredContexts.includes(job.name)) continue
  const exemption = exemptJobs[`${job.workflow}:${job.name}`]
  if (exemption) continue
  problems.push(`${job.workflow} defines "${job.name}" but it is NOT a required context on ${branch}. A gate that cannot block is not a gate: add it to branch protection, or declare it in exemptJobs with a reason.`)
}
for (const context of requiredContexts) {
  if (definedNames.has(context)) continue
  if (externalContexts[context]) continue
  problems.push(`"${context}" is required on ${branch} but no enforced workflow defines it. A required context nobody reports blocks the branch forever: remove it, or declare it in externalContexts with its producer.`)
}

let honouredRuns = null
if (argumentsParsed.head) {
  const runs = argumentsParsed.checkRunsFile
    ? readJsonFile(argumentsParsed.checkRunsFile, "the recorded check runs")
    : readFromApi(`repos/${argumentsParsed.repo}/commits/${argumentsParsed.head}/check-runs`, "check runs")
  const rawRuns = Array.isArray(runs) ? runs : runs?.check_runs
  if (!Array.isArray(rawRuns)) fail(`check runs for ${argumentsParsed.head} carry no check_runs array`)
  honouredRuns = latestRunPerContext(rawRuns)
  const byName = new Map(honouredRuns.map((run) => [run.name, run]))
  for (const context of requiredContexts) {
    const run = byName.get(context)
    if (!run) {
      problems.push(`required context "${context}" has no check run on ${argumentsParsed.head}; the pull request stays blocked waiting for a status nobody reports.`)
      continue
    }
    if (run.status !== "completed") {
      problems.push(`required context "${context}" is still ${run.status} on ${argumentsParsed.head}.`)
      continue
    }
    if (!["success", "skipped", "neutral"].includes(run.conclusion)) {
      problems.push(`required context "${context}" concluded ${run.conclusion} on its LATEST run on ${argumentsParsed.head}.`)
    }
  }
}

if (argumentsParsed.json) {
  console.log(
    JSON.stringify(
      {
        repo: argumentsParsed.repo,
        branch,
        enforcedWorkflows,
        definedJobs: definedJobs.map((job) => `${job.workflow}:${job.name}`),
        requiredContexts,
        honouredRuns: honouredRuns?.map((run) => ({ name: run.name, status: run.status, conclusion: run.conclusion })) ?? null,
        problems,
      },
      null,
      2,
    ),
  )
} else {
  console.log(`required gates for ${argumentsParsed.repo}@${branch}`)
  console.log(`  enforced workflows: ${enforcedWorkflows.join(", ") || "none"}`)
  console.log(`  jobs defined:       ${definedJobs.length}`)
  console.log(`  contexts required:  ${requiredContexts.length}`)
  if (honouredRuns) console.log(`  honoured runs:      ${honouredRuns.length} (latest per context on ${argumentsParsed.head})`)
  if (problems.length === 0) {
    console.log("\nevery enforced job is required and every required context is accounted for")
  } else {
    console.log("")
    for (const problem of problems) console.log(`  - ${problem}`)
  }
}

if (problems.length > 0 && argumentsParsed.reportOnly) {
  console.log(`\n${problems.length} difference(s), reported only.`)
}
process.exit(problems.length > 0 && !argumentsParsed.reportOnly ? 1 : 0)
