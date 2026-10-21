#!/usr/bin/env node

import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { runBounded } from "./lib/bounded-process.mjs"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const HOST = "https://sentry.io"
const ORGANIZATION = "thomasluizon"
const PROJECT = "orbit-mobile"
const CLI = "node_modules/@sentry/react-native/node_modules/@sentry/cli"
const LOOKUP = `${HOST}/api/0/organizations/${ORGANIZATION}/chunk-upload/`
const AUTH = `${HOST}/api/0/`
const BODY_LIMIT = 65536
const OUTPUT_LIMIT = 8192
const REQUEST_TIMEOUT = 10000
const TOTAL_TIMEOUT = 45000
const PROCESS_TIMEOUT = 5000
const REQUEST_LIMIT = 2
const SHA = /^[0-9a-f]{40}$/

const USAGE = `usage: android-sentry-diagnostic.mjs

Read-only native upload lookup for trusted main. No positional arguments or target overrides.
Requires GITHUB_ACTIONS=true, GITHUB_REPOSITORY=thomasluizon/orbit-ui-mobile,
GITHUB_REF=refs/heads/main, GITHUB_SHA=EXPECTED_SOURCE_SHA=<approved main SHA>,
and the existing production SENTRY_AUTH_TOKEN in the environment. No stdin.
At most two fixed GETs, 10 seconds each, 45 seconds total, 64 KiB per body,
8 KiB output. Captured CLI output and HTTP bodies are never printed or saved.
--help, -h  show this usage
exit codes: 0 lookup and supplementary auth HTTP reads healthy (no upload proof),
1 bounded diagnostic failure or unavailable evidence, 2 invalid CLI usage`

function assertConfiguration(root) {
  const app = JSON.parse(readFileSync(join(root, "apps/mobile/app.json"), "utf8"))
  const plugin = app.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === "@sentry/react-native/expo")?.[1]
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"))
  if (plugin?.url !== `${HOST}/` || plugin.organization !== ORGANIZATION || plugin.project !== PROJECT || plugin.authToken
    || lock.packages[CLI]?.version !== "3.6.0" || lock.packages["node_modules/@sentry/react-native"]?.version !== "8.17.2") {
    throw new Error("configuration_mismatch")
  }
}

// Mirrors CLI 3.6.0's org_auth_token.rs and config.rs; decoded material never leaves this function.
function targetSelection(token) {
  if (/^(sntryu_)?[0-9a-fA-F]{64}$/.test(token)) return "configured_defaults"
  const segments = token.split("_")
  if (segments.length !== 3 || segments[0] !== "sntrys") throw new Error("credential_format_unrecognized")
  const payloadBytes = Buffer.from(segments[1], "base64")
  const secretBytes = Buffer.from(segments[2], "base64")
  if (payloadBytes.toString("base64") !== segments[1] || secretBytes.length !== 32
    || secretBytes.toString("base64").replace(/=+$/, "") !== segments[2]) throw new Error("credential_format_unrecognized")
  let payload
  try {
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes))
  } catch {
    throw new Error("credential_format_unrecognized")
  }
  if (typeof payload?.org !== "string" || !(typeof payload.url === "string" || payload.url === null)) {
    throw new Error("credential_format_unrecognized")
  }
  if (payload.org !== ORGANIZATION) throw new Error("embedded_organization_mismatch")
  if (payload.url && payload.url.replace(/\/+$/, "") !== HOST) throw new Error("embedded_host_mismatch")
  return "embedded_target_matches"
}

function httpOutcome(status) {
  if (status >= 200 && status < 300) return "http_read_ok"
  if (status >= 300 && status < 400) return "redirect_refused"
  if (status === 401) return "authentication_rejected"
  if (status === 403) return "access_or_scope_unavailable"
  if (status === 404) return "resource_or_access_unavailable"
  if (status === 429) return "rate_limited"
  if (status >= 500) return "service_failure"
  return "http_failure"
}

async function readBody(response, signal) {
  if (!response.body) return "malformed_json"
  const reader = response.body.getReader()
  const chunks = []
  let bytes = 0
  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > BODY_LIMIT) return "response_too_large"
      chunks.push(Buffer.from(value))
    }
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))
      const parsed = JSON.parse(text)
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? "json_object_fields_unused" : "malformed_json"
    } catch {
      return "malformed_json"
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

async function probe(url, token, totalSignal, fetchImpl) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT)
  const signal = AbortSignal.any([timeout, totalSignal])
  try {
    signal.throwIfAborted()
    const response = await fetchImpl(url, {
      method: "GET", redirect: "manual", signal,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    })
    const status = response.status
    const outcome = httpOutcome(status)
    if (outcome === "redirect_refused") {
      await response.body?.cancel()
      return { status, outcome, body: "not_read" }
    }
    const body = await readBody(response, signal)
    return { status, outcome, body }
  } catch {
    return { status: null, outcome: totalSignal.aborted ? "total_deadline" : timeout.aborted ? "request_timeout" : "network_or_tls_failure", body: "unavailable" }
  }
}

