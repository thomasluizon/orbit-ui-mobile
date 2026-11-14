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
    const second = spawnSync("bash", ["-e", "-c", `${options.stubs ?? "node() { echo GATE_RAN; }"}\n${substitute(gate.run)}`], {
      cwd: directory, env: environment, encoding: "utf8",
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
    { stubs: "npm() { echo GATE_RAN; }" }],
  ["design-guard", "Ban raw --slate-*, transition-all, h-screen in app code", "apps/web/app/page.tsx",
    { content: "transition-all\n", ownedStatus: 1, marker: "DESIGN.md ban" }],
  ["design-guard", "Ban decorative gradients in app code", "tools/check-gradients.mjs", {}],
  ["workflow-syntax", "Lint all workflows", ".github/actions/setup/action.yml", { stubs: "gh() { echo GATE_RAN; exit 0; }" }],
]) {
  test(`${jobId}: ${stepName} resolves before consuming changed paths`, () => {
    for (const mode of ["missing", "unfetched", "owned", "unowned"]) {
      runCase(jobId, stepName, path, mode, { workflow: jobId === "lint" ? testWorkflow : workflow, ...options })
    }
  })
}

test("handoff-size: the step fails an oversized changed relay document and ignores an unchanged one", () => {
  const job = guardGroups(workflow)["handoff-size"]
  const prepare = job.steps.find((step) => step.name === "Resolve pull request changed paths")
  const gate = job.steps.find((step) => step.name === "Changed specs and the relay prompt stay inside their byte ceilings")
  assert.ok(prepare?.run && gate?.run, "handoff-size must prepare changed paths and run its guard")
  for (const [label, changes, passes] of [
    ["an oversized changed spec fails", { ".claude/specs/grown.md": "x".repeat(41984) }, false],
    ["an oversized changed prompt fails", { ".claude/handoffs/NEXT.md": "x".repeat(8300) }, false],
    ["a spec at its ceiling passes", { ".claude/specs/grown.md": "x".repeat(40960) }, true],
    ["an unchanged oversized spec elsewhere passes", { "notes.txt": "changed\n" }, true],
  ]) {
    const directory = mkdtempSync(join(tmpdir(), "guards-handoff-size-"))
    try {
      git(directory, "init", "-q")
      git(directory, "config", "user.email", "test@example.invalid")
      git(directory, "config", "user.name", "Test")
      mkdirSync(join(directory, ".claude/specs"), { recursive: true })
      writeFileSync(join(directory, ".claude/specs/legacy.md"), "x".repeat(50000))
      git(directory, "add", ".claude/specs/legacy.md")
      git(directory, "commit", "-qm", "base")
      git(directory, "update-ref", "refs/remotes/origin/base", git(directory, "rev-parse", "HEAD"))
      for (const [path, content] of Object.entries(changes)) {
        mkdirSync(dirname(join(directory, path)), { recursive: true })
        writeFileSync(join(directory, path), content)
        git(directory, "add", path)
      }
      git(directory, "commit", "-qm", "change")
      for (const file of [".github/scripts/changed-paths.sh", "tools/check-handoff-size.mjs", "tools/lib/handoff-prompt.mjs", "tools/lib/run-state.mjs"]) {
        mkdirSync(dirname(join(directory, file)), { recursive: true })
        copyFileSync(join(repositoryRoot, file), join(directory, file))
      }
      const environment = { ...process.env, RUNNER_TEMP: directory, BASE_REF: "base" }
      const prepared = spawnSync("bash", ["-e", "-c", prepare.run], { cwd: directory, env: environment, encoding: "utf8" })
      assert.equal(prepared.status, 0, `${label}: changed paths must resolve: ${prepared.stderr}`)
      const guarded = spawnSync("bash", ["-e", "-c", gate.run], { cwd: directory, env: environment, encoding: "utf8" })
      // WHY: GNU xargs reports a failed child as 123 and BSD xargs as 1; the step only has to fail (https://github.com/thomasluizon/orbit-tickets/issues/2064).
      assert.equal(guarded.status === 0, passes, `${label}: exit ${guarded.status} ${guarded.stdout}${guarded.stderr}`)
      if (!passes) assert.match(guarded.stderr, new RegExp(`\`${Object.keys(changes)[0].replaceAll(".", "\\.")}\` within \\d+ B \\(it is \\d+ B\\)`))
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
})

test("each diff reader resolves paths before using them", () => {
  const readers = ["mobile-styles", "root-allowlist", "dashes", "mobile-fonts", "copy", "i18n-usage",
    "expo-pin", "surface-manifest", "gate-charter"]
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
  for (const [output, jobId, name] of [
    ["javascript", "analyze-javascript-typescript", "Analyze (javascript-typescript)"],
    ["actions", "analyze-actions", "Analyze (actions)"],
  ]) {
    const job = codeql.jobs[jobId]
    assert.equal(job.name, name)
    assert.equal(job.strategy, undefined, "a skipped matrix job reports its unexpanded name")
    assert.equal(job.needs, "changes")
    assert.equal(job.if, `\${{ !cancelled() && (needs.changes.result != 'success' || needs.changes.outputs.${output} == 'true') }}`)
    assert.ok(job["timeout-minutes"] <= 10)
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
  assert.equal(steps.filter((step) => /^npm ci\b/.test(step.run ?? "")).length, 1)
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

test("calibration stays advisory and React Doctor retains its time limit", () => {
  assert.equal(guardGroups(workflow).calibration.steps.find((step) => step.name === "Report calibration drift")["continue-on-error"], true)
  assert.equal(guardGroups(workflow)["react-doctor"].steps.find((step) => step.id === "react-doctor__1")["timeout-minutes"], 15)
})

test("pull requests run each source check through one owner", () => {
  assert.equal(guardGroups(workflow)["surface-scope-report"], undefined)
  for (const id of ["lint-severity__1", "performance-workflow__1", "root-allowlist__4"]) {
    const step = workflow.jobs.guards.steps.find((candidate) => candidate.id === id)
    assert.equal(step.if, "${{ !cancelled() && (github.event_name != 'pull_request') }}")
  }
  assert.ok(testWorkflow.jobs["tool-tests"].steps.some((step) => step.run?.startsWith("node tools/test-tools.mjs --shard ")))
  assert.ok(testWorkflow.jobs["web-tests"].steps.some((step) => step.name === "Run web shard with coverage"))
  assert.ok(testWorkflow.jobs["workspace-tests"].steps.some((step) => step.run === "npx turbo run test --filter=@orbit/desktop --filter=@orbit/shared --filter=@orbit/eslint-rules --concurrency=1 -- --coverage"))
  assert.equal(testWorkflow.jobs["unit-tests"].steps.some((step) => step.run?.includes("npx turbo run test")), false)
})

test("every pull request runs the full-tree surface scope scan outside the cached unit task", () => {
  const job = testWorkflow.jobs["hook-tests"]
  const step = job.steps.find((candidate) => candidate.run?.includes("node tools/check-surface-scope.mjs"))
  assert.ok(step, "Tool and Hook Tests must execute the full-tree surface scope scan")
  assert.equal(step.if, "${{ !cancelled() }}")
  assert.doesNotMatch(step.run, /changed-paths/, "a mobile-only change must still run the full-tree scan")
  assert.equal(job.needs, undefined)
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
