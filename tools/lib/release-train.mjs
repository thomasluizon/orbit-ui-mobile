/**
 * The release train of the delivery driver. One train releases every service that has unreleased work, staging first and
 * then production, in the order API, web, landing, mobile (Android, then iOS). The train state is one file in the driver
 * state directory. Each tick advances the train by at most one dispatch or one check, and a step is written before it is
 * dispatched, so a restart resumes the train and never dispatches a step twice.
 *
 * Every outward read and write goes through `ports`, so a test runs the whole train with no network.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { apiClient, appStoreToken } from "./app-store-connect.mjs"

export const TRAIN_FILE = "release-train.json"
export const CADENCE_MS = 4 * 60 * 60 * 1000
const MINUTE = 60 * 1000
const PLAN_EVERY_MS = 10 * MINUTE
const RUN_FIND_MS = 10 * MINUTE
const RUN_CEILING_MS = 360 * MINUTE
const TESTS_CEILING_MS = 90 * MINUTE
const CLOCK_SKEW_MS = 2 * MINUTE
const VERIFY_ATTEMPTS = 3
const SHA = /^[a-f0-9]{40}$/
const OWNER = "thomasluizon"
const COMPARE_FILE_LIMIT = 300 // GitHub lists at most 300 files of a compare, so a list of this size is incomplete
const MIGRATIONS_PATH = "src/Orbit.Infrastructure/Migrations/"
const WEB_PATHS = [/^apps\/web\//, /^packages\/shared\//]
const MOBILE_PATHS = [/^apps\/mobile\//, /^packages\/shared\//]
/** The text of a release refusal for a missing green Tests or Guards run: `release.yml` and `android-release.yml` of the UI, and `release-admission.mjs` of orbit-api. */
const REFUSAL = /requires a successful \S+\.yml push or workflow_dispatch run|missing or failing checks for|requires successful .+ \((?:test|guards)\.yml\) on [a-f0-9]{40}|No successful check runs for \S+\.yml on/

export const SERVICES = {
  api: { repoKey: "api", repo: "orbit-api", waiter: "api", origins: { staging: "https://api-staging.useorbit.org", production: "https://api.useorbit.org" } },
  web: { repoKey: "ui", repo: "orbit-ui-mobile", waiter: "ui", origins: { staging: "https://orbit-web-staging-eakn.onrender.com", production: "https://orbit-web-3qmv.onrender.com" } },
  landing: { repoKey: "landing", repo: "orbit-landing-page", waiter: "landing", origins: { staging: "https://orbit-landing-staging.onrender.com", production: "https://useorbit.org" } },
  android: { repoKey: "ui", repo: "orbit-ui-mobile", waiter: "ui" },
  ios: { repoKey: "ui", repo: "orbit-ui-mobile", waiter: "ui" },
}
/** The health URL of a service in one environment. The landing page serves its build tag at the root. */
export const healthUrl = (service, environment) => new URL({ api: "/health", web: "/api/health", landing: "/" }[service], SERVICES[service].origins[environment]).href
const slugOf = (service) => `${OWNER}/${SERVICES[service].repo}`
const ENVIRONMENTS = ["staging", "production"]
const TRACKS = { staging: "internal", production: "open" }

const DISPATCH_COMMAND = new RegExp(`^gh workflow run release\\.yml --repo ${OWNER}/(orbit-api|orbit-ui-mobile|orbit-landing-page) --ref main -f environment=(production|staging) -f branch='main' -f sha=([a-f0-9]{40})$`)

/** The empty state: no train, no end time, no plan read. */
const emptyState = () => ({ train: null, lastEndedAt: null, lastPlanAt: null, requested: false })

export const readTrainState = (stateDir) => {
  try {
    const saved = JSON.parse(readFileSync(join(stateDir, TRAIN_FILE), "utf8"))
    return { ...emptyState(), ...saved }
  } catch {
    return emptyState()
  }
}

const writeTrainState = (stateDir, state) => writeFileSync(join(stateDir, TRAIN_FILE), `${JSON.stringify(state)}\n`)

/** The `gh workflow run` arguments of a pinned `dispatchCommand` of `release-plan.mjs`, for the wanted environment. Null when the command has another shape. */
export const dispatchArguments = (command, environment, plannedSha) => {
  const match = DISPATCH_COMMAND.exec(command ?? "")
  if (!match || match[3] !== plannedSha) return null
  return ["workflow", "run", "release.yml", "--repo", `${OWNER}/${match[1]}`, "--ref", "main", "-f", `environment=${environment}`, "-f", "branch=main", "-f", `sha=${plannedSha}`]
}

