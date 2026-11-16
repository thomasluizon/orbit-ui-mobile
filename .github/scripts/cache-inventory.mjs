// Reads the cache steps of every workflow and local action, and writes the lines of the cache step inventory.
// Run `node .github/scripts/cache-inventory.mjs --write` after a reviewed change to a cache step or its job. The command keeps
// the rule of each existing line and gives a new line the rule "unreviewed", which no rule matches, so the cache test fails
// until a reviewer names the rule that bounds the new entry.
import assert from "node:assert/strict"
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import yaml from "js-yaml"

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
export const STEP_INVENTORY_FILE = ".github/scripts/cache-save-inventory.jsonl"
export const REMOTE_INVENTORY_FILE = ".github/scripts/remote-action-inventory.jsonl"
export const UNREVIEWED = "unreviewed"
// The key of a case change whose text a workflow edit removed.
export const MISSING_TEXT = Symbol("missing text")

const WORKFLOW_PATHS = readdirSync(join(root, ".github/workflows")).filter((file) => /\.ya?ml$/.test(file)).map((file) => `.github/workflows/${file}`)
const ACTION_PATHS = readdirSync(join(root, ".github/actions")).map((directory) => `.github/actions/${directory}/action.yml`)

export const readInventory = (path) => readFileSync(join(root, path), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))

// The workflow `on` key holds one event name, a list of names or a map of names.
export const eventsOf = (on) => (typeof on === "string" ? [on] : Array.isArray(on) ? on : Object.keys(on ?? {}))

// The workflows, the local actions and the Turbo configuration, with the text of some files changed or added, for a test
// that breaks the guard.
export function readTree(changes = {}) {
  assert.equal(changes[MISSING_TEXT], undefined, changes[MISSING_TEXT])
  const read = (path) => yaml.load(changes[path] ?? readFileSync(join(root, path), "utf8"))
  const added = (pattern) => Object.keys(changes).filter((path) => pattern.test(path))
  const workflows = [...new Set([...WORKFLOW_PATHS, ...added(/^\.github\/workflows\//)])].map((path) => {
    const document = read(path)
    return { file: path.split("/").at(-1), document, on: eventsOf(document.on), jobs: document.jobs ?? {} }
  })
  // A JavaScript or Docker action has no steps that the guard can read, and it gets the cache service token like any step.
  const actions = [...new Set([...ACTION_PATHS, ...added(/^\.github\/actions\//)])].map((path) => {
    const document = read(path)
    assert.equal(document?.runs?.using, "composite", `${path}: the guard reads only composite local actions`)
    return { file: path.replace(".github/actions/", ""), document, steps: document.runs.steps ?? [] }
  })
  const turbo = JSON.parse(changes["turbo.json"] ?? readFileSync(join(root, "turbo.json"), "utf8"))
  return { workflows, actions, turbo }
}

// GitHub reads an action name without regard to case. A local action has no remote name. A Docker image step is named
// docker://<image> in lower case, without its tag or digest, so it needs a reviewed line in the remote inventory.
export function actionName(uses) {
  if (uses === undefined || uses.startsWith("./")) return undefined
  const name = uses.toLowerCase()
  return name.startsWith("docker://") ? name.replace(/@.*$/, "").replace(/:[^/]*$/, "") : name.split("@")[0]
}
export const savesACache = (step) => /^actions\/cache(\/save)?$/.test(actionName(step.uses) ?? "")
export const restoresACache = (step) => /^actions\/cache(\/restore)?$/.test(actionName(step.uses) ?? "")

// Sorted keys at every level, and the action name and the input names in lower case, so two equal steps give the same
// JSON text. The runner reads an input name without regard to case, so each rule reads the canonical step only.
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value === null || typeof value !== "object") return value
  return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, canonical(value[key])]))
}
export function canonicalStep(step) {
  const names = Object.keys(step.with ?? {})
  const lowerNames = names.map((name) => name.toLowerCase())
  assert.equal(new Set(lowerNames).size, names.length, `${step.name ?? step.uses}: two inputs of one step differ only in case`)
  const inputs = step.with === undefined || step.with === null ? step.with : Object.fromEntries(names.map((name, index) => [lowerNames[index], step.with[name]]))
  return canonical({ ...step, uses: step.uses?.toLowerCase(), with: inputs })
}

// The steps of a local action run in the job that calls it, so each call is followed by the steps of its action. Each entry
// holds the call steps that lead to it.
function withActionSteps(steps, actionSteps, calls = []) {
  return steps.flatMap((step) => {
    const entry = { step, calls }
    if (!step.uses?.startsWith("./")) return [entry]
    const action = step.uses.replace(/\/+$/, "")
    assert.ok(actionSteps[action] !== undefined && !calls.some((call) => call.uses.replace(/\/+$/, "") === action),
      `${step.uses}: the guard must read the steps of each local action`)
    return [entry, ...withActionSteps(actionSteps[action], actionSteps, [...calls, step])]
  })
}
const actionDirectory = (call) => call.uses.replace(/\/+$/, "").replace("./.github/actions/", "")

// Each job with the steps of its local actions, and each local action as a list of its own. A step that a local action
// holds carries the name of its action file.
export function cacheStepLists({ workflows, actions }) {
  const actionSteps = Object.fromEntries(actions.map(({ file, steps }) => [`./.github/actions/${dirname(file)}`, steps]))
  const listOf = (place, steps, owner) => ({
    place,
    ...owner,
    entries: withActionSteps(steps, actionSteps).map(({ step, calls }) =>
      ({ step, calls, where: `${place}: ${calls.length ? `${actionDirectory(calls.at(-1))}/action.yml: ` : ""}${step.name ?? step.uses}` })),
  })
  return [
    ...workflows.flatMap((workflow) => Object.entries(workflow.jobs).map(([job, definition]) =>
      listOf(`${workflow.file}: ${job}`, definition.steps ?? [], { workflow, job: definition }))),
    ...actions.map((action) => listOf(action.file, action.steps, { action })),
  ]
}

