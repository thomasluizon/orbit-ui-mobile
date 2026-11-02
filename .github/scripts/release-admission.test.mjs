import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import yaml from "js-yaml"

const root = new URL("../../", import.meta.url)
const load = (name) => yaml.load(readFileSync(name === "release" && process.env.RELEASE_WORKFLOW_FIXTURE ? process.env.RELEASE_WORKFLOW_FIXTURE : new URL(`.github/workflows/${name}.yml`, root), "utf8"))
const web = load("release")
const recorded = JSON.parse(readFileSync(new URL("tools/__tests__/fixtures/gate-github-responses.json", root), "utf8"))
const render = JSON.parse(readFileSync(new URL("tools/__tests__/render-release-fixture.json", root), "utf8")).service
const sha = "a".repeat(40)
const stepNamed = (job, name) => {
  const step = job.steps.find((candidate) => candidate.name === name)
  assert.ok(step, `missing workflow step: ${name}`)
  return step
}
const execute = (script, environment = {}, responses = {}) => {
  const directory = mkdtempSync(join(tmpdir(), "release-admission-"))
  try {
    mkdirSync(join(directory, ".github/scripts"), { recursive: true })
    writeFileSync(join(directory, ".github/scripts/render-api.sh"), 'render_get() { printf "%s\\n" "$RENDER_FIXTURE"; }\n')
    const curl = join(directory, "curl")
    writeFileSync(curl, `#!${process.execPath}\nprocess.stdout.write(process.env.HEALTH_FIXTURE);\n`)
    chmodSync(curl, 0o755)
    const gh = join(directory, "gh")
    writeFileSync(gh, `#!${process.execPath}\nconst responses = JSON.parse(process.env.RESPONSES); const command = process.argv.slice(2).join(' '); const key = command.includes('/check-runs') ? 'checks' : command.includes('/test.yml/') ? 'test' : command.includes('/guards.yml/') ? 'guards' : 'statuses'; if (!(key in responses)) process.exit(1); process.stdout.write(JSON.stringify(responses[key]));\n`)
    chmodSync(gh, 0o755)
    const summary = join(directory, "summary")
    writeFileSync(summary, "")
    const result = spawnSync("bash", ["-e", "-c", script], { cwd: directory, encoding: "utf8", env: {
      ...process.env, PATH: `${directory}:${process.env.PATH}`, GITHUB_WORKSPACE: directory,
      RENDER_FIXTURE: JSON.stringify(render), HEALTH_FIXTURE: JSON.stringify(responses.health ?? { status: "ok", commit: sha }),
      GITHUB_REPOSITORY: "fixture/repository", GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: join(directory, "outputs"),
      SOURCE_SHA: sha, RESPONSES: JSON.stringify(responses), ...environment,
    } })
    return { ...result, summary: readFileSync(summary, "utf8") }
  } finally { rmSync(directory, { recursive: true, force: true }) }
}

const green = () => ({
  checks: [{ total_count: 2, check_runs: [1, 2].map((id) => ({ ...structuredClone(recorded.check), name: `check ${id}`, head_sha: sha, status: "completed", conclusion: "success", check_suite: { id } })) }],
  ...Object.fromEntries(["test", "guards"].map((name, index) => [name, [{ total_count: 1, workflow_runs: [{ ...structuredClone(recorded.run), head_sha: sha, path: `.github/workflows/${name}.yml`, event: "push", check_suite_id: index + 1, status: "completed", conclusion: "success" }] }]])),
})

test("merged SHAs retain their own tests and guards runs", () => {
  for (const name of ["test", "guards"]) {
    const workflow = load(name)
    assert.deepEqual(workflow.on.push.branches, ["**"])
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps ?? []) {
        if (step.uses?.startsWith("actions/checkout@")) assert.equal(step.with?.ref, undefined, "push jobs must test the event commit")
      }
    }
    assert.match(workflow.concurrency.group, /github.sha/)
  }
})

test("web release requires both successful workflows and their actual checks before building", () => {
  const step = stepNamed(web.jobs.build, "Require successful release CI")
  const android = stepNamed(load("android-release").jobs["release-android"], "Require successful release CI")
  assert.equal(android.run, step.run)
  assert.equal(android.env.SOURCE_SHA, "${{ github.sha }}")
  const gateIndex = web.jobs.build.steps.indexOf(step)
  assert.ok(gateIndex < web.jobs.build.steps.findIndex((candidate) => candidate.uses?.startsWith("docker/build-push-action@")))
  assert.equal(execute(step.run, {}, green()).status, 0)
  for (const mutate of [
    (response) => { response.test[0].workflow_runs = [] },
    (response) => { response.test[0].workflow_runs[0].conclusion = "failure" },
    (response) => { response.guards[0].workflow_runs[0].conclusion = "cancelled" },
    (response) => { response.test[0].workflow_runs[0].head_sha = "b".repeat(40) },
    (response) => { response.checks[0].check_runs[0].conclusion = "failure" },
    (response) => { response.checks[0].check_runs[0].app.id = 999 },
    (response) => { response.checks[0].check_runs = [] },
  ]) {
    const response = green()
    mutate(response)
    const result = execute(step.run, {}, response)
    assert.notEqual(result.status, 0, result.stdout + result.stderr)
  }
})

