import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const script = resolve(root, ".github/scripts/plan-test-jobs.mjs")
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
  const { status, outputs } = plan({ changed: ["TESTING.md", "tools/README.md", ".claude/rules/product-and-content.md"] })
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
    [".github/actions/install-dependencies/action.yml", { web: "true", "type-check": "true", lint: "true" }],
    [".github/actions/restore-npm-cache/action.yml", { web: "true", "type-check": "true", lint: "true" }],
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
    assert.deepEqual([outputs.web, outputs["type-check"], outputs.lint, outputs.tools], ["true", "true", "true", "true"], event)
  }
})

const skipPaths = JSON.parse(readFileSync(join(root, ".github/scripts/tool-tests-skip-paths.json"), "utf8"))

test("a pull request that changes only unread documents skips the tool tests", () => {
  assert.ok(skipPaths.length > 0)
  for (const changed of [[skipPaths[0]], skipPaths, [skipPaths[0], skipPaths[skipPaths.length - 1]]]) {
    const { status, outputs } = plan({ changed })
    assert.equal(status, 0, changed.join())
    assert.equal(outputs.tools, "false", changed.join())
  }
})

test("a pull request that changes any other path starts the tool tests", () => {
  const skipped = []
  for (const path of ["tools/example.mjs", ".claude/skills/example/SKILL.md", ".github/workflows/guards.yml", "eslint-rules/no-comments.cjs", "lefthook.yml", "TESTING.md", "README.md", "DESIGN.md", "a-path-that-no-list-names.txt"]) {
    for (const changed of [[path], [skipPaths[0], path]]) {
      const { status, outputs } = plan({ changed })
      assert.equal(status, 0, changed.join())
      if (outputs.tools !== "true") skipped.push(changed.join())
    }
  }
  assert.deepEqual(skipped, [])
})

// Each row is a real-tree read of a tool case module or a tool. A pull request that changes the input must run the case.
const caseModuleInputs = {
  "desktop-bench": [
    "apps/desktop/src-tauri/src/main.rs", "apps/desktop/src-tauri/src/bench_viewport.rs", "apps/desktop/src-tauri/build.rs",
    "apps/desktop/src-tauri/Cargo.toml", "apps/web/scripts/build-hermetic.mjs",
  ],
  "desktop-acceptance": ["apps/desktop/locales/en.json", "apps/desktop/locales/pt-BR.json", "apps/web/scripts/build-hermetic.mjs"],
  "check-i18n-usage": ["apps/web/app/step-up/step-up-screen.tsx", "apps/mobile/app/step-up.tsx"],
  "android-boot": ["apps/mobile/lib/api-base.ts", "packages/shared/src/i18n/en.json"],
  "check-native-module-copies and the node_modules readers": ["apps/mobile/app.json", "package-lock.json"],
  "generate-brand-assets and build-ds-bundle": ["design/brand/orbit-lockup.svg", "design/brand/orbit-mark.svg", "design/canvas/example.svg"],
}

test("each input that a case module reads starts the tool tests", () => {
  const skipped = []
  for (const [reader, inputs] of Object.entries(caseModuleInputs)) {
    for (const path of inputs) {
      const { status, outputs } = plan({ changed: ["TESTING.md", path] })
      assert.equal(status, 0, `${reader} ${path}`)
      if (outputs.tools !== "true") skipped.push(`${reader} reads ${path}`)
    }
  }
  assert.deepEqual(skipped, [])
})

// An allowlist of tool inputs can never be shown complete, so the scope is every path except a short list of unread
// documents. A path stays on that list only while no file under tools/ or .github/scripts/ names it.
test("no file that the tool tests or the CI scripts read names a path of the skip list", () => {
  const listed = spawnSync("git", ["-C", root, "ls-files", "--", "tools", ".github/scripts"], { encoding: "utf8" })
  assert.equal(listed.status, 0, listed.stderr)
  const own = new Set([".github/scripts/tool-tests-skip-paths.json", ".github/scripts/plan-test-jobs.mjs", ".github/scripts/plan-test-jobs.test.mjs"])
  const readers = listed.stdout.split("\n").filter((path) => path && !own.has(path))
  assert.ok(readers.includes("tools/test-tools.mjs") && readers.some((path) => path.startsWith(".github/scripts/")), "the scan reads the tools and the CI scripts")
  for (const skipPath of skipPaths) {
    assert.deepEqual(readers.filter((path) => readFileSync(join(root, path), "utf8").includes(skipPath)), [], `a reader names ${skipPath}`)
  }
})

// GitHub reads these in the message of a push or of the head commit of a pull request (docs.github.com, "Skipping
// workflow runs"). A squash merge copies every commit message of the pull request to main, so a marker that a hook
// wrote on one relay commit would stop the main push runs of PR Tests, Guards and CodeQL that a release requires.
test("no tool or CI script writes a GitHub skip instruction into a commit message", () => {
  const listed = spawnSync("git", ["-C", root, "ls-files", "--", "lefthook.yml", "tools", ".github/scripts"], { encoding: "utf8" })
  assert.equal(listed.status, 0, listed.stderr)
  const sources = listed.stdout.split("\n").filter((path) => path === "lefthook.yml" ||
    (/\.[cm]?js$/.test(path) && !/(^|\/)(__tests__|__fixtures__)\/|\.test\.mjs$/.test(path)))
  assert.ok(sources.includes("lefthook.yml") && sources.includes("tools/test-tools.mjs"), "the scan reads the hook configuration and the tools")
  const instruction = /\[(skip ci|ci skip|no ci|skip actions|actions skip)\]|skip-checks: ?true/i
  const marked = sources.filter((path) => instruction.test(readFileSync(join(root, path), "utf8")))
  assert.deepEqual(marked, [])
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
