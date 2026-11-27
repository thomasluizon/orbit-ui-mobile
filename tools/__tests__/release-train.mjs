/** Table tests of the release train: a simulated GitHub, the exact dispatches and the saved state. No network. */

import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import { appStoreBuildNumber, CADENCE_MS, dispatchArguments, healthUrl, manualStepsOf, mobileMergeHold, nextAction, readTrainState, realPorts, releaseTick, requestTrain, trainSummary, TRAIN_FILE } from "../lib/release-train.mjs"
import { T, root, same } from "./_harness.mjs"

const FIXTURE = JSON.parse(readFileSync(new URL("./release-train-fixture.json", import.meta.url), "utf8"))
const START = Date.parse("2026-11-25T12:00:00Z")
const TICK = 2 * 60 * 1000
const HOUR = 60 * 60 * 1000
const sha = (letter) => letter.repeat(40)
const OLD = { api: sha("1"), web: sha("2"), landing: sha("3"), android: sha("4") }
const NEW = { api: sha("a"), web: sha("b"), landing: sha("c"), android: sha("d") }
const REPOS = { api: "orbit-api", web: "orbit-ui-mobile", landing: "orbit-landing-page", android: "orbit-ui-mobile" }

const planEntry = (name, { needs = true, commits = [{ sha: NEW[name], message: `change ${name} (#${name.length})` }], deployed = OLD[name], planned = NEW[name] } = {}) => ({
  name, repo: REPOS[name], branch: "main", headSha: planned, deployedSha: deployed, commits, needsRelease: needs, plannedSha: planned,
  ...(name === "android" ? { track: "open" } : { dispatchCommand: `gh workflow run release.yml --repo thomasluizon/${REPOS[name]} --ref main -f environment=production -f branch='main' -f sha=${planned}` }),
})
const planOf = (overrides = {}) => ({ environment: "production", branch: "main", services: ["api", "web", "landing", "android"].map((name) => planEntry(name, overrides[name] ?? {})) })

let sequence = 0

/** A simulated world. A dispatch makes one completed run; `outcomes` overrides the answer for one step key `<workflow>:<field>`. */
const world = ({ plan = planOf(), files = {}, manual = {}, outcomes = {}, noCredentials = false, codes = 700, builds = { staging: 41, production: 8 }, landingDeployed = true, mainMoves = {} } = {}) => {
  const stateDir = join(root, `release-train-${++sequence}`)
  mkdirSync(stateDir, { recursive: true })
  const events = []
  const tickets = { bugs: [], holds: [] }
  const main = { api: NEW.api, ui: NEW.web, landing: NEW.landing }
  const runs = new Map()
  let counter = 5000
  const clock = { now: START }
  const makePorts = () => ({
    plan: async () => { events.push("plan"); return structuredClone(plan) },
    wake: async (urls) => { events.push(`wake ${urls.length}`) },
    mainHead: async (key) => main[key],
    changedFiles: async (service, base, head) => files[service] === undefined ? ["apps/web/a.ts", "apps/mobile/b.ts", "src/Orbit.Api/c.cs"] : files[service],
    manualSteps: async (service) => manual[service] ?? [],
    dispatch: async (args) => {
      events.push(`dispatch ${args.slice(2).join(" ")}`)
      const workflow = args[2]
      const key = args.includes("orbit-api") || args.some((item) => item.endsWith("/orbit-api")) ? "api" : args.some((item) => item.endsWith("/orbit-landing-page")) ? "landing" : "ui"
      const value = (name) => args.find((item) => item.startsWith(`${name}=`))?.split("=")[1]
      const title = workflow === "android-release.yml" ? `Android Release ${value("app_version")} (${value("android_version_code")}) to ${value("track")} on main` : `${workflow} ${value("environment") ?? value("variant") ?? ""}`
      const run = { ...FIXTURE.run, databaseId: ++counter, headSha: main[key], createdAt: new Date(clock.now).toISOString(), url: `https://github.com/run/${counter}`, displayTitle: title }
      const list = runs.get(`${key}:${workflow}`) ?? []
      list.push(run)
      runs.set(`${key}:${workflow}`, list)
      if (mainMoves[workflow]) main[key] = sha("f")
    },
    listRuns: async (key, workflow) => structuredClone(runs.get(`${key}:${workflow}`) ?? (workflow === "android-release.yml" ? [{ ...FIXTURE.run, headSha: OLD.android, createdAt: "2026-11-01T00:00:00Z", displayTitle: `Android Release 1.4.0 (${codes}) to open on main` }] : [])),
    runStatus: async (key, runId) => {
      const run = [...runs.values()].flat().find((entry) => entry.databaseId === runId)
      return { status: run.status, conclusion: run.conclusion, url: run.url, headSha: run.headSha }
    },
    failedLog: async () => outcomes.failedLog ?? "step failed",
    waitRelease: async (options) => {
      events.push(`verify ${options.repo} ${options.workflow} ${options.serviceUrl ?? ""}`.trim())
      const run = [...runs.values()].flat().find((entry) => entry.databaseId === options.run)
      const answer = outcomes.wait?.(options, run)
      return answer ?? { code: 0, result: { reason: "SUCCESS", url: run.url } }
    },
    landingDeployed: async () => landingDeployed,
    mobilePlan: async (environment) => ({ environment, nextVersion: environment === "production" ? "1.5.0" : "1.4.1" }),
    newestAndroidCode: async () => codes,
    iosBuildNumber: async (variant) => {
      if (noCredentials) throw Object.assign(new Error("the App Store Connect credentials are not in the driver environment"), { code: "NO_CREDENTIALS" })
      return builds[variant] + 1
    },
  })
  const lines = []
  const context = (ports, { dryRun = false } = {}) => ({
    ports, stateDir, now: () => clock.now, dryRun, log: (line) => lines.push(line),
    tickets: {
      bug: async (input) => { tickets.bugs.push(input); return 900 + tickets.bugs.length },
      hold: async (input) => { tickets.holds.push(input); return 800 + tickets.holds.length },
    },
  })
  let ports = makePorts()
  const tick = async (options) => {
    const before = events.filter((event) => event.startsWith("dispatch") || event.startsWith("verify")).length
    await releaseTick(context(ports, options))
    const acted = events.filter((event) => event.startsWith("dispatch") || event.startsWith("verify")).length - before
    clock.now += TICK
    return acted
  }
  /** Ticks until the train ends or the limit passes. Returns the highest count of dispatches and checks in one tick. */
  const drain = async (limit = 80) => {
    let most = 0
    for (let count = 0; count < limit; count++) {
      most = Math.max(most, await tick())
      const { train } = readTrainState(stateDir)
      if (train && train.status !== "running" && (train.status === "complete" || train.bug !== null)) break
    }
    return most
  }
  return { stateDir, events, tickets, main, runs, clock, lines, tick, drain, restart: () => { ports = makePorts() }, ports: () => ports, context, state: () => readTrainState(stateDir) }
}

