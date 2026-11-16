import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import yaml from "js-yaml"
import { RELEASE_FAMILY_KEYS } from "./sweep-actions-caches.mjs"
import {
  MISSING_TEXT, REMOTE_INVENTORY_FILE, STEP_INVENTORY_FILE, actionName, cacheStepLists, cacheSteps, lineOf, readInventory,
  readTree, remoteActions, restoresACache, root, savesACache,
} from "./cache-inventory.mjs"

const load = (path) => yaml.load(readFileSync(join(root, path), "utf8"))
const tree = readTree()
const { workflows, actions } = tree
const everyStep = [
  ...workflows.flatMap(({ file, jobs }) => Object.entries(jobs).flatMap(([job, { steps = [] }]) =>
    steps.map((step) => ({ step, where: `${file}: ${job}: ${step.name ?? step.uses ?? step.run}`, file, job })))),
  ...actions.flatMap(({ file, steps }) => steps.map((step) => ({ step, where: `${file}: ${step.name ?? step.uses ?? step.run}`, file, job: "action" }))),
]
const uses = (name) => everyStep.filter(({ step }) => actionName(step.uses) === name)
// The cache step inventory has one JSON object on each line; the remote inventory names each remote action and whether it can cache.
const INVENTORY = readInventory(STEP_INVENTORY_FILE)
const REMOTE_INVENTORY = readInventory(REMOTE_INVENTORY_FILE)

const NPM_KEY = /^npm-\$\{\{ runner\.os \}\}-\$\{\{ runner\.arch \}\}-\$\{\{ hashFiles\((inputs\.lockfile|'[\w./-]*package-lock\.json')\) \}\}$/
const isNpmRestore = (step) => step.uses === "./.github/actions/restore-npm-cache" ||
  (actionName(step.uses) === "actions/cache/restore" && NPM_KEY.test(step.with.key))

const inlineNpmRestores = () => uses("actions/cache/restore").filter(({ step, where }) => NPM_KEY.test(step.with.key) && !where.startsWith("restore-npm-cache/"))
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
  const ndkCaches = [...uses("actions/cache/restore"), ...uses("actions/cache/save"), ...uses("actions/cache")]
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
  const steps = uses("gradle/actions/setup-gradle")
  assert.equal(steps.length, 3)
  const writers = []
  for (const { step, where, file } of steps) {
    assert.equal(step.uses, "gradle/actions/setup-gradle@8da46b539cd8fe6ab27ca75128919a18d757604c", where)
    const events = workflows.find((workflow) => workflow.file === file).on
    const pullRequestOnly = events.every((event) => event === "pull_request")
    if (step.with?.["cache-read-only"] !== true && !pullRequestOnly) writers.push(where)
  }
  assert.deepEqual(writers, ["mobile-build.yml: build: Set up Gradle caching"])
  const build = steps.find(({ file }) => file === "mobile-build.yml").step
  assert.equal(build.with?.["cache-read-only"], undefined, "Mobile Android Build keeps the default: write on main, read elsewhere")
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
  const releaseSaves = everyStep.filter(({ file, step }) => /(^|-)release\.yml$/.test(file) && savesACache(step))
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

const saveOf = (currentTree, where) => cacheSteps(currentTree, REMOTE_INVENTORY).find((save) => save.where === where)
const hasNoRestoreKeys = (step) => String(step.with?.["restore-keys"] ?? "").trim() === ""
const PRIMARY_KEY = /^\$\{\{ steps\.([\w-]+)\.outputs\.cache-primary-key \}\}$/
const assertNoInputs = (step, where, inputs) => {
  for (const input of inputs) assert.equal(step.with?.[input], undefined, `${where}: ${input}`)
}

