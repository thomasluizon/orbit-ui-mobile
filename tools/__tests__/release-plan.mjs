import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { load } from "js-yaml"
import { BASH, T, check, configure, failureCount, stage, toolPath } from "./_harness.mjs"
import { planRelease, stagingServiceIds, productionServiceIds } from "../release-plan.mjs"

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isDirect) configure({ toolsDir: resolve(dirname(fileURLToPath(import.meta.url)), "..") })
const { cases: workflowCases } = await import("./check-release-workflow.mjs")

const fixture = JSON.parse(readFileSync(toolPath("__tests__/release-fixture.json"), "utf8"))
const androidFixture = JSON.parse(readFileSync(toolPath("__tests__/android-deployment-fixture.json"), "utf8")).deployment
const renderFixture = JSON.parse(readFileSync(toolPath("__tests__/render-release-fixture.json"), "utf8"))
const FIRST = "a".repeat(40)
const SECOND = "b".repeat(40)
const THIRD = "c".repeat(40)
const NO_GREEN = "no main commit with green test.yml and guards.yml push runs"
const PASSED = { status: "completed", conclusion: "success" }
const FAILED = { status: "completed", conclusion: "failure" }
const QUEUED = { status: "queued", conclusion: null }
const IDS = { api: "srv-aaaaaaaaaaaaaaaaaaaa", web: "srv-bbbbbbbbbbbbbbbbbbbb" }
const LANDING = "srv-ffffffffffffffffffff"
const STAGING_LANDING = "srv-dddddddddddddddddddd"
const clone = (value) => structuredClone(value)

/** `mainCommits` lists the UI `main` newest first. `pushRuns` gives the push runs of one workflow, newest first; by default each commit passed. */
function clientFor({ ahead = [], diverged = [], imageApi = false, androidUploads = null, mainCommits = null, pushRuns = null } = {}) {
  const calls = []
  const uiHead = mainCommits?.[0] ?? (ahead.includes("web") || ahead.includes("android") ? SECOND : FIRST)
  const commitOf = (sha) => ({ ...clone(fixture.commit), sha, commit: { ...clone(fixture.commit.commit), message: "Latest change\nBody" } })
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
      return commitOf(repository === "orbit-ui-mobile" ? uiHead : ahead.includes(service) ? SECOND : FIRST)
    }
    if (path.includes("/commits?")) return (mainCommits ?? [uiHead]).map(commitOf)
    const workflow = path.match(/\/actions\/workflows\/([a-z]+\.yml)\/runs\?/)?.[1]
    if (workflow) {
      const runs = pushRuns?.(workflow) ?? (mainCommits ?? [uiHead]).map((sha) => ({ head_sha: sha, ...PASSED }))
      return { workflow_runs: clone(runs) }
    }
    if (path.includes("/deployments?")) {
      if (path.includes("task=android-release")) {
        const records = androidUploads ?? [{ track: path.includes("environment=staging") ? "internal" : "open", sha: FIRST }]
        return records.map(({ track, sha }) => ({ ...clone(androidFixture), sha,
          payload: { ...clone(androidFixture.payload), track } }))
      }
      throw new Error(`unexpected deployment read: ${path}`)
    }
    if (path.includes("/compare/")) {
      const comparison = clone(fixture.compare)
      comparison.ahead_by = 1
      comparison.behind_by = diverged.includes(service) ? 1 : 0
      comparison.total_commits = 1
      comparison.commits[0].sha = path.split("...")[1]
      comparison.commits[0].commit.message = "Undeployed change\nBody"
      return comparison
    }
    throw new Error(`unexpected client read: ${path}`)
  }
  const readRender = (path) => {
    calls.push(path)
    if (path === "services?limit=100") return clone(renderFixture.serviceList)
    if (path.includes("/deploys?")) {
      if (imageApi && path === `services/${IDS.api}/deploys?status=live&limit=1`) return clone(renderFixture.stagingApiDeploys)
      const records = clone(renderFixture.deploys)
      records[0].deploy.commit.id = path === `services/${STAGING_LANDING}/deploys?status=live&limit=1`
        ? renderFixture.stagingLandingCommit : FIRST
      return records
    }
    if (path === `services/${IDS.api}`) return clone(renderFixture.stagingApiService)
    if (path === `services/${IDS.web}`) return clone(renderFixture.service)
    throw new Error(`unexpected Render read: ${path}`)
  }
  const readHealth = (url) => {
    calls.push(url)
    return clone(url.endsWith("/health") && !url.endsWith("/api/health") ? renderFixture.apiHealth : renderFixture.health)
  }
  return { read, readRender, readHealth, calls }
}