const done = (step) => ["verified", "skipped", "held"].includes(step.state)

/** The next action of a train: the first step that is not done. An iOS step dispatches while its Android partner builds, but only while a resolved Android run is live (the step is dispatched and has a run). */
export const nextAction = (train) => {
  for (let index = 0; index < train.steps.length; index++) {
    const step = train.steps[index]
    if (done(step)) continue
    if (step.state === "pending") return { type: "dispatch", step }
    const partner = train.steps[index + 1]
    if (step.kind === "android" && step.state === "dispatched" && step.runId !== null && partner?.kind === "ios" && partner.state === "pending") return { type: "dispatch", step: partner }
    return { type: "check", step }
  }
  return null
}

const releaseSteps = (service, plan) => ENVIRONMENTS.map((environment) => ({
  id: `${service}-${environment}`, service, environment, kind: "release", plannedSha: plan.plannedSha, command: plan.dispatchCommand,
  state: "pending", reason: null, group: null, noted: false, dispatchedAt: null, mainSha: null, runId: null, url: null, checks: 0, retried: false, tests: null, previousRunId: null,
}))

const mobileSteps = (plan) => ENVIRONMENTS.flatMap((environment) => ["android", "ios"].map((service) => ({
  id: `${service}-${environment}`, service, environment, kind: service, plannedSha: plan.plannedSha, command: null,
  state: "pending", reason: null, group: service === "ios" ? "ios" : null, noted: false, dispatchedAt: null, mainSha: null, runId: null, url: null, checks: 0, retried: false, tests: null, previousRunId: null,
})))

const touches = (files, patterns) => files.some((file) => patterns.some((pattern) => pattern.test(file)))

/** The text of the `## Manual steps` section of a pull request body, or an empty string. */
export const manualStepsOf = (body) => {
  const match = /^##\s+Manual steps\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/im.exec(body ?? "")
  return match ? match[1].trim() : ""
}

/** The reason that the API step needs the owner, or null. The driver cannot take a Render export, so a migration always holds. */
const apiHoldReason = async (plan, ports) => {
  if (plan.deployedSha === null) return null
  const files = await ports.changedFiles("api", plan.deployedSha, plan.plannedSha)
  if (files === null) return `the compare of the unreleased API commits lists ${COMPARE_FILE_LIMIT} files or more, so the driver cannot see a migration change`
  if (files.some((file) => file.startsWith(MIGRATIONS_PATH))) {
    if (!(await ports.takeRenderExport?.())) return "the unreleased API commits change a migration and the driver cannot take the fresh Render export"
  }
  const steps = await ports.manualSteps("api", plan.commits ?? [])
  const terraform = steps.find((entry) => entry.text.split("\n").some((line) => /terraform/i.test(line) && !/\b(no|none|not|without|n\/a)\b/i.test(line)))
  if (terraform) return `the unreleased API pull request #${terraform.number} lists a Terraform step under Manual steps`
  return null
}

/** The steps of a new train from the production plan. Each decision of a skipped service has its own log reason. */
const decideSteps = async (plan, ports, notes) => {
  const byName = Object.fromEntries(plan.services.map((service) => [service.name, service]))
  const steps = []
  if (byName.api?.needsRelease) {
    const added = releaseSteps("api", byName.api)
    const reason = await apiHoldReason(byName.api, ports)
    if (reason !== null) for (const step of added) Object.assign(step, { state: "held", group: "api", reason })
    steps.push(...added)
  } else notes.push("api: nothing to release")
  if (byName.web?.needsRelease) {
    const files = byName.web.deployedSha === null ? null : await ports.changedFiles("ui", byName.web.deployedSha, byName.web.plannedSha)
    if (files === null || touches(files, WEB_PATHS)) steps.push(...releaseSteps("web", byName.web))
    else notes.push("web: no apps/web or packages/shared file changed")
  } else notes.push("web: nothing to release")
  if (byName.landing?.needsRelease) steps.push(...releaseSteps("landing", byName.landing))
  else notes.push("landing: nothing to release")
  if (byName.android?.needsRelease) {
    const files = byName.android.deployedSha === null ? null : await ports.changedFiles("ui", byName.android.deployedSha, byName.android.plannedSha)
    if (files === null || touches(files, MOBILE_PATHS)) steps.push(...mobileSteps(byName.android))
    else notes.push("mobile: no apps/mobile or packages/shared file changed")
  } else notes.push("mobile: nothing to release")
  return steps
}

