import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import yaml from "js-yaml"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const load = (path) => yaml.load(readFileSync(join(root, path), "utf8"))
const workflows = readdirSync(join(root, ".github/workflows"))
  .filter((file) => /\.ya?ml$/.test(file))
  .map((file) => ({ file, on: Object.keys(load(`.github/workflows/${file}`).on), jobs: load(`.github/workflows/${file}`).jobs }))
const actions = readdirSync(join(root, ".github/actions"))
  .map((directory) => ({ file: `${directory}/action.yml`, steps: load(`.github/actions/${directory}/action.yml`).runs.steps }))
const everyStep = [
  ...workflows.flatMap(({ file, on, jobs }) => Object.entries(jobs).flatMap(([job, { steps = [] }]) =>
    steps.map((step) => ({ step, where: `${file}: ${job}: ${step.name ?? step.uses ?? step.run}`, file, job, pullRequest: on.includes("pull_request") })))),
  // A local action runs in the workflow that calls it, and pull request workflows call every local action.
  ...actions.flatMap(({ file, steps }) => steps.map((step) => ({ step, where: `${file}: ${step.name ?? step.uses ?? step.run}`, file, job: "action", pullRequest: true }))),
]
const uses = (prefix) => everyStep.filter(({ step }) => step.uses?.startsWith(prefix))

const MAIN_ONLY = /github\.ref == 'refs\/heads\/main'|github\.event_name != 'pull_request'/

// Entries that every ref can save, because each one is far under the 5 MB bound of the sweep
// (LARGE_ENTRY_BYTES in sweep-actions-caches.mjs). Sizes are from GET /repos/{owner}/{repo}/actions/caches.
const SMALL_ENTRIES = {
  "android-startup.yml: boot: Save the pass marker": "under 300 bytes, like the two markers below",
  "ios-build.yml: record: Save the pass marker": "229 bytes",
  "mobile-build.yml: build: Save the pass marker": "232 bytes",
  "desktop-nsis-tools/action.yml: Cache the NSIS tools": "1.9 MB",
}

test("every cache save step that can exceed the size bound saves only on main or outside a pull request", () => {
  const unruled = []
  for (const { step, where, pullRequest } of everyStep) {
    const savesAlways = step.uses?.startsWith("actions/cache/save@") && !MAIN_ONLY.test(step.if ?? "")
    const combined = step.uses?.startsWith("actions/cache@") && pullRequest
    if (savesAlways || combined) unruled.push(where)
  }
  assert.deepEqual(unruled.sort(), Object.keys(SMALL_ENTRIES).sort())
  for (const where of Object.keys(SMALL_ENTRIES).filter((name) => name.includes("pass marker"))) {
    const { step } = everyStep.find((candidate) => candidate.where === where)
    assert.match(step.with.key, /^\$\{\{ needs\.(plan|scope)\.outputs\.pass-key \}\}$/, where)
  }
})

// actions/setup-node at 949feb2413d6458794dcd2491c4babbbce0c15c1 (v7), src/cache-save.ts: the post step saves the
// npm cache from every ref on a key miss, and the action has no input that restores without a save.
test("no setup-node step restores or saves the npm cache", () => {
  const steps = uses("actions/setup-node@")
  assert.ok(steps.length > 30)
  for (const { step, where } of steps) {
    assert.equal(step.with?.["package-manager-cache"], false, where)
    assert.equal(step.with?.cache, undefined, where)
    assert.equal(step.with?.["cache-dependency-path"], undefined, where)
  }
})

const NPM_KEY = /^npm-\$\{\{ runner\.os \}\}-\$\{\{ runner\.arch \}\}-\$\{\{ hashFiles\((inputs\.lockfile|'[\w./-]*package-lock\.json')\) \}\}$/
const isNpmRestore = (step) => step.uses === "./.github/actions/restore-npm-cache" ||
  (step.uses === "actions/cache/restore@v6" && NPM_KEY.test(step.with.key))

test("every job that installs from the lockfile restores the npm cache first, and one main job for each runner family saves it", () => {
  const withoutCache = []
  const stepLists = [...workflows.flatMap(({ file, jobs }) => Object.entries(jobs).map(([job, { steps = [] }]) => [`${file}: ${job}`, steps])), ...actions.map(({ file, steps }) => [file, steps])]
  for (const [where, steps] of stepLists) {
    const install = steps.findIndex((step) => /^npm ci\b/.test(step.run ?? ""))
    if (install < 0) continue
    const restore = steps.findIndex(isNpmRestore)
    if (restore < 0 || restore > install) withoutCache.push(where)
  }
  // The diagnostic workflow keeps its four fixed steps and no cache step (tools/__tests__/android-sentry-diagnostic.mjs).
  assert.deepEqual(withoutCache, ["android-sentry-diagnostic.yml: diagnose"])

  const action = actions.find(({ file }) => file === "restore-npm-cache/action.yml").steps
  const restore = action.find((step) => step.id === "restore")
  assert.equal(restore.uses, "actions/cache/restore@v6")
  assert.match(restore.with.key, NPM_KEY)
  assert.equal(restore.with["restore-keys"].trim(), "npm-${{ runner.os }}-${{ runner.arch }}-")
  assert.equal(restore.with.path, "${{ steps.directory.outputs.path }}")
  assert.equal(action.find((step) => step.id === "directory").run, 'echo "path=$(npm config get cache)" >> "$GITHUB_OUTPUT"')
  for (const { step, where } of uses("actions/cache/restore@v6").filter(({ step }) => NPM_KEY.test(step.with.key))) {
    assert.equal(step.with["restore-keys"].trim(), "npm-${{ runner.os }}-${{ runner.arch }}-", where)
    assert.equal(step.with.path, where.startsWith("restore-npm-cache/") ? "${{ steps.directory.outputs.path }}" : "${{ steps.npm-cache-directory.outputs.path }}", where)
  }

  const saves = uses("actions/cache/save@").filter(({ step }) => step.with.key === "${{ steps.npm-cache.outputs.cache-primary-key }}")
  assert.deepEqual(saves.map(({ where }) => where).sort(), ["desktop-build.yml: build: Save the npm cache", "test.yml: build: Save the npm cache"])
  for (const { step, where } of saves) {
    assert.match(step.if, MAIN_ONLY, where)
    assert.match(step.if, /steps\.npm-cache\.outputs\.cache-hit != 'true'/, where)
    assert.equal(step.with.path, "${{ steps.npm-cache.outputs.path }}", where)
  }
  // Linux entry: PR Tests runs its Build job on every push to main.
  const tests = workflows.find(({ file }) => file === "test.yml")
  assert.ok(tests.on.includes("push"))
  assert.equal(tests.jobs.build["runs-on"], "ubuntu-24.04")
  // macOS and Windows entries: a lockfile change starts Desktop Build on main, and its matrix holds both families.
  const desktop = load(".github/workflows/desktop-build.yml")
  assert.deepEqual(desktop.on.push.branches, ["main"])
  assert.ok(desktop.on.push.paths.includes("package-lock.json"))
  assert.match(desktop.jobs.build["runs-on"], /macos-15.*windows-2025/)
})

