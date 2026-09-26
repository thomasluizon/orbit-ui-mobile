#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs"
import { dirname, extname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import yaml from "js-yaml"

const USAGE = `usage: check-gate-charter.mjs [--root <repository>]

  Verifies that every repository gate declares its pull request scope, snapshot
  regeneration command, and sourced constants in tools/gate-charter.json.

  --root <repository>  check this repository instead of the script's repository
  --help, -h           print this usage and exit 0

exit codes: 0 charter complete, 1 charter violation, 2 usage or configuration error`

const ALLOWED_SCOPES = new Set(["changed-files", "whole-tree-advisory", "whole-tree-blocking"])
const BLOCKING_INVENTORIES = new Set([
  ".github/workflows/guards.yml#dashes",
  ".github/workflows/guards.yml#sonar-paths",
  "tools/check-dashes.mjs",
  "tools/check-sonar-paths.mjs",
])
const REQUIRED_FIELDS = ["scope", "snapshot", "constants"]

function parseArguments(argv) {
  let repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--help" || argument === "-h") {
      console.log(USAGE)
      process.exit(0)
    }
    if (argument === "--root") {
      const value = argv[index + 1]
      if (!value) throw new Error("--root requires a repository path")
      repositoryRoot = resolve(value)
      index += 1
      continue
    }
    throw new Error(`unknown argument: ${argument}`)
  }
  return repositoryRoot
}

function filesIn(repositoryRoot, directory, predicate) {
  const absoluteDirectory = resolve(repositoryRoot, directory)
  return readdirSync(absoluteDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && predicate(entry.name))
    .map((entry) => `${directory}/${entry.name}`)
}

function workflowJobs(repositoryRoot, path) {
  const workflow = yaml.load(readFileSync(resolve(repositoryRoot, path), "utf8"))
  if (workflow === null || Array.isArray(workflow) || typeof workflow !== "object" ||
      workflow.jobs === null || Array.isArray(workflow.jobs) || typeof workflow.jobs !== "object") {
    throw new Error(`${path} has no jobs mapping`)
  }
  return workflow.jobs
}

function guardJobIds(repositoryRoot) {
  const jobs = Object.keys(workflowJobs(repositoryRoot, ".github/workflows/guards.yml"))
  if (jobs.some((job) => !/^[a-zA-Z0-9_-]+$/.test(job))) {
    throw new Error("guards.yml job ids must contain only letters, digits, underscores, or hyphens")
  }
  return jobs
    .map((job) => `.github/workflows/guards.yml#${job}`)
}

function runSteps(job) {
  if (job === null || Array.isArray(job) || typeof job !== "object" || !Array.isArray(job.steps)) return []
  return job.steps.filter((step) => step && typeof step === "object" && typeof step.run === "string")
}

function commandOffsets(script) {
  return [...script.matchAll(/^(?!\s*#).*?(?:\b(?:node|npx)\s+|\bexit\s+1\b).*$/gm)]
    .map((match) => {
      let end = match.index + match[0].length
      while (script.slice(match.index, end).trimEnd().endsWith("\\")) {
        const nextLine = script.indexOf("\n", end + 1)
        end = nextLine < 0 ? script.length : nextLine
      }
      return { index: match.index, line: script.slice(match.index, end) }
    })
}

function conditionalRanges(script) {
  const ranges = []
  const pattern = /\bif\s+([\s\S]*?)(?:;\s*|\n\s*)then\b([\s\S]*?)\bfi\b/g
  for (const match of script.matchAll(pattern)) {
    const bodyStart = match.index + match[0].indexOf(match[2])
    const elseOffset = match[2].search(/\belse\b/)
    ranges.push({
      condition: match[1],
      thenStart: bodyStart,
      thenEnd: elseOffset < 0 ? bodyStart + match[2].length : bodyStart + elseOffset,
    })
  }
  return ranges
}

function derivedVariables(script) {
  const variables = new Set()
  for (const match of script.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)=\$\(([\s\S]*?)\)/g)) {
    if (/\bgit\s+diff\s+--name-only\b/.test(match[2]) ||
        /\b(?:cat|grep\s+-zE)\b[\s\S]*?\$RUNNER_TEMP\/changed-paths\.(?:txt|nul)|\$RUNNER_TEMP\/changed-paths-present\.nul/.test(match[2])) {
      variables.add(match[1])
    }
  }
  let changed = true
  while (changed) {
    changed = false
    for (const match of script.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)=\$\(([\s\S]*?)\)/g)) {
      if (!variables.has(match[1]) && [...variables].some((variable) => new RegExp(`\\$${variable}\\b`).test(match[2]))) {
        variables.add(match[1])
        changed = true
      }
    }
  }
  return variables
}

