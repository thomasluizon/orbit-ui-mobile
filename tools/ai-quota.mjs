#!/usr/bin/env node

import { execFile, spawn } from "node:child_process"
import { promisify } from "node:util"

const USAGE = `usage: ai-quota.mjs --json

  Reads the current Claude and Codex quota from their authoritative sources.
  One unavailable provider does not fail the combined read.

  --json       print the combined quota object
  --help, -h   print this usage and exit 0

exit codes: 0 at least one provider was read, 1 both providers unavailable, 2 usage error`

const argv = process.argv.slice(2)
if (argv.includes("--help") || argv.includes("-h")) {
  process.stdout.write(`${USAGE}\n`)
  process.exit(0)
}
if (argv.length !== 1 || argv[0] !== "--json") {
  process.stderr.write(`ai-quota: expected exactly --json\n\n${USAGE}\n`)
  process.exit(2)
}

const execFileAsync = promisify(execFile)
const ORCA = process.env.ORCA_BIN || "orca"
const configuredTimeout = Number(process.env.AI_QUOTA_TIMEOUT_MS)
const PROVIDER_TIMEOUT_MS =
  Number.isInteger(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 30_000

const unavailableClaude = () => ({
  status: "UNAVAILABLE",
  weeklyPercent: null,
  sessionPercent: null,
  resetsIn: null,
})

const unavailableCodex = () => ({
  status: "UNAVAILABLE",
  usedPercent: null,
  windowDays: null,
  resetsAt: null,
  hasCredits: null,
  planType: null,
})

const parseOrcaTree = (raw) => {
  const envelope = JSON.parse(raw)
  if (envelope?.ok !== true || typeof envelope?.result?.snapshot?.treeText !== "string") {
    throw new Error("Orca did not return an accessibility tree")
  }
  return envelope.result.snapshot.treeText
}

const findUsageIndex = (tree) => {
  const match = tree.match(/^\s*(\d+)\s+button Usage(?:,.*)?$/m)
  if (!match) throw new Error("Orca Usage control was not found by label")
  return match[1]
}

const parseClaudeQuota = (tree) => {
  const match = tree.match(
    /Claude\s+Resets in\s+(.+?)\s+5h\s+(\d+(?:\.\d+)?)%\s+wk\s+(\d+(?:\.\d+)?)%/i,
  )
  if (!match) return null
  return {
    status: "OK",
    weeklyPercent: Number(match[3]),
    sessionPercent: Number(match[2]),
    resetsIn: match[1].trim(),
  }
}

const readOrcaTree = async (args, deadline) => {
  const timeout = deadline - Date.now()
  if (timeout <= 0) throw new Error("Orca quota read timed out")
  const { stdout } = await execFileAsync(ORCA, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout,
  })
  return parseOrcaTree(stdout)
}

const readClaudeQuota = async () => {
  const deadline = Date.now() + PROVIDER_TIMEOUT_MS
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const stateTree = await readOrcaTree(
        ["computer", "get-app-state", "--app", "Orca", "--json", "--no-screenshot"],
        deadline,
      )
      const usageIndex = findUsageIndex(stateTree)
      const clickedTree = await readOrcaTree(
        [
          "computer",
          "click",
          "--app",
          "Orca",
          "--element-index",
          usageIndex,
          "--json",
          "--no-screenshot",
        ],
        deadline,
      )
      const quota = parseClaudeQuota(clickedTree)
      if (quota) return quota
    }
  } catch {
    return unavailableClaude()
  }
  return unavailableClaude()
}

const parseCodexQuota = (message) => {
  const rateLimits = message?.result?.rateLimits
  const usedPercent = rateLimits?.primary?.usedPercent
  const windowDurationMins = rateLimits?.primary?.windowDurationMins
  const resetsAt = rateLimits?.primary?.resetsAt
  const hasCredits = rateLimits?.credits?.hasCredits
  const planType = rateLimits?.planType
  if (
    !Number.isFinite(usedPercent) ||
    !Number.isFinite(windowDurationMins) ||
    !Number.isFinite(resetsAt) ||
    typeof hasCredits !== "boolean" ||
    typeof planType !== "string"
  ) {
    throw new Error("Codex returned incomplete rate limits")
  }
  return {
    status: "OK",
    usedPercent,
    windowDays: windowDurationMins / 1_440,
    resetsAt,
    hasCredits,
    planType,
  }
}

const spawnCodexServer = () => {
  const options = { stdio: ["pipe", "pipe", "pipe"] }
  if (process.env.CODEX_BIN) {
    return spawn(process.env.CODEX_BIN, ["app-server"], options)
  }
  if (process.platform === "win32") {
    return spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "codex app-server"], options)
  }
  return spawn("codex", ["app-server"], options)
}

const readCodexQuota = async () => {
  let child
  try {
    child = spawnCodexServer()
  } catch {
    return unavailableCodex()
  }

  return new Promise((resolve) => {
    let settled = false
    let buffer = ""
    const finish = (quota) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.stdin.end()
      child.kill()
      resolve(quota)
    }
    const fail = () => finish(unavailableCodex())
    const timer = setTimeout(fail, PROVIDER_TIMEOUT_MS)
    const initialize = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        clientInfo: {
          name: "ai-quota",
          title: "AI Quota",
          version: "1.0.0",
        },
      },
    }
    const rateLimitsRead = {
      jsonrpc: "2.0",
      id: 2,
      method: "account/rateLimits/read",
      params: null,
    }

    child.on("error", fail)
    child.on("close", fail)
    child.stdin.on("error", fail)
    child.stderr.resume()
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      buffer += chunk
      if (buffer.length > 32 * 1024 * 1024) {
        fail()
        return
      }
      for (;;) {
        const newline = buffer.indexOf("\n")
        if (newline < 0) return
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (!line) continue
        let message
        try {
          message = JSON.parse(line)
        } catch {
          fail()
          return
        }
        if (message.id === 1) {
          if (message.error || !message.result) {
            fail()
            return
          }
          child.stdin.write(`${JSON.stringify(rateLimitsRead)}\n`)
        }
        if (message.id === 2) {
          if (message.error) {
            fail()
            return
          }
          try {
            finish(parseCodexQuota(message))
          } catch {
            fail()
          }
          return
        }
      }
    })
    child.stdin.write(`${JSON.stringify(initialize)}\n`)
  })
}

const [claude, codex] = await Promise.all([readClaudeQuota(), readCodexQuota()])
process.stdout.write(`${JSON.stringify({ claude, codex })}\n`)
process.exitCode = claude.status === "UNAVAILABLE" && codex.status === "UNAVAILABLE" ? 1 : 0
