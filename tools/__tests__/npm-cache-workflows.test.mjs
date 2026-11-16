import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import yaml from "js-yaml"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const workflowsDirectory = join(root, ".github/workflows")
const workflows = readdirSync(workflowsDirectory)
  .filter((file) => /\.ya?ml$/.test(file))
  .map((file) => [file, yaml.load(readFileSync(join(workflowsDirectory, file), "utf8"))])

// A stalled cache segment would hold the job until its time limit. The bound lets npm ci continue with a cold cache.
// Source of the variable: actions/cache at 55cc8345863c7cc4c66a329aec7e433d2d1c52a9 (v6), dist/restore-only/index.js.
test("every npm cache restore has a one-minute segment bound", () => {
  const action = yaml.load(readFileSync(join(root, ".github/actions/restore-npm-cache/action.yml"), "utf8"))
  const inline = workflows.flatMap(([file, workflow]) => Object.entries(workflow.jobs).flatMap(([jobId, job]) =>
    (job.steps ?? []).filter((step) => step.uses?.startsWith("actions/cache/restore@") && String(step.with.key).startsWith("npm-"))
      .map((step) => [`${file}: ${jobId}`, step])))
  const restores = [["restore-npm-cache", action.runs.steps.find((step) => step.id === "restore")], ...inline]
  assert.equal(restores.length, 5, "the shared action and the four release jobs that restore inline")
  for (const [where, step] of restores) {
    assert.equal(String(step.env?.SEGMENT_DOWNLOAD_TIMEOUT_MINS), "1", `${where} must bound a stalled segment`)
    assert.equal(step["continue-on-error"], undefined, `${where} must surface restore failures`)
    assert.equal(step["timeout-minutes"], undefined, `${where} must let cache timeout continue to npm ci`)
    assert.equal(step.with["fail-on-cache-miss"], undefined, `${where} must let a miss continue to npm ci`)
  }
})

test("unit test steps retain their budget with setup and report time outside it", () => {
  const workflow = workflows.find(([file]) => file === "test.yml")[1]
  for (const [job, stepName, stepMinutes, jobMinutes] of [
    ["web-tests", "Run web shard with coverage", 12, 15],
    ["mobile-tests", "Run mobile shard with coverage", 10, 13],
    ["workspace-tests", "Run workspaces with coverage thresholds", 6, 9],
  ]) {
    const step = workflow.jobs[job].steps.find((candidate) => candidate.name === stepName)
    assert.equal(step["timeout-minutes"], stepMinutes, `${job} owns a separate test budget`)
    assert.equal(workflow.jobs[job]["timeout-minutes"], jobMinutes, `${job} reserves three minutes for setup and reports`)
  }
})

// On a runner, npx and npm exec install a package that the tree lacks without a prompt (npm 11.19.0,
// node_modules/libnpmexec/lib/index.js: noTTY() || ciInfo.isCI), and --yes does the same anywhere. That install resolves
// the version ranges of the package at run time, so a new upstream publish can fail an unrelated pull request. So each
// npx or npm exec command names a binary that a lockfile entry of the workspace tree installs, with no version and no --yes.
const lockedBinaries = new Set(Object.values(JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")).packages)
  .flatMap((entry) => Object.keys(entry.bin ?? {})))
const actionsDirectory = join(root, ".github/actions")
const scripts = [
  ...workflows.flatMap(([file, workflow]) => Object.entries(workflow.jobs).flatMap(([jobId, job]) =>
    (job.steps ?? []).map((step, index) => [`${file}: ${jobId}: ${step.name ?? step.id ?? index}`, step]))),
  ...readdirSync(actionsDirectory).flatMap((action) => {
    const definition = yaml.load(readFileSync(join(actionsDirectory, action, "action.yml"), "utf8"))
    return (definition.runs?.steps ?? []).map((step, index) => [`.github/actions/${action}: ${step.name ?? step.id ?? index}`, step])
  }),
].flatMap(([where, step]) => [step.run, step.with?.script].filter((text) => typeof text === "string").map((text) => [where, text]))

// The options that take the next word as their value: the opts set of npm 11.19.0 bin/npx-cli.js, and the workspace and
// prefix definitions of node_modules/@npmcli/config/lib/definitions/definitions.js (short w and C).
const VALUE_OPTIONS = new Set(["--package", "-p", "--cache", "--userconfig", "--call", "-c", "--shell", "--npm", "--node-arg", "-n",
  "--workspace", "-w", "--prefix", "-C"])
// The binary of a command is the first word that is neither an npm option nor its value; a "--" ends the npm options.
// The words before it hold the npm options, such as --yes.
function execBinary(command) {
  const words = command.trim().split(/\s+/).map((word) => word.replace(/^["']|["']$/g, ""))
  let index = 0
  while (index < words.length && words[index].startsWith("-") && words[index] !== "--") index += VALUE_OPTIONS.has(words[index]) ? 2 : 1
  const options = words.slice(0, index)
  const binary = words[index] === "--" ? words[index + 1] : words[index]
  return { binary, yes: options.some((word) => word === "-y" || word === "--yes") }
}
const execCommands = (text) => [...text.matchAll(/(?:^|[\s;&|(`$])(?:npx|npm\s+(?:exec|x))\s+([^\n;&|)`]*)/g)].map((match) => match[1])

test("each npx and npm exec command runs a binary of the locked workspace tree, with no version and no --yes", () => {
  const commands = scripts.flatMap(([where, text]) => execCommands(text).map((command) => [where, command]))
  assert.ok(commands.length >= 20, "the scan reads the npx commands of the workflows")
  for (const [where, command] of commands) {
    const { binary, yes } = execBinary(command)
    assert.equal(yes, false, `${where}: npx ${command} installs a package that the lockfile does not pin`)
    assert.ok(lockedBinaries.has(binary), `${where}: npx ${command} runs ${binary}, which no lockfile entry of the workspace tree installs`)
  }
})

test("the npx rule reads the binary of each command form and rejects a resolve", () => {
  assert.deepEqual(execBinary('--yes "turbo@$TURBO_VERSION" run test --dry=json'), { binary: "turbo@$TURBO_VERSION", yes: true })
  assert.deepEqual(execBinary("-y react-doctor@0.7.6 . --blocking error --yes"), { binary: "react-doctor@0.7.6", yes: true })
  assert.deepEqual(execBinary('--workspace @orbit/web -- eslint -- "${web[@]}"'), { binary: "eslint", yes: false })
  assert.deepEqual(execBinary("playwright install chromium"), { binary: "playwright", yes: false })
  assert.deepEqual(execBinary("turbo run test --concurrency=1 -- --coverage"), { binary: "turbo", yes: false })
  assert.deepEqual(execBinary("--package=other -y tool"), { binary: "tool", yes: true })
  assert.equal(lockedBinaries.has("turbo@2.11.10"), false, "a version makes the word another binary name")
  assert.deepEqual(execCommands("CI=1 EXPO_OFFLINE=1 npx expo install --check\necho \"$(npx playwright --version | cut -d' ' -f2)\""),
    ["expo install --check", "playwright --version "])
})