const dispatchesOf = (events) => events.filter((event) => event.startsWith("dispatch"))
const releaseDispatches = (events) => dispatchesOf(events).filter((event) => event.startsWith("dispatch release.yml")).map((event) => `${event.match(/orbit-[a-z-]+/)[0]} ${event.match(/environment=(\w+)/)[1]}`)

const fullTrainCases = async () => {
  const w = world()
  const most = await w.drain()
  same("release-train: one train releases API, web, landing, then mobile, staging then production, with no owner input",
    w.events.filter((event) => !event.startsWith("plan") && !event.startsWith("wake")).map((event) => event.replace(/ --repo \S+/g, "").replace(/ --ref main/g, "").replace(/ -f /g, " ").replace(/branch=main /, "").replace(/sha=\w+/, "").replace(/message=release train \S+/, "").trim()),
    [
      "dispatch release.yml environment=staging",
      "verify api release https://api-staging.useorbit.org",
      "dispatch release.yml environment=production",
      "verify api release https://api.useorbit.org",
      "dispatch release.yml environment=staging",
      "verify ui release https://orbit-web-staging-eakn.onrender.com",
      "dispatch release.yml environment=production",
      "verify ui release https://orbit-web-3qmv.onrender.com",
      "dispatch release.yml environment=staging",
      "verify landing release https://orbit-landing-staging.onrender.com",
      "dispatch release.yml environment=production",
      "verify landing release https://useorbit.org",
      "dispatch android-release.yml app_version=1.5.0 android_version_code=701 track=internal",
      "verify ui android",
      "dispatch ios-release.yml variant=staging app_version=1.5.0 build_number=42",
      "dispatch android-release.yml app_version=1.5.0 android_version_code=702 track=open",
      "verify ui android",
      "dispatch ios-release.yml variant=production app_version=1.5.0 build_number=9",
    ])
  const { train } = w.state()
  same("release-train: the train completes and every step is verified", [train.status, train.steps.map((step) => step.state)], ["complete", Array(10).fill("verified")])
  same("release-train: staging and production of the mobile release share the version and the commit", [train.mobile.appVersion, train.mobile.sha, train.steps.filter((step) => step.kind !== "release").map((step) => step.plannedSha)], ["1.5.0", NEW.web === train.mobile.sha ? NEW.web : sha("b"), Array(4).fill(train.mobile.sha)])
  T("release-train: each tick makes at most one dispatch or one check", most <= 1, `most ${most}`)
  const apiStaging = w.events.findIndex((event) => event.startsWith("dispatch release.yml") && event.includes("orbit-api") && event.includes("environment=staging"))
  T("release-train: the API staging release is the first dispatch and uses the planned SHA", apiStaging === w.events.findIndex((event) => event.startsWith("dispatch")) && w.events[apiStaging].includes(`sha=${NEW.api}`), w.events[apiStaging])
  same("release-train: each release step logs one release line with the service, the environment, the planned SHA and the run link", w.lines.filter((line) => line.includes(" release api staging ") && line.endsWith(" verified")).map((line) => line.split(" ").slice(1).join(" ")), [`release api staging ${NEW.api} https://github.com/run/5001 verified`])
  T("release-train: the summary names the newest train", trainSummary(w.stateDir).includes("complete") && trainSummary(w.stateDir).includes("ios-production verified"), trainSummary(w.stateDir))
}

const cadenceCases = async () => {
  const w = world()
  await w.drain()
  const plans = () => w.events.filter((event) => event === "plan").length
  const before = plans()
  w.clock.now += HOUR
  await w.tick()
  same("release-train: no train starts within 4 hours of the end of the previous train", plans(), before)
  const { lastEndedAt } = w.state()
  w.clock.now = lastEndedAt + CADENCE_MS + TICK
  await w.tick()
  T("release-train: a new train starts after the cadence when a service needs a release", plans() === before + 1 && w.state().train.id !== w.state().train.steps[0].id && w.state().train.status === "running")
  const second = w.events.filter((event) => event.startsWith("dispatch")).length
  const planned = plans()
  await w.tick()
  same("release-train: a running train never plans another train", plans(), planned)
  T("release-train: the new train dispatches in order, so two trains never run at once", w.events.filter((event) => event.startsWith("dispatch")).length >= second)

  const idle = world({ plan: planOf({ api: { needs: false }, web: { needs: false }, landing: { needs: false }, android: { needs: false } }) })
  await idle.tick()
  same("release-train: a plan with no release makes no train and no dispatch", [idle.state().train, dispatchesOf(idle.events)], [null, []])
}

