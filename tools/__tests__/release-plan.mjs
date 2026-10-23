import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { load } from "js-yaml"
import { BASH, T, check, stage, toolPath } from "./_harness.mjs"
import { cases as workflowCases } from "./check-release-workflow.mjs"
import { planRelease, stagingServiceIds, productionServiceIds } from "../release-plan.mjs"

const fixture = JSON.parse(readFileSync(toolPath("__tests__/release-fixture.json"), "utf8"))
const androidFixture = JSON.parse(readFileSync(toolPath("__tests__/android-deployment-fixture.json"), "utf8")).deployment
const renderFixture = JSON.parse(readFileSync(toolPath("__tests__/render-release-fixture.json"), "utf8"))
const FIRST = "a".repeat(40)
const SECOND = "b".repeat(40)
const IDS = { api: "srv-aaaaaaaaaaaaaaaaaaaa", web: "srv-bbbbbbbbbbbbbbbbbbbb" }
const REDESIGN = "srv-cccccccccccccccccccc"
const LANDING = "srv-ffffffffffffffffffff"
const STAGING_LANDING = "srv-dddddddddddddddddddd"
const clone = (value) => structuredClone(value)

function clientFor({ ahead = [], diverged = [], noDeployment = [], failedNewest = [], noLiveApi = false, androidUploads = null } = {}) {
  const calls = []
  const read = (path) => {
    calls.push(path)
    const repository = path.match(/^repos\/[^/]+\/([^/]+)\//)?.[1]
    const service = repository === "orbit-api" ? "api" : repository === "orbit-landing-page" ? "landing" : "web"
    if (path.includes("/actions/variables?")) {
      return { total_count: 5, variables: [
        { ...clone(renderFixture.variable), name: "RENDER_API_STAGING_SERVICE_ID", value: IDS.api },
        clone(renderFixture.variable),
        { ...clone(renderFixture.variable), name: "RENDER_PRODUCTION_SERVICE_ID", value: IDS.api },
        { ...clone(renderFixture.variable), name: "RENDER_WEB_SERVICE_ID", value: IDS.web },
        { ...clone(renderFixture.variable), name: "RENDER_WEB_REDESIGN_SERVICE_ID", value: REDESIGN },
      ] }
    }
    if (path.includes("/commits/")) {
      const commit = clone(fixture.commit)
      commit.sha = ahead.includes(service) || repository === "orbit-ui-mobile" && ahead.includes("android") ? SECOND : FIRST
      commit.commit.message = "Latest change\nBody"
      return commit
    }
    if (path.includes("/actions/workflows/android-release.yml/runs")) {
      return { workflow_runs: [{ ...clone(fixture.run), head_sha: SECOND, head_branch: "main",
        display_title: "Android Release 1.0.0 (1) to open on main", status: "completed", conclusion: "failure" }] }
    }
    if (path.includes("/deployments/") && path.includes("/statuses")) {
      const status = clone(fixture.status)
      status.state = path.includes("/2/") ? "failure" : "success"
      return [status]
    }
    if (path.includes("/deployments?")) {
      if (path.includes("task=android-release")) {
        const records = androidUploads ?? [{ track: path.includes("environment=staging") ? "internal" : "open", sha: FIRST }]
        return records.map(({ track, sha }) => ({ ...clone(androidFixture), sha,
          payload: { ...clone(androidFixture.payload), track } }))
      }
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
      comparison.behind_by = diverged.includes(service) ? 1 : 0
      comparison.total_commits = 1
      comparison.commits[0].sha = ahead.includes(service) || repository === "orbit-ui-mobile" && ahead.includes("android") ? SECOND : FIRST
      comparison.commits[0].commit.message = "Undeployed change\nBody"
      return comparison
    }
    throw new Error(`unexpected client read: ${path}`)
  }
  const readRender = (path) => {
    calls.push(path)
    if (path === "services?limit=100") return clone(renderFixture.serviceList)
    if (path.includes("/deploys?")) {
      if (noLiveApi && path === `services/${IDS.api}/deploys?status=live&limit=1`) return []
      const records = clone(renderFixture.deploys)
      records[0].deploy.commit.id = path === `services/${STAGING_LANDING}/deploys?status=live&limit=1`
        ? renderFixture.stagingLandingCommit : FIRST
      return records
    }
    if (path === `services/${IDS.web}`) return clone(renderFixture.service)
    if (path === `services/${REDESIGN}`) {
      const service = clone(renderFixture.service)
      service.serviceDetails.url = "https://redesign.example.invalid"
      return service
    }
    throw new Error(`unexpected Render read: ${path}`)
  }
  const readHealth = (url) => {
    calls.push(url)
    return clone(renderFixture.health)
  }
  return { read, readRender, readHealth, calls }
}

async function redesignCases() {
  const redesignClient = clientFor()
  const redesignIds = productionServiceIds(redesignClient, "production-redesign")
  let redesignPlan
  let redesignError = ""
  try { redesignPlan = await planRelease(redesignClient, "production-redesign", redesignIds) }
  catch (error) { redesignError = error.message }
  T("redesign is an explicit web-only production plan", redesignPlan?.services.length === 1 &&
    redesignPlan.services[0].name === "web" && redesignPlan.services[0].branch === "redesign/main" &&
    redesignPlan.environment === "production-redesign", redesignError)

  T("redesign resolves only its own service and branch", redesignIds.web === REDESIGN &&
    Object.keys(redesignIds).join(",") === "web" &&
    redesignClient.calls.includes(`services/${REDESIGN}`) &&
    redesignClient.calls.some((value) => value === "https://redesign.example.invalid/api/health") &&
    redesignClient.calls.includes("repos/thomasluizon/orbit-ui-mobile/commits/redesign%2Fmain") &&
    !redesignClient.calls.some((path) => path.includes("android-release") || path.includes("orbit-api") || path.includes("orbit-landing-page")))
  for (const branch of ["main", "feature/release"]) {
    let invalidBranch = ""
    try { await planRelease(clientFor(), "production-redesign", redesignIds, null, branch) }
    catch (error) { invalidBranch = error.message }
    T(`redesign refuses ${branch}`, invalidBranch === "invalid branch for environment")
    check("release-plan.mjs", `CLI redesign refuses ${branch}`, ["--environment", "production-redesign", "--branch", branch], { status: 2 })
  }
  check("release-plan.mjs", "CLI production refuses redesign branch", ["--environment", "production", "--branch", "redesign/main"], { status: 2 })
  check("release-plan.mjs", "CLI redesign refuses Android track", ["--environment", "production-redesign", "--track", "open"], { status: 2 })
  const redesignAhead = await planRelease(clientFor({ ahead: ["web"] }), "production-redesign", redesignIds)
  T("redesign compares unreleased commits with its own health baseline", redesignAhead.services[0].needsRelease &&
    redesignAhead.services[0].deployedSha === FIRST && redesignAhead.services[0].commits[0].sha === SECOND)
  let redesignDivergence = ""
  try { await planRelease(clientFor({ ahead: ["web"], diverged: ["web"] }), "production-redesign", redesignIds) }
  catch (error) { redesignDivergence = error.message }
  T("redesign rejects a divergent production baseline", redesignDivergence.includes("diverged or omitted commits"))
  const missingRedesign = clientFor()
  const missingRedesignPlan = await planRelease(missingRedesign, "production-redesign", { web: null })
  T("missing redesign service is a first deploy without reading the main service", missingRedesignPlan.services[0].noBaseline &&
    !missingRedesign.calls.some((path) => path.startsWith("services/")))
}

export async function cases() {
  workflowCases()
  androidRecordCases()
  const uploaded = clientFor({ ahead: ["android"], androidUploads: [{ track: "open", sha: SECOND }] })
  const uploadedPlan = await planRelease(uploaded, "production", IDS)
  T("successful Play submission with failed record step uses the repaired deployment", !uploadedPlan.services[3].needsRelease &&
    uploadedPlan.services[3].deployedSha === SECOND)
  T("Android baseline does not depend on workflow conclusion", !uploaded.calls.some((path) => path.includes("/actions/workflows/")))
  await redesignCases()
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
  T("default production never reads redesign service", !idle.calls.includes(`services/${REDESIGN}`))
  T("release plan preserves dispatch order", idlePlan.services.map((service) => service.name).join(",") === "api,web,landing,android")
  T("production landing uses the discovered service", idle.calls.includes(`services/${LANDING}/deploys?status=live&limit=1`))

  const apiOnly = await planRelease(clientFor({ ahead: ["api"] }), "production", IDS)
  T("release plan selects only an API change", apiOnly.services.filter((service) => service.needsRelease).map((service) => service.name).join(",") === "api")
  T("release plan lists undeployed commit", apiOnly.services[0].commits[0].sha === SECOND && apiOnly.services[0].commits[0].message === "Undeployed change")

  const all = await planRelease(clientFor({ ahead: ["api", "web", "landing", "android"] }), "production", IDS)
  T("release plan selects all changed services", all.services.every((service) => service.needsRelease && service.commits.length === 1))
  for (const service of all.services.filter((service) => service.name !== "android")) {
    T(`${service.name} dispatch pins the planned SHA`, service.plannedSha === SECOND &&
      service.dispatchCommand === `gh workflow run release.yml --repo thomasluizon/${service.repo} --ref main -f environment=production -f branch='main' -f sha=${SECOND}`)
  }

  const productionTrack = await planRelease(clientFor({ ahead: ["android"], androidUploads: [
    { track: "open", sha: SECOND }, { track: "production", sha: FIRST },
  ] }), "production", IDS, "production")
  T("an open upload does not mark production current", productionTrack.services[3].needsRelease &&
    productionTrack.services[3].deployedSha === FIRST)

  const emptyAndroid = await planRelease(clientFor({ androidUploads: [] }), "production", IDS)
  T("Android without deployment records reports a first upload", emptyAndroid.services[3].noBaseline &&
    emptyAndroid.services[3].deployedSha === null)
  const paginatedAndroid = clientFor()
  const readPage = paginatedAndroid.read
  paginatedAndroid.read = (path) => {
    const response = readPage(path)
    if (!path.includes("task=android-release")) return response
    return path.endsWith("page=1")
      ? Array.from({ length: 100 }, () => ({ ...clone(androidFixture), payload: { ...androidFixture.payload, track: "production" } }))
      : [{ ...clone(androidFixture), sha: FIRST }]
  }
  const paginatedPlan = await planRelease(paginatedAndroid, "production", IDS)
  T("Android track baseline follows deployment pagination", paginatedPlan.services[3].deployedSha === FIRST &&
    paginatedAndroid.calls.some((path) => path.includes("task=android-release") && path.endsWith("page=2")))
  const invalidAndroid = clientFor({ androidUploads: [{ track: "open", sha: "invalid" }] })
  let androidShape = ""
  try { await planRelease(invalidAndroid, "production", IDS) } catch (error) { androidShape = error.message }
  T("Android rejects an invalid deployment commit", androidShape.includes("unexpected SHA"))
  T("Android baseline selects the deployment environment", uploaded.calls.some((path) =>
    path.includes("task=android-release&environment=production")))

  const first = await planRelease(clientFor({ ahead: ["api"], noLiveApi: true }), "production", IDS)
  T("first production deployment has no baseline", first.services[0].needsRelease && first.services[0].noBaseline && first.services[0].deployedSha === null)

  const failed = clientFor({ ahead: ["api"], failedNewest: ["api"] })
  const recovered = await planRelease(failed, "production", IDS)
  T("production API uses the live Render commit", recovered.services[0].deployedSha === FIRST && recovered.services[0].needsRelease)
  T("production API reads Render live deploys", failed.calls.some((path) => path === `services/${IDS.api}/deploys?status=live&limit=1`))

  const divergentStaging = await planRelease(clientFor({ ahead: ["api"], diverged: ["api"] }),
    "staging", IDS, "internal", "feature/release")
  T("staging plans a release from another deployed branch", divergentStaging.services[0].needsRelease &&
    divergentStaging.services[0].deployedFromOtherBranch && divergentStaging.services[0].commits[0].sha === SECOND)
  let divergentProduction = ""
  try { await planRelease(clientFor({ ahead: ["api"], diverged: ["api"] }), "production", IDS) }
  catch (error) { divergentProduction = error.message }
  T("production rejects a deployed commit outside main", divergentProduction.includes("diverged or omitted commits"))

  const staging = clientFor({ ahead: ["api", "web", "android"] })
  const stagingPlan = await planRelease(staging, "staging", IDS, "internal", "feature/release")
  T("staging includes landing and compares selected branch", stagingPlan.services.length === 4 && stagingPlan.branch === "feature/release" && stagingPlan.services.every((service) => service.branch === "feature/release"))
  T("internal Android uses the latest staging upload across source branches", stagingPlan.services[3].deployedSha === FIRST &&
    staging.calls.some((path) => path.includes("task=android-release&environment=staging") && !path.includes("branch=")))
  const expectedHealth = new URL("https://example.invalid/api/health")
  T("staging reads the Render service URL and web health", staging.calls.some((value) => {
    try {
      const actual = new URL(value)
      return actual.origin === expectedHealth.origin && actual.pathname === expectedHealth.pathname
    } catch { return false }
  }))
  T("staging landing uses its existing live deployment", stagingPlan.services[2].deployedSha ===
    renderFixture.stagingLandingCommit && stagingPlan.services[2].needsRelease &&
    staging.calls.some((path) => path === `services/${STAGING_LANDING}/deploys?status=live&limit=1`))


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

function androidRecordCases() {
  const workflow = load(readFileSync(toolPath("../.github/workflows/android-release.yml"), "utf8"))
  const steps = workflow.jobs["release-android"].steps
  const step = steps.find((value) => value.name === "Record Android deployment")
  T("Android records only after successful Play submission", !step.if &&
    steps[steps.indexOf(step) - 1].name === "Submit build to Google Play")
  const calls = stage("android-record/calls", "")
  const response = stage("android-record/deployment.json", JSON.stringify(androidFixture))
  const summary = stage("android-record/summary", "")
  const stub = `
    sleep() { :; }
    gh() {
      printf 'gh %s\n' "$*" >> "$CALLS"
      if [[ "$*" == *'/statuses'* ]]; then cat >/dev/null; printf '{}'; return; fi
      cat >/dev/null
      printf 'unexpected end of JSON input' >&2
      return 1
    }
    curl() {
      local output request=GET payload='' endpoint
      while (( $# )); do
        case "$1" in
          --output) output="$2"; shift 2 ;;
          --request) request="$2"; shift 2 ;;
          --data-binary) payload="$2"; shift 2 ;;
          *) endpoint="$1"; shift ;;
        esac
      done
      printf '%s %s\n' "$request" "$endpoint" >> "$CALLS"
      local count
      count=$(wc -l < "$CALLS" | tr -d ' ')
      if [[ "$MODE" == permanent || "$MODE" == exhausted ]]; then
        printf '{"message":"Resource not accessible"}' > "$output"
        if [[ "$MODE" == permanent ]]; then printf 403; else printf 503; fi
        return
      fi
      if [[ "$MODE" == transport && "$count" == 1 ]]; then return 56; fi
      if [[ "$endpoint" == *'/statuses' ]]; then
        if [[ "$MODE" == status-retry && "$count" == 3 ]]; then
          printf '' > "$output"; printf 502; return
        fi
        printf '%s' "$payload" > "$STATUS_PAYLOAD"
        printf '{}' > "$output"; printf 201; return
      fi
      if [[ "$request" == POST ]]; then
        printf '%s' "$payload" > "$PAYLOAD"
        if [[ "$MODE" == create-retry && "$count" == 2 ]]; then printf '' > "$output"; printf 500; return; fi
        if [[ "$MODE" == lost-response ]]; then printf '' > "$output"; printf 201; return; fi
        cat "$DEPLOYMENT" > "$output"; printf 201; return
      fi
      if [[ "$count" == 1 || "$MODE" == normal || "$MODE" == create-retry ]]; then
        if [[ "$MODE" == list-retry ]]; then printf '' > "$output"; printf 502; return; fi
        if [[ "$MODE" == rate-limit ]]; then
          printf '{"message":"API rate limit exceeded"}' > "$output"; printf 403; return
        fi
        printf '[]' > "$output"
      else
        jq -s '.' "$DEPLOYMENT" > "$output"
      fi
      printf 200
    }
  `
  for (const mode of ["normal", "lost-response", "list-retry", "create-retry", "status-retry", "rate-limit", "transport", "permanent", "exhausted"]) {
    stage("android-record/calls", "")
    const payload = stage("android-record/payload", "")
    const statusPayload = stage("android-record/status-payload", "")
    const result = spawnSync(BASH, ["-c", `${stub}\n${step.run}`], { encoding: "utf8", timeout: 5000,
      env: { ...process.env, MODE: mode, CALLS: calls, DEPLOYMENT: response, PAYLOAD: payload, STATUS_PAYLOAD: statusPayload,
        GITHUB_REPOSITORY: "example/repository", GITHUB_SHA: androidFixture.sha,
        GITHUB_SERVER_URL: "https://github.com", GITHUB_API_URL: "https://api.github.com",
        GITHUB_RUN_ID: "123", GITHUB_STEP_SUMMARY: summary, GH_TOKEN: "fixture",
        APP_VERSION: androidFixture.payload.app_version, ANDROID_VERSION_CODE: androidFixture.payload.android_version_code,
        RELEASE_TRACK: androidFixture.payload.track, DEPLOYMENT_ENVIRONMENT: androidFixture.environment,
        BUILD_API_BASE: androidFixture.payload.api_base } })
    const observed = readFileSync(calls, "utf8").trim().split("\n")
    T(`Android record ${mode} ${mode === "permanent" ? "fails with API message" : "recovers"}`,
      ["permanent", "exhausted"].includes(mode) ? result.status !== 0 && result.stderr.includes("Resource not accessible") : result.status === 0,
      result.stdout + result.stderr)
    if (mode === "permanent") {
      T("permanent API failure is not retried", observed.length === 1)
    } else if (mode === "exhausted") {
      T("transient API failure stops after three attempts", observed.length === 3)
    } else {
      T(`Android record ${mode} reads the commit before retrying`, observed.filter((call) => call.startsWith("GET ")).length >= (mode === "normal" ? 1 : 2) &&
        observed.filter((call) => call.startsWith("GET ")).every((call) => call.includes(`sha=${androidFixture.sha}`) && call.includes("task=android-release")))
      T(`Android record ${mode} creates only when lookup has no upload`, observed.filter((call) => call.startsWith("POST ") && !call.includes("/statuses")).length === (["normal", "lost-response", "status-retry"].includes(mode) ? 1 : mode === "create-retry" ? 2 : 0))
      const status = JSON.parse(readFileSync(statusPayload, "utf8"))
      T(`Android record ${mode} preserves success status and run URL`, status.state === "success" &&
        status.log_url === "https://github.com/example/repository/actions/runs/123" && status.auto_inactive === false)
      if (["normal", "lost-response", "create-retry", "status-retry"].includes(mode)) {
        const created = JSON.parse(readFileSync(payload, "utf8"))
        T(`Android record ${mode} preserves upload fields`, created.ref === androidFixture.sha &&
          created.task === "android-release" && created.environment === androidFixture.environment &&
          created.description === androidFixture.description && JSON.stringify(created.payload) === JSON.stringify(androidFixture.payload) &&
          created.auto_merge === false && created.required_contexts.length === 0)
      }
    }
  }
}