const plannedShas = (steps) => Object.fromEntries(steps.filter((step) => step.state !== "skipped").map((step) => [step.service === "ios" ? "android" : step.service, step.plannedSha]))

const iso = (ms) => new Date(ms).toISOString()

/** One `release` log line for a step: service, environment, planned SHA, run link and result. */
const stepLine = (ctx, step, result) => ctx.log(`${iso(ctx.now())} release ${step.service} ${step.environment} ${step.plannedSha ?? "-"} ${step.url ?? "-"} ${result}`)

const save = (ctx, state) => { if (!ctx.dryRun) writeTrainState(ctx.stateDir, state) }

const stopTrain = (ctx, state, step, error) => {
  const train = state.train
  step.state = "failed"
  step.reason = error
  train.status = "stopped"
  train.endedAt = ctx.now()
  train.stoppedAt = step.id
  train.planned = plannedShas(train.steps)
  state.lastEndedAt = ctx.now()
  stepLine(ctx, step, `failed: ${error}`)
  save(ctx, state)
}

const endTrain = (ctx, state) => {
  state.train.status = "complete"
  state.train.endedAt = ctx.now()
  state.train.planned = plannedShas(state.train.steps)
  state.lastEndedAt = ctx.now()
  ctx.log(`${iso(ctx.now())} release train ${state.train.id} complete: ${state.train.steps.map((step) => `${step.id} ${step.state}`).join(", ")}`)
  save(ctx, state)
}

/** Files the tickets that a held step or a stopped train owes, once each. A dry run files nothing. */
const fileOwed = async (ctx, state) => {
  if (ctx.dryRun) return
  const train = state.train
  for (const step of train.steps) {
    if (step.state !== "held" || step.noted) continue
    const sibling = train.steps.find((other) => other !== step && other.group === step.group && other.ticket !== undefined)
    const where = step.group === "api" ? "API" : "iOS"
    step.noted = true
    step.ticket = sibling ? sibling.ticket : await ctx.tickets.hold({ title: `Release train holds the ${where} step`, repoKey: SERVICES[step.service].repoKey, reason: `The release train holds the ${where} step (${step.id}): ${step.reason}.` })
    stepLine(ctx, step, `held: ${step.reason}`)
    save(ctx, state)
  }
  if (train.status === "stopped" && train.bug === null) {
    const step = train.steps.find((entry) => entry.id === train.stoppedAt)
    const body = `The release train ${train.id} stopped at ${step.service} ${step.environment}.\n\nStep: ${step.id}\nPlanned SHA: ${step.plannedSha ?? "none"}\nRun: ${step.url ?? "no run"}\nError: ${step.reason}\n\nLater services did not start. The next train runs after a later merge.`
    train.bug = await ctx.tickets.bug({ title: `Release train stopped at ${step.service} ${step.environment}: ${String(step.reason).slice(0, 80)}`, body, repoKey: SERVICES[step.service].repoKey })
    save(ctx, state)
  }
}

const dispatchRelease = async (ctx, state, step) => {
  const args = dispatchArguments(step.command, step.environment, step.plannedSha)
  if (args === null) return stopTrain(ctx, state, step, "the pinned dispatch command has an unexpected shape")
  await dispatchWith(ctx, state, step, args, SERVICES[step.service].repoKey)
}

/** Writes the step as dispatching before the dispatch, so a restart never dispatches it twice. */
const dispatchWith = async (ctx, state, step, args, repoKey) => {
  try {
    step.mainSha = await ctx.ports.mainHead(repoKey)
  } catch (error) { return stopTrain(ctx, state, step, `main head unreadable: ${error.message}`) }
  step.dispatchedAt = ctx.now()
  step.state = "dispatching"
  save(ctx, state)
  try {
    await ctx.ports.dispatch(args)
  } catch (error) { return stopTrain(ctx, state, step, `dispatch failed: ${error.message}`) }
  step.state = "dispatched"
  save(ctx, state)
  stepLine(ctx, step, "dispatched")
}