const failureCases = async () => {
  const w = world({ outcomes: { wait: (options) => (options.serviceUrl?.includes("api-staging") ? { code: 1, result: { reason: "FAILED", url: "https://github.com/run/5001" } } : null) } })
  await w.drain()
  const { train } = w.state()
  same("release-train: a failed staging step stops the train at that service with no later dispatch", [releaseDispatches(w.events), train.status, train.stoppedAt], [["orbit-api staging"], "stopped", "api-staging"])
  same("release-train: a stopped train files one Bug ticket with the run link, the step and the error", [w.tickets.bugs.length, w.tickets.bugs[0].repoKey, w.tickets.bugs[0].body.split("\n").some((line) => line === "Run: https://github.com/run/5001"), w.tickets.bugs[0].body.includes("api-staging"), w.tickets.bugs[0].body.includes("FAILED")], [1, "api", true, true, true])
  for (let count = 0; count < 5; count++) await w.tick()
  same("release-train: later ticks of a stopped train file no second ticket and dispatch nothing", [w.tickets.bugs.length, releaseDispatches(w.events).length], [1, 1])

  const later = world({ outcomes: { wait: (options) => (options.serviceUrl === "https://api.useorbit.org" ? { code: 1, result: { reason: "FAILED" } } : null) } })
  await later.drain()
  same("release-train: a failed production step stops before web and files its Bug ticket against the API", [releaseDispatches(later.events), later.tickets.bugs[0].repoKey], [["orbit-api staging", "orbit-api production"], "api"])

  const dispatchFails = world()
  const failing = dispatchFails.ports()
  failing.dispatch = async () => { throw new Error("gh workflow run failed: HTTP 422") }
  await dispatchFails.drain()
  same("release-train: a failed dispatch stops the train and files one Bug ticket", [dispatchFails.state().train.status, dispatchFails.tickets.bugs.length, dispatchFails.state().train.steps[0].reason.includes("HTTP 422")], ["stopped", 1, true])

  const ceiling = world({ outcomes: { wait: () => ({ code: 3, result: { reason: "CEILING" } }) } })
  await ceiling.drain()
  same("release-train: a wait-release ceiling stops the train at that service", [ceiling.state().train.status, ceiling.state().train.stoppedAt, releaseDispatches(ceiling.events)], ["stopped", "api-staging", ["orbit-api staging"]])

  const extra = world({ landingDeployed: false })
  await extra.drain()
  same("release-train: a landing release with no successful GitHub Deployment stops the train", [extra.state().train.stoppedAt, extra.state().train.steps.find((step) => step.id === "android-staging").state], ["landing-staging", "pending"])

  const bigApi = world({ files: { api: null } })
  await bigApi.drain()
  same("release-train: an API compare with an incomplete file list holds only the API step, and the other services release", [bigApi.state().train.steps.filter((step) => step.state === "held").map((step) => step.id), bigApi.state().train.status, releaseDispatches(bigApi.events).filter((entry) => entry.startsWith("orbit-api")), releaseDispatches(bigApi.events).length], [["api-staging", "api-production"], "complete", [], 4])
  const bigUi = world({ files: { ui: null } })
  await bigUi.drain()
  same("release-train: a UI compare with an incomplete file list releases web and mobile", [bigUi.state().train.status, releaseDispatches(bigUi.events).length, bigUi.events.some((event) => event.startsWith("dispatch android-release.yml"))], ["complete", 6, true])

  const unique = world()
  const original = unique.ports().dispatch
  unique.ports().dispatch = async (args) => { await original(args); await original(args) }
  await unique.drain()
  same("release-train: two matching new runs stop the train, because no run is unique", [unique.state().train.stoppedAt, unique.state().train.steps[0].reason.includes("no run is unique")], ["api-staging", true])

  const absent = world()
  absent.ports().dispatch = async (args) => { absent.events.push(`dispatch ${args.slice(2).join(" ")}`) }
  await absent.drain()
  same("release-train: a dispatch with no new run stops the train after the wait", [absent.state().train.stoppedAt, absent.state().train.steps[0].reason], ["api-staging", "no unique new run appeared for the dispatch"])

  const settle = world({ outcomes: { wait: (options) => (options.serviceUrl?.includes("api-staging") ? { code: 1, result: { reason: "READ_ERROR", error: "Service verification returned HTTP 429" } } : null) } })
  let attempts = 0
  const waiting = settle.ports().waitRelease
  settle.ports().waitRelease = async (options) => (++attempts < 3 ? waiting(options) : { code: 0, result: { reason: "SUCCESS" } })
  await settle.drain()
  T("release-train: a staging health answer that fails while the service wakes retries the verification and then passes", settle.state().train.status === "complete" && settle.events.filter((event) => event.startsWith("wake")).length >= 4, JSON.stringify(settle.state().train.steps[0]))

  const never = world({ outcomes: { wait: (options) => (options.serviceUrl?.includes("api-staging") ? { code: 1, result: { reason: "READ_ERROR", error: "HTTP 429" } } : null) } })
  await never.drain()
  same("release-train: a staging verification that never settles stops the train after 3 checks", [never.state().train.stoppedAt, never.state().train.steps[0].checks], ["api-staging", 3])
}

const restartCases = async () => {
  const w = world()
  for (let count = 0; count < 3; count++) await w.tick()
  const step = w.state().train.steps.find((entry) => entry.id === "api-production")
  const dispatched = dispatchesOf(w.events).length
  same("release-train: the train has dispatched API production and not verified it", [step.state, dispatched], ["dispatched", 2])
  w.restart()
  await w.tick()
  same("release-train: a restart after the API production dispatch verifies that run and dispatches nothing new", [dispatchesOf(w.events).length, w.state().train.steps.find((entry) => entry.id === "api-production").state, w.events.at(-1)], [2, "verified", "verify api release https://api.useorbit.org"])

  const crash = world()
  await crash.tick()
  const state = crash.state()
  state.train.steps[0].state = "dispatching"
  const { writeFileSync } = await import("node:fs")
  writeFileSync(join(crash.stateDir, TRAIN_FILE), `${JSON.stringify(state)}\n`)
  crash.restart()
  await crash.tick()
  same("release-train: a restart in the middle of a dispatch never dispatches the step again", [dispatchesOf(crash.events).length, crash.state().train.steps[0].runId !== null], [1, true])
}

