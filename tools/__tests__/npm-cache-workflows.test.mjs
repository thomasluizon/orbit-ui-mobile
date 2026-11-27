import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
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
    ["web-tests", "Run web shard with coverage", 16, 20],
    ["mobile-tests", "Run mobile shard with coverage", 10, 13],
    ["workspace-tests", "Run workspaces with coverage thresholds", 6, 9],
  ]) {
    const step = workflow.jobs[job].steps.find((candidate) => candidate.name === stepName)
    assert.equal(step["timeout-minutes"], stepMinutes, `${job} owns a separate test budget`)
    assert.equal(workflow.jobs[job]["timeout-minutes"], jobMinutes, `${job} reserves three minutes for setup and reports`)
  }
})

const actionsDirectory = join(root, ".github/actions")
const localActions = new Map(readdirSync(actionsDirectory).map((action) =>
  [`./.github/actions/${action}`, yaml.load(readFileSync(join(actionsDirectory, action, "action.yml"), "utf8"))]))
const documents = [
  ...workflows.map(([file, workflow]) => [`.github/workflows/${file}`, workflow]),
  ...[...localActions].map(([path, action]) => [`${path.slice(2)}/action.yml`, action]),
]

// On a runner, npx, npm exec and npm init install a package that the tree lacks with no prompt (npm 11.19.0,
// node_modules/libnpmexec/lib/index.js: noTTY() || ciInfo.isCI), and pnpm dlx, yarn dlx and bunx download a package by design.
// That install resolves version ranges at run time, so a new upstream publish can fail an unrelated pull request. So no text of a
// workflow or a local action, quoted or not, names one of these runners. A step runs an installed binary by its path, or an npm script.
const RUNNER_WORD = /(?<![\w-])(?:npx|pnpx|bunx|pnpm|yarn|bun|corepack)(?![\w-])/g
// The npm commands that run no package by name. An option before the command word, as in npm --yes exec, also fails.
const NPM_COMMANDS = new Set(["ci", "run", "test", "cache", "config", "ls", "view", "version"])
const NPM_WORD = /(?<![\w.-])npm(?![\w/-])\s*(\S*)/g
// The one reviewed install: the npm version that package.json pins, and npm bundles its own dependencies.
const REVIEWED_NPM_INSTALL = `npm install --global "$(node -p "require('./package.json').packageManager")" --no-audit --no-fund`

const textsOf = (value) => typeof value === "string" ? [value]
  : Array.isArray(value) ? value.flatMap(textsOf)
  : value && typeof value === "object" ? Object.entries(value).flatMap(([key, entry]) => [key, ...textsOf(entry)])
  : []

function runnerFindings(where, document) {
  return textsOf(document).map((text) => text.replaceAll(REVIEWED_NPM_INSTALL, "")).flatMap((text) => [
    ...[...text.matchAll(RUNNER_WORD)].map((match) => `${where}: ${match[0]} can install a package at run time`),
    ...[...text.matchAll(NPM_WORD)].filter((match) => !NPM_COMMANDS.has(match[1]))
      .map((match) => `${where}: npm ${match[1]} is not an npm command that runs no package by name`),
  ])
}

test("no workflow or local action text names a command that installs a package at run time", () => {
  assert.ok(documents.length > workflows.length, "the scan reads the local actions")
  assert.deepEqual(documents.flatMap(([where, document]) => runnerFindings(where, document)), [])
})

