import { createHash, randomUUID } from "node:crypto"
import { readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { setTimeout as wait } from "node:timers/promises"

import { readGithub } from "./github-read.mjs"
import { acquireRelayLock, gitDirectoryOf, REPO_ROOT } from "./run-state.mjs"

const HOUR = 3_600_000
const ceiling = () => Object.assign(new Error("GitHub read ceiling reached"), { code: "GITHUB_READ_CEILING" })

/** Reserve worst-case counted reads, even when an endpoint has no ETag or every poll changes. */
export const reserveCiRead = (state, now) => {
  const { limit, remaining, reset } = state.rate
  const allowance = Math.floor(limit / 2)
  state.reservations = state.reservations.filter((timestamp) => timestamp > now - HOUR)
  if (allowance < 1 || remaining < 2 || now >= reset * 1000) return { refreshAt: Math.max(now, reset * 1000) }
  const spacing = Math.max(HOUR / allowance, (reset * 1000 - now) / Math.floor(remaining / 2))
  const at = Math.max(now, state.nextAt ?? now,
    state.reservations.length >= allowance ? state.reservations.at(-allowance) + HOUR : now)
  if (at >= reset * 1000) return { refreshAt: reset * 1000 }
  state.reservations.push(at)
  state.nextAt = at + spacing
  state.rate.remaining--
  return { at }
}

/** All waiter processes in the launching checkout share a paced, rolling-hour ledger per account. */
export const createCiBudget = ({ owner, environment, repoRoot = REPO_ROOT, now = Date.now,
  sleep = (milliseconds, signal) => wait(milliseconds, undefined, { signal }),
  readRate = (options) => readGithub("rate_limit", environment, options),
}) => {
  const key = createHash("sha256").update(owner).digest("hex")
  const path = join(gitDirectoryOf(repoRoot), `orbit-ci-budget-${key}.json`)
  const lockName = `orbit-ci-budget-${key}-lock`
  const pause = async (until, options) => {
    options.signal.throwIfAborted()
    if (now() >= options.deadline) throw ceiling()
    await sleep(Math.max(1, Math.min(until, options.deadline) - now()), options.signal)
    if (now() >= options.deadline) throw ceiling()
  }
  const locked = async (options, operation) => {
    let release
    while (!release) {
      options.signal.throwIfAborted()
      if (now() >= options.deadline) throw ceiling()
      try { release = acquireRelayLock(repoRoot, lockName) } catch (error) {
        if (!error.message.startsWith("EEXIST:")) throw error
        await pause(now() + 50, options)
      }
    }
    try {
      let state
      try { state = JSON.parse(readFileSync(path, "utf8")) } catch (error) {
        if (error.code !== "ENOENT") throw error
        state = { rate: null, observedAt: 0, reservations: [], nextAt: 0 }
      }
      const result = await operation(state)
      const unpublished = `${path}.${randomUUID()}.unpublished`
      writeFileSync(unpublished, JSON.stringify(state))
      renameSync(unpublished, path)
      return result
    } finally { release() }
  }
  const refresh = async (state, options) => {
    // The rate_limit endpoint does not consume the REST primary budget.
    const response = await readRate({ ...options, rest: undefined })
    const rate = response?.resources?.core
    if (!rate || ![rate.limit, rate.remaining, rate.reset].every(Number.isInteger) ||
        rate.limit <= 0 || rate.remaining < 0 || rate.remaining > rate.limit || rate.reset * 1000 <= now()) {
      throw new Error("GitHub REST rate limit had an unexpected shape")
    }
    state.rate = { limit: rate.limit, remaining: rate.remaining, reset: rate.reset }
    state.observedAt = now()
  }
  return {
    cache: new Map(),
    beforeRequest: async (options) => {
      while (true) {
        const reservation = await locked(options, async (state) => {
          if (!state.rate || now() - state.observedAt >= 60_000 || now() >= state.rate.reset * 1000) await refresh(state, options)
          return reserveCiRead(state, now())
        })
        if (reservation.at !== undefined) {
          if (reservation.at > now()) await pause(reservation.at, options)
          const exhaustedUntil = await locked(options, (state) => state.rate.remaining === 0 ? state.rate.reset * 1000 : null)
          if (exhaustedUntil !== null) {
            await pause(exhaustedUntil, options)
            continue
          }
          return reservation.at
        }
        await pause(reservation.refreshAt, options)
      }
    },
    afterResponse: (response, reservation, options) => locked(options, (state) => {
      if (response.status === 304) state.reservations = state.reservations.filter((at) => at !== reservation)
      const remaining = response.headers.get("x-ratelimit-remaining")
      const reset = response.headers.get("x-ratelimit-reset")
      if (remaining !== undefined && /^\d+$/.test(remaining) && reset === String(state.rate.reset)) {
        state.rate.remaining = Math.min(state.rate.remaining, Number(remaining))
      }
    }),
  }
}