const scopeCases = async () => {
  const webOnly = world({ plan: planOf({ api: { needs: false }, landing: { needs: false }, android: { needs: false } }), files: { ui: ["apps/web/page.tsx"] } })
  await webOnly.drain()
  same("release-train: with only web changed, only web staging and web production run", releaseDispatches(webOnly.events), ["orbit-ui-mobile staging", "orbit-ui-mobile production"])

  const noWeb = world({ files: { ui: ["apps/mobile/screen.tsx"] } })
  await noWeb.drain()
  same("release-train: web is skipped when no apps/web or packages/shared file changed, and mobile still runs", [releaseDispatches(noWeb.events).filter((entry) => entry.startsWith("orbit-ui-mobile")), dispatchesOf(noWeb.events).filter((event) => event.includes("android-release")).length], [[], 2])

  const noMobile = world({ files: { ui: ["apps/web/page.tsx"] } })
  const mobileFree = noMobile.ports()
  mobileFree.changedFiles = async (service, base) => (base === OLD.android ? ["apps/web/page.tsx", "tools/x.mjs"] : ["apps/web/page.tsx"])
  await noMobile.drain()
  same("release-train: mobile is skipped when no apps/mobile or packages/shared file changed", dispatchesOf(noMobile.events).filter((event) => event.includes("-release.yml") && !event.startsWith("dispatch release.yml")), [])

  const shared = world({ plan: planOf({ api: { needs: false }, landing: { needs: false }, web: { needs: false } }), files: { ui: ["packages/shared/src/a.ts"] } })
  await shared.drain()
  same("release-train: a packages/shared file ships mobile", dispatchesOf(shared.events).filter((event) => event.includes("android-release")).length, 2)

  const fresh = world({ plan: planOf({ web: { deployed: null }, api: { needs: false }, landing: { needs: false }, android: { needs: false } }), files: { ui: [] } })
  await fresh.drain()
  same("release-train: a service with no baseline always releases", releaseDispatches(fresh.events).length, 2)
}

const holdCases = async () => {
  const migration = world({ files: { api: ["src/Orbit.Infrastructure/Migrations/20261120_Add.cs"] } })
  await migration.drain()
  const { train } = migration.state()
  same("release-train: an API migration holds only the API step, and the other services release", [train.steps.filter((step) => step.state === "held").map((step) => step.id), train.status, releaseDispatches(migration.events).filter((entry) => entry.startsWith("orbit-api")), releaseDispatches(migration.events).length], [["api-staging", "api-production"], "complete", [], 4])
  same("release-train: the API hold files one needs:owner ticket that names the step", [migration.tickets.holds.length, migration.tickets.holds[0].reason.includes("api-staging"), migration.tickets.holds[0].reason.includes("migration"), migration.tickets.holds[0].repoKey], [1, true, true, "api"])

  const terraform = world({ manual: { api: [{ number: 11, text: "- Run terraform apply for the Render service" }] } })
  await terraform.drain()
  same("release-train: a Terraform step under Manual steps holds only the API step", [terraform.tickets.holds.length, releaseDispatches(terraform.events).some((entry) => entry.startsWith("orbit-api")), terraform.tickets.holds[0].reason.includes("#11")], [1, false, true])

  const none = world({ manual: { api: [{ number: 11, text: "None. No Terraform step." }] } })
  await none.drain()
  same("release-train: a Manual steps section that denies a Terraform step holds nothing", [none.tickets.holds.length, releaseDispatches(none.events).some((entry) => entry.startsWith("orbit-api"))], [0, true])

  const credentials = world({ noCredentials: true })
  await credentials.drain()
  same("release-train: with no App Store Connect credentials only the iOS steps hold and Android ships", [credentials.state().train.steps.filter((step) => step.state === "held").map((step) => step.id), dispatchesOf(credentials.events).filter((event) => event.includes("android-release")).length, credentials.tickets.holds.length, credentials.state().train.status], [["ios-staging", "ios-production"], 2, 1, "complete"])

  const waits = world({ plan: planOf({ web: { needs: false }, landing: { needs: false }, android: { needs: false } }), files: { api: ["src/Orbit.Infrastructure/Migrations/x.cs"] } })
  await waits.drain()
  await waits.tick()
  same("release-train: a train of held steps ends at once and a later tick files no second ticket", [waits.state().train.status, waits.tickets.holds.length], ["complete", 1])
}

