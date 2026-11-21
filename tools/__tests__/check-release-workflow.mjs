import { load } from "js-yaml"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
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
const gateFixture = JSON.parse(readFileSync(toolPath("__tests__/fixtures/gate-github-responses.json"), "utf8"))

function checkSourceIdentity() {
  // A fresh repository for each call: release-plan.mjs runs these cases a second time in the same fixture root.
  const directory = mkdtempSync(join(root, "release-source-"))
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
    env: { ...environment, SOURCE_SHA: planned, GITHUB_OUTPUT: output } })
  const wrongCheckout = resolve()
  T("source rejects the advanced branch checkout", wrongCheckout.status === 1 && wrongCheckout.stdout.includes("Checkout does not match"), wrongCheckout.stderr)
  git("checkout", "-q", "--detach", planned)
  const pinned = resolve()
  T("source accepts the checkout of the selected SHA", pinned.status === 0 && readFileSync(output, "utf8").includes(`sha=${planned}`), pinned.stderr)
  const onBranch = (sha) => spawnSync(BASH, ["-c", stepScript("Require the selected SHA on the source branch")], { cwd: directory, encoding: "utf8",
    env: { ...environment, SOURCE_SHA: sha, SOURCE_BRANCH: "main" } })
  const ancestor = onBranch(planned)
  T("selection accepts the planned ancestor after the branch advances", ancestor.status === 0, ancestor.stdout + ancestor.stderr)
  git("update-ref", "refs/remotes/origin/main", planned)
  const outside = onBranch(advanced)
  T("selection rejects a commit outside the selected branch", outside.status === 1 && outside.stdout.includes("not reachable"), outside.stderr)
}

function checkPinnedRelease() {
  const parsed = load(workflow)
  const checkout = parsed.jobs.build.steps.find((step) => step.uses?.startsWith("actions/checkout@"))
  T("build checks out the selected SHA", parsed.jobs.build.needs === "select" &&
    parsed.jobs.select.outputs.sha === "${{ steps.selection.outputs.sha }}" && checkout.with.ref === "${{ needs.select.outputs.sha }}")
  T("source resolution verifies checkout identity", stepScript("Resolve source").includes('"$sha" != "$SOURCE_SHA"'))
  // The ancestry refusal must run before every job that builds, admits or publishes, so it lives in select, which they all need.
  const ancestry = 'git merge-base --is-ancestor "$SOURCE_SHA" "refs/remotes/origin/$SOURCE_BRANCH"'
  const selectSteps = parsed.jobs.select.steps
  const selectCheckout = selectSteps.findIndex((step) => step.uses?.startsWith("actions/checkout@"))
  const refusal = selectSteps.findIndex((step) => step.run?.includes(ancestry))
  T("select refuses a SHA off the source branch after a full-history checkout", selectCheckout >= 0 && refusal > selectCheckout &&
    selectSteps[selectCheckout].with?.["fetch-depth"] === 0 && selectSteps[refusal].env?.SOURCE_SHA === "${{ steps.selection.outputs.sha }}" &&
    selectSteps[refusal].env?.SOURCE_BRANCH === "${{ inputs.branch }}")
  const ownersOfAncestry = Object.entries(parsed.jobs).filter(([, job]) => (job.steps ?? []).some((step) => step.run?.includes(ancestry))).map(([id]) => id)
  T("only select owns the branch ancestry refusal", JSON.stringify(ownersOfAncestry) === JSON.stringify(["select"]), ownersOfAncestry.join(", "))
  const needsOf = (job) => [job.needs ?? []].flat()
  const dependsOnSelect = (id, seen = new Set()) => id === "select" ||
    (!seen.has(id) && (seen.add(id), needsOf(parsed.jobs[id]).some((need) => dependsOnSelect(need, seen))))
  const publishers = Object.keys(parsed.jobs).filter((id) => id !== "select")
  T("every job that builds, admits or publishes waits for the selection", publishers.length > 0 && publishers.every((id) => dependsOnSelect(id)),
    publishers.filter((id) => !dependsOnSelect(id)).join(", "))
  T("the desktop shell publish waits for the selection directly", needsOf(parsed.jobs["desktop-release"]).includes("select"))
  const admission = parsed.jobs.admission.steps.find((step) => step.name === "Require healthy staging commit")
  T("production admits staging before deploying", !!admission && parsed.jobs.production.needs.includes("admission") &&
    !parsed.jobs.production.steps.some((step) => step.name === "Require healthy staging commit"))
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
  checkPinnedRelease()
  checkSourceIdentity()
}
