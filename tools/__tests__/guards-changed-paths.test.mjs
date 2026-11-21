import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import yaml from "js-yaml"
import { guardGroups } from "./_guard-groups.mjs"

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const workflow = yaml.load(readFileSync(join(repositoryRoot, ".github/workflows/guards.yml"), "utf8"))
const testWorkflow = yaml.load(readFileSync(join(repositoryRoot, ".github/workflows/test.yml"), "utf8"))
const cases = [
  ["root-allowlist", "Workspace packages declare no ignored overrides", "package.json"],
  ["copy", "Changed copy stays inside the register", "apps/web/app/page.tsx"],
  ["i18n-usage", "Changed translation usage resolves", "apps/mobile/app/page.tsx"],
  ["surface-manifest", "Changed surface inputs match the committed inventory", "design/canvas/screen.svg"],
  ["dependency-audit", "Verify installed packages against locked archives", "apps/mobile/scripts/fix-hoisting.js"],
]

function git(directory, ...arguments_) {
  return execFileSync("git", arguments_, { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
}

function runCase(jobId, stepName, changedPath, mode, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "guards-changed-paths-"))
  try {
    git(directory, "init", "-q")
    git(directory, "config", "user.email", "test@example.invalid")
    git(directory, "config", "user.name", "Test")
    writeFileSync(join(directory, "initial.txt"), "base\n")
    git(directory, "add", "initial.txt")
    git(directory, "commit", "-qm", "base")
    const base = git(directory, "rev-parse", "HEAD")
    if (mode === "fetchable") git(directory, "branch", "base", base)
    const path = mode === "unowned" ? "unowned.txt" : changedPath
    mkdirSync(dirname(join(directory, path)), { recursive: true })
    writeFileSync(join(directory, path), options.content ?? "changed\n")
    git(directory, "add", path)
    git(directory, "commit", "-qm", "change")
    const origin = join(directory, "origin.git")
    if (mode === "fetchable") {
      execFileSync("git", ["init", "--bare", "-q", origin])
      git(directory, "remote", "add", "origin", origin)
      git(directory, "push", "-q", "origin", "base")
      git(directory, "update-ref", "-d", "refs/remotes/origin/base")
    } else {
      git(directory, "remote", "add", "origin", join(directory, "absent-origin"))
    }
    if (mode === "owned" || mode === "unowned") git(directory, "update-ref", "refs/remotes/origin/base", base)
    if (mode === "unfetched") git(directory, "update-ref", "refs/heads/base", base)
    const baseRef = mode === "missing" ? "missing" : "base"
    const job = guardGroups(options.workflow ?? workflow)[jobId]
    const prepare = job.steps.find((step) => step.name === "Resolve pull request changed paths")
    assert.ok(prepare?.run, `${jobId} must prepare changed paths in its own step`)
    const gate = job.steps.find((step) => step.name === stepName)
    assert.ok(gate?.run, `${jobId} must retain ${stepName}`)
    const source = join(repositoryRoot, ".github/scripts/changed-paths.sh")
    const destination = join(directory, ".github/scripts/changed-paths.sh")
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(source, destination)
    const substitute = (script) => script
      .replaceAll("${{ github.event_name }}", "pull_request")
      .replaceAll("${{ github.base_ref }}", baseRef)
    const environment = { ...process.env, RUNNER_TEMP: directory, BASE_REF: baseRef }
    const first = spawnSync("bash", ["-e", "-c", substitute(prepare.run)], { cwd: directory, env: environment, encoding: "utf8" })
    if (mode === "missing" || mode === "unfetched") {
      assert.notEqual(first.status, 0, `${jobId}: ${mode} base must fail`)
      assert.match(first.stderr, new RegExp(baseRef), `${jobId}: failure must name the base`)
      return
    }
    assert.equal(first.status, 0, `${jobId}: changed paths must resolve: ${first.stderr}`)
    // A gate runs an installed binary by its path, so each stub binary is a file at that path of the tree.
    for (const [binary, script] of Object.entries(options.binaries ?? {})) {
      mkdirSync(dirname(join(directory, binary)), { recursive: true })
      writeFileSync(join(directory, binary), `#!/bin/sh\n${script}\n`, { mode: 0o755 })
    }
    const gateDirectory = join(directory, gate["working-directory"] ?? "")
    mkdirSync(gateDirectory, { recursive: true })
    const second = spawnSync("bash", ["-e", "-c", `${options.stubs ?? "node() { echo GATE_RAN; }"}\n${substitute(gate.run)}`], {
      cwd: gateDirectory, env: environment, encoding: "utf8",
    })
    assert.equal(second.status, mode === "owned" ? (options.ownedStatus ?? 0) : 0,
      `${jobId}: gate step exit: ${second.stderr}`)
    const shouldRun = mode === "owned" || mode === "fetchable"
    assert.equal(`${second.stdout}${second.stderr}`.includes(options.marker ?? "GATE_RAN"), shouldRun,
      `${jobId}: ${mode} must ${shouldRun ? "run" : "skip"} the gate`)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

for (const [jobId, stepName, path] of cases) {
  test(`${jobId}: ${stepName}`, () => {
    for (const mode of ["missing", "unfetched", "owned", "unowned", "fetchable"]) runCase(jobId, stepName, path, mode)
  })
}

for (const [jobId, stepName, path, options] of [
  ["lint", "Lint only files changed by this pull request", "apps/web/app/page.tsx",
    { binaries: { "apps/web/node_modules/.bin/eslint": "echo GATE_RAN" } }],
  ["design-guard", "Ban raw --slate-*, transition-all, h-screen in app code", "apps/web/app/page.tsx",
    { content: "transition-all\n", ownedStatus: 1, marker: "DESIGN.md ban" }],
  ["design-guard", "Ban decorative gradients in app code", "tools/check-gradients.mjs", {}],
  ["workflow-syntax", "Lint all workflows", ".github/actions/setup/action.yml", { stubs: "gh() { echo GATE_RAN; exit 0; }" }],
  ["expo-pin", "Dependencies resolve to the SDK 58 set", "apps/mobile/package.json",
    { stubs: "node() { :; }", binaries: { "node_modules/.bin/expo": 'echo "EXPO_CHECK EXPO_OFFLINE=${EXPO_OFFLINE:-unset} expo $*"' },
      marker: "EXPO_CHECK EXPO_OFFLINE=1 expo install --check" }],
]) {
  test(`${jobId}: ${stepName} resolves before consuming changed paths`, () => {
    for (const mode of ["missing", "unfetched", "owned", "unowned"]) {
      runCase(jobId, stepName, path, mode, { workflow: jobId === "lint" ? testWorkflow : workflow, ...options })
    }
  })
}

test("workflow-syntax: a pull request that changes only the actionlint configuration runs the gate", () => {
  for (const mode of ["owned", "unowned"]) {
    runCase("workflow-syntax", "Lint all workflows", ".github/actionlint.yaml", mode, { stubs: "gh() { echo GATE_RAN; exit 0; }" })
  }
})

test("the actionlint configuration holds only the self-hosted runner labels and no ignore", () => {
  const configuration = yaml.load(readFileSync(join(repositoryRoot, ".github/actionlint.yaml"), "utf8"))
  assert.deepEqual(Object.keys(configuration), ["self-hosted-runner"], "a paths or ignore key would hide a finding the gate reports")
  assert.deepEqual(Object.keys(configuration["self-hosted-runner"]), ["labels"])
  assert.ok(Array.isArray(configuration["self-hosted-runner"].labels), "labels must be a list")
})

function movedFileRepository(prefix, from, to) {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  git(directory, "init", "-q")
  git(directory, "config", "user.email", "test@example.invalid")
  git(directory, "config", "user.name", "Test")
  mkdirSync(dirname(join(directory, from)), { recursive: true })
  writeFileSync(join(directory, from), "export const moved = 1\n")
  git(directory, "add", from)
  git(directory, "commit", "-qm", "base")
  git(directory, "update-ref", "refs/remotes/origin/base", git(directory, "rev-parse", "HEAD"))
  mkdirSync(dirname(join(directory, to)), { recursive: true })
  git(directory, "mv", from, to)
  git(directory, "commit", "-qm", "move")
  return directory
}

test("every diff reader lists the old path of a moved file", () => {
  const [from, to] = ["apps/web/lib/moved.ts", "tools/moved.ts"]
  const guards = movedFileRepository("guards-moved-file-", from, to)
  try {
    const script = join(repositoryRoot, ".github/scripts/changed-paths.sh")
    const resolved = spawnSync("bash", [script, "base", guards], { cwd: guards, encoding: "utf8" })
    assert.equal(resolved.status, 0, resolved.stderr)
    assert.deepEqual(readFileSync(join(guards, "changed-paths.txt"), "utf8").trim().split("\n").sort(), [from, to])
    assert.deepEqual(readFileSync(join(guards, "changed-paths-present.nul"), "utf8").split("\0").filter(Boolean), [to],
      "a tool that reads files receives only the path that exists")
  } finally {
    rmSync(guards, { recursive: true, force: true })
  }
  const plan = testWorkflow.jobs.plan.steps.find((step) => step.id === "plan")
  const diff = plan.run.split("\n").find((line) => line.includes("git diff --name-only"))
  assert.ok(diff, "Plan must read the changed paths of the merge commit")
  const planned = movedFileRepository("plan-moved-file-", from, to)
  try {
    const read = spawnSync("bash", ["-e", "-c", diff], { cwd: planned, env: { ...process.env, EVENT_NAME: "pull_request", RUNNER_TEMP: planned }, encoding: "utf8" })
    assert.equal(read.status, 0, read.stderr)
    assert.deepEqual(readFileSync(join(planned, "changed-paths.txt"), "utf8").trim().split("\n").sort(), [from, to],
      "a file that leaves apps/web still plans the web jobs")
  } finally {
    rmSync(planned, { recursive: true, force: true })
  }
  for (const path of [".github/workflows/test.yml", ".github/workflows/android-startup.yml"]) {
    for (const line of readFileSync(join(repositoryRoot, path), "utf8").split("\n").filter((candidate) => candidate.includes("git diff --name-only"))) {
      assert.match(line, /git diff --name-only --no-renames HEAD\^1 HEAD/, `${path}: ${line.trim()}`)
    }
  }
})

test("feature parity runs for every input of the check and skips an unrelated change", () => {
  const step = workflow.jobs.guards.steps.find((candidate) => candidate.id === "feature-parity__1")
  const directory = mkdtempSync(join(tmpdir(), "guards-feature-parity-"))
  try {
    const ran = (path) => {
      writeFileSync(join(directory, "changed-paths.txt"), `${path}\n`)
      const result = spawnSync("bash", ["-e", "-c", `node() { echo GATE_RAN; }\n${step.run}`], {
        cwd: directory, env: { ...process.env, RUNNER_TEMP: directory, BASE_REF: "main" }, encoding: "utf8",
      })
      assert.equal(result.status, 0, result.stderr)
      return result.stdout.includes("GATE_RAN")
    }
    for (const path of ["apps/web/app/page.tsx", "apps/mobile/app/index.tsx", "packages/shared/src/i18n/en.json",
      "tools/check-feature-parity.mjs", "tools/feature-parity-rules.json", "DESIGN.md", ".claude/specs/orbit-prod-release.md"]) {
      assert.equal(ran(path), true, `${path} is an input of the parity check`)
    }
    for (const path of ["docs/DESIGN.md", "tools/check-copy.mjs", ".claude/specs/other.md"]) {
      assert.equal(ran(path), false, `${path} is not an input of the parity check`)
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
  const tool = readFileSync(join(repositoryRoot, "tools/check-feature-parity.mjs"), "utf8")
  for (const input of ["tools/feature-parity-rules.json", "DESIGN.md", ".claude/specs/orbit-prod-release.md"]) {
    assert.ok(tool.includes(`'${input}'`), `${input} must still be an input of the tool`)
  }
})

test("each diff reader resolves paths before using them", () => {
  const readers = ["mobile-styles", "root-allowlist", "dashes", "mobile-fonts", "copy", "i18n-usage",
    "expo-pin", "surface-manifest"]
  for (const jobId of readers) {
    const steps = guardGroups(workflow)[jobId].steps
    const preparation = steps.findIndex((step) => step.name === "Resolve pull request changed paths")
    assert.ok(preparation > 0, `${jobId} must prepare paths after checkout`)
    assert.equal(steps[preparation].if, "${{ !cancelled() && (github.event_name == 'pull_request') }}")
    assert.ok(steps.slice(preparation + 1).some((step) => step.run?.includes("$RUNNER_TEMP/changed-paths")),
      `${jobId} must read the prepared list`)
  }
  assert.doesNotMatch(readFileSync(join(repositoryRoot, ".github/workflows/guards.yml"), "utf8"), /git diff --name-only/)
})

test("CodeQL reports both required names and analyzes a language only when its inputs change", () => {
  const codeql = yaml.load(readFileSync(join(repositoryRoot, ".github/workflows/codeql.yml"), "utf8"))
  assert.deepEqual(Object.keys(codeql.on), ["push", "pull_request"])
  assert.deepEqual(codeql.concurrency, {
    group: "codeql-${{ github.event.pull_request.number || github.sha }}",
    "cancel-in-progress": "${{ github.event_name == 'pull_request' }}",
  })
  assert.equal(codeql.jobs.changes.if, "github.event_name == 'pull_request'")
  for (const [output, jobId, name, limit] of [
    ["javascript", "analyze-javascript-typescript", "Analyze (javascript-typescript)", 27],
    ["actions", "analyze-actions", "Analyze (actions)", 5],
  ]) {
    const job = codeql.jobs[jobId]
    assert.equal(job.name, name)
    assert.equal(job.strategy, undefined, "a skipped matrix job reports its unexpanded name")
    assert.equal(job.needs, "changes")
    assert.equal(job.if, `\${{ !cancelled() && (needs.changes.result != 'success' || needs.changes.outputs.${output} == 'true') }}`)
    assert.equal(job["timeout-minutes"], limit, `${name} keeps the limit that covers its slowest measured run on main`)
  }
  const selection = codeql.jobs.changes.steps.find((step) => step.id === "languages")
  const select = (change) => {
    const directory = mkdtempSync(join(tmpdir(), "codeql-languages-"))
    const repository = join(directory, "repository")
    try {
      mkdirSync(join(repository, "apps/web"), { recursive: true })
      git(repository, "init", "-q")
      git(repository, "config", "user.email", "test@example.invalid")
      git(repository, "config", "user.name", "Test")
      writeFileSync(join(repository, "README.md"), "base\n")
      writeFileSync(join(repository, "apps/web/old.ts"), "export const old = 1\n")
      git(repository, "add", ".")
      git(repository, "commit", "-qm", "base")
      change(repository)
      git(repository, "add", "-A")
      git(repository, "commit", "-qm", "change")
      const output = join(directory, "output")
      const result = spawnSync("bash", ["-e", "-c", selection.run], {
        cwd: repository, env: { ...process.env, RUNNER_TEMP: directory, GITHUB_OUTPUT: output }, encoding: "utf8",
      })
      assert.equal(result.status, 0, result.stderr)
      return Object.fromEntries(readFileSync(output, "utf8").trim().split("\n").map((line) => line.split("=")))
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
  const add = (...paths) => (repository) => {
    for (const path of paths) {
      mkdirSync(dirname(join(repository, path)), { recursive: true })
      writeFileSync(join(repository, path), "changed\n")
    }
  }
  const neither = { javascript: "false", actions: "false" }
  const javascript = { javascript: "true", actions: "false" }
  const both = { javascript: "true", actions: "true" }
  assert.deepEqual(select(add("docs/plan.md", "design/canvas/screen.png", ".claude/specs/run.md")), neither)
  assert.deepEqual(select(add("apps/web/app/page.tsx")), javascript)
  assert.deepEqual(select(add("packages/shared/package.json")), javascript)
  assert.deepEqual(select(add("apps/mobile/android/gradlew")), javascript, "the extractor reads extension-less files")
  assert.deepEqual(select(add(".github/workflows/test.yml")), both)
  assert.deepEqual(select(add(".github/actions/android-boot/action.yml")), both)
  assert.deepEqual(select((repository) => rmSync(join(repository, "apps/web/old.ts"))), javascript, "a deleted source file closes its alerts")
  assert.deepEqual(select((repository) => {
    mkdirSync(join(repository, "docs"))
    git(repository, "mv", "apps/web/old.ts", "docs/old.md")
  }), javascript, "a rename out of a language still analyzes the old path")
})

test("Guards checks every workflow with a checksum-pinned actionlint and no baseline", () => {
  const step = workflow.jobs.guards.steps.find((candidate) => candidate.id === "workflow-syntax__1")
  assert.ok(step, "workflow syntax must have a guard")
  assert.equal(step.if, "${{ !cancelled() }}")
  assert.match(step.run, /gh release download v1\.7\.12 --repo rhysd\/actionlint --pattern actionlint_1\.7\.12_linux_amd64\.tar\.gz/)
  assert.equal(step.env.GH_TOKEN, "${{ github.token }}")
  assert.doesNotMatch(step.run, /releases\/download/)
  assert.match(step.run, /8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8/)
  assert.match(step.run, /sha256sum -c/)
  assert.ok(step.run.indexOf("sha256sum -c") < step.run.indexOf("tar -xzf"))
  assert.match(step.run, /actionlint" -shellcheck= -pyflakes= \.github\/workflows\/\*\.yml/)
  assert.doesNotMatch(step.run, /-ignore|\|\| true/)
})

test("script guards share one checkout and install, and run after another guard fails", () => {
  assert.deepEqual(Object.keys(workflow.jobs), ["guards"])
  const steps = workflow.jobs.guards.steps
  assert.equal(steps.filter((step) => step.uses?.startsWith("actions/checkout@")).length, 1)
  // One step installs the workspace tree. The React Doctor step installs only its own lockfile, outside that tree.
  const installs = steps.flatMap((step) => (step.run ?? "").split("\n").filter((line) => /^\s*npm ci\b/.test(line))
    .map((line) => [step.id ?? step.name, line.trim()]))
  assert.deepEqual(installs, [
    ["Install dependencies", "npm ci --no-audit"],
    ["react-doctor__1", "npm ci --prefix .github/react-doctor --ignore-scripts --no-audit --no-fund"],
  ])
  const reactDoctor = steps.find((step) => step.id === "react-doctor__1")
  assert.match(reactDoctor.run, /^\.github\/react-doctor\/node_modules\/\.bin\/react-doctor \. /m, "React Doctor runs the binary of its locked tree")
  const reactDoctorLock = JSON.parse(readFileSync(join(repositoryRoot, ".github/react-doctor/package-lock.json"), "utf8"))
  const reactDoctorManifest = JSON.parse(readFileSync(join(repositoryRoot, ".github/react-doctor/package.json"), "utf8"))
  assert.match(reactDoctorManifest.devDependencies["react-doctor"], /^\d+\.\d+\.\d+$/, "the manifest pins one exact React Doctor version")
  assert.deepEqual(reactDoctorLock.packages[""].devDependencies, reactDoctorManifest.devDependencies, "npm ci needs the manifest and the lockfile to agree")
  assert.equal(reactDoctorLock.packages["node_modules/react-doctor"].version, reactDoctorManifest.devDependencies["react-doctor"])
  for (const step of steps.filter((candidate) => candidate.id?.includes("__"))) {
    assert.ok(step.name, `${step.id} must name the guard`)
    assert.match(step.if, /!cancelled\(\)/, `${step.id} must run after a previous failure`)
    assert.doesNotMatch(step.if, /success\(\)/, `${step.id} must not depend on another guard passing`)
  }
  const firstGuard = steps.findIndex((step) => step.id?.includes("__"))
  for (const step of steps.slice(firstGuard + 1).filter((candidate) => !candidate.id?.includes("__"))) {
    assert.match(step.if ?? "", /!cancelled\(\)/, `${step.name} must still run when an earlier guard fails`)
  }
})

test("React Doctor retains its time limit", () => {
  assert.equal(guardGroups(workflow)["react-doctor"].steps.find((step) => step.id === "react-doctor__1")["timeout-minutes"], 6)
})

test("pull requests run each source check through one owner", () => {
  assert.equal(guardGroups(workflow)["surface-scope-report"], undefined)
  for (const id of ["lint-severity__1", "performance-workflow__1", "root-allowlist__4"]) {
    const step = workflow.jobs.guards.steps.find((candidate) => candidate.id === id)
    assert.equal(step.if, "${{ !cancelled() && (github.event_name != 'pull_request') }}")
  }
  assert.ok(testWorkflow.jobs["tool-tests"].steps.some((step) => step.run === "node tools/test-tools.mjs"))
  assert.ok(testWorkflow.jobs["web-tests"].steps.some((step) => step.name === "Run web shard with coverage"))
  assert.ok(testWorkflow.jobs["workspace-tests"].steps.some((step) => step.run === "./node_modules/.bin/turbo run test --filter=@orbit/desktop --filter=@orbit/shared --filter=@orbit/eslint-rules --concurrency=1 -- --coverage"))
  assert.equal(testWorkflow.jobs["unit-tests"].steps.some((step) => step.run?.includes("turbo run test")), false)
})

test("every pull request runs the full-tree surface scope scan outside the cached unit task", () => {
  const job = testWorkflow.jobs["tool-tests"]
  const step = job.steps.find((candidate) => candidate.run?.includes("node tools/check-surface-scope.mjs"))
  assert.ok(step, "Tool Tests must execute the full-tree surface scope scan")
  assert.equal(step.if, "${{ !cancelled() }}")
  assert.doesNotMatch(step.run, /changed-paths/, "a mobile-only change must still run the full-tree scan")
  assert.equal(job.needs, "plan", "the scan waits for the plan only, never for a build")
  assert.equal(testWorkflow.on.pull_request.paths, undefined)
  const directory = mkdtempSync(join(tmpdir(), "surface-scope-step-"))
  try {
    mkdirSync(join(directory, "tools"))
    for (const [checkerStatus, stepStatus] of [[0, 0], [1, 1], [2, 2]]) {
      writeFileSync(join(directory, "tools/check-surface-scope.mjs"), `process.exit(${checkerStatus})\n`)
      const result = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", step.run], { cwd: directory, encoding: "utf8" })
      assert.equal(result.status, stepStatus, `checker exit ${checkerStatus} must end the step with ${stepStatus}`)
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
  assert.match(step.run, /node tools\/check-surface-scope\.mjs --graphic-floor-only/)
  assert.doesNotMatch(step.run, /--files-stdin/, "the owning floor check must scan the whole tree")
})
