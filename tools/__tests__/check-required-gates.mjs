import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { REPO_ROOT, T, root, stage, run } from "./_harness.mjs"

const FIXTURE_PROTECTION = "branch-protection-main.json"

/** A minimal workflow whose jobs the reader must find by name, id and templated form. */
const workflowFile = (jobs) =>
  ["name: Fixture", "", "on:", "  pull_request:", "    branches: [main]", "", "jobs:", ...jobs].join("\n")

const namedJob = (id, name) => [`  ${id}:`, `    name: ${name}`, "    runs-on: ubuntu-latest", "    steps:", "      - run: true"]

const stageProtection = (label, contexts) =>
  stage(`required-gates/${label}/protection.json`, JSON.stringify({ required_status_checks: { strict: true, contexts } }, null, 2))

const stageManifest = (label, declaration) =>
  stage(
    `required-gates/${label}/manifest.json`,
    JSON.stringify({ version: 1, repositories: { "owner/fixture": { branch: "main", enforcedWorkflows: ["fixture.yml"], ...declaration } } }, null, 2),
  )

const stageWorkflows = (label, jobs) => dirname(stage(`required-gates/${label}/workflows/fixture.yml`, workflowFile(jobs)))

const gatesRun = (label, { jobs, contexts, declaration = {}, extra = [] }) =>
  run("check-required-gates.mjs", [
    "--repo",
    "owner/fixture",
    "--manifest",
    stageManifest(label, declaration),
    "--workflows-dir",
    stageWorkflows(label, jobs),
    "--protection-file",
    stageProtection(label, contexts),
    "--unverified-workflows-source",
    ...extra,
  ])

