import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, join, posix, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import yaml from "js-yaml"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const workflowsDirectory = join(root, ".github/workflows")
const workflows = readdirSync(workflowsDirectory)
  .filter((file) => /\.ya?ml$/.test(file))
  .map((file) => [file, yaml.load(readFileSync(join(workflowsDirectory, file), "utf8"))])

// A stalled cache segment would hold the job until its time limit. The bound lets npm ci continue with a cold cache.
// Source of the variable: actions/cache at 55cc8345863c7cc4c66a329aec7e433d2d1c52a9 (v6), dist/restore-only/index.js.
test("every npm cache restore has a one-minute segment bound", () => {
  const action = yaml.load(readFileSync(join(root, ".github/actions/restore-npm-cache/action.yml"), "utf8"))
  const inline = workflows.flatMap(([file, workflow]) => Object.entries(workflow.jobs).flatMap(([jobId, job]) =>
    (job.steps ?? []).filter((step) => step.uses?.startsWith("actions/cache/restore@") && String(step.with.key).startsWith("npm-"))
      .map((step) => [`${file}: ${jobId}`, step])))
  const restores = [["restore-npm-cache", action.runs.steps.find((step) => step.id === "restore")], ...inline]
  assert.equal(restores.length, 5, "the shared action and the four release jobs that restore inline")
  for (const [where, step] of restores) {
    assert.equal(String(step.env?.SEGMENT_DOWNLOAD_TIMEOUT_MINS), "1", `${where} must bound a stalled segment`)
    assert.equal(step["continue-on-error"], undefined, `${where} must surface restore failures`)
    assert.equal(step["timeout-minutes"], undefined, `${where} must let cache timeout continue to npm ci`)
    assert.equal(step.with["fail-on-cache-miss"], undefined, `${where} must let a miss continue to npm ci`)
  }
})

test("unit test steps retain their budget with setup and report time outside it", () => {
  const workflow = workflows.find(([file]) => file === "test.yml")[1]
  for (const [job, stepName, stepMinutes, jobMinutes] of [
    ["web-tests", "Run web shard with coverage", 12, 15],
    ["mobile-tests", "Run mobile shard with coverage", 10, 13],
    ["workspace-tests", "Run workspaces with coverage thresholds", 6, 9],
  ]) {
    const step = workflow.jobs[job].steps.find((candidate) => candidate.name === stepName)
    assert.equal(step["timeout-minutes"], stepMinutes, `${job} owns a separate test budget`)
    assert.equal(workflow.jobs[job]["timeout-minutes"], jobMinutes, `${job} reserves three minutes for setup and reports`)
  }
})

// On a runner, npx and npm exec install a package that the tree lacks without a prompt (npm 11.19.0,
// node_modules/libnpmexec/lib/index.js: noTTY() || ciInfo.isCI), and --yes does the same anywhere. That install resolves
// the version ranges of the package at run time, so a new upstream publish can fail an unrelated pull request. So each
// npx or npm exec command runs after an npm ci of its own tree in the same job, and names a binary and packages that the
// lockfile of that tree installs, with no version and no --yes.
const binariesOfLockfile = new Map()
function lockedBinaries(lockfile) {
  if (!binariesOfLockfile.has(lockfile)) {
    const packages = JSON.parse(readFileSync(lockfile, "utf8")).packages
    binariesOfLockfile.set(lockfile, {
      binaries: new Set(Object.values(packages).flatMap((entry) => Object.keys(entry.bin ?? {}))),
      names: new Set(Object.keys(packages).filter((path) => path.startsWith("node_modules/")).map((path) => path.slice("node_modules/".length))),
    })
  }
  return binariesOfLockfile.get(lockfile)
}
const rootLockfile = join(root, "package-lock.json")
const actionsDirectory = join(root, ".github/actions")
const localActions = new Map(readdirSync(actionsDirectory).map((action) =>
  [`./.github/actions/${action}`, yaml.load(readFileSync(join(actionsDirectory, action, "action.yml"), "utf8"))]))

// A step of a local composite action runs in the job that uses it, so its commands join the steps of that job in order.
function expandedSteps(steps, where) {
  return (steps ?? []).flatMap((step, index) => {
    const name = `${where}: ${step.name ?? step.id ?? step.uses ?? index}`
    const action = localActions.get(step.uses)
    return action ? expandedSteps(action.runs?.steps, `${name} (${step.uses})`) : [[name, step]]
  })
}

// The options that take the next word as their value: the opts set of npm 11.19.0 bin/npx-cli.js, and the workspace and
// prefix definitions of node_modules/@npmcli/config/lib/definitions/definitions.js (short w and C).
const VALUE_OPTIONS = new Set(["--package", "-p", "--cache", "--userconfig", "--call", "-c", "--shell", "--npm", "--node-arg", "-n",
  "--workspace", "-w", "--prefix", "-C"])
