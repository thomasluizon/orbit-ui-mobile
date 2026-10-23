import { readFileSync } from "node:fs"

import { T, orcaEnv, stage } from "./_harness.mjs"
import { readGithub } from "../lib/github-read.mjs"

const response = (status, headers = "", body = "Service Unavailable") => ({
  stdout: `HTTP/2.0 ${status}\r\n${headers}\r\n${body}`, stderr: `gh: HTTP ${status}\n`, exit: 1,
})
const read = async (name, responses, options = {}) => {
  const sequenceFile = stage(`github-read/${name}`, "")
  const environment = { ...process.env, ...orcaEnv([{ match: "api test/read", sequenceFile, responseSequence: responses }]) }
  const errors = []
  let value, error
  const startedAt = Date.now()
  try {
    value = await readGithub("test/read", environment, {
      deadline: Date.now() + 3000, pollMs: 10, onTransientError: (text) => errors.push(text), ...options,
    })
  } catch (caught) { error = caught }
  return { value, error, errors, elapsed: Date.now() - startedAt, calls: Number(readFileSync(sequenceFile, "utf8")) }
}
const success = { stdout: "HTTP/2.0 200 OK\r\nContent-Type: application/json\r\n\r\n[]", stderr: "", exit: 0 }

export const cases = async () => {
  for (const signal of ["SIGTERM", "SIGINT"]) {
    const existingHandler = () => {}
    const listeners = process.listenerCount(signal)
    const exitListeners = process.listenerCount("exit")
    process.on(signal, existingHandler)
    let interruption
    const interrupted = await read(`backoff-${signal}`, [response(503, "Retry-After: 60\r\n")], {
      deadline: Date.now() + 1000,
      onTransientError: () => { interruption = setTimeout(() => process.emit(signal), 20) },
    })
    clearTimeout(interruption)
    process.removeListener(signal, existingHandler)
    T(`GitHub read: ${signal} cancels backoff and releases lifecycle listeners`, interrupted.error?.name === "AbortError" &&
      interrupted.calls === 1 && interrupted.elapsed < 900 && process.listenerCount(signal) === listeners &&
      process.listenerCount("exit") === exitListeners, interrupted.error?.message)
  }
  for (const status of [500, 502, 503, 504, 599, 429]) {
    const recovered = await read(`recover-${status}`, [response(status), success])
    T(`GitHub read: HTTP ${status} recovers`, !recovered.error && recovered.calls === 2 && recovered.errors.length === 1, recovered.error?.message)
  }
  for (const [name, failure] of [
    ["secondary", response(403, "Retry-After: 0\r\n")],
    ["secondary-text", { stderr: "gh: You have exceeded a secondary rate limit (HTTP 403)", exit: 1 }],
    ["secondary-graphql", { stderr: "GraphQL: You have exceeded a secondary rate limit", exit: 1 }],
    ["primary", response(403, "X-RateLimit-Remaining: 0\r\n")],
    ["timeout", { stderr: "net/http: request canceled (Client.Timeout exceeded while awaiting headers)", exit: 1 }],
    ["deadline", { stderr: "context deadline exceeded", exit: 1 }],
  ]) {
    const recovered = await read(name, [failure, success])
    T(`GitHub read: ${name} recovers`, !recovered.error && recovered.calls === 2 && recovered.errors.length === 1, recovered.error?.message)
  }
  for (const status of [400, 401, 403, 404, 422]) {
    const fatal = await read(`fatal-${status}`, [response(status), success])
    T(`GitHub read: HTTP ${status} remains fatal`, fatal.error && fatal.calls === 1 && fatal.errors.length === 0, fatal.error?.message)
  }
  const invalid = await read("invalid-json", [{ stdout: "not json", exit: 0 }, success])
  T("GitHub read: invalid JSON remains fatal", invalid.error?.message.includes("invalid JSON") && invalid.calls === 1 && invalid.errors.length === 0)

  const delayed = await read("retry-after", [response(503, "Retry-After: 1\r\n"), success])
  T("GitHub read: Retry-After exceeds the poll bound", !delayed.error && delayed.elapsed >= 1000 && delayed.calls === 2)
  const date = new Date(Date.now() + 2000).toUTCString()
  const delayedDate = await read("retry-date", [response(429, `Retry-After: ${date}\r\n`), success])
  T("GitHub read: Retry-After accepts an HTTP date", !delayedDate.error && delayedDate.elapsed >= 900 && delayedDate.calls === 2)

  const exhausted = await read("ceiling", [response(503, "Retry-After: 60\r\n")], { deadline: Date.now() + 250 })
  T("GitHub read: Retry-After never extends the ceiling", exhausted.error?.code === "GITHUB_READ_CEILING" && exhausted.calls === 1 && exhausted.elapsed < 2000)
  const backoff = await read("backoff", [response(503), response(503), success], { pollMs: 50 })
  T("GitHub read: missing Retry-After backs off", !backoff.error && backoff.elapsed >= 100 && backoff.calls === 3)
  const timeout = await read("hung", [{ hangTreePidFile: stage("github-read/hung-child", "") }], { deadline: Date.now() + 250 })
  T("GitHub read: a hung gh is terminated at the ceiling", timeout.error?.code === "GITHUB_READ_CEILING" && timeout.errors.length === 1 && timeout.elapsed < 2000)

  const sequenceFile = stage("github-read/default-timeout-retry", "")
  const environment = { ...process.env, ...orcaEnv([{ match: "api test/read", sequenceFile, responseSequence: [
    { hangTreePidFile: stage("github-read/default-timeout-child", "") }, success,
  ] }]) }
  const errors = []
  let recovered = false
  try {
    await readGithub("test/read", environment, { pollMs: 10, onTransientError: (text) => errors.push(text) })
    recovered = true
  } catch { /* The assertion reports whether the bounded read exhausted its budget. */ }
  T("GitHub read: admission retries after a real gh timeout", recovered && errors.length === 1 &&
    errors[0].includes("timed out") && readFileSync(sequenceFile, "utf8") === "2")
}
