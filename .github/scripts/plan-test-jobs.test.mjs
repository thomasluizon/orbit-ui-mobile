import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const script = resolve(dirname(fileURLToPath(import.meta.url)), "plan-test-jobs.mjs")
const tasks = {
  "@orbit/web#test": "web0", "@orbit/mobile#test": "mobile0", "@orbit/desktop#test": "desktop0",
  "@orbit/shared#test": "shared0", "@orbit/eslint-rules#test": "rules0", "@orbit/shared#build": "build0",
}

function plan({ event = "pull_request", changed = [], hashes = tasks, workflow = "name: PR Tests\n", changedFile = true } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "plan-test-jobs-"))
  try {
    writeFileSync(join(directory, "turbo.json"), JSON.stringify({ tasks: Object.entries(hashes).map(([taskId, hash]) => ({ taskId, hash })) }))
    writeFileSync(join(directory, "test.yml"), workflow)
    writeFileSync(join(directory, "changed.txt"), changed.map((path) => `${path}\n`).join(""))
    const argumentsList = ["--event", event, "--turbo-dry", join(directory, "turbo.json"), "--workflow", join(directory, "test.yml")]
    if (changedFile) argumentsList.push("--changed-files", join(directory, "changed.txt"))
    const result = spawnSync(process.execPath, [script, ...argumentsList], { encoding: "utf8" })
    const outputs = Object.fromEntries(result.stdout.split("\n").filter(Boolean).map((line) => line.split("=")))
    return { status: result.status, stderr: result.stderr, outputs }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test("a docs or tools change starts no web build, type check or lint", () => {
  const { status, outputs } = plan({ changed: ["TESTING.md", "tools/README.md", ".claude/playbooks/operations.md"] })
  assert.equal(status, 0)
  assert.deepEqual([outputs.web, outputs["type-check"], outputs.lint], ["false", "false", "false"])
})

test("each scope runs when one of its inputs changes", () => {
  const cases = [
    ["apps/web/app/page.tsx", { web: "true", "type-check": "true", lint: "true" }],
    ["packages/shared/src/i18n/en.json", { web: "true", "type-check": "true", lint: "false" }],
    ["apps/web/app/globals.css", { web: "true", "type-check": "false", lint: "false" }],
    ["tsconfig.base.json", { web: "true", "type-check": "true", lint: "false" }],
    ["package-lock.json", { web: "true", "type-check": "true", lint: "false" }],
    ["tools/check-hermetic-web-build.mjs", { web: "true", "type-check": "false", lint: "false" }],
    ["apps/mobile/app/index.tsx", { web: "false", "type-check": "true", lint: "true" }],
    ["apps/desktop/scripts/release.ts", { web: "false", "type-check": "true", lint: "true" }],
    ["apps/desktop/src-tauri/src/palette.js", { web: "false", "type-check": "true", lint: "false" }],
    ["eslint-rules/no-comments.cjs", { web: "false", "type-check": "true", lint: "false" }],
    [".github/workflows/test.yml", { web: "true", "type-check": "true", lint: "true" }],
  ]
  for (const [path, expected] of cases) {
    const { status, outputs } = plan({ changed: [path] })
    assert.equal(status, 0, path)
    assert.deepEqual({ web: outputs.web, "type-check": outputs["type-check"], lint: outputs.lint }, expected, path)
  }
})

test("a push or a dispatch runs every scope without a changed path list", () => {
  for (const event of ["push", "workflow_dispatch"]) {
    const { status, outputs } = plan({ event, changedFile: false })
    assert.equal(status, 0, event)
    assert.deepEqual([outputs.web, outputs["type-check"], outputs.lint], ["true", "true", "true"], event)
  }
})

test("each result key follows only its own Turbo tasks and the workflow file", () => {
  const base = plan().outputs
  assert.match(base["web-unit-key"], /^web-unit-[0-9a-f]{24}-[0-9a-f]{24}$/)
  assert.match(base["mobile-unit-key"], /^mobile-unit-[0-9a-f]{24}-[0-9a-f]{24}$/)
  assert.match(base["workspace-unit-key"], /^workspace-unit-[0-9a-f]{24}-[0-9a-f]{24}$/)
  assert.deepEqual(plan({ hashes: { ...tasks, "@orbit/shared#build": "build1" } }).outputs, base, "a task outside the groups changes no key")
  for (const [task, group] of [["@orbit/web#test", "web-unit-key"], ["@orbit/mobile#test", "mobile-unit-key"], ["@orbit/eslint-rules#test", "workspace-unit-key"]]) {
    const changed = plan({ hashes: { ...tasks, [task]: "changed" } }).outputs
    for (const key of ["web-unit-key", "mobile-unit-key", "workspace-unit-key"]) {
      assert.equal(changed[key] !== base[key], key === group, `${task} must change only ${group}`)
    }
  }
  const edited = plan({ workflow: "name: PR Tests\n# edited\n" }).outputs
  for (const key of ["web-unit-key", "mobile-unit-key", "workspace-unit-key"]) assert.notEqual(edited[key], base[key], key)
})

test("a missing Turbo task fails and a pull request needs its changed paths", () => {
  const { "@orbit/mobile#test": _mobile, ...withoutMobile } = tasks
  const missing = plan({ hashes: withoutMobile })
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /@orbit\/mobile#test/)
  assert.equal(plan({ changedFile: false }).status, 2)
})