// The rule of each inventory line, and the check that the cache step and its job follow it. A new rule is a change to this
// file, so a reviewer reads its reason. The line pins the whole step and its job, so a rule checks only why the entry stays bounded.
const RULES = {
  // The key changes only with the inputs of the pass. Each marker is under 300 bytes (229 and 232 bytes in
  // GET /repos/{owner}/{repo}/actions/caches), far under the 5 MB bound of LARGE_ENTRY_BYTES in sweep-actions-caches.mjs.
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
  // actions/setup-node at 949feb2413d6458794dcd2491c4babbbce0c15c1 (v7), src/cache-save.ts: the post step saves the
  // npm cache from every ref on a key miss, and the action has no input that restores without a save.
  "setup-node with no package manager cache": ({ step, where }) => {
    assert.equal(step.with?.["package-manager-cache"], false, where)
    assertNoInputs(step, where, ["cache", "cache-dependency-path"])
  },
  // actions/setup-java at v6, action.yml: cache-jdk is on only when cache is set, and cache-path and cache-dependency-path
  // apply only with cache.
  "setup-java with no cache": ({ step, where }) => assertNoInputs(step, where, ["cache", "cache-jdk", "cache-path", "cache-dependency-path"]),
  // gradle/actions at 8da46b539cd8fe6ab27ca75128919a18d757604c, setup-gradle/action.yml: cache-cleanup defaults to
  // on-success, which removes the unused files of the Gradle User Home before the save. The writer test below holds the
  // cache-read-only input of each step.
  "one Gradle writer with the default cleanup": ({ step, where }) =>
    assertNoInputs(step, where, ["cache-write-only", "cache-disabled", "cache-cleanup", "gradle-home-cache-cleanup", "cache-overwrite-existing"]),
  // Swatinem/rust-cache at d1527c8f67ef9af357290475d4af4b0fab8f12e0: action.yml save-if decides whether the post step saves,
  // src/save.ts saves only when the lowercased input is "true", and cleanTargetDir, cleanRegistry and cleanGit run before
  // saveCache. Each target is one key family that Desktop Build writes, so a release of an older commit or another
  // environment would make the sweep delete the Desktop Build entry.
  "one Rust writer": ({ step, where, list }) =>
    assert.equal(step.with["save-if"], list.place.startsWith("desktop-build.yml: ") ? "${{ github.ref == 'refs/heads/main' }}" : "false", where),
  // docker/setup-buildx-action at f87e5991a6d7451dcb8d9637bfbc97413f497069 (v4), src/main.ts:53: the action downloads, and
  // with cache-binary caches, buildx only when the runner has none, a version is set or the driver is cloud. The Ubuntu
  // runner image has buildx.
  "the buildx of the runner image": ({ step, where }) => {
    assertNoInputs(step, where, ["version"])
    assert.notEqual(step.with?.driver, "cloud", where)
  },
  // docker/build-push-action at c3c9e263c25d99ce0380d002d59b67737d91b0dc (v7), action.yml: only cache-to exports a build cache.
  "no build cache export": ({ step, where }) => assertNoInputs(step, where, ["cache-to"]),
  // github/codeql-action at 33d7b85da1a04171e211befe2c739303b9a4c066: src/caching-utils.ts getCachingKind gives no dependency
  // cache for an unset input, and src/trap-caching.ts uploadTrapCaches saves only from the default branch. Cache Budget
  // deletes each overlay base database that a newer one replaced, then the older main entries above 5 MB.
  "CodeQL saves only on main": ({ step, where }) => assertNoInputs(step, where, ["dependency-caching", "trap-caching"]),
}

// The fields of a line and the text of a failure when the tree differs from one of them.
const PINNED_FIELDS = {
  cacheStep: "the cache step differs",
  calls: "the call steps differ",
  restores: "the restores of its job differ",
  context: "the context of its job differs",
}

// Each remote action has a line in the remote inventory. Each step that can write the Actions cache, in each job and each
// local action, has one line in the step inventory, and the line equals the step, its call steps, the cache restores of its
// job and the context of its job as canonical JSON. A change to any of them fails until a reviewed line changes.
function cacheGuard(currentTree, inventory, rules = RULES, remoteInventory = REMOTE_INVENTORY) {
  const listed = new Set(remoteInventory.map(({ action }) => action))
  assert.deepEqual(remoteActions(currentTree).filter((name) => !listed.has(name)), [], `a remote action with no line in ${REMOTE_INVENTORY_FILE}`)
  const saves = cacheSteps(currentTree, remoteInventory)
  const names = saves.map(({ where }) => where)
  assert.deepEqual(names.filter((name, index) => names.indexOf(name) !== index), [], "each cache step has a name of its own in its job")
  const lines = new Map(inventory.map((line) => [line.step, line]))
  assert.equal(lines.size, inventory.length, "each inventory line names another step")
  assert.deepEqual(names.filter((name) => !lines.has(name)), [], `a cache step with no line in ${STEP_INVENTORY_FILE}`)
  assert.deepEqual([...lines.keys()].filter((name) => !names.includes(name)), [], `a line in ${STEP_INVENTORY_FILE} that matches no cache step`)
  for (const save of saves) {
    const line = lines.get(save.where)
    const expected = lineOf(save, line.rule, currentTree)
    for (const [field, failure] of Object.entries(PINNED_FIELDS)) {
      assert.equal(JSON.stringify(line[field]), JSON.stringify(expected[field]), `${save.where}: ${failure} from its inventory line`)
    }
    assert.ok(Object.hasOwn(rules, line.rule), `${save.where}: the rule "${line.rule}" is not in RULES`)
    rules[line.rule](save)
  }
  checkCompilerCaches(currentTree)
  checkNpmSaves(currentTree, inventory)
}

