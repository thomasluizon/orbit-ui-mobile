/**
 * check-dead-path.mjs proves a deletion leaves nothing behind. Every case here stages a REAL
 * git repository, because the tool's whole argument is that it reads TRACKED content rather
 * than the working directory, and a fixture made of loose files could not tell the two apart.
 *
 * The protection arm is driven by tools/__fixtures__/branch-protection-main.json, the payload
 * recorded from the live API for check-required-gates.mjs, rather than by a second hand-written
 * one: "React Doctor" is a required context in it and "review" is not, both verified live on
 * 2026-07-31, so the red and the green case rest on what GitHub really returns.
 */

import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { REPO_ROOT, T, root, run, stage } from "./_harness.mjs"

const RECORDED_PROTECTION = join(REPO_ROOT, "tools", "__fixtures__", "branch-protection-main.json")
const RECORDED_LOOKUP_FAILURE = join(REPO_ROOT, "tools", "__fixtures__", "dead-path", "gh-protection-unreadable.json")
const PROTECTED_REPOSITORY = "thomasluizon/orbit-ui-mobile"

const PASSING_HARNESS_VERDICTS = stage(
  "dead-path/passing-harness-verdicts.json",
  `${JSON.stringify(
    {
      tools: { command: "node tools/test-tools.mjs", exitCode: 0 },
      hooks: { command: "node .claude/hooks/test-hooks.mjs", exitCode: 0 },
      lockstep: { command: "node tools/check-lockstep.mjs", exitCode: 0 },
    },
    null,
    2,
  )}\n`,
)

const REQUIRED_GATES = `${JSON.stringify(
  { version: 1, repositories: { [PROTECTED_REPOSITORY]: { branch: "main", enforcedWorkflows: ["guards.yml"], externalContexts: {}, exemptJobs: {} } } },
  null,
  2,
)}\n`

/**
 * A guards.yml with the two things arm 2 and arm 3 read: named jobs, and the harness jobs with
 * the same shape the real one has, a scope step whose `grep -Eq` decides whether the executions
 * run at all. The backslashes are doubled because the fixture is a JavaScript string producing
 * a shell single-quoted ERE.
 */
const guardsWorkflow = ({ gateJobs = [["dashes", "Dash Ban"]], harnessSteps = ["node tools/test-tools.mjs", "node .claude/hooks/test-hooks.mjs"] } = {}) =>
  [
    "name: Guards",
    "",
    "on:",
    "  pull_request:",
    "    branches: [main]",
    "",
    "jobs:",
    ...gateJobs.flatMap(([id, name]) => [`  ${id}:`, `    name: ${name}`, "    runs-on: ubuntu-latest", "    steps:", "      - run: true"]),
    "  harness:",
    "    name: Harness Execution",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - name: Detect a harness change",
    "        id: scope",
    "        run: |",
    "          if git diff --name-only origin/main...HEAD | grep -Eq '^(tools/|\\.claude/)'; then",
    '            echo "changed=true" >> "$GITHUB_OUTPUT"',
    "          fi",
    ...harnessSteps.map((step) => `      - run: ${step}`),
    "  lockstep:",
    "    name: Harness Lockstep",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - name: Detect a lockstep change",
    "        id: scope",
    "        run: |",
    "          if git diff --name-only origin/main...HEAD | grep -Eq '^tools/check-lockstep\\.mjs$'; then",
    '            echo "changed=true" >> "$GITHUB_OUTPUT"',
    "          fi",
    "      - run: node tools/check-lockstep.mjs",
    "",
  ].join("\n")

const workflowFile = (jobId, jobName) =>
  ["name: Fixture", "", "on:", "  pull_request:", "    branches: [main]", "", "jobs:", `  ${jobId}:`, `    name: ${jobName}`, "    runs-on: ubuntu-latest", "    steps:", "      - run: true", ""].join("\n")

const fixtureGit = (repo, argv) => {
  const result = spawnSync("git", ["-C", repo, ...argv], { encoding: "utf8" })
  if (result.status !== 0) throw new Error(`fixture git ${argv.join(" ")} failed in ${repo}: ${result.stderr}`)
  return result.stdout
}

const applyTree = (repo, files) => {
  for (const [path, body] of Object.entries(files)) {
    const absolute = join(repo, path)
    if (body === null) {
      rmSync(absolute, { force: true })
      continue
    }
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, body)
  }
}

