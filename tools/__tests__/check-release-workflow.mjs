import { load } from "js-yaml"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { BASH, T, root, stage, toolPath } from "./_harness.mjs"

const workflow = readFileSync(toolPath("../.github/workflows/release.yml"), "utf8")

const guard = workflow.match(/      - name: Validate release selection\n[\s\S]*?        run: \|\n((?:          .*\n|\n)+)/)?.[1]
const stepScript = (name) => {
  const script = workflow.split(`      - name: ${name}\n`)[1]?.match(/        run: \|\n((?:          .*\n|\n)+)/)?.[1]
  if (!script) throw new Error(`Missing release script: ${name}`)
  return script.replace(/^ {10}/gm, "")
}

const renderFixture = JSON.parse(readFileSync(toolPath("__tests__/render-release-fixture.json"), "utf8"))
const releaseFixture = JSON.parse(readFileSync(toolPath("__tests__/release-fixture.json"), "utf8"))

function checkProductionSteps() {
  T("production uses its build and credential environment", workflow.includes("if: inputs.environment == 'production'") &&
    /production:\n[\s\S]*?environment:\n      name: production\n      deployment: false/.test(workflow))
  T("production selects its service directly", workflow.includes("SERVICE_ID: ${{ vars.RENDER_WEB_SERVICE_ID }}"))
  T("deployment records use the requested environment", workflow.includes("RELEASE_ENVIRONMENT: ${{ inputs.environment }}"))
  T("smoke remains limited to the main production service", /smoke:\n[\s\S]*?if: inputs.environment == 'production'\n/.test(workflow))
  const servicePath = stage("release-workflow/service.json", JSON.stringify(renderFixture.service))
  const shutdownServicePath = stage("release-workflow/shutdown-service.json", JSON.stringify(renderFixture.shutdownService))
  const healthPath = stage("release-workflow/health.json", JSON.stringify(renderFixture.health))
  const deploymentPath = stage("release-workflow/deployment.json", JSON.stringify(releaseFixture.deployment))
  const output = stage("release-workflow/output", "")
  const summary = stage("release-workflow/summary", "")
  const calls = join(root, "release-workflow/calls")
  const environment = {
    ...process.env, GITHUB_WORKSPACE: toolPath(".."), SERVICE_RESPONSE: servicePath, HEALTH_RESPONSE: healthPath, DEPLOYMENT_RESPONSE: deploymentPath,
    GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary, CALLS: calls,
    SOURCE_SHA: renderFixture.health.commit, SERVICE_ID: "srv-production", SERVICE_VARIABLE: "RENDER_WEB_SERVICE_ID",
    RENDER_API_KEY: "fixture", IMAGE: "ghcr.io/thomasluizon/orbit-web", DIGEST: "sha256:fixture", SERVICE_FAILURE: "false",
    PRODUCTION_WEB_HOST: "public.example.invalid", GH_TOKEN: "fixture", GITHUB_REPOSITORY: "example/repository",
  }
  const readAdapter = `
    eval "$(declare -f curl | sed '1s/curl/curl_response/')"
    curl() {
      local output='' argument previous='' read=false
      for argument in "$@"; do
        [[ "$previous" == -o ]] && output="$argument"
        [[ "$argument" == --retry-all-errors ]] && read=true
        previous="$argument"
      done
      if $read; then curl_response "$@" > "$output" || return "$?"; printf 200
      else curl_response "$@"; fi
    }
  `
  const run = (name, stub, overrides = {}) => spawnSync(BASH, ["-c", `${stub}\n${readAdapter}\n${stepScript(name)}`], {
    encoding: "utf8", cwd: root, env: { ...environment, ...overrides }, timeout: 5000,
  })
  const healthStub = `
    curl() {
      printf '%s\\n' "$@" >> "$CALLS"
      case "$*" in
        *api.render.com*) cat "$SERVICE_RESPONSE" ;;
        */api/health*) cat "$HEALTH_RESPONSE" ;;
        *) return 1 ;;
      esac
    }
    sleep() { SECONDS=$((SECONDS + 181)); }
  `
  stage("release-workflow/calls", "")
  const health = run("Check web health", healthStub, { RELEASE_ENVIRONMENT: "production" })
  const observed = new Set(readFileSync(calls, "utf8").trim().split("\n"))
  T("production checks service and public health and records the public URL", health.status === 0 &&
    observed.has(`${renderFixture.service.serviceDetails.url}/api/health`) &&
    observed.has("https://public.example.invalid/api/health") &&
    readFileSync(output, "utf8").includes("deployment_url=https://public.example.invalid\n"), health.stderr)
  T("production health does not request the retired application route",
    !observed.has(`${renderFixture.service.serviceDetails.url}/login`))
  const staleHealth = stage("release-workflow/stale-health.json", JSON.stringify({ ...renderFixture.health, commit: "b".repeat(40) }))
  const mismatch = run("Check web health", healthStub, { RELEASE_ENVIRONMENT: "production", HEALTH_RESPONSE: staleHealth })
  T("production rejects a healthy service running another commit", mismatch.status === 1 && mismatch.stderr.includes("did not report status ok and commit"), mismatch.stderr)

  const deployStub = `
    curl() {
      printf '%s\\n' "$*" >> "$CALLS"
      local endpoint argument
      for argument in "$@"; do
        if [[ "$argument" == https://api.render.com/* ]]; then endpoint="$argument"; fi
      done
      if [[ "$endpoint" == "https://api.render.com/v1/services/$SERVICE_ID" ]]; then
        if [[ "$SERVICE_FAILURE" == true ]]; then return 22; fi
        cat "$SERVICE_RESPONSE"
        return
      fi
      if [[ "$*" == *'-X POST'* ]]; then
        local response
        while (( $# )); do
          if [ "$1" = -o ]; then response="$2"; break; fi
          shift
        done
        jq -nc --arg ref "$IMAGE@$DIGEST" '{id:"fixture-deploy",image:{ref:$ref,sha:"fixture"},status:"created",trigger:"api",createdAt:"<ISO-8601 timestamp>",updatedAt:"<ISO-8601 timestamp>"}' > "$response"
        printf 201
      else
        jq -nc --arg status "$DEPLOY_STATUS" '{status:$status}'
      fi
    }
    sleep() { :; }
  `
  for (const status of ["live", "canceled"]) {
    stage("release-workflow/calls", "")
    const result = run("Deploy web digest", deployStub, { DEPLOY_STATUS: status, SERVICE_RESPONSE: shutdownServicePath })
    T(`production follows its own deploy to ${status}`, result.status === (status === "live" ? 0 : 1) &&
      readFileSync(calls, "utf8").includes("services/srv-production/deploys/fixture-deploy"), result.stderr)
    const requests = readFileSync(calls, "utf8").trim().split("\n")
    T("production reads the shutdown delay before requesting a deploy without changing it",
      requests[0].includes("https://api.render.com/v1/services/srv-production ") &&
      requests[1]?.includes("-X POST") && !requests.some((request) => request.includes("PATCH")))
  }
  for (const [label, response, failure] of [
    ["missing", readFileSync(servicePath, "utf8"), false],
    ["short", JSON.stringify({ ...renderFixture.shutdownService,
      serviceDetails: { ...renderFixture.shutdownService.serviceDetails, maxShutdownDelaySeconds: 30 } }), false],
    ["string", JSON.stringify({ ...renderFixture.shutdownService,
      serviceDetails: { ...renderFixture.shutdownService.serviceDetails, maxShutdownDelaySeconds: "300" } }), false],
    ["malformed", "{", false],
    ["empty", "", false],
    ["unavailable", "", true],
  ]) {
    stage("release-workflow/calls", "")
    const result = run("Deploy web digest", deployStub, { DEPLOY_STATUS: "live", SERVICE_FAILURE: String(failure),
      SERVICE_RESPONSE: stage("release-workflow/shutdown-readback.json", response) })
    const requests = readFileSync(calls, "utf8").trim().split("\n")
    T(`production rejects ${label} shutdown readback before deploying`, result.status !== 0 &&
      result.stderr.includes("render_web_service.production_web") && result.stderr.includes("orbit-api") &&
      result.stderr.includes("infra/production.tf") && requests.length === 1 && !requests[0].includes("-X POST"), result.stdout + result.stderr)
  }
  stage("release-workflow/calls", "")
  const staging = run("Deploy staging web digest", deployStub, { DEPLOY_STATUS: "live" })
  const stagingRequests = readFileSync(calls, "utf8").trim().split("\n")
  T("free staging deploys without reading or writing a shutdown setting", staging.status === 0 &&
    stagingRequests.length === 2 && stagingRequests[0].includes("-X POST") &&
    stagingRequests[1].includes("/deploys/fixture-deploy") && !stagingRequests.some((request) => request.includes("PATCH")), staging.stderr)
  const missing = run("Deploy web digest", "curl() { return 99; }", { SERVICE_ID: "" })
  T("missing production service fails before any request", missing.status === 1 && missing.stderr.includes("Missing RENDER_WEB_SERVICE_ID"))
  const payload = stage("release-workflow/payload", "")
  const recordStub = `curl() { cat >> "$PAYLOAD"; cat "$DEPLOYMENT_RESPONSE"; }`
  const record = run("Record GitHub deployment", recordStub, { RELEASE_ENVIRONMENT: "production",
    SOURCE_REF: "main", DEPLOYMENT_URL: "https://public.example.invalid", PAYLOAD: payload })
  const records = readFileSync(payload, "utf8").trim().split("\n").map((line) => JSON.parse(line))
  T("production records a successful deployment at the built SHA", record.status === 0 &&
    records[0].ref === environment.SOURCE_SHA && records[0].payload.source_ref === "main" &&
    records[0].environment === "production" && records[0].production_environment === true &&
    records[1].environment === "production" && records[1].state === "success", record.stderr)
}

