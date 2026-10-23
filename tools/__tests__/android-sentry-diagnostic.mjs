import { spawnSync } from "node:child_process"
import { readFileSync, mkdirSync, writeFileSync, cpSync } from "node:fs"
import { dirname, join } from "node:path"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import yaml from "js-yaml"
import * as diagnostic from "../android-sentry-diagnostic.mjs"
import { REPO_ROOT, T, stage } from "./_harness.mjs"

const SOURCE = "a".repeat(40)
const SENTINEL = "PRIVATE_SENTINEL_header_payload_email@example.invalid"
const token = "1".repeat(64)
const environment = {
  PATH: process.env.PATH, GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "thomasluizon/orbit-ui-mobile",
  GITHUB_REF: "refs/heads/main", GITHUB_SHA: SOURCE, EXPECTED_SOURCE_SHA: SOURCE, SENTRY_AUTH_TOKEN: token,
}
const childResult = (stdout) => ({ status: 0, stdout, stderr: SENTINEL, error: null, timedOut: false, overflowed: false })
const processResult = async (file) => childResult(file === "git" ? `${SOURCE}\n` : "sentry-cli 3.6.0\n")
const organizationToken = (org = "thomasluizon", url = "https://sentry.io", extra = {}) =>
  `sntrys_${Buffer.from(JSON.stringify({ org, url, ...extra })).toString("base64")}_${Buffer.alloc(32, 1).toString("base64").replace(/=+$/, "")}`

// Complete anonymous and organization-token envelopes, not captured production responses:
// https://github.com/getsentry/sentry/blob/d4ac7c872436deb5d01d1e8673bae061758e3e0b/src/sentry/api/endpoints/index.py#L17-L30
// https://github.com/getsentry/sentry/blob/d4ac7c872436deb5d01d1e8673bae061758e3e0b/src/sentry/api/authentication.py#L744-L780
const authEnvelope = (scopes) => ({ version: "0", auth: scopes === null ? null : { scopes }, user: null })
const reportedShape = { version: "string", auth: { scopes: "array<string>" }, user: "null" }
const anonymousShape = { version: "string", auth: "null", user: "null" }
const unavailableAuth = { token_auth: "unavailable", native_get_scope: "unavailable", complete_shape: "shape_unavailable" }

function authResponse(subject, envelope, { lookupStatus = 200, authStatus = 200 } = {}) {
  return execute(subject, {
    env: { ...environment, SENTRY_AUTH_TOKEN: organizationToken("orbit-ai-habit-tracker") },
    fetchImpl: async (url) => new Response(JSON.stringify(url === "https://sentry.io/api/0/" ? envelope : url.includes("/releases/") ? [] : {}), {
      status: url === "https://sentry.io/api/0/" ? authStatus : url.includes("chunk-upload") ? lookupStatus : 200,
    }),
  })
}

async function lookup404(subject, scopes) {
  return authResponse(subject, authEnvelope(scopes), { lookupStatus: 404 })
}

async function execute(subject, changes = {}) {
  const calls = []
  const children = []
  const { fetchImpl = async (url) => new Response(JSON.stringify(url === "https://sentry.io/api/0/" ? authEnvelope(["org:ci"]) : url.includes("/releases/") ? [] : {})),
    runProcess = processResult, ...options } = changes
  const result = await subject.main([], {
    root: REPO_ROOT, env: { ...environment, SENTRY_AUTH_TOKEN: organizationToken("orbit-ai-habit-tracker") },
    fetchImpl: async (url, request) => { calls.push([url, request]); return fetchImpl(url, request) },
    runProcess: async (...args) => { children.push(args); return runProcess(...args) },
    ...options,
  })
  return { ...result, report: JSON.parse(result.output), calls, children }
}

const destinations = [
  "https://sentry.io/api/0/",
  "https://sentry.io/api/0/organizations/orbit-ai-habit-tracker/chunk-upload/",
  "https://sentry.io/api/0/projects/orbit-ai-habit-tracker/orbit-mobile/releases/?per_page=1",
]

function candidateReads(subject, { credential = organizationToken("orbit-ai-habit-tracker"), respond } = {}) {
  return execute(subject, {
    env: { ...environment, SENTRY_AUTH_TOKEN: credential },
    fetchImpl: async (url, options) => {
      const response = await respond?.(url, options)
      return response ?? new Response(JSON.stringify(url === destinations[0] ? authEnvelope(["org:ci"])
        : url === destinations[2] ? [] : { [SENTINEL]: SENTINEL }))
    },
  })
}

async function candidateCases() {
  for (const [credential, selection, matches] of [[organizationToken(), "embedded_previous_organization", false],
    [organizationToken("orbit-ai-habit-tracker"), "embedded_current_organization", true],
    [token, "configured_defaults", true], [`sntryu_${token}`, "configured_defaults", true]]) {
    const result = await candidateReads(diagnostic, { credential })
    T("android-sentry current target: fixed reads preserve native selection, configuration agreement and incomplete old binding", result.status === (matches ? 0 : 1)
      && result.calls.map(([url]) => url).join() === destinations.join() && result.report.target_selection === selection
      && result.report.current_target_reads === "route_access_observed"
      && result.report.native_configuration_agreement === (matches ? "matches_configured" : "differs_from_configured")
      && result.report.candidate_target_agreement === (matches ? "matches_candidate" : "differs_from_candidate")
      && result.report.outcome === (matches ? "current_target_reads_observed" : "native_target_differs_from_candidate")
      && result.report.native_upload === "native_upload_unverified"
      && result.calls.every(([, request]) => request.method === "GET" && request.redirect === "manual"
        && request.headers.Authorization === `Bearer ${credential}` && request.headers["User-Agent"] === "sentry-cli/3.6.0")
      && !result.output.includes(SENTINEL) && !result.output.includes(credential))
  }
  for (const org of ["thomasluizon", "orbit-ai-habit-tracker"]) {
    for (const url of [null, "", "https://sentry.io", "https://sentry.io/", "https://sentry.io////"]) {
      const result = await candidateReads(diagnostic, { credential: organizationToken(org, url, { iat: 1, region_url: `https://untrusted.invalid/${SENTINEL}`, [SENTINEL]: SENTINEL }) })
      T("android-sentry current target: both recognized bindings normalize URLs without consuming issuance extras", result.calls.map(([destination]) => destination).join() === destinations.join()
        && result.status === (org === "thomasluizon" ? 1 : 0)
        && result.report.target_selection === (org === "thomasluizon" ? "embedded_previous_organization" : "embedded_current_organization")
        && result.report.native_configuration_agreement === (org === "thomasluizon" ? "differs_from_configured" : "matches_configured")
        && result.report.candidate_target_agreement === (org === "thomasluizon" ? "differs_from_candidate" : "matches_candidate")
        && result.report.native_upload === "native_upload_unverified" && !result.output.includes(SENTINEL))
    }
  }
  const overridden = await execute(diagnostic, { env: { ...environment, SENTRY_AUTH_TOKEN: organizationToken(), SENTRY_ORG: "orbit-ai-habit-tracker", SENTRY_URL: `https://untrusted.invalid/${SENTINEL}`, SENTRY_PROJECT: "orbit-mobile" } })
  T("android-sentry current target: env/default edits cannot override an old embedded organization", overridden.status === 1
    && overridden.report.target_selection === "embedded_previous_organization" && overridden.report.candidate_target_agreement === "differs_from_candidate"
    && overridden.calls.map(([url]) => url).join() === destinations.join() && !overridden.output.includes(SENTINEL))
  for (const body of ["[]", `[{"${SENTINEL}":{"nested":["${SENTINEL}"]}}]`, "[null,false,42]"]) {
    const result = await candidateReads(diagnostic, { respond: async (url) => url === destinations[2] ? new Response(body, { headers: { Link: `https://untrusted.invalid/${SENTINEL}`, "X-Sentry-Proxy-URL": SENTINEL } }) : null })
    T("android-sentry project: a bounded array including empty proves route access without inspecting releases or pagination", result.status === 0
      && result.calls.length === 3 && result.report.requests[2].body === "json_array_fields_unused"
      && result.report.requests[2].proxy_header_present === true && result.report.native_upload === "native_upload_unverified" && !result.output.includes(SENTINEL))
  }
  for (const body of ["{}", "null", "42", "false", `"${SENTINEL}"`, SENTINEL, new Uint8Array([255]), null]) {
    const result = await candidateReads(diagnostic, { respond: async (url) => url === destinations[2] ? new Response(body) : null })
    T("android-sentry project: wrong top-level type and invalid JSON cannot count as route access", result.status === 1
      && result.calls.length === 3 && result.report.current_target_reads === "unavailable"
      && ["unsupported_project_shape", "malformed_json"].includes(result.report.requests[2].body) && !result.output.includes(SENTINEL))
  }
  const outcomes = { 400: "http_failure", 401: "authentication_rejected", 403: "access_or_scope_unavailable", 404: "resource_or_access_unavailable", 429: "rate_limited", 500: "service_failure", 503: "service_failure" }
  for (const position of [1, 2]) {
    for (const [status, outcome] of Object.entries(outcomes)) {
      const result = await candidateReads(diagnostic, { respond: async (url) => url === destinations[position] ? new Response("[]", { status: Number(status) }) : null })
      T("android-sentry candidate: organization/project HTTP failures stay distinct from independent auth evidence", result.status === 1
        && result.report.requests[position].outcome === outcome && result.report.requests[0].auth_evidence.token_auth === "reported"
        && result.report.current_target_reads === "unavailable")
    }
  }
  for (const [status, envelope, expected] of [[404, { detail: "The requested resource does not exist" }, "resource_does_not_exist_detail"],
    [401, { detail: "Invalid org token" }, "invalid_org_token_detail"], [403, { detail: "Invalid org token" }, "invalid_org_token_detail"],
    [404, { detail: "Invalid org token" }, "unavailable"], [404, { detail: SENTINEL }, "unavailable"],
    [404, { detail: "The requested resource does not exist", [SENTINEL]: SENTINEL }, "unavailable"], [404, { detail: 42 }, "unavailable"]]) {
    for (const position of [1, 2]) {
      const result = await candidateReads(diagnostic, { respond: async (url) => url === destinations[position] ? new Response(JSON.stringify(envelope), { status }) : null })
      T("android-sentry candidate: complete fixed error classes never echo detail or erase index auth", result.status === 1
        && result.report.requests[position].error_evidence.classification === expected && result.report.requests[0].auth_evidence.token_auth === "reported"
        && !result.output.includes(SENTINEL) && !result.output.includes("Invalid org token") && !result.output.includes("The requested resource does not exist"))
    }
  }
  await candidateTransportCases()
}