test("the runner ban fails each form that installs a package at run time", () => {
  const typeCheck = workflows.find(([file]) => file === "test.yml")[1].jobs["type-check"]
  const findingsOf = (run, place = (job) => job.steps.find((step) => /turbo run type-check/.test(step.run ?? ""))) => {
    const job = structuredClone(typeCheck)
    place(job).run = run
    return runnerFindings("test.yml", { jobs: { "type-check": job } }).join("\n")
  }
  for (const [run, reason] of [
    ["npx -y turbo run type-check", /npx can install/],
    ["npx turbo@2.11.10 run type-check", /npx can install/],
    ["npm exec -- react-doctor@0.7.6 . --blocking none", /npm exec is not/],
    ["npm x react-doctor@0.7.6 -- . --blocking none", /npm x is not/],
    ["npm --yes exec -- react-doctor@0.7.6 .", /npm --yes is not/],
    ["npm exe -- react-doctor@0.7.6 .", /npm exe is not/],
    ["pnpm dlx turbo@2.11.10 run type-check", /pnpm can install/],
    ["yarn dlx turbo@2.11.10 run type-check", /yarn can install/],
    ["bunx turbo@2.11.10 run type-check", /bunx can install/],
    ["pnpx turbo@2.11.10 run type-check", /pnpx can install/],
    ["corepack pnpm@9.0.0 dlx turbo run type-check", /corepack can install/],
    ['bash -c "npx -y react-doctor@0.7.6 ."', /npx can install/],
    ["sh -c 'npm exec -- react-doctor .'", /npm exec is not/],
    ["npm init vite@latest scratch -- --template react", /npm init is not/],
    ["npm install --global react-doctor@^0.7.6 && react-doctor .", /npm install is not/],
    [`${REVIEWED_NPM_INSTALL} && npm install --global react-doctor`, /npm install is not/],
    ["npm ci --omit=dev\nnpx turbo run type-check", /npx can install/],
    ["npm ci --workspace @orbit/shared\nnpx turbo run type-check", /npx can install/],
    ["npm \\\n  exec turbo run type-check", /npm \\ is not/],
    ["/usr/local/bin/npm exec turbo run type-check", /npm exec is not/],
  ]) assert.match(findingsOf(run), reason, run)
  // The Plan step of the same workflow, a value of the step env, and a quoted script of another action are text too.
  assert.match(findingsOf("npx turbo run test --dry=json", (job) => job.steps.find((step) => /^npm ci\b/.test(step.run ?? ""))), /npx can install/)
  assert.match(runnerFindings("probe.yml", { jobs: { probe: { steps: [{ env: { RUNNER: "npx" }, run: "$RUNNER turbo" }] } } }).join("\n"), /npx can install/)
  assert.match(runnerFindings("probe.yml", { jobs: { probe: { steps: [{ uses: "actions/github-script@v8", with: { script: "exec('npx', ['turbo'])" } }] } } }).join("\n"), /npx can install/)
  // The reviewed forms pass: an npm script, a binary by path, the npm cache and config reads, and the pinned npm install.
  for (const run of ["npm run test:smoke --workspace @orbit/web", "./node_modules/.bin/turbo run type-check", 'echo "path=$(npm config get cache)"',
    REVIEWED_NPM_INSTALL, "npm ci --prefer-offline --no-audit --fund=false", 'echo "$npm_config_cache" && ls npm-cache']) {
    assert.equal(findingsOf(run), "", run)
  }
})