const refusalCases = async () => {
  const refusal = "::error::Selected SHA requires a successful test.yml push or workflow_dispatch run; dispatch test.yml and guards.yml on that ref, then rerun the release"
  let refused = false
  const w = world({ plan: planOf({ api: { needs: false }, landing: { needs: false }, android: { needs: false } }), files: { ui: ["apps/web/a.ts"] }, outcomes: { failedLog: refusal } })
  w.ports().waitRelease = async (options) => {
    w.events.push(`verify ${options.repo} ${options.workflow}`)
    if (!refused) { refused = true; return { code: 1, result: { reason: "FAILED" } } }
    return { code: 0, result: { reason: "SUCCESS" } }
  }
  const run = w.ports().runStatus
  w.ports().runStatus = async (key, runId) => { const status = await run(key, runId); return status.url.endsWith("5001") ? { ...status, conclusion: "failure" } : status }
  await w.drain()
  const testsDispatched = dispatchesOf(w.events).filter((event) => event.startsWith("dispatch test.yml") || event.startsWith("dispatch guards.yml"))
  same("release-train: a refusal for a missing Tests or Guards run dispatches test.yml and guards.yml once, then the release again", [testsDispatched.length, releaseDispatches(w.events)], [2, ["orbit-ui-mobile staging", "orbit-ui-mobile staging", "orbit-ui-mobile production"]])
  same("release-train: the Tests and Guards dispatch runs on main of the repository", testsDispatched.map((event) => event.replace(" --ref main", "")), ["dispatch test.yml --repo thomasluizon/orbit-ui-mobile", "dispatch guards.yml --repo thomasluizon/orbit-ui-mobile"])
  same("release-train: the train completes after the second release dispatch", w.state().train.status, "complete")

  /** A refused web release whose test.yml run has the status that `statusAt` gives for the minutes since the run was listed first. Guards is green at once. */
  const queuedTests = async (statusAt) => {
    let queuedRefused = false
    const queued = world({ plan: planOf({ api: { needs: false }, landing: { needs: false }, android: { needs: false } }), files: { ui: ["apps/web/a.ts"] }, outcomes: { failedLog: refusal } })
    queued.ports().waitRelease = async (options) => {
      queued.events.push(`verify ${options.repo} ${options.workflow}`)
      if (!queuedRefused) { queuedRefused = true; return { code: 1, result: { reason: "FAILED" } } }
      return { code: 0, result: { reason: "SUCCESS" } }
    }
    const queuedStatus = queued.ports().runStatus
    queued.ports().runStatus = async (key, runId) => { const status = await queuedStatus(key, runId); return status.url.endsWith("5001") ? { ...status, conclusion: "failure" } : status }
    const listed = queued.ports().listRuns
    let firstSeen = null
    queued.ports().listRuns = async (key, workflow) => {
      const list = await listed(key, workflow)
      if (workflow !== "test.yml" || list.length === 0) return list
      firstSeen ??= queued.clock.now
      return list.map((run) => ({ ...run, ...statusAt((queued.clock.now - firstSeen) / 60000) }))
    }
    await queued.drain(260)
    return queued
  }
  const waiting = await queuedTests((minutes) => minutes < 180 ? { status: "queued", conclusion: null } : minutes < 210 ? { status: "in_progress", conclusion: null } : { status: "completed", conclusion: "success" })
  same("release-train: a Tests run that waits 180 minutes in the runner queue does not stop the train", [waiting.state().train.status, releaseDispatches(waiting.events).length], ["complete", 3])
  const stuck = await queuedTests(() => ({ status: "in_progress", conclusion: null }))
  same("release-train: a Tests run that runs for more than 90 minutes stops the train", [stuck.state().train.status, stuck.state().train.steps.find((step) => step.state === "failed")?.reason], ["stopped", "the test.yml run did not finish in 90 minutes of run time"])
  const stalled = await queuedTests(() => ({ status: "queued", conclusion: null }))
  same("release-train: a Tests run that never leaves the runner queue stops the train at the wait ceiling", [stalled.state().train.status, stalled.state().train.steps.find((step) => step.state === "failed")?.reason], ["stopped", "the Tests and Guards runs did not finish before the wait ceiling of 360 minutes"])
  same("release-train: the run time clock of a Tests run is saved in the train state", Object.keys(stuck.state().train.steps.find((step) => step.state === "failed").tests.startedAt), ["test.yml"])

  const apiOnly = { web: { needs: false }, landing: { needs: false }, android: { needs: false } }
  const sha40 = NEW.api
  const apiRefusals = [
    `Release requires successful API Tests (test.yml) on ${sha40}; dispatch test.yml and guards.yml on main at that commit, then rerun the release`,
    `Release requires successful Guards (guards.yml) on ${sha40}; dispatch test.yml and guards.yml on main at that commit, then rerun the release`,
    `No successful check runs for test.yml on ${sha40}`,
  ]
  for (const text of apiRefusals) {
    let apiRefused = false
    const api = world({ plan: planOf(apiOnly), files: { api: ["src/Orbit.Api/c.cs"] }, outcomes: { failedLog: `Error: ${text}` } })
    api.ports().waitRelease = async (options) => {
      api.events.push(`verify ${options.repo} ${options.workflow}`)
      if (!apiRefused) { apiRefused = true; return { code: 1, result: { reason: "FAILED" } } }
      return { code: 0, result: { reason: "SUCCESS" } }
    }
    const apiStatus = api.ports().runStatus
    api.ports().runStatus = async (key, runId) => { const status = await apiStatus(key, runId); return status.url.endsWith("5001") ? { ...status, conclusion: "failure" } : status }
    await api.drain()
    same(`release-train: the orbit-api refusal "${text.slice(0, 40)}" dispatches test.yml and guards.yml once on orbit-api, then the API staging release again`,
      [dispatchesOf(api.events).filter((event) => /^dispatch (test|guards)\.yml --repo thomasluizon\/orbit-api/.test(event)).length, releaseDispatches(api.events).slice(0, 2), api.tickets.bugs.length],
      [2, ["orbit-api staging", "orbit-api staging"], 0])
  }

  // The admission texts of the UI workflows come from the workflow files, so a reworded text fails here.
  const workflowRefusals = ["release.yml", "android-release.yml"].flatMap((file) => {
    const source = readFileSync(new URL(`../../.github/workflows/${file}`, import.meta.url), "utf8")
    return [...source.matchAll(/echo "::error::(Selected SHA (?:requires a successful|has missing or failing)[^"]*\$\{workflow\}\.yml[^"]*)"/g)].map((match) => ({ file, text: match[1].replaceAll("${workflow}", "test") }))
  })
  same("release-train: the UI workflows have the two Tests and Guards admission texts each", workflowRefusals.map((entry) => entry.file), ["release.yml", "release.yml", "android-release.yml", "android-release.yml"])
  for (const { file, text } of workflowRefusals) {
    let uiRefused = false
    const ui = world({ plan: planOf({ api: { needs: false }, landing: { needs: false }, android: { needs: false } }), files: { ui: ["apps/web/a.ts"] }, outcomes: { failedLog: `::error::${text}` } })
    ui.ports().waitRelease = async (options) => {
      ui.events.push(`verify ${options.repo} ${options.workflow}`)
      if (!uiRefused) { uiRefused = true; return { code: 1, result: { reason: "FAILED" } } }
      return { code: 0, result: { reason: "SUCCESS" } }
    }
    const uiStatus = ui.ports().runStatus
    ui.ports().runStatus = async (key, runId) => { const status = await uiStatus(key, runId); return status.url.endsWith("5001") ? { ...status, conclusion: "failure" } : status }
    await ui.drain()
    same(`release-train: the ${file} refusal "${text.slice(0, 48)}" dispatches test.yml and guards.yml once, then the release again`,
      [dispatchesOf(ui.events).filter((event) => /^dispatch (test|guards)\.yml/.test(event)).length, releaseDispatches(ui.events).slice(0, 2), ui.tickets.bugs.length],
      [2, ["orbit-ui-mobile staging", "orbit-ui-mobile staging"], 0])
  }

  let androidRefused = false
  const mobile = world({ plan: planOf({ api: { needs: false }, web: { needs: false }, landing: { needs: false } }), files: { ui: ["apps/mobile/a.ts"] }, outcomes: { failedLog: refusal } })
  mobile.ports().waitRelease = async (options) => {
    mobile.events.push(`verify ${options.repo} ${options.workflow}`)
    if (options.workflow === "android" && !androidRefused) { androidRefused = true; return { code: 1, result: { reason: "FAILED" } } }
    return { code: 0, result: { reason: "SUCCESS" } }
  }
  const mobileStatus = mobile.ports().runStatus
  mobile.ports().runStatus = async (key, runId) => { const status = await mobileStatus(key, runId); return status.url.endsWith("5001") ? { ...status, conclusion: "failure" } : status }
  await mobile.drain()
  same("release-train: iOS staging dispatches only after the Android staging run that follows a refusal",
    dispatchesOf(mobile.events).map((event) => event.split(" ").slice(1, 2).concat(event.match(/track=\w+|variant=\w+/)?.slice(0, 1) ?? []).join(" ")),
    ["android-release.yml track=internal", "test.yml", "guards.yml", "android-release.yml track=internal", "ios-release.yml variant=staging", "android-release.yml track=open", "ios-release.yml variant=production"])
  same("release-train: the mobile train that follows a refusal completes with no ticket", [mobile.state().train.status, mobile.tickets.bugs.length], ["complete", 0])

  let again = 0
  const twice = world({ plan: planOf({ api: { needs: false }, landing: { needs: false }, android: { needs: false } }), files: { ui: ["apps/web/a.ts"] }, outcomes: { failedLog: refusal } })
  twice.ports().waitRelease = async () => (++again, { code: 1, result: { reason: "FAILED" } })
  const status = twice.ports().runStatus
  twice.ports().runStatus = async (key, runId) => ({ ...(await status(key, runId)), conclusion: "failure" })
  await twice.drain()
  same("release-train: a second refusal of the same step stops the train", [releaseDispatches(twice.events).length, twice.state().train.status, twice.tickets.bugs.length], [2, "stopped", 1])

  const moved = world({ plan: planOf({ api: { needs: false }, landing: { needs: false }, android: { needs: false } }), files: { ui: ["apps/web/a.ts"] }, outcomes: { failedLog: refusal } })
  moved.ports().waitRelease = async () => { moved.main.ui = sha("e"); return { code: 1, result: { reason: "FAILED" } } }
  const movedStatus = moved.ports().runStatus
  moved.ports().runStatus = async (key, runId) => ({ ...(await movedStatus(key, runId)), conclusion: "failure" })
  await moved.drain()
  same("release-train: a refusal while main moved past the planned SHA dispatches no tests and stops the train", [dispatchesOf(moved.events).filter((event) => event.startsWith("dispatch test.yml")).length, moved.state().train.status], [0, "stopped"])
}