test("every cache step has an inventory line that pins the step, its job and the restores of its job, with a rule that bounds its entry", () => {
  cacheGuard(tree, INVENTORY)
})

// Each case changes the real text of a workflow or adds a workflow or a local action, in memory. Each one fails the guard
// with the committed inventory, for the reason that its pattern names. When a workflow edit removes the text that a case
// replaces, only that case fails, and the main guard test still reports the real tree.
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
const saveStep = (name, path, key, uses = "actions/cache/save@v6") => `      - name: ${name}
        if: github.event_name != 'pull_request'
        uses: ${uses}
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
const LINT_JOB = `    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7
${restoreStep("Restore eslint", ".eslintcache", ESLINT_KEY, "eslint-")}${saveStep("Save eslint", ".eslintcache", ESLINT_KEY)}`
// A local action that Type Check calls, with the steps of one remote action.
const typeCheckToolStep = (step) => ({ ...newAction("setup-tools", step), ...typeCheckAround("      - uses: ./.github/actions/setup-tools\n", "") })
const NEXT_SAVE = "      - name: Save the Next compiler cache\n        if: github.event_name != 'pull_request' && steps.next-cache.outputs.cache-hit != 'true'\n        uses: actions/cache/save@v6\n"
const WEB_UNIT_LOOKUP = `      - name: Look up cached web unit results
        id: web-unit
        if: github.event_name == 'pull_request'
        uses: actions/cache/restore@v6
        with:
          path: \${{ env.WEB_UNIT_RESULTS }}
          key: \${{ steps.plan.outputs.web-unit-key }}
          lookup-only: true
