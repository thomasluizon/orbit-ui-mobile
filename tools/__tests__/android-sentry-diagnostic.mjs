import { spawnSync } from "node:child_process"
import { readFileSync, mkdirSync, writeFileSync, cpSync } from "node:fs"
import { dirname, join } from "node:path"
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
const unavailableAuth = { token_auth: "unavailable", native_get_scope: "unavailable", organization_get_scope: "unavailable", complete_shape: "shape_unavailable" }

// Source-defined CONTROL serializer fixture, never an observed private response:
// https://github.com/getsentry/sentry/blob/d4ac7c872436deb5d01d1e8673bae061758e3e0b/src/sentry/api/serializers/models/organization.py#L314-L402
const organizationRecord = () => ({
  id: "123456789", slug: "current-private-slug", name: SENTINEL,
  status: { id: "active", name: SENTINEL }, dateCreated: "2020-01-01T00:00:00Z",
  isEarlyAdopter: false, require2FA: false, allowMemberInvite: true,
  allowMemberProjectCreation: true, allowSuperuserAccess: true,
  avatar: { avatarType: "letter_avatar", avatarUuid: null, avatarUrl: null },
  links: { organizationUrl: `https://untrusted.invalid/${SENTINEL}`, regionUrl: "https://de.sentry.io/" },
  hasAuthProvider: false,
})

async function resourceRouting(subject, { scopes = ["org:ci", "org:read"], record = organizationRecord(),
  credential = organizationToken(), respond } = {}) {
  return execute(subject, {
    env: { ...environment, SENTRY_AUTH_TOKEN: credential },
    fetchImpl: async (url, options) => {
      if (respond) {
        const response = await respond(url, options)
        if (response) return response
      }
      if (url === "https://sentry.io/api/0/") return new Response(JSON.stringify(authEnvelope(scopes)))
      if (url === "https://sentry.io/api/0/organizations/") return new Response(JSON.stringify([record]))
      if (url === "https://sentry.io/api/0/organizations/thomasluizon/chunk-upload/") {
        return new Response(JSON.stringify({ detail: "The requested resource does not exist" }), {
          status: 404, headers: { "X-Sentry-Proxy-URL": SENTINEL },
        })
      }
      return new Response(JSON.stringify({ [SENTINEL]: SENTINEL }))
    },
  })
}

async function resourceRegressionCases() {
  const result = await resourceRouting(diagnostic)
  T("android-sentry routing regression: authenticated native 404 collects one ID and one observed-region comparison", result.calls.map(([url]) => url).join(" ")
    === "https://sentry.io/api/0/organizations/thomasluizon/chunk-upload/ https://sentry.io/api/0/ https://sentry.io/api/0/organizations/ https://sentry.io/api/0/organizations/123456789/chunk-upload/ https://de.sentry.io/api/0/organizations/123456789/chunk-upload/")
  T("android-sentry routing regression: native failure and global auth remain independent of healthy comparisons", result.status === 1
    && result.report.requests[0].outcome === "resource_or_access_unavailable"
    && result.report.requests[1].auth_evidence.token_auth === "reported"
    && result.report.requests[0].error_evidence?.classification === "resource_does_not_exist_detail"
    && result.report.requests[0].proxy_header_present === true && !result.output.includes(SENTINEL))
}

