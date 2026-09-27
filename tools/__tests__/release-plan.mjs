import { readFileSync } from "node:fs"
import { T, toolPath } from "./_harness.mjs"
import { planRelease } from "../release-plan.mjs"

const fixture = JSON.parse(readFileSync(toolPath("__tests__/release-fixture.json"), "utf8"))
const FIRST = "a".repeat(40)
const SECOND = "b".repeat(40)
const clone = (value) => structuredClone(value)

function clientFor({ ahead = [], noDeployment = [], failedNewest = [] } = {}) {
  const calls = []
  const read = (path) => {
    calls.push(path)
    const repository = path.match(/^repos\/[^/]+\/([^/]+)\//)?.[1]
    const service = repository === "orbit-api" ? "api" : repository === "orbit-landing-page" ? "landing" : "web"
    if (path.includes("/commits/")) {
      const commit = clone(fixture.commit)
      commit.sha = ahead.includes(service) || repository === "orbit-ui-mobile" && ahead.includes("android") ? SECOND : FIRST
      commit.commit.message = "Latest change\nBody"
      return commit
    }
    if (path.includes("/actions/workflows/android-release.yml/runs")) {
      const run = clone(fixture.run)
      run.head_sha = FIRST
      run.head_branch = "main"
      run.status = "completed"
      run.conclusion = "success"
      return { total_count: 1, workflow_runs: [run] }
    }
    if (path.includes("/deployments/") && path.includes("/statuses")) {
      const status = clone(fixture.status)
      status.state = path.includes("/2/") ? "failure" : "success"
      return [status]
    }
    if (path.includes("/deployments?")) {
      if (noDeployment.includes(service)) return []
      const deployment = clone(fixture.deployment)
      deployment.sha = FIRST
      const records = [deployment]
      if (failedNewest.includes(service)) records.unshift({ ...clone(deployment), id: 2, sha: SECOND })
      return records
    }
    if (path.includes("/compare/")) {
      const comparison = clone(fixture.compare)
      comparison.ahead_by = 1
      comparison.behind_by = 0
      comparison.total_commits = 1
      comparison.commits[0].sha = SECOND
      comparison.commits[0].commit.message = "Undeployed change\nBody"
      return comparison
    }
    throw new Error(`unexpected client read: ${path}`)
  }
  return { read, calls }
}

export async function cases() {
  const idle = clientFor()
  const idlePlan = await planRelease(idle)
  T("release plan does nothing when every service is current", idlePlan.services.every((service) => !service.needsRelease))
  T("release plan preserves dispatch order", idlePlan.services.map((service) => service.name).join(",") === "api,web,landing,android")

  const apiOnly = await planRelease(clientFor({ ahead: ["api"] }))
  T("release plan selects only an API change", apiOnly.services.filter((service) => service.needsRelease).map((service) => service.name).join(",") === "api")
  T("release plan lists undeployed commit", apiOnly.services[0].commits[0].sha === SECOND && apiOnly.services[0].commits[0].message === "Undeployed change")

  const all = await planRelease(clientFor({ ahead: ["api", "web", "landing", "android"] }))
  T("release plan selects all changed services", all.services.every((service) => service.needsRelease && service.commits.length === 1))

  const first = await planRelease(clientFor({ ahead: ["api"], noDeployment: ["api"] }))
  T("first production deployment has no baseline", first.services[0].needsRelease && first.services[0].noBaseline && first.services[0].deployedSha === null)

  const failed = clientFor({ ahead: ["api"], failedNewest: ["api"] })
  const recovered = await planRelease(failed)
  T("failed latest deployment does not replace last success", recovered.services[0].deployedSha === FIRST && recovered.services[0].needsRelease)
  T("failed latest deployment status was checked", failed.calls.some((path) => path.includes("/deployments/2/statuses")))

  let stagingError = ""
  try { await planRelease(clientFor({ noDeployment: ["api", "web"] }), "staging") }
  catch (error) { stagingError = error.message }
  T("staging without deployment records is reported as unknown", stagingError.includes("no verified deployment baseline"))
}