`

const NO_LINE = /a cache step with no line/
const NO_REMOTE_LINE = /a remote action with no line/
const pinned = (field) => new RegExp(PINNED_FIELDS[field])
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
  pinned("cacheStep")],
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
  }, pinned("restores")],
  ["M22 a save in a local action of an env path that the calling step sets", {
    ...newAction("save-style", STYLE_ENV_SAVE.replace(/^ {6}/gm, "    ")),
    ...workspaceTestsWith(".stylecache-unused", `${STYLE_PREFIX_RESTORE}      - if: github.event_name != 'pull_request'\n        uses: ./.github/actions/save-style\n        env:\n          STYLE_CACHE: .stylelintcache\n`),
  }, NO_LINE],
  ["M23 a save of an env path that a script changes through GITHUB_ENV", workspaceTestsWith(".stylecache-unused",
    `${STYLE_PREFIX_RESTORE}      - run: node .github/scripts/set-style-cache.mjs\n${STYLE_ENV_SAVE}`), NO_LINE],
  ["P1 a save in a new workflow", { ".github/workflows/lint-cache.yml": `name: Lint cache\non:\n  push:\n    branches: [main]\njobs:\n  lint:\n${LINT_JOB}` }, NO_LINE],
  ["P2 a save in a new reusable workflow that a job of test.yml calls", {
    ".github/workflows/lint-reusable.yml": `name: Lint reusable\non:\n  workflow_call:\njobs:\n  lint:\n${LINT_JOB}`,
    ...changeText(".github/workflows/test.yml", ["  type-check:\n", "  lint-reusable:\n    uses: ./.github/workflows/lint-reusable.yml\n  type-check:\n"]),
  }, NO_LINE],
  ["P3 a new save through actions/cache/save by commit SHA", typeCheckAround("", saveStep("Save eslint", ".eslintcache", ESLINT_KEY, "actions/cache/save@0057852bfaa89a56745cba8c7296529d2fc39830")), NO_LINE],
  ["P4 a new save through ACTIONS/CACHE/SAVE", typeCheckAround("", saveStep("Save eslint", ".eslintcache", ESLINT_KEY, "ACTIONS/CACHE/SAVE@v6")), NO_LINE],
  ["P5 the Next compiler cache save as Actions/cache/save with no condition", changeText(".github/workflows/test.yml",
    [NEXT_SAVE, "      - name: Save the Next compiler cache\n        uses: Actions/cache/save@v6\n"]), pinned("cacheStep")],
  ["P6 a local action with actions/setup-node and cache npm", typeCheckToolStep("    - uses: actions/setup-node@v7\n      with:\n        node-version-file: .nvmrc\n        cache: npm\n"), NO_LINE],
  ["P7 a local action with Actions/setup-node and no inputs", typeCheckToolStep("    - uses: Actions/setup-node@v7\n"), NO_LINE],
  ["P8 a local action with actions/setup-java and cache gradle", typeCheckToolStep("    - uses: actions/setup-java@v5\n      with:\n        distribution: temurin\n        java-version: '17'\n        cache: gradle\n"), NO_LINE],
  ["P9 a local action with Actions/setup-java and cache gradle", typeCheckToolStep("    - uses: Actions/setup-java@v5\n      with:\n        distribution: temurin\n        java-version: '17'\n        cache: gradle\n"), NO_LINE],
  ["P10 a local action with hendrikmuhs/ccache-action", typeCheckToolStep("    - uses: hendrikmuhs/ccache-action@v1.2\n      with:\n        key: type-check\n"), NO_REMOTE_LINE],
  ["P11 a local action with actions/setup-python and cache pip", typeCheckToolStep("    - uses: actions/setup-python@v6\n      with:\n        python-version: '3.12'\n        cache: pip\n"), NO_REMOTE_LINE],
  ["P12 a lookup of the plan job becomes a prefix restore of the Turbo download path before its save", changeText(".github/workflows/test.yml", [WEB_UNIT_LOOKUP, ""],
    ["      - name: Hash the test tasks and read the changed paths\n", `      - name: Look up cached web unit results
        id: web-unit
        if: steps.turbo-download.outputs.cache-hit != 'true'
        uses: actions/cache/restore@v6
        with:
          path: ~/.npm/_cacache
          key: \${{ runner.os }}-turbo-cli-
          restore-keys: |
            \${{ runner.os }}-turbo-cli-
      - name: Hash the test tasks and read the changed paths