async function routingCases() {
  for (const scope of ["org:read", "org:write", "org:admin"]) {
    const result = await resourceRouting(diagnostic, { scopes: ["org:ci", scope] })
    const evidence = result.report.requests[2].organization_evidence
    T("android-sentry routing: each existing org-list alternative permits only one complete private record", result.calls.length === 5
      && result.report.requests[1].auth_evidence.organization_get_scope === "listed_alternative_observed"
      && evidence.numeric_id === "decimal_observed" && evidence.slug_comparison === "differs_from_expected" && evidence.region === "de"
      && evidence.complete_shape[0].dateCreated === "string"
      && !result.output.includes(scope) && !result.output.includes("current-private-slug") && !result.output.includes("123456789")
      && !result.output.includes(SENTINEL) && Buffer.byteLength(result.output) <= 8192)
  }
  const match = await resourceRouting(diagnostic, { record: { ...organizationRecord(), slug: "thomasluizon" } })
  T("android-sentry routing: current slug match is a fixed comparison only", match.report.requests[2].organization_evidence.slug_comparison === "matches_expected")
  const unknownRows = [[], [organizationRecord(), organizationRecord()], {}, [null], [{ ...organizationRecord(), [SENTINEL]: SENTINEL }]]
  for (const key of Object.keys(organizationRecord())) {
    const missing = organizationRecord()
    delete missing[key]
    unknownRows.push([missing], [{ ...organizationRecord(), [key]: null }])
  }
  for (const key of ["avatar", "links", "status"]) unknownRows.push([{ ...organizationRecord(), [key]: { ...organizationRecord()[key], [SENTINEL]: SENTINEL } }])
  for (const rows of unknownRows) {
    const result = await resourceRouting(diagnostic, { respond: async (url) => url.endsWith("/organizations/") ? new Response(JSON.stringify(rows)) : null })
    T("android-sentry routing: missing, extra, multiple and mistyped records never authorize identity reads", result.status === 1
      && result.calls.length === 3 && result.report.requests[2].organization_evidence.complete_shape === "shape_unavailable"
      && !result.output.includes(SENTINEL))
  }
  for (const id of ["", "1e3", "12/34", "../private", "12?secret=private", "１２", "https://untrusted.invalid", SENTINEL]) {
    const result = await resourceRouting(diagnostic, { record: { ...organizationRecord(), id } })
    T("android-sentry routing: only decimal identity can derive an options path", result.calls.length === 3
      && result.report.requests[2].organization_evidence.numeric_id === "unavailable" && !result.output.includes(SENTINEL))
  }
  const invalidRegions = ["http://us.sentry.io", "https://us.sentry.io:443", "https://private@us.sentry.io", "https://us.sentry.io/path",
    "https://us.sentry.io?secret=private", "https://us.sentry.io#private", "https://us.sentry.io.untrusted.invalid", "https://untrusted.invalid", "https://sentry.io", "US", ""]
  for (const region of [...invalidRegions, "https://us.sentry.io///", "https://de.sentry.io/"]) {
    const record = organizationRecord()
    record.links.regionUrl = region
    const listed = await resourceRouting(diagnostic, { record })
    // Exact current issuance payload, not a decoded real credential:
    // https://github.com/getsentry/sentry/blob/d4ac7c872436deb5d01d1e8673bae061758e3e0b/src/sentry/utils/security/orgauthtoken_token.py#L17-L34
    const credential = organizationToken("thomasluizon", "https://sentry.io", { iat: 1, region_url: region })
    const hinted = await resourceRouting(diagnostic, { scopes: ["org:ci"], credential })
    const accepted = region === "https://us.sentry.io///" || region === "https://de.sentry.io/"
    T("android-sentry routing: record and issuance hint accept exact official origins with slash normalization only", listed.calls.length === (accepted ? 5 : 4)
      && hinted.calls.length === (accepted ? 4 : 3) && !hinted.calls.some(([url]) => url.endsWith("/organizations/"))
      && hinted.report.resource_branch === "known_slug_control" && !hinted.output.includes(credential)
      && !hinted.output.includes("region_url\":\"https:") && !listed.output.includes(SENTINEL)
      && [...hinted.calls, ...listed.calls].every(([url]) => /^(https:\/\/(sentry\.io|us\.sentry\.io|de\.sentry\.io))\//.test(url)))
  }
  for (const extra of [{}, { region_url: "https://us.sentry.io" }, { iat: "1", region_url: "https://us.sentry.io" },
    { iat: 1, region_url: "https://us.sentry.io", [SENTINEL]: SENTINEL }]) {
    const credential = organizationToken("thomasluizon", "https://sentry.io", extra)
    const result = await resourceRouting(diagnostic, { scopes: ["org:ci"], credential })
    T("android-sentry routing: legacy, extra and unknown hint schemas stay unavailable without rejecting the credential", result.calls.length === 3
      && result.report.target_selection === "embedded_target_matches" && result.report.token_region_hint.region === "unavailable"
      && result.report.token_region_hint.complete_shape === "shape_unavailable" && !result.output.includes(SENTINEL))
  }
  await routingErrorCases()
  await routingLimitCases()
}

async function routingErrorCases() {
  for (const [status, envelope, expected] of [[404, { detail: "The requested resource does not exist" }, "resource_does_not_exist_detail"],
    [401, { detail: "Invalid org token" }, "invalid_org_token_detail"], [403, { detail: "Invalid org token" }, "invalid_org_token_detail"],
    [404, { detail: "Invalid org token" }, "unavailable"], [404, { detail: SENTINEL }, "unavailable"],
    [404, { detail: "The requested resource does not exist", [SENTINEL]: SENTINEL }, "unavailable"]]) {
    const result = await resourceRouting(diagnostic, { respond: async (url) => url.includes("chunk-upload")
      ? new Response(JSON.stringify(envelope), { status, headers: { "X-Sentry-Proxy-URL": SENTINEL } }) : null })
    T("android-sentry routing: fixed source errors never invalidate independent global auth or emit private detail/header", result.status === 1
      && result.report.requests[0].error_evidence.classification === expected && result.report.requests[0].proxy_header_present === true
      && result.report.requests[1].auth_evidence.token_auth === "reported" && !result.output.includes(SENTINEL)
      && !result.output.includes("Invalid org token") && !result.output.includes("The requested resource does not exist"))
  }
  const credential = organizationToken("thomasluizon", "https://sentry.io", { iat: 1, region_url: "https://us.sentry.io" })
  const control = await resourceRouting(diagnostic, { scopes: ["org:ci"], credential, respond: async (url) => url.includes("/config/")
    ? new Response(JSON.stringify({ authenticated: false, memberAuthenticated: false, [SENTINEL]: SENTINEL })) : null })
  T("android-sentry routing: control config consumes no session or provider fields and hint stays supplementary", control.calls.length === 4
    && control.report.requests[1].auth_evidence.token_auth === "reported" && control.report.requests[2].body === "json_object_fields_unused"
    && control.report.regional_source === "token_issuance_hint" && !control.output.includes("memberAuthenticated") && !control.output.includes(SENTINEL))
  const nativeHealthy = await resourceRouting(diagnostic, { respond: async (url) => url.includes("chunk-upload") ? new Response("{}") : null })
  T("android-sentry routing: complete healthy native and auxiliary reads can pass without an upload claim", nativeHealthy.status === 0
    && nativeHealthy.report.outcome === "lookup_reads_healthy" && nativeHealthy.calls.length === 5)
}

async function routingLimitCases() {
  for (const failedRequest of [3, 4, 5]) {
    for (const failure of ["redirect", "oversize", "network", "timeout"]) {
      const originalTimeout = AbortSignal.timeout
      const keepAlive = setTimeout(() => {}, 1000)
      let requestCount = 0
      if (failure === "timeout") AbortSignal.timeout = (milliseconds) => originalTimeout(milliseconds === 10000 ? 10 : milliseconds)
      try {
        const result = await resourceRouting(diagnostic, { respond: async (_url, { signal }) => {
          if (++requestCount !== failedRequest) return null
          if (failure === "redirect") return new Response("{}", { status: 302, headers: { Location: `https://untrusted.invalid/${SENTINEL}` } })
          if (failure === "oversize") return new Response(JSON.stringify({ [SENTINEL]: "x".repeat(65536) }))
          if (failure === "network") throw new Error(SENTINEL)
          return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error(SENTINEL)), { once: true }))
        } })
        T("android-sentry routing: every conditional request stops on transport, redirect, body cap or timeout", result.status === 1
          && result.calls.length === failedRequest && !result.output.includes(SENTINEL) && Buffer.byteLength(result.output) <= 8192)
      } finally {
        AbortSignal.timeout = originalTimeout
        clearTimeout(keepAlive)
      }
    }
  }
}

