import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import yaml from "js-yaml"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const steps = yaml.load(readFileSync(join(root, ".github/actions/android-boot/action.yml"), "utf8")).runs.steps
const image = steps.find((step) => step.id === "image")
const install = steps.find((step) => step.name === "Install and verify the emulator system image")
const runner = steps.find((step) => step.uses?.startsWith("reactivecircus/android-emulator-runner@"))

test("the system image install runs before the emulator runner and names the package of the runner inputs", () => {
  assert.ok(install, "the action installs the system image itself")
  assert.ok(steps.indexOf(image) < steps.indexOf(install) && steps.indexOf(install) < steps.indexOf(runner))
  const values = Object.fromEntries(image.run.match(/echo "[\w-]+=[\w-]+"/g).map((line) => line.slice(6, -1).split("=")))
  assert.deepEqual(values, { "api-level": "35", target: "google_apis", arch: "x86_64" })
  for (const [input, variable] of [["api-level", "API_LEVEL"], ["target", "TARGET"], ["arch", "ARCH"]]) {
    assert.equal(runner.with[input], `\${{ steps.image.outputs.${input} }}`, `the runner reads ${input} from the shared step`)
    assert.equal(install.env[variable], runner.with[input], `the install reads the same ${input}`)
  }
  // reactivecircus/android-emulator-runner at 1dcd0090116d15e7c562f8db72807de5e036a4ed, src/sdk-installer.ts line 78.
  assert.equal(install.run.trim(), 'bash .github/scripts/install-android-sdk-package.sh "system-images;android-${API_LEVEL};${TARGET};${ARCH}" system.img package.xml')
  assert.equal(runner.uses, "reactivecircus/android-emulator-runner@1dcd0090116d15e7c562f8db72807de5e036a4ed")
  assert.equal(runner.with.channel, undefined, "the runner installs from its default channel 0, like the install step")
  assert.ok(readFileSync(join(root, ".github/scripts/install-android-sdk-package.sh"), "utf8").includes('--install "$package" --channel=0'))
  assert.ok(steps.every((step) => !step.uses?.startsWith("actions/cache")), "the 1.74 GB image has no cache entry")
})

