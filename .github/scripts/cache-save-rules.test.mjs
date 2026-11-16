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
const workflows = readdirSync(join(root, ".github/workflows"))
  .filter((file) => /\.ya?ml$/.test(file))
  .map((file) => ({ file, document: load(`.github/workflows/${file}`) }))
  .map(({ file, document }) => ({ file, on: Object.keys(document.on), env: document.env ?? {}, jobs: document.jobs }))
const actions = readdirSync(join(root, ".github/actions"))
  .map((directory) => ({ file: `${directory}/action.yml`, steps: load(`.github/actions/${directory}/action.yml`).runs.steps }))
const everyStep = [
  ...workflows.flatMap(({ file, on, jobs }) => Object.entries(jobs).flatMap(([job, { steps = [] }]) =>
    steps.map((step) => ({ step, where: `${file}: ${job}: ${step.name ?? step.uses ?? step.run}`, file, job, pullRequest: on.includes("pull_request") })))),
  // A local action runs in the workflow that calls it, and pull request workflows call every local action.
  ...actions.flatMap(({ file, steps }) => steps.map((step) => ({ step, where: `${file}: ${step.name ?? step.uses ?? step.run}`, file, job: "action", pullRequest: true }))),
]
const uses = (prefix) => everyStep.filter(({ step }) => step.uses?.startsWith(prefix))
// The workflow list with more steps at the end of one job, for a test that adds a cache step to a real job.
const withMoreSteps = (file, job, moreSteps) => workflows.map((workflow) => workflow.file !== file ? workflow
  : { ...workflow, jobs: { ...workflow.jobs, [job]: { ...workflow.jobs[job], steps: [...workflow.jobs[job].steps, ...moreSteps] } } })

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

// In a job that restores the npm cache, a save step is an npm save unless each of its paths is outside the npm cache
// directory (mayHoldTheSameFiles below). A save whose key or path has the text npm, or reads an output of the restore
// step or of a step that reads the npm cache directory, is an npm save in each case.
const NPM_PRIMARY_KEY = "${{ steps.npm-cache.outputs.cache-primary-key }}"
function namesTheNpmCache(save, steps) {
  const text = `${save.with?.key ?? ""}\n${save.with?.path ?? ""}`
  const ids = steps.filter((step) => isNpmRestore(step) || step.run?.includes("npm config get cache")).map((step) => step.id).filter(Boolean)
  return /npm/i.test(text) || ids.some((id) => text.includes(`steps.${id}.outputs.`))
}
function npmSavesOf(workflowList, actionList = actions) {
  return stepListsOf(workflowList, actionList).flatMap((list) => {
    const restores = list.steps.filter(isNpmCacheRestore)
    if (restores.length === 0) return []
    return list.steps.filter((step) => savesACache(step) && (namesTheNpmCache(step, list.steps) || restores.some((restore) => mayHoldTheSameFiles(step, restore, list))))
      .map((step) => ({ file: list.file, job: list.job, step, steps: list.own, where: `${list.file}: ${list.job}: ${step.name ?? step.uses}` }))
  })
}
const npmSaveJobs = (workflowList) => npmSavesOf(workflowList).map(({ file, job }) => `${file}: ${job}`).sort()