// A line that runs an install from the npm registry: a run line of a workflow or a local action, or a RUN line of the Dockerfile.
const INSTALL_LINE = /^(?!#).*(?<![\w.-])npm (?:ci|install)(?![\w-])/

function installLines() {
  const fromSteps = documents.flatMap(([where, document]) => Object.values(document.jobs ?? { action: document.runs })
    .flatMap((job) => job.steps ?? [])
    .flatMap((step) => String(step.run ?? "").split("\n").map((line) => [where, line.trim()])))
  const fromDockerfile = readFileSync(join(root, "Dockerfile"), "utf8").split("\n")
    .filter((line) => line.startsWith("RUN ")).map((line) => ["Dockerfile", line.slice("RUN ".length)])
  return [...fromSteps, ...fromDockerfile].filter(([, line]) => INSTALL_LINE.test(line))
}

// Runs one install line as a step does, against a stand-in npm whose first calls fail with the error of a measured failed run.
function runInstall(line, failedCalls) {
  const directory = mkdtempSync(join(tmpdir(), "npm-install-"))
  try {
    const calls = join(directory, "calls.txt")
    writeFileSync(join(directory, "npm"), `#!/usr/bin/env bash
echo "$*" >> "${calls}"
if [ "$(wc -l < "${calls}")" -le ${failedCalls} ]; then echo "npm error code ERR_SSL_CIPHER_OPERATION_FAILED" >&2; exit 1; fi
`)
    chmodSync(join(directory, "npm"), 0o755)
    const result = spawnSync("bash", ["-e", "-c", line], {
      cwd: root,
      encoding: "utf8",
      env: { PATH: `${directory}:${process.env.PATH}`, RUNNER_TEMP: directory },
    })
    return { status: result.status, calls: existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : [] }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

// npm 11.19.0 retries only the socket and timeout codes of RETRY_ERRORS in node_modules/make-fetch-happen/lib/remote.js, so one
// TLS fault in a download ends the install with ERR_SSL_CIPHER_OPERATION_FAILED.
test("every install from the npm registry passes after one failed attempt and fails after two", () => {
  const lines = installLines()
  assert.ok(lines.length >= 30, "the scan reads the installs of the workflows, the local actions and the Dockerfile")
  for (const [where, line] of lines) {
    const once = runInstall(line, 1)
    assert.equal(once.status, 0, `${where}: one failed attempt fails the step: ${line}`)
    assert.equal(once.calls.length, 2, `${where}: ${line}`)
    assert.equal(once.calls[1], once.calls[0], `${where}: the second attempt runs the same install`)
    const always = runInstall(line, 2)
    assert.notEqual(always.status, 0, `${where}: a fault that stays must fail the step: ${line}`)
    assert.equal(always.calls.length, 2, `${where}: ${line}`)
  }
})

// A step of a local composite action runs in the job that uses it, at the place of its call.
function expandedSteps(steps, where) {
  return (steps ?? []).flatMap((step, index) => {
    const name = `${where}: ${step.name ?? step.id ?? step.uses ?? index}`
    const action = localActions.get(step.uses)
    return action ? expandedSteps(action.runs?.steps, `${name} (${step.uses})`) : [[name, step]]
  })
}

// npm links the binaries of the package at <directory>/node_modules/<name> into <directory>/node_modules/.bin.
const binariesOfLockfile = new Map()
function lockedBinaryPaths(tree) {
  if (!binariesOfLockfile.has(tree)) {
    const packages = JSON.parse(readFileSync(join(root, tree, "package-lock.json"), "utf8")).packages
    binariesOfLockfile.set(tree, new Set(Object.entries(packages).flatMap(([path, entry]) => Object.keys(entry.bin ?? {})
      .map((name) => path.replace(/node_modules\/(?:@[^/]+\/)?[^/]+$/, `node_modules/.bin/${name}`)))))
  }
  return binariesOfLockfile.get(tree)
}
const BINARY_PATH = /(?<![^\s"'(=`])([^\s"'(=`]*)node_modules\/\.bin\/([^\s"'/;)&|`]+)/g
const directory = (...parts) => posix.normalize(posix.join(...parts.filter(Boolean))).replace(/^\.$|\/$/g, "")
const insideOf = (tree, path) => tree === "" || path === tree || path.startsWith(`${tree}/`)

// Lists each binary path of a run step that no lockfile of its tree links. A release workflow runs rarely, so a wrong path fails
// here, not in a release. The tree of a path is its nearest directory that holds a package-lock.json, and a checkout of this
// repository at a path is a copy of the root. A tree in the runner temp directory is written at run time, so it has no lockfile here.
function binaryPathFindings(file, workflow) {
  const findings = []
  const binaries = []
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    const jobDirectory = job.defaults?.run?.["working-directory"] ?? workflow.defaults?.run?.["working-directory"]
    const checkouts = []
    for (const [where, step] of expandedSteps(job.steps, `${file}: ${jobId}`)) {
      if (step.uses?.startsWith("actions/checkout@") && step.with?.path && !step.with.repository) checkouts.push(directory(step.with.path))
      if (typeof step.run !== "string") continue
      for (const match of step.run.matchAll(BINARY_PATH)) {
        const [path, prefix, name] = match
        if (/^(?:\$RUNNER_TEMP|\$\{\{ runner\.temp \}\})\//.test(prefix)) continue
        binaries.push(path)
        const line = step.run.slice(step.run.lastIndexOf("\n", match.index) + 1, match.index)
        const changedDirectory = /\bcd\s+(\S+)\s*&&\s*$/.exec(line)?.[1]
        let base = directory(step["working-directory"] ?? jobDirectory, changedDirectory, prefix)
        const checkout = checkouts.find((candidate) => insideOf(candidate, base))
        if (checkout) base = posix.relative(checkout, base)
        if (prefix.includes("$") || base.startsWith("..")) {
          findings.push(`${where}: ${path} is outside the repository tree`)
          continue
        }
        const tree = [base, ...base.split("/").map((_, index, parts) => parts.slice(0, parts.length - index - 1).join("/"))]
          .find((candidate) => existsSync(join(root, candidate, "package-lock.json")))
        const linked = posix.join(posix.relative(tree, base), "node_modules/.bin", name)
        if (!lockedBinaryPaths(tree).has(linked)) findings.push(`${where}: ${path} is not a binary that ${posix.join(tree, "package-lock.json")} links`)
      }
    }
  }
  return { findings, binaries }
}

test("each binary path of a workflow or local action is a binary that the lockfile of its tree links", () => {
  const results = workflows.map(([file, workflow]) => binaryPathFindings(file, workflow))
  assert.ok(results.flatMap((result) => result.binaries).length >= 25, "the scan reads the binary paths of the workflows")
  assert.deepEqual(results.flatMap((result) => result.findings), [])
})

test("the binary path rule resolves the working directory, a cd, a checkout and a nested binary", () => {
  const findingsOf = (steps, extra = {}) => binaryPathFindings("probe.yml", { jobs: { probe: { ...extra, steps } } }).findings
  assert.deepEqual(findingsOf([{ "working-directory": "apps/mobile", run: "../../node_modules/.bin/expo prebuild" }]), [])
  assert.match(findingsOf([{ "working-directory": "apps/mobile", run: "./node_modules/.bin/expo prebuild" }]).join("\n"),
    /apps\/mobile\/node_modules\/\.bin\/expo|is not a binary that package-lock\.json links/)
  assert.match(findingsOf([{ run: "./node_modules/.bin/not-a-locked-binary" }]).join("\n"), /is not a binary that package-lock\.json links/)
  // ESLint of the web workspace is its own nested version, and the mobile workspace uses the root one.
  assert.deepEqual(findingsOf([{ run: '(cd apps/web && node_modules/.bin/eslint -- "${web[@]}")' }]), [])
  assert.match(findingsOf([{ run: '(cd apps/mobile && node_modules/.bin/eslint -- "${mobile[@]}")' }]).join("\n"), /is not a binary/)
  assert.deepEqual(findingsOf([{ run: "echo $(./node_modules/.bin/turbo --version)" }], { defaults: { run: { "working-directory": "." } } }), [])
  // A checkout of this repository at a path holds the root tree, and React Doctor has its own lockfile.
  assert.deepEqual(findingsOf([{ uses: "actions/checkout@v6", with: { path: "staging-smoke-source" } },
    { "working-directory": "staging-smoke-source", run: "./node_modules/.bin/playwright install chromium" }]), [])
  assert.deepEqual(findingsOf([{ run: ".github/react-doctor/node_modules/.bin/react-doctor ." }]), [])
  assert.match(findingsOf([{ run: ".github/react-doctor/node_modules/.bin/turbo run" }]).join("\n"), /\.github\/react-doctor\/package-lock\.json/)
  assert.match(findingsOf([{ run: "$HOME/node_modules/.bin/turbo run" }]).join("\n"), /outside the repository tree/)
  assert.deepEqual(findingsOf([{ run: '"$RUNNER_TEMP/turbo/node_modules/.bin/turbo" run test' }]), [])
})
