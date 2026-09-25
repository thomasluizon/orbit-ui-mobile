import { runBounded } from "./bounded-process.mjs"
import { repositorySlug } from "./github-auth.mjs"

export const ADMISSION_REFUSED_EXIT = 8

/**
 * Only a run created in the last 24 hours counts as queued. Measured 2026-09-25: 8 orbit-ui-mobile
 * runs created 2026-09-13 sit at `status: queued` with zero jobs, and GitHub refuses to remove them
 * (`gh run cancel`: "Cannot cancel a workflow run that is completed"; force-cancel HTTP 409; DELETE
 * HTTP 403). A raw count would carry them forever. The real queue on 2026-09-24 and 25 held a run
 * for about an hour, far inside this window.
 */
export const QUEUED_RUN_WINDOW_MS = 24 * 60 * 60 * 1000

export const queuedRunsPath = (slug, now) => {
  const since = new Date(now - QUEUED_RUN_WINDOW_MS).toISOString().replace(/\.\d{3}Z$/, "Z")
  return `repos/${slug}/actions/runs?status=queued&created=${encodeURIComponent(`>=${since}`)}&per_page=1`
}

export const readGithub = async (path, environment) => {
  const result = await runBounded(environment.GH_BIN || "gh", ["api", path], {
    env: environment, timeoutMs: 30000, maxBuffer: 8 * 1024 * 1024,
  })
  if (result.timedOut || result.error || result.status !== 0) {
    throw new Error(`GitHub read ${path} failed: ${result.stderr || result.error?.message || `exit ${result.status}`}`)
  }
  try { return JSON.parse(result.stdout) } catch (error) {
    throw new Error(`GitHub read ${path} returned invalid JSON: ${error.message}`)
  }
}

const openPullRequests = async (slug, environment) => {
  let count = 0
  for (let page = 1; ; page += 1) {
    const pulls = await readGithub(`repos/${slug}/pulls?state=open&per_page=100&page=${page}`, environment)
    if (!Array.isArray(pulls) || pulls.some((pull) => !Number.isInteger(pull.number))) {
      throw new Error(`GitHub open pull requests for ${slug} had an unexpected shape`)
    }
    count += pulls.length
    if (pulls.length < 100) return count
  }
}

export const checkAdmission = async ({ config, repositoryKey, branch, environment, now = Date.now() }) => {
  const limits = { maxOpenPullRequests: config.caps.maxOpenPullRequests, maxQueuedRuns: config.caps.maxQueuedRuns }
  const counts = { openPullRequests: null, queuedRuns: null }
  try {
    const target = repositorySlug(config.repos[repositoryKey])
    const owner = target.split("/")[0]
    const head = encodeURIComponent(`${owner}:${branch}`)
    const existing = await readGithub(`repos/${target}/pulls?head=${head}&state=open&per_page=100`, environment)
    if (!Array.isArray(existing) || existing.some((pull) => !Number.isInteger(pull.number))) {
      throw new Error(`GitHub branch pull requests for ${target} had an unexpected shape`)
    }
    if (existing.length > 0) return { admitted: true, existingPullRequest: existing[0].number, counts, limits }
    counts.openPullRequests = 0
    counts.queuedRuns = 0
    for (const path of Object.values(config.repos)) {
      const slug = repositorySlug(path)
      counts.openPullRequests += await openPullRequests(slug, environment)
      const runs = await readGithub(queuedRunsPath(slug, now), environment)
      if (!Number.isInteger(runs?.total_count) || runs.total_count < 0) {
        throw new Error(`GitHub queued runs for ${slug} had an unexpected shape`)
      }
      counts.queuedRuns += runs.total_count
    }
    if (counts.openPullRequests > limits.maxOpenPullRequests || counts.queuedRuns > limits.maxQueuedRuns) {
      return { admitted: false, reason: "ADMISSION_REFUSED", counts, limits, error: null }
    }
    return { admitted: true, counts, limits }
  } catch (error) {
    return { admitted: false, reason: "ADMISSION_REFUSED", counts, limits, error: error.message }
  }
}
