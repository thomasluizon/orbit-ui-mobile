import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { T, root, stage, orcaEnv, run, check } from "./_harness.mjs"

const CODEX_QUOTA_RESPONSES = [
  JSON.stringify({ jsonrpc: "2.0", id: 1, result: { userAgent: "quota-test" } }),
  JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    result: {
      rateLimits: {
        primary: {
          usedPercent: 7,
          windowDurationMins: 300,
          resetsAt: 1784851200,
        },
        secondary: {
          usedPercent: 42,
          windowDurationMins: 10080,
          resetsAt: 1785456000,
        },
        credits: { hasCredits: false, balance: "0" },
        planType: "pro",
      },
    },
  }),
]

const CODEX_QUOTA_NULL_CREDITS_RESPONSES = [
  CODEX_QUOTA_RESPONSES[0],
  JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    result: {
      rateLimits: {
        primary: {
          usedPercent: 7,
          windowDurationMins: 300,
          resetsAt: 1784851200,
        },
        secondary: {
          usedPercent: 42,
          windowDurationMins: 10080,
          resetsAt: 1785456000,
        },
        credits: null,
        planType: "pro",
      },
    },
  }),
]

const CODEX_QUOTA_SHORT_ONLY_RESPONSES = [
  CODEX_QUOTA_RESPONSES[0],
  JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    result: {
      rateLimits: {
        primary: {
          usedPercent: 7,
          windowDurationMins: 300,
          resetsAt: 1784851200,
        },
        credits: { hasCredits: false, balance: "0" },
        planType: "pro",
      },
    },
  }),
]

const CODEX_APP_SERVER_DIR = join(root, "quota-codex")

stage(
  "quota-codex/app-server",
  `let buffer = ""
let responseIndex = 0
const responses = process.env.AI_QUOTA_TEST_CODEX_RESPONSES
  ? JSON.parse(process.env.AI_QUOTA_TEST_CODEX_RESPONSES)
  : ${JSON.stringify(CODEX_QUOTA_RESPONSES)}
process.stdin.setEncoding("utf8")
process.stdin.on("data", (chunk) => {
  buffer += chunk
  const lines = buffer.split("\\n")
  buffer = lines.pop()
  for (const line of lines.filter(Boolean)) {
    const request = JSON.parse(line)
    if (responseIndex === 0 && (request.id !== 1 || request.method !== "initialize")) process.exit(5)
    if (responseIndex === 1 && (request.id !== 2 || request.method !== "account/rateLimits/read")) process.exit(6)
    process.stdout.write(responses[Math.min(responseIndex, responses.length - 1)] + "\\n")
    responseIndex += 1
  }
})
`,
)

const CODEX_COMSPEC_FIXTURE = stage(
  "quota-codex/comspec-fixture.mjs",
  `import { appendFileSync } from "node:fs"
appendFileSync(process.env.AI_QUOTA_TEST_COMSPEC_LOG, JSON.stringify(process.argv.slice(2)) + "\\n")
let buffer = ""
let responseIndex = 0
const responses = ${JSON.stringify(CODEX_QUOTA_RESPONSES)}
process.stdin.setEncoding("utf8")
process.stdin.on("data", (chunk) => {
  buffer += chunk
  const lines = buffer.split("\\n")
  buffer = lines.pop()
  for (const line of lines.filter(Boolean)) {
    JSON.parse(line)
    process.stdout.write(responses[Math.min(responseIndex, responses.length - 1)] + "\\n")
    responseIndex += 1
  }
})
`,
)

const CODEX_TASKKILL_FIXTURE = stage(
  "quota-codex/taskkill-fixture.mjs",
  `import { appendFileSync } from "node:fs"
const argumentsList = process.argv.slice(2)
appendFileSync(process.env.AI_QUOTA_TEST_TASKKILL_LOG, JSON.stringify(argumentsList) + "\\n")
const pid = Number(argumentsList[argumentsList.indexOf("/PID") + 1])
if (Number.isSafeInteger(pid) && pid > 0) {
  try {
    process.kill(pid, "SIGTERM")
  } catch {}
}
`,
)

const ORCA_QUOTA_OK = [
  {
    match: "computer get-app-state",
    stdout: JSON.stringify({
      ok: true,
      result: { snapshot: { treeText: "1 window Orca\n41 button Usage" } },
    }),
  },
  {
    match: "computer click",
    stdout: JSON.stringify({
      ok: true,
      result: {
        snapshot: {
          treeText: "1 window Orca\n52 staticText Claude Resets in 5d 4h 5h 12% wk 34%",
        },
      },
    }),
  },
]