test("each npm entry holds only the tarballs of its own lockfile, because a job that saves it restores no older entry", () => {
  const { inputs, runs } = load(".github/actions/restore-npm-cache/action.yml")
  assert.equal(inputs["restore-older-entry"].default, "true")
  assert.equal(runs.steps.find((step) => step.id === "restore").with["restore-keys"], RESTORE_OLDER_ENTRY)

  const saves = npmSavesOf(workflows)
  assert.deepEqual(npmSaveJobs(workflows), Object.keys(NPM_SAVERS).sort())
  for (const { step, where, file, job, steps } of saves) {
    const [savesWhen, restoresOlderWhen] = NPM_SAVERS[`${file}: ${job}`]
    assert.equal(step.uses, "actions/cache/save@v6", where)
    assert.equal(step.with.key, NPM_PRIMARY_KEY, where)
    assert.equal(step.if, `${savesWhen} && steps.npm-cache.outputs.cache-hit != 'true'`, where)
    assert.match(savesWhen, MAIN_ONLY, where)
    assert.equal(step.with.path, "${{ steps.npm-cache.outputs.path }}", where)
    const restores = steps.filter(isNpmRestore)
    assert.deepEqual(restores.map((candidate) => candidate.id), ["npm-cache"], where)
    assert.equal(restores[0].with?.["restore-older-entry"], restoresOlderWhen, `${where}: the restore before a save must be exact`)
    assert.ok(steps.indexOf(restores[0]) < steps.indexOf(step), where)
  }
  for (const { step, where, file, job } of everyStep.filter(({ step }) => step.uses === "./.github/actions/restore-npm-cache")) {
    if (!(`${file}: ${job}` in NPM_SAVERS)) assert.equal(step.with?.["restore-older-entry"], undefined, `${where} never saves, so it keeps the prefix fallback`)
  }
})

// The Type Check job restores the npm cache by prefix through the local action and saves no npm entry.
const saveNpm = (input) => ({ name: "Save npm", if: "github.event_name != 'pull_request'", uses: "actions/cache/save@v6", with: input })
for (const [name, moreSteps] of [
  ["a literal key and a literal path", [saveNpm({ path: "~/.npm", key: "npm-${{ github.sha }}" })]],
  ["a literal path and a key with another name", [saveNpm({ path: "~/.npm", key: "packages-${{ github.sha }}" })]],
  ["a directory that its own step reads", [{ id: "directory", run: 'echo "path=$(npm config get cache)" >> "$GITHUB_OUTPUT"' },
    saveNpm({ path: "${{ steps.directory.outputs.path }}", key: "packages-${{ github.sha }}" })]],
  ["the outputs of a restore step with another id", [{ id: "packages", uses: "./.github/actions/restore-npm-cache" },
    saveNpm({ path: "${{ steps.packages.outputs.path }}", key: "${{ steps.packages.outputs.cache-primary-key }}" })]],
  ["a combined cache step", [{ name: "Cache npm", uses: "actions/cache@v6", with: { path: "~/.npm", key: "packages-${{ github.sha }}" } }]],
  ["a directory from an env value that no workflow sets", [saveNpm({ path: "${{ env.PACKAGES }}", key: "packages-${{ github.sha }}" })]],
  ["a glob in the home directory", [saveNpm({ path: "~/.n*", key: "packages-${{ github.sha }}" })]],
  ["the Windows default directory", [saveNpm({ path: "${{ env.LOCALAPPDATA }}/packages", key: "packages-${{ github.sha }}" })]],
]) {
  test(`a job that restores the npm cache by prefix and saves it with ${name} is found as an npm saver`, () => {
    assert.deepEqual(npmSaveJobs(withMoreSteps("test.yml", "type-check", moreSteps)), [...Object.keys(NPM_SAVERS), "test.yml: type-check"].sort())
  })
}

