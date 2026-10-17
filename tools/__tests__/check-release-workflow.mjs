import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { BASH, T, toolPath } from "./_harness.mjs"

const workflow = readFileSync(toolPath("../.github/workflows/release.yml"), "utf8")

const guard = workflow.match(/      - name: Validate release selection\n[\s\S]*?        run: \|\n((?:          .*\n|\n)+)/)?.[1]

export function cases() {
  T("release workflow exposes redesign as a dispatch choice", /options: \[production, staging, production-redesign\]/.test(workflow))
  T("release selection guard is present", typeof guard === "string")
  if (!guard) return
  for (const [environment, branch, accepted, message] of [
    ["production", "main", true],
    ["production", "redesign/main", false, "Production must build main"],
    ["production", "feature/release", false, "Production must build main"],
    ["production-redesign", "redesign/main", true],
    ["production-redesign", "main", false, "Production redesign must build redesign/main"],
    ["production-redesign", "feature/release", false, "Production redesign must build redesign/main"],
    ["staging", "feature/release", true],
  ]) {
    const result = spawnSync(BASH, ["-c", guard], { encoding: "utf8", env: {
      ...process.env, GITHUB_REF_NAME: "main", RELEASE_ENVIRONMENT: environment, SOURCE_BRANCH: branch,
    } })
    T(`workflow ${environment} from ${branch} ${accepted ? "passes" : "fails"}`, accepted
      ? result.status === 0 : result.status === 1 && result.stdout.includes(message), result.stdout + result.stderr)
  }
  const wrongWorkflow = spawnSync(BASH, ["-c", guard], { encoding: "utf8", env: {
    ...process.env, GITHUB_REF_NAME: "redesign/main", RELEASE_ENVIRONMENT: "production-redesign", SOURCE_BRANCH: "redesign/main",
  } })
  T("redesign still dispatches the workflow from main", wrongWorkflow.status === 1 && wrongWorkflow.stdout.includes("Dispatch release.yml from main"))
}