const stoppedCases = async () => {
  const w = world({ outcomes: { wait: (options) => (options.serviceUrl?.includes("api-staging") ? { code: 1, result: { reason: "FAILED" } } : null) } })
  await w.drain()
  w.clock.now += CADENCE_MS + HOUR
  const plans = w.events.filter((event) => event === "plan").length
  await w.tick()
  same("release-train: after the cadence a stopped train waits for a later merge", [w.events.filter((event) => event === "plan").length, w.state().train.status, dispatchesOf(w.events).length], [plans + 1, "stopped", 1])
  w.main.api = sha("e")
  const next = w.ports().plan
  w.ports().plan = async () => { const plan = await next(); plan.services[0].plannedSha = sha("e"); plan.services[0].dispatchCommand = plan.services[0].dispatchCommand.replace(NEW.api, sha("e")); return plan }
  w.clock.now += 20 * 60 * 1000
  await w.tick()
  same("release-train: a later merge starts a new train that dispatches the new commit", [w.state().train.status, dispatchesOf(w.events).at(-1)?.includes(sha("e"))], ["running", true])
}

const mobileCases = async () => {
  const moved = world({ mainMoves: { "ios-release.yml": false } })
  const movedPorts = moved.ports()
  const original = movedPorts.dispatch
  movedPorts.dispatch = async (args) => { await original(args); if (args[2] === "android-release.yml" && args.includes("track=open")) moved.main.ui = sha("e") }
  await moved.drain()
  const production = moved.state().train.steps.filter((step) => step.environment === "production" && step.kind !== "release")
  same("release-train: iOS stops the train when main moved between the Android and the iOS dispatch", [moved.state().train.stoppedAt, production.map((step) => step.state)], ["ios-production", ["verified", "failed"]])

  const skipped = world()
  const skippedPorts = skipped.ports()
  const dispatched = skippedPorts.dispatch
  skippedPorts.dispatch = async (args) => { await dispatched(args); if (args[2] === "ios-release.yml" && args.includes("variant=staging")) skipped.main.ui = sha("e") }
  await skipped.drain()
  same("release-train: when main moves before the Android production dispatch the mobile production steps skip with no ticket", [skipped.state().train.steps.filter((step) => step.environment === "production" && step.kind !== "release").map((step) => step.state), skipped.tickets.bugs.length, skipped.state().train.status], [["skipped", "skipped"], 0, "complete"])

  const codes = world({ codes: 900 })
  await codes.drain()
  same("release-train: the Android codes are the newest code plus one for staging and plus two for production", dispatchesOf(codes.events).filter((event) => event.includes("android-release")).map((event) => event.match(/android_version_code=(\d+)/)[1]), ["901", "902"])
  same("release-train: the iOS build numbers come from App Store Connect for each variant", dispatchesOf(codes.events).filter((event) => event.includes("ios-release")).map((event) => event.match(/build_number=(\d+)/)[1]), ["42", "9"])
}

const requestCases = async () => {
  const w = world()
  await w.drain()
  const ended = w.state().lastEndedAt
  w.clock.now = ended + HOUR
  const plans = () => w.events.filter((event) => event === "plan").length
  await w.tick()
  const idle = plans()
  same("release-train: /release writes a request and reports no running train", [requestTrain(w.stateDir), w.state().requested], [null, true])
  await w.tick()
  same("release-train: a request starts a train at once, inside the cadence", [plans(), w.state().train.status, w.state().requested], [idle + 1, "running", false])
  same("release-train: /release while a train runs reports it and changes nothing", [requestTrain(w.stateDir)?.includes("running"), w.state().requested], [true, false])

  const stopped = world({ outcomes: { wait: (options) => (options.serviceUrl?.includes("api-staging") ? { code: 1, result: { reason: "FAILED" } } : null) } })
  await stopped.drain()
  stopped.clock.now += 20 * 60 * 1000
  requestTrain(stopped.stateDir)
  await stopped.tick()
  same("release-train: a request starts a new train after a stop even with no later merge", [stopped.state().train.status, stopped.tickets.bugs.length], ["running", 1])
}

