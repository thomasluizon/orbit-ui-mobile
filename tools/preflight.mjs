#!/usr/bin/env node

import { spawn } from "node:child_process"
import { accessSync, constants, statSync } from "node:fs"
import { delimiter, extname, join } from "node:path"

import { readOrchestratorConfig, resolveWorkerInvocation } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: preflight.mjs --repo ui|api|landing [options]

  --repo <key>          target repository key from .claude/orchestrator.json (required)
  --base-branch <ref>   branch the target repository must be on (default: main)
  --require <cli>       require one ticket-specific CLI; repeat for more than one
  --json                emit one machine-readable JSON report instead of the table
  --help, -h            print this usage and exit 0

Checks the selected worker's unattended shell policy, every CLI required by the
target repository, GitHub CLI authentication, Orca reachability, Linear tier
label authority, the target branch, and a clean target working tree. It reports
only and never repairs.

Binary overrides for hermetic callers: GIT_BIN, GH_BIN, ORCA_BIN, NODE_BIN,
NPM_BIN, and DOTNET_BIN.

stdout carries the PASS/FAIL table or JSON report. Usage and configuration
errors go to stderr.

exit codes: 0 every check passed, 1 one or more environment checks failed,
            2 usage or configuration error`

const failUsage = (message) => {
  console.error(`${USAGE}\n\n${message}`)
  process.exit(2)
}

const argv = process.argv.slice(2)
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const values = new Map()
const extraClis = []
let asJson = false
for (let index = 0; index < argv.length; index += 1) {
  const argument = argv[index]
  if (argument === "--json") {
    if (asJson) failUsage("--json may only be given once")
    asJson = true
    continue
  }
  if (argument !== "--repo" && argument !== "--base-branch" && argument !== "--require") {
    failUsage(`unknown argument: ${argument}`)
  }
  const value = argv[index + 1]
  if (!value || value.startsWith("--")) failUsage(`${argument} requires a value`)
  if (argument === "--require") {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/.test(value)) {
      failUsage("--require must name a CLI executable without a path")
    }
    extraClis.push(value)
    index += 1
    continue
  }
  if (values.has(argument)) failUsage(`${argument} may only be given once`)
  values.set(argument, value)
  index += 1
}

const repoKey = values.get("--repo")
const baseBranch = values.get("--base-branch") ?? "main"
if (!repoKey) failUsage("--repo is required")

let config
try {
  config = readOrchestratorConfig()
} catch (error) {
  console.error(error.message)
  process.exit(2)
}

const repoPath = config.repos?.[repoKey]
if (typeof repoPath !== "string" || repoPath.trim().length === 0) {
  const known = Object.keys(config.repos ?? {}).join(", ") || "none"
  failUsage(`--repo must name a configured repository (known: ${known})`)
}

const engineName = config.worker
const engine = config.workers?.[engineName]
if (typeof engineName !== "string" || typeof engine?.command !== "string" || engine.command.trim().length === 0) {
  console.error(`.claude/orchestrator.json names worker "${engineName ?? "<missing>"}" but carries no command for it`)
  process.exit(2)
}

let engineArgs
try {
  engineArgs = resolveWorkerInvocation(engineName, engine, []).args
} catch (error) {
  console.error(error.message)
  process.exit(2)
}

const firstCommandToken = (command) => {
  const match = command.trim().match(/^(?:"([^"]+)"|'([^']+)'|(\S+))/)
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? ""
}

const workerExecutable = firstCommandToken(engine.command)
const workerInvocation = [engine.command, ...engineArgs].join(" ")
const workerPolicies = {
  claude: {
    pattern: /(?:^|\s)--permission-mode(?:=|\s+)bypassPermissions(?:\s|$)/,
    remedy: 'set workers.claude to the known-good "--permission-mode bypassPermissions" policy',
  },
  codex: {
    pattern: /(?:^|\s)--dangerously-bypass-approvals-and-sandbox(?:\s|$)/,
    remedy: 'set workers.codex to the known-good "--dangerously-bypass-approvals-and-sandbox" policy',
  },
}

const binaryOverrides = {
  git: process.env.GIT_BIN || "git",
  gh: process.env.GH_BIN || "gh",
  orca:
    process.env.ORCA_BIN ||
    (process.platform === "win32"
      ? "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"
      : "orca"),
  node: process.env.NODE_BIN || "node",
  npm: process.env.NPM_BIN || "npm",
  dotnet: process.env.DOTNET_BIN || "dotnet",
}

const repoClis = {
  ui: ["npm"],
  api: ["dotnet"],
  landing: ["npm"],
}

const executableCandidates = (command) => {
  const extensions =
    process.platform === "win32"
      ? ["", ...(process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").map((extension) => extension.toLowerCase())]
      : [""]
  const hasPath = command.includes("/") || command.includes("\\")
  const roots = hasPath ? [""] : (process.env.PATH || "").split(delimiter)
  const suffixes = extname(command) ? [""] : extensions
  return roots.flatMap((root) => suffixes.map((suffix) => (root ? join(root, `${command}${suffix}`) : `${command}${suffix}`)))
}

const executableExists = (command) =>
  executableCandidates(command).some((candidate) => {
    try {
      accessSync(candidate, constants.X_OK)
      return statSync(candidate).isFile()
    } catch {
      return false
    }
  })

const COMMAND_TIMEOUT_MS = 2000
const run = (command, args) =>
  new Promise((resolveRun) => {
    let stdout = ""
    let stderr = ""
    let settled = false
    let timedOut = false
    let child
    try {
      child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
    } catch (error) {
      resolveRun({ status: null, stdout, stderr, error, timedOut })
      return
    }
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.stdout.destroy()
      child.stderr.destroy()
      child.unref()
      resolveRun(result)
    }
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", (error) => finish({ status: null, stdout, stderr, error, timedOut }))
    child.on("close", (status) => finish({ status, stdout, stderr, error: null, timedOut }))
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
      finish({ status: null, stdout, stderr, error: null, timedOut })
    }, COMMAND_TIMEOUT_MS)
  })

const formatLabels = (labels) => (labels.length > 0 ? labels.join(", ") : "(none)")
const tierSelectors = [
  ...new Set(
    Object.values(config.workers ?? {}).flatMap((worker) =>
      Object.keys(worker?.models ?? {})
        .filter((tier) => tier !== "default")
        .map((tier) => `tier:${tier}`),
    ),
  ),
].sort()

const tierAuthorityVerdict = (lookup) => {
  const lookedFor = formatLabels(tierSelectors)
  const unavailable = (reason) => ({
    passed: false,
    detail: `looked for: ${lookedFor}; team labels: unavailable; missing: ${lookedFor}; ${reason}`,
  })
  if (tierSelectors.length === 0) return unavailable("no non-default worker tiers are declared")
  if (lookup.status !== 0) {
    const reason = lookup.timedOut
      ? "Linear tier-label lookup timed out"
      : String(lookup.stderr || lookup.stdout || lookup.error?.message || "unknown error").trim()
    return unavailable(`Linear tier-label lookup failed: ${reason}`)
  }

  let payload
  try {
    payload = JSON.parse(lookup.stdout)
  } catch (error) {
    return unavailable(`Linear tier-label lookup returned unparseable JSON: ${error.message}`)
  }
  if (payload?.ok === false || !Array.isArray(payload?.result?.labels)) {
    return unavailable(`Linear tier-label lookup failed: ${payload?.error?.message ?? "no labels array"}`)
  }

  const names = payload.result.labels.map((label) => (typeof label === "string" ? label : label?.name))
  if (names.some((name) => typeof name !== "string" || name.trim().length === 0)) {
    return unavailable("Linear tier-label lookup returned a label without a non-empty name")
  }
  const actual = [...new Set(names)].sort()
  const actualSet = new Set(actual)
  const missing = tierSelectors.filter((label) => !actualSet.has(label))
  const inventory = `looked for: ${lookedFor}; team labels: ${formatLabels(actual)}; missing: ${formatLabels(missing)}`
  if (actual.length === 0) return { passed: false, detail: `${inventory}; Linear returned an empty label set` }
  if (missing.length > 0) return { passed: false, detail: inventory }
  return { passed: true, detail: inventory }
}

const checks = []
const addCheck = (id, name, passed, detail, remedy) => {
  checks.push({ id, name, status: passed ? "PASS" : "FAIL", detail: passed ? detail : remedy })
}

const policy = workerPolicies[engineName]
addCheck(
  "worker-shell-policy",
  "Worker shell policy",
  Boolean(policy?.pattern.test(workerInvocation)),
  `${engineName} invocation permits unattended shell execution`,
  policy?.remedy ?? `add a known-good unattended shell policy for worker engine "${engineName}"`,
)

let repoPresent = false
try {
  repoPresent = statSync(repoPath).isDirectory()
} catch {
  repoPresent = false
}
addCheck(
  "target-repo",
  "Target repository",
  repoPresent,
  repoPath,
  `restore the configured ${repoKey} repository at ${repoPath}`,
)

const requiredClis = [
  ["git", binaryOverrides.git],
  ["gh", binaryOverrides.gh],
  ["orca", binaryOverrides.orca],
  [`worker:${engineName}`, workerExecutable],
  ["node", binaryOverrides.node],
  ...(repoClis[repoKey] ?? []).map((name) => [name, binaryOverrides[name]]),
  ...extraClis.map((name) => [name, name]),
]
const seenClis = new Set()
const availability = new Map()
for (const [name, command] of requiredClis) {
  if (seenClis.has(name)) continue
  seenClis.add(name)
  const present = executableExists(command)
  availability.set(name, present)
  addCheck(
    `cli-${name.replace(":", "-")}`,
    `CLI ${name}`,
    present,
    command,
    `install ${name.startsWith("worker:") ? engineName : name} or correct its configured executable`,
  )
}

const ghAuthPromise = availability.get("gh")
  ? run(binaryOverrides.gh, ["auth", "status"])
  : Promise.resolve({ status: null, stdout: "", stderr: "", error: null, timedOut: false })
const orcaStatusPromise = availability.get("orca")
  ? run(binaryOverrides.orca, ["status", "--json"])
  : Promise.resolve({ status: null, stdout: "", stderr: "", error: null, timedOut: false })
const tierLabelsPromise =
  availability.get("orca") && tierSelectors.length > 0
    ? run(binaryOverrides.orca, ["linear", "team", "labels", "--team", config.linear?.team ?? "", "--json"])
    : Promise.resolve({ status: null, stdout: "", stderr: "", error: null, timedOut: false })
const branchPromise =
  availability.get("git") && repoPresent
    ? run(binaryOverrides.git, ["-C", repoPath, "branch", "--show-current"])
    : Promise.resolve({ status: null, stdout: "", stderr: "", error: null, timedOut: false })
const treePromise =
  availability.get("git") && repoPresent
    ? run(binaryOverrides.git, ["-C", repoPath, "status", "--porcelain"])
    : Promise.resolve({ status: null, stdout: "", stderr: "", error: null, timedOut: false })

const [ghAuth, orcaStatus, tierLabels, branch, tree] = await Promise.all([
  ghAuthPromise,
  orcaStatusPromise,
  tierLabelsPromise,
  branchPromise,
  treePromise,
])

addCheck(
  "github-auth",
  "GitHub authentication",
  ghAuth.status === 0,
  "gh auth status succeeded",
  ghAuth.timedOut ? "run gh auth status and fix the timeout" : "run gh auth login and verify with gh auth status",
)

let orcaReady = orcaStatus.status === 0
try {
  const payload = JSON.parse(orcaStatus.stdout)
  orcaReady =
    orcaStatus.status === 0 &&
    payload.ok !== false &&
    payload.result?.runtime?.reachable !== false
} catch {
  orcaReady = orcaStatus.status === 0
}
addCheck(
  "orca-reachable",
  "Orca reachability",
  orcaReady,
  "orca status reached the local runtime",
  "start or restart Orca, then verify with orca status",
)

const tierAuthority = tierAuthorityVerdict(tierLabels)
addCheck(
  "linear-tier-labels",
  "Linear tier labels",
  tierAuthority.passed,
  tierAuthority.detail,
  tierAuthority.detail,
)

const currentBranch = branch.stdout.trim()
addCheck(
  "repo-branch",
  "Repository branch",
  branch.status === 0 && currentBranch === baseBranch,
  `${currentBranch} matches ${baseBranch}`,
  branch.status === 0
    ? `switch ${repoKey} from ${currentBranch || "<detached>"} to ${baseBranch}`
    : `restore the ${repoKey} repository and switch it to ${baseBranch}`,
)
addCheck(
  "repo-clean",
  "Repository working tree",
  tree.status === 0 && tree.stdout.trim().length === 0,
  "working tree is clean",
  tree.status === 0
    ? `commit, stash, or remove changes in ${repoPath}`
    : `restore the ${repoKey} repository and verify git status --porcelain`,
)

const ok = checks.every((check) => check.status === "PASS")
if (asJson) {
  console.log(JSON.stringify({ repo: repoKey, repoPath, baseBranch, engine: engineName, ok, checks }, null, 2))
} else {
  const checkWidth = Math.max("CHECK".length, ...checks.map((check) => check.name.length))
  console.log(`STATUS  ${"CHECK".padEnd(checkWidth)}  DETAIL`)
  for (const check of checks) {
    console.log(`${check.status.padEnd(6)}  ${check.name.padEnd(checkWidth)}  ${check.detail}`)
  }
}

process.exit(ok ? 0 : 1)