/** The shared version and the two Android codes of the train, read when the first mobile step dispatches. */
const prepareMobile = async (ctx, state) => {
  const { ports } = ctx
  const [production, staging] = await Promise.all([ports.mobilePlan("production"), ports.mobilePlan("staging")])
  const newer = [production.nextVersion, staging.nextVersion].filter(Boolean).sort((left, right) => {
    const a = left.split(".").map(Number), b = right.split(".").map(Number)
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
  }).at(-1)
  if (!newer) throw new Error("the mobile version plan has no nextVersion")
  const newest = await ports.newestAndroidCode()
  state.train.mobile = { appVersion: newer, sha: await ports.mainHead("ui"), stagingCode: newest + 1, productionCode: newest + 2 }
}

const dispatchAndroid = async (ctx, state, step) => {
  const train = state.train
  if (train.mobile === null) {
    try { await prepareMobile(ctx, state) } catch (error) { return stopTrain(ctx, state, step, `mobile version unreadable: ${error.message}`) }
    save(ctx, state)
  }
  const head = await ctx.ports.mainHead("ui").catch(() => null)
  if (head !== train.mobile.sha) return skipMobile(ctx, state, step, `main moved from ${train.mobile.sha} to ${head}`)
  const code = step.environment === "staging" ? train.mobile.stagingCode : train.mobile.productionCode
  step.plannedSha = train.mobile.sha
  step.version = train.mobile.appVersion
  step.code = code
  await dispatchWith(ctx, state, step, ["workflow", "run", "android-release.yml", "--repo", slugOf("android"), "--ref", "main", "-f", `app_version=${train.mobile.appVersion}`, "-f", `android_version_code=${code}`, "-f", `track=${TRACKS[step.environment]}`, "-f", `message=release train ${train.id}`], "ui")
}

/** A mobile step that cannot ship at the train commit ends with the later mobile steps skipped and no ticket: the next train carries them. */
const skipMobile = (ctx, state, step, reason) => {
  for (const entry of state.train.steps) {
    if (!["android", "ios"].includes(entry.kind) || done(entry)) continue
    entry.state = "skipped"
    entry.reason = reason
    stepLine(ctx, entry, `skipped: ${reason}`)
  }
  save(ctx, state)
}

const dispatchIos = async (ctx, state, step) => {
  const train = state.train
  const head = await ctx.ports.mainHead("ui").catch(() => null)
  if (head !== train.mobile.sha) return stopTrain(ctx, state, step, `main moved from ${train.mobile.sha} to ${head} between the Android and the iOS dispatch`)
  let build
  try {
    build = await ctx.ports.iosBuildNumber(step.environment)
  } catch (error) {
    if (error.code !== "NO_CREDENTIALS") return stopTrain(ctx, state, step, `iOS build number unreadable: ${error.message}`)
    for (const entry of train.steps) if (entry.group === "ios" && !done(entry)) Object.assign(entry, { state: "held", reason: error.message })
    return save(ctx, state)
  }
  step.plannedSha = train.mobile.sha
  step.version = train.mobile.appVersion
  step.build = build
  await dispatchWith(ctx, state, step, ["workflow", "run", "ios-release.yml", "--repo", slugOf("ios"), "--ref", "main", "-f", `variant=${step.environment}`, "-f", `app_version=${train.mobile.appVersion}`, "-f", `build_number=${build}`], "ui")
}

const dispatchStep = async (ctx, state, step) => {
  if (step.kind === "release") return dispatchRelease(ctx, state, step)
  if (step.kind === "android") return dispatchAndroid(ctx, state, step)
  return dispatchIos(ctx, state, step)
}

const WORKFLOW_FILES = { release: "release.yml", android: "android-release.yml", ios: "ios-release.yml" }

/** The one new run of a dispatched step, null while it is not listed yet, or an error text. */
const resolveRun = async (ctx, step) => {
  const runs = await ctx.ports.listRuns(SERVICES[step.service].repoKey, WORKFLOW_FILES[step.kind])
  const title = step.kind === "android" ? `Android Release ${step.version} (${step.code}) to ${TRACKS[step.environment]} on ` : null
  const matches = runs.filter((run) => run.event === "workflow_dispatch" && run.headBranch === "main" && run.headSha === step.mainSha &&
    Date.parse(run.createdAt) >= step.dispatchedAt - CLOCK_SKEW_MS && run.databaseId !== step.previousRunId &&
    (title === null || run.displayTitle?.startsWith(title)))
  if (matches.length === 1) return { run: matches[0] }
  if (matches.length > 1) return { error: `${matches.length} new runs match the dispatch, so no run is unique` }
  return ctx.now() - step.dispatchedAt > RUN_FIND_MS ? { error: "no unique new run appeared for the dispatch" } : { run: null }
}