const unitCases = async () => {
  const command = `gh workflow run release.yml --repo thomasluizon/orbit-api --ref main -f environment=production -f branch='main' -f sha=${NEW.api}`
  same("release-train: the pinned production command gives the staging arguments", dispatchArguments(command, "staging", NEW.api), ["workflow", "run", "release.yml", "--repo", "thomasluizon/orbit-api", "--ref", "main", "-f", "environment=staging", "-f", "branch=main", "-f", `sha=${NEW.api}`])
  same("release-train: a command with another repository, another ref or another SHA gives null", [dispatchArguments(command.replace("orbit-api", "other"), "staging", NEW.api), dispatchArguments(command.replace("--ref main", "--ref dev"), "staging", NEW.api), dispatchArguments(command, "staging", sha("0")), dispatchArguments(`${command} -f force_unstaged=true`, "staging", NEW.api), dispatchArguments(undefined, "staging", NEW.api)], [null, null, null, null, null])
  same("release-train: the health URLs of the services", [healthUrl("api", "staging"), healthUrl("web", "production"), healthUrl("landing", "staging")], ["https://api-staging.useorbit.org/health", "https://orbit-web-3qmv.onrender.com/api/health", "https://orbit-landing-staging.onrender.com/"])
  same("release-train: manualStepsOf reads the section up to the next heading", [manualStepsOf("## Assumptions\nx\n\n## Manual steps\n- Run terraform apply\n\n## Test evidence\ny"), manualStepsOf("## Manual steps\nNone"), manualStepsOf("no section"), manualStepsOf(null)], ["- Run terraform apply", "None", "", ""])
  const train = { steps: [{ state: "verified", kind: "release" }, { state: "dispatched", kind: "android", runId: 7 }, { state: "pending", kind: "ios" }, { state: "pending", kind: "android" }] }
  same("release-train: the iOS step dispatches while its Android partner builds, once the Android run title carries the version", [nextAction(train).type, nextAction(train).step.kind], ["dispatch", "ios"])
  const untitled = { steps: [{ state: "dispatched", kind: "android", runId: null }, { state: "pending", kind: "ios" }] }
  same("release-train: the iOS step waits while the Android run has no title with the version", [nextAction(untitled).type, nextAction(untitled).step.kind], ["check", "android"])
  train.steps[2].state = "dispatched"
  same("release-train: with both mobile runs dispatched the next action checks the Android run", [nextAction(train).type, nextAction(train).step.kind], ["check", "android"])
  same("release-train: a train with every step done has no next action", nextAction({ steps: [{ state: "verified" }, { state: "skipped" }, { state: "held" }] }), null)
}

const dryRunCases = async () => {
  const w = world()
  await w.tick({ dryRun: true })
  const lines = w.lines.filter((line) => line.includes(" release "))
  T("release-train: a dry run prints each step that the train would take, for every service", ["api", "web", "landing", "android", "ios"].every((service) => lines.some((line) => line.includes(` release ${service} staging `) && line.endsWith("would dispatch"))), lines.join("\n"))
  same("release-train: a dry run writes no state and dispatches nothing", [existsSync(join(w.stateDir, TRAIN_FILE)), dispatchesOf(w.events)], [false, []])
  const live = world()
  await live.tick()
  const before = readFileSync(join(live.stateDir, TRAIN_FILE), "utf8")
  await live.tick({ dryRun: true })
  same("release-train: a dry run of a running train changes neither the file nor the dispatches", [readFileSync(join(live.stateDir, TRAIN_FILE), "utf8"), dispatchesOf(live.events).length], [before, 1])
}

const portCases = async () => {
  const calls = []
  const run = async (file, args, options = {}) => {
    calls.push([file, ...args])
    const text = args.join(" ")
    if (text.includes("commits/main")) return { status: 0, stdout: `${NEW.web}\n`, stderr: "" }
    // The real endpoint returns `files` on the first page only, up to 300 entries. Any later page has `files: null`, and `[.files[].filename]` exits 1 on it.
    if (text.includes("compare/")) {
      if (text.includes("page=") || !text.includes("[.files[]?.filename]")) return { status: 1, stdout: "", stderr: "jq: error: Cannot iterate over null" }
      const count = text.includes(`...${"c".repeat(40)}`) ? 300 : 120
      return { status: 0, stdout: JSON.stringify(Array.from({ length: count }, (_, index) => `f${index}`)), stderr: "" }
    }
    if (args[0]?.endsWith("wait-release.mjs")) return { status: 0, stdout: `${JSON.stringify({ reason: "SUCCESS" })}\n`, stderr: "" }
    if (args[0]?.endsWith("release-plan.mjs")) return { status: 0, stdout: JSON.stringify(planOf()), stderr: "" }
    if (text.includes("workflow run")) return { status: 0, stdout: "", stderr: "" }
    if (text.includes("run list")) return { status: 0, stdout: JSON.stringify([{ displayTitle: "Android Release 1.4.0 (812) to open on main" }, { displayTitle: "Android Release 1.4.1 (815) to internal on main" }, { displayTitle: "other" }]), stderr: "" }
    return { status: 1, stdout: "", stderr: "unexpected" }
  }
  const ports = realPorts({ run, toolsDirectory: "/r/tools", environment: {}, fetchText: async () => "" })
  same("release-train: the real port reads the main head", await ports.mainHead("ui"), NEW.web)
  const files = await ports.changedFiles("web", OLD.web, NEW.web)
  same("release-train: the real port reads the compare files with one request on the first page", [files.length, calls.filter((entry) => entry.some((part) => part.includes?.("compare/"))).length], [120, 1])
  same("release-train: the real port returns null for a compare that lists 300 files, which is incomplete", await ports.changedFiles("web", OLD.web, "c".repeat(40)), null)
  same("release-train: the newest Android code is the highest code of the run titles", await ports.newestAndroidCode(), 815)
  await ports.dispatch(["workflow", "run", "release.yml", "--repo", "thomasluizon/orbit-api"])
  await ports.waitRelease({ repo: "api", workflow: "release", run: 5, sha: NEW.api, workflowSha: NEW.api, serviceUrl: "https://api.useorbit.org" })
  const wait = calls.find((entry) => entry[0] === process.execPath && entry[1].endsWith("wait-release.mjs"))
  same("release-train: the real wait-release call carries the run, the planned SHA, the workflow SHA, the origin and a short ceiling", [wait.slice(2, 14), wait.includes("--ceiling-minutes")], [["--repo", "api", "--run", "5", "--sha", NEW.api, "--workflow-sha", NEW.api, "--workflow", "release", "--ceiling-minutes", "0.5"], true])
  same("release-train: the real plan port parses the output of release-plan.mjs", (await ports.plan()).services.length, 4)
  const failing = realPorts({ run: async () => ({ status: 1, stdout: "", stderr: "boom" }), toolsDirectory: "/r/tools", environment: {} })
  let message = ""
  try { await failing.plan() } catch (error) { message = error.message }
  T("release-train: a plan with no output is an error that names the exit", message.includes("exit 1") && message.includes("boom"), message)

  const client = { getAll: async (path, query) => { calls.push(["asc", path, JSON.stringify(query)]); return [{ attributes: { version: "7" } }, { attributes: { version: "41" } }, { attributes: { version: "12" } }, { attributes: {} }] } }
  const environment = { APP_STORE_CONNECT_API_KEY_ID: "k", APP_STORE_CONNECT_API_ISSUER_ID: "i", APP_STORE_CONNECT_API_PRIVATE_KEY: "p" }
  same("release-train: the iOS build number is the highest App Store Connect build plus one", await appStoreBuildNumber({ variant: "staging", environment, readVariable: async () => "6760000001\n", client }), 42)
  same("release-train: the App Store Connect read filters by the app and by iOS", JSON.parse(calls.at(-1)[2]), { "filter[app]": "6760000001", "filter[preReleaseVersion.platform]": "IOS", limit: "200" })
  let code = ""
  try { await appStoreBuildNumber({ variant: "staging", environment: {}, readVariable: async () => "1", client }) } catch (error) { code = error.code }
  same("release-train: missing App Store Connect credentials give NO_CREDENTIALS", code, "NO_CREDENTIALS")
}