// The binary of a command is the first word that is neither an npm option nor its value; a "--" ends the npm options.
// The words before it hold the npm options: --yes, each -p or --package spec, and the --prefix of the tree.
function execBinary(command) {
  const words = command.trim().split(/\s+/).map((word) => word.replace(/^["']|["']$/g, ""))
  const packages = []
  let prefix = ""
  let yes = false
  let index = 0
  while (index < words.length && words[index].startsWith("-") && words[index] !== "--") {
    const [option, inlineValue] = words[index].split(/=(.*)/s)
    const takesValue = VALUE_OPTIONS.has(option)
    const value = inlineValue ?? (takesValue ? words[index + 1] : undefined)
    if (option === "-p" || option === "--package") packages.push(value)
    if (option === "-C" || option === "--prefix") prefix = value
    if (option === "-y" || option === "--yes") yes = true
    index += takesValue && inlineValue === undefined ? 2 : 1
  }
  const binary = words[index] === "--" ? words[index + 1] : words[index]
  return { binary, yes, packages, prefix }
}

const COMMAND = /(?:^|[\s;&|(`$])(npx|npm\s+(?:exec|x|ci))(?=\s|$)([^\n;&|)`]*)/g
const execCommands = (text) => [...text.matchAll(COMMAND)].filter((match) => match[1] !== "npm ci").map((match) => match[2].trimStart())
const directory = (...parts) => posix.normalize(posix.join(...parts.filter(Boolean))).replace(/^\.$|\/$/g, "")
const contains = (tree, path) => tree === "" || path === tree || path.startsWith(`${tree}/`)
const BARE_PACKAGE = /^(?:@[^/@\s]+\/)?[^/@\s]+$/

// Lists each npx or npm exec command of a workflow that can resolve a package at run time, with the reason.
function execFindings(file, workflow) {
  const findings = []
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    const jobDirectory = job.defaults?.run?.["working-directory"] ?? workflow.defaults?.run?.["working-directory"]
    // The root of a tree: the repository, each checkout of this repository at a path, and each npm ci prefix.
    const lockfiles = new Map([["", rootLockfile]])
    const installed = new Set()
    for (const [where, step] of expandedSteps(job.steps, `${file}: ${jobId}`)) {
      if (step.uses?.startsWith("actions/checkout@") && step.with?.path && !step.with.repository) lockfiles.set(directory(step.with.path), rootLockfile)
      const stepDirectory = directory(step["working-directory"] ?? jobDirectory)
      const scripts = [step.run, step.with?.script].filter((text) => typeof text === "string")
        .map((text) => text.split("\n").filter((line) => !line.trimStart().startsWith("#")).join("\n"))
      for (const match of scripts.flatMap((text) => [...text.matchAll(COMMAND)])) {
        const { binary, yes, packages, prefix } = execBinary(match[2])
        const commandDirectory = directory(stepDirectory, prefix)
        if (match[1] === "npm ci") {
          if (!lockfiles.has(commandDirectory)) lockfiles.set(commandDirectory, join(root, commandDirectory, "package-lock.json"))
          installed.add(commandDirectory)
          continue
        }
        const command = `${where}: ${match[1]} ${match[2].trim()}`
        const tree = [...lockfiles.keys()].filter((candidate) => contains(candidate, commandDirectory)).sort((a, b) => b.length - a.length)[0]
        if (yes) findings.push(`${command}: --yes installs a package that the lockfile does not pin`)
        if (!installed.has(tree)) {
          findings.push(`${command}: no earlier step of the job runs npm ci in ${tree || "the repository root"}, so npx installs the binary from the registry`)
          continue
        }
        if (!existsSync(lockfiles.get(tree))) {
          findings.push(`${command}: the repository holds no lockfile of the tree ${tree}`)
          continue
        }
        const locked = lockedBinaries(lockfiles.get(tree))
        if (!locked.binaries.has(binary)) findings.push(`${command}: runs ${binary}, which no lockfile entry of the tree installs`)
        for (const spec of packages) {
          if (!BARE_PACKAGE.test(spec ?? "") || !locked.names.has(spec)) findings.push(`${command}: the package ${spec} is not a bare name that the lockfile of the tree installs`)
        }
      }
    }
  }
  return findings
}

test("each npx and npm exec command runs after an npm ci of its tree, a locked binary and locked packages, with no version and no --yes", () => {
  const commands = workflows.flatMap(([, workflow]) => Object.values(workflow.jobs ?? {}).flatMap((job) =>
    expandedSteps(job.steps, "").flatMap(([, step]) => [step.run, step.with?.script].filter((text) => typeof text === "string").flatMap(execCommands))))
  assert.ok(commands.length >= 20, "the scan reads the npx commands of the workflows")
  assert.deepEqual(workflows.flatMap(([file, workflow]) => execFindings(file, workflow)), [])
})

test("the npx rule reads the binary of each command form and rejects a resolve", () => {
  assert.deepEqual(execBinary('--yes "turbo@$TURBO_VERSION" run test --dry=json'), { binary: "turbo@$TURBO_VERSION", yes: true, packages: [], prefix: "" })
  assert.deepEqual(execBinary("-y react-doctor@0.7.6 . --blocking error --yes"), { binary: "react-doctor@0.7.6", yes: true, packages: [], prefix: "" })
  assert.deepEqual(execBinary('--workspace @orbit/web -- eslint -- "${web[@]}"'), { binary: "eslint", yes: false, packages: [], prefix: "" })
  assert.deepEqual(execBinary("playwright install chromium"), { binary: "playwright", yes: false, packages: [], prefix: "" })
  assert.deepEqual(execBinary("turbo run test --concurrency=1 -- --coverage"), { binary: "turbo", yes: false, packages: [], prefix: "" })
  assert.deepEqual(execBinary("--package=other -y tool"), { binary: "tool", yes: true, packages: ["other"], prefix: "" })
  assert.deepEqual(execBinary("-p turbo@2.11.10 --prefix=tools/x turbo run"), { binary: "turbo", yes: false, packages: ["turbo@2.11.10"], prefix: "tools/x" })
  assert.equal(lockedBinaries(rootLockfile).binaries.has("turbo@2.11.10"), false, "a version makes the word another binary name")
  assert.deepEqual(execCommands("CI=1 EXPO_OFFLINE=1 npx expo install --check\necho \"$(npx playwright --version | cut -d' ' -f2)\""),
    ["expo install --check", "playwright --version "])
})

test("the npx rule fails a job that runs npx before the npm ci of its tree, or with a versioned or unlocked package", () => {
  const plan = 'turbo run test --dry=json > "$RUNNER_TEMP/turbo-test.json"'
  const findingsOf = (steps, extra = {}) => execFindings("probe.yml", { jobs: { plan: { "runs-on": "ubuntu-latest", ...extra, steps } } })
  // The Plan job of test.yml installs no workspace tree, so npx there installs the newest turbo on each run.
  const realPlan = structuredClone(workflows.find(([file]) => file === "test.yml")[1].jobs.plan)
  const planStep = realPlan.steps.find((step) => /turbo-test\.json/.test(step.run ?? ""))
  planStep.run = `npx ${plan}`
  assert.match(execFindings("test.yml", { jobs: { plan: realPlan } }).join("\n"), /no earlier step of the job runs npm ci in the repository root/)
  planStep.run = `npx -p turbo@2.11.10 ${plan}`
  assert.match(execFindings("test.yml", { jobs: { plan: realPlan } }).join("\n"), /no earlier step of the job runs npm ci/)
  assert.match(findingsOf([{ run: "npm ci" }, { run: `npx -p turbo@2.11.10 ${plan}` }]).join("\n"), /the package turbo@2\.11\.10 is not a bare name/)
  assert.match(findingsOf([{ run: "npm ci" }, { run: `npx --package=turbo@^2 ${plan}` }]).join("\n"), /the package turbo@\^2 is not a bare name/)
  assert.match(findingsOf([{ run: "npm ci" }, { run: `npx -p left-pad-unlocked ${plan}` }]).join("\n"), /left-pad-unlocked is not a bare name that the lockfile/)
  assert.deepEqual(findingsOf([{ run: "npm ci" }, { run: `npx -p turbo ${plan}` }]), [])
  // The order counts: an npm ci after the npx, or in the same script after it, comes too late.
  assert.match(findingsOf([{ run: `npx ${plan}` }, { run: "npm ci" }]).join("\n"), /no earlier step/)
  assert.match(findingsOf([{ run: `npx ${plan}\nnpm ci` }]).join("\n"), /no earlier step/)
  assert.deepEqual(findingsOf([{ run: `npm ci --prefer-offline\nnpx ${plan}` }]), [])
  // A comment that names npm ci installs nothing.
  assert.match(findingsOf([{ run: `# npm ci runs later\nnpx ${plan}` }]).join("\n"), /no earlier step/)
  // A workspace directory is part of the root tree, and a local action that runs npm ci installs it for the job.
  assert.deepEqual(findingsOf([{ uses: "./.github/actions/desktop-acceptance-setup" }, { "working-directory": "apps/mobile", run: "npx expo prebuild" }]), [])
  // A second checkout of this repository is its own tree: the npm ci of the root does not install it.
  const checkout = { uses: "actions/checkout@v6", with: { path: "staging-smoke-source" } }
  assert.match(findingsOf([checkout, { run: "npm ci" }, { "working-directory": "staging-smoke-source", run: "npx playwright install chromium" }]).join("\n"),
    /no earlier step of the job runs npm ci in staging-smoke-source/)
  assert.deepEqual(findingsOf([checkout, { "working-directory": "staging-smoke-source", run: "npm ci" },
    { "working-directory": "staging-smoke-source", run: "npx playwright install chromium" }]), [])
  // A tree whose lockfile the repository does not hold cannot prove its binaries.
  assert.match(findingsOf([{ run: 'npm ci --prefix "$RUNNER_TEMP/turbo"' }, { run: `npx --prefix "$RUNNER_TEMP/turbo" ${plan}` }]).join("\n"),
    /the repository holds no lockfile of the tree \$RUNNER_TEMP\/turbo/)
  assert.match(findingsOf([{ run: "npm ci" }, { run: "npx not-a-locked-binary" }]).join("\n"), /runs not-a-locked-binary, which no lockfile entry/)
  assert.match(findingsOf([{ run: "npm ci" }, { run: `npx --yes ${plan}` }]).join("\n"), /--yes installs a package/)
})