const startTests = async (ctx, state, step) => {
  const sha = step.plannedSha
  const head = await ctx.ports.mainHead(SERVICES[step.service].repoKey).catch(() => null)
  if (head !== sha) return stopTrain(ctx, state, step, `the release was refused for a missing green Tests or Guards run, and main moved from ${sha} to ${head}`)
  try {
    for (const workflow of ["test.yml", "guards.yml"]) await ctx.ports.dispatch(["workflow", "run", workflow, "--repo", slugOf(step.service), "--ref", "main"])
  } catch (error) { return stopTrain(ctx, state, step, `the Tests and Guards dispatch failed: ${error.message}`) }
  step.state = "testing"
  step.previousRunId = step.runId
  step.runId = null
  step.tests = { dispatchedAt: ctx.now() }
  step.retried = true
  save(ctx, state)
  stepLine(ctx, step, "refused for a missing green Tests or Guards run: dispatched test.yml and guards.yml")
}

const checkTests = async (ctx, state, step) => {
  const repoKey = SERVICES[step.service].repoKey
  const newest = async (workflow) => (await ctx.ports.listRuns(repoKey, workflow))
    .filter((run) => run.headSha === step.plannedSha && Date.parse(run.createdAt) >= step.tests.dispatchedAt - CLOCK_SKEW_MS)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
  const runs = [await newest("test.yml"), await newest("guards.yml")]
  if (runs.some((run) => run?.status === "completed" && run.conclusion !== "success")) return stopTrain(ctx, state, step, "the Tests or Guards run at the planned SHA failed")
  if (runs.every((run) => run?.status === "completed")) {
    step.url = null
    step.state = "pending"
    save(ctx, state)
    return stepLine(ctx, step, "Tests and Guards are green: the release dispatches again")
  }
  if (ctx.now() - step.tests.dispatchedAt > TESTS_CEILING_MS) stopTrain(ctx, state, step, "the Tests and Guards runs did not finish in 90 minutes")
}

const verifyExtra = async (ctx, step) => {
  if (step.service === "landing") return (await ctx.ports.landingDeployed(step.plannedSha, step.environment)) ? null : "no successful GitHub Deployment exists for the planned SHA"
  return null
}

const checkStep = async (ctx, state, step) => {
  const { ports } = ctx
  if (step.state === "testing") return checkTests(ctx, state, step)
  const repoKey = SERVICES[step.service].repoKey
  if (step.runId === null) {
    const resolved = await resolveRun(ctx, step)
    if (resolved.error) return stopTrain(ctx, state, step, resolved.error)
    if (resolved.run === null) return
    step.runId = resolved.run.databaseId
    step.url = resolved.run.url
    save(ctx, state)
    stepLine(ctx, step, "run found")
  }
  const run = await ports.runStatus(repoKey, step.runId)
  if (run.status !== "completed") {
    if (ctx.now() - step.dispatchedAt > RUN_CEILING_MS) stopTrain(ctx, state, step, "the run did not finish before the wait ceiling of 360 minutes")
    return
  }
  step.url = run.url
  if (step.kind === "ios") {
    if (run.conclusion !== "success") return stopTrain(ctx, state, step, `the run ended as ${run.conclusion}`)
    step.state = "verified"
    save(ctx, state)
    return stepLine(ctx, step, "verified")
  }
  if (step.environment === "staging" && step.kind === "release") await ports.wake([healthUrl(step.service, "staging")])
  const waited = await ports.waitRelease(step.kind === "android"
    ? { repo: "ui", workflow: "android", run: step.runId, sha: step.plannedSha, workflowSha: step.plannedSha }
    : { repo: SERVICES[step.service].waiter, workflow: "release", run: step.runId, sha: step.plannedSha, workflowSha: step.mainSha, serviceUrl: SERVICES[step.service].origins[step.environment] })
  if (waited.code === 3 || (waited.code === 1 && waited.result?.reason === "READ_ERROR" && run.conclusion === "success")) {
    step.checks += 1
    save(ctx, state)
    if (step.checks >= VERIFY_ATTEMPTS) return stopTrain(ctx, state, step, `the verification did not settle after ${VERIFY_ATTEMPTS} checks: ${waited.result?.error ?? waited.result?.reason ?? "ceiling"}`)
    return stepLine(ctx, step, `verification not settled (${step.checks} of ${VERIFY_ATTEMPTS})`)
  }
  if (waited.code !== 0) {
    if (run.conclusion !== "success" && !step.retried && await ports.failedLog(repoKey, step.runId).then((text) => REFUSAL.test(text)).catch(() => false)) return startTests(ctx, state, step)
    return stopTrain(ctx, state, step, `${waited.result?.reason ?? "FAILED"}: ${waited.result?.error ?? `the run ended as ${run.conclusion}`}`)
  }
  const extra = await verifyExtra(ctx, step).catch((error) => error.message)
  if (extra !== null) return stopTrain(ctx, state, step, extra)
  step.state = "verified"
  save(ctx, state)
  stepLine(ctx, step, "verified")
}