const cases = () => {
  /**
   * The live diff, against the protection payload recorded from the real API rather than one
   * written to agree with the expectation (D4). On the day this shipped, all 11 guards.yml jobs
   * were defined and NONE was a required context, which is the whole reason A1 exists: a gate
   * that cannot block is not a gate. PR #654's `review` concluded failure and merged 91 minutes
   * later. When the protection edit lands this case is what proves it landed.
   */
  const recorded = join(REPO_ROOT, "tools", "__fixtures__", FIXTURE_PROTECTION)
  const live = run("check-required-gates.mjs", ["--repo", "thomasluizon/orbit-ui-mobile", "--protection-file", recorded, "--json"])
  const verdict = live.status === 1 || live.status === 0 ? JSON.parse(live.stdout) : null
  T(
    "check-required-gates.mjs: the recorded live payload reports every guards.yml job that cannot block",
    verdict !== null &&
      verdict.enforcedWorkflows.includes("guards.yml") &&
      ["Dash Ban", "Harness Execution", "Cross-Platform Parity", "Context Budget"].every((job) =>
        verdict.problems.some((problem) => problem.includes(`"${job}" but it is NOT a required context`)),
      ),
    `exit ${live.status}\n     ${(live.stderr || live.stdout).trim().split("\n").slice(0, 6).join("\n     ")}`,
  )
  T(
    "check-required-gates.mjs: every App and CodeQL context is accounted for rather than reported",
    verdict !== null &&
      !verdict.problems.some((problem) => /GitGuardian|SonarCloud|Analyze \(/.test(problem)),
    `problems: ${JSON.stringify(verdict?.problems ?? null)}`,
  )
  T(
    "check-required-gates.mjs: the recorded fixture is a real API envelope, not a hand-written stub",
    (() => {
      const payload = JSON.parse(readFileSync(recorded, "utf8"))
      return typeof payload.url === "string" && payload.url.includes("/branches/main/protection") && Array.isArray(payload.required_status_checks?.checks)
    })(),
    "tools/__fixtures__/branch-protection-main.json lost the fields only the real endpoint returns; re-record it rather than editing it",
  )

  /**
   * The two halves of the diff come from different places, and nothing tied them together. A run
   * pointed at this repository's workflows while asking for orbit-api's protection produced a
   * confident, fully formed, entirely wrong verdict: 17 problems claiming orbit-api defines
   * Cross-Platform Parity and Expo SDK Pin, and that its own OpenAPI and migration gates are
   * defined by nobody. It read as a discovery rather than a misconfiguration. State from a source
   * nothing keeps current, in the tool written to catch exactly that.
   */
  const crossedRepo = run("check-required-gates.mjs", [
    "--repo",
    "owner/fixture",
    "--manifest",
    stageManifest("crossed", {}),
    "--workflows-dir",
    join(REPO_ROOT, ".github", "workflows"),
    "--protection-file",
    stageProtection("crossed", []),
  ])
  T(
    "check-required-gates.mjs: a workflows directory belonging to another repository is refused, naming both",
    crossedRepo.status === 2 &&
      /--workflows-dir belongs to \S+ but --repo is owner\/fixture/.test(crossedRepo.stderr) &&
      crossedRepo.stdout === "",
    `exit ${crossedRepo.status}\n     ${(crossedRepo.stderr || crossedRepo.stdout).trim()}`,
  )
  const notACheckout = run("check-required-gates.mjs", [
    "--repo",
    "owner/fixture",
    "--manifest",
    stageManifest("not-a-checkout", {}),
    "--workflows-dir",
    stageWorkflows("not-a-checkout", namedJob("first", "Listed Gate")),
    "--protection-file",
    stageProtection("not-a-checkout", ["Listed Gate"]),
  ])
  T(
    "check-required-gates.mjs: a workflows directory that is not a checkout at all is refused",
    notACheckout.status === 2 && /could not resolve which repository owns/.test(notACheckout.stderr),
    `exit ${notACheckout.status}\n     ${(notACheckout.stderr || notACheckout.stdout).trim()}`,
  )
  const acknowledged = gatesRun("acknowledged", { jobs: namedJob("first", "Listed Gate"), contexts: ["Listed Gate"] })
  T(
    "check-required-gates.mjs: the explicit flag still produces a verdict, under a loud banner",
    acknowledged.status === 0 && /UNVERIFIED WORKFLOWS SOURCE:.*not a checkout.*owner\/fixture/.test(acknowledged.stdout),
    `exit ${acknowledged.status}\n     ${acknowledged.stdout.trim()}`,
  )
  // The matching pair, which is what CI runs: same repository on both halves, no flag.
  T(
    "check-required-gates.mjs: a matching repository and checkout needs no acknowledgement",
    verdict !== null && !live.stdout.includes("UNVERIFIED WORKFLOWS SOURCE"),
    `exit ${live.status}\n     ${(live.stderr || live.stdout).trim().split("\n").slice(0, 4).join("\n     ")}`,
  )

  // The ordered gate: a job added to an enforced workflow without a protection entry fails CI.
  const unlisted = gatesRun("unlisted", { jobs: [...namedJob("first", "Listed Gate"), ...namedJob("second", "Unlisted Gate")], contexts: ["Listed Gate"] })
  T(
    "check-required-gates.mjs: a workflow job with no protection entry exits non-zero naming it",
    unlisted.status === 1 && /"Unlisted Gate" but it is NOT a required context/.test(unlisted.stdout) && !/"Listed Gate" but it is NOT/.test(unlisted.stdout),
    `exit ${unlisted.status}\n     ${unlisted.stdout.trim()}`,
  )
  const exempted = gatesRun("exempted", {
    jobs: [...namedJob("first", "Listed Gate"), ...namedJob("second", "Unlisted Gate")],
    contexts: ["Listed Gate"],
    declaration: { exemptJobs: { "fixture.yml:Unlisted Gate": "a report, deliberately not a merge blocker" } },
  })
  T(
    "check-required-gates.mjs: a declared exemption with a reason is accepted",
    exempted.status === 0 && /every enforced job is required/.test(exempted.stdout),
    `exit ${exempted.status}\n     ${exempted.stdout.trim()}`,
  )

  // The other direction: #440 and #441 sat blocked for two days on a required context nobody
  // reported, so a context with no producer must be as loud as a job with no context.
  const orphanContext = gatesRun("orphan-context", { jobs: namedJob("first", "Listed Gate"), contexts: ["Listed Gate", "Ghost Gate"] })
  T(
    "check-required-gates.mjs: a required context no workflow defines exits non-zero naming it",
    orphanContext.status === 1 && /"Ghost Gate" is required on main but no enforced workflow defines it/.test(orphanContext.stdout),
    `exit ${orphanContext.status}\n     ${orphanContext.stdout.trim()}`,
  )
  const declaredExternal = gatesRun("declared-external", {
    jobs: namedJob("first", "Listed Gate"),
    contexts: ["Listed Gate", "Ghost Gate"],
    declaration: { externalContexts: { "Ghost Gate": "posted by an App with no workflow file" } },
  })
  T(
    "check-required-gates.mjs: a declared external context is accepted",
    declaredExternal.status === 0,
    `exit ${declaredExternal.status}\n     ${declaredExternal.stdout.trim()}`,
  )

  // A matrix job name is a template a static reader cannot expand, so it is reported rather
  // than guessed at. orbit-api's codeql.yml is the live instance.
  const templated = gatesRun("templated", { jobs: namedJob("analyze", "Analyze (${{ matrix.language }})"), contexts: [] })
  T(
    "check-required-gates.mjs: a templated job name is reported rather than guessed at",
    templated.status === 1 && /templated name[\s\S]*static reader cannot resolve/.test(templated.stdout),
    `exit ${templated.status}\n     ${templated.stdout.trim()}`,
  )

  const reportOnly = gatesRun("report-only", { jobs: namedJob("first", "Unlisted Gate"), contexts: [], extra: ["--report-only"] })
  T(
    "check-required-gates.mjs: report-only prints the differences and still exits 0",
    reportOnly.status === 0 && /"Unlisted Gate" but it is NOT a required context/.test(reportOnly.stdout) && /reported only/.test(reportOnly.stdout),
    `exit ${reportOnly.status}\n     ${reportOnly.stdout.trim()}`,
  )

  const undeclared = run("check-required-gates.mjs", [
    "--repo",
    "owner/not-in-the-manifest",
    "--manifest",
    stageManifest("undeclared", {}),
    "--workflows-dir",
    stageWorkflows("undeclared", namedJob("first", "Listed Gate")),
    "--protection-file",
    stageProtection("undeclared", []),
    "--unverified-workflows-source",
  ])
  T(
    "check-required-gates.mjs: an undeclared repository is refused rather than waved through",
    undeclared.status === 2 && /is not declared in/.test(undeclared.stderr),
    `exit ${undeclared.status}\n     ${(undeclared.stderr || undeclared.stdout).trim()}`,
  )

  // Fail CLOSED on a shape we did not confirm. Reading a missing contexts array as "nothing is
  // required" would turn a lookup failure into a clean verdict, which is the defect class this
  // whole ticket exists to remove.
  const malformed = run("check-required-gates.mjs", [
    "--repo",
    "owner/fixture",
    "--manifest",
    stageManifest("malformed", {}),
    "--workflows-dir",
    stageWorkflows("malformed", namedJob("first", "Listed Gate")),
    "--protection-file",
    stage("required-gates/malformed/protection.json", JSON.stringify({ required_status_checks: { strict: true } })),
    "--unverified-workflows-source",
  ])
  T(
    "check-required-gates.mjs: a protection payload with no contexts array fails closed",
    malformed.status === 2 && /carries no required_status_checks\.contexts array/.test(malformed.stderr),
    `exit ${malformed.status}\n     ${(malformed.stderr || malformed.stdout).trim()}`,
  )

  const missingWorkflow = run("check-required-gates.mjs", [
    "--repo",
    "owner/fixture",
    "--manifest",
    stageManifest("missing-workflow", { enforcedWorkflows: ["absent.yml"] }),
    "--workflows-dir",
    stageWorkflows("missing-workflow", namedJob("first", "Listed Gate")),
    "--protection-file",
    stageProtection("missing-workflow", []),
    "--unverified-workflows-source",
  ])
  T(
    "check-required-gates.mjs: an enforced workflow file that does not exist is an error",
    missingWorkflow.status === 2 && /enforced workflow file missing/.test(missingWorkflow.stderr),
    `exit ${missingWorkflow.status}\n     ${(missingWorkflow.stderr || missingWorkflow.stdout).trim()}`,
  )

  /**
   * F-24, confirmed live on orbit-api #444: `guards.yml` triggers on `edited`, so a body edit
   * posts a SECOND check run per job on the same head SHA. Two `Harness Lockstep` runs existed,
   * `failure` at 03:25:02Z and `success` at 03:26:58Z, and the pull request reported BEHIND
   * rather than BLOCKED, so GitHub honours the LATEST run per context. A tool that scans the
   * whole rollup reports failures GitHub does not honour; mine did exactly that.
   */
  const checkRunsRun = (label, runs, contexts) =>
    run("check-required-gates.mjs", [
      "--repo",
      "owner/fixture",
      "--manifest",
      stageManifest(label, { externalContexts: Object.fromEntries(contexts.map((context) => [context, "fixture context"])) }),
      "--workflows-dir",
      stageWorkflows(label, []),
      "--protection-file",
      stageProtection(label, contexts),
      "--head",
      "c0ffee".padEnd(40, "0"),
      "--check-runs-file",
      stage(`required-gates/${label}/check-runs.json`, JSON.stringify({ check_runs: runs })),
      "--unverified-workflows-source",
    ])
  const supersededFailure = checkRunsRun(
    "superseded-failure",
    [
      { name: "Harness Lockstep", status: "completed", conclusion: "failure", started_at: "2026-07-31T03:25:02Z", completed_at: "2026-07-31T03:25:40Z" },
      { name: "Harness Lockstep", status: "completed", conclusion: "success", started_at: "2026-07-31T03:26:58Z", completed_at: "2026-07-31T03:27:44Z" },
    ],
    ["Harness Lockstep"],
  )
  T(
    "check-required-gates.mjs: a failure superseded by a later run on the same context is not reported",
    supersededFailure.status === 0,
    `exit ${supersededFailure.status}\n     ${supersededFailure.stdout.trim()}`,
  )
  const supersededSuccess = checkRunsRun(
    "superseded-success",
    [
      { name: "Harness Lockstep", status: "completed", conclusion: "success", started_at: "2026-07-31T03:25:02Z", completed_at: "2026-07-31T03:25:40Z" },
      { name: "Harness Lockstep", status: "completed", conclusion: "failure", started_at: "2026-07-31T03:26:58Z", completed_at: "2026-07-31T03:27:44Z" },
    ],
    ["Harness Lockstep"],
  )
  T(
    "check-required-gates.mjs: a later failure is reported although an earlier run succeeded",
    supersededSuccess.status === 1 && /concluded failure on its LATEST run/.test(supersededSuccess.stdout),
    `exit ${supersededSuccess.status}\n     ${supersededSuccess.stdout.trim()}`,
  )
  // F-13, observed on run 30575762235: a job skipped by a job-level `if:` posts a completed
  // check run with conclusion `skipped`, and GitHub treats that as SATISFYING the requirement.
  const skipped = checkRunsRun(
    "skipped",
    [{ name: "Context Budget", status: "completed", conclusion: "skipped", started_at: "2026-07-31T04:07:34Z", completed_at: "2026-07-31T04:07:35Z" }],
    ["Context Budget"],
  )
  T(
    "check-required-gates.mjs: a conditionally skipped required check satisfies the requirement",
    skipped.status === 0,
    `exit ${skipped.status}\n     ${skipped.stdout.trim()}`,
  )
  const neverReported = checkRunsRun("never-reported", [], ["Ghost Gate"])
  T(
    "check-required-gates.mjs: a required context with no check run at all is reported",
    neverReported.status === 1 && /has no check run on/.test(neverReported.stdout),
    `exit ${neverReported.status}\n     ${neverReported.stdout.trim()}`,
  )
  const stillRunning = checkRunsRun(
    "still-running",
    [{ name: "Ghost Gate", status: "in_progress", conclusion: null, started_at: "2026-07-31T04:07:34Z" }],
    ["Ghost Gate"],
  )
  T(
    "check-required-gates.mjs: a required context still running is reported rather than read as green",
    stillRunning.status === 1 && /is still in_progress/.test(stillRunning.stdout),
    `exit ${stillRunning.status}\n     ${stillRunning.stdout.trim()}`,
  )
}

export { cases }
