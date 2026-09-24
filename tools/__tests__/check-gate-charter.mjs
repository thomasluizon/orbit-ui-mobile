import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import yaml from "js-yaml"

import { BASH, REPO_ROOT, T, check, root } from "./_harness.mjs"

const entry = (overrides = {}) => ({
  scope: "changed-files",
  snapshot: "none",
  constants: "none",
  ...overrides,
})

const scopedGuardWorkflow = "jobs:\n  existing:\n    runs-on: ubuntu-latest\n    steps:\n      - run: |\n          git diff --name-only origin/${{ github.base_ref }}...HEAD > changed.txt\n          node gate.mjs --changed-files-file changed.txt\n"

const scopedLintWorkflow = "jobs:\n  lint:\n    steps:\n      - run: |\n          web=()\n          mobile=()\n          shared=()\n          while IFS= read -r -d '' file; do\n            case \"$file\" in\n              apps/web/*) web+=(\"${file#apps/web/}\") ;;\n              apps/mobile/*) mobile+=(\"${file#apps/mobile/}\") ;;\n              packages/shared/*) shared+=(\"${file#packages/shared/}\") ;;\n            esac\n          done < <(git diff --name-only -z origin/${{ github.base_ref }}...HEAD)\n          if [ \"${#web[@]}\" -gt 0 ]; then npm exec --workspace @orbit/web -- eslint -- \"${web[@]}\"; fi\n          if [ \"${#mobile[@]}\" -gt 0 ]; then npm exec --workspace @orbit/mobile -- eslint -- \"${mobile[@]}\"; fi\n          if [ \"${#shared[@]}\" -gt 0 ]; then npm exec --workspace @orbit/shared -- eslint -- \"${shared[@]}\"; fi\n"