const startTrain = async (ctx, state, forced) => {
  const { ports } = ctx
  state.lastPlanAt = ctx.now()
  save(ctx, state)
  await ports.wake(["api", "web", "landing"].map((service) => healthUrl(service, "staging")))
  const plan = await ports.plan()
  const unreadable = plan.services.filter((service) => service.baselineError)
  if (unreadable.length > 0) return ctx.log(`${iso(ctx.now())} release plan unreadable: ${unreadable.map((service) => `${service.name} ${service.baselineError}`).join("; ")}`)
  const notes = []
  const steps = await decideSteps(plan, ports, notes)
  if (steps.length === 0) {
    state.requested = false
    save(ctx, state)
    return ctx.log(`${iso(ctx.now())} release train idle: ${notes.join("; ")}`)
  }
  const previous = state.train
  if (previous?.status === "stopped" && !forced) {
    const wanted = plannedShas(steps)
    if (Object.entries(wanted).every(([service, sha]) => previous.planned?.[service] === sha)) {
      return ctx.log(`${iso(ctx.now())} release train waits: the train ${previous.id} stopped at ${previous.stoppedAt} and no later merge changed a planned commit`)
    }
  }
  state.requested = false
  state.train = { id: iso(ctx.now()), status: "running", startedAt: ctx.now(), endedAt: null, steps, mobile: null, bug: null, stoppedAt: null, planned: null }
  save(ctx, state)
  ctx.log(`${iso(ctx.now())} release train ${state.train.id} start: ${steps.map((step) => `${step.id} ${step.state === "held" ? "held" : step.plannedSha.slice(0, 9)}`).join(", ")}${notes.length > 0 ? ` (${notes.join("; ")})` : ""}`)
  if (ctx.dryRun) for (const step of steps) stepLine(ctx, step, step.state === "held" ? `would hold: ${step.reason}` : "would dispatch")
  else await advanceTrain(ctx, state)
}

const advanceTrain = async (ctx, state) => {
  const train = state.train
  await fileOwed(ctx, state)
  if (train.status === "stopped") return
  const action = nextAction(train)
  if (action === null) return endTrain(ctx, state)
  if (ctx.dryRun) return stepLine(ctx, action.step, `${action.type === "dispatch" ? "would dispatch" : "would check"} (${action.step.state})`)
  if (action.type === "dispatch") await dispatchStep(ctx, state, action.step)
  else await checkStep(ctx, state, action.step)
  await fileOwed(ctx, state)
}

/**
 * One tick of the train. `ctx`: `ports`, `stateDir`, `now()`, `dryRun`, `log(line)` and `tickets` (`hold`, `bug`).
 * A running train advances by one action. With none running, a new train starts when the cadence allows it and the plan
 * has a release to make. A dry run reads and prints, and writes and dispatches nothing.
 */
export const releaseTick = async (ctx) => {
  const state = readTrainState(ctx.stateDir)
  if (state.train?.status === "running" || (state.train?.status === "stopped" && state.train.bug === null)) return advanceTrain(ctx, state)
  const forced = state.requested === true
  if (!forced && state.lastEndedAt !== null && ctx.now() - state.lastEndedAt < CADENCE_MS) {
    // Only a dry run prints this, so the loop writes no idle line each tick.
    return ctx.dryRun && ctx.log(`${iso(ctx.now())} release train idle: the previous train ended at ${iso(state.lastEndedAt)}, the next starts after ${iso(state.lastEndedAt + CADENCE_MS)}`)
  }
  if (!forced && !ctx.dryRun && state.lastPlanAt !== null && ctx.now() - state.lastPlanAt < PLAN_EVERY_MS) return
  return startTrain(ctx, state, forced)
}