const skillCases = () => {
  const read = (name) => readFileSync(join(new URL("../..", import.meta.url).pathname, ".claude", "skills", name), "utf8")
  const files = ["release/SKILL.md", "release/reference.md", "android-release/SKILL.md", "ios-release/SKILL.md"]
  for (const file of files) {
    const text = read(file)
    const banned = text.split("\n").filter((line) => /only the owner|Dispatch only after the owner|confirms the exact inputs|Confirm the exact inputs with the owner|Dispatch only when the owner authorized|Then ask for a plain yes|Only `\/release` and `\/android-release` deploy|Nothing deploys on a merge/i.test(line))
    same(`release-train: ${file} has no line that says only the owner deploys`, banned, [])
    T(`release-train: ${file} names the driver release train`, /release train|driver releases/i.test(text), "no train rule")
  }
  T("release-train: the release skill says /release starts the same train at once", /\/release.*(starts|runs).*same train|same train.*\/release/i.test(read("release/SKILL.md")))
}

/** CodeQL js/incomplete-url-substring-sanitization: a substring check that holds a full URL accepts a URL with any host around it. */
const urlSubstringCases = () => {
  const toolsDir = join(new URL("../..", import.meta.url).pathname, "tools")
  const sources = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules") return []
    const path = join(directory, entry.name)
    return entry.isDirectory() ? sources(path) : /\.(mjs|js|cjs)$/.test(entry.name) ? [path] : []
  })
  const substringOfUrl = /\.(?:includes|indexOf)\(\s*[`'"][^`'"]*:\/\//
  const found = sources(toolsDir).flatMap((path) => readFileSync(path, "utf8").split("\n").flatMap((line, index) => (substringOfUrl.test(line) ? [`${relative(toolsDir, path)}:${index + 1}`] : [])))
  same("release-train: no tools file checks a URL with a substring match, so no host hides inside the URL", found, [])
}

const mergeHoldCases = async () => {
  const w = world()
  same("release-train: no train means no mobile merge hold", mobileMergeHold(w.state()), null)
  const holds = []
  for (let count = 0; count < 80; count++) {
    await w.tick()
    const { train } = w.state()
    holds.push(mobileMergeHold(w.state()))
    if (train && train.status !== "running") break
  }
  const first = holds.findIndex((hold) => hold !== null)
  const { train } = w.state()
  const last = holds.findLastIndex((hold) => hold !== null)
  T("release-train: the mobile merge hold starts when the mobile plan is read", first >= 0 && holds[first].sha === train.mobile.sha && holds[first].id === train.id, JSON.stringify(holds[first]))
  T("release-train: the mobile merge hold stays on until the last mobile step is dispatched, with no gap", holds.slice(first, last + 1).every((hold) => hold !== null))
  same("release-train: the mobile merge hold is off when the train is complete", [train.status, holds.at(-1)], ["complete", null])
  const lastMobile = train.steps.filter((step) => ["android", "ios"].includes(step.kind)).at(-1)
  same("release-train: the last hold tick is the tick that dispatches the last mobile production step", [lastMobile.id, lastMobile.state], ["ios-production", "verified"])
  const step = (kind, state) => ({ kind, state })
  const wait = (steps, extra = {}) => ({ train: { id: "t", status: "running", mobile: { sha: "s" }, steps, ...extra } })
  same("release-train: a pending mobile step holds", mobileMergeHold(wait([step("release", "pending"), step("ios", "pending")])), { id: "t", sha: "s" })
  same("release-train: a pending release step with every mobile step dispatched does not hold", mobileMergeHold(wait([step("android", "dispatched"), step("ios", "verified"), step("release", "pending")])), null)
  same("release-train: a stopped train does not hold", mobileMergeHold(wait([step("ios", "pending")], { status: "stopped" })), null)
}

export const cases = async () => {
  await fullTrainCases()
  await cadenceCases()
  await failureCases()
  await restartCases()
  await scopeCases()
  await holdCases()
  await refusalCases()
  await stoppedCases()
  await mobileCases()
  await mergeHoldCases()
  await requestCases()
  await unitCases()
  await dryRunCases()
  await portCases()
  skillCases()
  urlSubstringCases()
}