async function candidateTransportCases() {
  for (const position of [0, 1, 2]) {
    for (const failure of ["redirect", "oversize", "network", "timeout", "total", "partial", "slow"]) {
      const originalTimeout = AbortSignal.timeout
      const keepAlive = setTimeout(() => {}, 2000)
      let cancelled = false
      let released = false
      AbortSignal.timeout = (milliseconds) => originalTimeout(failure === "total" ? milliseconds === 45000 ? 15 : 200 : milliseconds === 10000 ? 15 : milliseconds)
      try {
        const result = await candidateReads(diagnostic, { respond: async (url, { signal }) => {
          if (url !== destinations[position]) return null
          if (failure === "redirect") return new Response("{}", { status: 302, headers: { Location: `https://untrusted.invalid/${SENTINEL}` } })
          if (failure === "network") throw new Error(SENTINEL)
          if (["timeout", "total"].includes(failure)) return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error(SENTINEL)), { once: true }))
          let reads = 0
          return { status: 200, headers: new Headers({ "X-Private": SENTINEL }), body: { getReader: () => ({
            read: async () => {
              if (reads++ === 0) return { done: false, value: Buffer.from(`{"${SENTINEL}":`) }
              if (failure === "oversize") return { done: false, value: new Uint8Array(65537) }
              if (failure === "partial") throw new Error(SENTINEL)
              return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error(SENTINEL)), { once: true }))
            },
            cancel: async () => { cancelled = true }, releaseLock: () => { released = true },
          }) } }
        } })
        const expectedOutcome = failure === "redirect" ? "redirect_refused" : ["timeout", "slow"].includes(failure) ? "request_timeout"
          : failure === "total" ? "total_deadline" : failure === "oversize" ? "http_read_ok" : "network_or_tls_failure"
        T("android-sentry transport: every position stops after bounded redirect/body/transport/deadline failure", result.status === 1
          && result.calls.length === position + 1 && result.report.requests[position].outcome === expectedOutcome
          && (failure !== "oversize" || result.report.requests[position].body === "response_too_large")
          && (!["partial", "slow", "oversize"].includes(failure) || cancelled && released)
          && !result.output.includes(SENTINEL) && Buffer.byteLength(result.output) <= 8192)
      } finally {
        AbortSignal.timeout = originalTimeout
        clearTimeout(keepAlive)
      }
    }
  }
}

const guards = []
const guard = (name, mutation, verify) => guards.push({ name, mutation, verify })

for (const field of ["url", "organization", "project", "authToken"]) {
  const condition = { url: 'plugin?.url !== `${HOST}/`', organization: "plugin.organization !== ORGANIZATION", project: "plugin.project !== PROJECT", authToken: "plugin.authToken" }[field]
  guard(`immutable plugin ${field}`, [condition, "false"], async (subject) => {
    const app = JSON.parse(readFileSync(join(REPO_ROOT, "apps/mobile/app.json"), "utf8"))
    app.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === "@sentry/react-native/expo")[1][field] = SENTINEL
    const path = stage(`android-sentry/config-${field}/apps/mobile/app.json`, JSON.stringify(app))
    const root = join(dirname(path), "../..")
    writeFileSync(join(root, "package-lock.json"), readFileSync(join(REPO_ROOT, "package-lock.json")))
    const result = await execute(subject, { root })
    return result.report.outcome === "configuration_mismatch" && result.calls.length === 0 && !result.output.includes(SENTINEL)
  })
}
for (const [name, path, condition] of [
  ["CLI", "node_modules/@sentry/react-native/node_modules/@sentry/cli", 'lock.packages[CLI]?.version !== "3.6.0"'],
  ["SDK", "node_modules/@sentry/react-native", 'lock.packages["node_modules/@sentry/react-native"]?.version !== "8.17.2"'],
]) {
  guard(`locked native ${name}`, [condition, "false"], async (subject) => {
    const lock = JSON.parse(readFileSync(join(REPO_ROOT, "package-lock.json"), "utf8"))
    lock.packages[path].version = "0.0.0"
    const staged = stage(`android-sentry/lock-${name}/apps/mobile/app.json`, readFileSync(join(REPO_ROOT, "apps/mobile/app.json")))
    const root = join(dirname(staged), "../..")
    writeFileSync(join(root, "package-lock.json"), JSON.stringify(lock))
    const result = await execute(subject, { root })
    return result.report.outcome === "configuration_mismatch" && result.calls.length === 0
  })
}

guard("main ref before credential boundary", ['env.GITHUB_REF !== "refs/heads/main"', "false"], async (subject) => {
  const result = await execute(subject, { env: { ...environment, GITHUB_REF: "refs/heads/feature" } })
  return result.status === 1 && result.report.outcome === "trusted_source_required" && result.calls.length === 0 && result.children.length === 0
})
guard("Actions provenance", ['env.GITHUB_ACTIONS !== "true"', "false"], async (subject) =>
  (await execute(subject, { env: { ...environment, GITHUB_ACTIONS: "false" } })).report.outcome === "trusted_source_required")
guard("repository provenance", ['env.GITHUB_REPOSITORY !== "thomasluizon/orbit-ui-mobile"', "false"], async (subject) =>
  (await execute(subject, { env: { ...environment, GITHUB_REPOSITORY: "untrusted/repository" } })).report.outcome === "trusted_source_required")
guard("expected source pin", ["env.EXPECTED_SOURCE_SHA !== env.GITHUB_SHA", "false"], async (subject) =>
  (await execute(subject, { env: { ...environment, EXPECTED_SOURCE_SHA: "b".repeat(40) } })).report.outcome === "trusted_source_required")
guard("source syntax", ['!SHA.test(env.GITHUB_SHA ?? "")', "false"], async (subject) =>
  (await execute(subject, { env: { ...environment, GITHUB_SHA: SENTINEL, EXPECTED_SOURCE_SHA: SENTINEL } })).report.outcome === "trusted_source_required")
