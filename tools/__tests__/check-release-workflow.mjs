import { load } from "js-yaml"
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { runBounded } from "../lib/bounded-process.mjs"
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
const gateFixture = JSON.parse(readFileSync(toolPath("__tests__/fixtures/gate-github-responses.json"), "utf8"))

async function checkProductionSteps() {
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
  const run = async (name, stub, overrides = {}) => {
    // Fixture sleep owns retry time; completion uses the shared harness process bound.
    const result = await runBounded(BASH, ["-c", `${stub}\n${readAdapter}\n${stepScript(name)}`], {
      cwd: root, env: { ...environment, ...overrides }, timeoutMs: 180000,
    })
    T(`${name} fixture completes normally`, Number.isInteger(result.status) && result.signal === null &&
      !result.error && !result.timedOut && !result.overflowed, JSON.stringify(result))
    return result
  }
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
  const health = await run("Check web health", healthStub, { RELEASE_ENVIRONMENT: "production" })
  const observed = new Set(readFileSync(calls, "utf8").trim().split("\n"))
  T("production checks service and public health and records the public URL", health.status === 0 &&
    observed.has(`${renderFixture.service.serviceDetails.url}/api/health`) &&
    observed.has("https://public.example.invalid/api/health") &&
    readFileSync(output, "utf8").includes("deployment_url=https://public.example.invalid\n"), health.stderr)
  T("production health does not request the retired application route",
    !observed.has(`${renderFixture.service.serviceDetails.url}/login`))
  const staleHealth = stage("release-workflow/stale-health.json", JSON.stringify({ ...renderFixture.health, commit: "b".repeat(40) }))
  const mismatch = await run("Check web health", healthStub, { RELEASE_ENVIRONMENT: "production", HEALTH_RESPONSE: staleHealth })
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
      elif [[ "$endpoint" == */deploys[?]* ]]; then
        printf '[]'
      else
        jq -nc --arg status "$DEPLOY_STATUS" '{status:$status}'
      fi
    }
    sleep() { :; }
  `
  const ready = join(root, "release-workflow/ready")
  const release = join(root, "release-workflow/release")
  rmSync(ready, { force: true })
  rmSync(release, { force: true })
  const pending = run("Deploy web digest", `
    printf ready > "$READY"
    while [[ ! -f "$RELEASE" ]]; do command sleep 0.01; done
    ${deployStub}
  `, { DEPLOY_STATUS: "live", SERVICE_RESPONSE: shutdownServicePath, READY: ready, RELEASE: release })
  let completed = false
  void pending.then(() => { completed = true })
  try {
    while (!existsSync(ready) && !completed) await new Promise((resolve) => setTimeout(resolve, 10))
  } finally {
    writeFileSync(release, "release")
  }
  const released = await pending
  T("production awaits fixture completion while the parent releases its readiness gate",
    existsSync(ready) && released.status === 0 && released.signal === null && !released.error,
    JSON.stringify({ status: released.status, signal: released.signal, error: String(released.error ?? ""), stdout: released.stdout, stderr: released.stderr }))
  for (const status of ["live", "canceled"]) {
    stage("release-workflow/calls", "")
    const result = await run("Deploy web digest", deployStub, { DEPLOY_STATUS: status, SERVICE_RESPONSE: shutdownServicePath })
    T(`production follows its own deploy to ${status}`, result.status === (status === "live" ? 0 : 1) &&
      readFileSync(calls, "utf8").includes("services/srv-production/deploys/fixture-deploy"), result.stderr)
    const requests = readFileSync(calls, "utf8").trim().split("\n")
    T("production reads the shutdown delay before requesting a deploy without changing it",
      requests[0].includes("https://api.render.com/v1/services/srv-production ") &&
      requests[1]?.includes("/deploys?limit=100") && requests[2]?.includes("-X POST") && !requests.some((request) => request.includes("PATCH")))
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
    const result = await run("Deploy web digest", deployStub, { DEPLOY_STATUS: "live", SERVICE_FAILURE: String(failure),
      SERVICE_RESPONSE: stage("release-workflow/shutdown-readback.json", response) })
    const requests = readFileSync(calls, "utf8").trim().split("\n")
    T(`production rejects ${label} shutdown readback before deploying`, result.status !== 0 &&
      result.stderr.includes("render_web_service.production_web") && result.stderr.includes("orbit-api") &&
      result.stderr.includes("infra/production.tf") && requests.length === (failure ? 3 : 1) && !requests[0].includes("-X POST"), result.stdout + result.stderr)
  }
  stage("release-workflow/calls", "")
  const staging = await run("Deploy staging web digest", deployStub, { DEPLOY_STATUS: "live" })
  const stagingRequests = readFileSync(calls, "utf8").trim().split("\n")
  T("free staging deploys without reading or writing a shutdown setting", staging.status === 0 &&
    stagingRequests.length === 3 && stagingRequests[0].includes("/deploys?limit=100") && stagingRequests[1].includes("-X POST") &&
    stagingRequests[2].includes("/deploys/fixture-deploy") && !stagingRequests.some((request) => request.includes("PATCH")), staging.stderr)
  const missing = await run("Deploy web digest", "curl() { return 99; }", { SERVICE_ID: "" })
  T("missing production service fails before any request", missing.status === 1 && missing.stderr.includes("Missing RENDER_WEB_SERVICE_ID"))
  const payload = stage("release-workflow/payload", "")
  const recordStub = `curl() { cat >> "$PAYLOAD"; cat "$DEPLOYMENT_RESPONSE"; }`
  const record = await run("Record GitHub deployment", recordStub, { RELEASE_ENVIRONMENT: "production",
    SOURCE_REF: "main", DEPLOYMENT_URL: "https://public.example.invalid", PAYLOAD: payload })
  const records = readFileSync(payload, "utf8").trim().split("\n").map((line) => JSON.parse(line))
  T("production records a successful deployment at the built SHA", record.status === 0 &&
    records[0].ref === environment.SOURCE_SHA && records[0].payload.source_ref === "main" &&
    records[0].environment === "production" && records[0].production_environment === true &&
    records[1].environment === "production" && records[1].state === "success", record.stderr)
}

async function checkRenderRetries() {
  const fixture = JSON.parse(readFileSync(toolPath("__tests__/render-web-deploy-fixture.json"), "utf8"))
  const directory = join(root, "render-retries")
  mkdirSync(directory, { recursive: true })
  const calls = join(directory, "calls")
  const stub = `
    curl() {
      local endpoint argument output='' headers='' write_code=false post=false retries=false fail=false
      for argument in "$@"; do
        [[ "$argument" == https://api.render.com/* ]] && endpoint="$argument"
        [[ "$argument" == --retry-all-errors ]] && retries=true
        [[ "$argument" == --fail || "$argument" == -fsS ]] && fail=true
      done
      printf '%s\\n' "$*" >> "$CALLS"
      while (( $# )); do
        case "$1" in
          -o|--output) output="$2"; shift ;;
          -D|--dump-header) headers="$2"; shift ;;
          -w|--write-out) write_code=true; shift ;;
          -X) [[ "$2" == POST ]] && post=true; shift ;;
        esac
        shift
      done
      [[ -n "$headers" ]] && : > "$headers"
      local body code=200 count=0 elapsed limited_until=0
      [[ -f "$RATE_LIMIT_UNTIL" ]] && limited_until=$(cat "$RATE_LIMIT_UNTIL")
      if [[ "$SCENARIO" == *429 && "$limited_until" == 0 ]]; then
        limited_until=7
        [[ "$SCENARIO" == poll-429 ]] && limited_until=17
        printf '%s' "$limited_until" > "$RATE_LIMIT_UNTIL"
      fi
      count=$(cat "$COUNTER")
      elapsed=$(cat "$ELAPSED")
      if $post; then
        count=$((count + 1)); printf '%s' "$count" > "$COUNTER"
        if [[ "$SCENARIO" == lost-* || "$SCENARIO" == historical-* || "$SCENARIO" == exhausted ]]; then
          if [[ "$count" == 1 || "$SCENARIO" == exhausted ]]; then
            $write_code && printf 000
            return 56
          fi
        fi
        code=201; body=$(jq '.[0].deploy' "$DEPLOYS")
        case "$SCENARIO" in
          post-4xx) code=401 ;;
          post-429) if (( elapsed < limited_until )); then code=429; fi ;;
          post-dns|post-connect) if (( count == 1 )); then printf 000; return "$TRANSPORT_EXIT"; fi ;;
          post-ambiguous-*) if [[ "$SCENARIO" == post-ambiguous-http ]]; then printf 200; else printf 000; fi; return "$TRANSPORT_EXIT" ;;
          post-5xx) code=503 ;;
          queued) code=202; body='' ;;
          wrong-image) body=$(jq '.image.ref="other"' <<< "$body") ;;
        esac
      elif [[ "$endpoint" == */deploys[?]* || "$endpoint" == */deploys ]]; then
        local lists=0
        [[ -f "$LIST_COUNTER" ]] && lists=$(cat "$LIST_COUNTER")
        lists=$((lists + 1)); printf '%s' "$lists" > "$LIST_COUNTER"
        local historical
        historical=$(jq '[.[0] | .deploy.id="historical-deploy" | .deploy.status="canceled"]' "$DEPLOYS")
        if (( count == 0 )); then
          case "$SCENARIO" in historical-*) body="$historical" ;; *) body='[]' ;; esac
        else
        case "$SCENARIO" in
          historical-only) body="$historical" ;;
          historical-first) body=$(jq -s '.[0] + .[1]' <(printf '%s' "$historical") "$DEPLOYS") ;;
          historical-last) body=$(jq -s '.[1] + .[0]' <(printf '%s' "$historical") "$DEPLOYS") ;;
          lost-delayed) if (( lists < 3 )); then body='[]'; else body=$(cat "$DEPLOYS"); fi ;;
          lost-empty|exhausted|post-429) body='[]' ;;
          lost-wrong) body=$(jq '.[0].deploy.image.ref="other"' "$DEPLOYS") ;;
          lost-list-fails) return 22 ;;
          lost-malformed) body='{}' ;;
          lost-invalid-entry) body='[{}]' ;;
          lost-response) body=$(jq '[.[0] | .deploy.id="other" | .deploy.image.ref="other"] + .' "$DEPLOYS") ;;
          *) body=$(cat "$DEPLOYS") ;;
        esac
        fi
        if [[ "$SCENARIO" == read-429 ]] && (( elapsed < limited_until )); then code=429; fi
      elif [[ "$endpoint" == */deploys/* ]]; then
        if [[ "$SCENARIO" == poll-transient && ! -f "$POLL_COUNTER" ]]; then
          printf 1 > "$POLL_COUNTER"; $write_code && printf 000; return 56
        fi
        if [[ "$SCENARIO" == poll-4xx ]]; then code=404; fi
        if [[ "$SCENARIO" == poll-429 ]] && (( elapsed < limited_until )); then code=429; fi
        if [[ "$endpoint" == */historical-deploy ]]; then
          body=$(jq '.[0].deploy | .status="canceled"' "$DEPLOYS")
        else body=$(jq '.[0].deploy' "$DEPLOYS"); fi
      else
        body=$(cat "$SERVICE_RESPONSE")
      fi
      if [[ "$code" == 429 && -n "$headers" ]]; then printf 'HTTP/2 429\\r\\nretry-after: 7\\r\\n\\r\\n' > "$headers"; fi
      if [[ -n "$output" ]]; then printf '%s' "$body" > "$output"; else printf '%s' "$body"; fi
      $write_code && printf '%s' "$code"
      if [[ "$code" == 4* || "$code" == 5* ]] && $fail; then return 22; fi
      return 0
    }
    sleep() {
      local elapsed
      elapsed=$(cat "$ELAPSED")
      printf '%s' "$((elapsed + $1))" > "$ELAPSED"
      printf 'sleep %s\\n' "$1" >> "$CALLS"
    }
  `
  for (const step of ["Deploy web digest", "Deploy staging web digest"]) {
    for (const [scenario, accepted, posts] of [
      ["poll-transient", true, 1], ["lost-response", true, 1], ["lost-empty", false, 1],
      ["lost-wrong", false, 1], ["lost-list-fails", false, 1], ["lost-malformed", false, 1], ["lost-invalid-entry", false, 1],
      ["post-4xx", false, 1], ["poll-4xx", false, 1], ["queued", false, 1],
      ["wrong-image", false, 1], ["exhausted", false, 1],
      ["lost-delayed", true, 1], ["post-429", true, 2], ["read-429", true, 1], ["poll-429", true, 1],
      ["historical-only", false, 1], ["historical-first", true, 1], ["historical-last", true, 1],
      ["post-dns", true, 2], ["post-connect", true, 2], ["post-ambiguous-28", true, 1], ["post-ambiguous-52", true, 1],
      ["post-ambiguous-55", true, 1], ["post-ambiguous-56", true, 1], ["post-ambiguous-http", true, 1], ["post-5xx", true, 1],
    ]) {
      writeFileSync(calls, "")
      const counter = stage("render-retries/count", "0")
      const pollCounter = join(directory, `${step}-${scenario}-poll`)
      rmSync(pollCounter, { force: true })
      const result = await runBounded(BASH, ["-c", `${stub}\n${stepScript(step)}`], {
        cwd: root, timeoutMs: 180000, env: {
          ...process.env, GITHUB_WORKSPACE: toolPath(".."), SERVICE_ID: "srv-production", SERVICE_VARIABLE: "RENDER_WEB_SERVICE_ID",
          RENDER_API_KEY: "fixture", IMAGE: "ghcr.io/example/web", DIGEST: "sha256:fixture", SCENARIO: scenario,
          SERVICE_RESPONSE: stage("render-retries/service", JSON.stringify(renderFixture.shutdownService)),
          DEPLOYS: stage("render-retries/deploys", JSON.stringify(fixture.deploys)), COUNTER: counter, CALLS: calls, POLL_COUNTER: pollCounter,
          LIST_COUNTER: stage("render-retries/list-count", "0"), ELAPSED: stage("render-retries/elapsed", "0"),
          RATE_LIMIT_UNTIL: stage("render-retries/rate-limit-until", "0"),
          TRANSPORT_EXIT: scenario === "post-dns" ? "6" : scenario === "post-connect" ? "7" : scenario.match(/post-ambiguous-(\d+)/)?.[1] ?? "28",
        },
      })
      T(`${step} ${scenario} ${accepted ? "reaches live" : "fails"} with ${posts} POSTs`,
        (accepted ? result.status === 0 && result.stdout.includes("is live") : Number.isInteger(result.status) && result.status > 0) &&
        result.signal === null && !result.error && !result.timedOut && !result.overflowed &&
        Number(readFileSync(counter, "utf8")) === posts, JSON.stringify(result))
      if (scenario.startsWith("historical-")) {
        T(`${step} ${scenario} never follows the historical deploy`,
          !readFileSync(calls, "utf8").includes("/deploys/historical-deploy"), result.stdout + result.stderr)
      }
      if (scenario.endsWith("429")) {
        T(`${step} ${scenario} waits for Retry-After`, readFileSync(calls, "utf8").includes("sleep 7"), result.stdout + result.stderr)
      }
      if (scenario === "lost-empty" || scenario === "historical-only") {
        T(`${step} ${scenario} explains unresolved acceptance`, result.stderr.includes("ghcr.io/example/web@sha256:fixture") &&
          result.stderr.includes("check the service's deploys before dispatching again"), result.stderr)
      }
      if (scenario === "poll-transient") {
        const polls = readFileSync(calls, "utf8").split("\n").filter(line => line.includes("/deploys/fixture-deploy"))
        const poll = polls[0] ?? ""
        T(`${step} retries the failed first status poll`, polls.length === 2, polls.join("\n"))
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
  const smokeStatus = stage("release-admission/status.json", JSON.stringify([{ ...gateFixture.combinedStatus,
    sha: renderFixture.health.commit, state: "success", total_count: 1, statuses: [gateFixture.commitStatus],
  }]))
  for (const [status, commit, override, accepted] of [
    ["ok", renderFixture.health.commit, "false", true],
    ["ok", "b".repeat(40), "false", false],
    ["unhealthy", renderFixture.health.commit, "false", false],
    ["ok", "b".repeat(40), "true", true],
  ]) {
    const health = stage("release-admission/health", JSON.stringify({ ...renderFixture.health, status, commit }))
    const result = spawnSync(BASH, ["-c", `gh() { cat "$STAGING_STATUS_RESPONSE"; }\ncurl() { if [[ "$*" == *api.render.com* ]]; then
      local output='' previous='' argument; for argument in "$@"; do [[ "$previous" == -o ]] && output="$argument"; previous="$argument"; done
      cat "$SERVICE_RESPONSE" > "$output"; printf 200
      else cat "$HEALTH_RESPONSE"; fi; }\n${script}`], { encoding: "utf8", env: {
      ...process.env, GITHUB_WORKSPACE: toolPath(".."), SOURCE_SHA: renderFixture.health.commit, FORCE_UNSTAGED: override,
      OVERRIDE_REASON: override === "true" ? "Staging service is unavailable" : "",
      STAGING_STATUS_RESPONSE: smokeStatus, GITHUB_REPOSITORY: "fixture/repository", GH_TOKEN: "fixture",
      STAGING_SERVICE_ID: "srv-staging", RENDER_API_KEY: "fixture",
      SERVICE_RESPONSE: stage("release-admission/service", JSON.stringify(renderFixture.service)),
      HEALTH_RESPONSE: health, GITHUB_STEP_SUMMARY: summary,
    } })
    T(`staging admission ${status} ${commit} override ${override}`, result.status === (accepted ? 0 : 1), result.stdout + result.stderr)
  }
  T("production override is recorded with its reason", readFileSync(summary, "utf8").includes("force_unstaged: true") && readFileSync(summary, "utf8").includes("Staging service is unavailable"))
}

function checkAppleClientId() {
  // Structure only. The reject-empty and accept-set behaviour of each guard lives in one suite:
  // .github/scripts/release-admission.test.mjs (web and Android) and apps/mobile/__tests__/ios-workflows.test.ts (iOS).
  const read = (file) => load(readFileSync(toolPath(`../.github/workflows/${file}`), "utf8"))
  const targets = [
    { label: "web", steps: read("release.yml").jobs.build.steps, name: "Validate browser build variables", before: ["Build and push production image", "Build and push staging image"],
      wiring: { PRODUCTION_APPLE_CLIENT_ID: "${{ vars.PRODUCTION_NEXT_PUBLIC_APPLE_CLIENT_ID }}", STAGING_APPLE_CLIENT_ID: "${{ vars.STAGING_NEXT_PUBLIC_APPLE_CLIENT_ID }}" } },
    { label: "android", steps: read("android-release.yml").jobs["release-android"].steps, name: "Validate release secrets",
      before: ["Resolve Google Play track", "Submit build to Google Play"],
      jobWiring: { EXPO_PUBLIC_APPLE_CLIENT_ID: "${{ vars.EXPO_PUBLIC_APPLE_CLIENT_ID }}" }, jobEnv: read("android-release.yml").jobs["release-android"].env },
    { label: "ios", steps: read("ios-release.yml").jobs.release.steps, name: "Validate the release configuration",
      before: ["Install dependencies", "Install signing credentials", "Archive the embedded app"],
      jobWiring: { EXPO_PUBLIC_APPLE_CLIENT_ID: "${{ vars.EXPO_PUBLIC_APPLE_CLIENT_ID }}" }, jobEnv: read("ios-release.yml").jobs.release.env },
  ]
  for (const { label, steps, name, before, wiring, jobWiring, jobEnv } of targets) {
    const index = steps.findIndex((step) => step.name === name)
    T(`${label} release guard exists`, index >= 0)
    if (index < 0) continue
    const step = steps[index]
    T(`${label} release guard cannot be skipped or ignored`, !step.if && !step["continue-on-error"])
    T(`${label} release guard names the Apple client ID`, /APPLE_CLIENT_ID/.test(step.run ?? ""))
    for (const later of before) {
      const laterIndex = steps.findIndex((candidate) => candidate.name === later)
      T(`${label} release guard runs before ${later}`, laterIndex > index)
    }
    if (wiring) T(`${label} release guard reads the Apple variables`, Object.entries(wiring).every(([key, value]) => step.env?.[key] === value))
    if (jobWiring) T(`${label} job passes the Apple variable to its guard`, Object.entries(jobWiring).every(([key, value]) => jobEnv?.[key] === value))
  }
}

/** Lines of a workflow that install Playwright system packages through apt: `--with-deps` or `install-deps`. */
function systemDependencyInstalls(file, text) {
  return text.split("\n").flatMap((line, index) => {
    if (line.trim().startsWith("#")) return []
    const installsDeps = /playwright\s+install\b.*--with-deps\b/.test(line) || /playwright\s+install-deps\b/.test(line)
    return installsDeps ? [`${file}:${index + 1}: ${line.trim()}`] : []
  })
}

/** True when workflow text calls `apt` or `apt-get` to install or update, with or without flags before the subcommand. */
const callsApt = (text) => /\bapt(?:-get)?\s+(?:-\S+\s+)*(?:install|update)\b/.test(text)

/**
 * Runs a ccache workflow step against stubbed `sudo`, `ccache` and `gradlew`, with no network and no real apt.
 * The `ccache` stub records every call and exits 127 (command not found) unless a stubbed install created it.
 */
function runCcacheStep(script, { name, sudoWorks = false, env = {} }) {
  const directory = join(root, "release-ccache", name)
  rmSync(directory, { recursive: true, force: true })
  mkdirSync(join(directory, "home"), { recursive: true })
  const paths = { calls: join(directory, "calls"), installed: join(directory, "installed"), githubEnv: join(directory, "github-env") }
  writeFileSync(paths.calls, "")
  writeFileSync(paths.githubEnv, "")
  writeFileSync(join(directory, "gradlew"), "#!/usr/bin/env bash\nexit 0\n")
  const stubs = `
    sudo() {
      echo "sudo $*" >> "$STUB_CALLS"
      [ "$SUDO_WORKS" = true ] || return 100
      case "$*" in *"install"*) touch "$STUB_INSTALLED" ;; esac
    }
    ccache() {
      echo "ccache $*" >> "$STUB_CALLS"
      [ -e "$STUB_INSTALLED" ] || { echo "ccache: command not found" >&2; return 127; }
      case "$*" in *--show-config*) printf 'max_size = 2.0G\ncompiler_check = content\n' ;; esac
    }
  `
  const environment = { ...process.env, HOME: join(directory, "home"), GITHUB_ENV: paths.githubEnv, SUDO_WORKS: String(sudoWorks),
    STUB_CALLS: paths.calls, STUB_INSTALLED: paths.installed }
  delete environment.CCACHE_AVAILABLE
  Object.assign(environment, env)
  const result = spawnSync(BASH, ["-c", `${stubs}\n${script}`], { cwd: directory, encoding: "utf8", env: environment })
  const calls = readFileSync(paths.calls, "utf8").trim().split("\n").filter(Boolean)
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, calls,
    githubEnv: readFileSync(paths.githubEnv, "utf8"), ccacheCalls: calls.filter((call) => call.startsWith("ccache ")) }
}

/** Why the ccache setup and build scripts can fail the job on a package mirror outage; an empty list means they cannot. */
function ccacheStepFlaws(setupScript, buildScript) {
  const flaws = []
  const failedInstall = runCcacheStep(setupScript, { name: "setup-mirror-down" })
  if (failedInstall.status !== 0) flaws.push(`setup exits ${failedInstall.status} when apt fails: ${failedInstall.stderr.trim()}`)
  if (failedInstall.ccacheCalls.length > 0) flaws.push(`setup runs ccache when apt fails: ${failedInstall.ccacheCalls.join("; ")}`)
  if (!failedInstall.stdout.includes("::warning::")) flaws.push("setup prints no ::warning:: line when apt fails")
  if (failedInstall.githubEnv !== "") flaws.push(`setup writes GITHUB_ENV when apt fails: ${failedInstall.githubEnv.trim()}`)

  const installed = runCcacheStep(setupScript, { name: "setup-mirror-up", sudoWorks: true })
  if (installed.status !== 0) flaws.push(`setup exits ${installed.status} when apt works: ${installed.stderr.trim()}`)
  for (const line of ["CCACHE_AVAILABLE=true", "CMAKE_C_COMPILER_LAUNCHER=ccache", "CMAKE_CXX_COMPILER_LAUNCHER=ccache"]) {
    if (!installed.githubEnv.split("\n").includes(line)) flaws.push(`setup does not write ${line} when apt works`)
  }

  for (const clear of ["true", "false"]) {
    const without = runCcacheStep(buildScript, { name: `build-without-ccache-${clear}`, env: { CLEAR_CACHE: clear } })
    if (without.status !== 0) flaws.push(`build exits ${without.status} without ccache and CLEAR_CACHE=${clear}: ${without.stderr.trim()}`)
    if (without.ccacheCalls.length > 0) flaws.push(`build runs ccache without ccache and CLEAR_CACHE=${clear}: ${without.ccacheCalls.join("; ")}`)
  }
  const withCcache = runCcacheStep(`touch "$STUB_INSTALLED"\n${buildScript}`, { name: "build-with-ccache", env: { CLEAR_CACHE: "true", CCACHE_AVAILABLE: "true" } })
  const expected = ["ccache --clear", "ccache --show-stats"]
  if (withCcache.status !== 0 || expected.some((call) => !withCcache.ccacheCalls.includes(call))) {
    flaws.push(`build with ccache must exit 0 and run ${expected.join(" and ")}; got ${withCcache.status}: ${withCcache.ccacheCalls.join("; ")}`)
  }
  return flaws
}

function checkMirrorIndependence() {
  const workflowsDirectory = toolPath("../.github/workflows")
  const files = readdirSync(workflowsDirectory).filter((name) => /\.ya?ml$/.test(name))
  const read = (name) => readFileSync(join(workflowsDirectory, name), "utf8")
  const installs = files.flatMap((name) => systemDependencyInstalls(`.github/workflows/${name}`, read(name)))
  T("no workflow installs Playwright system packages through apt", installs.length === 0, installs.join("\n     "))
  const fixtureWithDeps = "      - run: npx playwright install --with-deps chromium\n"
  const flagged = systemDependencyInstalls("fixture.yml", fixtureWithDeps)
  T("a with-deps Playwright install is rejected with its file and line", flagged.length === 1 && flagged[0].startsWith("fixture.yml:1:"), flagged.join())
  T("a Playwright install-deps command is rejected",
    systemDependencyInstalls("fixture.yml", "steps:\n  - run: npx playwright install-deps chromium\n").length === 1)
  T("a plain Playwright browser install is accepted", systemDependencyInstalls("fixture.yml", "  - run: npx playwright install chromium\n").length === 0)
  for (const name of ["layout.yml", "release.yml"]) {
    T(`${name} calls no apt command`, !callsApt(read(name)))
  }
  for (const command of ["sudo apt-get install -y ccache", "sudo apt-get -y install libnss3", "sudo apt-get -qq update", "sudo apt -y install fonts-noto"]) {
    T(`the apt check rejects ${command}`, callsApt(`      - run: ${command}\n`))
  }
  T("the apt check accepts a plain Playwright browser install", !callsApt("      - run: npx playwright install chromium\n"))

  const android = load(read("android-release.yml")).jobs["release-android"].steps
  const setup = android.find((step) => step.name === "Set up ccache for the native C++ builds")
  const restore = android.find((step) => step.name === "Restore the ccache directory")
  const build = android.find((step) => step.name === "Build signed AAB with Gradle")
  T("android ccache steps exist", !!setup && !!restore && !!build)
  if (!setup || !restore || !build) return
  const flaws = ccacheStepFlaws(setup.run, build.run)
  T("a ccache install failure cannot fail the android release", flaws.length === 0, flaws.join("\n     "))
  const guardBlock = (command) => new RegExp(String.raw`if \[ "\$\{CCACHE_AVAILABLE:-\}" = "true" \]; then\n(?:\s*echo [^\n]*\n)?\s*${command}\n\s*fi`)
  const oneLineGuard = 'if [ "${CCACHE_AVAILABLE:-}" = "true" ]; then ccache --zero-stats; fi'
  const mutations = {
    "a bare install under set -e": [
      "set -euo pipefail\n\nsudo apt-get update -qq\nsudo apt-get install -y -qq ccache\nccache --zero-stats\n", build.run],
    "an unguarded ccache --clear": [setup.run, build.run.replace(guardBlock("ccache --clear"), "ccache --clear")],
    "an unguarded ccache --show-stats": [setup.run, build.run.replace(guardBlock("ccache --show-stats"), "ccache --show-stats")],
    "a one-line guard before a bare ccache --show-stats": [setup.run,
      `set -euo pipefail\n${oneLineGuard}\nccache --show-stats\n`],
    "a setup that exits 1 when apt fails": [setup.run.replace(/else\n.*::warning::.*\n/, "else\n  exit 1\n"), build.run],
  }
  for (const [label, [mutatedSetup, mutatedBuild]] of Object.entries(mutations)) {
    T(`the ccache check rejects ${label}`, (mutatedSetup !== setup.run || mutatedBuild !== build.run) &&
      ccacheStepFlaws(mutatedSetup, mutatedBuild).length > 0, "mutation did not apply or the check passed it")
  }
  T("the ccache directory restores only when ccache is available", restore.if === "env.CCACHE_AVAILABLE == 'true'")
  T("the android build sets no compiler launcher of its own", !Object.keys(build.env ?? {}).some((key) => key.endsWith("_COMPILER_LAUNCHER")))
}

export async function cases() {
  T("release workflow exposes only production and staging", JSON.stringify(load(workflow).on.workflow_dispatch.inputs.environment.options) === JSON.stringify(["production", "staging"]))
  T("release selection guard is present", typeof guard === "string")
  if (!guard) return
  for (const [environment, branch, accepted, message] of [
    ["production", "main", true],
    ["production", "integration/next", false, "Production must build main"],
    ["production", "feature/release", false, "Production must build main"],
    ["staging", "feature/release", true],
  ]) {
    const result = spawnSync(BASH, ["-c", guard], { encoding: "utf8", env: {
      ...process.env, FORCE_UNSTAGED: "false", OVERRIDE_REASON: "", GITHUB_REF_NAME: "main", RELEASE_ENVIRONMENT: environment, SOURCE_BRANCH: branch,
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
      ...process.env, FORCE_UNSTAGED: "false", OVERRIDE_REASON: "", GITHUB_REF_NAME: "main", RELEASE_ENVIRONMENT: environment,
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
  await checkRenderRetries()
  await checkProductionSteps()
  checkPinnedRelease()
  checkSourceIdentity()
  checkAppleClientId()
  checkMirrorIndependence()
}
