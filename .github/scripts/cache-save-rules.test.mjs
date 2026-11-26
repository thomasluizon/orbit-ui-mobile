import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import test from "node:test"
import { isDeepStrictEqual } from "node:util"
import yaml from "js-yaml"
import { RELEASE_FAMILY_KEYS } from "./sweep-actions-caches.mjs"
import {
  MISSING_TEXT, REMOTE_INVENTORY_FILE, STEP_INVENTORY_FILE, actionName, cacheStepLists, cacheSteps, canonical, canonicalStep, lineOf, readInventory,
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
  assert.deepEqual(withoutCache, [])

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
// Each npm saver: when it saves, the outputs that name its exact restore, and the input that stops a restore by prefix.
// PR Tests restores through the install action, which runs npm ci only on a miss of the dependency tree, so its save
// also needs the key that only that miss produces.
const NPM_SAVERS = {
  "test.yml: build": {
    when: "github.event_name != 'pull_request' && steps.install.outputs.npm-cache-primary-key != ''",
    olderEntry: "${{ github.event_name == 'pull_request' }}",
    hit: "steps.install.outputs.npm-cache-hit",
    key: "${{ steps.install.outputs.npm-cache-primary-key }}",
    path: "${{ steps.install.outputs.npm-cache-path }}",
  },
  "desktop-build.yml: build": {
    when: "runner.os == 'Windows' && github.ref == 'refs/heads/main'",
    olderEntry: "${{ !(runner.os == 'Windows' && github.ref == 'refs/heads/main') }}",
    hit: "steps.npm-cache.outputs.cache-hit",
    key: "${{ steps.npm-cache.outputs.cache-primary-key }}",
    path: "${{ steps.npm-cache.outputs.path }}",
  },
}

// The dependency tree that PR Tests restores in each job and saves from its Build job.
const DEPENDENCY_TREE_PATH = "node_modules\napps/*/node_modules\npackages/*/node_modules\neslint-rules/node_modules\n"
const DEPENDENCY_TREE_KEY = "modules-${{ runner.os }}-${{ runner.arch }}-node${{ steps.node.outputs.major }}-${{ hashFiles('package-lock.json', 'apps/mobile/scripts/fix-hoisting.js', '.github/actions/install-dependencies/action.yml') }}"
const DEPENDENCY_TREE_SAVERS = { "test.yml: build": "${{ steps.install.outputs.cache-primary-key }}" }

// A restore as a reviewer reads it: the canonical restore step and the canonical local action calls that lead to it, each
// without its name, which is free text.
const withoutName = (step) => {
  const { name, ...form } = canonicalStep(step)
  return form
}
const restoreForm = ({ step, calls }) => ({ step: withoutName(step), calls: calls.map(withoutName) })
const jobRestores = (list) => list.entries.filter(({ step }) => restoresACache(step)).map(restoreForm)

// The restore step of .github/actions/restore-npm-cache, after the call that leads to it.
const NPM_ACTION_RESTORE = {
  env: { SEGMENT_DOWNLOAD_TIMEOUT_MINS: "1" },
  id: "restore",
  if: "runner.os != 'macOS'",
  uses: "actions/cache/restore@v6",
  with: {
    key: "npm-${{ runner.os }}-${{ runner.arch }}-${{ hashFiles(inputs.lockfile) }}",
    path: "${{ steps.directory.outputs.path }}",
    "restore-keys": RESTORE_OLDER_ENTRY,
  },
}
const npmActionRestore = (call) => ({ step: NPM_ACTION_RESTORE, calls: [{ uses: "./.github/actions/restore-npm-cache", ...call }] })
// The two restores of .github/actions/install-dependencies, after the call that leads to them: the dependency tree, then,
// on a miss, the npm cache through the nested npm action.
const installRestores = (call = {}) => {
  const install = { uses: "./.github/actions/install-dependencies", ...call }
  const tree = {
    env: { SEGMENT_DOWNLOAD_TIMEOUT_MINS: "1" },
    id: "modules",
    uses: "actions/cache/restore@v6",
    with: { key: DEPENDENCY_TREE_KEY, path: DEPENDENCY_TREE_PATH },
  }
  const nested = {
    id: "npm-cache",
    if: "steps.modules.outputs.cache-hit != 'true'",
    uses: "./.github/actions/restore-npm-cache",
    with: { "restore-older-entry": "${{ inputs.restore-older-npm-entry }}" },
  }
  return [{ step: tree, calls: [install] }, { step: NPM_ACTION_RESTORE, calls: [install, nested] }]
}
const npmSaverRestores = (place) => place === "test.yml: build"
  ? installRestores({ id: "install", with: { "restore-older-npm-entry": NPM_SAVERS[place].olderEntry } })
  : [npmActionRestore({ id: "npm-cache", with: { "restore-older-entry": NPM_SAVERS[place].olderEntry } })]
const unitResultsRestore = (job) => ({
  step: {
    if: `needs.${job}-tests.result == 'skipped'`,
    uses: "actions/cache/restore@v6",
    with: { "fail-on-cache-miss": true, key: `\${{ needs.plan.outputs.${job}-unit-key }}`, path: `\${{ env.${job.toUpperCase()}_UNIT_RESULTS }}` },
  },
  calls: [],
})
const unitResultsLookup = (job) => ({
  step: {
    id: `${job}-unit`,
    uses: "actions/cache/restore@v6",
    with: { key: `\${{ steps.plan.outputs.${job}-unit-key }}`, "lookup-only": true, path: `\${{ env.${job.toUpperCase()}_UNIT_RESULTS }}` },
  },
  calls: [],
})
// The call of .github/actions/merged-unit-results, which leads to the lookups after the save of a merged pull request result.
const MERGED_RESULTS_CALL = {
  id: "merged",
  if: "github.event_name != 'pull_request' && (steps.web-unit.outputs.cache-hit != 'true' || steps.mobile-unit.outputs.cache-hit != 'true' || steps.workspace-unit.outputs.cache-hit != 'true')",
  uses: "./.github/actions/merged-unit-results",
  with: {
    "web-hit": "${{ steps.web-unit.outputs.cache-hit }}",
    "web-key": "${{ steps.plan.outputs.web-unit-key }}",
    "web-path": "${{ env.WEB_UNIT_RESULTS }}",
    "mobile-hit": "${{ steps.mobile-unit.outputs.cache-hit }}",
    "mobile-key": "${{ steps.plan.outputs.mobile-unit-key }}",
    "mobile-path": "${{ env.MOBILE_UNIT_RESULTS }}",
    "workspace-hit": "${{ steps.workspace-unit.outputs.cache-hit }}",
    "workspace-key": "${{ steps.plan.outputs.workspace-unit-key }}",
    "workspace-path": "${{ env.WORKSPACE_UNIT_RESULTS }}",
  },
}
// The lookup after the save of a merged pull request result: the group counts as cached only when the saved entry exists.
const mergedUnitResultsLookup = (job, calls = [MERGED_RESULTS_CALL]) => ({
  step: {
    id: `${job}-unit-merged`,
    if: `inputs.${job}-hit != 'true' && steps.adopt.outputs.${job}-unit == 'true'`,
    uses: "actions/cache/restore@v6",
    with: { key: `\${{ inputs.${job}-key }}`, "lookup-only": true, path: `\${{ inputs.${job}-path }}` },
  },
  calls,
})

// The rules "npm" and "the key of an exact restore" bound an entry because the save after a key miss holds only what the
// run wrote. A second restore of the saved path by prefix fills the directory with the previous entry first, under any
// key, id or spelling of the path. So the test names every restore of each saver job of those rules, with the steps of its
// local actions, and the restores of the job must equal that list. A restore that the list does not name fails.
const EXACT_RESTORE_RULES = ["npm", "the key of an exact restore"]
const REVIEWED_RESTORES = {
  "desktop-build.yml: build": [
    ...npmSaverRestores("desktop-build.yml: build"),
    {
      step: {
        id: "windows-downloads",
        if: "runner.os == 'Windows'",
        uses: "actions/cache/restore@v6",
        with: {
          key: "${{ runner.os }}-windows-app-sdk-${{ matrix.target }}-${{ hashFiles('apps/desktop/src-tauri/native/windows/downloads.json') }}",
          path: "${{ env.ORBIT_WINDOWS_DOWNLOAD_CACHE }}",
        },
      },
      calls: [],
    },
    {
      step: {
        if: "runner.os == 'Windows'",
        uses: "actions/cache@v6",
        with: { key: "${{ runner.os }}-nsis-tools-${{ hashFiles('apps/desktop/src-tauri/native/windows/nsis-tools.json') }}", path: "${{ env.ORBIT_NSIS_TOOLS }}" },
      },
      calls: [{ if: "runner.os == 'Windows'", uses: "./.github/actions/desktop-nsis-tools" }],
    },
  ],
  "test.yml: build": [
    ...npmSaverRestores("test.yml: build"),
    {
      step: {
        id: "next-cache",
        uses: "actions/cache/restore@v6",
        with: {
          key: "${{ runner.os }}-next-hermetic-${{ hashFiles('package-lock.json') }}",
          path: "apps/web/.next/cache/webpack",
          "restore-keys": "${{ runner.os }}-next-hermetic-\n",
        },
      },
      calls: [],
    },
  ],
  "test.yml: plan": [
    {
      step: { id: "turbo-install", uses: "actions/cache/restore@v6", with: { key: "${{ runner.os }}-${{ runner.arch }}-turbo-install-${{ steps.turbo.outputs.version }}", path: "${{ runner.temp }}/turbo" } },
      calls: [],
    },
    unitResultsLookup("web"),
    unitResultsLookup("mobile"),
    unitResultsLookup("workspace"),
    mergedUnitResultsLookup("web"),
    mergedUnitResultsLookup("mobile"),
    mergedUnitResultsLookup("workspace"),
  ],
  "merged-unit-results/action.yml": [mergedUnitResultsLookup("web", []), mergedUnitResultsLookup("mobile", []), mergedUnitResultsLookup("workspace", [])],
  "test.yml: unit-tests": [...installRestores(), unitResultsRestore("web"), unitResultsRestore("mobile"), unitResultsRestore("workspace")],
}

function checkReviewedRestores(currentTree, inventory) {
  const lists = new Map(inventory.filter(({ rule }) => EXACT_RESTORE_RULES.includes(rule))
    .map((line) => saveOf(currentTree, line.step).list).map((list) => [list.place, list]))
  assert.deepEqual([...lists.keys()].sort(), Object.keys(REVIEWED_RESTORES).sort(), "REVIEWED_RESTORES names each job that saves under the rule npm or the key of an exact restore")
  for (const [place, list] of lists) {
    assert.deepEqual(jobRestores(list), REVIEWED_RESTORES[place], `${place}: the restores of the job and its local actions are the reviewed restores`)
  }
}

// The inventory lines with the npm rule are the npm saves. checkReviewedRestores holds every restore of each npm saver job,
// and the reviewed npm restore of the job restores only the exact entry before the save.
function checkNpmSaves(currentTree, inventory) {
  const saves = inventory.filter(({ rule }) => rule === "npm").map((line) => saveOf(currentTree, line.step))
  assert.deepEqual(saves.map(({ list }) => list.place).sort(), Object.keys(NPM_SAVERS).sort(), "the npm savers")
  for (const { step, where, list, index } of saves) {
    const saver = NPM_SAVERS[list.place]
    assert.equal(step.uses, "actions/cache/save@v6", where)
    assert.equal(step.with.key, saver.key, where)
    assert.equal(step.if, `${saver.when} && ${saver.hit} != 'true'`, where)
    assert.equal(step.with.path, saver.path, where)
    const exact = npmSaverRestores(list.place).at(-1)
    assert.ok(REVIEWED_RESTORES[list.place]?.some((reviewed) => isDeepStrictEqual(reviewed, exact)), `${where}: the reviewed restores of the job hold its exact npm restore`)
    const restore = list.entries.findIndex((entry) => isDeepStrictEqual(restoreForm(entry), exact))
    assert.ok(restore >= 0 && restore < index, `${where}: the exact npm restore runs before the save`)
  }
  for (const list of cacheStepLists(currentTree).filter(({ place }) => !(place in NPM_SAVERS))) {
    for (const { step, where } of list.entries) {
      if (step.uses === "./.github/actions/install-dependencies") {
        assert.equal(step.with?.["restore-older-npm-entry"], undefined, `${where} never saves, so it keeps the prefix fallback`)
      }
      if (step.uses !== "./.github/actions/restore-npm-cache") continue
      // The install action passes its own input on, which defaults to the prefix fallback.
      const passedOn = where.includes("install-dependencies/action.yml: ") ? "${{ inputs.restore-older-npm-entry }}" : undefined
      assert.equal(step.with?.["restore-older-entry"], passedOn, `${where} never saves, so it keeps the prefix fallback`)
    }
  }
}

test("each npm entry holds only the tarballs of its own lockfile, because a job that saves it restores no older entry", () => {
  const { inputs, runs } = load(".github/actions/restore-npm-cache/action.yml")
  assert.equal(inputs["restore-older-entry"].default, "true")
  assert.equal(load(".github/actions/install-dependencies/action.yml").inputs["restore-older-npm-entry"].default, "true")
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
    "android-release.yml: release-android: Save the ccache directory",
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
// The evict step names the saved path, so ccache cleans that directory whatever the configuration of the job says: ccache
// at v4.9.1, src/core/mainoptions.cpp, process_main_options, sets CCACHE_DIR from --dir before it reads the configuration,
// and CCACHE_DIR outranks the system configuration, ~/.ccache and XDG_CACHE_HOME (src/Config.cpp, Config::read).
// --evict-older-than removes only old files inside the object directories, so the same step then removes each path that
// is not in the ccache layout, at every depth. Any step of the job can write a file into the saved directory, so the bound
// is the layout, not a list of writers.
const CCACHE_LAYOUT_SOURCE = "src/storage/local/LocalStorage.cpp at v4.9.1 and src/ccache/storage/local/localstorage.cpp at v4.14.2"
// The directories of the layout in CCACHE_LAYOUT_SOURCE (get_subdir, get_path_in_cache): level 1 is the 16 directories
// [0-9a-f], level 2 is the 16 directories [0-9a-f] in each of them, and levels 3 and 4 add one [0-9a-f] directory each
// when a level 2 directory holds too many files. The lock and tmp directories are outside the layout.
const CCACHE_DIRECTORY = "^[0-9a-f](/[0-9a-f]){0,3}$"
// The files of the layout: a stats file in each directory of level 1 and 2 (get_stats_file), CACHEDIR.TAG in each directory
// of level 1 (create_cachedir_tag), and an object file in a directory of level 2, 3 or 4, named by the key less its first
// 2, 3 or 4 characters. In 4.9.1 the key is 4 base16 and 29 base32hex characters (util::format_digest) and ends in M or R,
// and a raw file ends in a digit and W (get_raw_file_path). In 4.14.2 the key is 40 base16 characters (util::format_base16),
// and a raw file ends in _ and 2 base16 characters. ccache.conf, a log, a stats log and a file remote storage are outside.
const CCACHE_FILE = "^[0-9a-f]/(CACHEDIR\\.TAG|stats|[0-9a-f]/stats|[0-9a-f](/[0-9a-f]){0,2}/([0-9a-v]{29,31}([MR]|[0-9]W)|[0-9a-f]{36,38}(_[0-9a-f]{2})?))$"
const CCACHE_EVICT = (path) => `ccache --dir ${path} --evict-older-than "$(($(date +%s) - COMPILER_CACHE_USED_SINCE))s"`
// A job that saves a partial entry after a failed compile runs the step after every compile that ran. It evicts only after
// a passing compile, so a partial entry keeps the restored objects, and it cleans the layout before every save.
const compilerCacheEvict = (path, { partial = false } = {}) => `set -euo pipefail
${partial ? `if [[ $COMPILE_OUTCOME == success ]]; then\n  ${CCACHE_EVICT(path)}\nfi` : CCACHE_EVICT(path)}
cd ${path}
directory='${CCACHE_DIRECTORY}'
file='${CCACHE_FILE}'
find . -mindepth 1 -depth -print0 | while IFS= read -r -d '' entry; do
  layout=$file
  if [[ -d $entry ]]; then layout=$directory; fi
  if [[ -L $entry || ! ( -d $entry || -f $entry ) || ! \${entry#./} =~ $layout ]]; then rm -rf "$entry"; fi
done
`
const SAVES_A_PASSING_MAIN_COMPILE = "github.ref == 'refs/heads/main' && steps.compiler-cache.outputs.cache-hit != 'true'"
// The evict step has this id, and each save names its outcome. A failed, cancelled or skipped evict step skips the save, so
// no entry, under the primary key or a partial key, skips the clean.
const EVICT_ID = "evict"
const SAVES_AFTER_A_PASSING_EVICT = /^(\$\{\{ always\(\) && steps\.evict\.outcome == 'success' \}\}|steps\.evict\.outcome == 'success')$/
const PRIMARY_OR_PARTIAL_KEY = "${{ steps.compile.outcome == 'success' && steps.compiler-cache.outputs.cache-primary-key || format('{0}-partial-{1}-{2}', steps.compiler-cache.outputs.cache-primary-key, github.run_id, github.run_attempt) }}"
const PRIMARY_KEY_OUTPUT = "${{ steps.compiler-cache.outputs.cache-primary-key }}"
const COMPILE_OUTCOME_ENV = { COMPILE_OUTCOME: "${{ steps.compile.outcome }}" }
const LINUX_CCACHE_ENV = 'echo "CCACHE_AVAILABLE=true"\n    echo "CMAKE_C_COMPILER_LAUNCHER=ccache"\n    echo "CMAKE_CXX_COMPILER_LAUNCHER=ccache"'
const NO_LINUX_CCACHE = 'echo "::warning::ccache could not be installed, so the native C++ build runs without the compiler cache."'
const CCACHE_BINARY = `# React Native's compiler wrappers read CCACHE_BINARY from the process environment.
CCACHE_BINARY="$(command -v ccache)"
export CCACHE_BINARY
`
// Each saver with its reviewed path, its reviewed env and its reviewed ccache steps. The restore and the save name that
// exact path, the evict step is built from it, the evict step is the step just before the save, and the save runs only
// when the evict step passed. So each saved entry holds only the ccache layout, whatever the earlier steps wrote. The env
// of the job and its workflow, and each step of the job that names ccache in any letter case (other than its cache steps
// and its evict step), equal the reviewed form, as canonical steps without the name. That compare pins the reviewed
// settings; it does not bound the entry.
const COMPILER_CACHE_SAVERS = {
  "mobile-build.yml: build": {
    compile: "compile", path: "~/.cache/ccache", partial: true, key: PRIMARY_OR_PARTIAL_KEY,
    evictWhen: `\${{ always() && env.CCACHE_AVAILABLE == 'true' && steps.compile.outcome != 'skipped' && ${SAVES_A_PASSING_MAIN_COMPILE} }}`,
    env: { EXPO_PUBLIC_CAPTURE_MODE: "true", EXPO_NO_TELEMETRY: "1", EXPO_NO_METRO_WORKSPACE_ROOT: "1", GRADLE_OPTS: "-Dorg.gradle.caching=true" },
    ccacheSteps: [
      {
        shell: "bash",
        run: `set -euo pipefail
# A package mirror outage must not fail the compile, so the build runs without ccache.
if sudo apt-get update -qq && sudo apt-get install -y -qq ccache; then
  ccache --set-config=max_size=2G
  ccache --set-config=compiler_check=content
  ccache --zero-stats
  {
    ${LINUX_CCACHE_ENV}
  } >> "$GITHUB_ENV"
else
  ${NO_LINUX_CCACHE}
fi
`,
      },
      { if: "env.CCACHE_AVAILABLE == 'true'", run: "ccache --show-stats" },
    ],
  },
  "android-release.yml: release-android": {
    compile: "Build signed AAB with Gradle", path: "~/.cache/ccache", key: PRIMARY_KEY_OUTPUT, continueOnError: true,
    evictWhen: "env.CCACHE_AVAILABLE == 'true' && steps.compiler-cache.outputs.cache-hit != 'true'",
    env: {
      EAS_BUILD_PROFILE: "production",
      EXPO_PUBLIC_SENTRY_DSN: "${{ vars.EXPO_PUBLIC_SENTRY_DSN }}",
      EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER: "${{ vars.EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER }}",
      EXPO_PUBLIC_TURNSTILE_SITE_KEY: "${{ vars.EXPO_PUBLIC_TURNSTILE_SITE_KEY }}",
      EXPO_PUBLIC_APPLE_CLIENT_ID: "${{ vars.EXPO_PUBLIC_APPLE_CLIENT_ID }}",
      EXPO_PUBLIC_GOOGLE_CLIENT_ID: "${{ vars.EXPO_PUBLIC_GOOGLE_CLIENT_ID }}",
      SENTRY_AUTH_TOKEN: "${{ secrets.SENTRY_AUTH_TOKEN }}",
    },
    ccacheSteps: [
      {
        shell: "bash",
        run: `set -euo pipefail

# A package mirror outage must not fail the release, so the build runs without ccache.
if sudo apt-get update -qq && sudo apt-get install -y -qq ccache; then
  ccache --set-config=max_size=2G
  ccache --set-config=compiler_check=content
  ccache --zero-stats
  ccache --show-config | grep -E "max_size|compiler_check"
  {
    ${LINUX_CCACHE_ENV}
  } >> "$GITHUB_ENV"
else
  ${NO_LINUX_CCACHE}
fi
`,
      },
      {
        "working-directory": "apps/mobile/android",
        shell: "bash",
        env: {
          CLEAR_CACHE: "${{ inputs.clear_cache }}",
          EXPO_NO_METRO_WORKSPACE_ROOT: "1",
          EAS_BUILD_PROFILE: "${{ env.BUILD_EAS_PROFILE }}",
          EXPO_PUBLIC_API_BASE: "${{ env.BUILD_API_BASE }}",
          EXPO_PUBLIC_SENTRY_ENVIRONMENT: "${{ env.DEPLOYMENT_ENVIRONMENT }}",
          EXPO_PUBLIC_POSTHOG_KEY: "${{ env.BUILD_POSTHOG_KEY }}",
        },
        run: `set -euo pipefail

if [ "\${CLEAR_CACHE}" = "true" ]; then
  rm -rf "\${HOME}/.gradle/caches"
  rm -rf .gradle
  if [ "\${CCACHE_AVAILABLE:-}" = "true" ]; then
    ccache --clear
  fi
fi

chmod +x gradlew
./gradlew --no-daemon --build-cache -PreactNativeArchitectures=armeabi-v7a,arm64-v8a,x86_64 bundleRelease

if [ "\${CCACHE_AVAILABLE:-}" = "true" ]; then
  echo "ccache statistics for this build:"
  ccache --show-stats
fi
`,
      },
    ],
  },
  "ios-build.yml: compile": {
    compile: "compile", path: "${{ env.CCACHE_DIR }}", partial: true, key: PRIMARY_OR_PARTIAL_KEY,
    evictWhen: `\${{ always() && steps.compile.outcome != 'skipped' && ${SAVES_A_PASSING_MAIN_COMPILE} }}`,
    env: {
      ORBIT_APP_VARIANT: "staging",
      EXPO_NO_TELEMETRY: "1",
      EXPO_NO_METRO_WORKSPACE_ROOT: "1",
      EXPO_PUBLIC_API_BASE: "https://api-staging.useorbit.org",
      SENTRY_DISABLE_AUTO_UPLOAD: "true",
      USE_CCACHE: "1",
      CCACHE_DIR: "${{ github.workspace }}/.cache/ios-ccache",
      CCACHE_MAXSIZE: "2G",
      CCACHE_COMPILERCHECK: "content",
    },
    ccacheSteps: [
      { run: "brew install ccache" },
      { run: "ccache --zero-stats" },
      {
        id: "compile",
        "working-directory": "apps/mobile",
        env: { SKIP_BUNDLING: "1" },
        run: `set -euo pipefail
${CCACHE_BINARY}# The generic simulator destination also compiles x86_64, which doubles every compile and no shipped build uses.
xcodebuild -workspace ios/OrbitStaging.xcworkspace -scheme OrbitStaging \\
  -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \\
  -derivedDataPath "$RUNNER_TEMP/orbit-ios-build" ARCHS=arm64 \\
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO build
`,
      },
      {
        if: "${{ !cancelled() }}",
        run: `set -euo pipefail
ccache --show-stats
if ! ccache --print-stats | awk '
  $1 == "cache_miss" || $1 == "direct_cache_hit" || $1 == "preprocessed_cache_hit" { calls += $2 }
  END { exit(calls == 0) }
'; then
  echo "::error::ccache recorded zero cacheable compiler calls; check CCACHE_BINARY and the generated compiler settings." >&2
  exit 1
fi
`,
      },
    ],
  },
  "ios-release.yml: release": {
    compile: "archive", path: "${{ env.CCACHE_DIR }}", key: PRIMARY_KEY_OUTPUT, continueOnError: true,
    evictWhen: `steps.archive.outcome == 'success' && ${SAVES_A_PASSING_MAIN_COMPILE}`,
    env: {
      ORBIT_APP_VARIANT: "${{ inputs.variant }}",
      ORBIT_APPLE_TEAM_ID: "${{ vars.ORBIT_APPLE_TEAM_ID }}",
      ORBIT_IOS_APP_STORE_ID: "${{ vars.ORBIT_IOS_APP_STORE_ID }}",
      IOS_PROVISIONING_PROFILE_NAME: "${{ vars.IOS_PROVISIONING_PROFILE_NAME }}",
      IOS_WIDGET_PROVISIONING_PROFILE_NAME: "${{ vars.IOS_WIDGET_PROVISIONING_PROFILE_NAME }}",
      EXPO_PUBLIC_API_BASE: "${{ inputs.variant == 'staging' && 'https://api-staging.useorbit.org' || 'https://api.useorbit.org' }}",
      EXPO_PUBLIC_APP_STORE_MONTHLY_PRODUCT_ID: "${{ vars.EXPO_PUBLIC_APP_STORE_MONTHLY_PRODUCT_ID }}",
      EXPO_PUBLIC_APP_STORE_YEARLY_PRODUCT_ID: "${{ vars.EXPO_PUBLIC_APP_STORE_YEARLY_PRODUCT_ID }}",
      EXPO_PUBLIC_APPLE_CLIENT_ID: "${{ vars.EXPO_PUBLIC_APPLE_CLIENT_ID }}",
      EXPO_PUBLIC_GOOGLE_CLIENT_ID: "${{ vars.EXPO_PUBLIC_GOOGLE_CLIENT_ID }}",
      EXPO_PUBLIC_TURNSTILE_SITE_KEY: "${{ vars.EXPO_PUBLIC_TURNSTILE_SITE_KEY }}",
      EXPO_PUBLIC_SENTRY_DSN: "${{ vars.EXPO_PUBLIC_SENTRY_DSN }}",
      EXPO_PUBLIC_SENTRY_ENVIRONMENT: "${{ inputs.variant }}",
      SENTRY_AUTH_TOKEN: "${{ secrets.SENTRY_AUTH_TOKEN }}",
      SENTRY_ORG: "orbit-ai-habit-tracker",
      SENTRY_PROJECT: "orbit-mobile",
      APP_STORE_CONNECT_API_KEY_ID: "${{ secrets.APP_STORE_CONNECT_API_KEY_ID }}",
      APP_STORE_CONNECT_API_ISSUER_ID: "${{ secrets.APP_STORE_CONNECT_API_ISSUER_ID }}",
      EXPO_NO_TELEMETRY: "1",
      EXPO_NO_METRO_WORKSPACE_ROOT: "1",
      USE_CCACHE: "1",
      CCACHE_DIR: "${{ github.workspace }}/.cache/ios-device-ccache",
      CCACHE_MAXSIZE: "2G",
      CCACHE_COMPILERCHECK: "content",
    },
    ccacheSteps: [
      { run: "brew install ccache" },
      {
        id: "archive",
        "working-directory": "apps/mobile",
        run: `set -euo pipefail
${CCACHE_BINARY}scheme=Orbit
if [ "$ORBIT_APP_VARIANT" = staging ]; then scheme=OrbitStaging; fi
xcodebuild -workspace "ios/$scheme.xcworkspace" -scheme "$scheme" -configuration Release \\
  -destination 'generic/platform=iOS' -archivePath "$RUNNER_TEMP/Orbit.xcarchive" \\
  DEVELOPMENT_TEAM="$ORBIT_APPLE_TEAM_ID" CODE_SIGN_STYLE=Manual \\
  CODE_SIGN_IDENTITY='Apple Distribution' \\
  archive
`,
      },
      { run: "ccache --show-stats" },
    ],
  },
}
const COMPILER_CACHE_PATHS = new Set(Object.values(COMPILER_CACHE_SAVERS).map(({ path }) => path))
const savesExactly = (path) => `the save writes exactly ${path}, the directory that the evict step cleans`

// The stamp step and the evict step as a reviewer reads them. The name is free text; every other key is the reviewed form,
// so a shell, a working directory or an env cannot stop the step or move it to another directory, and only a release
// saver has continue-on-error.
const reviewedStep = (step, form) => canonical({ name: step?.name, ...form })
// The run defaults of a job or its workflow set the shell and the directory of each run step that names neither.
const assertNoRunDefaults = (workflow, job, where) =>
  assert.deepEqual([workflow.document.defaults, job.defaults], [undefined, undefined], `${where}: the job and its workflow set no run defaults`)

// The ccache settings of the job are the reviewed ones: the workflow sets no env, the job env is the reviewed env, and each
// step of the job that names ccache, other than its cache steps and its evict step, is a reviewed step in reviewed order.
// This is a pin of the reviewed settings. A setting from a file or a script passes it, and the evict step bounds its output.
function assertCompilerCacheSettings(list, { env, ccacheSteps }, evictStep, where) {
  assert.deepEqual({ workflow: list.workflow.document.env, job: list.job.env }, { workflow: undefined, job: env },
    `${where}: the env of the job and its workflow is the reviewed env`)
  const named = list.entries.filter(({ step }) => !restoresACache(step) && !savesACache(step) && step !== evictStep &&
    /ccache/i.test(JSON.stringify(canonicalStep(step))))
  assert.deepEqual(named.map(({ step }) => withoutName(step)), ccacheSteps.map(canonical), `${where}: each step that names ccache is a reviewed step`)
}

function checkCompilerCaches(currentTree) {
  const saves = cacheStepLists(currentTree).filter((list) => list.workflow).flatMap((list) => list.entries
    .filter(({ step }) => savesACache(step) && COMPILER_CACHE_PATHS.has(step.with?.path))
    .map(({ step, where }) => ({ step, list, where })))
  assert.deepEqual(saves.map(({ list }) => list.place).sort(), Object.keys(COMPILER_CACHE_SAVERS).sort(), "the compiler cache savers")
  const restorePrefixes = []
  const savedKeys = []
  for (const { step: save, list, where } of saves) {
    const saver = COMPILER_CACHE_SAVERS[list.place]
    const { compile: compileStep, evictWhen, path, partial, key, continueOnError } = saver
    const steps = list.entries.map((entry) => entry.step)
    assertNoRunDefaults(list.workflow, list.job, where)
    assert.equal(save.with.path, path, `${where}: ${savesExactly(path)}`)
    const restore = steps.findIndex((step) => restoresACache(step) && step.with?.path === path)
    assert.ok(restore >= 0, `${where}: a restore of the job restores exactly ${path}`)
    assert.ok(steps[restore].with["restore-keys"].trim().length > 0, `${where}: the job restores an older entry by prefix`)
    const stamps = steps.filter((step) => step.run?.includes("COMPILER_CACHE_USED_SINCE="))
    assert.equal(stamps.length, 1, `${where}: one step records the start of the compiler cache use`)
    const stamp = steps.indexOf(stamps[0])
    const compile = steps.findIndex((step) => step.id === compileStep || step.name === compileStep)
    const evicts = steps.filter((step) => step.run?.includes("--evict-older-than"))
    assert.equal(evicts.length, 1, `${where}: one step removes the objects that the compile did not use`)
    assert.equal(evicts[0].if, evictWhen, `${where}: the evict step runs on each run that can save`)
    assert.equal(stamps[0].if, undefined, `${where}: the stamp step always runs`)
    assert.deepEqual(canonicalStep(stamps[0]), reviewedStep(stamps[0], { run: COMPILER_CACHE_STAMP }), `${where}: the stamp step differs from its reviewed form`)
    // A release saver sets continueOnError, so a failed clean skips the save and not the upload. The save reads the outcome,
    // the result before continue-on-error applies: https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#steps-context
    const evictForm = {
      id: EVICT_ID, if: evictWhen, ...(partial ? { env: COMPILE_OUTCOME_ENV } : {}),
      ...(continueOnError ? { "continue-on-error": true } : {}), run: compilerCacheEvict(path, { partial }),
    }
    assert.deepEqual(canonicalStep(evicts[0]), reviewedStep(evicts[0], evictForm),
      `${where}: the evict step differs from its reviewed form, which cleans exactly ${path}`)
    assertCompilerCacheSettings(list, saver, evicts[0], where)
    const evict = steps.indexOf(evicts[0])
    assert.ok(restore < stamp && stamp < compile && compile < evict, `${where}: restore, then the stamp, then the compile, then the evict step`)
    // A combined actions/cache step saves in its post step, after every later step of the job, so only a save step can follow the evict step.
    assert.equal(actionName(save.uses), "actions/cache/save", `${where}: the save is an actions/cache/save step`)
    assert.equal(steps.indexOf(save), evict + 1, `${where}: the evict step is the step just before the save, so no other step writes after it`)
    // A status function such as always() runs the save after a failed step, so only the outcome of the evict step can stop it.
    assert.match(save.if ?? "", SAVES_AFTER_A_PASSING_EVICT, `${where}: the save runs only after a passing evict step, so no entry skips the clean`)
    assert.equal(save.with.key, key, `${where}: the save writes the reviewed key`)
    const restoreKey = steps[restore].with.key
    restorePrefixes.push({ where, prefixes: [restoreKey, ...steps[restore].with["restore-keys"].split("\n").map((line) => line.trim()).filter(Boolean)] })
    savedKeys.push({ where, keys: partial ? [restoreKey, `${restoreKey}-partial-`] : [restoreKey] })
  }
  // The restore takes the newest entry whose key starts with its key or a restore-keys line ("If there are multiple
  // partial matches for a restore key, the action returns the most recently created cache":
  // https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching). Two compiles hit only the
  // objects of their own compile, so a prefix that matches the key of another saver restores an entry with no hits.
  for (const { where, prefixes } of restorePrefixes) {
    for (const other of savedKeys.filter((saver) => saver.where !== where)) {
      const shared = prefixes.filter((prefix) => other.keys.some((key) => key.startsWith(prefix)))
      assert.deepEqual(shared, [], `${where}: a restore prefix also matches a key that ${other.where} saves, whose objects this compile does not hit`)
    }
  }
}

test("each compiler cache entry holds only the objects that its own compile used, so a key change does not grow it", () => {
  checkCompilerCaches(tree)
})

// CLAUDE.md rule 2: no export for a reader that does not exist. Another tracked file names each export of the cache scripts.
test("another file reads each name that the cache scripts export", () => {
  const scripts = [".github/scripts/cache-inventory.mjs", ".github/scripts/sweep-actions-caches.mjs"]
  const unread = scripts.flatMap((script) => [...readFileSync(join(root, script), "utf8").matchAll(/^export (?:async )?(?:const|function|class|let) ([\w$]+)/gm)]
    .map(([, name]) => name)
    .filter((name) => {
      const search = spawnSync("git", ["grep", "--quiet", "--word-regexp", "--fixed-strings", name, "--", ".", `:!${script}`], { cwd: root })
      assert.ok(search.status === 0 || search.status === 1, `git grep ${name}: ${search.stderr}`)
      return search.status === 1
    })
    .map((name) => `${script}: ${name}`))
  assert.deepEqual(unread, [])
})

const saveOf = (currentTree, where) => cacheSteps(currentTree, REMOTE_INVENTORY).find((save) => save.where === where)
const hasNoRestoreKeys = (step) => String(step.with?.["restore-keys"] ?? "").trim() === ""
const PRIMARY_KEY = /^\$\{\{ steps\.([\w-]+)\.outputs\.cache-primary-key \}\}$/
const assertNoInputs = (step, where, inputs) => {
  for (const input of inputs) assert.equal(step.with?.[input], undefined, `${where}: ${input}`)
}

// The exact path of each saver of a rule that a clean step or a tool bounds, by job. A rule compares the whole saved path
// and the whole restored path with this text, so another spelling of the path is a change that a reviewer makes here.
const PASS_MARKERS = {
  "android-startup.yml: boot": { path: ".ci-pass/android-boot", key: "${{ needs.scope.outputs.pass-key }}" },
  "ios-build.yml: record": { path: ".ci-pass/ios-compile", key: "${{ needs.plan.outputs.pass-key }}" },
  "mobile-build.yml: build": { path: ".ci-pass/android-compile", key: "${{ needs.plan.outputs.pass-key }}" },
}
const WEBPACK_CACHE_SAVERS = { "test.yml: build": "apps/web/.next/cache/webpack" }
const TURBO_CACHE_SAVERS = { "test.yml: type-check": ".turbo" }
const turboDelete = (path) => `find ${path} -type f -mtime +30 -delete`

// The rule of each inventory line: the actions that it covers, and the check that the cache step and its job follow it. A
// new rule is a change to this file, so a reviewer reads its reason. The line pins the whole step and its job, so a rule
// checks only why the entry stays bounded. Each check reads the canonical step and the canonical steps of its job.
const RULES = {
  // The key changes only with the inputs of the pass. The save writes the one file that PASS_MARKERS names for its job,
  // and the step before it writes only the commit SHA to that file. Each marker is under 300 bytes (229 and 232 bytes in
  // GET /repos/{owner}/{repo}/actions/caches), far under the 5 MB bound of LARGE_ENTRY_BYTES in sweep-actions-caches.mjs.
  // The sweep never deletes a pass marker, so a larger file under a pass key would stay.
  "pass marker": {
    actions: ["actions/cache/save"],
    check: ({ step, where, list, index }) => {
      assert.ok(Object.hasOwn(PASS_MARKERS, list.place), `${where}: PASS_MARKERS names the job`)
      const { path, key } = PASS_MARKERS[list.place]
      assert.equal(step.with.key, key, `${where}: the save writes the pass key of its workflow`)
      assert.equal(step.with.path, path, `${where}: a pass marker is the one file ${path}`)
      assertNoRunDefaults(list.workflow, list.job, where)
      const before = list.entries[index - 1]?.step
      assert.deepEqual(before, reviewedStep(before, { run: `mkdir -p .ci-pass && echo "$GITHUB_SHA" > ${path}` }),
        `${where}: the step before the save writes only the commit SHA to the marker`)
    },
  },
  // The post step of a combined step saves its own key after a miss. The next run restores that key, so nobody writes it again.
  "combined step with an exact key": {
    actions: ["actions/cache"],
    check: ({ step, where }) => assert.ok(hasNoRestoreKeys(step), `${where}: a combined step with restore-keys saves an older entry under a new key`),
  },
  // The save writes the key of a reviewed restore of the same path with no restore-keys, as its text or as the primary key
  // output of that restore. The next run restores that key, so nobody writes it again. checkReviewedRestores holds every
  // restore of the job, so no other restore fills the directory before the save.
  "the key of an exact restore": {
    actions: ["actions/cache/save"],
    check: ({ step, where, list }) => {
      assert.ok(Object.hasOwn(REVIEWED_RESTORES, list.place), `${where}: REVIEWED_RESTORES names the job`)
      const id = PRIMARY_KEY.exec(step.with.key)?.[1]
      const restore = REVIEWED_RESTORES[list.place].map((reviewed) => reviewed.step)
        .find((candidate) => (id === undefined ? candidate.with.key === step.with.key : candidate.id === id))
      assert.ok(restore, `${where}: no reviewed restore of the job has this key`)
      assert.equal(restore.with.path, step.with.path, `${where}: the restore of the key has the same path`)
      assert.ok(hasNoRestoreKeys(restore), `${where}: the restore of the key has no restore-keys`)
    },
  },
  // checkNpmSaves holds the key, the condition and the exact restore of each npm save, and checkReviewedRestores holds
  // every restore of its job.
  npm: {
    actions: ["actions/cache/save"],
    check: ({ step, list, where }) => {
      assert.ok(list.place in NPM_SAVERS, `${where}: NPM_SAVERS names the job`)
      assert.ok(Object.hasOwn(REVIEWED_RESTORES, list.place), `${where}: REVIEWED_RESTORES names the job`)
      assert.equal(step.with.path, NPM_SAVERS[list.place].path, `${where}: the npm save writes the npm cache directory`)
    },
  },
  // npm ci removes every node_modules directory before it installs, and it runs only after a miss of the exact key. So a
  // saved tree holds one install of one lockfile. The restore has no restore-keys, and no step between the install and
  // this save writes into the tree: only a cache step can run there, and checkReviewedRestores holds each restore.
  "the installed dependency tree": {
    actions: ["actions/cache/save"],
    check: ({ step, where, list, index }) => {
      assert.ok(Object.hasOwn(DEPENDENCY_TREE_SAVERS, list.place), `${where}: DEPENDENCY_TREE_SAVERS names the job`)
      assert.equal(step.with.path, DEPENDENCY_TREE_PATH, `${where}: the save writes exactly the dependency tree`)
      assert.equal(step.with.key, DEPENDENCY_TREE_SAVERS[list.place], `${where}: the save writes the key of the install`)
      assert.equal(step.if, "github.event_name != 'pull_request' && steps.install.outputs.cache-hit != 'true'", `${where}: only a miss outside a pull request saves`)
      const entries = list.entries.map((entry) => entry.step)
      const restores = entries.filter((candidate) => restoresACache(candidate) && candidate.with.path === DEPENDENCY_TREE_PATH)
      assert.equal(restores.length, 1, `${where}: one restore reads the dependency tree`)
      assert.equal(restores[0].with.key, DEPENDENCY_TREE_KEY, `${where}: the restore reads the key of this lockfile`)
      assert.ok(hasNoRestoreKeys(restores[0]), `${where}: the restore of the tree has no restore-keys`)
      const install = entries.findIndex((candidate) => /^npm ci\b/.test(candidate.run ?? ""))
      assert.ok(install >= 0 && install < index, `${where}: the save follows the install`)
      assert.deepEqual(entries.slice(install + 1, index).filter((candidate) => !savesACache(candidate) && !restoresACache(candidate)), [],
        `${where}: only a cache step runs between the install and this save`)
    },
  },
  // checkCompilerCaches holds the restore, the stamp step, the evict step and the order of each compiler cache save, with
  // the evict step just before the save. The evict step cleans only the reviewed directory of its job, so the save writes
  // exactly that path.
  "the evict step": {
    actions: ["actions/cache/save"],
    check: ({ step, list, where }) => {
      assert.ok(Object.hasOwn(COMPILER_CACHE_SAVERS, list.place), `${where}: COMPILER_CACHE_SAVERS names the job`)
      const { path } = COMPILER_CACHE_SAVERS[list.place]
      assert.equal(step.with?.path, path, `${where}: ${savesExactly(path)}`)
    },
  },
  // next/dist/compiled/webpack/bundle5.js sets the filesystem cache default maxAge to 1e3*60*60*24*60, and
  // next/dist/build/webpack-config.js sets cacheDirectory to <distDir>/cache/webpack and does not change maxAge: webpack
  // removes an item that no build read for 60 days. Nothing bounds the other directories under .next/cache, so the
  // restore and the save name exactly the webpack directory.
  "the webpack maxAge of 60 days": {
    actions: ["actions/cache/save"],
    check: ({ step, where, list }) => {
      assert.ok(Object.hasOwn(WEBPACK_CACHE_SAVERS, list.place), `${where}: WEBPACK_CACHE_SAVERS names the job`)
      const path = WEBPACK_CACHE_SAVERS[list.place]
      assert.equal(step.with.path, path, `${where}: the save writes exactly ${path}, the directory that webpack cleans`)
      const id = PRIMARY_KEY.exec(step.with.key)?.[1]
      const restore = list.entries.map((entry) => entry.step).find((candidate) => restoresACache(candidate) && candidate.id === id)
      assert.equal(restore?.with?.path, path, `${where}: the restore of the key restores exactly ${path}`)
    },
  },
  // Turbo keeps each result at <cacheDir>/<hash>.tar.zst with two JSON files and never removes one. The delete step cleans
  // the whole saved directory, and Turbo writes inside it: turbo.json sets no cacheDir and the job sets no TURBO_CACHE_DIR
  // and passes no --cache-dir, so the cache directory is the default .turbo/cache (node_modules/turbo/docs/reference/
  // configuration.mdx "cacheDir" and "global", docs/reference/system-environment-variables.mdx "TURBO_CACHE_DIR").
  "the delete of Turbo results older than 30 days": {
    actions: ["actions/cache/save"],
    check: ({ step, where, list, tree: currentTree }) => {
      assert.ok(Object.hasOwn(TURBO_CACHE_SAVERS, list.place), `${where}: TURBO_CACHE_SAVERS names the job`)
      const path = TURBO_CACHE_SAVERS[list.place]
      const steps = list.entries.map((entry) => entry.step)
      const before = steps[steps.indexOf(step) - 1]
      assert.equal(step.with.path, path, `${where}: the save writes exactly ${path}, the directory that the delete step cleans`)
      const id = PRIMARY_KEY.exec(step.with.key)?.[1]
      const restore = steps.find((candidate) => restoresACache(candidate) && candidate.id === id)
      assert.equal(restore?.with?.path, path, `${where}: the restore of the key restores exactly ${path}`)
      assertNoRunDefaults(list.workflow, list.job, where)
      const remove = turboDelete(path)
      assert.equal(before?.run, remove, `${where}: the step before the save deletes the Turbo results older than 30 days`)
      assert.equal(before.if, step.if, `${where}: the delete step runs on each run that saves`)
      assert.deepEqual(before, canonical({ if: step.if, name: "Remove the Turbo results that are older than 30 days", run: remove }),
        `${where}: the delete step differs from its reviewed form`)
      assert.deepEqual([currentTree.turbo.cacheDir, currentTree.turbo.global?.cacheDir], [undefined, undefined], `${where}: turbo.json sets no cacheDir, so Turbo writes under ${path}`)
      const envNames = [list.workflow.document.env, list.job.env, ...steps.map((candidate) => candidate.env)].flatMap((env) => Object.keys(env ?? {}))
      assert.deepEqual(envNames.filter((name) => /turbo_cache_dir/i.test(name)), [], `${where}: the job sets no TURBO_CACHE_DIR, so Turbo writes under ${path}`)
      assert.deepEqual(list.entries.filter((entry) => /turbo_cache_dir|--cache-dir/i.test(entry.step.run ?? "")).map((entry) => entry.where), [],
        `${where}: no step of the job sets TURBO_CACHE_DIR or --cache-dir, so Turbo writes under ${path}`)
    },
  },
  // actions/setup-node at 949feb2413d6458794dcd2491c4babbbce0c15c1 (v7), src/cache-save.ts: the post step saves the
  // npm cache from every ref on a key miss, and the action has no input that restores without a save.
  "setup-node with no package manager cache": {
    actions: ["actions/setup-node"],
    check: ({ step, where }) => {
      assert.equal(step.with?.["package-manager-cache"], false, where)
      assertNoInputs(step, where, ["cache", "cache-dependency-path"])
    },
  },
  // actions/setup-java at v6, action.yml: cache-jdk is on only when cache is set, and cache-path and cache-dependency-path
  // apply only with cache.
  "setup-java with no cache": {
    actions: ["actions/setup-java"],
    check: ({ step, where }) => assertNoInputs(step, where, ["cache", "cache-jdk", "cache-path", "cache-dependency-path"]),
  },
  // gradle/actions at 8da46b539cd8fe6ab27ca75128919a18d757604c, setup-gradle/action.yml: cache-cleanup defaults to
  // on-success, which removes the unused files of the Gradle User Home before the save, and gradle-home-cache-includes
  // defaults to caches and notifications, the paths that the cleanup reads. The writer test below holds the
  // cache-read-only input of each step.
  "one Gradle writer with the default cleanup": {
    actions: ["gradle/actions/setup-gradle"],
    check: ({ step, where }) => assertNoInputs(step, where, ["cache-write-only", "cache-disabled", "cache-cleanup", "gradle-home-cache-cleanup", "cache-overwrite-existing",
      "gradle-home-cache-includes", "gradle-home-cache-excludes"]),
  },
  // Swatinem/rust-cache at d1527c8f67ef9af357290475d4af4b0fab8f12e0: action.yml save-if decides whether the post step saves,
  // src/save.ts saves only when the lowercased input is "true", and cleanTargetDir, cleanRegistry and cleanGit run before
  // saveCache. Each target is one key family that Desktop Build writes, so a release of an older commit or another
  // environment would make the sweep delete the Desktop Build entry. src/config.ts adds each cache-directories path to the
  // saved paths with no clean step, and in src/save.ts cache-all-crates keeps every registry crate and
  // cache-workspace-crates keeps the workspace crates in the target directory.
  "one Rust writer": {
    actions: ["swatinem/rust-cache"],
    check: ({ step, where, list }) => {
      assert.equal(step.with["save-if"], list.place.startsWith("desktop-build.yml: ") ? "${{ github.ref == 'refs/heads/main' }}" : "false", where)
      assertNoInputs(step, where, ["cache-directories", "cache-all-crates", "cache-workspace-crates"])
    },
  },
  // docker/setup-buildx-action at f87e5991a6d7451dcb8d9637bfbc97413f497069 (v4), src/main.ts:53: the action downloads, and
  // with cache-binary caches, buildx only when the runner has none, a version is set or the driver is cloud. The Ubuntu
  // runner image has buildx.
  "the buildx of the runner image": {
    actions: ["docker/setup-buildx-action"],
    check: ({ step, where }) => {
      assertNoInputs(step, where, ["version"])
      assert.notEqual(step.with?.driver, "cloud", where)
    },
  },
  // docker/build-push-action at c3c9e263c25d99ce0380d002d59b67737d91b0dc (v7), action.yml: only cache-to exports a build cache.
  "no build cache export": { actions: ["docker/build-push-action"], check: ({ step, where }) => assertNoInputs(step, where, ["cache-to"]) },
  // github/codeql-action at 1bd86f2fdb4b86187fa4059f16f31a3202acc9ea: src/caching-utils.ts getCachingKind gives no dependency
  // cache for an unset input, and src/trap-caching.ts uploadTrapCaches saves only from the default branch. Cache Budget
  // deletes each overlay base database that a newer one replaced, then the older main entries above 5 MB.
  "CodeQL saves only on main": {
    actions: ["github/codeql-action/analyze", "github/codeql-action/init"],
    check: ({ step, where }) => assertNoInputs(step, where, ["dependency-caching", "trap-caching"]),
  },
}

// The fields of a line and the text of a failure when the tree differs from one of them.
const PINNED_FIELDS = {
  cacheStep: "the cache step differs",
  calls: "the call steps differ",
  restores: "the restores of its job differ",
  context: "the context of its job differs",
  stepsBeforeSave: "the steps before the save in its job differ",
}

// The save as a rule reads it: the canonical step, and its job with the canonical step of each entry.
function canonicalSave(save) {
  const entries = save.list.entries.map((entry) => ({ ...entry, step: canonicalStep(entry.step) }))
  return { ...save, step: entries[save.index].step, calls: save.calls.map(canonicalStep), list: { ...save.list, entries } }
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
    const { actions: covered, check } = rules[line.rule]
    assert.ok(covered.includes(actionName(save.step.uses)), `${save.where}: the rule "${line.rule}" does not cover ${actionName(save.step.uses)}`)
    check({ ...canonicalSave(save), tree: currentTree })
  }
  checkCompilerCaches(currentTree)
  checkReviewedRestores(currentTree, inventory)
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
    // A function keeps a $ pattern of the new text, such as the $' at the end of a quoted pattern, as text.
    text = text.replace(from, () => to)
  }
  return { [path]: text }
}
const newAction = (directory, steps) => ({ [`.github/actions/${directory}/action.yml`]: `name: ${directory}\ndescription: ${directory}\nruns:\n  using: composite\n  steps:\n${steps}` })

const TYPE_CHECK_RUN = "      - run: ./node_modules/.bin/turbo run type-check\n"
const WORKSPACE_ENV = "      ARTIFACT_NAME: workspace-unit-coverage-attempt-${{ github.run_attempt }}\n"
const WORKSPACE_RUN = "      - name: Run workspaces with coverage thresholds\n"
const evictRun = (path, options) => `run: |\n${compilerCacheEvict(path, options).trimEnd().split("\n").map((line) => `          ${line}`).join("\n")}`
const ANDROID_EVICT_RUN = evictRun("~/.cache/ccache")
const STAMP_STEP = `      # The stamp follows the restore, so every restored object is older than it.
      - name: Record the start of the compiler cache use
        run: echo "COMPILER_CACHE_USED_SINCE=$(date +%s)" >> "$GITHUB_ENV"
`
const ANDROID_RELEASE_EVICT = `      - name: Keep only the objects that this build used
        id: evict
        if: env.CCACHE_AVAILABLE == 'true' && steps.compiler-cache.outputs.cache-hit != 'true'
        continue-on-error: true
        ${ANDROID_EVICT_RUN}
`
const IOS_BUILD_EVICT = `      - name: Clean the ccache directory before its save
        id: evict
        if: \${{ always() && steps.compile.outcome != 'skipped' && github.ref == 'refs/heads/main' && steps.compiler-cache.outputs.cache-hit != 'true' }}
        env:
          COMPILE_OUTCOME: \${{ steps.compile.outcome }}
        ${evictRun("${{ env.CCACHE_DIR }}", { partial: true })}
`
const TURBO_DELETE = `      - name: Remove the Turbo results that are older than 30 days
        if: github.event_name != 'pull_request'
        run: find .turbo -type f -mtime +30 -delete
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
        uses: actions/cache/restore@v6
        with:
          path: \${{ env.WEB_UNIT_RESULTS }}
          key: \${{ steps.plan.outputs.web-unit-key }}
          lookup-only: true
`

// A case with WRITE runs the guard on the inventory that the write command makes for the changed tree, with the rule of each
// line kept, so only a rule can fail it. A function in its place changes that inventory as a reviewer could.
const WRITE = (inventory) => inventory
const withRule = (step, rule) => (inventory) => inventory.map((line) => (line.step === step ? { ...line, rule } : line))
const NO_LINE = /a cache step with no line/
const NO_REMOTE_LINE = /a remote action with no line/
const pinned = (field) => new RegExp(PINNED_FIELDS[field])
const IOS_INSTALL = "      - name: Install the compiler cache\n"
const NSIS_KEY = "        key: ${{ runner.os }}-nsis-tools-${{ hashFiles('apps/desktop/src-tauri/native/windows/nsis-tools.json') }}\n"
const SETUP_NODE_INPUT = "          package-manager-cache: false\n"
const RUST_SAVE_IF = "          save-if: \"false\"\n"
const TYPE_CHECK_JOB = "  type-check:\n    name: Type Check\n"
const MOBILE_BUILD_JOB = "  build:\n    name: Android release build\n"
const MOBILE_BUILD_STAMP = "      - name: Record the start of the compiler cache use\n        run: echo \"COMPILER_CACHE_USED_SINCE=$(date +%s)\" >> \"$GITHUB_ENV\"\n"
const IOS_RELEASE_EVICT_NAME = "      - name: Keep only the objects that this archive used\n"
const IOS_RELEASE_SAVE_PATH = "          path: ${{ env.CCACHE_DIR }}\n          key: ${{ steps.compiler-cache.outputs.cache-primary-key }}\n"
const NPM_SAVE_PATH = "          path: ${{ steps.install.outputs.npm-cache-path }}\n"
const DESKTOP_RUST_SAVE_IF = "          save-if: ${{ github.ref == 'refs/heads/main' }}\n"
const GRADLE_READ_ONLY = "          cache-read-only: true\n"
const IOS_CCACHE_PATH = "          path: ${{ env.CCACHE_DIR }}\n"
const IOS_CCACHE_AND_DERIVED = "          path: |\n            ${{ env.CCACHE_DIR }}\n            ${{ runner.temp }}/orbit-ios-build\n"
const MOBILE_CCACHE_PATH = "          path: ~/.cache/ccache\n"
const MOBILE_CCACHE_AND_CXX = "          path: |\n            ~/.cache/ccache\n            apps/mobile/android/app/.cxx\n"
const MOBILE_PASS_RECORD = "        run: mkdir -p .ci-pass && echo \"$GITHUB_SHA\" > .ci-pass/android-compile\n"
const MOBILE_PASS_PATH = "        uses: actions/cache/save@v6\n        with:\n          path: .ci-pass/android-compile\n"
const MOBILE_BUILD_GRADLE_OPTS = "      GRADLE_OPTS: -Dorg.gradle.caching=true\n"
const TYPE_CHECK_IF = "    if: needs.plan.outputs.type-check == 'true'\n"
const TURBO_JSON_HEAD = '{\n  "$schema": "https://turbo.build/schema.json",\n'
const NEXT_CACHE_PATH = "          path: apps/web/.next/cache/webpack\n"
const NPM_RESTORE_OLDER_ENTRY = "          restore-older-npm-entry: ${{ github.event_name == 'pull_request' }}\n"
const PLAN_HASH_STEP = "      - name: Hash the test tasks and read the changed paths\n"
const IOS_COMPILER_CHECK_ENV = "      CCACHE_COMPILERCHECK: content\n"
const MOBILE_COMPILER_CHECK = "            ccache --set-config=compiler_check=content\n"
const MOBILE_SHOW_STATS = "        run: ccache --show-stats\n"
const MOBILE_CCACHE_SAVE = "      - name: Save the ccache directory\n        if: ${{ always()"
const ANDROID_RELEASE_RESTORE = "        id: compiler-cache\n        if: env.CCACHE_AVAILABLE == 'true'\n        uses: actions/cache/restore@v6\n"
const ANDROID_RELEASE_SAVE = `      # A rerun attempt has the same run id, so it finds its own key and saves nothing.
      - name: Save the ccache directory
        if: steps.evict.outcome == 'success'
        uses: actions/cache/save@v6
        with:
          path: ~/.cache/ccache
          key: \${{ steps.compiler-cache.outputs.cache-primary-key }}
`
const KEEP_HISTORY = "      - run: bash .github/ci/keep-history.sh\n"
const BUILD_SAVE_IF = "        if: ${{ always() && steps.evict.outcome == 'success' }}\n"
const RELEASE_SAVE_IF = "        if: steps.evict.outcome == 'success'\n"
const RELEASE_EVICT_KEEPS_GOING = "        continue-on-error: true\n"
const MOBILE_EVICT_IF = "        if: ${{ always() && env.CCACHE_AVAILABLE == 'true' && steps.compile.outcome != 'skipped' && github.ref == 'refs/heads/main' && steps.compiler-cache.outputs.cache-hit != 'true' }}\n"
// The save of each job as round 17 had it: a failed, cancelled or skipped evict step did not stop it.
const saveWithoutTheEvictOutcome = (path, name, before, after) => changeText(path, [`      - name: ${name}\n${before}`, `      - name: ${name}\n${after}`])
const NO_SAVE_WITHOUT_A_PASSING_EVICT = (place) => new RegExp(`${place}: .*: the save runs only after a passing evict step`)
// The android-release job saves through the post step of a combined cache step again, after every later step of the job.
const ANDROID_RELEASE_COMBINED = changeText(".github/workflows/android-release.yml",
  [ANDROID_RELEASE_RESTORE, ANDROID_RELEASE_RESTORE.replace("actions/cache/restore@v6", "actions/cache@v6")], [ANDROID_RELEASE_SAVE, ""])
// A new workflow whose plan job gives a pass key and whose export job saves a path under it.
const webExport = (path, before) => ({
  ".github/workflows/web-export.yml": `name: Web export
on:
  push:
    branches: [main]
jobs:
  plan:
    runs-on: ubuntu-24.04
    outputs:
      pass-key: \${{ steps.key.outputs.value }}
    steps:
      - id: key
        run: echo "value=web-export-pass-v1-\${{ hashFiles('apps/web/**') }}" >> "$GITHUB_OUTPUT"
  export:
    needs: plan
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7
${before}      - name: Save the export
        uses: actions/cache/save@v6
        with:
          path: ${path}
          key: \${{ needs.plan.outputs.pass-key }}
`,
})
const LOCAL_ACTION = (runs) => ({ ".github/actions/turbo-cache/action.yml": `name: turbo-cache\ndescription: Saves .turbo\nruns:\n${runs}` })
const callTurboCache = typeCheckAround("      - uses: ./.github/actions/turbo-cache\n", "")
const MUTATIONS = [
  ["M1 the android-release evict step deleted", changeText(".github/workflows/android-release.yml", [ANDROID_RELEASE_EVICT, ""]), /one step removes the objects/, WRITE],
  ["M2 the ios-build stamp moved before the restore", changeText(".github/workflows/ios-build.yml", [STAMP_STEP, ""],
    ["      - name: Install the compiler cache\n", `${STAMP_STEP.split("\n").slice(1).join("\n")}      - name: Install the compiler cache\n`]), /restore, then the stamp/, WRITE],
  ["M3 the mobile-build stamp gets a condition", changeText(".github/workflows/mobile-build.yml", ["      - name: Record the start of the compiler cache use\n        run:",
    "      - name: Record the start of the compiler cache use\n        if: env.CCACHE_AVAILABLE == 'true'\n        run:"]), /the stamp step always runs/, WRITE],
  ["M4 the ios-release evict condition loses the archive outcome", changeText(".github/workflows/ios-release.yml",
    ["      - name: Keep only the objects that this archive used\n        id: evict\n        if: steps.archive.outcome == 'success' && ",
      "      - name: Keep only the objects that this archive used\n        id: evict\n        if: always() && "]), /the evict step runs on each run that can save/, WRITE],
  ["M5 the mobile-build evict step evicts after a failed compile too, so the partial entry loses the restored objects", changeText(".github/workflows/mobile-build.yml",
    [evictRun("~/.cache/ccache", { partial: true }), ANDROID_EVICT_RUN]), /mobile-build\.yml: build: Save the ccache directory: the evict step differs from its reviewed form/, WRITE],
  ["M6 the android-release evict step moved before the Gradle build", changeText(".github/workflows/android-release.yml", [ANDROID_RELEASE_EVICT, ""],
    ["      - name: Build signed AAB with Gradle\n", `${ANDROID_RELEASE_EVICT}      - name: Build signed AAB with Gradle\n`]), /restore, then the stamp, then the compile, then the evict step/, WRITE],
  ["M7 the Turbo delete step deleted", changeText(".github/workflows/test.yml", [TURBO_DELETE, ""]), /deletes the Turbo results older than 30 days/, WRITE],
  ["M8 the Turbo delete step deletes the new results", changeText(".github/workflows/test.yml", ["-mtime +30 -delete", "-mtime -30 -delete"]), /deletes the Turbo results older than 30 days/, WRITE],
  ["M9 the Turbo delete step runs on pull requests too", changeText(".github/workflows/test.yml",
    [TURBO_DELETE, TURBO_DELETE.replace("        if: github.event_name != 'pull_request'\n", "")]), /the delete step runs on each run that saves/, WRITE],
  ["M10 the ios-build evict step after the save", changeText(".github/workflows/ios-build.yml", [IOS_BUILD_EVICT, ""],
    ["      - name: Report compiler cache statistics\n", `${IOS_BUILD_EVICT}      - name: Report compiler cache statistics\n`]), /the evict step is the step just before the save/, WRITE],
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
    ...changeText(".github/workflows/test.yml", ["      - id: install\n        uses: ./.github/actions/install-dependencies\n",
      "      - uses: ./.github/actions/setup-workspace\n      - id: install\n        uses: ./.github/actions/install-dependencies\n"]),
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
  ["P12 a lookup of the plan job becomes a prefix restore of the installed Turbo path before its save", changeText(".github/workflows/test.yml", [WEB_UNIT_LOOKUP, ""],
    ["      - name: Hash the test tasks and read the changed paths\n", `      - name: Look up cached web unit results
        id: web-unit
        if: steps.turbo-install.outputs.cache-hit != 'true'
        uses: actions/cache/restore@v6
        with:
          path: \${{ runner.temp }}/turbo
          key: \${{ runner.os }}-\${{ runner.arch }}-turbo-install-
          restore-keys: |
            \${{ runner.os }}-\${{ runner.arch }}-turbo-install-
      - name: Hash the test tasks and read the changed paths
`]), pinned("restores")],
  ["P13 the ios-build CCACHE_DIR value becomes the macOS cache directory", changeText(".github/workflows/ios-build.yml",
    ["      CCACHE_DIR: ${{ github.workspace }}/.cache/ios-ccache\n", "      CCACHE_DIR: ~/Library/Caches\n"]), pinned("context")],
  ["P13b a step of the ios-build compile job writes CCACHE_DIR to GITHUB_ENV", changeText(".github/workflows/ios-build.yml",
    ["      - name: Install the compiler cache\n", "      - run: echo \"CCACHE_DIR=$HOME/Library/Caches\" >> \"$GITHUB_ENV\"\n      - name: Install the compiler cache\n"]), pinned("context")],
  ["P15 the install id moves to the Next restore", changeText(".github/workflows/test.yml",
    ["      - id: install\n", "      - id: install-tree\n"], ["        id: next-cache\n", "        id: install\n"]), /differs? from its inventory line/],
  ["P16 the Next save condition gains || true", changeText(".github/workflows/test.yml",
    [NEXT_SAVE, NEXT_SAVE.replace("&& steps.next-cache.outputs.cache-hit != 'true'", "|| true")]), pinned("cacheStep")],
  ["Q1 a step of the ios-build compile job runs a script that can write CCACHE_DIR to GITHUB_ENV", changeText(".github/workflows/ios-build.yml",
    [IOS_INSTALL, `      - name: Choose the compiler cache directory\n        run: node .github/scripts/compiler-cache-directory.mjs\n${IOS_INSTALL}`]), pinned("stepsBeforeSave")],
  ["Q2 a local JavaScript action with a post step", { ...LOCAL_ACTION("  using: node20\n  main: dist/restore.js\n  post: dist/save.js\n"), ...callTurboCache },
    /the guard reads only composite local actions/],
  ["Q2d a local Docker action", { ...LOCAL_ACTION("  using: docker\n  image: Dockerfile\n"), ...callTurboCache }, /the guard reads only composite local actions/],
  ["Q3 a docker:// step", typeCheckAround("", "      - uses: docker://GHCR.io/example/turbo-cache:1\n"), /a remote action with no line[^]*docker:\/\/ghcr\.io\/example\/turbo-cache'/],
  ["Q5 Restore-Keys on the combined step of a local action, after the write command", changeText(".github/actions/desktop-nsis-tools/action.yml",
    [NSIS_KEY, `${NSIS_KEY}        Restore-Keys: |\n          \${{ runner.os }}-nsis-tools-\n`]), /a combined step with restore-keys/, WRITE],
  ["Q6 Cache: npm on a setup-node step, after the write command", changeText(".github/workflows/test.yml",
    [SETUP_NODE_INPUT, `${SETUP_NODE_INPUT}          Cache: npm\n`]), /actions\/setup-node@v7: cache$/m, WRITE],
  ["Q6b cache and Cache on one setup-node step", changeText(".github/workflows/test.yml",
    [SETUP_NODE_INPUT, `${SETUP_NODE_INPUT}          cache: npm\n          Cache: npm\n`]), /two inputs of one step differ only in case/],
  ["R1 cache: npm on a setup-node step whose line names the build cache export rule", changeText(".github/workflows/test.yml",
    [SETUP_NODE_INPUT, `${SETUP_NODE_INPUT}          cache: npm\n`]), /the rule "no build cache export" does not cover actions\/setup-node/, withRule("test.yml: plan: actions/setup-node@v7", "no build cache export")],
  ["R2 a Desktop Release Rust step that saves on main, whose line names the setup-java rule", changeText(".github/workflows/desktop-release.yml",
    [RUST_SAVE_IF, "          save-if: ${{ github.ref == 'refs/heads/main' }}\n"]), /the rule "setup-java with no cache" does not cover swatinem\/rust-cache/,
  withRule("desktop-release.yml: build: Restore the Rust compile cache", "setup-java with no cache")],
  ["T1 the Turbo delete step runs in another directory and its failure does not stop the job", changeText(".github/workflows/test.yml",
    [TURBO_DELETE, `${TURBO_DELETE}        working-directory: apps/web\n        continue-on-error: true\n`]), /Save turbo: the delete step differs from its reviewed form/, WRITE],
  ["T1s the Turbo delete step runs in a shell that ignores its script", changeText(".github/workflows/test.yml",
    [TURBO_DELETE, `${TURBO_DELETE}        shell: true {0}\n`]), /Save turbo: the delete step differs from its reviewed form/, WRITE],
  ["T2 the Type Check job runs each run step in a shell that ignores its script", changeText(".github/workflows/test.yml",
    [TYPE_CHECK_JOB, `${TYPE_CHECK_JOB}    defaults:\n      run:\n        shell: true {0}\n`]), /Save turbo: the job and its workflow set no run defaults/, WRITE],
  ["EVs the ios-build evict step runs in a shell that ignores its script", changeText(".github/workflows/ios-build.yml",
    [IOS_BUILD_EVICT, `${IOS_BUILD_EVICT}        shell: true {0}\n`]), /ios-build\.yml: compile: Save compiler outputs: the evict step differs from its reviewed form/, WRITE],
  ["EVe the android-release evict step cleans another directory", changeText(".github/workflows/android-release.yml",
    [ANDROID_RELEASE_EVICT, `${ANDROID_RELEASE_EVICT}        env:\n          CCACHE_DIR: /tmp/other-ccache\n`]),
    /android-release\.yml: release-android: Save the ccache directory: the evict step differs from its reviewed form/, WRITE],
  ["STs the mobile-build stamp step runs in a shell that ignores its script", changeText(".github/workflows/mobile-build.yml",
    [MOBILE_BUILD_STAMP, `${MOBILE_BUILD_STAMP}        shell: true {0}\n`]), /mobile-build\.yml: build: Save the ccache directory: the stamp step differs from its reviewed form/, WRITE],
  ["ST2 a second ios-release stamp step just before the evict step", changeText(".github/workflows/ios-release.yml",
    [IOS_RELEASE_EVICT_NAME, `${STAMP_STEP.split("\n").slice(1).join("\n")}${IOS_RELEASE_EVICT_NAME}`]), /one step records the start of the compiler cache use/, WRITE],
  ["CP the ios-release save writes the parent of the restored directory", changeText(".github/workflows/ios-release.yml",
    [IOS_RELEASE_SAVE_PATH, IOS_RELEASE_SAVE_PATH.replace("${{ env.CCACHE_DIR }}", "${{ env.CCACHE_DIR }}/..")]), /ios-release\.yml: release: Save compiler outputs: the save writes exactly \$\{\{ env\.CCACHE_DIR \}\}/, WRITE],
  ["CD the mobile-build job runs each run step in another directory", changeText(".github/workflows/mobile-build.yml",
    [MOBILE_BUILD_JOB, `${MOBILE_BUILD_JOB}    defaults:\n      run:\n        working-directory: apps/mobile\n`]), /mobile-build\.yml: build: Save the (ccache directory|pass marker): the job and its workflow set no run defaults/, WRITE],
  ["E1 a prefix restore and a save of the derived data in the ios-build compile job, whose line names the evict step", changeText(".github/workflows/ios-build.yml",
    [IOS_INSTALL, `${restoreStep("Restore the derived data", "~/Library/Developer/Xcode/DerivedData", "derived-data-${{ github.sha }}", "derived-data-", "derived-data")}${
      saveStep("Save the derived data", "~/Library/Developer/Xcode/DerivedData", "${{ steps.derived-data.outputs.cache-primary-key }}")}${IOS_INSTALL}`]),
  /Save the derived data: the save writes exactly \$\{\{ env\.CCACHE_DIR \}\}/, withRule("ios-build.yml: compile: Save the derived data", "the evict step")],
  ["E2 a save of the web build output under a pass key, whose line names the pass marker rule", webExport("apps/web/.next", ""),
    /Save the export: PASS_MARKERS names the job/, withRule("web-export.yml: export: Save the export", "pass marker")],
  ["E2b the mobile-build pass marker step copies the build output into the marker path", changeText(".github/workflows/mobile-build.yml",
    [MOBILE_PASS_RECORD, MOBILE_PASS_RECORD.replace('echo "$GITHUB_SHA" >', "cp -r apps/mobile/android/app/build")]),
    /mobile-build\.yml: build: Save the pass marker: the step before the save writes only the commit SHA to the marker/, WRITE],
  ["E2p the mobile-build pass marker saves the marker and the build output in one path list", changeText(".github/workflows/mobile-build.yml",
    [MOBILE_PASS_PATH, MOBILE_PASS_PATH.replace("path: .ci-pass/android-compile\n", "path: |\n            .ci-pass/android-compile\n            apps/mobile/android/app/build\n")]),
    /mobile-build\.yml: build: Save the pass marker: a pass marker is the one file \.ci-pass\/android-compile/, WRITE],
  ["NP the Build npm save writes another directory", changeText(".github/workflows/test.yml", [NPM_SAVE_PATH, "          path: ~/.npm\n"]),
    /Save the npm cache: the npm save writes the npm cache directory/, WRITE],
  ["RC the Desktop Build Rust step saves an extra directory", changeText(".github/workflows/desktop-build.yml",
    [DESKTOP_RUST_SAVE_IF, `${DESKTOP_RUST_SAVE_IF}          cache-directories: apps/desktop/node_modules\n`]), /Restore the Rust compile cache: cache-directories/, WRITE],
  ["GI the Android Release Gradle step caches the wrapper directory too", changeText(".github/workflows/android-release.yml",
    [GRADLE_READ_ONLY, `${GRADLE_READ_ONLY}          gradle-home-cache-includes: |\n            caches\n            wrapper\n`]), /gradle-home-cache-includes/, WRITE],
  ["A1 the ios-build compile job restores and saves the ccache directory and the derived data of its compile in one path list",
    changeText(".github/workflows/ios-build.yml", [IOS_CCACHE_PATH, IOS_CCACHE_AND_DERIVED], [IOS_CCACHE_PATH, IOS_CCACHE_AND_DERIVED]),
    /ios-build\.yml: compile: Save compiler outputs: the save writes exactly \$\{\{ env\.CCACHE_DIR \}\}/, WRITE],
  ["A1r the ios-build compile job restores the ccache directory and the derived data in one path list", changeText(".github/workflows/ios-build.yml",
    [IOS_CCACHE_PATH, IOS_CCACHE_AND_DERIVED]), /ios-build\.yml: compile: Save compiler outputs: a restore of the job restores exactly \$\{\{ env\.CCACHE_DIR \}\}/, WRITE],
  ["A2 the mobile-build job restores and saves the ccache directory and the CMake build directory in one path list",
    changeText(".github/workflows/mobile-build.yml", [MOBILE_CCACHE_PATH, MOBILE_CCACHE_AND_CXX], [MOBILE_CCACHE_PATH, MOBILE_CCACHE_AND_CXX]),
    /mobile-build\.yml: build: Save the ccache directory: the save writes exactly ~\/\.cache\/ccache/, WRITE],
  ["EVj the mobile-build job env moves the ccache directory away from the saved path", changeText(".github/workflows/mobile-build.yml",
    [MOBILE_BUILD_GRADLE_OPTS, `${MOBILE_BUILD_GRADLE_OPTS}      XDG_CACHE_HOME: /tmp/other-cache\n`]),
    /mobile-build\.yml: build: Save the ccache directory: the env of the job and its workflow is the reviewed env/, WRITE],
  ["EVr a step of the android-release job creates the legacy ccache directory", changeText(".github/workflows/android-release.yml",
    [ANDROID_RELEASE_EVICT, `      - run: mkdir -p ~/.ccache\n${ANDROID_RELEASE_EVICT}`]),
    /android-release\.yml: release-android: Save the ccache directory: each step that names ccache is a reviewed step/, WRITE],
  ["B1 turbo.json moves the Turbo cache directory", changeText("turbo.json", [TURBO_JSON_HEAD, `${TURBO_JSON_HEAD}  "cacheDir": ".turbo/results",\n`]),
    /Save turbo: turbo\.json sets no cacheDir/],
  ["B2 the Type Check job env moves the Turbo cache directory", changeText(".github/workflows/test.yml",
    [TYPE_CHECK_IF, `${TYPE_CHECK_IF}    env:\n      TURBO_CACHE_DIR: .turbo/results\n`]), /Save turbo: the job sets no TURBO_CACHE_DIR/, WRITE],
  ["B3 the Type Check run passes another cache directory", changeText(".github/workflows/test.yml",
    [TYPE_CHECK_RUN, "      - run: ./node_modules/.bin/turbo run type-check --cache-dir=.turbo/results\n"]), /Save turbo: no step of the job sets TURBO_CACHE_DIR or --cache-dir/, WRITE],
  ["T3 the Turbo delete step cleans only the cache directory under the saved path", changeText(".github/workflows/test.yml",
    ["        run: find .turbo -type f -mtime +30 -delete\n", "        run: find .turbo/cache -type f -mtime +30 -delete\n"]),
    /Save turbo: the step before the save deletes the Turbo results older than 30 days/, WRITE],
  ["W1 the Build job restores and saves the whole Next cache directory", changeText(".github/workflows/test.yml",
    [NEXT_CACHE_PATH, "          path: apps/web/.next/cache\n"], [NEXT_CACHE_PATH, "          path: apps/web/.next/cache\n"]),
    /Save the Next compiler cache: the save writes exactly apps\/web\/\.next\/cache\/webpack/, WRITE],
  ["W2 the Build job restores the whole Next cache directory", changeText(".github/workflows/test.yml", [NEXT_CACHE_PATH, "          path: apps/web/.next/cache\n"]),
    /Save the Next compiler cache: the restore of the key restores exactly apps\/web\/\.next\/cache\/webpack/, WRITE],
  ["G1 the Build job restores an older npm entry by prefix under another key after its exact npm restore", changeText(".github/workflows/test.yml",
    [NPM_RESTORE_OLDER_ENTRY, `${NPM_RESTORE_OLDER_ENTRY}      - name: Restore an older npm entry
        if: steps.install.outputs.cache-hit != 'true'
        uses: actions/cache/restore@v6
        with:
          path: "\${{ steps.install.outputs.npm-cache-path }}"
          key: npm-older-\${{ github.sha }}
          restore-keys: npm-\${{ runner.os }}-\${{ runner.arch }}-
`]), /test\.yml: build: the restores of the job and its local actions are the reviewed restores/, WRITE],
  ["G2 the plan job restores an older installed Turbo by prefix under another key", changeText(".github/workflows/test.yml",
    [PLAN_HASH_STEP, `${restoreStep("Restore an older installed Turbo", "${{ runner.temp }}/turbo", "older-turbo-install-${{ github.sha }}", "${{ runner.os }}-${{ runner.arch }}-turbo-install-")}${PLAN_HASH_STEP}`]),
  /test\.yml: plan: the restores of the job and its local actions are the reviewed restores/, WRITE],
  ["N1 the install action restores the dependency tree of an older lockfile by prefix", changeText(".github/actions/install-dependencies/action.yml",
    ["        key: modules-", "        restore-keys: modules-\n        key: modules-"]), /the restore of the tree has no restore-keys/, WRITE],
  ["N2 a Build step writes into the dependency tree before its save", changeText(".github/workflows/test.yml",
    ["      - name: Save the installed dependencies\n", "      - run: node .github/scripts/write-into-the-tree.mjs\n      - name: Save the installed dependencies\n"]),
  /only a cache step runs between the install and this save/, WRITE],
  ["G3 the ios-build compile job env writes the ccache log inside the saved directory", changeText(".github/workflows/ios-build.yml",
    [IOS_COMPILER_CHECK_ENV, `${IOS_COMPILER_CHECK_ENV}      CCACHE_LOGFILE: \${{ github.workspace }}/.cache/ios-ccache/ccache.log\n`]),
  /ios-build\.yml: compile: Save compiler outputs: the env of the job and its workflow is the reviewed env/, WRITE],
  ["G4 the mobile-build setup step sets a ccache log file inside the saved directory", changeText(".github/workflows/mobile-build.yml",
    [MOBILE_COMPILER_CHECK, `${MOBILE_COMPILER_CHECK}            ccache --set-config=log_file="$HOME/.cache/ccache/ccache.log"\n`]),
  /mobile-build\.yml: build: Save the ccache directory: each step that names ccache is a reviewed step/, WRITE],
  ["G5 a mobile-build step installs a system ccache configuration that moves the cache directory before the evict step", {
    ".github/ccache.conf": "cache_dir = /mnt/ccache\n",
    ...changeText(".github/workflows/mobile-build.yml", [MOBILE_SHOW_STATS, `${MOBILE_SHOW_STATS}      - run: sudo cp .github/ccache.conf /etc/ccache.conf\n`]),
  }, /mobile-build\.yml: build: Save the ccache directory: each step that names ccache is a reviewed step/, WRITE],
  ["C7b a mobile-build step between the evict step and the save runs a script that appends to a file in the saved directory",
    changeText(".github/workflows/mobile-build.yml", [MOBILE_CCACHE_SAVE, `${KEEP_HISTORY}${MOBILE_CCACHE_SAVE}`]),
    /mobile-build\.yml: build: Save the ccache directory: the evict step is the step just before the save/, WRITE],
  ["C7c an android-release step between the evict step and the save runs a script that appends to a file in the saved directory",
    changeText(".github/workflows/android-release.yml", [ANDROID_RELEASE_SAVE, `${KEEP_HISTORY}${ANDROID_RELEASE_SAVE}`]),
    /android-release\.yml: release-android: Save the ccache directory: the evict step is the step just before the save/, WRITE],
  ["S1 the mobile-build save runs after a failed evict step and saves the primary key after a passing compile", saveWithoutTheEvictOutcome(
    ".github/workflows/mobile-build.yml", "Save the ccache directory", BUILD_SAVE_IF,
    "        if: ${{ always() && env.CCACHE_AVAILABLE == 'true' && steps.compile.outcome != 'skipped' && github.ref == 'refs/heads/main' && steps.compiler-cache.outputs.cache-hit != 'true' }}\n"),
  NO_SAVE_WITHOUT_A_PASSING_EVICT("mobile-build\\.yml: build"), WRITE],
  ["S2 the ios-build save runs after a failed evict step and saves the primary key after a passing compile", saveWithoutTheEvictOutcome(
    ".github/workflows/ios-build.yml", "Save compiler outputs", BUILD_SAVE_IF,
    "        if: ${{ always() && steps.compile.outcome != 'skipped' && github.ref == 'refs/heads/main' && steps.compiler-cache.outputs.cache-hit != 'true' }}\n"),
  NO_SAVE_WITHOUT_A_PASSING_EVICT("ios-build\\.yml: compile"), WRITE],
  ["S3 the android-release save runs after a failed evict step", saveWithoutTheEvictOutcome(
    ".github/workflows/android-release.yml", "Save the ccache directory", RELEASE_SAVE_IF,
    "        if: ${{ always() && env.CCACHE_AVAILABLE == 'true' && steps.compiler-cache.outputs.cache-hit != 'true' }}\n"),
  NO_SAVE_WITHOUT_A_PASSING_EVICT("android-release\\.yml: release-android"), WRITE],
  ["S4 the ios-release save runs after a cancelled evict step", saveWithoutTheEvictOutcome(
    ".github/workflows/ios-release.yml", "Save compiler outputs", RELEASE_SAVE_IF,
    "        if: ${{ !failure() && steps.archive.outcome == 'success' && github.ref == 'refs/heads/main' && steps.compiler-cache.outputs.cache-hit != 'true' }}\n"),
  NO_SAVE_WITHOUT_A_PASSING_EVICT("ios-release\\.yml: release"), WRITE],
  ["S5 the mobile-build evict step runs only after a passing compile, so the partial entry skips the clean", changeText(".github/workflows/mobile-build.yml",
    [MOBILE_EVICT_IF, "        if: ${{ env.CCACHE_AVAILABLE == 'true' && steps.compile.outcome == 'success' && github.ref == 'refs/heads/main' && steps.compiler-cache.outputs.cache-hit != 'true' }}\n"]),
  /mobile-build\.yml: build: Save the ccache directory: the evict step runs on each run that can save/, WRITE],
  ["CE1 the ios-release evict step loses continue-on-error, so a failed clean fails the TestFlight upload", changeText(".github/workflows/ios-release.yml",
    [RELEASE_EVICT_KEEPS_GOING, ""]), /ios-release\.yml: release: Save compiler outputs: the evict step differs from its reviewed form/, WRITE],
  ["CE2 the android-release evict step loses continue-on-error, so a failed clean fails the Play upload", changeText(".github/workflows/android-release.yml",
    [RELEASE_EVICT_KEEPS_GOING, ""]), /android-release\.yml: release-android: Save the ccache directory: the evict step differs from its reviewed form/, WRITE],
  ["CE3 the android-release save reads the evict conclusion, which is success after a failed clean", saveWithoutTheEvictOutcome(
    ".github/workflows/android-release.yml", "Save the ccache directory", RELEASE_SAVE_IF, "        if: steps.evict.conclusion == 'success'\n"),
  NO_SAVE_WITHOUT_A_PASSING_EVICT("android-release\\.yml: release-android"), WRITE],
  ["CE4 the mobile-build evict step gets continue-on-error, so a failed clean on main turns no job red", changeText(".github/workflows/mobile-build.yml",
    [MOBILE_EVICT_IF, `${MOBILE_EVICT_IF}${RELEASE_EVICT_KEEPS_GOING}`]),
  /mobile-build\.yml: build: Save the ccache directory: the evict step differs from its reviewed form/, WRITE],
  ["CK1 the mobile-build restore falls back to the android-release prefix, so after a lockfile change it restores a release entry with no hits", changeText(".github/workflows/mobile-build.yml",
    ["            ccache-android-apk-\n", "            ccache-android-release-\n"]),
  /mobile-build\.yml: build: Save the ccache directory: a restore prefix also matches a key that android-release\.yml: release-android: Save the ccache directory saves/, WRITE],
  ["CK2 the android-release restore falls back to the mobile-build prefix, so after a lockfile change it restores a compile entry with no hits", changeText(".github/workflows/android-release.yml",
    ["            ccache-android-release-\n", "            ccache-android-apk-\n"]),
  /android-release\.yml: release-android: Save the ccache directory: a restore prefix also matches a key that mobile-build\.yml: build: Save the ccache directory saves/, WRITE],
  ["C8 the android-release job saves through the post step of a combined cache step, whose line names the evict step", ANDROID_RELEASE_COMBINED,
    /Restore the ccache directory: the rule "the evict step" does not cover actions\/cache$/m,
    withRule("android-release.yml: release-android: Restore the ccache directory", "the evict step")],
]

for (const [name, changes, reason, review] of MUTATIONS) {
  test(`the guard fails on ${name}`, () => {
    assert.throws(() => {
      const changed = readTree(changes)
      cacheGuard(changed, review ? review(reviewedInventory(changed)) : INVENTORY)
    }, reason)
  })
}

test("a compiler cache save in the post step of a combined cache step fails the compiler cache check", () => {
  assert.throws(() => checkCompilerCaches(readTree(ANDROID_RELEASE_COMBINED)),
    /android-release\.yml: release-android: Restore the ccache directory: the save is an actions\/cache\/save step/)
})

// Objects, stats files and tags as a real compile wrote them with ccache 4.9.1 and 4.14.2, with the names that the same
// keys get at levels 3 and 4. The other paths are what ccache, a setting from a file or a script, or another step can
// leave in the saved directory: a configuration file, the lock and tmp directories, logs, a file remote storage, a
// temporary file of a failed clone, and files in non-layout places.
const CCACHE_LAYOUT_FILES = [
  "0/stats", "0/0/stats", "4/CACHEDIR.TAG", "4/b/86crhul92ad5er6dg3r02jesp2kihvsR", "4/b/86crhul92ad5er6dg3r02jesp2kihvs0W",
  "2/0/b7ndefumsjk038q42bncvfjbmcol7ikM", "4/b/8/6crhul92ad5er6dg3r02jesp2kihvsR", "4/b/8/6/crhul92ad5er6dg3r02jesp2kihvs9W",
  "a/3/476e955e567349d3b61e01b4778955e078ff8c", "a/3/476e955e567349d3b61e01b4778955e078ff8c_00",
  "a/3/4/76e955e567349d3b61e01b4778955e078ff8c_0a", "a/3/4/7/6e955e567349d3b61e01b4778955e078ff8c",
]
const OUTSIDE_CCACHE_LAYOUT = [
  "ccache.conf", "lock/subdir_4b", "tmp/.cleaned", "tmp/inode-cache-64.v4", "x", "0/ccache.log", "0/0/ccache.log", "1/stats.log",
  "2/remote/44/586l71cllkrgnohv7325d9k0tq9g2jc", "0/0/remote/5b/f9886624844742c2551781c8139685ba432184", "3/history.log",
  "3/4/history.log", "3/4/5/history.log", "3/4/5/6/7/history.log", "9/9/a", "9/9/0123456789abcdef0123456789abcdef0123456789abcdef",
  "8/history/file", "e/f/43b3gd3eto4hukug9519cgldidde9n80W.tmp.kuRTBe.tmp",
]

// Each path under a directory, with whether it is a directory. A symbolic link is not a directory.
const walk = (root, prefix = "") => readdirSync(join(root, prefix), { withFileTypes: true }).flatMap((entry) => {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name
  return entry.isDirectory() ? [{ path, directory: true }, ...walk(root, path)] : [{ path, directory: false }]
})

// Runs the evict step of a job of the tree, in bash -e as the runner does, on a saved directory that holds the files and
// two symbolic links. COMPILE_OUTCOME is the value that the env of the step gives. The ccache on the PATH removes nothing
// and records each call; with ccacheExit 1 it fails as a ccache error does. Returns the exit status, the ccache calls and
// what is left.
function runEvictStep(currentTree, place, files, { compileOutcome = "success", ccacheExit = 0 } = {}) {
  const { run } = cacheStepLists(currentTree).find((list) => list.place === place).entries
    .find(({ step }) => step.run?.includes("--evict-older-than")).step
  const directory = mkdtempSync(join(tmpdir(), "ccache-evict-"))
  try {
    const home = join(directory, "home")
    const bin = join(directory, "bin")
    const saved = COMPILER_CACHE_SAVERS[place].path.replace(/^~/, home).replace("${{ env.CCACHE_DIR }}", join(directory, "workspace-ccache"))
    for (const file of files) {
      mkdirSync(dirname(join(saved, file)), { recursive: true })
      writeFileSync(join(saved, file), file)
    }
    mkdirSync(join(saved, "9"), { recursive: true })
    symlinkSync(join(saved, "0"), join(saved, "9/link"))
    symlinkSync(directory, join(saved, "link"))
    mkdirSync(bin)
    const calls = join(directory, "ccache-calls")
    writeFileSync(join(bin, "ccache"), `#!/usr/bin/env bash\necho "$*" >> "${calls}"\nexit ${ccacheExit}\n`)
    chmodSync(join(bin, "ccache"), 0o755)
    const result = spawnSync("bash", ["-e", "-c", run.replaceAll("${{ env.CCACHE_DIR }}", saved)], {
      encoding: "utf8",
      env: { PATH: `${bin}:${process.env.PATH}`, HOME: home, COMPILER_CACHE_USED_SINCE: "0", COMPILE_OUTCOME: compileOutcome },
    })
    const left = walk(saved)
    return {
      status: result.status,
      output: result.stdout + result.stderr,
      ccacheCalls: existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : [],
      files: left.filter((entry) => !entry.directory).map(({ path }) => path).sort(),
      directories: left.filter((entry) => entry.directory).map(({ path }) => path),
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test(`the evict step of each compiler cache job keeps only the ccache layout of ${CCACHE_LAYOUT_SOURCE}`, () => {
  for (const place of Object.keys(COMPILER_CACHE_SAVERS)) {
    const left = runEvictStep(tree, place, [...CCACHE_LAYOUT_FILES, ...OUTSIDE_CCACHE_LAYOUT])
    assert.equal(left.status, 0, left.output)
    assert.equal(left.ccacheCalls.length, 1, `${place}: the step evicts the objects that a passing compile did not use`)
    assert.deepEqual(left.files, [...CCACHE_LAYOUT_FILES].sort(), `${place}: the files that the evict step keeps`)
    assert.deepEqual(left.directories.filter((path) => !new RegExp(CCACHE_DIRECTORY).test(path)), [], `${place}: the directories that the evict step keeps`)
  }
})

// A ccache setting from a repository file or a script names no ccache in the job, so the settings pin passes it, and the
// compile writes its log into the saved directory before the evict step. The guard passes on the written inventory, and
// the evict step of the changed job removes every file that the setting adds.
const MOBILE_COMPILE = "      - name: Build the release APK\n"
const IOS_COMPILE = "      - name: Compile without signing or launching a simulator\n"
const LAYOUT_CASES = [
  ["C1 a mobile-build step loads a ccache log file setting from a repository env file", "mobile-build.yml: build",
    changeText(".github/workflows/mobile-build.yml", [MOBILE_COMPILE, `      - run: cat .github/ci/build.env >> "$GITHUB_ENV"\n${MOBILE_COMPILE}`]), ["0/ccache.log"]],
  ["C2 an ios-build step runs a script that writes a ccache log and stats log setting to GITHUB_ENV", "ios-build.yml: compile",
    changeText(".github/workflows/ios-build.yml", [IOS_COMPILE, `      - run: bash .github/ci/ios-build-env.sh\n${IOS_COMPILE}`]), ["0/ccache.log", "1/stats.log"]],
  ["C3 a mobile-build step copies a ccache configuration file with a log file and a file remote storage", "mobile-build.yml: build",
    changeText(".github/workflows/mobile-build.yml", [MOBILE_COMPILE, `      - run: mkdir -p ~/.config && cp -R .github/ci/config/. ~/.config/\n${MOBILE_COMPILE}`]),
    ["0/ccache.log", "2/remote/44/586l71cllkrgnohv7325d9k0tq9g2jc"]],
]
for (const [name, place, changes, written] of LAYOUT_CASES) {
  test(`the evict step bounds the entry on ${name}`, () => {
    const changed = readTree(changes)
    assert.doesNotThrow(() => cacheGuard(changed, WRITE(reviewedInventory(changed))))
    const left = runEvictStep(changed, place, [...CCACHE_LAYOUT_FILES, ...written])
    assert.equal(left.status, 0, left.output)
    assert.deepEqual(left.files, [...CCACHE_LAYOUT_FILES].sort())
  })
}

// A failed main compile saves a partial entry in the jobs that name one. The evict step runs after the failed compile, so
// the partial entry has the clean too. It does not evict, so the next attempt restores every object of the older entry.
test("after a failed compile, the evict step keeps the restored objects and removes every path outside the ccache layout", () => {
  const partial = Object.keys(COMPILER_CACHE_SAVERS).filter((place) => COMPILER_CACHE_SAVERS[place].partial)
  assert.deepEqual(partial, ["mobile-build.yml: build", "ios-build.yml: compile"])
  for (const place of partial) {
    // A ccache that fails on each call shows that the step calls none.
    const left = runEvictStep(tree, place, [...CCACHE_LAYOUT_FILES, ...OUTSIDE_CCACHE_LAYOUT], { compileOutcome: "failure", ccacheExit: 1 })
    assert.equal(left.status, 0, `${place}: ${left.output}`)
    assert.deepEqual(left.ccacheCalls, [], `${place}: the step evicts nothing after a failed compile`)
    assert.deepEqual(left.files, [...CCACHE_LAYOUT_FILES].sort(), `${place}: the files of the partial entry`)
  }
})

// A ccache error, a failed rm or an unset stamp stops the evict step, and the save of each job names the outcome of that
// step. So the save does not store a directory that the step did not clean.
test("a failing ccache stops the evict step of each job, and its save runs only after a passing evict step", () => {
  for (const place of Object.keys(COMPILER_CACHE_SAVERS)) {
    const left = runEvictStep(tree, place, [...CCACHE_LAYOUT_FILES, ...OUTSIDE_CCACHE_LAYOUT], { ccacheExit: 1 })
    assert.notEqual(left.status, 0, `${place}: the step fails with its ccache`)
    assert.ok(left.files.includes("0/ccache.log"), `${place}: the step stops before the clean`)
    const save = cacheStepLists(tree).find((list) => list.place === place).entries
      .find(({ step }) => savesACache(step) && step.with?.path === COMPILER_CACHE_SAVERS[place].path).step
    assert.match(save.if, SAVES_AFTER_A_PASSING_EVICT, `${place}: the save does not run after the failed step`)
  }
})

// The inventory of a tree after a review: one line for each cache step as the write command makes it, with the committed
// rule, and a rule that the review adds for each new step.
function reviewedInventory(currentTree) {
  const committed = new Map(INVENTORY.map((line) => [line.step, line.rule]))
  return cacheSteps(currentTree, REMOTE_INVENTORY).map((save) => lineOf(save, committed.get(save.where) ?? "a reviewed bound", currentTree))
}

test("a reviewed inventory line is the only way to make a new cache step pass, and a line that differs from its step fails", () => {
  const rules = { ...RULES, "a reviewed bound": { actions: [...remoteActions(tree), "hendrikmuhs/ccache-action"], check: () => {} } }
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
    assert.throws(() => cacheGuard(changed, reviewedInventory(changed), rules), /the compiler cache savers|the restores of the job and its local actions are the reviewed restores/, name)
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
    const fields = savesACache(line.cacheStep) ? ["step", "rule", "cacheStep", "calls", "restores", "context", "stepsBeforeSave"] : ["step", "rule", "cacheStep", "calls", "stepsBeforeSave"]
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

// A line of the remote inventory and a comment of a cache script name the commit that the reviewer read. A Dependabot bump
// moves the pin of a workflow, so each full commit SHA in this text must be a pin that a workflow or a local action still holds.
test("each commit SHA that the cache inventory text names for a remote action is a pin of that action", () => {
  const pins = [...workflows.flatMap(({ jobs }) => Object.values(jobs).flatMap(({ steps = [] }) => steps)), ...actions.flatMap(({ steps }) => steps)]
    .map((step) => step.uses?.toLowerCase())
    .filter((use) => use?.includes("@"))
  const named = REMOTE_INVENTORY.flatMap(({ action, why }) => [...why.matchAll(/\b[0-9a-f]{40}\b/g)].map(([sha]) => ({ action, sha, where: REMOTE_INVENTORY_FILE })))
  for (const file of ["cache-save-rules.test.mjs", "sweep-actions-caches.mjs"]) {
    const source = readFileSync(join(root, ".github/scripts", file), "utf8")
    for (const [, action, sha] of source.matchAll(/([\w.-]+\/[\w.-]+(?:\/[\w.-]+)*) at ([0-9a-f]{40})\b/g)) named.push({ action, sha, where: file })
  }
  assert.ok(named.length > 0)
  const owns = (use, action) => use.startsWith(`${action}@`) || use.startsWith(`${action}/`)
  for (const { action, sha, where } of named) {
    const name = action.toLowerCase()
    // A tag pin has no commit to compare, so only an action that a workflow pins by commit is checked.
    if (!pins.some((use) => owns(use, name) && /@[0-9a-f]{40}$/.test(use))) continue
    assert.ok(pins.some((use) => owns(use, name) && use.endsWith(`@${sha}`)), `${where}: ${action} at ${sha} is not a pin of any workflow`)
  }
})

test("the cache tests run in the Tool Tests job, and the restore action exists for every caller", () => {
  const run = load(".github/workflows/test.yml").jobs["tool-tests"].steps.map((step) => step.run ?? "").join("\n")
  for (const file of ["cache-save-rules.test.mjs", "sweep-actions-caches.test.mjs", "android-boot-action.test.mjs"]) {
    assert.ok(run.includes(`.github/scripts/${file}`), file)
  }
  assert.ok(existsSync(join(root, ".github/actions/restore-npm-cache/action.yml")))
})