guard("missing credential before processes and requests", ['if (!token?.trim())', "if (false)"], async (subject) => {
  for (const missing of [undefined, "", "   "]) {
    const result = await execute(subject, { env: { ...environment, SENTRY_AUTH_TOKEN: missing } })
    if (result.report.outcome !== "credential_missing" || result.calls.length || result.children.length) return false
  }
  return true
})
guard("credential size", ["token.length > BODY_LIMIT", "false"], async (subject) => {
  const payload = Buffer.from(JSON.stringify({ org: "thomasluizon", url: null, ignored: "x".repeat(65536) })).toString("base64")
  const oversized = `sntrys_${payload}_${Buffer.alloc(32, 1).toString("base64").replace(/=+$/, "")}`
  return (await execute(subject, { env: { ...environment, SENTRY_AUTH_TOKEN: oversized } })).report.outcome === "credential_format_unrecognized"
})
guard("configured organization stays current", ['const ORGANIZATION = "orbit-ai-habit-tracker"', 'const ORGANIZATION = "thomasluizon"'], async (subject) => {
  const result = await candidateReads(subject)
  return result.status === 0 && result.report.expected.organization === "orbit-ai-habit-tracker"
    && result.report.native_configuration_agreement === "matches_configured" && result.calls.length === 3
})
for (const [name, condition, credential, override] of [
  ["legacy organization override", 'env.SENTRY_ORG !== undefined && env.SENTRY_ORG !== ORGANIZATION', token, { SENTRY_ORG: SENTINEL }],
  ["legacy host override", 'env.SENTRY_URL !== undefined && env.SENTRY_URL.replace(/\\/+$/, "") !== HOST', token, { SENTRY_URL: SENTINEL }],
  ["project override", 'env.SENTRY_PROJECT !== undefined && env.SENTRY_PROJECT !== PROJECT', organizationToken("orbit-ai-habit-tracker"), { SENTRY_PROJECT: SENTINEL }],
  ["empty embedded host fallback override", '!payload.url && env.SENTRY_URL !== undefined && env.SENTRY_URL.replace(/\\/+$/, "") !== HOST', organizationToken("orbit-ai-habit-tracker", null), { SENTRY_URL: SENTINEL }],
]) {
  guard(name, [condition, "false"], async (subject) => {
    const result = await execute(subject, { env: { ...environment, SENTRY_AUTH_TOKEN: credential, ...override } })
    return result.status === 1 && result.report.outcome === "native_override_mismatch"
      && result.calls.length === 0 && result.children.length === 0 && !result.output.includes(SENTINEL) && !result.output.includes(credential)
  })
}
guard("embedded org overrides defaults", ["payload.org !== ORGANIZATION && payload.org !== PREVIOUS_ORGANIZATION", "false"], async (subject) => {
  const result = await execute(subject, { env: { ...environment, SENTRY_AUTH_TOKEN: organizationToken("other-org") } })
  return result.report.outcome === "embedded_organization_mismatch" && result.calls.length === 0 && !result.output.includes("other-org")
})
guard("embedded host cannot receive auth", ['payload.url && payload.url.replace(/\\/+$/, "") !== HOST', "false"], async (subject) => {
  const result = await execute(subject, { env: { ...environment, SENTRY_AUTH_TOKEN: organizationToken("thomasluizon", "https://untrusted.invalid") } })
  return result.report.outcome === "embedded_host_mismatch" && result.calls.length === 0 && !result.output.includes("untrusted.invalid")
})
guard("token parser rejects malformed payload", ['typeof payload?.org !== "string"', "false"], async (subject) => {
  const invalid = organizationToken(42)
  return (await execute(subject, { env: { ...environment, SENTRY_AUTH_TOKEN: invalid } })).report.outcome === "credential_format_unrecognized"
})
guard("token URL type", ['!(typeof payload.url === "string" || payload.url === null)', "false"], async (subject) =>
  (await execute(subject, { env: { ...environment, SENTRY_AUTH_TOKEN: organizationToken("thomasluizon", 42) } })).report.outcome === "credential_format_unrecognized")
guard("token encoding and secret size", ["secretBytes.length !== 32", "false"], async (subject) => {
  const invalid = organizationToken().replace(/_[^_]+$/, `_${Buffer.alloc(31, 1).toString("base64").replace(/=+$/, "")}`)
  return (await execute(subject, { env: { ...environment, SENTRY_AUTH_TOKEN: invalid } })).report.outcome === "credential_format_unrecognized"
})
guard("checkout pin verified independently", ["source.stdout.trim() !== env.GITHUB_SHA", "false"], async (subject) =>
  (await execute(subject, { runProcess: async (file) => file === "git" ? childResult("b".repeat(40)) : processResult(file) })).report.outcome === "checkout_source_mismatch")
guard("native version checked, no top-level CLI", ['version.stdout.trim() !== "sentry-cli 3.6.0"', "false"], async (subject) =>
  (await execute(subject, { runProcess: async (file) => file === "git" ? processResult(file) : childResult("sentry-cli 2.58.6") })).report.outcome === "native_cli_unverified")
guard("subprocess exit checked", ["version.status !== 0", "false"], async (subject) =>
  (await execute(subject, { runProcess: async (file) => ({ ...await processResult(file), status: file === "git" ? 0 : 1 }) })).report.outcome === "native_cli_unverified")
guard("subprocess timeout checked", ["version.timedOut ||", ""], async (subject) =>
  (await execute(subject, { runProcess: async (file) => ({ ...await processResult(file), timedOut: file !== "git" }) })).report.outcome === "native_cli_unverified")
guard("subprocess overflow checked", ["version.overflowed ||", ""], async (subject) =>
  (await execute(subject, { runProcess: async (file) => ({ ...await processResult(file), overflowed: file !== "git" }) })).report.outcome === "native_cli_unverified")
guard("fixed GET and redirect refusal", ['method: "GET", redirect: "manual"', 'method: "POST", redirect: "follow"'], async (subject) => {
  const result = await execute(subject)
  return result.calls.every(([, options]) => options.method === "GET" && options.redirect === "manual")
})
guard("fixed destinations and request count", ["const REQUEST_LIMIT = 3", "const REQUEST_LIMIT = 2"], async (subject) => {
  const result = await execute(subject)
  return result.status === 0 && result.calls.map(([url]) => url).join(" ") === "https://sentry.io/api/0/ https://sentry.io/api/0/organizations/orbit-ai-habit-tracker/chunk-upload/ https://sentry.io/api/0/projects/orbit-ai-habit-tracker/orbit-mobile/releases/?per_page=1"
})
guard("response cap", ["if (bytes > BODY_LIMIT)", "if (false)"], async (subject) => {
  const result = await execute(subject, { fetchImpl: async () => new Response(JSON.stringify({ private: "x".repeat(65536) })) })
  return result.status === 1 && result.report.requests[0].body === "response_too_large" && result.report.requests.length === 1
})
guard("oversized response releases its stream", ["await reader.cancel().catch(() => {})", ""], async (subject) => {
  let cancelled = false
  const result = await execute(subject, { fetchImpl: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(65537)) },
    cancel() { cancelled = true },
  })) })
  return result.status === 1 && cancelled && result.report.requests.length === 1
})
guard("JSON syntax boundary", ["const parsed = JSON.parse(text)", "const parsed = {}"], async (subject) => {
  const result = await execute(subject, { fetchImpl: async () => new Response(SENTINEL) })
  return result.status === 1 && result.report.requests.every((entry) => entry.body === "malformed_json") && !result.output.includes(SENTINEL)
})
guard("JSON object boundary", ['parsed && typeof parsed === "object" && !Array.isArray(parsed)', "true"], async (subject) => {
  for (const body of ["null", "[]", "false", '"private"']) {
    if ((await execute(subject, { fetchImpl: async (url) => new Response(url.includes("chunk-upload") ? body : JSON.stringify(url.includes("/releases/") ? [] : authEnvelope(["org:ci"]))) })).status !== 1) return false
  }
  return true
})
guard("supplementary read failure is incomplete", ['if (status === 403) return "access_or_scope_unavailable"', 'if (status === 403) return "http_read_ok"'], async (subject) => {
  const result = await authResponse(subject, authEnvelope(["org:ci"]), { authStatus: 403 })
  return result.status === 1 && result.report.requests[0].outcome === "access_or_scope_unavailable"
})
guard("malformed lookup cannot pass", ['result.body === "json_object_fields_unused"', "true"], async (subject) =>
  (await execute(subject, { fetchImpl: async (url) => new Response(url.includes("chunk-upload") ? "broken" : JSON.stringify(url.includes("/releases/") ? [] : authEnvelope(["org:ci"]))) })).status === 1)
guard("redirect stops further authenticated probes", ['"redirect_refused", "total_deadline"', '"removed", "total_deadline"'], async (subject) => {
  const result = await candidateReads(subject, { respond: async (url) => url === destinations[1]
    ? new Response("{}", { status: 302, headers: { Location: `https://untrusted.invalid/${SENTINEL}` } }) : null })
  return result.status === 1 && result.calls.length === 2 && result.report.requests[1].outcome === "redirect_refused" && !result.output.includes(SENTINEL)
})