export async function cases() {
  await workflowCases()
  check("release-plan.mjs", "CLI production refuses redesign branch", ["--environment", "production", "--branch", "integration/next"], { status: 2 })
  androidRecordCases()
  await apiHealthCases()
  await customDomainCases()
  await androidBaselineCases()
  await greenCommitCases()
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

  const first = await planRelease(clientFor({ ahead: ["api"] }), "production", { ...IDS, api: null })
  T("first production deployment has no baseline", first.services[0].needsRelease && first.services[0].noBaseline && first.services[0].deployedSha === null)

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
  T("staging landing uses its existing live deployment", stagingPlan.services[2].deployedSha ===
    renderFixture.stagingLandingCommit && stagingPlan.services[2].needsRelease &&
    staging.calls.some((path) => path === `services/${STAGING_LANDING}/deploys?status=live&limit=1`))

  const noApi = await planRelease(clientFor(), "staging", { api: null, web: IDS.web }, "internal", "feature/release")
  T("staging without an API service reports first deploy", noApi.services[0].noBaseline && noApi.services[0].deployedSha === null)
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

async function customDomainCases() {
  for (const environment of ["production", "staging"]) {
    for (const name of ["api", "web"]) {
      const index = name === "api" ? 0 : 1
      const healthPath = name === "api" ? "/health" : "/api/health"
      const track = environment === "production" ? "open" : "internal"
      const domain = clone(renderFixture.customDomains[0])
      const unverified = clone(domain)
      unverified.customDomain.verificationStatus = "unverified"
      unverified.customDomain.name = "unverified.example.invalid"
      const second = clone(domain)
      second.customDomain.name = "second.example.invalid"
      for (const [label, domains, expectedOrigin] of [
        ["first verified domain", [unverified, domain, second], "https://custom.example.invalid"],
        ["only unverified domains", [unverified], null],
      ]) {
        const client = clientFor({ ahead: ["api", "web", "landing", "android"] })
        const readRender = client.readRender
        client.readRender = (path) => {
          if (path === `services/${IDS[name]}`) {
            client.calls.push(path)
            return clone(renderFixture.productionApiService)
          }
          if (path === `services/${IDS[name]}/custom-domains`) {
            client.calls.push(path)
            return domains
          }
          return readRender(path)
        }
        const plan = await planRelease(client, environment, IDS, track, "main")
        const service = plan.services[index]
        if (expectedOrigin) {
          T(`${environment} ${name} disabled subdomain uses ${label}`, service.deployedSha === FIRST &&
            service.needsRelease && client.calls.includes(`${expectedOrigin}${healthPath}`))
        } else {
          T(`${environment} ${name} disabled subdomain with ${label} is a row error`,
            service.baselineError === `Render service ${name} at services/${IDS[name]} has no verified custom domain` &&
            !service.plannedSha && !service.dispatchCommand && !service.noBaseline)
          T(`${environment} ${name} domain error preserves other plans`, plan.services.every((entry) =>
            entry.name === name || entry.needsRelease && entry.plannedSha === SECOND))
        }
        T(`${environment} ${name} disabled subdomain never reads its Render health URL`,
          !client.calls.some((call) => {
            try { return new URL(call).host === "disabled.example.invalid" } catch { return false }
          }))
      }
      const enabled = clientFor()
      const plan = await planRelease(enabled, environment, IDS, track, "main")
      const origin = name === "api" ? "https://api.example.invalid" : "https://example.invalid"
      T(`${environment} ${name} enabled subdomain keeps the service URL`,
        plan.services[index].deployedSha === FIRST && enabled.calls.includes(`${origin}${healthPath}`) &&
        !enabled.calls.some((call) => call.endsWith("/custom-domains")))
    }
  }
}

async function apiHealthCases() {
  const healthUrl = "https://api.example.invalid/health"
  for (const environment of ["production", "staging"]) {
    const track = environment === "production" ? "open" : "internal"
    const image = clientFor({ imageApi: true, ahead: ["api"] })
    let imagePlan
    let imageError = ""
    try { imagePlan = await planRelease(image, environment, IDS, track, "main") }
    catch (error) { imageError = error.message }
    T(`image-backed ${environment} API plans from its healthy commit`, imagePlan?.services[0].deployedSha === FIRST &&
      imagePlan.services[0].needsRelease && imagePlan.services[0].commits[0].sha === SECOND, imageError)
    T(`${environment} API discovers health through its Render service record`, image.calls.includes(`services/${IDS.api}`) &&
      image.calls.some((call) => call === healthUrl))
    T(`${environment} API never reads a Git-backed deploy baseline`, !image.calls.includes(`services/${IDS.api}/deploys?status=live&limit=1`))
    const missingCommit = clone(renderFixture.apiHealth)
    delete missingCommit.commit
    const failures = [
      ["unhealthy", { ...clone(renderFixture.apiHealth), status: "Unhealthy" }],
      ["missing commit", missingCommit],
      ["transport failure", new Error("connection refused")],
    ]
    for (const [name, response] of failures) {
      const client = clientFor({ ahead: ["web", "landing", "android"] })
      const readHealth = client.readHealth
      client.readHealth = (url) => {
        if (url !== healthUrl) return readHealth(url)
        if (response instanceof Error) throw response
        return response
      }
      let plan
      let failure = ""
      try { plan = await planRelease(client, environment, IDS, track, "main") }
      catch (error) { failure = error.message }
      const expected = response instanceof Error
        ? `API health at ${healthUrl} failed: ${response.message}`
        : `API health at ${healthUrl} has an unexpected response`
      const api = plan?.services[0]
      T(`${environment} API ${name} reports an unreadable baseline with its cause`, api?.baselineError === expected, failure)
      T(`${environment} API ${name} has no release command or first-deploy signal`, api &&
        !api.dispatchCommand && !api.plannedSha && !api.noBaseline && !api.needsRelease)
      T(`${environment} API ${name} preserves the other service plans`, plan?.services.slice(1).every((service) =>
        service.needsRelease && service.plannedSha === SECOND), failure)
    }
  }
}

const ANDROID_API_STUB = `
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
      if [[ "$MODE" == permanent-* || "$MODE" == exhausted ]]; then
        printf '{"message":"Resource not accessible"}' > "$output"
        if [[ "$MODE" == permanent-* ]]; then printf '%s' "\${MODE#permanent-}"; else printf 503; fi
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

function androidRecordCases() {
  const workflow = load(readFileSync(toolPath("../.github/workflows/android-release.yml"), "utf8"))
  const steps = workflow.jobs["release-android"].steps
  const step = steps.find((value) => value.name === "Record Android deployment")
  T("Android records only after successful Play submission", !step.if &&
    steps[steps.indexOf(step) - 1].name === "Submit build to Google Play")
  const calls = stage("android-record/calls", "")
  const response = stage("android-record/deployment.json", JSON.stringify(androidFixture))
  const summary = stage("android-record/summary", "")

  for (const mode of ["normal", "lost-response", "list-retry", "create-retry", "status-retry", "rate-limit", "transport", "permanent-400", "permanent-401", "permanent-403", "permanent-404", "permanent-408", "permanent-422", "exhausted"]) {
    stage("android-record/calls", "")
    const payload = stage("android-record/payload", "")
    const statusPayload = stage("android-record/status-payload", "")
    const result = spawnSync(BASH, ["-c", `${ANDROID_API_STUB}\n${step.run}`], { encoding: "utf8", timeout: 5000,
      env: { ...process.env, MODE: mode, CALLS: calls, DEPLOYMENT: response, PAYLOAD: payload, STATUS_PAYLOAD: statusPayload,
        GITHUB_REPOSITORY: "example/repository", SOURCE_SHA: androidFixture.sha,
        GITHUB_SERVER_URL: "https://github.com", GITHUB_API_URL: "https://api.github.com",
        GITHUB_RUN_ID: "123", GITHUB_STEP_SUMMARY: summary, GH_TOKEN: "fixture",
        APP_VERSION: androidFixture.payload.app_version, ANDROID_VERSION_CODE: androidFixture.payload.android_version_code,
        RELEASE_TRACK: androidFixture.payload.track, DEPLOYMENT_ENVIRONMENT: androidFixture.environment,
        BUILD_API_BASE: androidFixture.payload.api_base } })
    const observed = readFileSync(calls, "utf8").trim().split("\n")
    T(`Android record ${mode} ${mode.startsWith("permanent-") || mode === "exhausted" ? "fails with API message" : "recovers"}`,
      mode.startsWith("permanent-") || mode === "exhausted" ? result.status !== 0 && result.stderr.includes("Resource not accessible") : result.status === 0,
      result.stdout + result.stderr)
    if (mode.startsWith("permanent-")) {
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

async function androidBaselineCases() {
  const productionTrack = await planRelease(clientFor({ ahead: ["android"], androidUploads: [
    { track: "open", sha: SECOND }, { track: "production", sha: FIRST },
  ] }), "production", IDS, "production")
  T("an open upload does not mark production current", productionTrack.services[3].needsRelease &&
    productionTrack.services[3].deployedSha === FIRST)

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
  T("Android baseline selects the deployment environment", paginatedAndroid.calls.some((path) =>
    path.includes("task=android-release&environment=production")))
}

async function greenCommitCases() {
  const mainCommits = [THIRD, SECOND, FIRST]
  const runsOf = (byWorkflow) => (workflow) => byWorkflow[workflow].map(([head_sha, result]) => ({ head_sha, ...result }))
  const planWith = async (byWorkflow, options = {}) => {
    const client = clientFor({ ahead: ["api", "landing"], mainCommits, pushRuns: runsOf(byWorkflow), ...options })
    const plan = await planRelease(client, "production", IDS)
    return { client, api: plan.services[0], web: plan.services[1], landing: plan.services[2], android: plan.services[3] }
  }
  const older = [[SECOND, PASSED], [FIRST, PASSED]]

  const behindHead = await planWith({ "test.yml": older, "guards.yml": older })
  for (const service of [behindHead.web, behindHead.android]) {
    T(`${service.name} plans the second newest commit when the head has no runs`, service.needsRelease && service.headSha === THIRD &&
      service.plannedSha === SECOND && service.commits[0].sha === SECOND, JSON.stringify(service))
  }
  T("web dispatch and compare use the green commit", behindHead.web.dispatchCommand.endsWith(`-f sha=${SECOND}`) &&
    behindHead.client.calls.includes(`repos/thomasluizon/orbit-ui-mobile/compare/${FIRST}...${SECOND}`) &&
    !behindHead.client.calls.some((call) => call.includes("orbit-ui-mobile/compare/") && call.endsWith(THIRD)))
  T("the plan reads the push runs of main once for each workflow", ["test.yml", "guards.yml"].every((workflow) =>
    behindHead.client.calls.filter((call) => call === `repos/thomasluizon/orbit-ui-mobile/actions/workflows/${workflow}/runs?branch=main&event=push&per_page=100`).length === 1) &&
    behindHead.client.calls.filter((call) => call === "repos/thomasluizon/orbit-ui-mobile/commits?sha=main&per_page=100").length === 1)
  T("api and landing keep the head of main", [behindHead.api, behindHead.landing].every((service) => service.plannedSha === SECOND && service.headSha === SECOND) &&
    !behindHead.client.calls.some((call) => /orbit-(api|landing-page)\/(actions\/workflows|commits\?)/.test(call)))

  for (const [label, headRuns] of [["a failed", [[THIRD, FAILED]]], ["a queued", [[THIRD, QUEUED]]], ["a newer failed run before a passed", [[THIRD, FAILED], [THIRD, PASSED]]]]) {
    const plan = await planWith({ "test.yml": [[THIRD, PASSED], ...older], "guards.yml": [...headRuns, ...older] })
    T(`a commit with green test.yml and ${label} guards.yml run is not chosen`, plan.web.plannedSha === SECOND && plan.android.plannedSha === SECOND)
  }

  const none = await planWith({ "test.yml": [[THIRD, PASSED]], "guards.yml": [[SECOND, PASSED]] })
  for (const service of [none.web, none.android]) {
    T(`${service.name} with no green pair carries the baseline error`, service.baselineError === NO_GREEN && !service.plannedSha &&
      !service.dispatchCommand && !service.needsRelease && !service.noBaseline, JSON.stringify(service))
  }
  T("a missing green commit preserves the other service plans", none.api.needsRelease && none.landing.needsRelease)

  const ahead = await planWith({ "test.yml": [[FIRST, PASSED]], "guards.yml": [[FIRST, PASSED]] },
    { androidUploads: [{ track: "open", sha: SECOND }] })
  T("a deployed commit after the newest green one is not stepped back", !ahead.android.needsRelease && ahead.android.plannedSha === FIRST &&
    ahead.android.deployedSha === SECOND && ahead.android.commits.length === 0)

  const branch = clientFor({ ahead: ["web", "android"] })
  const branchPlan = await planRelease(branch, "staging", IDS, "internal", "feature/release")
  T("a staging branch plan keeps the head of the branch", branchPlan.services[1].plannedSha === SECOND &&
    branchPlan.services[3].plannedSha === SECOND && !branch.calls.some((call) => call.includes("/actions/workflows/")))

  let shape = ""
  const malformed = clientFor()
  const read = malformed.read
  malformed.read = (path) => path.includes("/actions/workflows/") ? { workflow_runs: [{ head_sha: "short", status: "completed" }] } : read(path)
  try { await planRelease(malformed, "production", IDS) } catch (error) { shape = error.message }
  T("a malformed workflow run list is an error", shape.includes("unexpected shape"), shape)
}

if (isDirect) {
  await cases()
  process.exitCode = failureCount() === 0 ? 0 : 1
}