function authResponse(subject, envelope, { lookupStatus = 200, authStatus = 200 } = {}) {
  return execute(subject, {
    env: { ...environment, SENTRY_AUTH_TOKEN: organizationToken() },
    fetchImpl: async (url) => new Response(JSON.stringify(url.includes("chunk-upload") ? {} : envelope), {
      status: url.includes("chunk-upload") ? lookupStatus : authStatus,
    }),
  })
}

async function lookup404(subject, scopes) {
  return authResponse(subject, authEnvelope(scopes), { lookupStatus: 404 })
}

async function execute(subject, changes = {}) {
  const calls = []
  const children = []
  const { fetchImpl = async (url) => new Response(JSON.stringify(url.includes("chunk-upload") ? {} : authEnvelope(["org:ci"]))),
    runProcess = processResult, ...options } = changes
  const result = await subject.main([], {
    root: REPO_ROOT, env: environment,
    fetchImpl: async (url, request) => { calls.push([url, request]); return fetchImpl(url, request) },
    runProcess: async (...args) => { children.push(args); return runProcess(...args) },
    ...options,
  })
  return { ...result, report: JSON.parse(result.output), calls, children }
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
guard("embedded org overrides defaults", ["payload.org !== ORGANIZATION", "false"], async (subject) => {
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
guard("fixed destinations and request count", ["const REQUEST_LIMIT = 5", "const REQUEST_LIMIT = 2"], async (subject) => {
  const result = await execute(subject)
  return result.status === 0 && result.calls.map(([url]) => url).join(" ") === "https://sentry.io/api/0/organizations/thomasluizon/chunk-upload/ https://sentry.io/api/0/ https://sentry.io/api/0/auth/organizations/thomasluizon/config/"
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
    if ((await execute(subject, { fetchImpl: async (url) => new Response(url.includes("chunk-upload") ? body : JSON.stringify(authEnvelope(["org:ci"]))) })).status !== 1) return false
  }
  return true
})
guard("supplementary read failure is incomplete", ['if (status === 403) return "access_or_scope_unavailable"', 'if (status === 403) return "http_read_ok"'], async (subject) => {
  const result = await authResponse(subject, authEnvelope(["org:ci"]), { authStatus: 403 })
  return result.status === 1 && result.report.requests[1].outcome === "access_or_scope_unavailable"
})
guard("malformed lookup cannot pass", ['result.body === "json_object_fields_unused"', "true"], async (subject) =>
  (await execute(subject, { fetchImpl: async (url) => new Response(url.includes("chunk-upload") ? "broken" : JSON.stringify(authEnvelope(["org:ci"]))) })).status === 1)
guard("redirect stops further authenticated probes", ['"redirect_refused", "total_deadline"', '"removed", "total_deadline"'], async (subject) => {
  let count = 0
  const result = await execute(subject, { fetchImpl: async () => { count++; return new Response("{}", { status: 302, headers: { Location: `https://untrusted.invalid/${SENTINEL}` } }) } })
  return result.status === 1 && count === 1 && result.report.requests[0].outcome === "redirect_refused" && !result.output.includes(SENTINEL)
})

guard("auth null is no reported token auth", ['if (parsed?.auth === null) evidence.token_auth = "not_reported"', 'if (parsed?.auth === null) evidence.token_auth = "reported"'], async (subject) => {
  const result = await lookup404(subject, null)
  return result.report.requests[1].auth_evidence.token_auth === "not_reported" && result.status === 1
})
guard("HTTP 200 cannot manufacture auth evidence", ["auth_evidence: authEvidence(parsed)", 'auth_evidence: authEvidence({ version: "0", auth: { scopes: ["org:ci"] }, user: null })'], async (subject) => {
  const result = await authResponse(subject, {})
  return result.status === 1 && JSON.stringify(result.report.requests[1].auth_evidence) === JSON.stringify(unavailableAuth)
})
guard("scope array typing", ['Array.isArray(parsed.auth.scopes)', "true"], async (subject) => {
  const result = await authResponse(subject, authEnvelope("org:ci"))
  return result.status === 1 && result.report.requests[1].body === "json_object_auth_classified"
    && result.report.requests[1].auth_evidence.token_auth === "unavailable"
})
guard("every scope element must be a string", ['parsed.auth.scopes.every((scope) => typeof scope === "string")', "true"], async (subject) => {
  const result = await authResponse(subject, authEnvelope(["org:ci", [SENTINEL]]))
  return result.status === 1 && result.report.requests[1].auth_evidence.token_auth === "unavailable"
})
guard("exact auth key set", ["Object.keys(parsed.auth).length === 1", "true"], async (subject) => {
  const result = await authResponse(subject, { ...authEnvelope(["org:ci"]), auth: { scopes: ["org:ci"], [SENTINEL]: SENTINEL } })
  return result.status === 1 && result.report.requests[1].auth_evidence.token_auth === "unavailable" && !result.output.includes(SENTINEL)
})
guard("only source-listed native GET scopes", ['"project:releases", "org:ci"]', '"project:releases", "org:ci", "future:canary"]'], async (subject) => {
  const result = await lookup404(subject, ["future:canary"])
  return result.report.requests[1].auth_evidence.native_get_scope === "no_listed_alternative_observed" && !result.output.includes("future:canary")
})
guard("complete envelope requires exact top-level keys", ["Object.keys(parsed).length === 3", "true"], async (subject) => {
  const result = await authResponse(subject, { ...authEnvelope(["org:ci"]), [SENTINEL]: SENTINEL })
  return result.report.requests[1].auth_evidence.complete_shape === "shape_unavailable" && result.status === 1 && !result.output.includes(SENTINEL)
})
guard("complete envelope version type", ['typeof parsed.version === "string"', "true"], async (subject) => {
  const result = await authResponse(subject, { ...authEnvelope(["org:ci"]), version: 0 })
  return result.report.requests[1].auth_evidence.complete_shape === "shape_unavailable" && result.status === 1
})
guard("user object cannot acquire a complete receipt", ["parsed.user === null", "true"], async (subject) => {
  const result = await authResponse(subject, { ...authEnvelope(["org:ci"]), user: { [SENTINEL]: { email: SENTINEL } } })
  return result.report.requests[1].auth_evidence.complete_shape === "shape_unavailable" && result.status === 1 && !result.output.includes(SENTINEL)
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
  return result.status === 1 && result.calls.length === 2
})
guard("no listed scope remains incomplete", ['result.auth_evidence.native_get_scope === "listed_alternative_observed"', "true"], async (subject) =>
  (await authResponse(subject, authEnvelope([]))).status === 1)

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

guard("org-list scope cannot be inferred from native upload scope", ['const ORGANIZATION_GET_SCOPES = ["org:read", "org:write", "org:admin"]',
  'const ORGANIZATION_GET_SCOPES = ["org:read", "org:write", "org:admin", "org:ci"]'], async (subject) => {
  const result = await resourceRouting(subject, { scopes: ["org:ci"] })
  return result.calls.length === 3 && result.calls[2][0] === "https://sentry.io/api/0/auth/organizations/thomasluizon/config/"
})
guard("one current organization only", ['parsed.length !== 1', 'false'], async (subject) => {
  const result = await resourceRouting(subject, { respond: async (url) => url.endsWith("/organizations/")
    ? new Response(JSON.stringify([organizationRecord(), organizationRecord()])) : null })
  return result.calls.length === 3 && result.report.requests[2].organization_evidence.complete_shape === "shape_unavailable"
})
guard("complete organization schema excludes unknown nested keys", ['Object.keys(value).length === Object.keys(shape).length', 'true'], async (subject) => {
  const record = organizationRecord()
  record.links[SENTINEL] = SENTINEL
  const result = await resourceRouting(subject, { record })
  return result.calls.length === 3 && result.report.requests[2].organization_evidence.complete_shape === "shape_unavailable"
})
guard("complete organization schema checks primitive types", ['typeof value === shape', 'true'], async (subject) => {
  const result = await resourceRouting(subject, { record: { ...organizationRecord(), require2FA: SENTINEL } })
  return result.calls.length === 3 && result.report.requests[2].organization_evidence.complete_shape === "shape_unavailable"
})
guard("only successful list response can derive identity", ['kind === "organization_list" && success', 'kind === "organization_list"'], async (subject) => {
  const result = await resourceRouting(subject, { respond: async (url) => url.endsWith("/organizations/")
    ? new Response(JSON.stringify([organizationRecord()]), { status: 403 }) : null })
  return result.calls.length === 3 && result.status === 1
})
guard("decimal ID is required before path construction", ['/^[0-9]+$/.test(organization.id)', 'true'], async (subject) => {
  const result = await resourceRouting(subject, { record: { ...organizationRecord(), id: `../${SENTINEL}` } })
  return result.calls.length === 3 && result.calls.every(([url]) => !url.includes(SENTINEL))
})
guard("regional comparison requires exact allowlisted origin", ['origin === REGIONS.us', 'origin.startsWith(REGIONS.us)'], async (subject) => {
  const record = organizationRecord()
  record.links.regionUrl = "https://us.sentry.io.untrusted.invalid"
  const result = await resourceRouting(subject, { record })
  return result.calls.length === 4 && result.report.requests[2].organization_evidence.region === "unavailable"
})
guard("issuance hint requires complete supported schema", ['matchesShape(payload, TOKEN_HINT_SHAPE)', 'true'], async (subject) => {
  const result = await resourceRouting(subject, { scopes: ["org:ci"], credential: organizationToken("thomasluizon", "https://sentry.io", {
    iat: 1, region_url: "https://us.sentry.io", [SENTINEL]: SENTINEL,
  }) })
  return result.calls.length === 3 && result.report.token_region_hint.complete_shape === "shape_unavailable"
})
guard("record type receipt cannot disclose identity", ['evidence.complete_shape = [ORGANIZATION_SHAPE]', 'evidence.complete_shape = [organization]'], async (subject) => {
  const result = await resourceRouting(subject)
  return !result.output.includes(SENTINEL) && !result.output.includes("123456789") && !result.output.includes("current-private-slug")
})
guard("token type receipt cannot disclose metadata", ['hint.complete_shape = TOKEN_HINT_SHAPE', 'hint.complete_shape = payload'], async (subject) => {
  const result = await resourceRouting(subject, { scopes: ["org:ci"], credential: organizationToken("thomasluizon", "https://sentry.io", {
    iat: 1, region_url: "https://de.sentry.io",
  }) })
  return !result.output.includes('"region_url": "https://') && !result.output.includes('"iat": 1')
})
guard("error detail class requires exact full envelope", ['matchesShape(parsed, { detail: "string" })', 'typeof parsed?.detail === "string"'], async (subject) => {
  const result = await resourceRouting(subject, { respond: async (url) => url.includes("chunk-upload")
    ? new Response(JSON.stringify({ detail: "The requested resource does not exist", [SENTINEL]: SENTINEL }), { status: 404 }) : null })
  return result.report.requests[0].error_evidence.classification === "unavailable" && !result.output.includes(SENTINEL)
})
guard("error comparison is exact rather than arbitrary detail echo", ['evidence.classification = "resource_does_not_exist_detail"', 'evidence.classification = parsed.detail'], async (subject) => {
  const result = await resourceRouting(subject)
  return result.report.requests[0].error_evidence.classification === "resource_does_not_exist_detail" && !result.output.includes("The requested resource does not exist")
})
guard("native-compatible user agent", ['"User-Agent": "sentry-cli/3.6.0"', '"User-Agent": "other"'], async (subject) => {
  const result = await resourceRouting(subject)
  return result.calls.every(([, options]) => options.headers["User-Agent"] === "sentry-cli/3.6.0")
})
guard("every child stays isolated from credential and metadata", ['const childEnvironment = { PATH: env.PATH }', 'const childEnvironment = { ...env }'], async (subject) => {
  const credential = organizationToken("thomasluizon", "https://sentry.io", { iat: 1, region_url: "https://de.sentry.io" })
  const result = await resourceRouting(subject, { credential })
  return result.children.every(([, argv, options]) => Object.keys(options.env).join() === "PATH"
    && !JSON.stringify([argv, options]).includes(credential) && !JSON.stringify([argv, options]).includes("region_url"))
})
guard("full conditional branch obeys request cap", ['const REQUEST_LIMIT = 5', 'const REQUEST_LIMIT = 4'], async (subject) => {
  const result = await resourceRouting(subject)
  return result.calls.length === 5 && result.report.limits.requests === 5
})

async function authCases() {
  // https://github.com/getsentry/sentry/blob/d4ac7c872436deb5d01d1e8673bae061758e3e0b/src/sentry/api/bases/organization.py#L182-L187
  for (const scope of ["project:read", "project:write", "project:admin", "project:releases", "org:ci"]) {
    const result = await authResponse(diagnostic, authEnvelope([scope]))
    const evidence = result.report.requests[1].auth_evidence
    T(`android-sentry auth: source-listed ${scope} yields fixed evidence and complete types`, result.status === 0
      && evidence.token_auth === "reported" && evidence.native_get_scope === "listed_alternative_observed"
      && JSON.stringify(evidence.complete_shape) === JSON.stringify(reportedShape) && !result.output.includes(scope))
  }
  const anonymous = await authResponse(diagnostic, authEnvelope(null))
  T("android-sentry auth: null auth is not a rejected-credential claim", anonymous.status === 1
    && anonymous.report.requests[1].outcome === "http_read_ok"
    && JSON.stringify(anonymous.report.requests[1].auth_evidence) === JSON.stringify({
      token_auth: "not_reported", native_get_scope: "unavailable", organization_get_scope: "unavailable", complete_shape: anonymousShape,
    }))
  for (const scopes of [[], [""], ["future:canary"], [SENTINEL, "unrelated:scope"], ["org:ci", SENTINEL]]) {
    const result = await authResponse(diagnostic, authEnvelope(scopes))
    const listed = scopes.includes("org:ci")
    const evidence = result.report.requests[1].auth_evidence
    T("android-sentry auth: open string scopes preserve auth without printing values", result.status === (listed ? 0 : 1)
      && evidence.token_auth === "reported" && evidence.native_get_scope === (listed ? "listed_alternative_observed" : "no_listed_alternative_observed")
      && JSON.stringify(evidence.complete_shape) === JSON.stringify(reportedShape)
      && !result.output.includes(SENTINEL) && !result.output.includes("future:canary") && !result.output.includes("unrelated:scope"))
  }
  for (const auth of [undefined, {}, [], true, 1, SENTINEL, { scopes: null }, { scopes: {} }, { scopes: "org:ci" },
    { scopes: [1] }, { scopes: [null] }, { scopes: [false] }, { scopes: [["org:ci"]] }, { scopes: [{ [SENTINEL]: SENTINEL }] },
    { scopes: ["org:ci", null] }, { scopes: ["org:ci"], [SENTINEL]: SENTINEL }]) {
    const result = await authResponse(diagnostic, { version: "0", auth, user: null })
    T("android-sentry auth: missing or unsupported auth shape remains unavailable", result.status === 1
      && JSON.stringify(result.report.requests[1].auth_evidence) === JSON.stringify(unavailableAuth) && !result.output.includes(SENTINEL))
  }
  for (const envelope of [null, [], false, 42, SENTINEL]) {
    const result = await authResponse(diagnostic, envelope)
    T("android-sentry auth: scalar and array envelopes cannot report auth", result.status === 1
      && result.report.requests[1].body === "malformed_json"
      && JSON.stringify(result.report.requests[1].auth_evidence) === JSON.stringify(unavailableAuth) && !result.output.includes(SENTINEL))
  }
  for (const envelope of [
    { auth: { scopes: ["org:ci"] }, user: null }, { version: "0", auth: { scopes: ["org:ci"] } },
    { ...authEnvelope(["org:ci"]), version: 0 }, { ...authEnvelope(["org:ci"]), user: { [SENTINEL]: { email: SENTINEL } } },
    { ...authEnvelope(["org:ci"]), user: [] }, { ...authEnvelope(["org:ci"]), user: SENTINEL },
    { ...authEnvelope(["org:ci"]), [SENTINEL]: SENTINEL },
  ]) {
    const result = await authResponse(diagnostic, envelope)
    T("android-sentry auth: supported auth stays separate from unavailable complete shape", result.status === 1
      && result.report.requests[1].auth_evidence.token_auth === "reported"
      && result.report.requests[1].auth_evidence.native_get_scope === "listed_alternative_observed"
      && result.report.requests[1].auth_evidence.complete_shape === "shape_unavailable" && !result.output.includes(SENTINEL))
  }
  await authTransportCases()
}

async function authTransportCases() {
  for (const status of [201, 400, 401, 403, 404, 429, 500, 503, 302]) {
    const result = await authResponse(diagnostic, authEnvelope(["org:ci"]), { authStatus: status })
    T(`android-sentry auth: HTTP ${status} keeps transport and auth evidence separate`, result.status === (status === 201 ? 0 : 1)
      && result.report.requests[1].status === status
      && (status === 201 ? result.report.requests[1].auth_evidence.token_auth === "reported"
        : JSON.stringify(result.report.requests[1].auth_evidence) === JSON.stringify(unavailableAuth)))
  }
  for (const body of [SENTINEL, new Uint8Array([255]), null]) {
    const result = await execute(diagnostic, { fetchImpl: async (url) => new Response(url.includes("chunk-upload") ? "{}" : body) })
    T("android-sentry auth: unreadable bounded JSON retains unavailable evidence", result.status === 1
      && result.report.requests[1].body === "malformed_json"
      && JSON.stringify(result.report.requests[1].auth_evidence) === JSON.stringify(unavailableAuth) && !result.output.includes(SENTINEL))
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
      && result.calls.length === 2 && result.report.requests[1].body === (oversized ? "response_too_large" : "unavailable")
      && JSON.stringify(result.report.requests[1].auth_evidence) === JSON.stringify(unavailableAuth) && !result.output.includes(SENTINEL))
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
    && privateResult.calls.length === 2 && !privateResult.output.includes(SENTINEL) && !privateResult.output.includes(privateToken)
    && privateResult.children.every(([, argv, options]) => !JSON.stringify([argv, options]).includes(SENTINEL)
      && !JSON.stringify([argv, options]).includes(privateToken) && Object.keys(options.env).join() === "PATH"))
}

function outputStreamCases(source, stageModule) {
  const credential = organizationToken("thomasluizon", null, { ignored: SENTINEL })
  for (const lookupStatus of [200, 404]) {
    const options = `{
      root: ${JSON.stringify(REPO_ROOT)}, env: ${JSON.stringify({ ...environment, SENTRY_AUTH_TOKEN: credential })},
      runProcess: async (file) => ({
        status: 0, stdout: file === "git" ? ${JSON.stringify(SOURCE)} : "sentry-cli 3.6.0", stderr: ${JSON.stringify(SENTINEL)}
      }),
      fetchImpl: async (url) => new Response(JSON.stringify(url.endsWith("/organizations/")
        ? [${JSON.stringify(organizationRecord())}]
        : url.includes("chunk-upload") ? { ignored: ${JSON.stringify(SENTINEL)} }
        : { version: ${JSON.stringify(SENTINEL)}, auth: { scopes: ["org:ci", "org:read", ${JSON.stringify(SENTINEL)}] }, user: null }),
        { status: url.includes("chunk-upload") ? ${lookupStatus} : 200, headers: { "X-Private": ${JSON.stringify(SENTINEL)} } })
    }`
    const name = `cli-stream-${lookupStatus}`
    const entry = stageModule(name, source.replace("const result = await main()", `const result = await main([], ${options})`))
    const result = spawnSync(process.execPath, [entry], { encoding: "utf8", timeout: 5000, maxBuffer: 8192 })
    const output = lookupStatus === 200 ? result.stdout : result.stderr
    const other = lookupStatus === 200 ? result.stderr : result.stdout
    T("android-sentry auth: actual entry point emits sanitized evidence on its selected stream only", result.status === (lookupStatus === 200 ? 0 : 1)
      && other === "" && !output.includes(SENTINEL) && !output.includes(credential) && !output.includes("sntrys_")
      && !output.includes("current-private-slug") && !output.includes("123456789")
      && JSON.parse(output).requests.length === 5 && JSON.parse(output).requests[1].auth_evidence.token_auth === "reported" && Buffer.byteLength(output) <= 8192)
  }
}

export const cases = async () => {
  await resourceRegressionCases()
  await routingCases()
  const anonymous404 = await lookup404(diagnostic, null)
  const reported404 = await lookup404(diagnostic, ["org:ci"])
  T("android-sentry: native 404 plus index 200/null retains no-reported-auth evidence", anonymous404.report.requests[1].auth_evidence?.token_auth === "not_reported")
  T("android-sentry: native 404 plus index 200/scopes retains reported-auth evidence", reported404.report.requests[1].auth_evidence?.token_auth === "reported"
    && reported404.report.requests[1].auth_evidence?.native_get_scope === "listed_alternative_observed")
  T("android-sentry: both discriminated native 404 sequences remain incomplete", [anonymous404, reported404].every((result) => result.status === 1
    && result.report.outcome === "diagnostic_incomplete" && result.report.requests[0].outcome === "resource_or_access_unavailable"))
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
    T(`android-sentry: ${entry.name} mutation targets implementation`, source.includes(before))
    const mutant = await loadMutant(entry.name.replaceAll(" ", "-"), source.replace(before, after))
    T(`android-sentry: ${entry.name} rejects owning negative control`, !await entry.verify(mutant))
  }
  const healthy = await execute(diagnostic)
  T("android-sentry: main calls the pinned nested CLI with no credential environment or argv", healthy.status === 0
    && healthy.children[1][1][0] === join(REPO_ROOT, "node_modules/@sentry/react-native/node_modules/@sentry/cli/bin/sentry-cli")
    && healthy.children.every(([, args, options]) => !JSON.stringify([args, options]).includes(token) && options.maxBuffer === 8192 && options.timeoutMs === 5000))
  for (const credential of [organizationToken(), organizationToken("thomasluizon", "https://sentry.io/"), organizationToken("thomasluizon", null), `sntryu_${token}`]) {
    const result = await execute(diagnostic, { env: { ...environment, SENTRY_AUTH_TOKEN: credential } })
    T("android-sentry: source-confirmed credential target is accepted without payload output", result.status === 0 && !result.output.includes(credential))
  }
  // CLI 3.6.0 config.rs:218-227 trims every trailing slash before validating the root URL.
  // https://github.com/getsentry/sentry-cli/blob/3.6.0/src/config.rs#L218
  for (const url of ["https://sentry.io//", "https://sentry.io/////"]) {
    const credential = organizationToken("thomasluizon", url)
    const result = await execute(diagnostic, { env: { ...environment, SENTRY_AUTH_TOKEN: credential } })
    T("android-sentry: repeated trailing slashes retain the private match and fixed GETs", result.status === 0
      && result.report.target_selection === "embedded_target_matches"
      && result.calls.map(([destination]) => destination).join(" ") === "https://sentry.io/api/0/organizations/thomasluizon/chunk-upload/ https://sentry.io/api/0/ https://sentry.io/api/0/auth/organizations/thomasluizon/config/"
      && result.calls.every(([, options]) => options.method === "GET" && options.redirect === "manual" && options.headers.Authorization === `Bearer ${credential}`)
      && !result.output.includes(credential) && !result.output.includes(url) && Buffer.byteLength(result.output) <= 8192
      && !JSON.stringify(result.children).includes(credential))
  }
  const emptyUrl = await execute(diagnostic, { env: { ...environment, SENTRY_AUTH_TOKEN: organizationToken("thomasluizon", "") } })
  T("android-sentry: explicit empty token URL retains configured-host fallback", emptyUrl.status === 0 && emptyUrl.report.target_selection === "embedded_target_matches")
  const omittedUrlPayload = Buffer.from(JSON.stringify({ org: "thomasluizon" })).toString("base64")
  const omittedUrlToken = `sntrys_${omittedUrlPayload}_${Buffer.alloc(32, 1).toString("base64").replace(/=+$/, "")}`
  const omittedUrl = await execute(diagnostic, { env: { ...environment, SENTRY_AUTH_TOKEN: omittedUrlToken } })
  T("android-sentry: omitted token URL remains unrecognized before processes or requests", omittedUrl.status === 1
    && omittedUrl.report.outcome === "credential_format_unrecognized" && omittedUrl.calls.length === 0
    && omittedUrl.children.length === 0 && !omittedUrl.output.includes(omittedUrlToken))
  for (const url of ["http://sentry.io//", "https://untrusted.invalid//", "https://sentry.io/path//", "https://sentry.io/?query=private//", "https://sentry.io/#private//", "https://private@sentry.io//", "https://sentry.io.untrusted.invalid//", "/", "//"]) {
    const credential = organizationToken("thomasluizon", url)
    const result = await execute(diagnostic, { env: { ...environment, SENTRY_AUTH_TOKEN: credential } })
    T("android-sentry: slash normalization cannot admit a changed destination or expose its payload", result.status === 1
      && result.report.outcome === "embedded_host_mismatch" && result.calls.length === 0 && result.children.length === 0
      && !result.output.includes(credential) && !result.output.includes('"url"'))
  }
  for (const status of [200, 401, 403, 404, 429, 500, 503]) {
    const outcomes = { 200: "http_read_ok", 401: "authentication_rejected", 403: "access_or_scope_unavailable", 404: "resource_or_access_unavailable", 429: "rate_limited", 500: "service_failure", 503: "service_failure" }
    const result = await execute(diagnostic, { fetchImpl: async (url) => new Response(JSON.stringify(url.includes("chunk-upload") ? { arbitrary_owned_boundary: SENTINEL, auth: { successful: true } } : authEnvelope(["org:ci"])), { status }) })
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
  const oversized = await loadMutant("oversized-owned-output", source.replace('evidence_limits: "HTTP reads only;', `evidence_limits: "${"x".repeat(8192)}HTTP reads only;`))
  const unsafeOverflow = await loadMutant("output-cap-removed", source.replace('evidence_limits: "HTTP reads only;', `evidence_limits: "${"x".repeat(8192)}HTTP reads only;`).replace("Buffer.byteLength(output) > OUTPUT_LIMIT", "false"))
  T("android-sentry: output cap owns its negative control", (await execute(oversized)).report.outcome === "output_refused" && Buffer.byteLength((await execute(unsafeOverflow)).output) > 8192)
  const leakingSource = source.replace('outcome: "unavailable", source: null', 'outcome: "unavailable", injected_fault: env.SENTRY_AUTH_TOKEN, source: null')
  const leaking = await loadMutant("owned-output-fault", leakingSource)
  const unsafeLeak = await loadMutant("secret-boundary-removed", leakingSource.replace("(token?.trim() && output.includes(token))", "false"))
  T("android-sentry: secret output refusal owns its negative control", (await execute(leaking)).report.outcome === "output_refused" && (await execute(unsafeLeak)).output.includes(token))

  await workflowCases()
  const cli = join(REPO_ROOT, "node_modules/@sentry/react-native/node_modules/@sentry/cli/bin/sentry-cli")
  const home = dirname(stage("android-sentry/empty-home/placeholder", ""))
  const actual = spawnSync(process.execPath, [cli, "info", "--config-status-json"], { cwd: home, env: { PATH: process.env.PATH, HOME: home }, encoding: "utf8", timeout: 5000 })
  const actualStatus = JSON.parse(actual.stdout)
  T("android-sentry: actual unauthenticated native info exits zero with false auth, never upload proof", actual.status === 0 && actualStatus.auth.successful === false
    && JSON.stringify(actualStatus) === JSON.stringify({ config: { org: null, project: null, url: "https://sentry.io" }, auth: { type: null, successful: false }, have_dsn: false }))
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