const stageRepository = (label, charter, { guardWorkflow = scopedGuardWorkflow, lintWorkflow = scopedLintWorkflow } = {}) => {
  const repository = join(root, "gate-charter", label)
  for (const path of ["tools", "eslint-rules", ".claude/hooks", ".github/workflows"]) {
    mkdirSync(join(repository, path), { recursive: true })
  }
  writeFileSync(join(repository, "tools", "check-existing.mjs"), "process.exit(0)\n")
  writeFileSync(join(repository, "eslint-rules", "existing.cjs"), "module.exports = {}\n")
  writeFileSync(join(repository, "eslint-rules", "_helper.cjs"), "module.exports = {}\n")
  writeFileSync(join(repository, ".claude/hooks", "existing.mjs"), "process.exit(0)\n")
  writeFileSync(join(repository, ".claude/hooks", "test-hooks.mjs"), "process.exit(0)\n")
  writeFileSync(join(repository, ".github/workflows", "guards.yml"), guardWorkflow)
  writeFileSync(join(repository, ".github/workflows", "test.yml"), lintWorkflow)
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

  const unconditionalWorkflow = "jobs:\n  existing:\n    runs-on: ubuntu-latest\n    steps:\n      - run: |\n          git diff --name-only origin/${{ github.base_ref }}...HEAD > changed.txt\n          node gate.mjs\n"
  check(
    "check-gate-charter.mjs",
    "rejects a whole-tree blocking job that does not use its derived changed file list",
    ["--root", stageRepository("unscoped-changed-files", completeCharter(), { guardWorkflow: unconditionalWorkflow })],
    { status: 1, stderr: /changed-files job has a blocking run that is not scoped to the pull request diff/ },
  )

  const unconditionalDiffStatus = "jobs:\n  existing:\n    steps:\n      - run: |\n          if git diff --name-only origin/${{ github.base_ref }}...HEAD; then\n            node gate.mjs\n          fi\n"
  check(
    "check-gate-charter.mjs",
    "rejects a gate conditioned only on git diff's always-successful exit status",
    ["--root", stageRepository("unconditional-diff-status", completeCharter(), { guardWorkflow: unconditionalDiffStatus })],
    { status: 1, stderr: /changed-files job has a blocking run that is not scoped to the pull request diff/ },
  )

  const unpreparedChangedPaths = "jobs:\n  existing:\n    steps:\n      - run: |\n          if grep -Eq '^package\\.json$' \"$RUNNER_TEMP/changed-paths.txt\"; then\n            node gate.mjs\n          fi\n"
  check(
    "check-gate-charter.mjs",
    "rejects a changed-path file without the resolving step",
    ["--root", stageRepository("unprepared-changed-paths", completeCharter(), { guardWorkflow: unpreparedChangedPaths })],
    { status: 1, stderr: /changed-files job has a blocking run that is not scoped to the pull request diff/ },
  )

  const wholeTreeLint = "jobs:\n  lint:\n    steps:\n      - run: |\n          git diff --name-only origin/${{ github.base_ref }}...HEAD > changed.txt\n          npm run lint\n"
  check(
    "check-gate-charter.mjs",
    "rejects a changed-files local ESLint rule called by whole-tree lint",
    ["--root", stageRepository("unscoped-eslint", completeCharter(), { lintWorkflow: wholeTreeLint })],
    { status: 1, stderr: /eslint-rules\/existing\.cjs: pull request lint must pass only changed workspace files to ESLint/ },
  )

  const triggerCharter = completeCharter()
  triggerCharter[".github/workflows/guards.yml#gate-charter"] = entry()
  const incompleteTrigger = "jobs:\n  existing:\n    steps:\n      - run: |\n          git diff --name-only origin/${{ github.base_ref }}...HEAD > changed.txt\n          node gate.mjs --changed-files-file changed.txt\n  gate-charter:\n    steps:\n      - run: |\n          if git diff --name-only origin/${{ github.base_ref }}...HEAD | grep -Eq '^tools/check-.*\\.mjs$'; then\n            node tools/check-gate-charter.mjs\n          fi\n"
  check(
    "check-gate-charter.mjs",
    "rejects a Gate Charter caller that skips test.yml changes",
    ["--root", stageRepository("missing-lint-owner", triggerCharter, { guardWorkflow: incompleteTrigger })],
    { status: 1, stderr: /Gate Charter must run when \.github\/workflows\/test\.yml changes/ },
  )

  const dependencyTrigger = (dependencyPattern) =>
    "jobs:\n  existing:\n    steps:\n      - run: |\n          git diff --name-only origin/${{ github.base_ref }}...HEAD > changed.txt\n          node gate.mjs --changed-files-file changed.txt\n  gate-charter:\n    steps:\n      - run: |\n          if git diff --name-only origin/${{ github.base_ref }}...HEAD | grep -Eq '^\\.github/workflows/test\\.yml$|" +
    dependencyPattern +
    "'; then\n            node tools/check-gate-charter.mjs\n          fi\n"
  check(
    "check-gate-charter.mjs",
    "rejects a Gate Charter caller that skips package.json changes",
    ["--root", stageRepository("missing-package-json", triggerCharter, { guardWorkflow: dependencyTrigger("^package-lock\\.json$") })],
    { status: 1, stderr: /Gate Charter must run when package\.json or package-lock\.json changes/ },
  )
  check(
    "check-gate-charter.mjs",
    "rejects a Gate Charter caller that skips package-lock.json changes",
    ["--root", stageRepository("missing-package-lock", triggerCharter, { guardWorkflow: dependencyTrigger("^package\\.json$") })],
    { status: 1, stderr: /Gate Charter must run when package\.json or package-lock\.json changes/ },
  )

  const unregenerable = completeCharter()
  unregenerable["tools/check-existing.mjs"] = entry({ snapshot: "" })
  check(
    "check-gate-charter.mjs",
    "rejects a snapshot with no regeneration command",
    ["--root", stageRepository("unregenerable-snapshot", unregenerable)],
    { status: 1, stderr: /snapshot must be none or a regeneration command/ },
  )

  const frozenBodyWorkflow = "jobs:\n  existing:\n    steps:\n      - env:\n          PR_BODY: ${{ github.event.pull_request.body }}\n        run: |\n          git diff --name-only origin/${{ github.base_ref }}...HEAD > changed.txt\n          node gate.mjs --changed-files-file changed.txt\n"
  check(
    "check-gate-charter.mjs",
    "rejects a gate that reads the frozen event pull request body",
    ["--root", stageRepository("frozen-pr-body", completeCharter(), { guardWorkflow: frozenBodyWorkflow })],
    { status: 1, stderr: /frozen pull request body/ },
  )
  const frozenTitleWorkflow = frozenBodyWorkflow.replace("pull_request.body", "pull_request.title")
  check(
    "check-gate-charter.mjs",
    "rejects a gate that reads the frozen event pull request title",
    ["--root", stageRepository("frozen-pr-title", completeCharter(), { guardWorkflow: frozenTitleWorkflow })],
    { status: 1, stderr: /frozen pull request title/ },
  )
  for (const [field, access] of [
    ["body", "github.event.pull_request['body']"],
    ["title", "github['event'][\"pull_request\"][\"title\"]"],
  ]) {
    const workflow = frozenBodyWorkflow.replace("github.event.pull_request.body", access)
    check(
      "check-gate-charter.mjs",
      `rejects index access to the frozen event pull request ${field}`,
      ["--root", stageRepository(`frozen-index-${field}`, completeCharter(), { guardWorkflow: workflow })],
      { status: 1, stderr: new RegExp(`frozen pull request ${field}`) },
    )
  }

  const guards = yaml.load(readFileSync(join(REPO_ROOT, ".github", "workflows", "guards.yml"), "utf8"))
  for (const [jobId, stepName] of [
    ["dashes", "PR title and body carry no dashes"],
    ["review-harness", "A UI pull request on redesign/main records what the review skills found"],
  ]) {
    const step = guards.jobs[jobId].steps.find((candidate) => candidate.name === stepName)
    const script = `gh() { [[ "$2" == "repos/example/repo/pulls/1050" ]] || return 88; printf 'text'; }\nnode() { :; }\ngit() { :; }\n${step.run.replaceAll("${{ github.base_ref }}", "redesign/main")}`
    const result = spawnSync(BASH, ["-c", script], {
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_REF: "refs/pull/1050/merge",
        GITHUB_REPOSITORY: "example/repo",
        RUNNER_TEMP: root,
      },
    })
    T(`check-gate-charter.mjs: ${jobId} derives the PR number from a fork-safe merge ref`, result.status === 0,
      `status=${result.status} stderr=${result.stderr}`)
  }

  const blockingAdvisory = completeCharter()
  blockingAdvisory[".github/workflows/guards.yml#existing"] = entry({ scope: "whole-tree-advisory" })
  check(
    "check-gate-charter.mjs",
    "rejects a whole-tree advisory job that can still fail",
    ["--root", stageRepository("blocking-advisory", blockingAdvisory)],
    { status: 1, stderr: /whole-tree-advisory job must make its reporting step continue-on-error/ },
  )
}