/**
 * `/release`: asks the driver to start a train on its next tick, whatever the cadence and the last stop. Returns the summary
 * of a train that already runs, or null after it wrote the request.
 */
export const requestTrain = (stateDir) => {
  const state = readTrainState(stateDir)
  if (state.train?.status === "running" || (state.train?.status === "stopped" && state.train.bug === null)) return trainSummary(stateDir)
  writeTrainState(stateDir, { ...state, requested: true })
  return null
}

/** One line for `/driver`: the newest train, what it released and where it stopped. */
export const trainSummary = (stateDir) => {
  const { train } = readTrainState(stateDir)
  if (train === null) return "no release train yet"
  return `train ${train.id} ${train.status}${train.stoppedAt ? ` at ${train.stoppedAt}` : ""}: ${train.steps.map((step) => `${step.id} ${step.state}`).join(", ")}`
}

/**
 * The next iOS build number of a variant: the highest build of its app in App Store Connect plus one. The credentials are the
 * three variables that `testflight-access.mjs` reads. Without them the error has the code NO_CREDENTIALS.
 */
export const appStoreBuildNumber = async ({ variant, environment, readVariable, client = null }) => {
  const keyId = environment.APP_STORE_CONNECT_API_KEY_ID
  const issuerId = environment.APP_STORE_CONNECT_API_ISSUER_ID
  const privateKey = environment.APP_STORE_CONNECT_API_PRIVATE_KEY
  if (!keyId || !issuerId || !privateKey) throw Object.assign(new Error("the App Store Connect credentials are not in the driver environment"), { code: "NO_CREDENTIALS" })
  const appId = (await readVariable(variant)).trim()
  if (!/^\d+$/.test(appId)) throw new Error(`ORBIT_IOS_APP_STORE_ID of ios-${variant} is not a numeric App Store id`)
  const api = client ?? apiClient(() => appStoreToken({ keyId, issuerId, privateKey }))
  const builds = await api.getAll("/v1/builds", { "filter[app]": appId, "filter[preReleaseVersion.platform]": "IOS", limit: "200" })
  const numbers = builds.map((build) => Number(build.attributes?.version)).filter((number) => Number.isInteger(number) && number > 0)
  return Math.max(0, ...numbers) + 1
}

/** Reads one JSON document from a child process. */
const parseJson = (what, text) => {
  try { return JSON.parse(text) } catch (error) { throw new Error(`${what} returned invalid JSON: ${error.message}`) }
}

/**
 * The real ports. `run(file, args, options)` is `runBounded`; `toolsDirectory` holds `release-plan.mjs` and `wait-release.mjs`;
 * `appStore(variant)` returns the next iOS build number, or throws an error with code NO_CREDENTIALS. It defaults to App Store Connect.
 */