guard("auth null is no reported token auth", ['if (parsed?.auth === null) evidence.token_auth = "not_reported"', 'if (parsed?.auth === null) evidence.token_auth = "reported"'], async (subject) => {
  const result = await lookup404(subject, null)
  return result.report.requests[0].auth_evidence.token_auth === "not_reported" && result.status === 1
})
guard("HTTP 200 cannot manufacture auth evidence", ["auth_evidence: authEvidence(parsed)", 'auth_evidence: authEvidence({ version: "0", auth: { scopes: ["org:ci"] }, user: null })'], async (subject) => {
  const result = await authResponse(subject, {})
  return result.status === 1 && JSON.stringify(result.report.requests[0].auth_evidence) === JSON.stringify(unavailableAuth)
})
guard("scope array typing", ['Array.isArray(parsed.auth.scopes)', "true"], async (subject) => {
  const result = await authResponse(subject, authEnvelope("org:ci"))
  return result.status === 1 && result.report.requests[0].body === "json_object_auth_classified"
    && result.report.requests[0].auth_evidence.token_auth === "unavailable"
})
guard("every scope element must be a string", ['parsed.auth.scopes.every((scope) => typeof scope === "string")', "true"], async (subject) => {
  const result = await authResponse(subject, authEnvelope(["org:ci", [SENTINEL]]))
  return result.status === 1 && result.report.requests[0].auth_evidence.token_auth === "unavailable"
})
guard("exact auth key set", ["Object.keys(parsed.auth).length === 1", "true"], async (subject) => {
  const result = await authResponse(subject, { ...authEnvelope(["org:ci"]), auth: { scopes: ["org:ci"], [SENTINEL]: SENTINEL } })
  return result.status === 1 && result.report.requests[0].auth_evidence.token_auth === "unavailable" && !result.output.includes(SENTINEL)
})
guard("only source-listed native GET scopes", ['"project:releases", "org:ci"]', '"project:releases", "org:ci", "future:canary"]'], async (subject) => {
  const result = await lookup404(subject, ["future:canary"])
  return result.report.requests[0].auth_evidence.native_get_scope === "no_listed_alternative_observed" && !result.output.includes("future:canary")
})
guard("complete envelope requires exact top-level keys", ["Object.keys(parsed).length === 3", "true"], async (subject) => {
  const result = await authResponse(subject, { ...authEnvelope(["org:ci"]), [SENTINEL]: SENTINEL })
  return result.report.requests[0].auth_evidence.complete_shape === "shape_unavailable" && result.status === 1 && !result.output.includes(SENTINEL)
})
guard("complete envelope version type", ['typeof parsed.version === "string"', "true"], async (subject) => {
  const result = await authResponse(subject, { ...authEnvelope(["org:ci"]), version: 0 })
  return result.report.requests[0].auth_evidence.complete_shape === "shape_unavailable" && result.status === 1
})
guard("user object cannot acquire a complete receipt", ["parsed.user === null", "true"], async (subject) => {
  const result = await authResponse(subject, { ...authEnvelope(["org:ci"]), user: { [SENTINEL]: { email: SENTINEL } } })
  return result.report.requests[0].auth_evidence.complete_shape === "shape_unavailable" && result.status === 1 && !result.output.includes(SENTINEL)
})
guard("type receipt cannot echo a response value", ['? { version: "string", auth: { scopes: "array<string>" }, user: "null" }', '? { version: parsed.version, auth: { scopes: "array<string>" }, user: "null" }'], async (subject) => {
  const result = await authResponse(subject, { ...authEnvelope(["org:ci", SENTINEL]), version: SENTINEL })
  return result.status === 0 && !result.output.includes(SENTINEL)
})
guard("unknown response keys cannot escape", ["return evidence", 'return { ...evidence, [Object.keys(parsed ?? {})[0]]: "echoed_key" }'], async (subject) => {
  const result = await authResponse(subject, { [SENTINEL]: SENTINEL, ...authEnvelope(["org:ci"]) })
  return !result.output.includes(SENTINEL)
})
guard("incomplete native lookup cannot appear healthy", ['result.outcome === "http_read_ok" && (', "("], async (subject) => {
  const result = await lookup404(subject, ["org:ci"])
  return result.status === 1 && result.report.outcome === "diagnostic_incomplete"
})
guard("unknown complete shape cannot authorize resource probes", ['auth.auth_evidence.complete_shape === "shape_unavailable"', "false"], async (subject) => {
  const result = await authResponse(subject, { ...authEnvelope(["org:ci"]), user: {} })
  return result.status === 1 && result.calls.length === 1
})
guard("no listed scope cannot authorize candidate reads", ['auth.auth_evidence.native_get_scope !== "listed_alternative_observed"', "false"], async (subject) => {
  const result = await authResponse(subject, authEnvelope([]))
  return result.status === 1 && result.calls.length === 1 && result.report.current_target_reads === "uncollected"
})

async function timeoutCheck(subject, total) {
  const originalTimeout = AbortSignal.timeout
  const keepAlive = setTimeout(() => {}, 1000)
  const timers = []
  let expectedReasonForwarded = false
  AbortSignal.timeout = (milliseconds) => {
    const signal = originalTimeout(timers.length === (total ? 0 : 1) ? 10 : 100)
    timers.push({ milliseconds, signal })
    return signal
  }
  try {
    const result = await execute(subject, { fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        expectedReasonForwarded = signal.reason === timers[total ? 0 : 1].signal.reason
        reject(new Error(SENTINEL))
      }, { once: true })
    }) })
    return expectedReasonForwarded && timers.map((timer) => timer.milliseconds).join() === "45000,10000"
      && result.status === 1 && result.report.requests.length === 1
      && result.report.requests[0].outcome === (total ? "total_deadline" : "request_timeout")
  } finally {
    AbortSignal.timeout = originalTimeout
    clearTimeout(keepAlive)
  }
}
guard("request deadline cancels transport", ["AbortSignal.any([timeout, totalSignal])", "AbortSignal.any([totalSignal])"], (subject) => timeoutCheck(subject, false))
guard("total deadline cancels transport", ["AbortSignal.any([timeout, totalSignal])", "AbortSignal.any([timeout])"], (subject) => timeoutCheck(subject, true))

guard("error detail class requires exact full envelope", ['matchesShape(parsed, { detail: "string" })', 'typeof parsed?.detail === "string"'], async (subject) => {
  const result = await candidateReads(subject, { respond: async (url) => url.includes("chunk-upload")
    ? new Response(JSON.stringify({ detail: "The requested resource does not exist", [SENTINEL]: SENTINEL }), { status: 404 }) : null })
  return result.report.requests[1].error_evidence.classification === "unavailable" && !result.output.includes(SENTINEL)
})
guard("error comparison is exact rather than arbitrary detail echo", ['evidence.classification = "resource_does_not_exist_detail"', 'evidence.classification = parsed.detail'], async (subject) => {
  const result = await candidateReads(subject, { respond: async (url) => url === destinations[1]
    ? new Response(JSON.stringify({ detail: "The requested resource does not exist" }), { status: 404 }) : null })
  return result.report.requests[1].error_evidence.classification === "resource_does_not_exist_detail" && !result.output.includes("The requested resource does not exist")
})
guard("native-compatible user agent", ['"User-Agent": "sentry-cli/3.6.0"', '"User-Agent": "other"'], async (subject) => {
  const result = await execute(subject)
  return result.calls.every(([, options]) => options.headers["User-Agent"] === "sentry-cli/3.6.0")
})
guard("every child stays isolated from credential and metadata", ['const childEnvironment = { PATH: env.PATH }', 'const childEnvironment = { ...env }'], async (subject) => {
  const credential = organizationToken("thomasluizon", "https://sentry.io", { iat: 1, region_url: "https://de.sentry.io" })
  const result = await candidateReads(subject, { credential })
  return result.children.every(([, argv, options]) => Object.keys(options.env).join() === "PATH"
    && !JSON.stringify([argv, options]).includes(credential) && !JSON.stringify([argv, options]).includes("region_url"))
})
guard("candidate organization cannot regress to previous slug", ['const LOOKUP = `${HOST}/api/0/organizations/${ORGANIZATION}/chunk-upload/`', 'const LOOKUP = `${HOST}/api/0/organizations/${PREVIOUS_ORGANIZATION}/chunk-upload/`'], async (subject) => {
  const result = await candidateReads(subject, { credential: organizationToken() })
  return result.calls.map(([url]) => url).join() === destinations.join() && result.status === 1
})
guard("alternate host cannot replace a fixed comparison", ['const LOOKUP = `${HOST}/', 'const LOOKUP = `https://untrusted.invalid/'], async (subject) => {
  const result = await execute(subject)
  return result.calls.map(([url]) => url).join() === destinations.join()
})
guard("project path remains a fixed bounded releases read", ['${PROJECT}/releases/?per_page=1', '${PROJECT}/'], async (subject) => {
  const result = await execute(subject)
  return result.calls.map(([url]) => url).join() === destinations.join()
})
guard("project response must actually be an array", ['Array.isArray(parsed) ? "json_array_fields_unused"', 'true ? "json_array_fields_unused"'], async (subject) => {
  const result = await candidateReads(subject, { respond: async (url) => url === destinations[2] ? new Response("{}") : null })
  return result.status === 1 && result.report.requests[2].body === "unsupported_project_shape" && result.report.current_target_reads === "unavailable"
})
guard("project failure cannot be overridden by auxiliary success", ['if (status === 404) return "resource_or_access_unavailable"', 'if (status === 404) return "http_read_ok"'], async (subject) => {
  const result = await candidateReads(subject, { respond: async (url) => url === destinations[2] ? new Response("[]", { status: 404 }) : null })
  return result.status === 1 && result.report.current_target_reads === "unavailable"
})
guard("project body label participates in the verdict", ['result.body === "json_array_fields_unused"', 'true'], async (subject) => {
  const result = await candidateReads(subject, { respond: async (url) => url === destinations[2] ? new Response("null") : null })
  return result.status === 1 && result.report.current_target_reads === "unavailable"
})
guard("old effective selection never becomes a green comparison", ['report.candidate_target_agreement === "matches_candidate"', 'true'], async (subject) => {
  const result = await candidateReads(subject, { credential: organizationToken() })
  return result.status === 1 && result.report.outcome === "native_target_differs_from_candidate" && result.report.current_target_reads === "route_access_observed"
})
guard("previous embedded selection cannot collapse into current defaults", ['organization: payload.org', 'organization: ORGANIZATION'], async (subject) => {
  const result = await candidateReads(subject, { credential: organizationToken() })
  return result.status === 1 && result.report.target_selection === "embedded_previous_organization"
    && result.report.candidate_target_agreement === "differs_from_candidate" && result.report.native_configuration_agreement === "differs_from_configured"
    && result.report.current_target_reads === "route_access_observed"
})
guard("native selection cannot come from env overrides", ['organization: payload.org', 'organization: env.SENTRY_ORG ?? payload.org'], async (subject) => {
  const result = await execute(subject, { env: { ...environment, SENTRY_AUTH_TOKEN: organizationToken(), SENTRY_ORG: "orbit-ai-habit-tracker" } })
  return result.status === 1 && result.report.target_selection === "embedded_previous_organization"
    && result.report.native_configuration_agreement === "differs_from_configured" && result.report.candidate_target_agreement === "differs_from_candidate"
    && result.report.current_target_reads === "route_access_observed"
})
guard("previous binding label stays distinct", ['payload.org === PREVIOUS_ORGANIZATION ?', 'false ?'], async (subject) => {
  const result = await candidateReads(subject, { credential: organizationToken() })
  return result.report.target_selection === "embedded_previous_organization" && result.status === 1
})
guard("index prerequisite requires reported authentication", ['if (stopped || auth.outcome !== "http_read_ok" || auth.auth_evidence.token_auth !== "reported"\n    || auth.auth_evidence.complete_shape === "shape_unavailable"\n    || auth.auth_evidence.native_get_scope !== "listed_alternative_observed") return', 'if (stopped) return'], async (subject) => {
  const result = await authResponse(subject, authEnvelope(null))
  return result.calls.length === 1 && result.report.requests[0].auth_evidence.token_auth === "not_reported"
})

