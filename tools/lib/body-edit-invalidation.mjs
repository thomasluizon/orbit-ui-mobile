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

export const persistBodyEditInvalidation = ({ path, repositoryKey = null, prNumber, headSha, baseSha, statusCheckRollup, editedAt = new Date().toISOString() }) => {
  const marker = {
    repositoryKey,
    prNumber,
    headSha,
    baseSha,
    editedAt,
    guardsRuns: [...newestGuardsRuns(statusCheckRollup)].map(([name, node]) => ({ name, startedAt: node.startedAt })),
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
    marker.guardsRuns.some((entry) => typeof entry?.name !== "string" || typeof entry?.startedAt !== "string")
  ) {
    throw new Error(`persisted PR-body CI invalidation has an invalid shape: ${path}`)
  }
  return marker
}

export const clearBodyEditInvalidation = (path) => rmSync(path, { force: true })

export const pendingBodyEditGuards = (marker, statusCheckRollup) => {
  const current = newestGuardsRuns(statusCheckRollup)
  if (marker.guardsRuns.length === 0) {
    const editTime = Date.parse(marker.editedAt)
    const replacementRegistered = [...current.values()].some((node) => Date.parse(node.startedAt) >= Math.floor(editTime / 1000) * 1000)
    return replacementRegistered ? [] : ["Guards workflow"]
  }
  return marker.guardsRuns
    .filter((baseline) => {
      const run = current.get(baseline.name)
      return !run || Date.parse(run.startedAt) <= Date.parse(baseline.startedAt)
    })
    .map((baseline) => baseline.name)
}