function checkRenderRetries() {
  const fixture = JSON.parse(readFileSync(toolPath("__tests__/render-web-deploy-fixture.json"), "utf8"))
  const directory = join(root, "render-retries")
  mkdirSync(directory, { recursive: true })
  const calls = join(directory, "calls")
  const stub = `
    curl() {
      local endpoint argument output='' write_code=false post=false retries=false fail=false
      for argument in "$@"; do
        [[ "$argument" == https://api.render.com/* ]] && endpoint="$argument"
        [[ "$argument" == --retry-all-errors ]] && retries=true
        [[ "$argument" == --fail || "$argument" == -fsS ]] && fail=true
      done
      printf '%s\\n' "$*" >> "$CALLS"
      while (( $# )); do
        case "$1" in
          -o|--output) output="$2"; shift ;;
          -w|--write-out) write_code=true; shift ;;
          -X) [[ "$2" == POST ]] && post=true; shift ;;
        esac
        shift
      done
      local body code=200
      if $post; then
        local count=0
        [[ -f "$COUNTER" ]] && count=$(cat "$COUNTER")
        count=$((count + 1)); printf '%s' "$count" > "$COUNTER"
        if [[ "$SCENARIO" == lost-* || "$SCENARIO" == exhausted ]]; then
          if [[ "$count" == 1 || "$SCENARIO" == exhausted ]]; then
            $write_code && printf 000
            return 56
          fi
        fi
        code=201; body=$(jq '.[0].deploy' "$DEPLOYS")
        case "$SCENARIO" in
          post-4xx) code=401 ;;
          queued) code=202; body='' ;;
          wrong-image) body=$(jq '.image.ref="other"' <<< "$body") ;;
        esac
      elif [[ "$endpoint" == */deploys[?]* || "$endpoint" == */deploys ]]; then
        case "$SCENARIO" in
          lost-empty|exhausted) body='[]' ;;
          lost-wrong) body=$(jq '.[0].deploy.image.ref="other"' "$DEPLOYS") ;;
          lost-list-fails) return 22 ;;
          lost-malformed) body='{}' ;;
          *) body=$(cat "$DEPLOYS") ;;
        esac
      elif [[ "$endpoint" == */deploys/* ]]; then
        if [[ "$SCENARIO" == poll-transient ]] && ! $retries; then return 56; fi
        if [[ "$SCENARIO" == poll-4xx ]]; then code=404; fi
        body=$(jq '.[0].deploy' "$DEPLOYS")
      else
        body=$(cat "$SERVICE_RESPONSE")
      fi
      if [[ -n "$output" ]]; then printf '%s' "$body" > "$output"; else printf '%s' "$body"; fi
      $write_code && printf '%s' "$code"
      if [[ "$code" == 4* ]] && $fail; then return 22; fi
      return 0
    }
    sleep() { :; }
  `
  for (const step of ["Deploy web digest", "Deploy staging web digest"]) {
    for (const [scenario, accepted, posts] of [
      ["poll-transient", true, 1], ["lost-response", true, 1], ["lost-empty", true, 2],
      ["lost-wrong", true, 2], ["lost-list-fails", false, 1], ["lost-malformed", false, 1],
      ["post-4xx", false, 1], ["poll-4xx", false, 1], ["queued", false, 1],
      ["wrong-image", false, 1], ["exhausted", false, 3],
    ]) {
      writeFileSync(calls, "")
      const counter = stage("render-retries/count", "0")
      const result = spawnSync(BASH, ["-c", `${stub}\n${stepScript(step)}`], {
        encoding: "utf8", cwd: root, timeout: 5000, env: {
          ...process.env, GITHUB_WORKSPACE: toolPath(".."), SERVICE_ID: "srv-production", SERVICE_VARIABLE: "RENDER_WEB_SERVICE_ID",
          RENDER_API_KEY: "fixture", IMAGE: "ghcr.io/example/web", DIGEST: "sha256:fixture", SCENARIO: scenario,
          SERVICE_RESPONSE: stage("render-retries/service", JSON.stringify(renderFixture.shutdownService)),
          DEPLOYS: stage("render-retries/deploys", JSON.stringify(fixture.deploys)), COUNTER: counter, CALLS: calls,
        },
      })
      T(`${step} ${scenario} ${accepted ? "reaches live" : "fails"} with ${posts} POSTs`,
        (accepted ? result.status === 0 && result.stdout.includes("is live") : result.status !== 0) &&
        Number(readFileSync(counter, "utf8")) === posts, result.stdout + result.stderr)
      if (scenario === "poll-transient") {
        const poll = readFileSync(calls, "utf8").split("\n").find(line => line.includes("/deploys/fixture-deploy")) ?? ""
        T(`${step} bounds curl read retries and timeouts`,
          poll.includes("--retry 3") && poll.includes("--retry-all-errors") && poll.includes("--retry-delay 2") && poll.includes("--max-time 30"), poll)
      }
    }
  }
}