async function authCases() {
  // https://github.com/getsentry/sentry/blob/d4ac7c872436deb5d01d1e8673bae061758e3e0b/src/sentry/api/bases/organization.py#L182-L187
  for (const scope of ["project:read", "project:write", "project:admin", "project:releases", "org:ci"]) {
    const result = await authResponse(diagnostic, authEnvelope([scope]))
    const evidence = result.report.requests[0].auth_evidence
    T(`android-sentry auth: source-listed ${scope} yields fixed evidence and complete types`, result.status === 0
      && result.calls.length === 3 && evidence.token_auth === "reported" && evidence.native_get_scope === "listed_alternative_observed"
      && JSON.stringify(evidence.complete_shape) === JSON.stringify(reportedShape) && !result.output.includes(scope))
  }
  const anonymous = await authResponse(diagnostic, authEnvelope(null))
  T("android-sentry auth: null auth is not a rejected-credential claim", anonymous.status === 1
    && anonymous.report.requests[0].outcome === "http_read_ok"
    && JSON.stringify(anonymous.report.requests[0].auth_evidence) === JSON.stringify({
      token_auth: "not_reported", native_get_scope: "unavailable", complete_shape: anonymousShape,
    }))
  for (const scopes of [[], [""], ["future:canary"], [SENTINEL, "unrelated:scope"], ["org:ci", SENTINEL]]) {
    const result = await authResponse(diagnostic, authEnvelope(scopes))
    const listed = scopes.includes("org:ci")
    const evidence = result.report.requests[0].auth_evidence
    T("android-sentry auth: open string scopes preserve auth without printing values", result.status === (listed ? 0 : 1)
      && result.calls.length === (listed ? 3 : 1) && evidence.token_auth === "reported" && evidence.native_get_scope === (listed ? "listed_alternative_observed" : "no_listed_alternative_observed")
      && JSON.stringify(evidence.complete_shape) === JSON.stringify(reportedShape)
      && !result.output.includes(SENTINEL) && !result.output.includes("future:canary") && !result.output.includes("unrelated:scope"))
  }
  for (const auth of [undefined, {}, [], true, 1, SENTINEL, { scopes: null }, { scopes: {} }, { scopes: "org:ci" },
    { scopes: [1] }, { scopes: [null] }, { scopes: [false] }, { scopes: [["org:ci"]] }, { scopes: [{ [SENTINEL]: SENTINEL }] },
    { scopes: ["org:ci", null] }, { scopes: ["org:ci"], [SENTINEL]: SENTINEL }]) {
    const result = await authResponse(diagnostic, { version: "0", auth, user: null })
    T("android-sentry auth: missing or unsupported auth shape remains unavailable", result.status === 1
      && JSON.stringify(result.report.requests[0].auth_evidence) === JSON.stringify(unavailableAuth) && result.calls.length === 1 && !result.output.includes(SENTINEL))
  }
  for (const envelope of [null, [], false, 42, SENTINEL]) {
    const result = await authResponse(diagnostic, envelope)
    T("android-sentry auth: scalar and array envelopes cannot report auth", result.status === 1
      && result.report.requests[0].body === "malformed_json"
      && JSON.stringify(result.report.requests[0].auth_evidence) === JSON.stringify(unavailableAuth) && result.calls.length === 1 && !result.output.includes(SENTINEL))
  }
  for (const envelope of [
    { auth: { scopes: ["org:ci"] }, user: null }, { version: "0", auth: { scopes: ["org:ci"] } },
    { ...authEnvelope(["org:ci"]), version: 0 }, { ...authEnvelope(["org:ci"]), user: { [SENTINEL]: { email: SENTINEL } } },
    { ...authEnvelope(["org:ci"]), user: [] }, { ...authEnvelope(["org:ci"]), user: SENTINEL },
    { ...authEnvelope(["org:ci"]), [SENTINEL]: SENTINEL },
  ]) {
    const result = await authResponse(diagnostic, envelope)
    T("android-sentry auth: supported auth stays separate from unavailable complete shape", result.status === 1
      && result.report.requests[0].auth_evidence.token_auth === "reported"
      && result.report.requests[0].auth_evidence.native_get_scope === "listed_alternative_observed"
      && result.report.requests[0].auth_evidence.complete_shape === "shape_unavailable" && result.calls.length === 1 && !result.output.includes(SENTINEL))
  }
  await authTransportCases()
}

