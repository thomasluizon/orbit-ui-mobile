import { spawn } from "node:child_process"
import filesystem from "node:fs"
import { readFileSync, readdirSync } from "node:fs"
import { syncBuiltinESMExports } from "node:module"
import { pathToFileURL } from "node:url"

import { createCiBudget } from "../lib/ci-budget.mjs"
import { acquireRelayLock } from "../lib/run-state.mjs"
import { T, stageRepo, toolPath } from "./_harness.mjs"

const recorded = JSON.parse(readFileSync(toolPath("__tests__/fixtures/wait-ci-rate-limit.json"), "utf8"))
const options = (deadline) => ({ deadline, signal: new AbortController().signal })
const response = (status = 200, headers = []) => ({ status, headers: new Map(headers) })

export const cases = async () => {
  const releasedRepo = stageRepo("ci-budget-released-lock")
  const releaseFirst = acquireRelayLock(releasedRepo.path, "budget-lock")
  const originalRead = filesystem.readFileSync
  let released = false
  let reacquired = false
  filesystem.readFileSync = (path, ...args) => {
    if (path === `${releasedRepo.path}/.git/budget-lock/owner.json` && !released) {
      released = true
      releaseFirst()
    }
    return originalRead(path, ...args)
  }
  syncBuiltinESMExports()
  try { acquireRelayLock(releasedRepo.path, "budget-lock")(); reacquired = true } catch { /* Assert the release race below. */ }
  finally { filesystem.readFileSync = originalRead; syncBuiltinESMExports() }
  T("CI budget: a lock released between its claim and owner read can be acquired", released && reacquired)

  const repo = stageRepo("ci-budget-hour")
  const start = Math.floor(Date.now() / 1000) * 1000
  let clock = start
  const end = start + 3_600_000
  const settings = { owner: "recorded-owner", repoRoot: repo.path, environment: {}, now: () => clock,
    sleep: async (milliseconds) => { clock += milliseconds },
    readRate: async () => ({ ...recorded, resources: { ...recorded.resources,
      core: { ...recorded.resources.core, remaining: recorded.resources.core.limit, reset: Math.floor(end / 1000) + 1 },
    } }),
  }
  for (const offset of [0, -1]) {
    for (const remaining of [0, recorded.resources.core.limit]) {
      const boundaryRepo = stageRepo(`ci-budget-boundary-${offset}-${remaining}`)
      let boundaryClock = start
      let reads = 0
      const pauses = []
      const boundary = createCiBudget({ ...settings, repoRoot: boundaryRepo.path, now: () => boundaryClock,
        sleep: async (milliseconds) => { pauses.push(milliseconds); boundaryClock += milliseconds },
        readRate: async () => ++reads === 1 ? { ...recorded, resources: { ...recorded.resources,
          core: { ...recorded.resources.core, remaining, reset: start / 1000 + offset },
        } } : settings.readRate(),
      })
      const reservations = []
      let failure
      try {
        for (let index = 0; index < 2; index++) {
          const at = await boundary.beforeRequest(options(end))
          reservations.push(at)
          await boundary.afterResponse(response(), at, options(end))
        }
      } catch (error) { failure = error.message }
      T(`CI budget: reset offset ${offset}s with ${remaining} remaining refreshes and permits later reads`,
        !failure && reads === 2 && pauses[0] === 1000 && reservations[0] === start + 1000 &&
        reservations[1] > reservations[0], JSON.stringify({ failure, reads, pauses, reservations }))
    }
  }

  const staleRepo = stageRepo("ci-budget-persistent-stale")
  let staleClock = start
  let staleReads = 0
  const stale = createCiBudget({ ...settings, repoRoot: staleRepo.path, now: () => staleClock,
    sleep: async (milliseconds) => { staleClock += milliseconds },
    readRate: async () => {
      staleReads++
      return { ...recorded, resources: { ...recorded.resources,
        core: { ...recorded.resources.core, reset: start / 1000 },
      } }
    },
  })
  let staleError
  try { await stale.beforeRequest(options(start + 2500)) } catch (error) { staleError = error }
  T("CI budget: persistently expired windows retry at a bounded pace until the caller ceiling",
    staleError?.code === "GITHUB_READ_CEILING" && staleClock === start + 2500 && staleReads === 3,
    JSON.stringify({ error: staleError?.message, staleClock, staleReads }))

  const malformedRepo = stageRepo("ci-budget-malformed")
  for (const core of [undefined, {},
    ...["limit", "remaining", "reset"].flatMap((field) => [undefined, "1", 1.5, -1].map((value) =>
      ({ ...recorded.resources.core, reset: end / 1000, [field]: value }))),
    { ...recorded.resources.core, limit: 0, reset: end / 1000 },
    { ...recorded.resources.core, remaining: recorded.resources.core.limit + 1, reset: end / 1000 },
  ]) {
    let reads = 0
    let pauses = 0
    const malformed = createCiBudget({ ...settings, repoRoot: malformedRepo.path,
      sleep: async () => { pauses++ },
      readRate: async () => { reads++; return { resources: { core } } },
    })
    let failure
    try { await malformed.beforeRequest(options(end)) } catch (error) { failure = error.message }
    T(`CI budget: malformed rate ${JSON.stringify(core)} stays fatal without retry`,
      failure === "GitHub REST rate limit had an unexpected shape" && reads === 1 && pauses === 0, failure)
  }

  const waiters = Array.from({ length: 7 }, () => createCiBudget(settings))
  const observed = new Map()
  let counted = 0
  let maximumGap = 0
  try {
    while (clock < end) {
      for (let pull = 0; pull < 30; pull++) {
        const waiter = waiters[pull % waiters.length]
        for (let endpoint = 0; endpoint < 4; endpoint++) {
          const reservation = await waiter.beforeRequest(options(end))
          counted++
          await waiter.afterResponse(response(), reservation, options(end))
        }
        maximumGap = Math.max(maximumGap, clock - (observed.get(pull) ?? start))
        observed.set(pull, clock)
      }
      clock += 60_000
    }
  } catch (error) { if (error.code !== "GITHUB_READ_CEILING") throw error }
  T("CI budget: seven waiters watching 30 pulls for one hour stay within half the recorded limit",
    counted > 0 && counted <= recorded.resources.core.limit / 2, `${counted} counted reads`)
  T("CI budget: all 30 changing pulls are observed within four minutes", observed.size === 30 && maximumGap <= 240_000,
    `${observed.size} pulls, ${maximumGap}ms maximum gap`)

  let lowClock = start
  const lowRepo = stageRepo("ci-budget-low")
  const low = createCiBudget({ ...settings, repoRoot: lowRepo.path, now: () => lowClock,
    sleep: async (milliseconds) => { lowClock += milliseconds },
  })
  const first = await low.beforeRequest(options(end))
  await low.afterResponse(response(200, [["x-ratelimit-remaining", "10"], ["x-ratelimit-reset", String(Math.floor(end / 1000) + 1)]]), first, options(end))
  const second = await low.beforeRequest(options(end))
  await low.afterResponse(response(), second, options(end))
  const third = await low.beforeRequest(options(end))
  T("CI budget: low remaining headers slow subsequent reservations", third - second >= 600_000, `${third - second}ms`)

  const conditionalRepo = stageRepo("ci-budget-conditional")
  const conditional = createCiBudget({ ...settings, repoRoot: conditionalRepo.path, now: () => start })
  const reservation = await conditional.beforeRequest(options(end))
  await conditional.afterResponse(response(304), reservation, options(end))
  const ledgerPath = readdirSync(`${conditionalRepo.path}/.git`).find((name) => /^orbit-ci-budget-.*\.json$/.test(name))
  const ledger = JSON.parse(readFileSync(`${conditionalRepo.path}/.git/${ledgerPath}`, "utf8"))
  T("CI budget: a recorded 304 refunds the counted reservation", ledger.reservations.length === 0)

  const exhaustedRepo = stageRepo("ci-budget-exhausted")
  let exhaustedClock = start
  const exhausted = createCiBudget({ ...settings, repoRoot: exhaustedRepo.path, now: () => exhaustedClock,
    sleep: async (milliseconds) => { exhaustedClock += milliseconds },
    readRate: async () => ({ resources: { core: { ...recorded.resources.core, remaining: 0, reset: Math.floor(end / 1000) } } }),
  })
  let ceiling = false
  try { await exhausted.beforeRequest(options(start + 1000)) } catch (error) { ceiling = error.code === "GITHUB_READ_CEILING" }
  T("CI budget: exhaustion waits only until the caller ceiling", ceiling && exhaustedClock === start + 1000)

  const concurrentRepo = stageRepo("ci-budget-concurrent")
  const childSource = `
    import { createCiBudget } from ${JSON.stringify(pathToFileURL(toolPath("lib/ci-budget.mjs")).href)}
    const budget = createCiBudget({ owner: "shared", environment: {}, repoRoot: ${JSON.stringify(concurrentRepo.path)},
      readRate: async () => (${JSON.stringify(recorded).replace(/"reset":\d+/g, '"reset":Math.ceil(Date.now()/1000)+3600')}) })
    const options = { deadline: Date.now() + 15000, signal: new AbortController().signal }
    const reservations = []
    for (let index = 0; index < 2; index++) reservations.push(await budget.beforeRequest(options))
    console.log(JSON.stringify(reservations))
  `
  const children = await Promise.all(Array.from({ length: 2 }, () => new Promise((resolve) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", childSource])
    let stdout = "", stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.once("close", (status) => resolve({ status, stdout, stderr }))
  })))
  const slots = children.filter((child) => child.status === 0).flatMap((child) => JSON.parse(child.stdout)).sort((left, right) => left - right)
  T("CI budget: concurrent processes reserve distinct paced slots in one ledger", slots.length === 4 &&
    slots.slice(1).every((at, index) => at - slots[index] >= 1440), JSON.stringify(children))
}
