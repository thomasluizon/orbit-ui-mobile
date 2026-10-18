import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import yaml from "js-yaml"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const load = (name) => yaml.load(readFileSync(join(root, `.github/workflows/${name}.yml`), "utf8"))
const metadata = load("pr-metadata")

test("text edits and label changes have their own check without restarting Guards", () => {
  assert.deepEqual(load("guards").on.pull_request.types, ["opened", "synchronize", "reopened"])
  assert.deepEqual(load("test").on.pull_request.types, ["opened", "synchronize", "reopened"])
  assert.deepEqual(metadata.on.pull_request.types, ["opened", "synchronize", "reopened", "edited", "labeled", "unlabeled"])
  assert.equal(metadata.jobs.metadata.name, "PR Metadata")
  assert.ok(metadata.jobs.metadata.steps.every((step) => !step.run?.includes("npm ci")))
  assert.doesNotMatch(JSON.stringify(load("guards")), /gh api.*pulls/)
  assert.doesNotMatch(JSON.stringify(load("guards")), /parity:exempt/,
    "label changes must be resolved entirely by metadata, without a stale full guard failure")
})

test("only PR Metadata subscribes to label changes across all workflows", () => {
  const workflows = readdirSync(join(root, ".github/workflows"))
    .filter((file) => /\.ya?ml$/.test(file))
    .map((file) => yaml.load(readFileSync(join(root, ".github/workflows", file), "utf8")))
  for (const action of ["labeled", "unlabeled"]) {
    const subscribers = workflows.filter((workflow) => {
      const trigger = workflow.on?.pull_request
      return trigger?.types?.includes(action)
    })
    assert.deepEqual(subscribers.map((workflow) => workflow.name), ["PR Metadata"], action)
  }
})

test("metadata events can complete without cancelling a sibling required check", () => {
  assert.equal(metadata.concurrency, undefined,
    "a shared group can cancel running siblings or replace pending label events")
  for (const job of Object.values(metadata.jobs)) assert.equal(job.concurrency, undefined)
  const reader = metadata.jobs.metadata.steps.find((step) => step.name === "Read current pull request text")
  assert.match(reader.run, /gh api/,
    "independent runs must read current metadata rather than an event snapshot")
})

function check(body, labels, paths, expected, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "pr-metadata-"))
  try {
    const input = join(directory, "metadata.json")
    const changed = join(directory, "paths.txt")
    const output = join(directory, "body.md")
    writeFileSync(input, JSON.stringify({ title: options.title ?? "Reduce CI time", body, labels }))
    writeFileSync(changed, paths.join("\n"))
    const result = spawnSync(process.execPath, [join(root, ".github/scripts/check-pr-metadata.mjs"), input, output, "--changed-files-file", changed], {
      env: { ...process.env, CHECK_DASHES: options.checkDashes ?? "true" }, encoding: "utf8",
    })
    assert.equal(result.status, expected, result.stderr)
    assert.equal(readFileSync(output, "utf8"), body ?? "")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test("text checks retain dash rejection, including on body-only edits", () => {
  check(null, [], [], 0)
  check("Plain body", [], [], 0)
  check("A banned \u2014 dash", [], [], 1)
  check("Plain body", [], [], 1, { title: "A banned \u2013 dash" })
  check("A bot \u2014 body", [], [], 0, { checkDashes: "false" })
})

test("parity checks reject removed exemptions and require a specific justification", () => {
  const web = ["apps/web/components/control.tsx"]
  check("", [], web, 1)
  check("", [], [...web, "apps/mobile/components/control.tsx"], 0)
  check("", ["parity:exempt"], web, 1)
  check("## Parity\n\n\n## Test evidence\nplatform adapter", ["parity:exempt"], web, 1)
  check("## Parity\n\nThis is different.", ["parity:exempt"], web, 1)
  check("## Parity\n\nPlatform adapter.", ["parity:exempt"], web, 1)
  const justified = "## Parity\n\nPlatform adapter: BFF cookie handling.\n\n## Test evidence\nChecked."
  check(justified, ["parity:exempt"], web, 0)
  check(justified, [], web, 1)
  check("## Parity\n\nNativeWind adapter.", ["parity:exempt"], web, 0)
  check("## Parity\n\nDesktop stats rail.", ["parity:exempt"], web, 0)
})

test("ratchet labels refresh the lightweight check without replacing Guards", () => {
  const directory = mkdtempSync(join(tmpdir(), "pr-metadata-ratchet-"))
  try {
    mkdirSync(join(directory, "tools"))
    writeFileSync(join(directory, "tools/check-suppressions-ratchet.mjs"), "process.exit(1)\n")
    const step = metadata.jobs.metadata.steps.find((candidate) => candidate.name === "Check suppressions ratchet with current labels")
    assert.equal(step.if, "${{ !cancelled() }}")
    assert.doesNotMatch(JSON.stringify(load("guards")), /ratchet:reseed|check-suppressions-ratchet/)
    for (const [labels, expected] of [[[], 1], [["feature"], 1], [["ratchet:reseed"], 0], [[], 1]]) {
      writeFileSync(join(directory, "pr-metadata.json"), JSON.stringify({ title: "Ratchet fixture", body: "", labels }))
      const result = spawnSync("bash", ["-e", "-c", step.run], {
        cwd: directory, env: { ...process.env, RUNNER_TEMP: directory }, encoding: "utf8",
      })
      assert.equal(result.status, expected, result.stderr)
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("the API reader derives the PR number from the merge ref", () => {
  const directory = mkdtempSync(join(tmpdir(), "pr-metadata-reader-"))
  try {
    const reader = metadata.jobs.metadata.steps.find((step) => step.name === "Read current pull request text")
    const result = spawnSync("bash", ["-e", "-c", `gh() { [[ "$2" == "repos/example/repo/pulls/1050" ]] || return 88; printf '%s' '{"title":"Example","body":null,"labels":[]}'; }\nnode() { :; }\n${reader.run}`], {
      env: { ...process.env, GITHUB_REF: "refs/pull/1050/merge", GITHUB_REPOSITORY: "example/repo", RUNNER_TEMP: directory },
      encoding: "utf8",
    })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(readFileSync(join(directory, "pr-metadata.json"), "utf8")), { title: "Example", body: null, labels: [] })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
