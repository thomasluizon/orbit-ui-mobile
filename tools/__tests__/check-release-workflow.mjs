import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { BASH, T, root, stage, toolPath } from "./_harness.mjs"

const workflow = readFileSync(toolPath("../.github/workflows/release.yml"), "utf8")

const guard = workflow.match(/      - name: Validate release selection\n[\s\S]*?        run: \|\n((?:          .*\n|\n)+)/)?.[1]
const stepScript = (name) => {
  const script = workflow.split(`      - name: ${name}\n`)[1]?.match(/        run: \|\n((?:          .*\n|\n)+)/)?.[1]
  if (!script) throw new Error(`Missing release script: ${name}`)
  return script
}

const renderFixture = JSON.parse(readFileSync(toolPath("__tests__/render-release-fixture.json"), "utf8"))
const releaseFixture = JSON.parse(readFileSync(toolPath("__tests__/release-fixture.json"), "utf8"))

function checkProductionSteps() {
  T("redesign shares the production build and credential environment", workflow.includes("if: inputs.environment == 'production' || inputs.environment == 'production-redesign'") &&
    /production:\n[\s\S]*?environment:\n      name: production\n      deployment: false/.test(workflow))
  T("service selection indexes the chosen variable without a value fallback", workflow.includes("SERVICE_ID: ${{ vars[inputs.environment == 'production-redesign' && 'RENDER_WEB_REDESIGN_SERVICE_ID' || 'RENDER_WEB_SERVICE_ID'] }}"))
  T("deployment records use the requested environment", workflow.includes("RELEASE_ENVIRONMENT: ${{ inputs.environment }}"))
  T("smoke remains limited to the main production service", /smoke:\n[\s\S]*?if: inputs.environment == 'production'\n/.test(workflow))
  const servicePath = stage("release-workflow/service.json", JSON.stringify(renderFixture.service))
  const healthPath = stage("release-workflow/health.json", JSON.stringify(renderFixture.health))
  const deploymentPath = stage("release-workflow/deployment.json", JSON.stringify(releaseFixture.deployment))
  const output = stage("release-workflow/output", "")
  const summary = stage("release-workflow/summary", "")
  const calls = join(root, "release-workflow/calls")
  const environment = {
    ...process.env, SERVICE_RESPONSE: servicePath, HEALTH_RESPONSE: healthPath, DEPLOYMENT_RESPONSE: deploymentPath,
    GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary, CALLS: calls,
    SOURCE_SHA: renderFixture.health.commit, SERVICE_ID: "srv-redesign", SERVICE_VARIABLE: "RENDER_WEB_REDESIGN_SERVICE_ID",
    RENDER_API_KEY: "fixture", IMAGE: "ghcr.io/thomasluizon/orbit-web", DIGEST: "sha256:fixture",
    PRODUCTION_WEB_HOST: "public.example.invalid", GH_TOKEN: "fixture", GITHUB_REPOSITORY: "example/repository",
  }
  const run = (name, stub, overrides = {}) => spawnSync(BASH, ["-c", `${stub}\n${stepScript(name)}`], {
    encoding: "utf8", cwd: root, env: { ...environment, ...overrides }, timeout: 5000,
  })
  const healthStub = `
    curl() {
      printf '%s\\n' "$*" >> "$CALLS"
      case "$*" in
        *api.render.com*) cat "$SERVICE_RESPONSE" ;;
        */api/health*) cat "$HEALTH_RESPONSE" ;;
        *) return 1 ;;
      esac
    }
    sleep() { SECONDS=$((SECONDS + 181)); }
  `
  for (const target of ["production", "production-redesign"]) {
    stage("release-workflow/output", "")
    stage("release-workflow/calls", "")
    const result = run("Check web health", healthStub, { RELEASE_ENVIRONMENT: target })
    const observed = readFileSync(calls, "utf8")
    const outputs = readFileSync(output, "utf8")
    const publicCheck = observed.includes("https://public.example.invalid/api/health")
    const url = target === "production" ? "https://public.example.invalid" : renderFixture.service.serviceDetails.url
    T(`${target} checks its health commit and records its own URL`, result.status === 0 &&
      observed.includes(`${renderFixture.service.serviceDetails.url}/api/health`) &&
      publicCheck === (target === "production") && outputs.includes(`deployment_url=${url}\n`), result.stderr)
  }
  const staleHealth = stage("release-workflow/stale-health.json", JSON.stringify({ ...renderFixture.health, commit: "b".repeat(40) }))
  const mismatch = run("Check web health", healthStub, { RELEASE_ENVIRONMENT: "production-redesign", HEALTH_RESPONSE: staleHealth })
  T("redesign rejects a healthy service running another commit", mismatch.status === 1 && mismatch.stderr.includes("did not report status ok and commit"), mismatch.stderr)

  const deployStub = `
    curl() {
      printf '%s\\n' "$*" >> "$CALLS"
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
    const result = run("Deploy web digest", deployStub, { DEPLOY_STATUS: status })
    T(`redesign follows its own deploy to ${status}`, result.status === (status === "live" ? 0 : 1) &&
      readFileSync(calls, "utf8").includes("services/srv-redesign/deploys/fixture-deploy"), result.stderr)
  }
  const missing = run("Deploy web digest", "curl() { return 99; }", { SERVICE_ID: "" })
  T("missing redesign service fails before any request", missing.status === 1 && missing.stderr.includes("Missing RENDER_WEB_REDESIGN_SERVICE_ID"))
  const payload = stage("release-workflow/payload", "")
  const recordStub = `curl() { cat >> "$PAYLOAD"; cat "$DEPLOYMENT_RESPONSE"; }`
  const record = run("Record GitHub deployment", recordStub, { RELEASE_ENVIRONMENT: "production-redesign",
    SOURCE_REF: "redesign/main", DEPLOYMENT_URL: "https://redesign.example.invalid", PAYLOAD: payload })
  const records = readFileSync(payload, "utf8").trim().split("\n").map((line) => JSON.parse(line))
  T("redesign records a separate successful production deployment at the built SHA", record.status === 0 &&
    records[0].ref === environment.SOURCE_SHA && records[0].payload.source_ref === "redesign/main" &&
    records[0].environment === "production-redesign" && records[0].production_environment === true &&
    records[1].environment === "production-redesign" && records[1].state === "success", record.stderr)
}

export function cases() {
  T("release workflow exposes redesign as a dispatch choice", /options: \[production, staging, production-redesign\]/.test(workflow))
  T("release selection guard is present", typeof guard === "string")
  if (!guard) return
  for (const [environment, branch, accepted, message] of [
    ["production", "main", true],
    ["production", "redesign/main", false, "Production must build main"],
    ["production", "feature/release", false, "Production must build main"],
    ["production-redesign", "redesign/main", true],
    ["production-redesign", "main", false, "Production redesign must build redesign/main"],
    ["production-redesign", "feature/release", false, "Production redesign must build redesign/main"],
    ["staging", "feature/release", true],
  ]) {
    const result = spawnSync(BASH, ["-c", guard], { encoding: "utf8", env: {
      ...process.env, GITHUB_REF_NAME: "main", RELEASE_ENVIRONMENT: environment, SOURCE_BRANCH: branch,
    } })
    T(`workflow ${environment} from ${branch} ${accepted ? "passes" : "fails"}`, accepted
      ? result.status === 0 : result.status === 1 && result.stdout.includes(message), result.stdout + result.stderr)
  }
  const wrongWorkflow = spawnSync(BASH, ["-c", guard], { encoding: "utf8", env: {
    ...process.env, GITHUB_REF_NAME: "redesign/main", RELEASE_ENVIRONMENT: "production-redesign", SOURCE_BRANCH: "redesign/main",
  } })
  T("redesign still dispatches the workflow from main", wrongWorkflow.status === 1 && wrongWorkflow.stdout.includes("Dispatch release.yml from main"))
  checkProductionSteps()
}
