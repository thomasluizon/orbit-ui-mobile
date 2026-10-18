import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
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
  assert.deepEqual(metadata.on.pull_request.types, ["opened", "synchronize", "reopened", "edited", "labeled", "unlabeled"])
  assert.equal(metadata.jobs.metadata.name, "PR Metadata")
  assert.ok(metadata.jobs.metadata.steps.every((step) => !step.run?.includes("npm ci")))
  assert.doesNotMatch(JSON.stringify(load("guards")), /gh api.*pulls/)
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