function runInstall(sdkmanagerScript, { withoutSdkmanager = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "android-boot-action-"))
  try {
    const sdk = join(directory, "sdk")
    const bin = join(directory, "bin")
    mkdirSync(join(sdk, "cmdline-tools/latest/bin"), { recursive: true })
    mkdirSync(bin)
    const sdkmanager = join(sdk, "cmdline-tools/latest/bin/sdkmanager")
    writeFileSync(sdkmanager, `#!/usr/bin/env bash\nset -euo pipefail\nimage="$ANDROID_HOME/system-images/android-35/google_apis/x86_64"\necho "$*" >> "$ANDROID_HOME/calls.txt"\nattempt=$(wc -l < "$ANDROID_HOME/calls.txt")\n${sdkmanagerScript}\n`)
    chmodSync(sdkmanager, 0o755)
    if (withoutSdkmanager) rmSync(sdkmanager)
    // The step runs the shared script in its own shell, so a stand-in sleep on PATH records each wait.
    writeFileSync(join(bin, "sleep"), '#!/usr/bin/env bash\necho "$1" >> "$ANDROID_HOME/sleeps.txt"\n')
    chmodSync(join(bin, "sleep"), 0o755)
    const result = spawnSync("bash", ["-c", install.run], {
      cwd: root,
      encoding: "utf8",
      env: { PATH: `${bin}:${process.env.PATH}`, ANDROID_HOME: sdk, API_LEVEL: "35", TARGET: "google_apis", ARCH: "x86_64" },
    })
    const read = (name) => (existsSync(join(sdk, name)) ? readFileSync(join(sdk, name), "utf8").trim().split("\n") : [])
    const imageDirectory = join(sdk, "system-images/android-35/google_apis/x86_64")
    return { ...result, calls: read("calls.txt"), sleeps: read("sleeps.txt"), states: read("states.txt"), installed: existsSync(join(imageDirectory, "system.img")), sdk }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

const recordState = 'echo "partial=$([ -e "$image/system.img.partial" ] && echo yes || echo no) temp=$([ -e "$ANDROID_HOME/.temp/PackageOperation01" ] && echo yes || echo no) intermediates=$([ -e "$ANDROID_HOME/.downloadIntermediates/x86_64-35_r09.zip" ] && echo yes || echo no)" >> "$ANDROID_HOME/states.txt"'
const leavePartial = 'mkdir -p "$image" "$ANDROID_HOME/.temp/PackageOperation01" "$ANDROID_HOME/.downloadIntermediates"; touch "$image/system.img.partial" "$ANDROID_HOME/.downloadIntermediates/x86_64-35_r09.zip"'
const installImage = 'mkdir -p "$image"; echo image > "$image/system.img"; echo package > "$image/package.xml"'

test("a corrupt download is deleted and the install runs again until the image files exist", () => {
  const result = runInstall(`${recordState}
if [ "$attempt" -lt 3 ]; then
  ${leavePartial}
  echo "Warning: An error occurred while preparing SDK package Google APIs Intel x86_64 Atom System Image: Error on ZipFile unknown archive." >&2
  exit 1
fi
${installImage}`)
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.calls, Array(3).fill(`--sdk_root=${result.sdk} --install system-images;android-35;google_apis;x86_64 --channel=0`))
  assert.deepEqual(result.states, Array(3).fill("partial=no temp=no intermediates=no"), "each attempt starts without the partial download")
  assert.deepEqual(result.sleeps, ["5", "10"])
  assert.ok(result.installed)
  assert.match(result.stdout, /Installed and verified system-images;android-35;google_apis;x86_64 on attempt 3\./)
  assert.equal(result.stdout.match(/::warning::Attempt \d did not install/g).length, 2)
})

test("an install that exits 0 without the image files counts as failed, and four failed attempts fail the step", () => {
  const result = runInstall(`${recordState}\n${leavePartial}\nmkdir -p "$image"; : > "$image/system.img"`)
  assert.equal(result.status, 1)
  assert.equal(result.calls.length, 4)
  assert.deepEqual(result.sleeps, ["5", "10", "15"])
  assert.deepEqual(result.states, Array(4).fill("partial=no temp=no intermediates=no"))
  assert.match(result.stdout, /::error::system-images;android-35;google_apis;x86_64 did not install in 4 attempts\./)
  assert.equal(result.installed, false, "the last partial image is deleted too")
})

test("an image that is already installed needs one attempt and no wait", () => {
  const result = runInstall(installImage)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.calls.length, 1)
  assert.deepEqual(result.sleeps, [])
})

test("a runner without the SDK manager fails at once and deletes nothing", () => {
  const result = runInstall("exit 0", { withoutSdkmanager: true })
  assert.equal(result.status, 1)
  assert.match(result.stdout, /::error::sdkmanager is missing at .*cmdline-tools\/latest\/bin\/sdkmanager/)
  assert.deepEqual(result.sleeps, [])
})

test("both callers build the bundle that the action boots, and both keep the Android SDK on the runner", () => {
  for (const [file, job] of [["android-startup.yml", "boot"], ["android-release.yml", "release-android"]]) {
    const jobSteps = yaml.load(readFileSync(join(root, ".github/workflows", file), "utf8")).jobs[job].steps
    assert.ok(jobSteps.some((step) => step.uses === "./.github/actions/android-boot"), file)
    const freeDisk = jobSteps.find((step) => step.uses?.startsWith("jlumbroso/free-disk-space@"))
    assert.equal(freeDisk.with.android, false, `${file}: the SDK manager must stay on the runner`)
  }
})