/**
 * Commits `base`, then applies `after` to the WORKING TREE and leaves it uncommitted, which is
 * the state a deletion is actually in at the moment somebody wants it proven dead.
 */
const stageRepository = (label, base, after = {}) => {
  const repo = join(root, "dead-path", label)
  mkdirSync(repo, { recursive: true })
  fixtureGit(repo, ["init", "-q", "--initial-branch=main"])
  fixtureGit(repo, ["config", "user.email", "gate@orbit.test"])
  fixtureGit(repo, ["config", "user.name", "Orbit Gate"])
  fixtureGit(repo, ["remote", "add", "origin", "https://github.com/owner/fixture.git"])
  applyTree(repo, base)
  fixtureGit(repo, ["add", "-A"])
  fixtureGit(repo, ["commit", "-q", "-m", "base"])
  const baseCommit = fixtureGit(repo, ["rev-parse", "HEAD"]).trim()
  applyTree(repo, after)
  return { repo, baseCommit }
}

const deadPath = ({ repo, baseCommit }, argv = [], options = {}) => {
  const { harnessVerdicts = PASSING_HARNESS_VERDICTS, ...runOptions } = options
  const evidenceArguments = harnessVerdicts === null ? [] : ["--harness-verdicts", harnessVerdicts]
  return run(
    "check-dead-path.mjs",
    ["--repo-root", repo, "--base", baseCommit, "--search-root", repo, ...evidenceArguments, ...argv],
    runOptions,
  )
}

/**
 * Replays the recorded `gh api` failure. GH_BIN points at node and this shim answers when node
 * was invoked as gh (argv[1] is a subcommand, not a file), the same trick the shared orca stub
 * uses, so the tool's real spawn path runs.
 */
const GH_FAILURE_SHIM = stage(
  "dead-path/gh-failure-shim.cjs",
  `const { existsSync, readFileSync } = require("node:fs")
const argv = process.argv.slice(1)
if (argv[0] && existsSync(argv[0])) return
const recorded = JSON.parse(readFileSync(process.env.ORBIT_DEAD_PATH_GH_FAILURE, "utf8"))
process.stdout.write(recorded.stdout)
process.stderr.write(recorded.stderr)
process.exit(recorded.exitStatus)
`,
)

const ghFailureEnv = () => ({
  GH_BIN: process.execPath,
  NODE_OPTIONS: `--require "${GH_FAILURE_SHIM.replaceAll("\\", "/")}"`,
  ORBIT_DEAD_PATH_GH_FAILURE: RECORDED_LOOKUP_FAILURE,
})

/** The shared shape for the four workflow-deletion cases: guards, a victim workflow, a tools change. */
const workflowDeletion = (label, jobName, victim = "react-doctor.yml") =>
  stageRepository(
    label,
    {
      ".github/workflows/guards.yml": guardsWorkflow(),
      [`.github/workflows/${victim}`]: workflowFile("analyze", jobName),
      "tools/required-gates.json": REQUIRED_GATES,
      "tools/rollup.sh": "echo base\n",
    },
    { [`.github/workflows/${victim}`]: null, "tools/rollup.sh": "echo after\n" },
  )

