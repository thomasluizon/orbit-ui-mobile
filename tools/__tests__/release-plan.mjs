import { readFileSync } from "node:fs"
import { T, toolPath } from "./_harness.mjs"
import { planRelease, stagingServiceIds, productionServiceIds } from "../release-plan.mjs"

const fixture = JSON.parse(readFileSync(toolPath("__tests__/release-fixture.json"), "utf8"))
const renderFixture = JSON.parse(readFileSync(toolPath("__tests__/render-release-fixture.json"), "utf8"))
const FIRST = "a".repeat(40)
const SECOND = "b".repeat(40)
const IDS = { api: "srv-aaaaaaaaaaaaaaaaaaaa", web: "srv-bbbbbbbbbbbbbbbbbbbb" }
const LANDING = "srv-cccccccccccccccccccc"
const clone = (value) => structuredClone(value)

function clientFor({ ahead = [], noDeployment = [], failedNewest = [], noLiveApi = false, androidRuns = null } = {}) {
  const calls = []
  const read = (path) => {
    calls.push(path)
    const repository = path.match(/^repos\/[^/]+\/([^/]+)\//)?.[1]
    const service = repository === "orbit-api" ? "api" : repository === "orbit-landing-page" ? "landing" : "web"
    if (path.includes("/actions/variables?")) {
      return { total_count: 4, variables: [
        { ...clone(renderFixture.variable), name: "RENDER_API_STAGING_SERVICE_ID", value: IDS.api },
        clone(renderFixture.variable),
        { ...clone(renderFixture.variable), name: "RENDER_PRODUCTION_SERVICE_ID", value: IDS.api },
        { ...clone(renderFixture.variable), name: "RENDER_WEB_SERVICE_ID", value: IDS.web },
      ] }
    }
    if (path.includes("/commits/")) {
      const commit = clone(fixture.commit)
      commit.sha = ahead.includes(service) || repository === "orbit-ui-mobile" && ahead.includes("android") ? SECOND : FIRST
      commit.commit.message = "Latest change\nBody"
      return commit
    }
    if (path.includes("/actions/workflows/android-release.yml/runs")) {
      const branch = decodeURIComponent(path.match(/branch=([^&]+)/)?.[1] ?? "main")
      const records = androidRuns ?? [{ track: branch === "main" ? "open" : "internal", sha: FIRST }]
      return { total_count: records.length, workflow_runs: records.map(({ track, sha }) => {
        const run = clone(fixture.run)
        run.display_title = `Android Release 1.0.0 (1) to ${track} on ${branch}`
        run.head_sha = sha
        run.head_branch = branch
        run.status = "completed"
        run.conclusion = "success"
        return run
      }) }
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
      deployment.environment = path.includes("environment=staging") ? "staging" : "production"
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
  const readRender = (path) => {
    calls.push(path)
    if (path === "services?limit=100") return [{ service: { name: "orbit-landing", id: LANDING }, cursor: "cursor" }]
    if (path.includes("/deploys?")) {
      if (noLiveApi) return []
      const records = clone(renderFixture.deploys)
      records[0].deploy.commit.id = FIRST
      return records
    }
    if (path === `services/${IDS.web}`) return clone(renderFixture.service)
    throw new Error(`unexpected Render read: ${path}`)
  }
  const readHealth = (url) => {
    calls.push(url)
    return clone(renderFixture.health)
  }
  return { read, readRender, readHealth, calls }
}

export async function cases() {
  let missingBranch = ""
  try { await planRelease(clientFor(), "staging", IDS) } catch (error) { missingBranch = error.message }
  T("staging requires a selected branch", missingBranch === "invalid branch for environment")
  let productionBranch = ""
  try { await planRelease(clientFor(), "production", IDS, "open", "feature/release") } catch (error) { productionBranch = error.message }
  T("production refuses another branch", productionBranch === "invalid branch for environment")
  let stagingTrack = ""
  try { await planRelease(clientFor(), "staging", IDS, "open", "feature/release") } catch (error) { stagingTrack = error.message }
  T("staging only uses the internal Android track", stagingTrack === "invalid Android track for environment")
  const idle = clientFor()
  const idlePlan = await planRelease(idle, "production", IDS)
  T("release plan does nothing when every service is current", idlePlan.services.every((service) => !service.needsRelease))
  T("release plan preserves dispatch order", idlePlan.services.map((service) => service.name).join(",") === "api,web,landing,android")

  const apiOnly = await planRelease(clientFor({ ahead: ["api"] }), "production", IDS)
  T("release plan selects only an API change", apiOnly.services.filter((service) => service.needsRelease).map((service) => service.name).join(",") === "api")
  T("release plan lists undeployed commit", apiOnly.services[0].commits[0].sha === SECOND && apiOnly.services[0].commits[0].message === "Undeployed change")

  const all = await planRelease(clientFor({ ahead: ["api", "web", "landing", "android"] }), "production", IDS)
  T("release plan selects all changed services", all.services.every((service) => service.needsRelease && service.commits.length === 1))

  const productionTrack = await planRelease(clientFor({ ahead: ["android"], androidRuns: [
    { track: "open", sha: SECOND }, { track: "production", sha: FIRST },
  ] }), "production", IDS, "production")
  T("an open upload does not mark production current", productionTrack.services[3].needsRelease &&
    productionTrack.services[3].deployedSha === FIRST)

  const first = await planRelease(clientFor({ ahead: ["api"], noLiveApi: true }), "production", IDS)
  T("first production deployment has no baseline", first.services[0].needsRelease && first.services[0].noBaseline && first.services[0].deployedSha === null)

  const failed = clientFor({ ahead: ["api"], failedNewest: ["api"] })
  const recovered = await planRelease(failed, "production", IDS)
  T("production API uses the live Render commit", recovered.services[0].deployedSha === FIRST && recovered.services[0].needsRelease)
  T("production API reads Render live deploys", failed.calls.some((path) => path === `services/${IDS.api}/deploys?status=live&limit=1`))

  const staging = clientFor({ ahead: ["api", "web", "android"] })
  const stagingPlan = await planRelease(staging, "staging", IDS, "internal", "feature/release")
  T("staging includes landing and compares selected branch", stagingPlan.services.length === 4 && stagingPlan.branch === "feature/release" && stagingPlan.services.every((service) => service.branch === "feature/release"))
  const expectedHealth = new URL("https://example.invalid/api/health")
  T("staging reads the Render service URL and web health", staging.calls.some((value) => {
    try {
      const actual = new URL(value)
      return actual.origin === expectedHealth.origin && actual.pathname === expectedHealth.pathname
    } catch { return false }
  }))
  T("staging landing has no live baseline before its service exists", stagingPlan.services[2].noBaseline &&
    !staging.calls.some((path) => path === `services/${LANDING}/deploys?status=live&limit=1`))


  const noApi = await planRelease(clientFor({ noLiveApi: true }), "staging", IDS, "internal", "feature/release")
  T("staging without a live API deploy reports first deploy", noApi.services[0].noBaseline && noApi.services[0].deployedSha === null)
  const noWeb = clientFor()
  const noWebPlan = await planRelease(noWeb, "staging", { api: IDS.api, web: null }, "internal", "feature/release")
  T("staging without a web service reports first deploy", noWebPlan.services[1].noBaseline &&
    !noWeb.calls.includes(`services/${IDS.web}`))

  const ids = stagingServiceIds(clientFor())
  T("staging service IDs use documented GitHub variables", ids.api === IDS.api && ids.web === IDS.web)
  const productionIds = productionServiceIds(clientFor())
  T("production service IDs use documented GitHub variables", productionIds.api === IDS.api && productionIds.web === IDS.web)
  let invalidVariable = ""
  try { stagingServiceIds({ read: () => ({ total_count: 1, variables: [{ name: "RENDER_WEB_STAGING_SERVICE_ID", value: null }] }) }) }
  catch (error) { invalidVariable = error.message }
  T("malformed repository variable does not masquerade as a first deploy", invalidVariable.includes("unexpected shape"))
}
