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
  assert.equal(restore.with.path, "${{ steps.directory.outputs.path }}")
  assert.equal(action.find((step) => step.id === "directory").run, 'echo "path=$(npm config get cache)" >> "$GITHUB_OUTPUT"')
  // The five release jobs restore inline and never save, so each keeps the prefix fallback.
  for (const { step, where } of uses("actions/cache/restore@v6").filter(({ step, where }) => NPM_KEY.test(step.with.key) && !where.startsWith("restore-npm-cache/"))) {
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

test("each npm entry holds only the tarballs of its own lockfile, because a job that saves it restores no older entry", () => {
  const { inputs, runs } = load(".github/actions/restore-npm-cache/action.yml")
  assert.equal(inputs["restore-older-entry"].default, "true")
  assert.equal(runs.steps.find((step) => step.id === "restore").with["restore-keys"], RESTORE_OLDER_ENTRY)

  const saves = uses("actions/cache/save@").filter(({ step }) => step.with.key === "${{ steps.npm-cache.outputs.cache-primary-key }}")
  assert.deepEqual(saves.map(({ file, job }) => `${file}: ${job}`).sort(), Object.keys(NPM_SAVERS).sort())
  for (const { step, where, file, job } of saves) {
    const [savesWhen, restoresOlderWhen] = NPM_SAVERS[`${file}: ${job}`]
    assert.equal(step.if, `${savesWhen} && steps.npm-cache.outputs.cache-hit != 'true'`, where)
    assert.match(savesWhen, MAIN_ONLY, where)
    assert.equal(step.with.path, "${{ steps.npm-cache.outputs.path }}", where)
    const steps = workflows.find((workflow) => workflow.file === file).jobs[job].steps
    const restores = steps.filter(isNpmRestore)
    assert.deepEqual(restores.map((candidate) => candidate.id), ["npm-cache"], where)
    assert.equal(restores[0].with?.["restore-older-entry"], restoresOlderWhen, `${where}: the restore before a save must be exact`)
    assert.ok(steps.indexOf(restores[0]) < steps.indexOf(step), where)
  }
  for (const { step, where, file, job } of everyStep.filter(({ step }) => step.uses === "./.github/actions/restore-npm-cache")) {
    if (!(`${file}: ${job}` in NPM_SAVERS)) assert.equal(step.with?.["restore-older-entry"], undefined, `${where} never saves, so it keeps the prefix fallback`)
  }
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

test("the cache tests run in the hook tests job, and the restore action exists for every caller", () => {
  const run = load(".github/workflows/test.yml").jobs["hook-tests"].steps.map((step) => step.run ?? "").join("\n")
  for (const file of ["cache-save-rules.test.mjs", "sweep-actions-caches.test.mjs", "android-boot-action.test.mjs"]) {
    assert.ok(run.includes(`.github/scripts/${file}`), file)
  }
  assert.ok(existsSync(join(root, ".github/actions/restore-npm-cache/action.yml")))
})
