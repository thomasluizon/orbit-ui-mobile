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
const organizationToken = (org = "thomasluizon", url = "https://sentry.io") =>
  `sntrys_${Buffer.from(JSON.stringify({ org, url })).toString("base64")}_${Buffer.alloc(32, 1).toString("base64").replace(/=+$/, "")}`

async function execute(subject, changes = {}) {
  const calls = []
  const children = []
  const result = await subject.main([], {
    root: REPO_ROOT, env: environment,
    fetchImpl: async (url, options) => { calls.push([url, options]); return new Response("{}", { status: 200 }) },
    runProcess: async (...args) => { children.push(args); return processResult(...args) },
    ...changes,
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
guard("fixed destinations and request count", ["const REQUEST_LIMIT = 2", "const REQUEST_LIMIT = 1"], async (subject) => {
  const result = await execute(subject)
  return result.status === 0 && result.calls.map(([url]) => url).join(" ") === "https://sentry.io/api/0/organizations/thomasluizon/chunk-upload/ https://sentry.io/api/0/"
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
    if ((await execute(subject, { fetchImpl: async () => new Response(body) })).status !== 1) return false
  }
  return true
})
guard("supplementary read failure is incomplete", ['result.outcome === "http_read_ok" &&', ""], async (subject) => {
  const result = await execute(subject, { fetchImpl: async (url) => new Response("{}", { status: url.includes("chunk-upload") ? 200 : 403 }) })
  return result.status === 1 && result.report.requests[1].outcome === "access_or_scope_unavailable"
})
guard("malformed lookup cannot pass", ['&& result.body === "json_object_fields_unused"', ""], async (subject) =>
  (await execute(subject, { fetchImpl: async () => new Response("broken") })).status === 1)
guard("redirect stops further authenticated probes", ['"redirect_refused", "total_deadline"', '"removed", "total_deadline"'], async (subject) => {
  let count = 0
  const result = await execute(subject, { fetchImpl: async () => { count++; return new Response("{}", { status: 302, headers: { Location: `https://untrusted.invalid/${SENTINEL}` } }) } })
  return result.status === 1 && count === 1 && result.report.requests[0].outcome === "redirect_refused" && !result.output.includes(SENTINEL)
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

export const cases = async () => {
  const source = readFileSync(join(REPO_ROOT, "tools/android-sentry-diagnostic.mjs"), "utf8")
  const loadMutant = async (name, replacement) => {
    const path = stage(`android-sentry/${name}/tools/android-sentry-diagnostic.mjs`, replacement)
    mkdirSync(join(dirname(path), "lib"), { recursive: true })
    cpSync(join(REPO_ROOT, "tools/lib/bounded-process.mjs"), join(dirname(path), "lib/bounded-process.mjs"))
    return import(pathToFileURL(path).href)
  }
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
      && result.calls.map(([destination]) => destination).join(" ") === "https://sentry.io/api/0/organizations/thomasluizon/chunk-upload/ https://sentry.io/api/0/"
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
    const result = await execute(diagnostic, { fetchImpl: async () => new Response(JSON.stringify({ arbitrary_owned_boundary: SENTINEL, auth: { successful: true } }), { status }) })
    T(`android-sentry: HTTP ${status} is classified without parsing an API field`, result.report.requests[0].outcome === outcomes[status] && result.status === (status === 200 ? 0 : 1) && !result.output.includes(SENTINEL) && !result.output.includes("successful"))
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
  T("android-sentry workflow: secret follows locked installation without raw summary/artifact output", steps.at(-1).name === "Probe native upload lookup" && !/GITHUB_STEP_SUMMARY|upload-artifact|SENTRY_LOG_LEVEL|--debug/.test(workflowSource))
}
