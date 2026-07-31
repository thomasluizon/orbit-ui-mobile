import { readFileSync, readdirSync } from "node:fs"

import { T, orcaEnv, check, stageTierLabelRefresh, LINEAR_LABELS_COMMAND, LINEAR_TEAM_REQUIRED_ERROR, linearLabelsResult, PRESENT_TIER_LABELS } from "./_harness.mjs"

const refreshTierLabelCases = () => {
  const refreshed = stageTierLabelRefresh("success")
  const refreshResult = check(
    "refresh-tier-labels.mjs",
    "a live lookup rewrites the snapshot in canonical sorted form",
    [],
    { status: 0, stdout: /tier-labels snapshot refreshed[\s\S]*team labels: tier:cheap, tier:deep, worker:sonnet/ },
    {
      path: refreshed.path,
      env: orcaEnv([
        { match: LINEAR_LABELS_COMMAND, stdout: linearLabelsResult(PRESENT_TIER_LABELS) },
      ]),
    },
  )
  let snapshot
  try {
    snapshot = JSON.parse(readFileSync(refreshed.snapshotPath, "utf8"))
  } catch {
    snapshot = null
  }
  T(
    "refresh-tier-labels.mjs: writes exactly the canonical snapshot shape",
    refreshResult.status === 0 &&
      JSON.stringify(Object.keys(snapshot ?? {})) ===
        JSON.stringify(["schemaVersion", "team", "capturedAt", "labels"]) &&
      snapshot?.schemaVersion === 1 &&
      snapshot?.team === "ORB" &&
      new Date(snapshot?.capturedAt).toISOString() === snapshot?.capturedAt &&
      JSON.stringify(snapshot?.labels) ===
        JSON.stringify(["tier:cheap", "tier:deep", "worker:sonnet"]),
    JSON.stringify(snapshot),
  )
  T(
    "refresh-tier-labels.mjs: leaves no temporary snapshot behind",
    readdirSync(refreshed.snapshotDirectory).every(
      (name) => !name.startsWith(".linear-team-labels.") || !name.endsWith(".tmp"),
    ),
    readdirSync(refreshed.snapshotDirectory).join(", "),
  )

  const lookupFailure = stageTierLabelRefresh("lookup-failure")
  check(
    "refresh-tier-labels.mjs",
    "a live lookup error fails closed",
    [],
    { status: 3, stderr: /refresh-tier-labels ERROR[\s\S]*linear_team_required[\s\S]*No connected Linear team matched/ },
    {
      path: lookupFailure.path,
      env: orcaEnv([
        {
          match: LINEAR_LABELS_COMMAND,
          stdout: LINEAR_TEAM_REQUIRED_ERROR,
          exit: 1,
        },
      ]),
    },
  )

  const empty = stageTierLabelRefresh("empty")
  check(
    "refresh-tier-labels.mjs",
    "an empty live label result fails closed",
    [],
    { status: 3, stderr: /refresh-tier-labels ERROR[\s\S]*empty label set/i },
    {
      path: empty.path,
      env: orcaEnv([
        { match: LINEAR_LABELS_COMMAND, stdout: linearLabelsResult([]) },
      ]),
    },
  )

  const unparseable = stageTierLabelRefresh("unparseable")
  check(
    "refresh-tier-labels.mjs",
    "unparseable live label output fails closed",
    [],
    { status: 3, stderr: /refresh-tier-labels ERROR[\s\S]*unparseable JSON/i },
    {
      path: unparseable.path,
      env: orcaEnv([{ match: LINEAR_LABELS_COMMAND, stdout: "not-json", allowNonJsonLinear: true }]),
    },
  )
}

export { refreshTierLabelCases as cases }