`]), pinned("restores")],
  ["P13 the ios-build CCACHE_DIR value becomes the macOS cache directory", changeText(".github/workflows/ios-build.yml",
    ["      CCACHE_DIR: ${{ github.workspace }}/.cache/ios-ccache\n", "      CCACHE_DIR: ~/Library/Caches\n"]), pinned("context")],
  ["P13b a step of the ios-build compile job writes CCACHE_DIR to GITHUB_ENV", changeText(".github/workflows/ios-build.yml",
    ["      - name: Install the compiler cache\n", "      - run: echo \"CCACHE_DIR=$HOME/Library/Caches\" >> \"$GITHUB_ENV\"\n      - name: Install the compiler cache\n"]), pinned("context")],
  ["P15 the playwright-cache id moves to the Next restore", changeText(".github/workflows/test.yml",
    ["        id: playwright-cache\n", "        id: playwright-lookup\n"], ["        id: next-cache\n", "        id: playwright-cache\n"]), /differs? from its inventory line/],
  ["P16 the Next save condition gains || true", changeText(".github/workflows/test.yml",
    [NEXT_SAVE, NEXT_SAVE.replace("&& steps.next-cache.outputs.cache-hit != 'true'", "|| true")]), pinned("cacheStep")],
]

for (const [name, changes, reason] of MUTATIONS) {
  test(`the guard fails on ${name}`, () => {
    assert.throws(() => cacheGuard(readTree(changes), INVENTORY), reason)
  })
}

// The inventory of a tree after a review: one line for each cache step as the write command makes it, with the committed
// rule, and a rule that the review adds for each new step.
function reviewedInventory(currentTree) {
  const committed = new Map(INVENTORY.map((line) => [line.step, line.rule]))
  return cacheSteps(currentTree, REMOTE_INVENTORY).map((save) => lineOf(save, committed.get(save.where) ?? "a reviewed bound", currentTree))
}

test("a reviewed inventory line is the only way to make a new cache step pass, and a line that differs from its step fails", () => {
  const rules = { ...RULES, "a reviewed bound": () => {} }
  for (const [name, changes] of MUTATIONS.filter(([name, , reason]) => reason === NO_LINE && !name.startsWith("M18 "))) {
    const changed = readTree(changes)
    const inventory = reviewedInventory(changed)
    assert.doesNotThrow(() => cacheGuard(changed, inventory, rules), name)
    const added = inventory.findIndex((line) => line.rule === "a reviewed bound")
    for (const field of Object.keys(PINNED_FIELDS).filter((key) => key in inventory[added])) {
      const wrong = inventory.map((line, index) => index === added ? { ...line, [field]: field === "context" || field === "cacheStep" ? {} : [{}] } : line)
      assert.throws(() => cacheGuard(changed, wrong, rules), pinned(field), `${name}: ${field}`)
    }
    assert.throws(() => cacheGuard(changed, inventory.filter((line, index) => index !== added), rules), NO_LINE, name)
  }
  // A second ccache saver and a nested npm restore fail their own rules, whatever the inventory holds.
  for (const [name, changes] of MUTATIONS.filter(([name]) => /^M(18|21) /.test(name))) {
    const changed = readTree(changes)
    assert.throws(() => cacheGuard(changed, reviewedInventory(changed), rules), /the compiler cache savers|one npm restore in the job/, name)
  }
  // A remote action needs a reviewed line of its own; with it, its steps follow the step inventory like any other.
  const ccache = readTree(MUTATIONS.find(([name]) => name.startsWith("P10 "))[1])
  const remote = [...REMOTE_INVENTORY, { action: "hendrikmuhs/ccache-action", cache: "cache step", why: "a test line" }]
  assert.throws(() => cacheGuard(ccache, reviewedInventory(ccache), rules, remote), NO_LINE)
  const withCcache = cacheSteps(ccache, remote).map((save) => lineOf(save, INVENTORY.find((line) => line.step === save.where)?.rule ?? "a reviewed bound", ccache))
  assert.doesNotThrow(() => cacheGuard(ccache, withCcache, rules, remote))
})

test("a restore in a job with no save needs no line, and a restore beside a save needs the changed line", () => {
  const restoreOnly = (changes) => () => cacheGuard(readTree(changes), INVENTORY)
  assert.doesNotThrow(restoreOnly(workspaceTestsWith(".stylelintcache", STYLE_PREFIX_RESTORE)))
  assert.throws(restoreOnly(typeCheckAround(restoreStep("Restore eslint", ".eslintcache", ESLINT_KEY, "eslint-"), "")), /Save turbo: the restores of its job differ/)
})

test("the step inventory is the exact output of the write command, and each line names a rule from RULES", () => {
  const text = readFileSync(join(root, STEP_INVENTORY_FILE), "utf8")
  assert.equal(text, `${reviewedInventory(tree).map((line) => JSON.stringify(line)).join("\n")}\n`, "run node .github/scripts/cache-inventory.mjs --write")
  for (const line of INVENTORY) {
    const fields = savesACache(line.cacheStep) ? ["step", "rule", "cacheStep", "calls", "restores", "context"] : ["step", "rule", "cacheStep", "calls"]
    assert.deepEqual(Object.keys(line), fields, line.step)
    assert.ok(Object.hasOwn(RULES, line.rule), `${line.step}: ${line.rule}`)
  }
})

test("the remote inventory has one sorted line for each remote action in use, and each says whether its steps can cache", () => {
  const names = REMOTE_INVENTORY.map(({ action }) => action)
  assert.deepEqual(names, remoteActions(tree), "one line for each remote action in use, in order")
  for (const line of REMOTE_INVENTORY) {
    assert.deepEqual(Object.keys(line), ["action", "cache", "why"], line.action)
    assert.ok(["no cache", "restore only", "cache step"].includes(line.cache), line.action)
    assert.equal(line.action, line.action.toLowerCase(), line.action)
  }
})

test("the cache tests run in the hook tests job, and the restore action exists for every caller", () => {
  const run = load(".github/workflows/test.yml").jobs["hook-tests"].steps.map((step) => step.run ?? "").join("\n")
  for (const file of ["cache-save-rules.test.mjs", "sweep-actions-caches.test.mjs", "android-boot-action.test.mjs"]) {
    assert.ok(run.includes(`.github/scripts/${file}`), file)
  }
  assert.ok(existsSync(join(root, ".github/actions/restore-npm-cache/action.yml")))
})
