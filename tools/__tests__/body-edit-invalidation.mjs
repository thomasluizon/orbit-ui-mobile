import { existsSync } from "node:fs"

import { T, stage } from "./_harness.mjs"
import { bodyEditInvalidationPath, clearBodyEditInvalidation, newestGuardsRuns, pendingBodyEditGuards, persistBodyEditInvalidation, readBodyEditInvalidation } from "../lib/body-edit-invalidation.mjs"

export const cases = () => {
  const path = bodyEditInvalidationPath({ worktree: "C:/repo", gitCommonDirectory: ".git", prNumber: 694 })
  T("body-edit-invalidation: marker path is repository-local and PR-qualified", /orbit-body-edit-invalidations[\\/]694\.json$/.test(path), path)

  const markerPath = stage("body-edit-invalidation/694.json", "")
  persistBodyEditInvalidation({
    path: markerPath,
    prNumber: 694,
    headSha: "head-sha",
    baseSha: "base-sha",
    editedAt: "2026-08-07T12:00:00.000Z",
    guardsWorkflowRuns: [{ databaseId: 10, createdAt: "2026-08-07T10:00:00Z", headSha: "head-sha", status: "completed", conclusion: "success" }],
    statusCheckRollup: [
      { workflowName: "Guards", name: "Harness tools", startedAt: "2026-08-07T10:00:00Z" },
      { workflowName: "Guards", name: "Harness tools", startedAt: "2026-08-07T11:00:00Z" },
      { workflowName: "Other", name: "Harness tools", startedAt: "2026-08-07T12:00:00Z" },
    ],
  })
  const marker = readBodyEditInvalidation(markerPath)
  T("body-edit-invalidation: persisted receipt retains exact head/base and newest Guards baseline", marker?.headSha === "head-sha" && marker?.baseSha === "base-sha" && marker?.guardsRuns?.length === 1 && marker.guardsRuns[0].startedAt === "2026-08-07T11:00:00Z", JSON.stringify(marker))
  T("body-edit-invalidation: newest Guards selection ignores other workflows", newestGuardsRuns([{ workflowName: "Other", name: "x", startedAt: "2026-08-07T12:00:00Z" }]).size === 0)
  const openedRunThatStartedLate = [{ databaseId: 10, createdAt: "2026-08-07T10:00:00Z", headSha: "head-sha", status: "completed", conclusion: "success" }]
  T("body-edit-invalidation: a pre-edit opened-event run cannot clear invalidation when it starts late", pendingBodyEditGuards(marker, openedRunThatStartedLate).join(",") === "Guards workflow")
  const editedRun = { databaseId: 11, createdAt: "2026-08-07T12:00:00Z", headSha: "head-sha", status: "completed", conclusion: "success" }
  T("body-edit-invalidation: a new completed post-edit Guards workflow clears invalidation", pendingBodyEditGuards(marker, [...openedRunThatStartedLate, editedRun]).length === 0)
  clearBodyEditInvalidation(markerPath)
  T("body-edit-invalidation: clearing the receipt removes it", !existsSync(markerPath), markerPath)
}