export const realPorts = ({ run, toolsDirectory, environment = process.env, appStore = null, fetchText = (url) => fetch(url, { signal: AbortSignal.timeout(30_000) }).then((response) => response.text()) }) => {
  const gh = async (args, options = {}) => {
    const result = await run("gh", args, { timeoutMs: 120 * 1000, maxBuffer: 16 * 1024 * 1024, ...options })
    if (result.status !== 0) throw new Error(`gh ${args.slice(0, 3).join(" ")} failed: ${(result.stderr || result.error?.message || "").trim().slice(0, 300)}`)
    return result.stdout
  }
  const node = (file, args, options = {}) => run(process.execPath, [join(toolsDirectory, file), ...args], { timeoutMs: 120 * 1000, maxBuffer: 16 * 1024 * 1024, env: environment, ...options })
  const repoOf = (key) => `${OWNER}/${{ ui: "orbit-ui-mobile", api: "orbit-api", landing: "orbit-landing-page" }[key]}`
  const ports = {
    plan: async () => {
      const result = await node("release-plan.mjs", [])
      let plan = null
      try { plan = JSON.parse(result.stdout) } catch { /* the error below names the exit */ }
      if (plan === null) throw new Error(`release-plan.mjs gave no plan (exit ${result.status}): ${(result.stderr || "").trim().slice(0, 300)}`)
      return plan
    },
    wake: async (urls) => { await Promise.all(urls.map((url) => fetchText(url).catch(() => null))) },
    mainHead: async (key) => (await gh(["api", `repos/${repoOf(key)}/commits/main`, "--jq", ".sha"])).trim(),
    changedFiles: async (service, base, head) => {
      const key = SERVICES[service]?.repoKey ?? service
      // The compare endpoint returns `files` on the first page only, up to 300 entries, so one request reads them all.
      const names = parseJson("gh api compare", await gh(["api", `repos/${repoOf(key)}/compare/${base}...${head}`, "--jq", "[.files[]?.filename]"]))
      return names.length >= COMPARE_FILE_LIMIT ? null : names
    },
    manualSteps: async (service, commits) => {
      const numbers = [...new Set(commits.flatMap((commit) => { const match = /\(#(\d+)\)\s*$/.exec(commit.message); return match ? [Number(match[1])] : [] }))]
      const found = []
      for (const number of numbers) {
        const body = parseJson("gh api pull", await gh(["api", `repos/${repoOf(SERVICES[service].repoKey)}/pulls/${number}`, "--jq", "{body}"])).body
        found.push({ number, text: manualStepsOf(body) })
      }
      return found
    },
    dispatch: async (args) => { await gh(args) },
    listRuns: async (key, workflow) => parseJson("gh run list", await gh(["run", "list", "--repo", repoOf(key), "--workflow", workflow, "--limit", "30", "--json", "databaseId,headSha,createdAt,event,status,conclusion,url,displayTitle,headBranch"])),
    runStatus: async (key, runId) => parseJson("gh api run", await gh(["api", `repos/${repoOf(key)}/actions/runs/${runId}`, "--jq", "{status,conclusion,url:.html_url,headSha:.head_sha}"])),
    failedLog: async (key, runId) => (await gh(["run", "view", String(runId), "--repo", repoOf(key), "--log-failed"])).slice(-20000),
    waitRelease: async ({ repo, workflow, run: runId, sha, workflowSha, serviceUrl }) => {
      const args = ["--repo", repo, "--run", String(runId), "--sha", sha, "--workflow-sha", workflowSha, "--workflow", workflow, "--ceiling-minutes", "0.5", "--poll-seconds", "5", ...(serviceUrl ? ["--service-url", serviceUrl] : [])]
      const result = await node("wait-release.mjs", args, { timeoutMs: 90 * 1000 })
      let parsed = null
      try { parsed = JSON.parse(result.stdout.trim().split("\n").at(-1)) } catch { /* no JSON means the exit code alone decides */ }
      return { code: result.status ?? 1, result: parsed }
    },
    landingDeployed: async (sha, deploymentEnvironment) => {
      const deployments = parseJson("gh api deployments", await gh(["api", `repos/${repoOf("landing")}/deployments?sha=${sha}&environment=${deploymentEnvironment}&per_page=100`, "--jq", "[.[].id]"]))
      for (const id of deployments) {
        const latest = parseJson("gh api statuses", await gh(["api", `repos/${repoOf("landing")}/deployments/${id}/statuses?per_page=1`, "--jq", "[.[].state]"]))[0]
        if (latest === "success") return true
      }
      return false
    },
    mobilePlan: async (planEnvironment) => {
      const result = await run(process.execPath, [join(toolsDirectory, "..", "apps", "mobile", "scripts", "mobile-version-pair.js"), "plan", "--environment", planEnvironment], { timeoutMs: 120 * 1000, env: { ...environment, GITHUB_REPOSITORY: repoOf("ui") } })
      if (result.status !== 0) throw new Error(`mobile-version-pair.js plan failed: ${(result.stderr || "").trim().slice(0, 300)}`)
      return parseJson("mobile-version-pair.js plan", result.stdout)
    },
    newestAndroidCode: async () => {
      const runs = await ports.listRuns("ui", "android-release.yml")
      const codes = runs.flatMap((entry) => { const match = /^Android Release \S+ \((\d+)\) to /.exec(entry.displayTitle ?? ""); return match ? [Number(match[1])] : [] })
      if (codes.length === 0) throw new Error("no Android Release run title names a version code")
      return Math.max(...codes)
    },
    iosBuildNumber: async (variant) => (appStore ?? ((name) => appStoreBuildNumber({
      variant: name, environment,
      readVariable: async (variantName) => gh(["api", `repos/${repoOf("ui")}/environments/ios-${variantName}/variables/ORBIT_IOS_APP_STORE_ID`, "--jq", ".value"])
        .catch(() => gh(["api", `repos/${repoOf("ui")}/actions/variables/ORBIT_IOS_APP_STORE_ID`, "--jq", ".value"])),
    })))(variant),
  }
  return ports
}
