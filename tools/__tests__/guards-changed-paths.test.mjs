import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
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
  ["copy", "Changed copy stays inside the register", "apps/web/app/page.tsx"],
  ["i18n-usage", "Changed translation usage resolves", "apps/mobile/app/page.tsx"],
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
  ["checks", "Lint only files changed by this pull request", "apps/web/app/page.tsx",
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
      runCase(jobId, stepName, path, mode, { workflow: jobId === "checks" ? testWorkflow : workflow, ...options })
    }
  })
}

test("workflow-syntax: a pull request that changes only the actionlint configuration runs the gate", () => {
  for (const mode of ["owned", "unowned"]) {
    runCase("workflow-syntax", "Lint all workflows", ".github/actionlint.yaml", mode, { stubs: "gh() { echo GATE_RAN; exit 0; }" })
  }
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

test("each diff reader resolves paths before using them", () => {
  const readers = ["mobile-styles", "dashes", "mobile-fonts", "copy", "i18n-usage",
    "expo-pin"]
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

test("CodeQL runs once a day on main and on a dispatch, and never on a pull request or a push", () => {
  const codeql = yaml.load(readFileSync(join(repositoryRoot, ".github/workflows/codeql.yml"), "utf8"))
  assert.deepEqual(Object.keys(codeql.on).sort(), ["schedule", "workflow_dispatch"])
  assert.equal(codeql.on.schedule.length, 1)
  assert.match(codeql.on.schedule[0].cron, /^\d+ \d+ \* \* \*$/, "one run each day")
  assert.deepEqual(Object.keys(codeql.jobs).sort(), ["analyze-actions", "analyze-javascript-typescript"])
  for (const [id, language] of [["analyze-javascript-typescript", "javascript-typescript"], ["analyze-actions", "actions"]]) {
    const job = codeql.jobs[id]
    assert.equal(job.needs, undefined, `${id} needs no selection job`)
    assert.equal(job.if, undefined, `${id} always analyzes its language`)
    assert.equal(job.steps.find((step) => step.uses?.startsWith("github/codeql-action/init@")).with.languages, language)
  }
})

test("Dependency Review runs inside Guards only when a dependency input changes", () => {
  assert.equal(existsSync(join(repositoryRoot, ".github/workflows/dependency-review.yml")), false,
    "the Dependency Review workflow folds into Guards")
  const { steps } = guardGroups(workflow)["dependency-review"]
  const select = steps.find((step) => step.name === "Select the pull requests that change a dependency input")
  const review = steps.find((step) => step.uses?.startsWith("actions/dependency-review-action@"))
  assert.equal(review.uses, "actions/dependency-review-action@bbc44d14a204704ccc493733616cd1e93a0321ec")
  assert.deepEqual(review.with, { "fail-on-severity": "high" })
  assert.equal(review.if, "${{ !cancelled() && (github.event_name == 'pull_request') && steps.dependency-review__1.outputs.changed == 'true' }}")
  assert.match(readFileSync(join(repositoryRoot, "TESTING.md"), "utf8"), /`Dependency Review` step runs [^\n]*`Cargo.toml`[^\n]*`Cargo.lock`/,
    "TESTING.md names each ecosystem of the dependency graph that the step selects")
  const selected = (paths) => {
    const directory = mkdtempSync(join(tmpdir(), "dependency-review-"))
    try {
      writeFileSync(join(directory, "changed-paths.txt"), `${paths.join("\n")}\n`)
      const output = join(directory, "output")
      const result = spawnSync("bash", ["-e", "-c", select.run], {
        env: { ...process.env, RUNNER_TEMP: directory, GITHUB_OUTPUT: output }, encoding: "utf8",
      })
      assert.equal(result.status, 0, result.stderr)
      return readFileSync(output, "utf8").trim()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
  for (const path of ["package.json", "package-lock.json", "apps/web/package.json", ".github/react-doctor/package-lock.json",
    ".github/workflows/test.yml", ".github/actions/setup/action.yml",
    "apps/desktop/src-tauri/Cargo.lock", "apps/desktop/src-tauri/Cargo.toml"]) {
    assert.equal(selected(["README.md", path]), "changed=true", path)
  }
  for (const path of ["README.md", "apps/web/app/page.tsx", ".github/scripts/plan-test-jobs.mjs", "docs/package.json.md", "tools/package-lock.json.bak",
    "apps/desktop/src-tauri/src/lib.rs", "docs/Cargo.lock.md"]) {
    assert.equal(selected([path]), "changed=false", path)
  }
})
