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

const scopedLintWorkflow = readFileSync(join(REPO_ROOT, ".github/workflows/test.yml"), "utf8")

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

  const timelessJob = yaml.load(readFileSync(join(REPO_ROOT, ".github", "workflows", "guards.yml"), "utf8")).jobs.timeless
  const timelessWorkflow = (job) => yaml.dump({ jobs: { existing: job } })
  check(
    "check-gate-charter.mjs",
    "accepts the timeless gate scoped to added lines on pull requests",
    ["--root", stageRepository("timeless-base", completeCharter(), { guardWorkflow: timelessWorkflow(timelessJob) })],
    { status: 0 },
  )
  const wholeTreeTimelessJob = structuredClone(timelessJob)
  wholeTreeTimelessJob.steps.at(-1).run = wholeTreeTimelessJob.steps.at(-1).run.replace("--base origin/${{ github.base_ref }}", "--all")
  check(
    "check-gate-charter.mjs",
    "rejects a timeless gate that scans the whole tree on pull requests",
    ["--root", stageRepository("timeless-unscoped", completeCharter(), { guardWorkflow: timelessWorkflow(wholeTreeTimelessJob) })],
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

  for (const [jobId, expected] of [
    ["lint", /pull request lint must pass only changed workspace files to ESLint/],
    ["design-guard", /Design Token Guard must prepare changed paths before consuming them/],
  ]) {
    const missingPreparation = yaml.load(scopedLintWorkflow)
    missingPreparation.jobs[jobId].steps = missingPreparation.jobs[jobId].steps.filter(
      (step) => step.name !== "Resolve pull request changed paths",
    )
    check(
      "check-gate-charter.mjs",
      `rejects ${jobId} without changed-path preparation`,
      ["--root", stageRepository(`unprepared-${jobId}`, completeCharter(), {
        lintWorkflow: yaml.dump(missingPreparation),
      })],
      { status: 1, stderr: expected },
    )
  }

  const directDiff = yaml.load(scopedLintWorkflow)
  const lintStep = directDiff.jobs.lint.steps.find((step) => step.name === "Lint only files changed by this pull request")
  lintStep.run = lintStep.run.replace('done < "$RUNNER_TEMP/changed-paths-present.nul"',
    'done < <(git diff --name-only -z origin/${{ github.base_ref }}...HEAD)')
  check(
    "check-gate-charter.mjs",
    "rejects lint that bypasses the prepared list",
    ["--root", stageRepository("lint-direct-diff", completeCharter(), { lintWorkflow: yaml.dump(directDiff) })],
    { status: 1, stderr: /pull request lint must pass only changed workspace files to ESLint/ },
  )

  const designDirectDiff = yaml.load(scopedLintWorkflow)
  const tokenStep = designDirectDiff.jobs["design-guard"].steps.find(
    (step) => step.name === "Ban raw --slate-*, transition-all, h-screen in app code",
  )
  tokenStep.run = tokenStep.run.replace('"$RUNNER_TEMP/changed-paths-present.nul"',
    '<(git diff --name-only -z origin/${{ github.base_ref }}...HEAD)')
  check(
    "check-gate-charter.mjs",
    "rejects Design Token Guard that bypasses the prepared list",
    ["--root", stageRepository("design-direct-diff", completeCharter(), { lintWorkflow: yaml.dump(designDirectDiff) })],
    { status: 1, stderr: /Design Token Guard must prepare changed paths before consuming them/ },
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
  for (const workflowFile of ["guards.yml", "dependency-review.yml"]) {
    const workflow = yaml.load(readFileSync(join(REPO_ROOT, ".github", "workflows", workflowFile), "utf8"))
    T(`${workflowFile}: superseded runs share a workflow and ref concurrency group`,
      workflow.concurrency?.group === "${{ github.workflow }}-${{ github.ref }}",
      JSON.stringify(workflow.concurrency))
    T(`${workflowFile}: superseded runs are cancelled`,
      workflow.concurrency?.["cancel-in-progress"] === true,
      JSON.stringify(workflow.concurrency))
  }
  for (const [jobId, stepName] of [
    ["dashes", "PR title and body carry no dashes"],
    ["review-harness", "A UI pull request on redesign/main records what the review skills found"],
  ]) {
    const step = guards.jobs[jobId].steps.find((candidate) => candidate.name === stepName)
    writeFileSync(join(root, "changed-paths.txt"), "")
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
