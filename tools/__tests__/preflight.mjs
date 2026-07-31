
import { T, run, check, CLAUDE_MODELS, stagePreflight, LINEAR_LABELS_COMMAND, linearLabelsResult, PREFLIGHT_PASS_PLAN, preflightEnv } from "./_harness.mjs"

const preflightCases = () => {
  const good = stagePreflight("all-pass")
  check(
    "preflight.mjs",
    "a clean base-branch environment prints an all-PASS table",
    ["--repo", "ui"],
    { status: 0, stdout: /PASS\s+Worker shell policy[\s\S]*PASS\s+GitHub authentication[\s\S]*PASS\s+Repository working tree/ },
    { path: good.path, env: preflightEnv(PREFLIGHT_PASS_PLAN) },
  )

  const claude = stagePreflight(
    "claude-command-policy",
    {
      command: `"${process.execPath}" --permission-mode bypassPermissions`,
      args: [],
      models: CLAUDE_MODELS,
      interactive: true,
    },
    "claude",
  )
  check(
    "preflight.mjs",
    "the known-good Claude policy is accepted from the whole resolved invocation",
    ["--repo", "ui"],
    { status: 0, stdout: /PASS\s+Worker shell policy/ },
    { path: claude.path, env: preflightEnv(PREFLIGHT_PASS_PLAN) },
  )

  const acceptEdits = stagePreflight(
    "claude-accept-edits",
    {
      command: `"${process.execPath}"`,
      args: ["--permission-mode", "acceptEdits"],
      models: CLAUDE_MODELS,
      interactive: true,
    },
    "claude",
  )
  check(
    "preflight.mjs",
    "a Claude acceptEdits invocation fails with the known-good remedy",
    ["--repo", "ui"],
    { status: 1, stdout: /FAIL\s+Worker shell policy\s+set workers\.claude[\s\S]*--permission-mode bypassPermissions/ },
    { path: acceptEdits.path, env: preflightEnv(PREFLIGHT_PASS_PLAN) },
  )

  const ghFailurePlan = PREFLIGHT_PASS_PLAN.map((entry) =>
    entry.match === "auth status" ? { ...entry, stdout: "not logged in", exit: 1 } : entry,
  )
  check(
    "preflight.mjs",
    "an unauthenticated GitHub CLI fails and names the login remedy",
    ["--repo", "ui"],
    { status: 1, stdout: /FAIL\s+GitHub authentication\s+run gh auth login/ },
    { path: good.path, env: preflightEnv(ghFailurePlan) },
  )

  const orcaFailurePlan = PREFLIGHT_PASS_PLAN.map((entry) =>
    entry.match === "status --json"
      ? { ...entry, stdout: JSON.stringify({ ok: false, error: { message: "runtime unavailable" } }), exit: 1 }
      : entry,
  )
  check(
    "preflight.mjs",
    "an unreachable Orca runtime fails and names the restart remedy",
    ["--repo", "ui"],
    { status: 1, stdout: /FAIL\s+Orca reachability\s+start or restart Orca/ },
    { path: good.path, env: preflightEnv(orcaFailurePlan) },
  )

  const missingTierLabelsPlan = PREFLIGHT_PASS_PLAN.map((entry) =>
    entry.match === LINEAR_LABELS_COMMAND
      ? { ...entry, stdout: linearLabelsResult(["worker:sonnet"]) }
      : entry,
  )
  check(
    "preflight.mjs",
    "missing tier labels refuse launch with the expected, actual, and missing inventories",
    ["--repo", "ui"],
    {
      status: 1,
      stdout: /FAIL\s+Linear tier labels\s+looked for: tier:cheap, tier:deep; team labels: worker:sonnet; missing: tier:cheap, tier:deep/,
    },
    { path: good.path, env: preflightEnv(missingTierLabelsPlan) },
  )

  const tierLookupFailurePlan = PREFLIGHT_PASS_PLAN.map((entry) =>
    entry.match === LINEAR_LABELS_COMMAND
      ? {
          ...entry,
          stdout: JSON.stringify({ ok: false, error: { message: "Linear labels unavailable" } }),
          exit: 1,
        }
      : entry,
  )
  check(
    "preflight.mjs",
    "a Linear tier-label lookup error fails closed",
    ["--repo", "ui"],
    { status: 1, stdout: /FAIL\s+Linear tier labels[\s\S]*Linear tier-label lookup failed[\s\S]*unavailable/i },
    { path: good.path, env: preflightEnv(tierLookupFailurePlan) },
  )

  const emptyTierLabelsPlan = PREFLIGHT_PASS_PLAN.map((entry) =>
    entry.match === LINEAR_LABELS_COMMAND
      ? { ...entry, stdout: linearLabelsResult([]) }
      : entry,
  )
  check(
    "preflight.mjs",
    "an empty Linear tier-label result fails closed",
    ["--repo", "ui"],
    {
      status: 1,
      stdout: /FAIL\s+Linear tier labels[\s\S]*team labels: \(none\)[\s\S]*Linear returned an empty label set/,
    },
    { path: good.path, env: preflightEnv(emptyTierLabelsPlan) },
  )

  const unparseableTierLabelsPlan = PREFLIGHT_PASS_PLAN.map((entry) =>
    entry.match === LINEAR_LABELS_COMMAND
      ? { ...entry, stdout: "not-json" }
      : entry,
  )
  check(
    "preflight.mjs",
    "unparseable Linear tier-label output fails closed",
    ["--repo", "ui"],
    { status: 1, stdout: /FAIL\s+Linear tier labels[\s\S]*unparseable JSON/ },
    { path: good.path, env: preflightEnv(unparseableTierLabelsPlan) },
  )

  const dirtyPlan = PREFLIGHT_PASS_PLAN.map((entry) =>
    entry.match === "status --porcelain" ? { ...entry, stdout: " M tracked-file\n" } : entry,
  )
  check(
    "preflight.mjs",
    "a dirty target working tree fails and names the cleanup remedy",
    ["--repo", "ui"],
    { status: 1, stdout: /FAIL\s+Repository working tree\s+commit, stash, or remove changes/ },
    { path: good.path, env: preflightEnv(dirtyPlan) },
  )

  const wrongBranchPlan = PREFLIGHT_PASS_PLAN.map((entry) =>
    entry.match === "branch --show-current" ? { ...entry, stdout: "feature/not-main\n" } : entry,
  )
  check(
    "preflight.mjs",
    "a target repo off its base branch fails and names both branches",
    ["--repo", "ui"],
    { status: 1, stdout: /FAIL\s+Repository branch\s+switch ui from feature\/not-main to main/ },
    { path: good.path, env: preflightEnv(wrongBranchPlan) },
  )

  check(
    "preflight.mjs",
    "a missing ticket-specific CLI fails and names its install remedy",
    ["--repo", "ui", "--require", "orbit-cli-that-does-not-exist"],
    { status: 1, stdout: /FAIL\s+CLI orbit-cli-that-does-not-exist\s+install orbit-cli-that-does-not-exist/ },
    { path: good.path, env: preflightEnv(PREFLIGHT_PASS_PLAN) },
  )

  const jsonResult = run("preflight.mjs", ["--repo", "ui", "--json"], {
    path: good.path,
    env: preflightEnv(PREFLIGHT_PASS_PLAN),
  })
  let report
  try {
    report = JSON.parse(jsonResult.stdout)
  } catch {
    report = null
  }
  T(
    "preflight.mjs: machine-readable output carries stable check ids and the verdict",
    jsonResult.status === 0 &&
      report?.ok === true &&
      report?.checks?.some((entry) => entry.id === "worker-shell-policy" && entry.status === "PASS") &&
      report?.checks?.some((entry) => entry.id === "repo-clean" && entry.status === "PASS"),
    `exit ${jsonResult.status}\n     ${(jsonResult.stderr || jsonResult.stdout).slice(0, 500)}`,
  )
}

export { preflightCases as cases }
