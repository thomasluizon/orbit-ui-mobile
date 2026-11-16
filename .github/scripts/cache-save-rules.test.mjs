import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import yaml from "js-yaml"
import { RELEASE_FAMILY_KEYS } from "./sweep-actions-caches.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const load = (path) => yaml.load(readFileSync(join(root, path), "utf8"))
const WORKFLOW_PATHS = readdirSync(join(root, ".github/workflows")).filter((file) => /\.ya?ml$/.test(file)).map((file) => `.github/workflows/${file}`)
const ACTION_PATHS = readdirSync(join(root, ".github/actions")).map((directory) => `.github/actions/${directory}/action.yml`)
// The key of a case change whose text a workflow edit removed.
const MISSING_TEXT = Symbol("missing text")
// The workflows and the local actions, with the text of some files changed or added, for a test that breaks the guard.
function readTree(changes = {}) {
  assert.equal(changes[MISSING_TEXT], undefined, changes[MISSING_TEXT])
  const read = (path) => yaml.load(changes[path] ?? readFileSync(join(root, path), "utf8"))
  const added = (pattern) => Object.keys(changes).filter((path) => pattern.test(path))
  const workflows = [...new Set([...WORKFLOW_PATHS, ...added(/^\.github\/workflows\//)])].map((path) => ({ path, document: read(path) }))
    .map(({ path, document }) => ({ file: path.split("/").at(-1), on: Object.keys(document.on), jobs: document.jobs }))
  const actions = [...new Set([...ACTION_PATHS, ...added(/^\.github\/actions\//)])]
    .map((path) => ({ file: path.replace(".github/actions/", ""), steps: read(path).runs.steps }))
  return { workflows, actions }
}
const tree = readTree()
const { workflows, actions } = tree
const everyStep = [
  ...workflows.flatMap(({ file, on, jobs }) => Object.entries(jobs).flatMap(([job, { steps = [] }]) =>
    steps.map((step) => ({ step, where: `${file}: ${job}: ${step.name ?? step.uses ?? step.run}`, file, job, pullRequest: on.includes("pull_request") })))),
  // A local action runs in the workflow that calls it, and pull request workflows call every local action.
  ...actions.flatMap(({ file, steps }) => steps.map((step) => ({ step, where: `${file}: ${step.name ?? step.uses ?? step.run}`, file, job: "action", pullRequest: true }))),
]
const uses = (prefix) => everyStep.filter(({ step }) => step.uses?.startsWith(prefix))
// GitHub reads an action name without regard to case.
const savesACache = (step) => /^actions\/cache(\/save)?@/i.test(step.uses ?? "")
const restoresACache = (step) => /^actions\/cache(\/restore)?@/i.test(step.uses ?? "")
// One JSON object on each line: the save step, its path, its key, the cache restores of its job and the rule that bounds its entry.
const INVENTORY_FILE = ".github/scripts/cache-save-inventory.jsonl"
const INVENTORY = readFileSync(join(root, INVENTORY_FILE), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))

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

const inlineNpmRestores = () => uses("actions/cache/restore@v6").filter(({ step, where }) => NPM_KEY.test(step.with.key) && !where.startsWith("restore-npm-cache/"))
const rootCheckoutRef = (file, job) => workflows.find((workflow) => workflow.file === file).jobs[job].steps
  .find((step) => step.uses?.startsWith("actions/checkout@") && step.with?.path === undefined).with?.ref

// A local action comes from the root checkout. A job whose root checkout is the release commit can run a commit that is
// older than the action, so it holds the two steps inline. A job whose root checkout is the commit of the workflow
// always has the action, also when a second checkout puts the release commit in a subdirectory.
test("only a job whose root checkout is the release commit restores the npm cache inline, and the lockfile input has its caller", () => {
  const inline = inlineNpmRestores()
  assert.deepEqual(inline.map(({ file, job }) => `${file}: ${job}`).sort(),
    ["desktop-release.yml: build", "desktop-release.yml: publish", "desktop-release.yml: staple", "release.yml: smoke"])
  for (const { step, where, file, job } of inline) {
    assert.match(rootCheckoutRef(file, job), /^\$\{\{ (inputs\.source_sha \|\| github\.sha|needs\.build\.outputs\.source_sha) \}\}$/, where)
    assert.equal(step.with.key, "npm-${{ runner.os }}-${{ runner.arch }}-${{ hashFiles('package-lock.json') }}", where)
  }

  assert.equal(load(".github/actions/restore-npm-cache/action.yml").inputs.lockfile.default, "package-lock.json")
  const otherLockfile = everyStep.filter(({ step }) => step.uses === "./.github/actions/restore-npm-cache" && step.with?.lockfile !== undefined)
  assert.deepEqual(otherLockfile.map(({ file, job, step }) => [`${file}: ${job}`, step.with.lockfile]),
    [["release.yml: staging", "staging-smoke-source/package-lock.json"]])
  const staging = workflows.find(({ file }) => file === "release.yml").jobs.staging.steps
  assert.equal(rootCheckoutRef("release.yml", "staging"), "${{ github.sha }}")
  const releaseCheckout = staging.findIndex((step) => step.uses?.startsWith("actions/checkout@") && step.with?.path === "staging-smoke-source")
  const restore = staging.indexOf(otherLockfile[0].step)
  const install = staging.findIndex((step) => step.run === "npm ci" && step["working-directory"] === "staging-smoke-source")
  assert.ok(releaseCheckout >= 0 && releaseCheckout < restore && restore < install, "release checkout, then the restore, then npm ci in that directory")
})

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
  assert.equal(restore.with.path, "${{ steps.directory.outputs.path }}")
  assert.equal(action.find((step) => step.id === "directory").run, 'echo "path=$(npm config get cache)" >> "$GITHUB_OUTPUT"')
  assert.equal(load(".github/actions/restore-npm-cache/action.yml").outputs.path.value, "${{ steps.directory.outputs.path }}")
  // The four release jobs restore inline and never save, so each keeps the prefix fallback.
  for (const { step, where } of inlineNpmRestores()) {
    assert.equal(step.with["restore-keys"].trim(), "npm-${{ runner.os }}-${{ runner.arch }}-", where)
    assert.equal(step.with.path, "${{ steps.npm-cache-directory.outputs.path }}", where)
  }

  // Linux entry: PR Tests runs its Build job on every push to main.
  const tests = workflows.find(({ file }) => file === "test.yml")
  assert.ok(tests.on.includes("push"))
  assert.equal(tests.jobs.build["runs-on"], "ubuntu-24.04")
  // Windows entry: a lockfile change starts Desktop Build on main, and its matrix holds the Windows targets.
  const desktop = load(".github/workflows/desktop-build.yml")
  assert.deepEqual(desktop.on.push.branches, ["main"])
  assert.ok(desktop.on.push.paths.includes("package-lock.json"))
  assert.match(desktop.jobs.build["runs-on"], /windows-2025/)
})

// npm never removes a tarball from its cache by itself (https://docs.npmjs.com/cli/v11/commands/npm-cache). A job
// that saves after a restore by prefix stores the previous entry plus the new tarballs under the new key, so the entry
// grows with every lockfile change on main. actions/cache at 55cc8345863c7cc4c66a329aec7e433d2d1c52a9 (v6),
// src/utils/actionUtils.ts getInputAsArray drops empty lines, so an empty restore-keys input restores the exact key or nothing.
const RESTORE_OLDER_ENTRY = "${{ inputs.restore-older-entry == 'true' && format('npm-{0}-{1}-', runner.os, runner.arch) || '' }}"
const NPM_SAVERS = {
  "test.yml: build": ["github.event_name != 'pull_request'", "${{ github.event_name == 'pull_request' }}"],
  "desktop-build.yml: build": ["runner.os == 'Windows' && github.ref == 'refs/heads/main'", "${{ !(runner.os == 'Windows' && github.ref == 'refs/heads/main') }}"],
}
const NPM_PRIMARY_KEY = "${{ steps.npm-cache.outputs.cache-primary-key }}"

// The inventory lines with the npm rule are the npm saves. The restore count holds the steps of each local action that the
// job calls, so a nested call of the npm action is a second restore. The restore step inside the npm action follows each
// call of that action, so the count leaves it out.
function checkNpmSaves(currentTree, inventory) {
  const saves = inventory.filter(({ rule }) => rule === "npm").map((line) => saveOf(currentTree, line.step))
  assert.deepEqual(saves.map(({ list }) => list.place).sort(), Object.keys(NPM_SAVERS).sort(), "the npm savers")
  const npmActionSteps = currentTree.actions.find(({ file }) => file === "restore-npm-cache/action.yml").steps
  for (const { step, where, list } of saves) {
    const [savesWhen, restoresOlderWhen] = NPM_SAVERS[list.place]
    assert.equal(step.uses, "actions/cache/save@v6", where)
    assert.equal(step.with.key, NPM_PRIMARY_KEY, where)
    assert.equal(step.if, `${savesWhen} && steps.npm-cache.outputs.cache-hit != 'true'`, where)
    assert.match(savesWhen, MAIN_ONLY, where)
    assert.equal(step.with.path, "${{ steps.npm-cache.outputs.path }}", where)
    const steps = list.entries.map((entry) => entry.step)
    const restores = steps.filter((candidate) => isNpmRestore(candidate) && !npmActionSteps.includes(candidate))
    assert.deepEqual(restores.map((candidate) => candidate.id), ["npm-cache"], `${where}: one npm restore in the job and its local actions`)
    assert.equal(restores[0].with?.["restore-older-entry"], restoresOlderWhen, `${where}: the restore before a save must be exact`)
    assert.ok(steps.indexOf(restores[0]) < steps.indexOf(step), where)
  }
  for (const list of cacheStepLists(currentTree).filter(({ place }) => !(place in NPM_SAVERS))) {
    for (const { step, where } of list.entries.filter((entry) => entry.step.uses === "./.github/actions/restore-npm-cache")) {
      assert.equal(step.with?.["restore-older-entry"], undefined, `${where} never saves, so it keeps the prefix fallback`)
    }
  }
}

test("each npm entry holds only the tarballs of its own lockfile, because a job that saves it restores no older entry", () => {
  const { inputs, runs } = load(".github/actions/restore-npm-cache/action.yml")
  assert.equal(inputs["restore-older-entry"].default, "true")
  assert.equal(runs.steps.find((step) => step.id === "restore").with["restore-keys"], RESTORE_OLDER_ENTRY)
  checkNpmSaves(tree, INVENTORY)
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
})

const SDK_PACKAGE_SCRIPT = ".github/scripts/install-android-sdk-package.sh"

test("every SDK manager install runs the shared retry script, and a change to it starts both Android jobs", () => {
  const escaped = SDK_PACKAGE_SCRIPT.replaceAll(".", "\\.")
  const installs = everyStep.filter(({ step }) => /sdkmanager|^ *bash \S*install-android-sdk-package/m.test(step.run ?? ""))
  assert.deepEqual(installs.map(({ where }) => where), [
    "mobile-build.yml: build: Install and verify the Android NDK",
    "android-boot/action.yml: Install and verify the emulator system image",
  ])
  for (const { step, where } of installs) {
    assert.match(step.run, new RegExp(`^ *bash ${escaped} "`, "m"), where)
    assert.doesNotMatch(step.run, /sdkmanager/, `${where} calls the SDK manager only through the shared script`)
  }
  const build = load(".github/workflows/mobile-build.yml")
  for (const event of ["pull_request", "push"]) assert.ok(build.on[event].paths.includes(SDK_PACKAGE_SCRIPT), `mobile-build.yml ${event}`)
  assert.ok(build.jobs.plan.steps.find((step) => step.id === "key").run.includes(`'${SDK_PACKAGE_SCRIPT}'`), "the compile pass key")
  const startup = load(".github/workflows/android-startup.yml")
  assert.ok(startup.on.pull_request.paths.includes(SDK_PACKAGE_SCRIPT), "android-startup.yml pull_request")
  const scope = startup.jobs.scope.steps
  assert.ok(scope.find((step) => step.id === "paths").run.includes(`|^${escaped}$|`), "the boot scope")
  assert.ok(scope.find((step) => step.id === "key").run.includes(`'${SDK_PACKAGE_SCRIPT}'`), "the boot pass key")
})

const NDK_VERSION = "27.1.12297006"
const ndkInstall = load(".github/workflows/mobile-build.yml").jobs.build.steps.find((step) => step.name === "Install and verify the Android NDK")

// Runs the NDK step of Mobile Android Build against a stand-in SDK manager. Each call records whether the
// partial NDK, the partial unzip in .temp and the partial archive in .downloadIntermediates exist when it starts.
function runNdkInstall(sdkmanagerScript) {
  const directory = mkdtempSync(join(tmpdir(), "ndk-install-"))
  try {
    const sdk = join(directory, "sdk")
    const bin = join(directory, "bin")
    mkdirSync(join(sdk, "cmdline-tools/latest/bin"), { recursive: true })
    mkdirSync(bin)
    const executable = (path, body) => {
      writeFileSync(path, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`)
      chmodSync(path, 0o755)
    }
    executable(join(sdk, "cmdline-tools/latest/bin/sdkmanager"), `ndk="$ANDROID_HOME/ndk/${NDK_VERSION}"
echo "$*" >> "$ANDROID_HOME/calls.txt"
attempt=$(($(wc -l < "$ANDROID_HOME/calls.txt")))
echo "ndk=$([ -e "$ndk" ] && echo yes || echo no) temp=$([ -e "$ANDROID_HOME/.temp" ] && echo yes || echo no) intermediates=$([ -e "$ANDROID_HOME/.downloadIntermediates" ] && echo yes || echo no)" >> "$ANDROID_HOME/states.txt"
${sdkmanagerScript}`)
    executable(join(bin, "sleep"), 'echo "$1" >> "$ANDROID_HOME/sleeps.txt"')
    const result = spawnSync("bash", ["-c", ndkInstall.run], {
      cwd: root,
      encoding: "utf8",
      env: { PATH: `${bin}:${process.env.PATH}`, ANDROID_HOME: sdk, NDK_VERSION, NDK_PATH: join(sdk, "ndk", NDK_VERSION) },
    })
    const read = (name) => (existsSync(join(sdk, name)) ? readFileSync(join(sdk, name), "utf8").trim().split("\n") : [])
    return { ...result, calls: read("calls.txt"), sleeps: read("sleeps.txt"), states: read("states.txt") }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

const leavePartialNdk = `mkdir -p "$ndk" "$ANDROID_HOME/.temp/PackageOperation01" "$ANDROID_HOME/.downloadIntermediates"
touch "$ANDROID_HOME/.downloadIntermediates/android-ndk-r27b-linux.zip"
echo "Pkg.Revision = ${NDK_VERSION}" > "$ndk/source.properties"`
const installNdk = (revisionLine, toolchainFile = "toolchain") => `mkdir -p "$ndk/build/cmake" "$ndk/toolchains/llvm/prebuilt/linux-x86_64/bin"
echo "${revisionLine}" > "$ndk/source.properties"
printf '%s' "${toolchainFile}" > "$ndk/build/cmake/android.toolchain.cmake"
printf '#!/usr/bin/env bash\\necho "clang version 18.0.2"\\n' > "$ndk/toolchains/llvm/prebuilt/linux-x86_64/bin/clang"
chmod +x "$ndk/toolchains/llvm/prebuilt/linux-x86_64/bin/clang"`

test("a corrupt NDK download and an NDK install that exits 0 without its files both start a clean attempt", () => {
  const result = runNdkInstall(`case "$attempt" in
  1) ${leavePartialNdk}; echo "Warning: An error occurred while preparing SDK package NDK: not in GZIP format." >&2; exit 1 ;;
  2) ${leavePartialNdk}; exit 0 ;;
esac
${installNdk(`Pkg.Revision = ${NDK_VERSION}`)}`)
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal(result.calls.length, 3, "the install that exited 0 without the toolchain file did not end the retries")
  assert.deepEqual(result.states, Array(3).fill("ndk=no temp=no intermediates=no"), "each attempt starts without the partial download")
  assert.deepEqual(result.sleeps, ["5", "10"])
  assert.match(result.stdout, new RegExp(`Installed and verified ndk;${NDK_VERSION} on attempt 3\\.`))
  assert.match(result.stdout, new RegExp(`Verified Android NDK ${NDK_VERSION} before Gradle\\.`))
})

// Each install exits 0 and leaves a compiler that runs, so only the two checks of the shared script can fail it.
for (const [name, install] of [
  ["an NDK with another revision", installNdk("Pkg.Revision = 27.0.11718014")],
  ["an NDK whose revision only starts with the version", installNdk(`Pkg.Revision = ${NDK_VERSION}1`)],
  ["an NDK whose revision line has text before the expected line", installNdk(`Old.Pkg.Revision = ${NDK_VERSION}`)],
  ["an NDK with an empty toolchain file", installNdk(`Pkg.Revision = ${NDK_VERSION}`, "")],
]) {
  test(`${name} counts as failed, and four failed attempts stop the step before Gradle`, () => {
    const result = runNdkInstall(install)
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.equal(result.calls.length, 4)
    assert.deepEqual(result.states, Array(4).fill("ndk=no temp=no intermediates=no"))
    assert.deepEqual(result.sleeps, ["5", "10", "15"])
    assert.match(result.stdout, new RegExp(`::error::ndk;${NDK_VERSION} did not install in 4 attempts\\.`))
    assert.doesNotMatch(result.stdout, /before Gradle\./)
  })
}

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

// How the sweep matches each expression of a release cache key. hashFiles gives a 64-digit hex SHA-256, as in the
// npm-, windows-app-sdk- and ccache- keys of fixtures/actions-caches.json; run_id is a number; runner.arch is X86, X64,
// ARM or ARM64 (https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#runner-context), ARM64 in the
// macos-26 keys of the same list.
const KEY_EXPRESSIONS = [[/^hashFiles\(/, "[0-9a-f]{64}"], [/^github\.run_id$/, "\\d+"], [/^runner\.arch$/, "[A-Z0-9]+"]]
const escapeLiteral = (text) => text.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&")
function keyPattern(template) {
  const parts = template.split(/\$\{\{\s*(.+?)\s*\}\}/)
  const source = parts.map((part, index) => {
    if (index % 2 === 0) return escapeLiteral(part)
    const match = KEY_EXPRESSIONS.find(([expression]) => expression.test(part))
    assert.ok(match, `no sweep pattern for the key expression ${part}`)
    return match[1]
  })
  return `^${source.join("")}$`
}

// A release is a dispatch with no bound on its gap, so the sweep keeps the newest main entry of each family that a
// release saves whatever its last read. The local actions that a release calls save only the NSIS tools entry above.
test("the sweep keeps the newest main entry of every cache family that a release saves, matched on the full key", () => {
  const releaseSaves = everyStep.filter(({ file, step }) => /(^|-)release\.yml$/.test(file) && /^actions\/cache(\/save)?@/.test(step.uses ?? ""))
  assert.deepEqual(releaseSaves.map(({ where }) => where).sort(), [
    "android-release.yml: release-android: Restore the ccache directory",
    "ios-release.yml: release: Save compiler outputs",
  ])
  const keyOf = ({ file, job, step }) => {
    const primary = /^\$\{\{ steps\.([\w-]+)\.outputs\.cache-primary-key \}\}$/.exec(step.with.key)
    if (!primary) return step.with.key
    return load(`.github/workflows/${file}`).jobs[job].steps.find((candidate) => candidate.id === primary[1]).with.key
  }
  assert.deepEqual(releaseSaves.map((save) => keyPattern(keyOf(save))).sort(), RELEASE_FAMILY_KEYS.map((pattern) => pattern.source).sort())
})

// ccache at v4.9.1 (the Ubuntu 24.04 package), src/storage/local/LocalStorage.cpp, and at v4.14.2 (Homebrew),
// src/ccache/storage/local/localstorage.cpp: a read sets the time of the object ("Update modification timestamp to save
// file from LRU cleanup"), --evict-older-than removes each file whose time is not after now minus the age, and the
// automatic cleanup starts only above max_size (2 GB in these jobs). So a save after a restore by prefix stores the
// objects of the older inputs too, and the entry grows with each key change until the evict step removes them.
const COMPILER_CACHE_STAMP = 'echo "COMPILER_CACHE_USED_SINCE=$(date +%s)" >> "$GITHUB_ENV"'
const COMPILER_CACHE_EVICT = 'ccache --evict-older-than "$(($(date +%s) - COMPILER_CACHE_USED_SINCE))s"'
const SAVES_A_PASSING_MAIN_COMPILE = "github.ref == 'refs/heads/main' && steps.compiler-cache.outputs.cache-hit != 'true'"
const COMPILER_CACHE_SAVERS = {
  "mobile-build.yml: build": ["compile", `\${{ env.CCACHE_AVAILABLE == 'true' && steps.compile.outcome == 'success' && ${SAVES_A_PASSING_MAIN_COMPILE} }}`],
  "android-release.yml: release-android": ["Build signed AAB with Gradle", "env.CCACHE_AVAILABLE == 'true'"],
  "ios-build.yml: compile": ["compile", `\${{ steps.compile.outcome == 'success' && ${SAVES_A_PASSING_MAIN_COMPILE} }}`],
  "ios-release.yml: release": ["archive", `steps.archive.outcome == 'success' && ${SAVES_A_PASSING_MAIN_COMPILE}`],
}
const isCompilerCache = (step) => /ccache/i.test(step.with?.path ?? "")

function checkCompilerCaches(currentTree) {
  const saves = currentTree.workflows.flatMap(({ file, jobs }) => Object.entries(jobs).flatMap(([job, { steps = [] }]) => steps
    .filter((step) => savesACache(step) && isCompilerCache(step)).map((step) => ({ step, steps, place: `${file}: ${job}`, where: `${file}: ${job}: ${step.name ?? step.uses}` }))))
  assert.deepEqual(saves.map(({ place }) => place).sort(), Object.keys(COMPILER_CACHE_SAVERS).sort(), "the compiler cache savers")
  for (const { step: save, steps, place, where } of saves) {
    const [compileStep, evictWhen] = COMPILER_CACHE_SAVERS[place]
    const restore = steps.findIndex((step) => restoresACache(step) && isCompilerCache(step))
    assert.ok(steps[restore].with["restore-keys"].trim().length > 0, `${where}: the job restores an older entry by prefix`)
    const stamp = steps.findIndex((step) => step.run === COMPILER_CACHE_STAMP)
    const compile = steps.findIndex((step) => step.id === compileStep || step.name === compileStep)
    const evicts = steps.filter((step) => step.run?.includes("--evict-older-than"))
    assert.equal(evicts.length, 1, `${where}: one step removes the objects that the compile did not use`)
    assert.equal(evicts[0].run, COMPILER_CACHE_EVICT, where)
    assert.equal(evicts[0].if, evictWhen, `${where}: only a passing compile used every object it needs`)
    assert.equal(steps[stamp]?.if, undefined, `${where}: the stamp step always runs`)
    const evict = steps.indexOf(evicts[0])
    assert.ok(restore < stamp && stamp < compile && compile < evict, `${where}: restore, then the stamp, then the compile, then the evict step`)
    if (/^actions\/cache\/save@/i.test(save.uses)) assert.ok(evict < steps.indexOf(save), `${where}: the evict step runs before the save`)
  }
}

test("each compiler cache entry holds only the objects that its own compile used, so a key change does not grow it", () => {
  checkCompilerCaches(tree)
})

// The steps of a local action run in the job that calls it, so each call is followed by the steps of its action.
function withActionSteps(steps, actionSteps, callers = []) {
  return steps.flatMap((step) => {
    const entry = { step, action: callers.at(-1) }
    if (!step.uses?.startsWith("./")) return [entry]
    const action = step.uses.replace(/\/+$/, "")
    assert.ok(actionSteps[action] !== undefined && !callers.includes(action), `${step.uses}: the guard must read the steps of each local action`)
    return [entry, ...withActionSteps(actionSteps[action], actionSteps, [...callers, action])]
  })
}

// Each job with the steps of its local actions, and each local action as a list of its own. A step that a local action
// holds carries the name of its action file.
function cacheStepLists({ workflows: workflowList, actions: actionList }) {
  const actionSteps = Object.fromEntries(actionList.map(({ file, steps }) => [`./.github/actions/${dirname(file)}`, steps]))
  const listOf = (place, steps) => ({
    place,
    entries: withActionSteps(steps, actionSteps).map(({ step, action }) =>
      ({ step, action, where: `${place}: ${action ? `${action.replace("./.github/actions/", "")}/action.yml: ` : ""}${step.name ?? step.uses}` })),
  })
  return [
    ...workflowList.flatMap(({ file, jobs }) => Object.entries(jobs).map(([job, { steps = [] }]) => listOf(`${file}: ${job}`, steps))),
    ...actionList.map(({ file, steps }) => listOf(file, steps)),
  ]
}
const cacheSaves = (currentTree) => cacheStepLists(currentTree)
  .flatMap((list) => list.entries.filter(({ step }) => savesACache(step)).map((entry) => ({ ...entry, list })))
const saveOf = (currentTree, where) => cacheSaves(currentTree).find((save) => save.where === where)
const hasNoRestoreKeys = (step) => String(step.with?.["restore-keys"] ?? "").trim() === ""
const PRIMARY_KEY = /^\$\{\{ steps\.([\w-]+)\.outputs\.cache-primary-key \}\}$/

// The rule of each inventory line, and the check that the save step and its job follow it. A new rule is a change to this
// file, so a reviewer reads its reason.
const RULES = {
  // The key changes only with the inputs of the pass, and SMALL_ENTRIES holds the size of each marker.
  "pass marker": ({ step, where }) => assert.match(step.with.key, /^\$\{\{ needs\.(plan|scope)\.outputs\.pass-key \}\}$/, where),
  // The post step of a combined step saves its own key after a miss. The next run restores that key, so nobody writes it again.
  "combined step with an exact key": ({ step, where }) => {
    assert.match(step.uses, /^actions\/cache@/i, where)
    assert.ok(hasNoRestoreKeys(step), `${where}: a combined step with restore-keys saves an older entry under a new key`)
  },
  // The save writes the key of a restore of the same path with no restore-keys, as its text or as the primary key output
  // of that restore. The next run restores that key, so nobody writes it again.
  "the key of an exact restore": ({ step, where, list }) => {
    const id = PRIMARY_KEY.exec(step.with.key)?.[1]
    const restore = list.entries.map((entry) => entry.step).find((candidate) => restoresACache(candidate) && candidate !== step &&
      (id === undefined ? candidate.with?.key === step.with.key : candidate.id === id))
    assert.ok(restore, `${where}: no restore in the job has this key`)
    assert.equal(restore.with.path, step.with.path, `${where}: the restore of the key has the same path`)
    assert.ok(hasNoRestoreKeys(restore), `${where}: the restore of the key has no restore-keys`)
  },
  npm: ({ list, where }) => assert.ok(list.place in NPM_SAVERS, `${where}: NPM_SAVERS names the job`),
  "the evict step": ({ list, where }) => assert.ok(list.place in COMPILER_CACHE_SAVERS, `${where}: COMPILER_CACHE_SAVERS names the job`),
  // next/dist/compiled/webpack/bundle5.js sets the filesystem cache default maxAge to 1e3*60*60*24*60, and
  // next/dist/build/webpack-config.js does not change it: webpack removes an item that no build read for 60 days.
  "the webpack maxAge of 60 days": ({ step, where }) => assert.equal(step.with.path, "apps/web/.next/cache", where),
  // Turbo keeps each result at .turbo/cache/<hash>.tar.zst with two JSON files and never removes one.
  "the delete of Turbo results older than 30 days": ({ step, where, list }) => {
    const steps = list.entries.map((entry) => entry.step)
    const before = steps[steps.indexOf(step) - 1]
    assert.equal(step.with.path, ".turbo", where)
    assert.equal(before?.run, "find .turbo/cache -type f -mtime +30 -delete", `${where}: the step before the save deletes the Turbo results older than 30 days`)
    assert.equal(before.if, step.if, `${where}: the delete step runs on each run that saves`)
  },
}

// Each actions/cache and actions/cache/save step, in each job and each local action, has one inventory line. The line pins
// the path, the key, each cache restore of the same job and the rule that bounds the entry. The guard never decides that
// two paths are apart and reads no env value, so a new save step or a new restore beside a save needs a reviewed line.
function cacheGuard(currentTree, inventory, rules = RULES) {
  const saves = cacheSaves(currentTree)
  const names = saves.map(({ where }) => where)
  assert.deepEqual(names.filter((name, index) => names.indexOf(name) !== index), [], "each cache save step has a name of its own in its job")
  const lines = new Map(inventory.map((line) => [line.step, line]))
  assert.equal(lines.size, inventory.length, "each inventory line names another step")
  assert.deepEqual(names.filter((name) => !lines.has(name)), [], `a cache save step with no line in ${INVENTORY_FILE}`)
  assert.deepEqual([...lines.keys()].filter((name) => !names.includes(name)), [], `a line in ${INVENTORY_FILE} that matches no cache save step`)
  for (const save of saves) {
    const line = lines.get(save.where)
    assert.equal(save.step.with?.path, line.path, `${save.where}: the path differs from its inventory line`)
    assert.equal(save.step.with?.key, line.key, `${save.where}: the key differs from its inventory line`)
    assert.deepEqual(save.list.entries.filter(({ step }) => restoresACache(step)).map(({ where }) => where), line.restores,
      `${save.where}: the cache restores of its job differ from its inventory line`)
    assert.ok(Object.hasOwn(rules, line.rule), `${save.where}: the rule "${line.rule}" is not in RULES`)
    rules[line.rule](save)
  }
  checkCompilerCaches(currentTree)
  checkNpmSaves(currentTree, inventory)
}

test("every cache save step has an inventory line with its path, its key, the restores of its job and a rule that bounds its entry", () => {
  cacheGuard(tree, INVENTORY)

  // gradle/actions at 8da46b539cd8fe6ab27ca75128919a18d757604c, setup-gradle/action.yml: cache-cleanup defaults to
  // on-success, which removes the unused files of the Gradle User Home before the save. Swatinem/rust-cache at
  // d1527c8f67ef9af357290475d4af4b0fab8f12e0, src/save.ts: cleanTargetDir, cleanRegistry and cleanGit run before saveCache.
  for (const { step, where } of uses("gradle/actions/setup-gradle@")) {
    for (const input of ["cache-cleanup", "gradle-home-cache-cleanup"]) assert.equal(step.with?.[input], undefined, `${where}: ${input}`)
  }
})

// Each case changes the real text of a workflow or adds a local action, in memory. Each one fails the guard with the
// committed inventory, for the reason that its pattern names. When a workflow edit removes the text that a case replaces,
// only that case fails, and the main guard test still reports the real tree.
const changeText = (path, ...replacements) => {
  let text = readFileSync(join(root, path), "utf8")
  for (const [from, to] of replacements) {
    if (!text.includes(from)) return { [MISSING_TEXT]: `${path} no longer holds the text that the case replaces: ${from.trim().split("\n")[0]}` }
    text = text.replace(from, to)
  }
  return { [path]: text }
}
const newAction = (directory, steps) => ({ [`.github/actions/${directory}/action.yml`]: `name: ${directory}\ndescription: ${directory}\nruns:\n  using: composite\n  steps:\n${steps}` })

const TYPE_CHECK_RUN = "      - run: npx turbo run type-check\n"
const WORKSPACE_ENV = "      ARTIFACT_NAME: workspace-unit-coverage-attempt-${{ github.run_attempt }}\n"
const WORKSPACE_RUN = "      - name: Run workspaces with coverage thresholds\n"
const EVICT_RUN = 'run: ccache --evict-older-than "$(($(date +%s) - COMPILER_CACHE_USED_SINCE))s"'
const STAMP_STEP = `      # The stamp follows the restore, so every restored object is older than it.
      - name: Record the start of the compiler cache use
        run: echo "COMPILER_CACHE_USED_SINCE=$(date +%s)" >> "$GITHUB_ENV"
`
const ANDROID_RELEASE_EVICT = `      - name: Keep only the objects that this build used
        if: env.CCACHE_AVAILABLE == 'true'
        ${EVICT_RUN}
`
const IOS_BUILD_EVICT = `      - name: Keep only the objects that this compile used
        if: \${{ steps.compile.outcome == 'success' && github.ref == 'refs/heads/main' && steps.compiler-cache.outputs.cache-hit != 'true' }}
        ${EVICT_RUN}
`
const TURBO_DELETE = `      - name: Remove the Turbo results that are older than 30 days
        if: github.event_name != 'pull_request'
        run: find .turbo/cache -type f -mtime +30 -delete
`
const restoreStep = (name, path, key, restoreKeys, id) => `      - name: ${name}
${id ? `        id: ${id}\n` : ""}        uses: actions/cache/restore@v6
        with:
          path: ${path}
          key: ${key}
${restoreKeys ? `          restore-keys: |\n            ${restoreKeys}\n` : ""}`
const saveStep = (name, path, key) => `      - name: ${name}
        if: github.event_name != 'pull_request'
        uses: actions/cache/save@v6
        with:
          path: ${path}
          key: ${key}
`
const ESLINT_KEY = "eslint-${{ github.sha }}"
const typeCheckAround = (before, after) => changeText(".github/workflows/test.yml", [TYPE_CHECK_RUN, `${before}${TYPE_CHECK_RUN}${after}`])
const workspaceTestsWith = (envValue, steps) => changeText(".github/workflows/test.yml",
  [WORKSPACE_ENV, `${WORKSPACE_ENV}      STYLE_CACHE: ${envValue}\n`], [WORKSPACE_RUN, `${steps}${WORKSPACE_RUN}`])
const STYLE_PREFIX_RESTORE = restoreStep("Restore stylelint", ".stylelintcache", "stylelint-${{ github.sha }}", "stylelint-")
const STYLE_ENV_SAVE = saveStep("Save stylelint", "${{ env.STYLE_CACHE }}", "stylelint-${{ github.sha }}")

const NO_LINE = /a cache save step with no line/
const MUTATIONS = [
  ["M1 the android-release evict step deleted", changeText(".github/workflows/android-release.yml", [ANDROID_RELEASE_EVICT, ""]), /one step removes the objects/],
  ["M2 the ios-build stamp moved before the restore", changeText(".github/workflows/ios-build.yml", [STAMP_STEP, ""],
    ["      - name: Install the compiler cache\n", `${STAMP_STEP.split("\n").slice(1).join("\n")}      - name: Install the compiler cache\n`]), /restore, then the stamp/],
  ["M3 the mobile-build stamp gets a condition", changeText(".github/workflows/mobile-build.yml", ["      - name: Record the start of the compiler cache use\n        run:",
    "      - name: Record the start of the compiler cache use\n        if: env.CCACHE_AVAILABLE == 'true'\n        run:"]), /the stamp step always runs/],
  ["M4 the ios-release evict condition loses the archive outcome", changeText(".github/workflows/ios-release.yml",
    ["      - name: Keep only the objects that this archive used\n        if: steps.archive.outcome == 'success' && ", "      - name: Keep only the objects that this archive used\n        if: always() && "]), /only a passing compile/],
  ["M5 the mobile-build evict step runs after a failed compile", changeText(".github/workflows/mobile-build.yml",
    [`env.CCACHE_AVAILABLE == 'true' && steps.compile.outcome == 'success' && github.ref == 'refs/heads/main' && steps.compiler-cache.outputs.cache-hit != 'true' }}\n        ${EVICT_RUN}`,
      `always() && env.CCACHE_AVAILABLE == 'true' && steps.compile.outcome != 'skipped' && github.ref == 'refs/heads/main' && steps.compiler-cache.outputs.cache-hit != 'true' }}\n        ${EVICT_RUN}`]), /only a passing compile/],
  ["M6 the android-release evict step moved before the Gradle build", changeText(".github/workflows/android-release.yml", [ANDROID_RELEASE_EVICT, ""],
    ["      - name: Build signed AAB with Gradle\n", `${ANDROID_RELEASE_EVICT}      - name: Build signed AAB with Gradle\n`]), /restore, then the stamp, then the compile, then the evict step/],
  ["M7 the Turbo delete step deleted", changeText(".github/workflows/test.yml", [TURBO_DELETE, ""]), /deletes the Turbo results older than 30 days/],
  ["M8 the Turbo delete step deletes the new results", changeText(".github/workflows/test.yml", ["-mtime +30 -delete", "-mtime -30 -delete"]), /deletes the Turbo results older than 30 days/],
  ["M9 the Turbo delete step runs on pull requests too", changeText(".github/workflows/test.yml",
    [TURBO_DELETE, TURBO_DELETE.replace("        if: github.event_name != 'pull_request'\n", "")]), /the delete step runs on each run that saves/],
  ["M10 the ios-build evict step after the save", changeText(".github/workflows/ios-build.yml", [IOS_BUILD_EVICT, ""],
    ["      - name: Report compiler cache statistics\n", `${IOS_BUILD_EVICT}      - name: Report compiler cache statistics\n`]), /the evict step runs before the save/],
  ["M11 a new prefix restore saved under its primary key", typeCheckAround(restoreStep("Restore eslint", ".eslintcache", ESLINT_KEY, "eslint-", "eslint-cache"),
    saveStep("Save eslint", ".eslintcache", "${{ steps.eslint-cache.outputs.cache-primary-key }}")), NO_LINE],
  ["M13 a new prefix restore saved under a literal key", typeCheckAround(restoreStep("Restore eslint", ".eslintcache", ESLINT_KEY, "eslint-"),
    saveStep("Save eslint", ".eslintcache", ESLINT_KEY)), NO_LINE],
  ["M14 an npm save under a literal key in a job that restores by prefix", typeCheckAround("", saveStep("Save npm", "~/.npm", "npm-${{ github.sha }}")), NO_LINE],
  ["M15 restore-keys on the combined step of a local action", changeText(".github/actions/desktop-nsis-tools/action.yml",
    ["        key: ${{ runner.os }}-nsis-tools-${{ hashFiles('apps/desktop/src-tauri/native/windows/nsis-tools.json') }}\n",
      "        key: ${{ runner.os }}-nsis-tools-${{ hashFiles('apps/desktop/src-tauri/native/windows/nsis-tools.json') }}\n        restore-keys: |\n          ${{ runner.os }}-nsis-tools-\n"]),
  /a combined step with restore-keys/],
  ["M16 a save of the restored path through the workspace expression", typeCheckAround(restoreStep("Restore eslint", ".eslintcache", ESLINT_KEY, "eslint-"),
    saveStep("Save eslint", "${{ github.workspace }}/.eslintcache", ESLINT_KEY)), NO_LINE],
  ["M16b a save of another restored path through the workspace expression", typeCheckAround(restoreStep("Restore prettier", ".prettiercache", "prettier-${{ github.sha }}", "prettier-"),
    saveStep("Save prettier", "${{ github.workspace }}/.prettiercache", "prettier-${{ github.sha }}")), NO_LINE],
  ["M16c a save of the plain restored path", typeCheckAround(restoreStep("Restore prettier", ".prettiercache", "prettier-${{ github.sha }}", "prettier-"),
    saveStep("Save prettier", ".prettiercache", "prettier-${{ github.sha }}")), NO_LINE],
  ["M17 a glob save of the restored path", typeCheckAround(restoreStep("Restore eslint", "apps/web/.eslintcache", ESLINT_KEY, "eslint-"),
    saveStep("Save eslint", "apps/*/.eslintcache", ESLINT_KEY)), NO_LINE],
  ["M18 a second ccache save under a literal key", changeText(".github/workflows/ios-build.yml", ["      - name: Report compiler cache statistics\n",
    `${saveStep("Save ccache again", "${{ env.CCACHE_DIR }}", "extra-${{ github.sha }}").replace("github.event_name != 'pull_request'", "github.ref == 'refs/heads/main'")}      - name: Report compiler cache statistics\n`]), NO_LINE],
  ["M19b a prefix restore in a new local action and a save in the job", {
    ...newAction("restore-prettier", restoreStep("Restore prettier", ".prettiercache", "prettier-${{ github.sha }}", "prettier-").replace(/^ {6}/gm, "    ")),
    ...typeCheckAround("      - uses: ./.github/actions/restore-prettier\n", saveStep("Save prettier", ".prettiercache", "prettier-${{ github.sha }}")),
  }, NO_LINE],
  ["M20 a restore with no restore-keys and a save under a longer key", typeCheckAround(restoreStep("Restore stylelint", ".stylelintcache", "stylelint-${{ runner.os }}"),
    saveStep("Save stylelint", ".stylelintcache", "stylelint-${{ runner.os }}-${{ github.sha }}")), NO_LINE],
  ["M21 an npm prefix restore through a nested local action in a job that saves the npm cache", {
    ...newAction("setup-workspace", "    - uses: ./.github/actions/restore-npm-cache\n"),
    ...changeText(".github/workflows/test.yml", ["      - id: npm-cache\n        uses: ./.github/actions/restore-npm-cache\n        with:\n          restore-older-entry: ${{ github.event_name == 'pull_request' }}\n",
      "      - uses: ./.github/actions/setup-workspace\n      - id: npm-cache\n        uses: ./.github/actions/restore-npm-cache\n        with:\n          restore-older-entry: ${{ github.event_name == 'pull_request' }}\n"]),
  }, /the cache restores of its job differ/],
  ["M22 a save in a local action of an env path that the calling step sets", {
    ...newAction("save-style", STYLE_ENV_SAVE.replace(/^ {6}/gm, "    ")),
    ...workspaceTestsWith(".stylecache-unused", `${STYLE_PREFIX_RESTORE}      - if: github.event_name != 'pull_request'\n        uses: ./.github/actions/save-style\n        env:\n          STYLE_CACHE: .stylelintcache\n`),
  }, NO_LINE],
  ["M23 a save of an env path that a script changes through GITHUB_ENV", workspaceTestsWith(".stylecache-unused",
    `${STYLE_PREFIX_RESTORE}      - run: node .github/scripts/set-style-cache.mjs\n${STYLE_ENV_SAVE}`), NO_LINE],
]

for (const [name, changes, reason] of MUTATIONS) {
  test(`the guard fails on ${name}`, () => {
    assert.throws(() => cacheGuard(readTree(changes), INVENTORY), reason)
  })
}

// The inventory of a tree after a review: the committed lines with the restores of each job now, and one line for each new
// save step under a rule that the review adds.
function reviewedInventory(currentTree) {
  const committed = new Map(INVENTORY.map((line) => [line.step, line]))
  return cacheSaves(currentTree).map(({ step, where, list }) => ({
    step: where,
    path: step.with?.path,
    key: step.with?.key,
    restores: list.entries.filter((entry) => restoresACache(entry.step)).map((entry) => entry.where),
    rule: committed.get(where)?.rule ?? "a reviewed bound",
  }))
}

test("a reviewed inventory line is the only way to make a new save step pass, and a line that differs from its step fails", () => {
  const rules = { ...RULES, "a reviewed bound": () => {} }
  for (const [name, changes] of MUTATIONS.filter(([name, , reason]) => reason === NO_LINE && !name.startsWith("M18 "))) {
    const changed = readTree(changes)
    const inventory = reviewedInventory(changed)
    assert.doesNotThrow(() => cacheGuard(changed, inventory, rules), name)
    const added = inventory.findIndex((line) => line.rule === "a reviewed bound")
    for (const [field, value] of [["path", "other"], ["key", "other"], ["restores", []]]) {
      const wrong = inventory.map((line, index) => index === added ? { ...line, [field]: value } : line)
      assert.throws(() => cacheGuard(changed, wrong, rules), /differs from its inventory line|differ from its inventory line/, `${name}: ${field}`)
    }
    assert.throws(() => cacheGuard(changed, inventory.filter((line, index) => index !== added), rules), NO_LINE, name)
  }
  // A second ccache saver and a nested npm restore fail their own rules, whatever the inventory holds.
  for (const [name, changes] of MUTATIONS.filter(([name]) => /^M(18|21) /.test(name))) {
    const changed = readTree(changes)
    assert.throws(() => cacheGuard(changed, reviewedInventory(changed), rules), /the compiler cache savers|one npm restore in the job/, name)
  }
})

test("a restore in a job with no save needs no line, and a restore beside a save needs the changed line", () => {
  const restoreOnly = (changes) => () => cacheGuard(readTree(changes), INVENTORY)
  assert.doesNotThrow(restoreOnly(workspaceTestsWith(".stylelintcache", STYLE_PREFIX_RESTORE)))
  assert.throws(restoreOnly(typeCheckAround(restoreStep("Restore eslint", ".eslintcache", ESLINT_KEY, "eslint-"), "")), /Save turbo: the cache restores of its job differ/)
})

test("the inventory has one JSON line for each save step, with the five fields and a rule from RULES", () => {
  const text = readFileSync(join(root, INVENTORY_FILE), "utf8")
  assert.ok(text.endsWith("}\n") && !text.includes("\n\n"), "one line for each step and a final newline")
  for (const line of INVENTORY) {
    assert.deepEqual(Object.keys(line), ["step", "path", "key", "restores", "rule"], line.step)
    assert.ok(Object.hasOwn(RULES, line.rule), `${line.step}: ${line.rule}`)
  }
})

test("the cache tests run in the hook tests job, and the restore action exists for every caller", () => {
  const run = load(".github/workflows/test.yml").jobs["hook-tests"].steps.map((step) => step.run ?? "").join("\n")
  for (const file of ["cache-save-rules.test.mjs", "sweep-actions-caches.test.mjs", "android-boot-action.test.mjs"]) {
    assert.ok(run.includes(`.github/scripts/${file}`), file)
  }
  assert.ok(existsSync(join(root, ".github/actions/restore-npm-cache/action.yml")))
})
