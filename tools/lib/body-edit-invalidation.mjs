import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

export const newestGuardsRuns = (rollup) => {
  const newest = new Map()
  for (const node of rollup) {
    if (node.workflowName !== "Guards" || typeof node.name !== "string" || typeof node.startedAt !== "string") continue
    const previous = newest.get(node.name)
    if (!previous || Date.parse(node.startedAt) >= Date.parse(previous.startedAt)) newest.set(node.name, node)
  }
  return newest
}

/** The Git common directory is shared by the primary checkout and every linked worktree. */
export const bodyEditInvalidationPath = ({ worktree, gitCommonDirectory, prNumber }) =>
  resolve(worktree, gitCommonDirectory, "orbit-body-edit-invalidations", `${prNumber}.json`)

export const guardsWorkflowRunsAreValid = (runs) => Array.isArray(runs) && runs.every((run) =>
  Number.isInteger(run?.databaseId) && typeof run?.createdAt === "string" && typeof run?.headSha === "string" && typeof run?.status === "string" && typeof run?.conclusion === "string")

export const persistBodyEditInvalidation = ({ path, repositoryKey = null, prNumber, headSha, baseSha, statusCheckRollup, guardsWorkflowRuns, editedAt = new Date().toISOString() }) => {
  if (!guardsWorkflowRunsAreValid(guardsWorkflowRuns)) throw new Error("Guards workflow inventory has an invalid shape")
  const marker = {
    repositoryKey,
    prNumber,
    headSha,
    baseSha,
    editedAt,
    guardsRuns: [...newestGuardsRuns(statusCheckRollup)].map(([name, node]) => ({ name, startedAt: node.startedAt })),
    preEditWorkflowRuns: guardsWorkflowRuns,
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(marker, null, 2)}\n`)
  return marker
}

export const readBodyEditInvalidation = (path) => {
  if (!existsSync(path)) return null
  let marker
  try {
    marker = JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    throw new Error(`could not parse persisted PR-body CI invalidation ${path}: ${error.message}`)
  }
  if (
    !(marker.repositoryKey === null || typeof marker.repositoryKey === "string") ||
    !Number.isInteger(marker.prNumber) ||
    typeof marker.headSha !== "string" ||
    typeof marker.baseSha !== "string" ||
    typeof marker.editedAt !== "string" ||
    !Array.isArray(marker.guardsRuns) ||
    marker.guardsRuns.some((entry) => typeof entry?.name !== "string" || typeof entry?.startedAt !== "string") ||
    !guardsWorkflowRunsAreValid(marker.preEditWorkflowRuns)
  ) {
    throw new Error(`persisted PR-body CI invalidation has an invalid shape: ${path}`)
  }
  return marker
}

export const clearBodyEditInvalidation = (path) => rmSync(path, { force: true })

export const pendingBodyEditGuards = (marker, currentWorkflowRuns) => {
  if (!guardsWorkflowRunsAreValid(currentWorkflowRuns)) throw new Error("Guards workflow inventory has an invalid shape")
  const previousIds = new Set(marker.preEditWorkflowRuns.map((run) => run.databaseId))
  const editSecond = Math.floor(Date.parse(marker.editedAt) / 1000) * 1000
  const replacementComplete = currentWorkflowRuns.some((run) =>
    run.headSha === marker.headSha &&
    !previousIds.has(run.databaseId) &&
    Date.parse(run.createdAt) >= editSecond &&
    run.status === "completed" &&
    run.conclusion === "success")
  return replacementComplete ? [] : ["Guards workflow"]
}