async function authTransportCases() {
  for (const status of [201, 400, 401, 403, 404, 429, 500, 503, 302]) {
    const result = await authResponse(diagnostic, authEnvelope(["org:ci"]), { authStatus: status })
    T(`android-sentry auth: HTTP ${status} keeps transport and auth evidence separate`, result.status === (status === 201 ? 0 : 1)
      && result.report.requests[0].status === status
      && (status === 201 ? result.report.requests[0].auth_evidence.token_auth === "reported"
        : JSON.stringify(result.report.requests[0].auth_evidence) === JSON.stringify(unavailableAuth)))
  }
  for (const body of [SENTINEL, new Uint8Array([255]), null]) {
    const result = await execute(diagnostic, { fetchImpl: async (url) => new Response(url.includes("chunk-upload") ? "{}" : body) })
    T("android-sentry auth: unreadable bounded JSON retains unavailable evidence", result.status === 1
      && result.report.requests[0].body === "malformed_json"
      && JSON.stringify(result.report.requests[0].auth_evidence) === JSON.stringify(unavailableAuth) && result.calls.length === 1 && !result.output.includes(SENTINEL))
  }
  for (const oversized of [false, true]) {
    let cancelled = false
    let released = false
    const response = { status: 200, headers: new Headers(), body: { getReader: () => ({
      read: async () => { if (!oversized) throw new Error(SENTINEL); return { value: new Uint8Array(65537), done: false } },
      cancel: async () => { cancelled = true }, releaseLock: () => { released = true },
    }) } }
    const result = await execute(diagnostic, { fetchImpl: async (url) => url.includes("chunk-upload") ? new Response("{}") : response })
    T("android-sentry auth: oversized and interrupted streams cancel and release without body escape", result.status === 1 && cancelled && released
      && result.calls.length === 1 && result.report.requests[0].body === (oversized ? "response_too_large" : "unavailable")
      && JSON.stringify(result.report.requests[0].auth_evidence) === JSON.stringify(unavailableAuth) && result.calls.length === 1 && !result.output.includes(SENTINEL))
  }
  const privateToken = organizationToken("thomasluizon", "https://sentry.io", { [SENTINEL]: { email: SENTINEL } })
  const privateResult = await execute(diagnostic, { env: { ...environment, SENTRY_AUTH_TOKEN: privateToken, PRIVATE_ENV_CANARY: SENTINEL },
    fetchImpl: async (url, options) => {
      if (options.headers.Authorization !== `Bearer ${privateToken}`) throw new Error("test credential was not forwarded")
      return new Response(JSON.stringify(url.includes("chunk-upload") ? { [SENTINEL]: privateToken } : {
        ...authEnvelope(["org:ci", SENTINEL]), version: SENTINEL, user: { [SENTINEL]: { email: SENTINEL } }, [SENTINEL]: privateToken,
      }), { headers: { "X-Privacy-Canary": `${SENTINEL} ${privateToken}` } })
    } })
  T("android-sentry auth: values, unknown keys, headers, user fields and decoded extras stay out of output and children", privateResult.status === 1
    && privateResult.calls.length === 1 && !privateResult.output.includes(SENTINEL) && !privateResult.output.includes(privateToken)
    && privateResult.children.every(([, argv, options]) => !JSON.stringify([argv, options]).includes(SENTINEL)
      && !JSON.stringify([argv, options]).includes(privateToken) && Object.keys(options.env).join() === "PATH"))
}

function outputStreamCases(source, stageModule) {
  for (const [suffix, credential, expectedStatus] of [["current", organizationToken("orbit-ai-habit-tracker", null, { ignored: SENTINEL }), 0],
    ["old", organizationToken("thomasluizon", null, { ignored: SENTINEL }), 1],
    ["defaults", token, 0], ["prefixed-defaults", `sntryu_${token}`, 0]]) {
    const options = `{
      root: ${JSON.stringify(REPO_ROOT)}, env: ${JSON.stringify({ ...environment, SENTRY_AUTH_TOKEN: credential })},
      runProcess: async (file) => ({
        status: 0, stdout: file === "git" ? ${JSON.stringify(SOURCE)} : "sentry-cli 3.6.0", stderr: ${JSON.stringify(SENTINEL)}
      }),
      fetchImpl: async (url) => new Response(JSON.stringify(url === "https://sentry.io/api/0/"
        ? { version: ${JSON.stringify(SENTINEL)}, auth: { scopes: ["org:ci", ${JSON.stringify(SENTINEL)}] }, user: null }
        : url.includes("/releases/") ? [{ [${JSON.stringify(SENTINEL)}]: { nested: ${JSON.stringify(SENTINEL)} } }]
        : { ignored: ${JSON.stringify(SENTINEL)} }), { headers: { "X-Private": ${JSON.stringify(SENTINEL)} } })
    }`
    const entry = stageModule(`cli-stream-${suffix}`, source.replace("const result = await main()", `const result = await main([], ${options})`))
    const result = spawnSync(process.execPath, [entry], { encoding: "utf8", timeout: 5000, maxBuffer: 8192 })
    const output = expectedStatus === 0 ? result.stdout : result.stderr
    const other = expectedStatus === 0 ? result.stderr : result.stdout
    T("android-sentry: actual entry point sanitizes current and old-bound comparison receipts on the selected stream", result.status === expectedStatus
      && other === "" && !output.includes(SENTINEL) && !output.includes(credential) && !output.includes("sntrys_")
      && JSON.parse(output).requests.length === 3 && JSON.parse(output).requests[0].auth_evidence.token_auth === "reported"
      && JSON.parse(output).native_upload === "native_upload_unverified" && Buffer.byteLength(output) <= 8192)
  }
}

async function configuredTargetRegressionCases() {
  const require = createRequire(import.meta.url)
  const { getSentryProperties } = require("../../node_modules/@sentry/react-native/plugin/build/withSentry.js")
  const app = JSON.parse(readFileSync(join(REPO_ROOT, "apps/mobile/app.json"), "utf8"))
  const options = app.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === "@sentry/react-native/expo")[1]
  T("android-sentry alignment: tracked plugin selects the current organization with the same host and project",
    JSON.stringify(options) === JSON.stringify({ url: "https://sentry.io/", organization: "orbit-ai-habit-tracker", project: "orbit-mobile" }))
  const originalVariant = process.env.ORBIT_APP_VARIANT
  try {
    for (const variant of ["production", "staging"]) {
      process.env.ORBIT_APP_VARIANT = variant
      const config = require("../../apps/mobile/app.config.js")()
      const plugin = config.plugins.find((entry) => Array.isArray(entry) && entry[0] === "@sentry/react-native/expo")[1]
      const properties = getSentryProperties(plugin).split("\n")
      T(`android-sentry alignment: actual ${variant} plugin producer emits current native defaults without a token`,
        properties.includes("defaults.org=orbit-ai-habit-tracker") && properties.includes("defaults.url=https://sentry.io/")
        && properties.includes("defaults.project=orbit-mobile") && !properties.some((line) => line.startsWith("auth.token=")))
    }
  } finally {
    if (originalVariant === undefined) delete process.env.ORBIT_APP_VARIANT
    else process.env.ORBIT_APP_VARIANT = originalVariant
  }
  for (const [syntax, credential, selection, current] of [
    ["previous embedded", organizationToken(), "embedded_previous_organization", false],
    ["current embedded", organizationToken("orbit-ai-habit-tracker"), "embedded_current_organization", true],
    ["legacy defaults", token, "configured_defaults", true],
    ["prefixed legacy defaults", `sntryu_${token}`, "configured_defaults", true],
  ]) {
    const result = await candidateReads(diagnostic, { credential })
    T(`android-sentry alignment: ${syntax} agrees only with its actual current native selection`,
      result.report.expected.organization === "orbit-ai-habit-tracker"
      && JSON.stringify(result.report.expected) === JSON.stringify(result.report.comparison_target)
      && result.report.target_selection === selection && result.status === (current ? 0 : 1)
      && result.report.native_configuration_agreement === (current ? "matches_configured" : "differs_from_configured")
      && result.report.candidate_target_agreement === (current ? "matches_candidate" : "differs_from_candidate")
      && result.report.outcome === (current ? "current_target_reads_observed" : "native_target_differs_from_candidate")
      && result.report.current_target_reads === "route_access_observed"
      && result.calls.map(([url]) => url).join() === destinations.join() && result.report.native_upload === "native_upload_unverified")
  }
}

async function nativeOverrideCases() {
  for (const credential of [token, `sntryu_${token}`]) {
    for (const override of [
      { SENTRY_ORG: "thomasluizon" }, { SENTRY_ORG: SENTINEL }, { SENTRY_ORG: "" },
      { SENTRY_URL: `https://untrusted.invalid/${SENTINEL}` }, { SENTRY_URL: "" },
      { SENTRY_PROJECT: SENTINEL }, { SENTRY_PROJECT: "" },
    ]) {
      const result = await execute(diagnostic, { env: { ...environment, SENTRY_AUTH_TOKEN: credential, ...override } })
      T("android-sentry defaults: conflicting native overrides refuse locally without choosing destinations or exposing values",
        result.status === 1 && result.report.outcome === "native_override_mismatch" && result.calls.length === 0
        && result.children.length === 0 && result.report.native_upload === "native_upload_unverified"
        && !result.output.includes(SENTINEL) && !result.output.includes(credential))
    }
    const matching = await execute(diagnostic, { env: { ...environment, SENTRY_AUTH_TOKEN: credential,
      SENTRY_ORG: "orbit-ai-habit-tracker", SENTRY_URL: "https://sentry.io////", SENTRY_PROJECT: "orbit-mobile" } })
    T("android-sentry defaults: matching native overrides retain the real configured-default classification", matching.status === 0
      && matching.report.target_selection === "configured_defaults" && matching.report.native_configuration_agreement === "matches_configured"
      && matching.calls.map(([url]) => url).join() === destinations.join())
  }
  for (const org of ["thomasluizon", "orbit-ai-habit-tracker"]) {
    const current = org === "orbit-ai-habit-tracker"
    const embedded = await execute(diagnostic, { env: { ...environment, SENTRY_AUTH_TOKEN: organizationToken(org),
      SENTRY_ORG: current ? "thomasluizon" : "orbit-ai-habit-tracker", SENTRY_URL: SENTINEL, SENTRY_PROJECT: "orbit-mobile" } })
    T("android-sentry embedded: org and nonempty URL win over conflicting env suggestions", embedded.status === (current ? 0 : 1)
      && embedded.report.target_selection === (current ? "embedded_current_organization" : "embedded_previous_organization")
      && embedded.report.native_configuration_agreement === (current ? "matches_configured" : "differs_from_configured")
      && embedded.calls.map(([url]) => url).join() === destinations.join() && !embedded.output.includes(SENTINEL))
    for (const url of [null, ""]) {
      const fallback = await execute(diagnostic, { env: { ...environment, SENTRY_AUTH_TOKEN: organizationToken(org, url), SENTRY_URL: SENTINEL } })
      T("android-sentry embedded: conflicting fallback host is refused without credential forwarding", fallback.status === 1
        && fallback.report.outcome === "native_override_mismatch" && fallback.calls.length === 0 && fallback.children.length === 0 && !fallback.output.includes(SENTINEL))
    }
    const project = await execute(diagnostic, { env: { ...environment, SENTRY_AUTH_TOKEN: organizationToken(org), SENTRY_PROJECT: SENTINEL } })
    T("android-sentry embedded: project override cannot silently agree with the fixed project", project.status === 1
      && project.report.outcome === "native_override_mismatch" && project.calls.length === 0 && !project.output.includes(SENTINEL))
    for (const url of [undefined, 42, false, { [SENTINEL]: SENTINEL }]) {
      const credential = organizationToken(org, null, { url })
      const result = await candidateReads(diagnostic, { credential })
      T("android-sentry embedded: omitted and wrong-type URLs refuse for both recognized organizations", result.status === 1
        && result.report.outcome === "credential_format_unrecognized" && result.calls.length === 0 && result.children.length === 0
        && !result.output.includes(SENTINEL) && !result.output.includes(credential))
    }
  }
}

