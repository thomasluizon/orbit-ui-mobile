import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import yaml from "js-yaml"

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const workflow = yaml.load(readFileSync(join(repositoryRoot, ".github/workflows/guards.yml"), "utf8"))
const testWorkflow = yaml.load(readFileSync(join(repositoryRoot, ".github/workflows/test.yml"), "utf8"))
const cases = [
  ["root-allowlist", "Workspace packages declare no ignored overrides", "package.json"],
  ["root-allowlist", "The brand lockup's viewBox is exactly its ink", "design/brand/orbit-lockup.svg"],
  ["copy", "Changed copy stays inside the register", "apps/web/app/page.tsx"],
  ["i18n-usage", "Changed translation usage resolves", "apps/mobile/app/page.tsx"],
  ["lint-severity", "Changed lint inputs keep local rules blocking", "eslint.config.mjs"],
  ["performance-workflow", "Changed performance machinery matches its generated workflow", "tools/generate-performance-workflow.mjs"],
  ["surface-manifest", "Changed surface inputs match the committed inventory", "design/canvas/screen.svg"],
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
    const job = (options.workflow ?? workflow).jobs[jobId]
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
]) {
  test(`${jobId}: ${stepName} resolves before consuming changed paths`, () => {
    for (const mode of ["missing", "unfetched", "owned", "unowned"]) {
      runCase(jobId, stepName, path, mode, { workflow: testWorkflow, ...options })
    }
  })
}

test("each diff reader resolves paths before using them", () => {
  const readers = ["mobile-styles", "root-allowlist", "dashes", "mobile-fonts", "copy", "i18n-usage",
    "lint-severity", "parity", "expo-pin", "review-harness", "performance-workflow", "surface-manifest", "gate-charter"]
  for (const jobId of readers) {
    const steps = workflow.jobs[jobId].steps
    const preparation = steps.findIndex((step) => step.name === "Resolve pull request changed paths")
    assert.ok(preparation > 0, `${jobId} must prepare paths after checkout`)
    assert.equal(steps[preparation].if, "github.event_name == 'pull_request'")
    assert.ok(steps.slice(preparation + 1).some((step) => step.run?.includes("$RUNNER_TEMP/changed-paths")),
      `${jobId} must read the prepared list`)
  }
  assert.doesNotMatch(readFileSync(join(repositoryRoot, ".github/workflows/guards.yml"), "utf8"), /git diff --name-only/)
})