const cases = () => {
  // 1 and 2. The whole point, in its two directions.
  const withReference = stageRepository(
    "surviving-reference",
    {
      ".github/workflows/guards.yml": guardsWorkflow(),
      "tools/ghost-tool.mjs": "console.log('gone')\n",
      "tools/rollup.sh": "bash tools/ghost-tool.mjs\n",
    },
    { "tools/ghost-tool.mjs": null },
  )
  const surviving = deadPath(withReference)
  T(
    "check-dead-path.mjs: a surviving tracked reference fails naming the file and the line",
    surviving.status === 1 && /references\s+FAIL/.test(surviving.stdout) && /tools\/rollup\.sh:1 still references tools\/ghost-tool\.mjs/.test(surviving.stdout),
    `exit ${surviving.status}\n     ${(surviving.stderr || surviving.stdout).trim().split("\n").slice(0, 8).join("\n     ")}`,
  )
  /**
   * The gate must not pretend to have classified what it only found. A detector assigning the
   * deleted path to a variable and a caller assigning it are byte-identical, so the verdict
   * says UNCLASSIFIED and hands the reader the three ways out rather than guessing at one.
   */
  T(
    "check-dead-path.mjs: a surviving reference is reported unclassified, with all three resolutions named",
    /\(unclassified\)/.test(surviving.stdout) && /CALLER \(delete it\)/.test(surviving.stdout) && /DETECTOR of the path's absence/.test(surviving.stdout) && /RECORD \(move it to the vault/.test(surviving.stdout),
    surviving.stdout.trim(),
  )

  const dead = stageRepository(
    "genuinely-dead",
    { ".github/workflows/guards.yml": guardsWorkflow(), "tools/ghost-tool.mjs": "console.log('gone')\n", "tools/rollup.sh": "echo unrelated\n" },
    { "tools/ghost-tool.mjs": null },
  )
  const deadResult = deadPath(dead)
  T(
    "check-dead-path.mjs: a genuinely dead path passes with every arm named",
    deadResult.status === 0 && /references\s+OK/.test(deadResult.stdout) && /harnesses\s+OK/.test(deadResult.stdout) && /guardsJobs\s+OK/.test(deadResult.stdout) && /protection\s+NOT-APPLICABLE/.test(deadResult.stdout),
    `exit ${deadResult.status}\n     ${(deadResult.stderr || deadResult.stdout).trim()}`,
  )
  T(
    "check-dead-path.mjs: the verdict distinguishes recorded passing evidence from scheduling",
    /recorded exit 0/.test(deadResult.stdout) && /tools scheduled/.test(deadResult.stdout),
    deadResult.stdout.trim(),
  )

  const missingVerdicts = deadPath(dead, [], { harnessVerdicts: null })
  T(
    "check-dead-path.mjs: missing harness verdict evidence is refused before any arm can pass",
    missingVerdicts.status === 2 && /--harness-verdicts is required/.test(missingVerdicts.stderr),
    `exit ${missingVerdicts.status}\n     ${(missingVerdicts.stderr || missingVerdicts.stdout).trim()}`,
  )

  const malformedVerdicts = stage("dead-path/malformed-harness-verdicts.json", "{not-json\n")
  const malformedVerdictsResult = deadPath(dead, [], { harnessVerdicts: malformedVerdicts })
  T(
    "check-dead-path.mjs: malformed harness verdict evidence is refused",
    malformedVerdictsResult.status === 2 && /harness verdicts.*valid JSON/.test(malformedVerdictsResult.stderr),
    `exit ${malformedVerdictsResult.status}\n     ${(malformedVerdictsResult.stderr || malformedVerdictsResult.stdout).trim()}`,
  )

  const missingVerdictsFile = deadPath(dead, [], {
    harnessVerdicts: join(root, "dead-path", "no-such-harness-verdicts.json"),
  })
  T(
    "check-dead-path.mjs: an unreadable harness verdict record is refused",
    missingVerdictsFile.status === 2 && /could not read the harness verdicts/.test(missingVerdictsFile.stderr),
    `exit ${missingVerdictsFile.status}\n     ${(missingVerdictsFile.stderr || missingVerdictsFile.stdout).trim()}`,
  )

  const arrayVerdicts = stage("dead-path/array-harness-verdicts.json", "[]\n")
  const arrayVerdictsResult = deadPath(dead, [], { harnessVerdicts: arrayVerdicts })
  T(
    "check-dead-path.mjs: a non-object harness verdict payload is refused",
    arrayVerdictsResult.status === 2 && /harness verdicts must be a JSON object/.test(arrayVerdictsResult.stderr),
    `exit ${arrayVerdictsResult.status}\n     ${(arrayVerdictsResult.stderr || arrayVerdictsResult.stdout).trim()}`,
  )

  const incompleteVerdicts = stage(
    "dead-path/incomplete-harness-verdicts.json",
    `${JSON.stringify({ tools: { command: "node tools/test-tools.mjs", exitCode: 0 } })}\n`,
  )
  const incompleteVerdictsResult = deadPath(dead, [], { harnessVerdicts: incompleteVerdicts })
  T(
    "check-dead-path.mjs: a verdict record missing a harness is refused",
    incompleteVerdictsResult.status === 2 && /exactly these keys: hooks, lockstep, tools/.test(incompleteVerdictsResult.stderr),
    `exit ${incompleteVerdictsResult.status}\n     ${(incompleteVerdictsResult.stderr || incompleteVerdictsResult.stdout).trim()}`,
  )

  const inventedCommandVerdicts = stage(
    "dead-path/invented-command-harness-verdicts.json",
    `${JSON.stringify({
      tools: { command: "node tools/not-the-harness.mjs", exitCode: 0 },
      hooks: { command: "node .claude/hooks/test-hooks.mjs", exitCode: 0 },
      lockstep: { command: "node tools/check-lockstep.mjs", exitCode: 0 },
    })}\n`,
  )
  const inventedCommandResult = deadPath(dead, [], { harnessVerdicts: inventedCommandVerdicts })
  T(
    "check-dead-path.mjs: a verdict attached to the wrong command is refused",
    inventedCommandResult.status === 2 && /tools command must be exactly "node tools\/test-tools\.mjs"/.test(inventedCommandResult.stderr),
    `exit ${inventedCommandResult.status}\n     ${(inventedCommandResult.stderr || inventedCommandResult.stdout).trim()}`,
  )

  const nonObjectVerdicts = stage(
    "dead-path/non-object-entry-harness-verdicts.json",
    `${JSON.stringify({
      tools: null,
      hooks: { command: "node .claude/hooks/test-hooks.mjs", exitCode: 0 },
      lockstep: { command: "node tools/check-lockstep.mjs", exitCode: 0 },
    })}\n`,
  )
  const nonObjectVerdictsResult = deadPath(dead, [], { harnessVerdicts: nonObjectVerdicts })
  T(
    "check-dead-path.mjs: a non-object individual verdict is refused",
    nonObjectVerdictsResult.status === 2 && /tools harness verdict must be an object/.test(nonObjectVerdictsResult.stderr),
    `exit ${nonObjectVerdictsResult.status}\n     ${(nonObjectVerdictsResult.stderr || nonObjectVerdictsResult.stdout).trim()}`,
  )

  const extraFieldVerdicts = stage(
    "dead-path/extra-field-harness-verdicts.json",
    `${JSON.stringify({
      tools: { command: "node tools/test-tools.mjs", exitCode: 0, claimed: "passed" },
      hooks: { command: "node .claude/hooks/test-hooks.mjs", exitCode: 0 },
      lockstep: { command: "node tools/check-lockstep.mjs", exitCode: 0 },
    })}\n`,
  )
  const extraFieldVerdictsResult = deadPath(dead, [], { harnessVerdicts: extraFieldVerdicts })
  T(
    "check-dead-path.mjs: an unrecognised verdict field is refused",
    extraFieldVerdictsResult.status === 2 && /tools harness verdict must carry exactly command and exitCode/.test(extraFieldVerdictsResult.stderr),
    `exit ${extraFieldVerdictsResult.status}\n     ${(extraFieldVerdictsResult.stderr || extraFieldVerdictsResult.stdout).trim()}`,
  )

  const invalidExitVerdicts = stage(
    "dead-path/invalid-exit-harness-verdicts.json",
    `${JSON.stringify({
      tools: { command: "node tools/test-tools.mjs", exitCode: "0" },
      hooks: { command: "node .claude/hooks/test-hooks.mjs", exitCode: 0 },
      lockstep: { command: "node tools/check-lockstep.mjs", exitCode: 0 },
    })}\n`,
  )
  const invalidExitVerdictsResult = deadPath(dead, [], { harnessVerdicts: invalidExitVerdicts })
  T(
    "check-dead-path.mjs: a non-integer exit code is refused",
    invalidExitVerdictsResult.status === 2 && /tools exitCode must be an integer from 0 through 255/.test(invalidExitVerdictsResult.stderr),
    `exit ${invalidExitVerdictsResult.status}\n     ${(invalidExitVerdictsResult.stderr || invalidExitVerdictsResult.stdout).trim()}`,
  )

  const duplicateVerdicts = deadPath(dead, ["--harness-verdicts", PASSING_HARNESS_VERDICTS])
  T(
    "check-dead-path.mjs: duplicate harness verdict arguments are refused",
    duplicateVerdicts.status === 2 && /--harness-verdicts may be given only once/.test(duplicateVerdicts.stderr),
    `exit ${duplicateVerdicts.status}\n     ${(duplicateVerdicts.stderr || duplicateVerdicts.stdout).trim()}`,
  )

  const failedHarnessVerdicts = stage(
    "dead-path/failed-harness-verdicts.json",
    `${JSON.stringify({
      tools: { command: "node tools/test-tools.mjs", exitCode: 1 },
      hooks: { command: "node .claude/hooks/test-hooks.mjs", exitCode: 0 },
      lockstep: { command: "node tools/check-lockstep.mjs", exitCode: 0 },
    })}\n`,
  )
  const failedHarnessResult = deadPath(dead, [], { harnessVerdicts: failedHarnessVerdicts })
  T(
    "check-dead-path.mjs: a recorded nonzero harness verdict fails the harness arm",
    failedHarnessResult.status === 1 && /harnesses\s+FAIL/.test(failedHarnessResult.stdout) && /tools recorded exit 1/.test(failedHarnessResult.stdout),
    `exit ${failedHarnessResult.status}\n     ${(failedHarnessResult.stderr || failedHarnessResult.stdout).trim()}`,
  )

  /**
   * The live lesson from ORB-163: a plain grep over a checkout reported
   * .claude/audits/dual-engine-proposal.md and .claude/reviews/pr-652-review.md as references
   * to the removed review workflow. Both directories are gitignored with zero tracked files, so acting on
   * that report would have produced a pull request touching files nobody else has.
   */
  const ignored = stageRepository(
    "gitignored-artifact",
    { ".gitignore": ".claude/audits/\n", ".github/workflows/guards.yml": guardsWorkflow(), "tools/ghost-tool.mjs": "console.log('gone')\n" },
    { "tools/ghost-tool.mjs": null, ".claude/audits/dossier.md": "an audit citing tools/ghost-tool.mjs at length\n" },
  )
  const ignoredResult = deadPath(ignored)
  T(
    "check-dead-path.mjs: a gitignored untracked artifact naming the path is not a reference",
    ignoredResult.status === 0 &&
      readFileSync(join(ignored.repo, ".claude", "audits", "dossier.md"), "utf8").includes("ghost-tool") &&
      fixtureGit(ignored.repo, ["ls-files", ".claude/audits"]).trim() === "",
    `exit ${ignoredResult.status}\n     ${(ignoredResult.stderr || ignoredResult.stdout).trim()}`,
  )

  /**
   * git grep -I skips a file git reads as binary, and one stray NUL byte is enough to make it
   * read a source file that way. check-dead-path.mjs shipped with one for an afternoon, so its
   * own source was invisible to its own search. A binary match carries no line and no marker,
   * so it is reported as its own kind rather than dropped.
   */
  const binary = stageRepository(
    "binary-reference",
    { ".github/workflows/guards.yml": guardsWorkflow(), "tools/ghost-tool.mjs": "console.log('gone')\n", "tools/generated.bin": "prefix\u0000 tools/ghost-tool.mjs is invoked here\n" },
    { "tools/ghost-tool.mjs": null },
  )
  const binaryResult = deadPath(binary)
  T(
    "check-dead-path.mjs: a match inside a file git reads as binary is reported, not skipped",
    binaryResult.status === 1 && /tools\/generated\.bin still references/.test(binaryResult.stdout) && /reads as binary, where no marker can be read/.test(binaryResult.stdout),
    `exit ${binaryResult.status}\n     ${(binaryResult.stderr || binaryResult.stdout).trim()}`,
  )

  // 4, 5 and 6. The inline declaration, which is the only thing that excuses a live reference.
  const declared = stageRepository(
    "declared-absence",
    {
      ".github/workflows/guards.yml": guardsWorkflow(),
      "tools/ghost-tool.mjs": "console.log('gone')\n",
      "tools/rollup.sh": 'test -f tools/ghost-tool.mjs && exit 1 # dead-path-ok: fails closed if the tool comes back\n',
    },
    { "tools/ghost-tool.mjs": null },
  )
  const declaredResult = deadPath(declared)
  T(
    "check-dead-path.mjs: a reference declared inline with a reason is accepted",
    declaredResult.status === 0 && /1 declared with dead-path-ok/.test(declaredResult.stdout),
    `exit ${declaredResult.status}\n     ${(declaredResult.stderr || declaredResult.stdout).trim()}`,
  )

  const reasonless = stageRepository(
    "declared-without-reason",
    { ".github/workflows/guards.yml": guardsWorkflow(), "tools/ghost-tool.mjs": "console.log('gone')\n", "tools/rollup.sh": "test -f tools/ghost-tool.mjs # dead-path-ok: yes\n" },
    { "tools/ghost-tool.mjs": null },
  )
  const reasonlessResult = deadPath(reasonless)
  T(
    "check-dead-path.mjs: a marker with no reason fails exactly like no marker",
    reasonlessResult.status === 1 && /the dead-path-ok: marker carries no reason/.test(reasonlessResult.stdout),
    `exit ${reasonlessResult.status}\n     ${(reasonlessResult.stderr || reasonlessResult.stdout).trim()}`,
  )

  const above = stageRepository(
    "declared-on-the-line-above",
    {
      ".github/workflows/guards.yml": guardsWorkflow(),
      "tools/ghost-tool.mjs": "console.log('gone')\n",
      "tools/rollup.sh": "# dead-path-ok: the absence is the signal this script reads\ntest -f tools/ghost-tool.mjs && exit 1\n",
    },
    { "tools/ghost-tool.mjs": null },
  )
  const aboveResult = deadPath(above)
  T(
    "check-dead-path.mjs: a marker on the line directly above the reference is accepted",
    aboveResult.status === 0 && /1 declared with dead-path-ok/.test(aboveResult.stdout),
    `exit ${aboveResult.status}\n     ${(aboveResult.stderr || aboveResult.stdout).trim()}`,
  )

  /**
   * The clause that matters most. Deleting the `dashes` and `copy` jobs passed check-lockstep,
   * the tools harness and the hooks harness cleanly, so nothing else here goes red: this case
   * fails on the job diff alone. Dash Ban is not a required context in the recorded
   * orbit-ui-mobile payload, which is what keeps the protection arm green here and is also why
   * the job diff, not protection, is the clause that catches this.
   */
  const lostJob = stageRepository(
    "lost-guards-job",
    {
      ".github/workflows/guards.yml": guardsWorkflow({ gateJobs: [["dashes", "Dash Ban"], ["copy", "Copy Register"]] }),
      "tools/ghost-tool.mjs": "console.log('gone')\n",
      "tools/required-gates.json": REQUIRED_GATES,
    },
    { "tools/ghost-tool.mjs": null, ".github/workflows/guards.yml": guardsWorkflow({ gateJobs: [["copy", "Copy Register"]] }) },
  )
  const lostJobResult = deadPath(lostJob, ["--protection-file", `${PROTECTED_REPOSITORY}=${RECORDED_PROTECTION}`])
  T(
    "check-dead-path.mjs: a guards.yml job deleted with the change fails on the job-name diff alone",
    lostJobResult.status === 1 &&
      /guardsJobs\s+FAIL.*Dash Ban/.test(lostJobResult.stdout) &&
      /references\s+OK/.test(lostJobResult.stdout) &&
      /harnesses\s+OK/.test(lostJobResult.stdout) &&
      /protection\s+OK/.test(lostJobResult.stdout),
    `exit ${lostJobResult.status}\n     ${(lostJobResult.stderr || lostJobResult.stdout).trim()}`,
  )

  // 8 and 9. Branch protection, against the recorded live payload.
  const requiredContext = workflowDeletion("required-context", "React Doctor")
  const requiredResult = deadPath(requiredContext, ["--protection-file", `${PROTECTED_REPOSITORY}=${RECORDED_PROTECTION}`])
  T(
    "check-dead-path.mjs: deleting the only producer of a required status context fails naming the repository",
    requiredResult.status === 1 && /protection\s+FAIL/.test(requiredResult.stdout) && new RegExp(`"React Doctor" is a required status check on ${PROTECTED_REPOSITORY}@main`).test(requiredResult.stdout),
    `exit ${requiredResult.status}\n     ${(requiredResult.stderr || requiredResult.stdout).trim()}`,
  )

  const unrequiredContext = workflowDeletion("unrequired-context", "Ghost Gate", "ghost-gate.yml")
  const unrequiredResult = deadPath(unrequiredContext, ["--protection-file", `${PROTECTED_REPOSITORY}=${RECORDED_PROTECTION}`])
  T(
    "check-dead-path.mjs: deleting a workflow whose context nobody requires passes, saying which protection it read",
    unrequiredResult.status === 0 && /protection\s+OK/.test(unrequiredResult.stdout) && new RegExp(`is required by ${PROTECTED_REPOSITORY}@main`).test(unrequiredResult.stdout),
    `exit ${unrequiredResult.status}\n     ${(unrequiredResult.stderr || unrequiredResult.stdout).trim()}`,
  )

  /**
   * "Could not look" must never read as "checked and aligned". orbit-api #440 and #441 sat for
   * two days on a required context nobody reported, with every reported check green.
   */
  const unreadable = workflowDeletion("protection-unreadable", "Ghost Gate", "ghost-gate.yml")
  const refused = deadPath(unreadable, [], { env: ghFailureEnv() })
  T(
    "check-dead-path.mjs: branch protection that cannot be read exits 2 rather than reporting aligned",
    refused.status === 2 && /branch protection could not be read/.test(refused.stderr) && /Bad credentials/.test(refused.stderr) && refused.stdout === "",
    `exit ${refused.status}\n     ${(refused.stderr || refused.stdout).trim()}`,
  )
  const acknowledged = deadPath(unreadable, ["--protection-unchecked"], { env: ghFailureEnv() })
  T(
    "check-dead-path.mjs: the acknowledged form reports NOT CHECKED under a banner, distinctly from aligned",
    acknowledged.status === 0 &&
      /^PROTECTION NOT CHECKED: /m.test(acknowledged.stdout) &&
      /protection\s+NOT-CHECKED/.test(acknowledged.stdout) &&
      !/is required by/.test(acknowledged.stdout),
    `exit ${acknowledged.status}\n     ${(acknowledged.stderr || acknowledged.stdout).trim()}`,
  )
  const acknowledgedJson = deadPath(unreadable, ["--protection-unchecked", "--json"], { env: ghFailureEnv() })
  const parsedJson = acknowledgedJson.status === 0 ? JSON.parse(acknowledgedJson.stdout) : null
  T(
    "check-dead-path.mjs: the JSON says checked false rather than omitting the distinction",
    parsedJson?.protection?.checked === false && parsedJson.arms.protection.status === "not-checked" && parsedJson.protection.repositories.every((entry) => typeof entry.unreadable === "string"),
    `exit ${acknowledgedJson.status}\n     ${(acknowledgedJson.stderr || acknowledgedJson.stdout).trim().slice(0, 600)}`,
  )

  const unknownRepository = deadPath(unrequiredContext, ["--protection-file", `owner/not-declared=${RECORDED_PROTECTION}`])
  T(
    "check-dead-path.mjs: a recorded payload for an undeclared repository is refused, not ignored",
    unknownRepository.status === 2 && /--protection-file names owner\/not-declared/.test(unknownRepository.stderr) && /read instead/.test(unknownRepository.stderr),
    `exit ${unknownRepository.status}\n     ${(unknownRepository.stderr || unknownRepository.stdout).trim()}`,
  )

  // 12 and 13. Arm 2 is a claim about CI, so both halves of that claim are checked.
  const harnessGone = stageRepository(
    "harness-invocation-gone",
    { ".github/workflows/guards.yml": guardsWorkflow(), "tools/ghost-tool.mjs": "console.log('gone')\n" },
    { "tools/ghost-tool.mjs": null, ".github/workflows/guards.yml": guardsWorkflow({ harnessSteps: ["node .claude/hooks/test-hooks.mjs"] }) },
  )
  const harnessGoneResult = deadPath(harnessGone)
  T(
    "check-dead-path.mjs: a harness invocation deleted from guards.yml fails naming the script",
    harnessGoneResult.status === 1 && /harnesses\s+FAIL.*tools\/test-tools\.mjs is invoked by no/.test(harnessGoneResult.stdout),
    `exit ${harnessGoneResult.status}\n     ${(harnessGoneResult.stderr || harnessGoneResult.stdout).trim()}`,
  )

  /**
   * guards.yml scopes both harness executions to a diff matching ^(tools/|\.claude/). A change
   * that only removes a file under .github/workflows/ therefore runs NEITHER, so claiming the
   * harnesses prove the deletion safe would be a claim about a suite that never ran.
   */
  const unscheduled = stageRepository(
    "no-harness-scheduled",
    { ".github/workflows/guards.yml": guardsWorkflow(), ".github/workflows/ghost-gate.yml": workflowFile("ghost", "Ghost Gate"), "tools/required-gates.json": REQUIRED_GATES },
    { ".github/workflows/ghost-gate.yml": null },
  )
  const unscheduledResult = deadPath(unscheduled, ["--protection-file", `${PROTECTED_REPOSITORY}=${RECORDED_PROTECTION}`])
  T(
    "check-dead-path.mjs: a change that schedules none of the three harnesses fails rather than claiming them",
    unscheduledResult.status === 1 && /harnesses\s+FAIL.*none of the three harnesses is scheduled/.test(unscheduledResult.stdout),
    `exit ${unscheduledResult.status}\n     ${(unscheduledResult.stderr || unscheduledResult.stdout).trim()}`,
  )

  // 14, 15 and 16. Refusals, because a gate with nothing to check must not exit 0.
  const nothingDeleted = stageRepository("nothing-deleted", { ".github/workflows/guards.yml": guardsWorkflow(), "tools/rollup.sh": "echo base\n" }, { "tools/rollup.sh": "echo after\n" })
  const nothingResult = deadPath(nothingDeleted)
  T(
    "check-dead-path.mjs: a change deleting nothing is refused rather than passing on an empty subject",
    nothingResult.status === 2 && /nothing to prove dead/.test(nothingResult.stderr),
    `exit ${nothingResult.status}\n     ${(nothingResult.stderr || nothingResult.stdout).trim()}`,
  )

  const shortKey = deadPath(nothingDeleted, ["--path", "tools/a.mjs"])
  T(
    "check-dead-path.mjs: a search key too short to mean anything is refused rather than searched for",
    shortKey.status === 2 && /shorter than 4 characters/.test(shortKey.stderr),
    `exit ${shortKey.status}\n     ${(shortKey.stderr || shortKey.stdout).trim()}`,
  )

  /**
   * The default search set comes from .claude/orchestrator.json. A declared repository that is
   * not a checkout must refuse: searching fewer repositories than the verdict claims is the
   * green-over-an-unchecked-condition defect in miniature.
   */
  const missingSibling = stageRepository(
    "missing-sibling",
    {
      ".claude/orchestrator.json": `${JSON.stringify({ repos: { ui: ".", api: join(root, "dead-path", "no-such-checkout") } })}\n`,
      ".github/workflows/guards.yml": guardsWorkflow(),
      "tools/ghost-tool.mjs": "console.log('gone')\n",
    },
    { "tools/ghost-tool.mjs": null },
  )
  const missingSiblingResult = run("check-dead-path.mjs", [
    "--repo-root",
    missingSibling.repo,
    "--base",
    missingSibling.baseCommit,
    "--harness-verdicts",
    PASSING_HARNESS_VERDICTS,
  ])
  T(
    "check-dead-path.mjs: a declared sibling repository that is not a checkout is refused, naming it",
    missingSiblingResult.status === 2 && /declares repos\.api at .*no-such-checkout/.test(missingSiblingResult.stderr) && /Refusing rather than searching fewer repositories/.test(missingSiblingResult.stderr),
    `exit ${missingSiblingResult.status}\n     ${(missingSiblingResult.stderr || missingSiblingResult.stdout).trim()}`,
  )

  const help = run("check-dead-path.mjs", ["--help"])
  T(
    "check-dead-path.mjs: help specifies the required harness verdict record and exact commands",
    help.status === 0 &&
      /--harness-verdicts <path>/.test(help.stdout) &&
      /REQUIRED JSON record/.test(help.stdout) &&
      /node tools\/test-tools\.mjs/.test(help.stdout) &&
      /node \.claude\/hooks\/test-hooks\.mjs/.test(help.stdout) &&
      /node tools\/check-lockstep\.mjs/.test(help.stdout),
    `exit ${help.status}\n     ${(help.stderr || help.stdout).trim()}`,
  )

  T(
    "check-dead-path.mjs: the recorded lookup failure is a captured envelope rather than a written one",
    (() => {
      const recorded = JSON.parse(readFileSync(RECORDED_LOOKUP_FAILURE, "utf8"))
      return recorded.exitStatus === 1 && recorded.stderr.startsWith("gh: ") && JSON.parse(recorded.stdout).status === "401" && typeof recorded.how === "string"
    })(),
    `${RECORDED_LOOKUP_FAILURE} no longer carries the envelope gh really printed; re-record it rather than editing it`,
  )
  T(
    "check-dead-path.mjs: the fixture repositories were real checkouts, so tracked and untracked could differ",
    existsSync(join(ignored.repo, ".git")) && fixtureGit(ignored.repo, ["ls-files"]).includes(".gitignore"),
    `${ignored.repo} is not a checkout, so the tracked-versus-working distinction proved nothing`,
  )
}

export { cases }