const aiQuotaEnv = (plan, codexBin = process.execPath) => ({
  ...orcaEnv(plan),
  CODEX_BIN: codexBin,
  AI_QUOTA_TIMEOUT_MS: "2000",
})

const aiQuotaCases = () => {
  check(
    "ai-quota.mjs",
    "returns both populated engines when both sources are reachable",
    ["--json"],
    {
      status: 0,
      stdout:
        /"claude":\s*\{[\s\S]*"status":\s*"OK"[\s\S]*"weeklyPercent":\s*34[\s\S]*"sessionPercent":\s*12[\s\S]*"codex":\s*\{[\s\S]*"status":\s*"OK"[\s\S]*"usedPercent":\s*42[\s\S]*"windowDays":\s*7[\s\S]*"hasCredits":\s*false[\s\S]*"planType":\s*"pro"/,
    },
    { cwd: CODEX_APP_SERVER_DIR, env: aiQuotaEnv(ORCA_QUOTA_OK) },
  )
  const defaultOrcaEnv = {
    ...aiQuotaEnv(ORCA_QUOTA_OK),
    AI_QUOTA_TEST_MODE: "1",
    AI_QUOTA_TEST_DEFAULT_ORCA: process.execPath,
  }
  delete defaultOrcaEnv.ORCA_BIN
  check(
    "ai-quota.mjs",
    "uses the configured Windows Orca executable when ORCA_BIN is unset",
    ["--json"],
    {
      status: 0,
      stdout:
        /"claude":\s*\{[\s\S]*"status":\s*"OK"[\s\S]*"weeklyPercent":\s*34[\s\S]*"codex":\s*\{[\s\S]*"status":\s*"OK"/,
    },
    { cwd: CODEX_APP_SERVER_DIR, env: defaultOrcaEnv },
  )
  check(
    "ai-quota.mjs",
    "keeps Codex when Orca is unavailable",
    ["--json"],
    { status: 0, stdout: /"claude":\s*\{[\s\S]*"status":\s*"UNAVAILABLE"[\s\S]*"codex":\s*\{[\s\S]*"status":\s*"OK"/ },
    {
      cwd: CODEX_APP_SERVER_DIR,
      env: aiQuotaEnv([
        {
          match: "computer get-app-state",
          stdout: JSON.stringify({ ok: false, error: { message: "Orca is not running" } }),
          exit: 1,
        },
      ]),
    },
  )
  check(
    "ai-quota.mjs",
    "selects Codex's seven-day secondary window instead of the five-hour primary",
    ["--json"],
    {
      status: 0,
      stdout:
        /"codex":\s*\{[\s\S]*"status":\s*"OK"[\s\S]*"usedPercent":\s*42[\s\S]*"windowDays":\s*7[\s\S]*"resetsAt":\s*1785456000/,
    },
    { cwd: CODEX_APP_SERVER_DIR, env: aiQuotaEnv(ORCA_QUOTA_OK) },
  )
  check(
    "ai-quota.mjs",
    "fails the Codex side closed when no authoritative seven-day window exists",
    ["--json"],
    {
      status: 0,
      stdout: /"claude":\s*\{[\s\S]*"status":\s*"OK"[\s\S]*"codex":\s*\{[\s\S]*"status":\s*"UNAVAILABLE"/,
    },
    {
      cwd: CODEX_APP_SERVER_DIR,
      env: {
        ...aiQuotaEnv(ORCA_QUOTA_OK),
        AI_QUOTA_TEST_CODEX_RESPONSES: JSON.stringify(CODEX_QUOTA_SHORT_ONLY_RESPONSES),
      },
    },
  )
  check(
    "ai-quota.mjs",
    "accepts a subscription-only Codex quota response with no credits balance",
    ["--json"],
    {
      status: 0,
      stdout: /"codex":\s*\{[\s\S]*"status":\s*"OK"[\s\S]*"usedPercent":\s*42[\s\S]*"windowDays":\s*7[\s\S]*"hasCredits":\s*null[\s\S]*"planType":\s*"pro"/,
    },
    {
      cwd: CODEX_APP_SERVER_DIR,
      env: {
        ...aiQuotaEnv([
          {
            match: "computer get-app-state",
            stdout: JSON.stringify({ ok: false, error: { message: "Orca is not running" } }),
            exit: 1,
          },
        ]),
        AI_QUOTA_TEST_CODEX_RESPONSES: JSON.stringify(CODEX_QUOTA_NULL_CREDITS_RESPONSES),
      },
    },
  )
  check(
    "ai-quota.mjs",
    "keeps Claude when codex app-server is unavailable",
    ["--json"],
    { status: 0, stdout: /"claude":\s*\{[\s\S]*"status":\s*"OK"[\s\S]*"codex":\s*\{[\s\S]*"status":\s*"UNAVAILABLE"/ },
    { env: aiQuotaEnv(ORCA_QUOTA_OK, join(root, "missing-codex")) },
  )
  check(
    "ai-quota.mjs",
    "returns both unavailable engines and a non-zero exit when neither source is reachable",
    ["--json"],
    { status: 1, stdout: /"claude":\s*\{[\s\S]*"status":\s*"UNAVAILABLE"[\s\S]*"codex":\s*\{[\s\S]*"status":\s*"UNAVAILABLE"/ },
    {
      env: aiQuotaEnv([
        {
          match: "computer get-app-state",
          stdout: JSON.stringify({ ok: false, error: { message: "Orca is not running" } }),
          exit: 1,
        },
      ], join(root, "missing-codex")),
    },
  )

  const indexLog = join(root, "ai-quota-indexes.jsonl")
  const retry = run("ai-quota.mjs", ["--json"], {
    env: {
      ...aiQuotaEnv([
        {
          match: "computer get-app-state",
          sequence: [
            JSON.stringify({ ok: true, result: { snapshot: { treeText: "1 window Orca\n41 button Usage" } } }),
            JSON.stringify({ ok: true, result: { snapshot: { treeText: "1 window Orca\n73 button Usage" } } }),
          ],
        },
        {
          match: "computer click",
          sequence: [
            JSON.stringify({ ok: true, result: { snapshot: { treeText: "1 window Orca\n10 staticText Loading" } } }),
            JSON.stringify({
              ok: true,
              result: {
                snapshot: {
                  treeText: "1 window Orca\n52 staticText Claude Resets in 5d 4h 5h 12% wk 34%",
                },
              },
            }),
          ],
        },
      ], join(root, "missing-codex")),
      ORBIT_ORCA_LOG: indexLog,
    },
  })
  const indexCalls = existsSync(indexLog) ? readFileSync(indexLog, "utf8") : ""
  T(
    "ai-quota.mjs: a retry locates Usage again and never reuses the stale element index",
    retry.status === 0 &&
      indexCalls.includes('"--element-index","41"') &&
      indexCalls.includes('"--element-index","73"'),
    `exit ${retry.status}\n     ${retry.stderr}\n     ${indexCalls}`,
  )

  const comSpecLog = join(root, "ai-quota-comspec.jsonl")
  const taskkillLog = join(root, "ai-quota-taskkill.jsonl")
  const windowsTreeEnv = {
    ...aiQuotaEnv(ORCA_QUOTA_OK),
    AI_QUOTA_TEST_MODE: "1",
    AI_QUOTA_TEST_PLATFORM: "win32",
    AI_QUOTA_TEST_COMSPEC: process.execPath,
    AI_QUOTA_TEST_COMSPEC_SCRIPT: CODEX_COMSPEC_FIXTURE,
    AI_QUOTA_TEST_COMSPEC_LOG: comSpecLog,
    AI_QUOTA_TEST_TASKKILL: process.execPath,
    AI_QUOTA_TEST_TASKKILL_SCRIPT: CODEX_TASKKILL_FIXTURE,
    AI_QUOTA_TEST_TASKKILL_LOG: taskkillLog,
  }
  delete windowsTreeEnv.CODEX_BIN
  const windowsTree = run("ai-quota.mjs", ["--json"], { env: windowsTreeEnv })
  const comSpecCalls = existsSync(comSpecLog) ? readFileSync(comSpecLog, "utf8") : ""
  const taskkillCalls = existsSync(taskkillLog) ? readFileSync(taskkillLog, "utf8") : ""
  T(
    "ai-quota.mjs: the Windows production spawn path terminates the whole app-server process tree",
    windowsTree.status === 0 &&
      /"codex":\s*\{[\s\S]*"status":\s*"OK"/.test(windowsTree.stdout) &&
      comSpecCalls.includes('["/d","/s","/c","codex app-server"]') &&
      /\["\/PID","\d+","\/T","\/F"\]/.test(taskkillCalls),
    `exit ${windowsTree.status}\n     stderr: ${windowsTree.stderr}\n     comspec: ${comSpecCalls}\n     taskkill: ${taskkillCalls}`,
  )
}

export { aiQuotaCases as cases }