function safeOutput(report, token) {
  const output = `${JSON.stringify(report, null, 2)}\n`
  if (Buffer.byteLength(output) > OUTPUT_LIMIT || (token?.trim() && output.includes(token))) {
    return '{"outcome":"output_refused"}\n'
  }
  return output
}

export async function runDiagnostic({ env = process.env, root = ROOT, fetchImpl = fetch, runProcess = runBounded } = {}) {
  const totalSignal = AbortSignal.timeout(TOTAL_TIMEOUT)
  const report = {
    outcome: "unavailable", source: null, native_cli: "unverified",
    expected: { host: HOST, organization: ORGANIZATION, project: PROJECT },
    target_selection: "unknown", requests: [],
    limits: { requests: REQUEST_LIMIT, request_ms: REQUEST_TIMEOUT, total_ms: TOTAL_TIMEOUT, body_bytes: BODY_LIMIT, output_bytes: OUTPUT_LIMIT },
    evidence_limits: "HTTP reads only; response fields unused. No project access, upload, root cause, Play submission or availability proof. A 404 cannot distinguish target absence from denied access. Auth-info 403 may reflect unsupported scope; do not broaden grants.",
  }
  let token
  try {
    if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_REPOSITORY !== "thomasluizon/orbit-ui-mobile" || env.GITHUB_REF !== "refs/heads/main"
      || !SHA.test(env.GITHUB_SHA ?? "") || env.EXPECTED_SOURCE_SHA !== env.GITHUB_SHA) throw new Error("trusted_source_required")
    token = env.SENTRY_AUTH_TOKEN
    if (!token?.trim()) throw new Error("credential_missing")
    if (token.length > BODY_LIMIT) throw new Error("credential_format_unrecognized")
    assertConfiguration(root)
    report.target_selection = targetSelection(token)
    const childEnvironment = { PATH: env.PATH }
    const source = await runProcess("git", ["rev-parse", "HEAD"], { cwd: root, env: childEnvironment, timeoutMs: PROCESS_TIMEOUT, maxBuffer: OUTPUT_LIMIT })
    if (source.error || source.timedOut || source.overflowed || source.status !== 0 || source.stdout.trim() !== env.GITHUB_SHA) throw new Error("checkout_source_mismatch")
    report.source = env.GITHUB_SHA
    const version = await runProcess(process.execPath, [join(root, CLI, "bin/sentry-cli"), "--version"], {
      cwd: root, env: childEnvironment, timeoutMs: PROCESS_TIMEOUT, maxBuffer: OUTPUT_LIMIT,
    })
    if (version.error || version.timedOut || version.overflowed || version.status !== 0 || version.stdout.trim() !== "sentry-cli 3.6.0") throw new Error("native_cli_unverified")
    report.native_cli = "3.6.0"
    for (const [name, url] of [["native_upload_options", LOOKUP], ["supplementary_auth", AUTH]]) {
      if (report.requests.length >= REQUEST_LIMIT) throw new Error("request_limit")
      totalSignal.throwIfAborted()
      const result = await probe(url, token, totalSignal, fetchImpl)
      report.requests.push({ name, ...result })
      if (["redirect_refused", "total_deadline", "request_timeout", "network_or_tls_failure"].includes(result.outcome)
        || result.body === "response_too_large") break
    }
    report.outcome = report.requests.length === REQUEST_LIMIT && report.requests.every((result) => result.outcome === "http_read_ok" && result.body === "json_object_fields_unused")
      ? "lookup_reads_healthy" : "diagnostic_incomplete"
  } catch (error) {
    const known = ["trusted_source_required", "credential_missing", "credential_format_unrecognized", "configuration_mismatch", "embedded_organization_mismatch", "embedded_host_mismatch", "checkout_source_mismatch", "native_cli_unverified", "request_limit"]
    report.outcome = known.includes(error?.message) ? error.message : totalSignal.aborted ? "total_deadline" : "diagnostic_failure"
  }
  const output = safeOutput(report, token)
  return { status: report.outcome === "lookup_reads_healthy" && !output.includes('"output_refused"') ? 0 : 1, output }
}

export async function main(argv = process.argv.slice(2), options) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) return { status: 0, output: `${USAGE}\n` }
  if (argv.length) return { status: 2, output: "android-sentry-diagnostic: unsupported arguments\n" }
  return runDiagnostic(options)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await main()
  const stream = result.status === 0 ? process.stdout : process.stderr
  stream.write(result.output)
  process.exitCode = result.status
}