test("web and Android reject PR merge-tree evidence associated with the selected feature head", () => {
  for (const step of [stepNamed(web.jobs.build, "Require successful release CI"), stepNamed(load("android-release").jobs["release-android"], "Require successful release CI")]) {
    const response = green()
    for (const name of ["test", "guards"]) response[name][0].workflow_runs[0].event = "pull_request"
    const result = execute(step.run, {}, response)
    assert.notEqual(result.status, 0, "PR head metadata cannot authenticate the merge checkout")
    for (const name of ["test", "guards"]) response[name][0].workflow_runs[0].event = "push"
    assert.equal(execute(step.run, {}, response).status, 0)
  }
})

test("web build refuses a missing selected DSN without using the other environment", () => {
  const step = stepNamed(web.jobs.build, "Validate browser Sentry DSN")
  for (const environment of ["production", "staging"]) {
    const settings = { RELEASE_ENVIRONMENT: environment, PRODUCTION_DSN: "production-dsn", STAGING_DSN: "staging-dsn" }
    assert.equal(execute(step.run, settings).status, 0)
    settings[environment === "production" ? "PRODUCTION_DSN" : "STAGING_DSN"] = ""
    assert.notEqual(execute(step.run, settings).status, 0)
  }
})

test("both production gates require a written override reason", () => {
  for (const job of [web.jobs.admission, web.jobs.production]) {
    const step = stepNamed(job, "Require healthy staging commit")
    assert.notEqual(execute(step.run, { FORCE_UNSTAGED: "true", OVERRIDE_REASON: "" }).status, 0)
    const allowed = execute(step.run, { FORCE_UNSTAGED: "true", OVERRIDE_REASON: "Staging service is unavailable" })
    assert.equal(allowed.status, 0, allowed.stderr)
    assert.match(allowed.summary, /Staging service is unavailable/)
    assert.match(step.run, /web-staging-smoke/)
  }
})

test("staging smoke success is published only after the selected build passes smoke", () => {
  const steps = web.jobs.staging.steps
  const smoke = stepNamed(web.jobs.staging, "Run staging smoke suite")
  assert.equal(smoke.run, "npm --workspace @orbit/web run test:smoke")
  assert.equal(smoke.env.SMOKE_BASE_URL, "${{ steps.health.outputs.deployment_url }}")
  assert.equal(smoke.env.SMOKE_TEST_EMAIL, "${{ secrets.STAGING_SMOKE_TEST_EMAIL }}")
  const record = stepNamed(web.jobs.staging, "Record staging smoke pass")
  assert.ok(steps.indexOf(stepNamed(web.jobs.staging, "Check staging web health")) < steps.indexOf(smoke))
  assert.ok(steps.indexOf(record) > steps.indexOf(smoke))
  assert.equal(smoke["continue-on-error"], undefined)
  assert.equal(record.if, undefined)
  assert.match(record.run, /state=success/)
  assert.match(record.run, /web-staging-smoke/)
  assert.equal(web.jobs.staging.permissions.statuses, "write")
})

// The commit-status fields come from components.schemas.status in GitHub's REST OpenAPI schema.
const smokeStatus = (state, id = 1) => ({
  ...structuredClone(recorded.commitStatus), state, id,
  created_at: `2000-01-01T00:00:0${id}Z`, updated_at: `2000-01-01T00:00:0${id}Z`,
})

test("staging status gates reject absent, stale and failed smoke evidence on both production paths", () => {
  for (const job of [web.jobs.admission, web.jobs.production]) {
    const step = stepNamed(job, "Require healthy staging commit")
    const settings = { FORCE_UNSTAGED: "false", OVERRIDE_REASON: "", STAGING_SERVICE_ID: "fixture-service", RENDER_API_KEY: "fixture-key" }
    for (const statuses of [[], [smokeStatus("failure")], [smokeStatus("pending")], [smokeStatus("success"), smokeStatus("pending", 2)], [smokeStatus("success"), smokeStatus("failure", 2)]]) {
      const response = { statuses: [{ ...recorded.combinedStatus, state: "failure", statuses, sha, total_count: statuses.length }] }
      const rejected = execute(step.run, settings, response)
      assert.notEqual(rejected.status, 0, rejected.stdout + rejected.stderr)
      assert.match(rejected.stdout + rejected.stderr, /web-staging-smoke/)
    }
    const response = { statuses: [{ ...recorded.combinedStatus, state: "success", statuses: [smokeStatus("success")], sha, total_count: 1 }] }
    const accepted = execute(step.run, settings, response)
    assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr)
    assert.notEqual(execute(step.run, settings, { ...response, health: { status: "ok", commit: "b".repeat(40) } }).status, 0)
  }
})

test("Android validates the public DSN with its release settings", () => {
  const job = load("android-release").jobs["release-android"]
  const step = stepNamed(job, "Validate release secrets")
  const environment = Object.fromEntries(Object.keys(step.env).map((name) => [name, "fixture-setting"]))
  environment.EXPO_PUBLIC_SENTRY_DSN = ""
  assert.notEqual(execute(step.run, environment).status, 0)
  environment.EXPO_PUBLIC_SENTRY_DSN = "fixture-dsn"
  assert.equal(execute(step.run, environment).status, 0)
})