async function currentTargetRegressionCases() {
  for (const [syntax, credential] of [["old embedded", organizationToken()],
    ["current embedded", organizationToken("orbit-ai-habit-tracker")], ["legacy defaults", token]]) {
    const result = await execute(diagnostic, {
      env: { ...environment, SENTRY_AUTH_TOKEN: credential },
      fetchImpl: async (url) => new Response(JSON.stringify(url === "https://sentry.io/api/0/"
        ? authEnvelope(["org:ci"]) : url.includes("/releases/") ? [] : {})),
    })
    T(`android-sentry current-target regression: ${syntax} reaches exactly index, current organization and fixed project`,
      result.calls.map(([url]) => url).join(" ") === "https://sentry.io/api/0/ https://sentry.io/api/0/organizations/orbit-ai-habit-tracker/chunk-upload/ https://sentry.io/api/0/projects/orbit-ai-habit-tracker/orbit-mobile/releases/?per_page=1")
  }
}

export const cases = async () => {
  await configuredTargetRegressionCases()
  await nativeOverrideCases()
  await currentTargetRegressionCases()
  await candidateCases()
  await authCases()
  const source = readFileSync(join(REPO_ROOT, "tools/android-sentry-diagnostic.mjs"), "utf8")
  const stageModule = (name, replacement) => {
    const path = stage(`android-sentry/${name}/tools/android-sentry-diagnostic.mjs`, replacement)
    mkdirSync(join(dirname(path), "lib"), { recursive: true })
    cpSync(join(REPO_ROOT, "tools/lib/bounded-process.mjs"), join(dirname(path), "lib/bounded-process.mjs"))
    return path
  }
  const loadMutant = (name, replacement) => import(pathToFileURL(stageModule(name, replacement)).href)
  outputStreamCases(source, stageModule)
  for (const entry of guards) {
    T(`android-sentry: ${entry.name}`, await entry.verify(diagnostic))
    const [before, after] = entry.mutation
    T(`android-sentry: ${entry.name} mutation targets implementation`, source.includes(before) && source.replace(before, after) !== source)
    const mutant = await loadMutant(entry.name.replaceAll(" ", "-"), source.replace(before, after))
    T(`android-sentry: ${entry.name} rejects owning negative control`, !await entry.verify(mutant))
  }
  const healthy = await execute(diagnostic)
  T("android-sentry: main calls the pinned nested CLI with no credential environment or argv", healthy.status === 0
    && healthy.children[1][1][0] === join(REPO_ROOT, "node_modules/@sentry/react-native/node_modules/@sentry/cli/bin/sentry-cli")
    && healthy.children.every(([, args, options]) => !JSON.stringify([args, options]).includes(token) && options.maxBuffer === 8192 && options.timeoutMs === 5000))
  for (const credential of [organizationToken("orbit-ai-habit-tracker"), organizationToken("orbit-ai-habit-tracker", "https://sentry.io/"), organizationToken("orbit-ai-habit-tracker", null)]) {
    const result = await execute(diagnostic, { env: { ...environment, SENTRY_AUTH_TOKEN: credential } })
    T("android-sentry: source-confirmed credential target is accepted without payload output", result.status === 0 && !result.output.includes(credential))
  }
  // CLI 3.6.0 config.rs:218-227 trims every trailing slash before validating the root URL.
  // https://github.com/getsentry/sentry-cli/blob/3.6.0/src/config.rs#L218
  for (const url of ["https://sentry.io//", "https://sentry.io/////"]) {
    const credential = organizationToken("orbit-ai-habit-tracker", url)
    const result = await execute(diagnostic, { env: { ...environment, SENTRY_AUTH_TOKEN: credential } })
    T("android-sentry: repeated trailing slashes retain the private match and fixed GETs", result.status === 0
      && result.report.target_selection === "embedded_current_organization"
      && result.calls.map(([destination]) => destination).join(" ") === "https://sentry.io/api/0/ https://sentry.io/api/0/organizations/orbit-ai-habit-tracker/chunk-upload/ https://sentry.io/api/0/projects/orbit-ai-habit-tracker/orbit-mobile/releases/?per_page=1"
      && result.calls.every(([, options]) => options.method === "GET" && options.redirect === "manual" && options.headers.Authorization === `Bearer ${credential}`)
      && !result.output.includes(credential) && !result.output.includes(url) && Buffer.byteLength(result.output) <= 8192
      && !JSON.stringify(result.children).includes(credential))
  }
  for (const credential of ["malformed", "sntrys_", `${organizationToken()}_extra`, organizationToken().replace("sntrys_", "other_"),
    `sntrys_${Buffer.from("not json").toString("base64")}_${Buffer.alloc(32).toString("base64").replace(/=+$/, "")}`,
    `sntrys_${Buffer.from([255]).toString("base64")}_${Buffer.alloc(32).toString("base64").replace(/=+$/, "")}`]) {
    const result = await execute(diagnostic, { env: { ...environment, SENTRY_AUTH_TOKEN: credential } })
    T("android-sentry: malformed syntax is unrecognized locally without claiming server rejection", result.report.outcome === "credential_format_unrecognized"
      && result.status === 1 && result.calls.length === 0 && result.children.length === 0 && !result.output.includes(credential))
  }
  const emptyUrl = await execute(diagnostic, { env: { ...environment, SENTRY_AUTH_TOKEN: organizationToken("orbit-ai-habit-tracker", "") } })
  T("android-sentry: explicit empty token URL retains configured-host fallback", emptyUrl.status === 0 && emptyUrl.report.target_selection === "embedded_current_organization")
  const omittedUrlPayload = Buffer.from(JSON.stringify({ org: "thomasluizon" })).toString("base64")
  const omittedUrlToken = `sntrys_${omittedUrlPayload}_${Buffer.alloc(32, 1).toString("base64").replace(/=+$/, "")}`
  const omittedUrl = await execute(diagnostic, { env: { ...environment, SENTRY_AUTH_TOKEN: omittedUrlToken } })
  T("android-sentry: omitted token URL remains unrecognized before processes or requests", omittedUrl.status === 1
    && omittedUrl.report.outcome === "credential_format_unrecognized" && omittedUrl.calls.length === 0
    && omittedUrl.children.length === 0 && !omittedUrl.output.includes(omittedUrlToken))
  for (const url of ["http://sentry.io//", "https://untrusted.invalid//", "https://sentry.io/path//", "https://sentry.io/?query=private//", "https://sentry.io/#private//", "https://private@sentry.io//", "https://sentry.io.untrusted.invalid//", "/", "//"]) {
    const credential = organizationToken("orbit-ai-habit-tracker", url)
    const result = await execute(diagnostic, { env: { ...environment, SENTRY_AUTH_TOKEN: credential } })
    T("android-sentry: slash normalization cannot admit a changed destination or expose its payload", result.status === 1
      && result.report.outcome === "embedded_host_mismatch" && result.calls.length === 0 && result.children.length === 0
      && !result.output.includes(credential) && !result.output.includes('"url"'))
  }
  for (const status of [200, 401, 403, 404, 429, 500, 503]) {
    const outcomes = { 200: "http_read_ok", 401: "authentication_rejected", 403: "access_or_scope_unavailable", 404: "resource_or_access_unavailable", 429: "rate_limited", 500: "service_failure", 503: "service_failure" }
    const result = await execute(diagnostic, { fetchImpl: async (url) => new Response(JSON.stringify(url.includes("chunk-upload") ? { arbitrary_owned_boundary: SENTINEL, auth: { successful: true } } : url.includes("/releases/") ? [] : authEnvelope(["org:ci"])), { status }) })
    T(`android-sentry: HTTP ${status} lookup is classified without parsing an API field`, result.report.requests[0].outcome === outcomes[status] && result.status === (status === 200 ? 0 : 1) && !result.output.includes(SENTINEL) && !result.output.includes("successful"))
  }
  const network = await execute(diagnostic, { fetchImpl: async () => { throw new Error(`Authorization: Bearer ${token}\n${SENTINEL}`) } })
  T("android-sentry: network/TLS exception is bounded, sanitized and stops requests", network.status === 1 && network.report.requests.length === 1 && network.report.requests[0].outcome === "network_or_tls_failure" && !network.output.includes(SENTINEL) && !network.output.includes(token))
  const interrupted = await execute(diagnostic, { fetchImpl: async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error(SENTINEL)) } })) })
  T("android-sentry: interrupted response is a transport failure, not malformed JSON", interrupted.status === 1 && interrupted.report.requests[0].outcome === "network_or_tls_failure" && interrupted.report.requests.length === 1 && !interrupted.output.includes(SENTINEL))
  const processFailure = await execute(diagnostic, { runProcess: async () => ({ ...childResult(`${token}\n${SENTINEL}`), status: 1, error: new Error(SENTINEL) }) })
  T("android-sentry: subprocess stdout, stderr and exceptions never reach main output", processFailure.status === 1 && !processFailure.output.includes(SENTINEL) && !processFailure.output.includes(token))
  for (const argv of [[SENTINEL], ["--url", SENTINEL], ["--org", SENTINEL], ["--project", SENTINEL], ["--method", "POST"], ["--script", SENTINEL], ["--help", SENTINEL]]) {
    const result = await diagnostic.main(argv)
    T("android-sentry: unsupported arguments are refused without echo", result.status === 2 && !result.output.includes(SENTINEL))
  }
  const fourthSource = source.replace('await request("current_project_releases", PROJECT_RELEASES, "project_releases")',
    'await request("current_project_releases", PROJECT_RELEASES, "project_releases")\n  await request("fourth", PROJECT_RELEASES, "project_releases")')
  const boundedFourth = await loadMutant("fourth-request-refused", fourthSource)
  const unboundedFourth = await loadMutant("request-cap-removed", fourthSource.replace('if (report.requests.length >= REQUEST_LIMIT) throw new Error("request_limit")', ''))
  const bounded = await execute(boundedFourth)
  const unbounded = await execute(unboundedFourth)
  T("android-sentry: attempted fourth request is refused by the finite counter and its owner fault", bounded.status === 1
    && bounded.calls.length === 3 && bounded.report.outcome === "request_limit" && unbounded.calls.length === 4)
  const oversized = await loadMutant("oversized-owned-output", source.replace('evidence_limits: "HTTP reads only;', `evidence_limits: "${"x".repeat(8192)}HTTP reads only;`))
  const unsafeOverflow = await loadMutant("output-cap-removed", source.replace('evidence_limits: "HTTP reads only;', `evidence_limits: "${"x".repeat(8192)}HTTP reads only;`).replace("Buffer.byteLength(output) > OUTPUT_LIMIT", "false"))
  T("android-sentry: output cap owns its negative control", (await execute(oversized)).report.outcome === "output_refused" && Buffer.byteLength((await execute(unsafeOverflow)).output) > 8192)
  const leakingSource = source.replace('outcome: "unavailable", source: null', 'outcome: "unavailable", injected_fault: env.SENTRY_AUTH_TOKEN, source: null')
  const leaking = await loadMutant("owned-output-fault", leakingSource)
  const unsafeLeak = await loadMutant("secret-boundary-removed", leakingSource.replace("(token?.trim() && output.includes(token))", "false"))
  T("android-sentry: secret output refusal owns its negative control", (await execute(leaking, { env: environment })).report.outcome === "output_refused" && (await execute(unsafeLeak, { env: environment })).output.includes(token))

  await workflowCases()
  const cli = join(REPO_ROOT, "node_modules/@sentry/react-native/node_modules/@sentry/cli/bin/sentry-cli")
  const actual = spawnSync(process.execPath, [cli, "--version"], { env: { PATH: process.env.PATH }, encoding: "utf8", timeout: 5000 })
  T("android-sentry: actual nested native version is pinned without auth or info operations", actual.status === 0 && actual.stdout.trim() === "sentry-cli 3.6.0")
}

