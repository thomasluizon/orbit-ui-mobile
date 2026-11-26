import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import yaml from "js-yaml"
import { parityExemptTerms } from "../../tools/lib/parity-scope.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

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
    return result
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

test("body checks reject attribution lines, including on body-only edits", () => {
  // Built from parts, so this source file never holds an attribution line of its own.
  const trailer = ["Co", "Authored", "By: Claude Opus 5.5 <noreply@anthropic.com>"].join("-")
  const generated = `\u{1F916} ${["Generated", "with"].join(" ")} [Claude Code](https://claude.com/claude-code)`
  check("## Summary\n\nThe guard refuses a `Co-Authored-By:` trailer and a \"Generated with\" line.", [], [], 0)
  check(`## Summary\n\nWork.\n\n${trailer}`, [], [], 1)
  check(`## Summary\n\nWork.\n\n${trailer.toLowerCase()}`, [], [], 1)
  check(`Work.\n\n${generated}`, [], [], 1)
  check(`Work.\n\n${trailer}`, [], [], 1, { checkDashes: "false" })
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
  check("## Parity\n\nPlatform adapter: Radix Primitives on web.", ["parity:exempt"], web, 0)
  check("## Parity\n\nPlatform adapter: rn-primitives on Android.", ["parity:exempt"], web, 0)
  check("## Parity\n\nWeb proxy adapter: mobile has no Next.js proxy and no tunnel route.", ["parity:exempt"], web, 1)
  check("## Parity\n\nBFF vs direct API adapter.", ["parity:exempt"], web, 0)
})

test("every exported parity term satisfies the exemption gate", () => {
  const web = ["apps/web/components/control.tsx"]
  for (const term of parityExemptTerms) check(`## Parity\n\nDivergence: ${term}.`, ["parity:exempt"], web, 0)
})

test("a workflow-only PR can carry a label at creation without a UI exemption", () => {
  check("## Parity\n\nWorkflow-only change, no app code.", ["parity:exempt"], [
    ".github/workflows/test.yml", ".github/workflows/pr-metadata.yml",
  ], 0)
})
