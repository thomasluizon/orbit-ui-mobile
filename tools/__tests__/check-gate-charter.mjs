import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { check, root } from "./_harness.mjs"

const entry = (overrides = {}) => ({
  scope: "changed-files",
  snapshot: "none",
  constants: "none",
  ...overrides,
})

const scopedGuardWorkflow = "jobs:\n  existing:\n    runs-on: ubuntu-latest\n    steps:\n      - run: |\n          git diff --name-only origin/${{ github.base_ref }}...HEAD > changed.txt\n          node gate.mjs --changed-files-file changed.txt\n"

const stageRepository = (label, charter, workflow = scopedGuardWorkflow) => {
  const repository = join(root, "gate-charter", label)
  for (const path of ["tools", "eslint-rules", ".claude/hooks", ".github/workflows"]) {
    mkdirSync(join(repository, path), { recursive: true })
  }
  writeFileSync(join(repository, "tools", "check-existing.mjs"), "process.exit(0)\n")
  writeFileSync(join(repository, "eslint-rules", "existing.cjs"), "module.exports = {}\n")
  writeFileSync(join(repository, "eslint-rules", "_helper.cjs"), "module.exports = {}\n")
  writeFileSync(join(repository, ".claude/hooks", "existing.mjs"), "process.exit(0)\n")
  writeFileSync(join(repository, ".claude/hooks", "test-hooks.mjs"), "process.exit(0)\n")
  writeFileSync(join(repository, ".github/workflows", "guards.yml"), workflow)
  writeFileSync(join(repository, "tools", "gate-charter.json"), `${JSON.stringify(charter, null, 2)}\n`)
  return repository
}

const completeCharter = () => ({
  "tools/check-existing.mjs": entry(),
  "eslint-rules/existing.cjs": entry(),
  ".claude/hooks/existing.mjs": entry(),
  ".github/workflows/guards.yml#existing": entry(),
})

export const cases = () => {
  const missingGate = stageRepository("missing-gate", completeCharter())
  writeFileSync(join(missingGate, "tools", "check-new-gate.mjs"), "process.exit(0)\n")
  check(
    "check-gate-charter.mjs",
    "rejects a new gate with no registry entry",
    ["--root", missingGate],
    { status: 1, stderr: /tools\/check-new-gate\.mjs: missing registry entry/ },
  )

  const registeredGateCharter = completeCharter()
  registeredGateCharter["tools/check-new-gate.mjs"] = entry()
  const registeredGate = stageRepository("registered-gate", registeredGateCharter)
  writeFileSync(join(registeredGate, "tools", "check-new-gate.mjs"), "process.exit(0)\n")
  check(
    "check-gate-charter.mjs",
    "accepts the new gate after registration",
    ["--root", registeredGate],
    { status: 0, stdout: /5 gates registered/ },
  )

  const unconditionalWorkflow = "jobs:\n  existing:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node gate.mjs\n"
  check(
    "check-gate-charter.mjs",
    "rejects a whole-tree blocking job declared as changed-files",
    ["--root", stageRepository("unscoped-changed-files", completeCharter(), unconditionalWorkflow)],
    { status: 1, stderr: /changed-files job must derive or receive the pull request changed file list/ },
  )

  const unregenerable = completeCharter()
  unregenerable["tools/check-existing.mjs"] = entry({ snapshot: "" })
  check(
    "check-gate-charter.mjs",
    "rejects a snapshot with no regeneration command",
    ["--root", stageRepository("unregenerable-snapshot", unregenerable)],
    { status: 1, stderr: /snapshot must be none or a regeneration command/ },
  )

  const blockingAdvisory = completeCharter()
  blockingAdvisory[".github/workflows/guards.yml#existing"] = entry({ scope: "whole-tree-advisory" })
  check(
    "check-gate-charter.mjs",
    "rejects a whole-tree advisory job that can still fail",
    ["--root", stageRepository("blocking-advisory", blockingAdvisory)],
    { status: 1, stderr: /whole-tree-advisory job must make its reporting step continue-on-error/ },
  )
}