async function workflowCases() {
  const workflowSource = readFileSync(join(REPO_ROOT, ".github/workflows/android-sentry-diagnostic.yml"), "utf8")
  const workflow = yaml.load(workflowSource)
  const steps = workflow.jobs.diagnose.steps
  const checks = [
    ["main and expected source gate", (value) => value.jobs.diagnose.if === "github.ref == 'refs/heads/main' && inputs.expected_source_sha == github.sha", (value) => { value.jobs.diagnose.if = "true" }],
    ["explicit invalid-source refusal", (value) => value.jobs["reject-source"].if === "github.ref != 'refs/heads/main' || inputs.expected_source_sha != github.sha" && value.jobs["reject-source"].steps[0].run.includes("exit 1"), (value) => { value.jobs["reject-source"].steps[0].run = "exit 0" }],
    ["minimal permissions", (value) => JSON.stringify(value.permissions) === '{"contents":"read"}', (value) => { value.permissions.contents = "write" }],
    ["serialized release target", (value) => value.concurrency.group === "android-design-release-production" && value.concurrency["cancel-in-progress"] === false, (value) => { value.concurrency.group = "independent" }],
    ["only scalar source input", (value) => Object.keys(value.on.workflow_dispatch.inputs).join() === "expected_source_sha", (value) => { value.on.workflow_dispatch.inputs.url = {} }],
    ["production binding", (value) => value.jobs.diagnose.environment.name === "production" && value.jobs.diagnose.environment.deployment === false, (value) => { value.jobs.diagnose.environment.name = "staging" }],
    ["immutable checkout", (value) => value.jobs.diagnose.steps[0].with.ref === "${{ github.sha }}" && value.jobs.diagnose.steps[0].with["persist-credentials"] === false, (value) => { value.jobs.diagnose.steps[0].with.ref = "main" }],
    ["real helper wiring and tracing disabled", (value) => value.jobs.diagnose.steps.at(-1).run === "set +x\nset -euo pipefail\nnode tools/android-sentry-diagnostic.mjs\n", (value) => { value.jobs.diagnose.steps.at(-1).run = "echo unused" }],
    ["exact existing secret, probe step only", (value) => value.jobs.diagnose.steps.at(-1).env.SENTRY_AUTH_TOKEN === "${{ secrets.SENTRY_AUTH_TOKEN }}" && !value.jobs.diagnose.env && value.jobs.diagnose.steps.slice(0, -1).every((step) => !step.env?.SENTRY_AUTH_TOKEN), (value) => { value.jobs.diagnose.steps.at(-1).env.SENTRY_AUTH_TOKEN = "other" }],
    ["input never interpolated into logs, argv or env", (value) => value.jobs.diagnose.steps.at(-1).env.EXPECTED_SOURCE_SHA === "${{ github.sha }}" && !JSON.stringify(value.jobs.diagnose.steps).includes("inputs."), (value) => { value.jobs.diagnose.steps.at(-1).env.EXPECTED_SOURCE_SHA = "${{ inputs.expected_source_sha }}" }],
    ["no publication, cache or artifact steps", (value) => value.jobs.diagnose.steps.length === 4 && value.jobs.diagnose.steps[2].run === "npm ci" && value.jobs.diagnose.steps[1].with.cache === undefined, (value) => { value.jobs.diagnose.steps.push({ run: "upload" }) }],
    ["job deadline", (value) => value.jobs.diagnose["timeout-minutes"] === 5, (value) => { value.jobs.diagnose["timeout-minutes"] = 60 }],
  ]
  for (const [name, verify, mutate] of checks) {
    T(`android-sentry workflow: ${name}`, verify(workflow))
    const broken = structuredClone(workflow)
    mutate(broken)
    T(`android-sentry workflow: ${name} rejects owning negative control`, !verify(broken))
  }
  T("android-sentry workflow: secret follows locked installation without raw summary/artifact output", steps.at(-1).name === "Probe native upload and resource routing" && !/GITHUB_STEP_SUMMARY|upload-artifact|SENTRY_LOG_LEVEL|--debug/.test(workflowSource))
}