// The remote actions of every step and every job that calls a reusable workflow of another repository.
export function remoteActions({ workflows, actions }) {
  const uses = [
    ...workflows.flatMap(({ jobs }) => Object.values(jobs).flatMap((job) => [job.uses, ...(job.steps ?? []).map((step) => step.uses)])),
    ...actions.flatMap(({ steps }) => steps.map((step) => step.uses)),
  ]
  return [...new Set(uses.map(actionName).filter(Boolean))].sort()
}

// Each step that can write the Actions cache: an actions/cache or actions/cache/save step, or a step of a remote action that
// the remote inventory marks as a cache step.
export function cacheSteps(tree, remoteInventory) {
  const caching = new Set(remoteInventory.filter(({ cache }) => cache === "cache step").map(({ action }) => action))
  return cacheStepLists(tree).flatMap((list) => list.entries
    .filter(({ step }) => savesACache(step) || caching.has(actionName(step.uses)))
    .map((entry) => ({ ...entry, index: list.entries.indexOf(entry), list })))
}

// Everything around a save that can change what its entry holds: the workflow events, env and run defaults, the job
// condition, env, run defaults, matrix, runner and container, the inputs of each local action that the job enters, the env
// of each step, and the run text of each step whose text names GITHUB_ENV. The run defaults set the shell and the
// directory of each run step that names neither. A script file that writes GITHUB_ENV is in stepsBeforeSave below.
function contextOf(list, tree) {
  const directories = [...new Set(list.entries.flatMap(({ calls }) => calls).map(actionDirectory))]
  const inputsOf = (directory) => tree.actions.find(({ file }) => dirname(file) === directory).document.inputs ?? null
  const owner = list.workflow
    ? {
        on: list.workflow.document.on,
        env: list.workflow.document.env,
        defaults: list.workflow.document.defaults,
        job: { if: list.job.if, env: list.job.env, defaults: list.job.defaults, strategy: list.job.strategy, "runs-on": list.job["runs-on"], container: list.job.container },
      }
    : { inputs: list.action.document.inputs }
  return canonical({
    ...owner,
    actionInputs: Object.fromEntries(directories.map((directory) => [directory, inputsOf(directory)])),
    stepEnv: list.entries.filter(({ step }) => step.env !== undefined).map(({ where, step }) => ({ where, env: step.env })),
    githubEnv: list.entries.filter(({ step }) => /GITHUB_ENV/.test(step.run ?? "")).map(({ where, step }) => ({ where, run: step.run })),
  })
}

// A step that writes GITHUB_ENV, also through a script file, changes the env context of each later step, post steps
// included. So when the cache step, a restore of its job, a call step that leads to one of them, or the inputs of an action
// that the job enters read the env context, the line pins every step that runs before the save. An actions/cache/save step
// saves in its main step; every other cache step saves in its post step, after the last step of the job.
// GitHub reads a context name without regard to case.
const READS_ENV = /\benv\s*[.[]/i
function stepsBeforeSave(save, restores, tree) {
  const directories = [...new Set([...save.calls, ...restores.flatMap(({ calls }) => calls)].map(actionDirectory))]
  const read = [save.step, ...save.calls, ...restores.flatMap(({ step, calls }) => [step, ...calls])].map((step) => [step.with, step.if])
  const inputs = directories.map((directory) => tree.actions.find(({ file }) => dirname(file) === directory).document.inputs)
  if (!READS_ENV.test(JSON.stringify([read, inputs]))) return null
  const before = actionName(save.step.uses) === "actions/cache/save" ? save.list.entries.slice(0, save.index) : save.list.entries.filter((_, index) => index !== save.index)
  return before.map(({ where, step }) => ({ where, step: canonicalStep(step) }))
}

// The inventory line of a cache step. A line of an actions/cache step pins the whole step, the call steps that lead to it,
// each cache restore of its job with its call steps, and the context of the job. A line of another remote cache step pins
// the step and its call steps. A line whose steps read the env context also pins the steps that run before the save.
export function lineOf(save, rule, tree) {
  const line = { step: save.where, rule, cacheStep: canonicalStep(save.step), calls: save.calls.map(canonicalStep) }
  if (!savesACache(save.step)) return { ...line, stepsBeforeSave: stepsBeforeSave(save, [], tree) }
  const restores = save.list.entries.filter(({ step }) => restoresACache(step))
  return {
    ...line,
    restores: restores.map(({ where, step, calls }) => ({ where, step: canonicalStep(step), calls: calls.map(canonicalStep) })),
    context: contextOf(save.list, tree),
    stepsBeforeSave: stepsBeforeSave(save, restores, tree),
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.deepEqual(process.argv.slice(2), ["--write"], "usage: node .github/scripts/cache-inventory.mjs --write")
  const tree = readTree()
  const rules = new Map(readInventory(STEP_INVENTORY_FILE).map((line) => [line.step, line.rule]))
  const lines = cacheSteps(tree, readInventory(REMOTE_INVENTORY_FILE)).map((save) => lineOf(save, rules.get(save.where) ?? UNREVIEWED, tree))
  writeFileSync(join(root, STEP_INVENTORY_FILE), `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`)
  const unreviewed = lines.filter(({ rule }) => rule === UNREVIEWED).map(({ step }) => step)
  console.log(`${STEP_INVENTORY_FILE}: ${lines.length} lines, ${unreviewed.length} with the rule "${UNREVIEWED}"${unreviewed.map((step) => `\n  ${step}`).join("")}`)
}