function checkSourceIdentity() {
  const directory = join(root, "release-source")
  mkdirSync(directory, { recursive: true })
  const environment = { ...process.env, GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" }
  const git = (...args) => execFileSync("git", args, { cwd: directory, env: environment, encoding: "utf8" }).trim()
  git("init", "-q", "-b", "main")
  writeFileSync(join(directory, "source"), "planned")
  git("add", "source")
  git("commit", "-qm", "Planned source")
  const planned = git("rev-parse", "HEAD")
  writeFileSync(join(directory, "source"), "advanced")
  git("commit", "-qam", "Advance source")
  const advanced = git("rev-parse", "HEAD")
  git("update-ref", "refs/remotes/origin/main", advanced)
  const output = stage("release-source/output", "")
  const resolve = () => spawnSync(BASH, ["-c", stepScript("Resolve source")], { cwd: directory, encoding: "utf8",
    env: { ...environment, SOURCE_SHA: planned, SOURCE_BRANCH: "main", GITHUB_OUTPUT: output } })
  const wrongCheckout = resolve()
  T("source rejects the advanced branch checkout", wrongCheckout.status === 1 && wrongCheckout.stdout.includes("Checkout does not match"), wrongCheckout.stderr)
  git("checkout", "-q", "--detach", planned)
  const pinned = resolve()
  T("source accepts the planned ancestor after the branch advances", pinned.status === 0 && readFileSync(output, "utf8").includes(`sha=${planned}`), pinned.stderr)
  git("update-ref", "refs/remotes/origin/main", planned)
  git("checkout", "-q", "--detach", advanced)
  const outside = spawnSync(BASH, ["-c", stepScript("Resolve source")], { cwd: directory, encoding: "utf8",
    env: { ...environment, SOURCE_SHA: advanced, SOURCE_BRANCH: "main", GITHUB_OUTPUT: output } })
  T("source rejects a commit outside the selected branch", outside.status === 1 && outside.stdout.includes("not reachable"), outside.stderr)
}

function checkPinnedRelease() {
  const parsed = load(workflow)
  const checkout = parsed.jobs.build.steps.find((step) => step.uses?.startsWith("actions/checkout@"))
  T("build checks out the selected SHA with complete branch history", checkout.with.ref === "${{ steps.selection.outputs.sha }}" && checkout.with["fetch-depth"] === 0)
  const resolve = stepScript("Resolve source")
  T("source resolution verifies checkout identity and branch ancestry", resolve.includes('"$sha" != "$SOURCE_SHA"') && resolve.includes('git merge-base --is-ancestor "$SOURCE_SHA" "refs/remotes/origin/$SOURCE_BRANCH"'))
  const admission = parsed.jobs.production.steps.find((step) => step.name === "Require healthy staging commit")
  T("production admits staging before deploying", !!admission && parsed.jobs.production.steps.indexOf(admission) < parsed.jobs.production.steps.findIndex((step) => step.name === "Deploy web digest"))
  if (!admission) return
  T("production retains staging admission", admission.if === "inputs.environment == 'production'")
  const summary = stage("release-admission/summary", "")
  const script = admission.run
  for (const [status, commit, override, accepted] of [
    ["ok", renderFixture.health.commit, "false", true],
    ["ok", "b".repeat(40), "false", false],
    ["unhealthy", renderFixture.health.commit, "false", false],
    ["ok", "b".repeat(40), "true", true],
  ]) {
    const health = stage("release-admission/health", JSON.stringify({ ...renderFixture.health, status, commit }))
    const result = spawnSync(BASH, ["-c", `curl() { if [[ "$*" == *api.render.com* ]]; then
      local output previous argument; for argument in "$@"; do [[ "$previous" == -o ]] && output="$argument"; previous="$argument"; done
      cat "$SERVICE_RESPONSE" > "$output"; printf 200
      else cat "$HEALTH_RESPONSE"; fi; }\n${script}`], { encoding: "utf8", env: {
      ...process.env, GITHUB_WORKSPACE: toolPath(".."), SOURCE_SHA: renderFixture.health.commit, FORCE_UNSTAGED: override,
      STAGING_SERVICE_ID: "srv-staging", RENDER_API_KEY: "fixture",
      SERVICE_RESPONSE: stage("release-admission/service", JSON.stringify(renderFixture.service)),
      HEALTH_RESPONSE: health, GITHUB_STEP_SUMMARY: summary,
    } })
    T(`staging admission ${status} ${commit} override ${override}`, result.status === (accepted ? 0 : 1), result.stdout + result.stderr)
  }
  T("production override is recorded", readFileSync(summary, "utf8").includes("force_unstaged: true"))
}

export function cases() {
  T("release workflow exposes only production and staging", JSON.stringify(load(workflow).on.workflow_dispatch.inputs.environment.options) === JSON.stringify(["production", "staging"]))
  T("release selection guard is present", typeof guard === "string")
  if (!guard) return
  for (const [environment, branch, accepted, message] of [
    ["production", "main", true],
    ["production", "redesign/main", false, "Production must build main"],
    ["production", "feature/release", false, "Production must build main"],
    ["staging", "feature/release", true],
  ]) {
    const result = spawnSync(BASH, ["-c", guard], { encoding: "utf8", env: {
      ...process.env, GITHUB_REF_NAME: "main", RELEASE_ENVIRONMENT: environment, SOURCE_BRANCH: branch,
      SOURCE_SHA: renderFixture.health.commit, DISPATCH_SHA: renderFixture.health.commit, GITHUB_OUTPUT: stage("release-guard/output", ""),
    } })
    T(`workflow ${environment} from ${branch} ${accepted ? "passes" : "fails"}`, accepted
      ? result.status === 0 : result.status === 1 && result.stdout.includes(message), result.stdout + result.stderr)
  }
  for (const [environment, selected, accepted] of [
    ["staging", "", false], ["staging", "abc", false], ["staging", "A".repeat(40), false],
    ["production", "", true],
  ]) {
    const output = stage("release-selection/output", "")
    const result = spawnSync(BASH, ["-c", stepScript("Validate release selection")], { encoding: "utf8", env: {
      ...process.env, GITHUB_REF_NAME: "main", RELEASE_ENVIRONMENT: environment,
      SOURCE_BRANCH: "main",
      SOURCE_SHA: selected, DISPATCH_SHA: renderFixture.health.commit, GITHUB_OUTPUT: output,
    } })
    T(`selection ${environment} ${selected || "without SHA"}`, result.status === (accepted ? 0 : 1), result.stdout + result.stderr)
    if (accepted) T("production defaults to dispatch commit", readFileSync(output, "utf8").includes(`sha=${renderFixture.health.commit}`))
  }
  const wrongWorkflow = spawnSync(BASH, ["-c", guard], { encoding: "utf8", env: {
    ...process.env, GITHUB_REF_NAME: "feature/release", RELEASE_ENVIRONMENT: "production", SOURCE_BRANCH: "main",
  } })
  T("production dispatches the workflow from main", wrongWorkflow.status === 1 && wrongWorkflow.stdout.includes("Dispatch release.yml from main"))
  checkRenderRetries()
  checkProductionSteps()
  checkPinnedRelease()
  checkSourceIdentity()
}