// Measured: macOS npm ci took 53 to 59 s with no entry and 48 to 88 s after a 5 to 14 s restore of
// 0.47 GB, and the 0.62 GB NDK entry saved about 20 s of an Android build of 600 to 1400 s.
test("macOS restores and saves no npm entry, and no workflow caches the Android NDK", () => {
  const action = actions.find(({ file }) => file === "restore-npm-cache/action.yml").steps
  assert.equal(action.find((step) => step.id === "restore").if, "runner.os != 'macOS'")
  const desktopSave = load(".github/workflows/desktop-build.yml").jobs.build.steps.find((step) => step.name === "Save the npm cache")
  assert.match(desktopSave.if, /^runner\.os == 'Windows' && /)
  const ndkCaches = [...uses("actions/cache/restore@"), ...uses("actions/cache/save@"), ...uses("actions/cache@")]
    .filter(({ step }) => /ndk/i.test(`${step.with?.key ?? ""} ${step.with?.path ?? ""}`))
  assert.deepEqual(ndkCaches.map(({ where }) => where), [])
  const install = load(".github/workflows/mobile-build.yml").jobs.build.steps.find((step) => step.name === "Install and verify the Android NDK")
  assert.match(install.run, /for attempt in 1 2 3; do/)
})

// gradle/actions at 8da46b539cd8fe6ab27ca75128919a18d757604c: setup-gradle/action.yml defaults cache-read-only to
// github.event.repository != null && github.ref_name != github.event.repository.default_branch, and
// sources/src/configuration.ts isCacheReadOnly reads the input as a boolean. A read-only job restores and saves
// nothing ("Cache is read-only: will not save state" in the post step). The extracted Gradle entries are keyed on their
// content hash and shared by every job, so a second writer on main puts other hashes into the same key family, and the
// cache sweep then keeps that writer's entries as the newest and deletes the ones Mobile Android Build restores.
test("only Mobile Android Build writes the Gradle caches, so a release never writes a Gradle entry", () => {
  const steps = uses("gradle/actions/setup-gradle@")
  assert.equal(steps.length, 3)
  const writers = []
  for (const { step, where, file } of steps) {
    assert.equal(step.uses, "gradle/actions/setup-gradle@8da46b539cd8fe6ab27ca75128919a18d757604c", where)
    for (const input of ["cache-write-only", "cache-disabled"]) assert.equal(step.with?.[input], undefined, `${where}: ${input}`)
    const events = workflows.find((workflow) => workflow.file === file).on
    const pullRequestOnly = events.every((event) => event === "pull_request")
    if (step.with?.["cache-read-only"] !== true && !pullRequestOnly) writers.push(where)
  }
  assert.deepEqual(writers, ["mobile-build.yml: build: Set up Gradle caching"])
  const build = steps.find(({ file }) => file === "mobile-build.yml").step
  assert.equal(build.with?.["cache-read-only"], undefined, "Mobile Android Build keeps the default: write on main, read elsewhere")
})

// Swatinem/rust-cache at d1527c8f67ef9af357290475d4af4b0fab8f12e0: action.yml save-if decides whether the post step
// saves, and src/save.ts saves only when the lowercased input is "true". Each target is one key family that Desktop Build
// writes, so a release of an older commit or another environment would make the sweep delete the Desktop Build entry.
test("only Desktop Build writes the Rust compile cache, and no setup-java step saves a cache", () => {
  const rust = uses("Swatinem/rust-cache@")
  assert.equal(rust.length, 4)
  for (const { step, where, file } of rust) {
    assert.equal(step.with["save-if"], file === "desktop-build.yml" ? "${{ github.ref == 'refs/heads/main' }}" : "false", where)
  }
  for (const { step, where } of uses("actions/setup-java@")) assert.equal(step.with.cache, undefined, where)
})

test("the cache tests run in the hook tests job, and the restore action exists for every caller", () => {
  const run = load(".github/workflows/test.yml").jobs["hook-tests"].steps.map((step) => step.run ?? "").join("\n")
  for (const file of ["cache-save-rules.test.mjs", "sweep-actions-caches.test.mjs", "android-boot-action.test.mjs"]) {
    assert.ok(run.includes(`.github/scripts/${file}`), file)
  }
  assert.ok(existsSync(join(root, ".github/actions/restore-npm-cache/action.yml")))
})