test("a save of another directory in a job that restores the npm cache is not an npm save", () => {
  const moreSteps = [{ name: "Save eslint", uses: "actions/cache/save@v6", with: { path: ".eslintcache", key: "eslint-${{ github.sha }}" } }]
  assert.deepEqual(npmSaveJobs(withMoreSteps("test.yml", "type-check", moreSteps)), Object.keys(NPM_SAVERS).sort())
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
const stepsOf = (file, job) => workflows.find((workflow) => workflow.file === file).jobs[job].steps

test("each compiler cache entry holds only the objects that its own compile used, so a key change does not grow it", () => {
  const saves = [...uses("actions/cache/save@"), ...uses("actions/cache@")].filter(({ step }) => isCompilerCache(step))
  assert.deepEqual(saves.map(({ file, job }) => `${file}: ${job}`).sort(), Object.keys(COMPILER_CACHE_SAVERS).sort())
  for (const { step: save, where, file, job } of saves) {
    const [compileStep, evictWhen] = COMPILER_CACHE_SAVERS[`${file}: ${job}`]
    const steps = stepsOf(file, job)
    const restore = steps.findIndex((step) => /^actions\/cache(\/restore)?@/.test(step.uses ?? "") && isCompilerCache(step))
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
    if (save.uses.startsWith("actions/cache/save@")) assert.ok(evict < steps.indexOf(save), `${where}: the evict step runs before the save`)
  }
})

// A job that restores an entry by prefix and then saves it stores the older entry plus its own files under the new
// key. Each such job needs a rule that removes the files it did not use, or the family grows with each key change.
const BOUNDED_PREFIX_SAVERS = {
  "mobile-build.yml: build: Restore the ccache directory": "the evict step",
  "android-release.yml: release-android: Restore the ccache directory": "the evict step",
  "ios-build.yml: compile: Restore compiler outputs": "the evict step",
  "ios-release.yml: release: Restore compiler outputs": "the evict step",
  // next/dist/compiled/webpack/bundle5.js sets the filesystem cache default maxAge to 1e3*60*60*24*60, and
  // next/dist/build/webpack-config.js does not change it: webpack removes an item that no build read for 60 days.
  "test.yml: build: Restore the Next compiler cache": "the webpack maxAge of 60 days",
  "test.yml: type-check: Restore turbo": "the step that deletes results older than 30 days",
}

// actions/cache at 55cc8345863c7cc4c66a329aec7e433d2d1c52a9 (v6). src/utils/actionUtils.ts getInputAsArray: the path
// input holds one path on each line, and a line that starts with "!" excludes a path. dist/save-only/index.js
// resolvePaths and Pattern.fixupPattern: each line is a glob pattern with the characters "*", "?" and "[" (nobrace is
// set, so "{" is plain text), a first segment "~" is the home directory, each other relative line starts at the
// workspace, a ".." segment fails the step, and each match is stored relative to GITHUB_WORKSPACE. The action does not
// expand "$NAME"; the guard reads "$GITHUB_WORKSPACE/" as the workspace, which is the safe side.
const WORKSPACE = "<workspace>"
const NPM_DIRECTORY = "<npm cache>"
const READS_THE_NPM_DIRECTORY = 'echo "path=$(npm config get cache)" >> "$GITHUB_OUTPUT"'
const GLOB = /[*?[]/

// The path output of a step is the npm cache directory only when each step with that id reads it or is the local action.
function isTheNpmDirectory(expression, steps) {
  const id = expression.match(/^steps\.([\w-]+)\.outputs\.path$/)?.[1]
  const owners = steps.filter((step) => id !== undefined && step.id === id)
  return owners.length > 0 && owners.every((step) => step.run === READS_THE_NPM_DIRECTORY || step.uses === "./.github/actions/restore-npm-cache")
}

// One path as a root and its segments, or null when the guard cannot name the directory: an absolute path, a Windows
// path, a ".." segment, or a variable or an expression after the first segment.
function placeOf(line, steps) {
  const expression = line.match(/^\$\{\{\s*(.+?)\s*\}\}(?=\/|$)/)
  const first = expression ? expression[0] : line.split("/")[0]
  const rest = line.slice(first.length).split("/").filter(Boolean)
  let root = WORKSPACE
  if (expression) root = expression[1] === "github.workspace" ? WORKSPACE : isTheNpmDirectory(expression[1], steps) ? NPM_DIRECTORY : `\${{ ${expression[1]} }}`
  else if (first === "~") root = "~"
  else if (first !== "." && first !== "$GITHUB_WORKSPACE") rest.unshift(first)
  if (line.startsWith("/") || /[\\:]/.test(line) || rest.some((segment) => segment === ".." || segment.includes("$"))) return null
  // The macOS and Windows runners do not tell "A" from "a" in a file name.
  return { root, text: [root, ...rest.map((segment) => segment.toLowerCase())].join("/") }
}

// A workflow or job env value is the value of the expression when no step can change it.
function cachePlaces(step, { steps, env }) {
  const path = String(step.with?.path ?? "").replace(/\$\{\{\s*env\.(\w+)\s*\}\}/g, (expression, name) =>
    typeof env[name] === "string" && step.env?.[name] === undefined && !steps.some((other) => other.run?.includes(`${name}=`)) ? env[name] : expression)
  return path.split("\n").map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("!")).map((line) => placeOf(line, steps))
}

// Pairs of directories where neither holds a file of the other on a GitHub-hosted runner. The workspace is in the
// work directory of the runner, and RUNNER_TEMP is "D:\a\_temp" (docs.github.com, Variables reference). The npm cache
// directory is ~/.npm, or %LOCALAPPDATA%\npm-cache on Windows (npm 11, @npmcli/config lib/definitions/definitions.js),
// and the Windows image sets it to C:\npm\cache (actions/runner-images at 1b60920cc98c97c717d4790ffdfcb5350e21b5ad,
// images/windows/scripts/build/Install-NodeJS.ps1). The main guard test pins the two env values and the npm setting.
const SEPARATE_PLACES = [
  [WORKSPACE, "~/.cache"],
  [NPM_DIRECTORY, WORKSPACE],
  [NPM_DIRECTORY, "~/.cache"],
  [NPM_DIRECTORY, "${{ runner.temp }}"],
  [NPM_DIRECTORY, "${{ env.ORBIT_NSIS_TOOLS }}"],
  [NPM_DIRECTORY, "${{ env.ORBIT_WINDOWS_DOWNLOAD_CACHE }}"],
]

// outer holds inner when it is the same path or a parent, or a glob whose text before its first glob character starts inner.
const holdsPath = (outer, inner) => inner === outer || inner.startsWith(`${outer}/`) || (GLOB.test(outer) && inner.startsWith(outer.split(GLOB)[0]))
const isInside = (path, place) => `${path.split(GLOB)[0]}${GLOB.test(path) ? "" : "/"}`.startsWith(`${place}/`)
// Two paths are apart only with a proof: one root and paths that do not hold each other, or a pair of separate places.
function areApart(one, other) {
  if (one === null || other === null || holdsPath(one.text, other.text) || holdsPath(other.text, one.text)) return false
  return one.root === other.root || SEPARATE_PLACES.some(([first, second]) =>
    (isInside(one.text, first) && isInside(other.text, second)) || (isInside(one.text, second) && isInside(other.text, first)))
}
const mayHoldTheSameFiles = (save, restore, list) => cachePlaces(save, list).some((saved) =>
  cachePlaces(restore, list).some((restored) => !areApart(saved, restored)))
const savesUnderTheRestoredKey = (save, restore) => restore.id !== undefined &&
  String(save.with?.key ?? "").includes(`steps.${restore.id}.outputs.cache-primary-key`)

// GitHub reads an action name without regard to case.
const savesACache = (step) => /^actions\/cache(\/save)?@/i.test(step.uses ?? "")
const restoresByPrefix = (step) => /^actions\/cache(\/restore)?@/i.test(step.uses ?? "") && String(step.with?.["restore-keys"] ?? "").trim() !== ""
const isNpmCacheRestore = (step) => /^actions\/cache\/restore@/i.test(step.uses ?? "") && NPM_KEY.test(step.with?.key ?? "")

// The steps of a local action run in the job that calls it, so each call is followed by the steps of its action.
function withActionSteps(steps, actionSteps, callers = []) {
  return steps.flatMap((step) => {
    if (!step.uses?.startsWith("./")) return [step]
    const action = step.uses.replace(/\/+$/, "")
    assert.ok(actionSteps[action] !== undefined && !callers.includes(action), `${step.uses}: the guard must read the steps of each local action`)
    return [step, ...withActionSteps(actionSteps[action], actionSteps, [...callers, action])]
  })
}
// Each job with the steps of its local actions, and each local action as a list of its own.
function stepListsOf(workflowList, actionList) {
  const actionSteps = Object.fromEntries(actionList.map(({ file, steps }) => [`./.github/actions/${dirname(file)}`, steps]))
  return [
    ...workflowList.flatMap(({ file, env, jobs }) => Object.entries(jobs).map(([job, { steps = [], env: jobEnv }]) =>
      ({ file, job, own: steps, steps: withActionSteps(steps, actionSteps), env: { ...env, ...jobEnv } }))),
    ...actionList.map(({ file, steps }) => ({ file, job: "action", own: steps, steps: withActionSteps(steps, actionSteps), env: {} })),
  ]
}

// The post step of a combined actions/cache step saves its own restore. Each other save step of the job counts unless
// each of its paths is apart from each restored path. The npm test owns the saves of an npm restore.
function prefixSaversOf(workflowList, actionList = actions) {
  const prefixSavers = stepListsOf(workflowList, actionList).flatMap((list) => list.steps
    .filter((restore) => restoresByPrefix(restore) && !isNpmCacheRestore(restore) && list.steps.some((save) => savesACache(save) &&
      (save === restore || savesUnderTheRestoredKey(save, restore) || mayHoldTheSameFiles(save, restore, list))))
    .map((restore) => `${list.file}: ${list.job}: ${restore.name ?? restore.uses}`))
  return [...new Set(prefixSavers)].sort()
}

const LINT_KEY = "eslint-${{ github.sha }}"
const restoreLint = (step = {}) => ({ name: "Restore eslint", uses: "actions/cache/restore@v6", with: { path: ".eslintcache", key: LINT_KEY, "restore-keys": "eslint-\n" }, ...step })
const saveLint = (input = {}) => ({ name: "Save eslint", if: "github.event_name != 'pull_request'", uses: "actions/cache/save@v6", with: { path: ".eslintcache", key: LINT_KEY, ...input } })

for (const [name, moreSteps, restoreName = "Restore eslint"] of [
  ["a literal key, after a restore step with no id", [restoreLint(), saveLint()]],
  ["a literal key, after a restore step with an id", [restoreLint({ id: "eslint-cache" }), saveLint()]],
  ["the primary key of the restore step", [restoreLint({ id: "eslint-cache" }), saveLint({ key: "${{ steps.eslint-cache.outputs.cache-primary-key }}" })]],
  ["the primary key of the restore step and another form of the path", [restoreLint({ id: "eslint-cache" }), saveLint({ path: "${{ github.workspace }}/.eslintcache", key: "${{ steps.eslint-cache.outputs.cache-primary-key }}" })]],
  ["a literal key and the path among other paths", [restoreLint(), saveLint({ path: "coverage\n./.eslintcache/\n" })]],
  ["a literal key and the parent directory of the path", [restoreLint({ with: { path: "tooling/cache/eslint", key: LINT_KEY, "restore-keys": "eslint-" } }), saveLint({ path: "tooling/cache" })]],
  ["the post step of a combined cache step", [restoreLint(), { name: "Cache eslint", uses: "actions/cache@v6", with: { path: ".eslintcache", key: LINT_KEY } }]],
  ["a restore step with no name", [restoreLint({ name: undefined }), saveLint()], "actions/cache/restore@v6"],
  ["a literal key and the path after the workspace expression", [restoreLint(), saveLint({ path: "${{ github.workspace }}/.eslintcache" })]],
  ["a literal key and the path after the workspace variable", [restoreLint(), saveLint({ path: "$GITHUB_WORKSPACE/.eslintcache" })]],
  ["a literal key and a glob that matches the path", [restoreLint({ with: { path: "apps/web/.eslintcache", key: LINT_KEY, "restore-keys": "eslint-" } }), saveLint({ path: "apps/*/.eslintcache" })]],
  ["a literal key and a glob at the start of the path", [restoreLint(), saveLint({ path: "[.]eslint?ache" })]],
  ["a literal key and the whole workspace", [restoreLint(), saveLint({ path: "." })]],
  ["a literal key and the path in other letter case", [restoreLint(), saveLint({ path: ".ESLintCache" })]],
  ["a literal key and an action name in other letter case", [restoreLint(), { ...saveLint(), uses: "Actions/Cache/Save@v6" }]],
  ["a literal key and a path from an env value that no workflow sets", [restoreLint(), saveLint({ path: "${{ env.LINT_CACHE }}" })]],
  ["a literal key and a path from a step output", [restoreLint(), saveLint({ path: "${{ steps.lint.outputs.directory }}/cache" })]],
  ["a literal key and a path with an expression after its first segment", [restoreLint(), saveLint({ path: "apps/${{ matrix.app }}/.eslintcache" })]],
  ["a literal key and an absolute path", [restoreLint(), saveLint({ path: "/var/cache/eslint" })]],
  ["a literal key and the home directory, which holds the workspace", [restoreLint(), saveLint({ path: "~" })]],
  ["a literal key and a home path that is not in a separate place", [restoreLint(), saveLint({ path: "~/work" })]],
]) {
  test(`a new job step that saves a prefix restore under ${name} needs a rule that bounds the entry`, () => {
    const found = prefixSaversOf(withMoreSteps("test.yml", "type-check", moreSteps))
    assert.deepEqual(found, [...prefixSaversOf(workflows), `test.yml: type-check: ${restoreName}`].sort())
  })
}

test("a prefix restore that no step saves, a save after a restore of the exact key only, and a save of a path that is apart need no rule", () => {
  const exactRestore = restoreLint({ with: { path: ".eslintcache", key: LINT_KEY } })
  for (const moreSteps of [[restoreLint()], [exactRestore, saveLint()], [restoreLint(), saveLint({ path: ".eslintcache-next" })],
    [restoreLint(), saveLint({ path: "apps/*/.eslintcache" })], [restoreLint(), saveLint({ path: "~/.cache/eslint" })]]) {
    assert.deepEqual(prefixSaversOf(withMoreSteps("test.yml", "type-check", moreSteps)), prefixSaversOf(workflows))
  }
})

// A cache step of a local action runs in each job that calls the action.
const NSIS_ACTION = "desktop-nsis-tools/action.yml"
const withActionStep = (file, change) => actions.map((action) => action.file !== file ? action : { ...action, steps: action.steps.map(change) })

test("a combined cache step of a local action that restores by prefix needs a rule in the action and in each job that calls it", () => {
  const nsisTools = withActionStep(NSIS_ACTION, (step) => step.name !== "Cache the NSIS tools" ? step
    : { ...step, with: { ...step.with, "restore-keys": "${{ runner.os }}-nsis-tools-\n" } })
  const callers = everyStep.filter(({ step }) => step.uses === "./.github/actions/desktop-nsis-tools").map(({ file, job }) => `${file}: ${job}`)
  assert.ok(callers.length >= 4)
  assert.deepEqual(prefixSaversOf(workflows, nsisTools),
    [...prefixSaversOf(workflows), ...[`${NSIS_ACTION}: action`, ...callers].map((where) => `${where}: Cache the NSIS tools`)].sort())
})

test("a prefix restore in a local action, with a save in the job that calls it or in a second local action, needs a rule", () => {
  const restorePrettier = { file: "restore-prettier/action.yml", steps: [{ name: "Restore prettier", uses: "actions/cache/restore@v6",
    with: { path: ".prettiercache", key: "prettier-${{ github.sha }}", "restore-keys": "prettier-\n" } }] }
  const savePrettier = { name: "Save prettier", if: "github.event_name != 'pull_request'", uses: "actions/cache/save@v6", with: { path: ".prettiercache", key: "prettier-${{ github.sha }}" } }
  const callRestore = { uses: "./.github/actions/restore-prettier" }
  const expected = [...prefixSaversOf(workflows), "test.yml: type-check: Restore prettier"].sort()

  assert.deepEqual(prefixSaversOf(withMoreSteps("test.yml", "type-check", [callRestore]), [...actions, restorePrettier]), prefixSaversOf(workflows))
  assert.deepEqual(prefixSaversOf(withMoreSteps("test.yml", "type-check", [callRestore, savePrettier]), [...actions, restorePrettier]), expected)
  const saveAction = { file: "save-prettier/action.yml", steps: [savePrettier] }
  assert.deepEqual(prefixSaversOf(withMoreSteps("test.yml", "type-check", [callRestore, { uses: "./.github/actions/save-prettier/" }]), [...actions, restorePrettier, saveAction]), expected)
  // An action that calls the restore action carries the restore into the job.
  const setup = { file: "setup-prettier/action.yml", steps: [callRestore] }
  assert.deepEqual(prefixSaversOf(withMoreSteps("test.yml", "type-check", [{ uses: "./.github/actions/setup-prettier" }, savePrettier]), [...actions, restorePrettier, setup]), expected)

  assert.throws(() => prefixSaversOf(withMoreSteps("test.yml", "type-check", [callRestore, savePrettier])), /the guard must read the steps of each local action/)
})

test("every job that restores an entry by prefix and saves it has a rule that bounds the entry", () => {
  assert.deepEqual(prefixSaversOf(workflows), Object.keys(BOUNDED_PREFIX_SAVERS).sort())

  // SEPARATE_PLACES holds these two directories by the name of their env value, and the npm cache directory by its default.
  const runs = everyStep.map(({ step }) => step.run ?? "")
  for (const [name, value] of [["ORBIT_NSIS_TOOLS", "$LOCALAPPDATA/tauri/NSIS"], ["ORBIT_WINDOWS_DOWNLOAD_CACHE", "$RUNNER_TEMP/windows-app-sdk-downloads"]]) {
    const writes = runs.filter((run) => run.includes(`${name}=`))
    assert.ok(writes.length > 0, name)
    for (const run of writes) assert.equal(run, `echo "${name}=${value}" >> "$GITHUB_ENV"`, name)
  }
  assert.equal(existsSync(join(root, ".npmrc")), false, "a root .npmrc can move the npm cache directory")
  for (const { step, where } of everyStep) assert.doesNotMatch(JSON.stringify(step), /npm_config_cache|npm config set cache/i, where)

  // Turbo keeps each result at .turbo/cache/<hash>.tar.zst with two JSON files and never removes one.
  const typeCheck = stepsOf("test.yml", "type-check")
  const save = typeCheck.findIndex((step) => step.uses?.startsWith("actions/cache/save@") && step.with.path === ".turbo")
  assert.equal(typeCheck[save - 1].run, "find .turbo/cache -type f -mtime +30 -delete")
  assert.equal(typeCheck[save - 1].if, typeCheck[save].if)

  // gradle/actions at 8da46b539cd8fe6ab27ca75128919a18d757604c, setup-gradle/action.yml: cache-cleanup defaults to
  // on-success, which removes the unused files of the Gradle User Home before the save. Swatinem/rust-cache at
  // d1527c8f67ef9af357290475d4af4b0fab8f12e0, src/save.ts: cleanTargetDir, cleanRegistry and cleanGit run before saveCache.
  for (const { step, where } of uses("gradle/actions/setup-gradle@")) {
    for (const input of ["cache-cleanup", "gradle-home-cache-cleanup"]) assert.equal(step.with?.[input], undefined, `${where}: ${input}`)
  }
})

test("the cache tests run in the hook tests job, and the restore action exists for every caller", () => {
  const run = load(".github/workflows/test.yml").jobs["hook-tests"].steps.map((step) => step.run ?? "").join("\n")
  for (const file of ["cache-save-rules.test.mjs", "sweep-actions-caches.test.mjs", "android-boot-action.test.mjs"]) {
    assert.ok(run.includes(`.github/scripts/${file}`), file)
  }
  assert.ok(existsSync(join(root, ".github/actions/restore-npm-cache/action.yml")))
})