function commandUsesRedirectedChangedFiles(script, command) {
  const before = script.slice(0, command.index)
  const preparedCopy = /\bcp\s+"\$RUNNER_TEMP\/changed-paths\.(?:txt|nul)"\s+"([^"]+)"/.exec(before)
  if (preparedCopy && command.line.includes(`--changed-files-file "${preparedCopy[1]}"`)) return true
  for (const match of before.matchAll(/\bgit\s+diff\s+--name-only\b[^\n]*(?:\\\r?\n[^\n]*)*?>\s*(?:"([^"]+)"|'([^']+)'|([^\s;]+))/g)) {
    const target = match[1] ?? match[2] ?? match[3]
    if (new RegExp(`--changed-files-file\\s+["']?${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(command.line)) return true
  }
  return false
}

function commandUsesChangedFilePipeline(script, command) {
  if (/\bxargs\s+-0\s+--no-run-if-empty\s+node\b/.test(command.line) &&
      script.includes('< "$RUNNER_TEMP/changed-paths-present.nul"')) return true
  const before = script.slice(0, command.index)
  const diff = before.lastIndexOf("git diff --name-only")
  if (diff < 0) return false
  const connection = script.slice(diff, command.index + command.line.length)
  return /\bgit\s+diff\s+--name-only\b[^\n]*(?:\\\r?\n\s*)?\|\s*xargs[^\n;]*\b(?:node|npx)\b/.test(connection)
}

function conditionUsesChangedFiles(condition) {
  if (/\bgrep\s+-Eq\s+['"][^\n]+['"]\s+"\$RUNNER_TEMP\/changed-paths\.txt"/.test(condition)) return true
  const diff = condition.indexOf("git diff --name-only")
  if (diff < 0) return false
  const beforeDiff = condition.slice(0, diff)
  const changedFileTest = condition.slice(diff)
  if (changedFileTest.includes("||") || !/\bgit\s+diff\s+--name-only\b[\s\S]*?\|\s*grep\s+-Eq\b/.test(changedFileTest)) return false
  if (!beforeDiff.includes("||")) return true
  return /github\.event_name[^\n]*!=\s*['"]pull_request['"]\s*\]\s*\|\|\s*(?:\\\s*)?$/.test(beforeDiff.trim())
}

function commandIsConditionedOnChangedFiles(script, command, variables) {
  return conditionalRanges(script).some((range) => {
    if (command.index < range.thenStart || command.index >= range.thenEnd) return false
    if (!range.condition.includes("||") && /github\.event_name[^\n]*!=\s*['"]pull_request['"]/.test(range.condition)) return true
    if (conditionUsesChangedFiles(range.condition)) return true
    return !range.condition.includes("||") &&
      [...variables].some((variable) => new RegExp(`\\$${variable}\\b`).test(range.condition))
  })
}

function isPrerequisiteRun(script) {
  return /^npm\s+ci(?:\s+[^\r\n]+)?$/u.test(script.trim())
}

function blockingRunUsesChangedFiles(script) {
  const commands = commandOffsets(script)
  if (commands.length === 0) return isPrerequisiteRun(script)
  const variables = derivedVariables(script)
  return commands.every((command) =>
    /tools\/check-dashes\.mjs\s+--text\b/.test(command.line) ||
    commandUsesRedirectedChangedFiles(script, command) ||
    commandUsesChangedFilePipeline(script, command) ||
    commandIsConditionedOnChangedFiles(script, command, variables),
  )
}

function guardJobUsesChangedFiles(job) {
  const blockingRuns = runSteps(job).filter((step) => step["continue-on-error"] !== true)
  const timeless = blockingRuns.at(-1)?.run.trim()
  if (timeless === `if [ "\${{ github.event_name }}" = "pull_request" ]; then
  node tools/check-timeless.mjs --base origin/\${{ github.base_ref }}
else
  node tools/check-timeless.mjs --all
fi` && blockingRuns.slice(0, -1).every((step) => isPrerequisiteRun(step.run))) return true
  const preparation = blockingRuns.findIndex((step) =>
    step.name === "Resolve pull request changed paths" &&
    step.if === "github.event_name == 'pull_request'" &&
    step.run === 'bash .github/scripts/changed-paths.sh "$BASE_REF" "$RUNNER_TEMP"' &&
    step.env?.BASE_REF === "${{ github.base_ref }}")
  if (preparation < 0 && blockingRuns.some((step) => step.run.includes("$RUNNER_TEMP/changed-paths"))) return false
  if (preparation >= 0 && blockingRuns.slice(0, preparation).some((step) => !isPrerequisiteRun(step.run))) return false
  return blockingRuns.length > 0 && blockingRuns.every((step, index) =>
    index === preparation || blockingRunUsesChangedFiles(step.run))
}

function guardJobIsAdvisory(job) {
  const runs = runSteps(job)
  return runs.length > 0 && runs.every((step) => isPrerequisiteRun(step.run) || step["continue-on-error"] === true)
}

function preparesChangedPaths(job) {
  const runs = runSteps(job)
  const preparation = runs.findIndex((step) =>
    step.name === "Resolve pull request changed paths" &&
    step.if === "github.event_name == 'pull_request'" &&
    step["continue-on-error"] !== true &&
    step.env?.BASE_REF === "${{ github.base_ref }}" &&
    step.run === 'bash .github/scripts/changed-paths.sh "$BASE_REF" "$RUNNER_TEMP"')
  return preparation >= 0 && runs.slice(0, preparation).every((step) => isPrerequisiteRun(step.run))
}

function lintCallerUsesChangedFiles(repositoryRoot) {
  const lintJob = workflowJobs(repositoryRoot, ".github/workflows/test.yml").lint
  if (!preparesChangedPaths(lintJob)) return false
  const lintRuns = runSteps(lintJob)
    .filter((step) => /\beslint\b|\b(?:npm|npx|turbo)\b[^\n]*\blint\b/.test(step.run))
  if (lintRuns.length !== 1) return false
  const script = lintRuns[0].run
  if (/\b(?:npm|npx|turbo)\b[^\n]*\b(?:run\s+)?lint\b/.test(script)) return false
  if (/\bgit\s+diff\s+--name-only\b/.test(script)) return false
  const loop = /\bwhile\b[\s\S]*?;\s*do([\s\S]*?)\bdone\s*<\s*"\$RUNNER_TEMP\/changed-paths-present\.nul"/.exec(script)
  if (!loop) return false
  return ["web", "mobile", "shared"].every((workspace) => {
    const sourcePath = workspace === "shared" ? "packages/shared/" : `apps/${workspace}/`
    const append = new RegExp(`${workspace}\\+=\\(\"\\$\\{file#${sourcePath.replace("/", "\\/")}\\}\"\\)`)
    const initializationCount = [...script.matchAll(new RegExp(`\\b${workspace}=\\(`, "g"))].length
    return initializationCount === 1 && append.test(loop[1]) &&
      new RegExp(`eslint\\s+--\\s+"\\$\\{${workspace}\\[@\\]\\}"`).test(script)
  })
}

function designGuardUsesChangedFiles(repositoryRoot) {
  const designJob = workflowJobs(repositoryRoot, ".github/workflows/test.yml")["design-guard"]
  if (!preparesChangedPaths(designJob)) return false
  const runs = runSteps(designJob)
  const tokenStep = runs.find((step) => step.name === "Ban raw --slate-*, transition-all, h-screen in app code")
  const gradientStep = runs.find((step) => step.name === "Ban decorative gradients in app code")
  if (!tokenStep || !gradientStep || tokenStep["continue-on-error"] === true || gradientStep["continue-on-error"] === true) return false
  if ([tokenStep.run, gradientStep.run].some((script) => /\bgit\s+diff\s+--name-only\b/.test(script))) return false
  return /\bgrep\s+-zE\b[^\n]*"\$RUNNER_TEMP\/changed-paths-present\.nul"/.test(tokenStep.run) &&
    /\bgrep\s+-Eq\b[^\n]*"\$RUNNER_TEMP\/changed-paths\.txt"/.test(gradientStep.run)
}

function gateCharterRunsForPath(guardJobs, path) {
  const gateCharter = guardJobs["gate-charter"]
  if (!gateCharter) return true
  return runSteps(gateCharter).some((step) => {
    const command = /\bnode\s+tools\/check-gate-charter\.mjs\b/.exec(step.run)
    if (!command) return false
    return conditionalRanges(step.run).some((range) => {
      if (command.index < range.thenStart || command.index >= range.thenEnd) return false
      if (!conditionUsesChangedFiles(range.condition)) return false
      for (const match of range.condition.matchAll(/\bgrep\s+-Eq\s+(['"])(.*?)\1/g)) {
        try {
          if (new RegExp(match[2]).test(path)) return true
        } catch {
          return false
        }
      }
      return false
    })
  })
}

function gateIds(repositoryRoot) {
  return [
    ...filesIn(repositoryRoot, "tools", (name) => /^check-.*\.mjs$/.test(name)),
    ...filesIn(repositoryRoot, "eslint-rules", (name) => [".cjs", ".js", ".mjs"].includes(extname(name)) && !name.startsWith("_")),
    ...filesIn(repositoryRoot, ".claude/hooks", (name) => [".cjs", ".js", ".mjs"].includes(extname(name)) && name !== "test-hooks.mjs"),
    ...guardJobIds(repositoryRoot),
  ].sort()
}

function validateEntry(id, entry) {
  const problems = []
  if (entry === null || Array.isArray(entry) || typeof entry !== "object") {
    return [`${id}: entry must be an object`]
  }
  const fields = Object.keys(entry)
  for (const field of REQUIRED_FIELDS) {
    if (!fields.includes(field)) problems.push(`${id}: missing ${field}`)
  }
  for (const field of fields) {
    if (!REQUIRED_FIELDS.includes(field)) problems.push(`${id}: unknown field ${field}`)
  }
  if (!ALLOWED_SCOPES.has(entry.scope)) {
    problems.push(`${id}: scope must be changed-files, whole-tree-advisory, or whole-tree-blocking`)
  }
  if (entry.scope === "whole-tree-blocking" && !BLOCKING_INVENTORIES.has(id)) {
    problems.push(`${id}: whole-tree-blocking is reserved for path inventories`)
  }
  if (entry.snapshot !== "none" && (typeof entry.snapshot !== "string" || entry.snapshot.trim() === "")) {
    problems.push(`${id}: snapshot must be none or a regeneration command`)
  }
  if (entry.constants !== "none") {
    if (!Array.isArray(entry.constants) || entry.constants.length === 0) {
      problems.push(`${id}: constants must be none or a non-empty array`)
    } else {
      entry.constants.forEach((constant, index) => {
        if (constant === null || Array.isArray(constant) || typeof constant !== "object") {
          problems.push(`${id}: constants[${index}] must be an object`)
          return
        }
        if (typeof constant.name !== "string" || constant.name.trim() === "") {
          problems.push(`${id}: constants[${index}] needs a name`)
        }
        if (typeof constant.source !== "string" || constant.source.trim() === "") {
          problems.push(`${id}: constants[${index}] needs a source`)
        }
        for (const field of Object.keys(constant)) {
          if (!["name", "source"].includes(field)) {
            problems.push(`${id}: constants[${index}] has unknown field ${field}`)
          }
        }
      })
    }
  }
  return problems
}

function stringValues(value) {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.flatMap(stringValues)
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(stringValues)
  return []
}

const FROZEN_PULL_REQUEST_FIELD = /\bgithub\s*(?:\.\s*event|\[\s*['"]event['"]\s*\])\s*(?:\.\s*pull_request|\[\s*['"]pull_request['"]\s*\])\s*(?:\.\s*(body|title)\b|\[\s*['"](body|title)['"]\s*\])/g

function run(repositoryRoot) {
  const charterPath = resolve(repositoryRoot, "tools/gate-charter.json")
  const charter = JSON.parse(readFileSync(charterPath, "utf8"))
  if (charter === null || Array.isArray(charter) || typeof charter !== "object") {
    throw new Error("tools/gate-charter.json must be an object keyed by gate id")
  }
  const expected = gateIds(repositoryRoot)
  const guardJobs = workflowJobs(repositoryRoot, ".github/workflows/guards.yml")
  const declared = Object.keys(charter).sort()
  const problems = []
  for (const id of expected) {
    if (!(id in charter)) problems.push(`${id}: missing registry entry`)
  }
  for (const id of declared) {
    if (!expected.includes(id)) problems.push(`${id}: registry entry names no gate`)
    else {
      problems.push(...validateEntry(id, charter[id]))
      const guardJob = id.match(/^\.github\/workflows\/guards\.yml#(.+)$/)?.[1]
      if (guardJob && charter[id]?.scope === "changed-files" &&
          !guardJobUsesChangedFiles(guardJobs[guardJob])) {
        problems.push(`${id}: changed-files job has a blocking run that is not scoped to the pull request diff`)
      }
      if (guardJob && charter[id]?.scope === "whole-tree-advisory" &&
          !guardJobIsAdvisory(guardJobs[guardJob])) {
        problems.push(`${id}: whole-tree-advisory job must make its reporting step continue-on-error`)
      }
      if (guardJob && charter[id]?.scope === "whole-tree-blocking" &&
          !runSteps(guardJobs[guardJob]).some((step) => step["continue-on-error"] !== true &&
            step.run.includes(`node tools/check-${guardJob === "dashes" ? "dashes.mjs --check-baseline" : "sonar-paths.mjs"}`))) {
        problems.push(`${id}: whole-tree-blocking job must run its path inventory as a blocking step`)
      }
    }
  }
  for (const [jobId, job] of Object.entries(guardJobs)) {
    const fields = new Set(stringValues(job).flatMap((value) =>
      [...value.matchAll(FROZEN_PULL_REQUEST_FIELD)].map((match) => match[1] ?? match[2])))
    for (const field of fields) {
      problems.push(`.github/workflows/guards.yml#${jobId}: frozen pull request ${field} must be read from the API at run time`)
    }
  }
  const changedFileRules = declared.filter((id) => id.startsWith("eslint-rules/") && charter[id]?.scope === "changed-files")
  if (!lintCallerUsesChangedFiles(repositoryRoot)) {
    problems.push(".github/workflows/test.yml#lint: Lint must prepare changed paths before consuming them")
    changedFileRules.forEach((id) => problems.push(`${id}: pull request lint must pass only changed workspace files to ESLint`))
  }
  if (!designGuardUsesChangedFiles(repositoryRoot)) {
    problems.push(".github/workflows/test.yml#design-guard: Design Token Guard must prepare changed paths before consuming them")
  }
  if (!gateCharterRunsForPath(guardJobs, ".github/workflows/test.yml")) {
    problems.push(".github/workflows/guards.yml#gate-charter: Gate Charter must run when .github/workflows/test.yml changes")
  }
  if (["package.json", "package-lock.json"].some((path) => !gateCharterRunsForPath(guardJobs, path))) {
    problems.push(".github/workflows/guards.yml#gate-charter: Gate Charter must run when package.json or package-lock.json changes")
  }
  if (problems.length > 0) {
    console.error("Gate charter violations:")
    problems.forEach((problem) => console.error(`  ${problem}`))
    return 1
  }
  console.log(`Gate charter passed. ${expected.length} gates registered.`)
  return 0
}

let repositoryRoot
try {
  repositoryRoot = parseArguments(process.argv.slice(2))
  process.exitCode = run(repositoryRoot)
} catch (error) {
  console.error(`check-gate-charter: ${error.message}\n`)
  console.error(USAGE)
  process.exitCode = 2
}
