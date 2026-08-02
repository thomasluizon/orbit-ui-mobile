import { createHash } from "node:crypto"
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { REPO_ROOT, TOOLS_DIR, T, root, check, run } from "./_harness.mjs"

const calibrationDate = (daysAgo) => {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

const calibrationFingerprint = (source) =>
  `sha256:${createHash("sha256").update(source.replaceAll("\r\n", "\n")).digest("hex")}`

const stageCalibration = (label, options = {}) => {
  const base = join(root, "calibration", label)
  const currentModel = options.currentModel ?? "gpt-current"
  const currentDefaultArgs = options.currentDefaultArgs ?? ["-c", 'model_reasoning_effort="high"']
  const stampedModel = options.stampedModel ?? "gpt-current"
  const agentSource = "---\nname: sample\n---\n"
  const skillSource = "---\nname: sample\n---\n"
  mkdirSync(join(base, "tools", "lib"), { recursive: true })
  mkdirSync(join(base, ".claude", "agents"), { recursive: true })
  mkdirSync(join(base, ".claude", "skills", "sample"), { recursive: true })
  cpSync(join(TOOLS_DIR, "check-calibration.mjs"), join(base, "tools", "check-calibration.mjs"))
  cpSync(
    join(TOOLS_DIR, "lib", "orchestrator-config.mjs"),
    join(base, "tools", "lib", "orchestrator-config.mjs"),
  )
  cpSync(
    join(TOOLS_DIR, "lib", "subprocess-options.mjs"),
    join(base, "tools", "lib", "subprocess-options.mjs"),
  )
  writeFileSync(join(base, ".claude", "agents", "sample.md"), agentSource)
  writeFileSync(join(base, ".claude", "skills", "sample", "SKILL.md"), skillSource)
  writeFileSync(
    join(base, ".claude", "orchestrator.json"),
    JSON.stringify({
      maxParallelWorktrees: 8,
      ...(options.orchestrator ?? {
        worker: "codex",
        workers: {
          codex: {
            args: [],
            models: {
              default: { model: currentModel, args: currentDefaultArgs },
              cheap: { model: "gpt-cheap" },
              deep: { model: "gpt-deep" },
            },
          },
        },
      }),
    }),
  )
  if (!options.missingArtifact) {
    const entries = options.entries ?? [
      { file: ".claude/agents/sample.md", verdict: "kept", reason: "The bounded role still fits." },
      { file: ".claude/skills/sample/SKILL.md", verdict: "kept", reason: "The bounded procedure still fits." },
    ]
    const artifact = options.artifact ?? {
      model: stampedModel,
      invocation: options.stampedInvocation ?? [
        ...currentDefaultArgs,
        "--model",
        stampedModel,
      ],
      date: options.date ?? calibrationDate(0),
      entries: entries.map((entry) => ({
        fingerprint: calibrationFingerprint(
          entry.file === ".claude/agents/sample.md"
            ? agentSource
            : entry.file === ".claude/skills/sample/SKILL.md"
              ? skillSource
              : "",
        ),
        ...entry,
      })),
    }
    writeFileSync(
      join(base, ".claude", "calibration.json"),
      options.malformed ? "{ nope" : `${JSON.stringify(artifact, null, 2)}\n`,
    )
  }
  return join(base, "tools", "check-calibration.mjs")
}

const calibrationCases = () => {
  const guards = readFileSync(join(REPO_ROOT, ".github", "workflows", "guards.yml"), "utf8")
  const calibrationJob = /^  calibration:\r?\n([\s\S]*?)(?=^  [a-z][a-z-]*:\r?$)/m.exec(guards)?.[0] ?? ""
  T(
    "check-calibration.mjs: the blocking calibration job checks out complete base history",
    /name: Harness Calibration[\s\S]*uses: actions\/checkout@v7\r?\n\s+with:\r?\n\s+fetch-depth: 0/.test(calibrationJob),
    calibrationJob || "guards.yml has no calibration job",
  )
  T(
    "check-calibration.mjs: the calibration reseed label remains the only pull request bypass",
    /if: github\.event_name == 'pull_request' && !contains\(github\.event\.pull_request\.labels\.\*\.name, 'calibration:reseed'\)/.test(calibrationJob)
      && /node tools\/check-calibration\.mjs > "\$RUNNER_TEMP\/calibration\.txt" 2>&1 \|\| status=\$\?/.test(calibrationJob)
      && /exit "\$status"/.test(calibrationJob)
      && !/--report-only/.test(calibrationJob),
    calibrationJob || "guards.yml has no calibration job",
  )

  const valid = stageCalibration("valid")
  check("check-calibration.mjs", "accepts total coverage", [], { status: 0, stdout: /PASS: 2\/2/ }, { path: valid })

  const missing = stageCalibration("missing-entry", {
    entries: [{ file: ".claude/skills/sample/SKILL.md", verdict: "kept", reason: "Still fits." }],
  })
  check("check-calibration.mjs", "names an uncovered agent", [], { status: 1, stdout: /missing entry: \.claude\/agents\/sample\.md/ }, { path: missing })

  /**
   * A SKILL is the half that actually shipped uncovered: .claude/skills/quota/SKILL.md
   * arrived in 495f037d and the gate failed silently for every merge afterwards, because
   * CI only ever ran this tool with --report-only. The pair below is one fixture read
   * twice, red then green, so "adding the entry fixes it" is proven rather than assumed.
   */
  const missingSkill = stageCalibration("missing-skill-entry", {
    entries: [{ file: ".claude/agents/sample.md", verdict: "kept", reason: "The bounded role still fits." }],
  })
  check(
    "check-calibration.mjs",
    "names an uncovered skill",
    [],
    { status: 1, stdout: /missing entry: \.claude\/skills\/sample\/SKILL\.md/ },
    { path: missingSkill },
  )
  const missingSkillRoot = dirname(dirname(missingSkill))
  const missingSkillArtifact = join(missingSkillRoot, ".claude", "calibration.json")
  const repairedArtifact = JSON.parse(readFileSync(missingSkillArtifact, "utf8"))
  repairedArtifact.entries.push({
    file: ".claude/skills/sample/SKILL.md",
    verdict: "kept",
    reason: "The bounded procedure still fits.",
    fingerprint: calibrationFingerprint(
      readFileSync(join(missingSkillRoot, ".claude", "skills", "sample", "SKILL.md"), "utf8"),
    ),
  })
  writeFileSync(missingSkillArtifact, `${JSON.stringify(repairedArtifact, null, 2)}\n`)
  check(
    "check-calibration.mjs",
    "the same artifact passes once the skill entry is added",
    [],
    { status: 0, stdout: /PASS: 2\/2/ },
    { path: missingSkill },
  )

  /**
   * The case that would have caught PR1's stale stamp the day it landed. A worker-level
   * argument, codex's `exec` subcommand, is part of the resolved invocation, so a stamp
   * carrying only the model-tier arguments no longer describes how workers are invoked.
   * Both arrays are pinned here rather than derived from the fixture defaults, so moving
   * a default turns this case red instead of quietly following it. The verdict must NAME
   * both values: "invocation mismatch" alone leaves the reader diffing two files by eye.
   */
  const stampedInvocation = ["-c", 'model_reasoning_effort="high"', "--model", "gpt-current"]
  const resolvedInvocation = ["exec", ...stampedInvocation]
  const workerArgumentDrift = stageCalibration("worker-argument-drift", {
    stampedInvocation,
    orchestrator: {
      worker: "codex",
      workers: {
        codex: {
          args: ["exec"],
          models: {
            default: { model: "gpt-current", args: ["-c", 'model_reasoning_effort="high"'] },
            cheap: { model: "gpt-cheap" },
            deep: { model: "gpt-deep" },
          },
        },
      },
    },
  })
  const driftVerdict = run("check-calibration.mjs", [], { path: workerArgumentDrift })
  T(
    "check-calibration.mjs: names both invocations when the stamp omits a worker-level argument",
    driftVerdict.status === 1 &&
      driftVerdict.stdout.includes(
        `invocation mismatch: stamp ${JSON.stringify(stampedInvocation)}, orchestrator ${JSON.stringify(resolvedInvocation)}`,
      ),
    `exit ${driftVerdict.status}\n     ${driftVerdict.stdout.trim()}`,
  )

  const staleEntry = stageCalibration("stale-entry", {
    entries: [
      { file: ".claude/agents/sample.md", verdict: "kept", reason: "Still fits." },
      { file: ".claude/skills/sample/SKILL.md", verdict: "kept", reason: "Still fits." },
      { file: ".claude/agents/removed.md", verdict: "kept", reason: "No longer exists." },
    ],
  })
  check("check-calibration.mjs", "rejects an entry with no input file", [], { status: 1, stdout: /entry has no input file: \.claude\/agents\/removed\.md/ }, { path: staleEntry })

  const mismatch = stageCalibration("model-mismatch", { stampedModel: "gpt-old" })
  check("check-calibration.mjs", "rejects a model mismatch", [], { status: 1, stdout: /model mismatch/ }, { path: mismatch })
  const invocationMismatch = stageCalibration("invocation-mismatch", {
    stampedInvocation: ["-c", 'model_reasoning_effort="medium"', "--model", "gpt-current"],
  })
  check(
    "check-calibration.mjs",
    "rejects a same-model default invocation change",
    [],
    { status: 1, stdout: /invocation mismatch/ },
    { path: invocationMismatch },
  )
  const contentDrift = stageCalibration("content-drift")
  const contentDriftRoot = dirname(dirname(contentDrift))
  const changedAgentSource = "---\nname: sample\neffort: low\n---\n"
  writeFileSync(join(contentDriftRoot, ".claude", "agents", "sample.md"), changedAgentSource)
  check(
    "check-calibration.mjs",
    "rejects same-path calibrated input drift",
    [],
    { status: 1, stdout: /content fingerprint mismatch: \.claude\/agents\/sample\.md/ },
    { path: contentDrift },
  )
  check(
    "check-calibration.mjs",
    "report-only neutralizes calibrated input drift",
    ["--report-only"],
    { status: 0, stdout: /report-only[\s\S]*content fingerprint mismatch: \.claude\/agents\/sample\.md/ },
    { path: contentDrift },
  )
  check(
    "check-calibration.mjs",
    "refresh stamps changed input content",
    ["--refresh"],
    { status: 0, stdout: /PASS/ },
    { path: contentDrift },
  )
  const contentRefreshedArtifact = JSON.parse(
    readFileSync(join(contentDriftRoot, ".claude", "calibration.json"), "utf8"),
  )
  T(
    "check-calibration.mjs: refresh wrote the changed input fingerprint",
    contentRefreshedArtifact.entries[0].fingerprint === calibrationFingerprint(changedAgentSource),
    JSON.stringify(contentRefreshedArtifact.entries[0]),
  )
  const refreshable = stageCalibration("refresh", { stampedModel: "gpt-old", date: calibrationDate(91) })
  check("check-calibration.mjs", "refresh stamps the selected invocation and current date", ["--refresh"], { status: 0, stdout: /PASS/ }, { path: refreshable })
  const refreshedArtifact = JSON.parse(readFileSync(join(dirname(dirname(refreshable)), ".claude", "calibration.json"), "utf8"))
  T(
    "check-calibration.mjs: refresh wrote the live header",
    refreshedArtifact.model === "gpt-current" &&
      refreshedArtifact.date === calibrationDate(0) &&
      JSON.stringify(refreshedArtifact.invocation) ===
        JSON.stringify(["-c", 'model_reasoning_effort="high"', "--model", "gpt-current"]),
    JSON.stringify(refreshedArtifact),
  )

  const tooOld = stageCalibration("too-old", { date: calibrationDate(91) })
  check("check-calibration.mjs", "rejects a 91-day-old stamp", [], { status: 1, stdout: /91 days old/ }, { path: tooOld })

  const recent = stageCalibration("recent", { date: calibrationDate(89) })
  check("check-calibration.mjs", "accepts an 89-day-old stamp", [], { status: 0, stdout: /PASS/ }, { path: recent })

  const malformed = stageCalibration("malformed", { malformed: true })
  check("check-calibration.mjs", "malformed calibration is an operational error", [], { status: 2, stderr: /not valid JSON/ }, { path: malformed })
  const absent = stageCalibration("absent", { missingArtifact: true })
  check("check-calibration.mjs", "missing calibration is an operational error", [], { status: 2, stderr: /could not be read/ }, { path: absent })
  const malformedFingerprint = stageCalibration("malformed-fingerprint", {
    entries: [
      {
        file: ".claude/agents/sample.md",
        verdict: "kept",
        reason: "Still fits.",
        fingerprint: "sha256:not-a-hash",
      },
      { file: ".claude/skills/sample/SKILL.md", verdict: "kept", reason: "Still fits." },
    ],
  })
  check(
    "check-calibration.mjs",
    "malformed input fingerprint is an operational error",
    [],
    { status: 2, stderr: /entries\[0\]\.fingerprint must be a sha256 fingerprint/ },
    { path: malformedFingerprint },
  )
  check(
    "check-calibration.mjs",
    "report-only neutralizes a malformed input fingerprint",
    ["--report-only"],
    { status: 0, stdout: /report-only[\s\S]*entries\[0\]\.fingerprint/ },
    { path: malformedFingerprint },
  )

  const missingWorker = stageCalibration("missing-worker", {
    orchestrator: { worker: "codex", workers: {} },
  })
  check(
    "check-calibration.mjs",
    "missing selected worker is an operational error",
    [],
    { status: 2, stderr: /worker engine "codex" is missing/ },
    { path: missingWorker },
  )
  check(
    "check-calibration.mjs",
    "report-only neutralizes a missing selected worker",
    ["--report-only"],
    { status: 0, stdout: /report-only[\s\S]*worker engine "codex" is missing/ },
    { path: missingWorker },
  )
  const invalidWorker = stageCalibration("invalid-worker", {
    orchestrator: { worker: "codex", workers: { codex: { args: [], models: {} } } },
  })
  check(
    "check-calibration.mjs",
    "invalid selected worker is an operational error",
    [],
    { status: 2, stderr: /invalid models\.default mapping/ },
    { path: invalidWorker },
  )
  check(
    "check-calibration.mjs",
    "report-only neutralizes an invalid selected worker",
    ["--report-only"],
    { status: 0, stdout: /report-only[\s\S]*invalid models\.default mapping/ },
    { path: invalidWorker },
  )

  for (const [label, path] of [
    ["missing entry", missing],
    ["stale entry", staleEntry],
    ["model mismatch", mismatch],
    ["invocation mismatch", invocationMismatch],
    ["old stamp", tooOld],
    ["malformed artifact", malformed],
    ["missing artifact", absent],
  ]) {
    check("check-calibration.mjs", `report-only neutralizes ${label}`, ["--report-only"], { status: 0, stdout: /report-only/ }, { path })
  }

  check(
    "check-calibration.mjs",
    "help names every flag and exit code",
    ["--help"],
    { status: 0, stdout: /--report-only[\s\S]*--refresh[\s\S]*--help[\s\S]*exit codes: 0[\s\S]*1 calibration failed[\s\S]*2 usage/ },
  )
}

export { calibrationCases as cases }
