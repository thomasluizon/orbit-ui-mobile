#!/usr/bin/env node

import { spawn } from "node:child_process"
import { readdirSync } from "node:fs"
import { availableParallelism } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: test-tools.mjs [--only <module>]...

  Runs every case module of tools/__tests__ in its own process, at most one process for each core.
  A case module is a file whose name does not start with _ and does not end with .test.mjs.
  It exports cases(). Hermetic: no network, worktree, or ticket system.

  --only <module>  run one case module, named by its file name without .mjs; repeat to select more
  --help, -h       print this usage and exit 0

exit codes: 0 every check passed, 1 a failing check, 2 usage error`

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url))
const TESTS_DIR = join(TOOLS_DIR, "__tests__")
const MODULE_TIMEOUT_MS = 10 * 60 * 1000
const ASSERTIONS_LINE = /^Assertions: (\d+)$/m

const usageError = (message) => {
  console.error(`test-tools: ${message}\n\n${USAGE}`)
  process.exit(2)
}

/** The child: runs the cases of one module and exits 1 on a failed assertion, on none, or on a module without cases(). */
const runModule = async (name) => {
  const { configure, failureCount, assertionCount } = await import("./__tests__/_harness.mjs")
  configure({ toolsDir: TOOLS_DIR, self: "test-tools.mjs" })
  const loaded = await import(`./__tests__/${name}.mjs`)
  if (typeof loaded.cases !== "function") {
    console.error(`test-tools: tools/__tests__/${name}.mjs exports no cases()`)
    process.exit(1)
  }
  await loaded.cases()
  console.log(`Assertions: ${assertionCount()}`)
  if (assertionCount() === 0) {
    console.error(`test-tools: tools/__tests__/${name}.mjs ran no assertion`)
    process.exit(1)
  }
  process.exit(failureCount() === 0 ? 0 : 1)
}

const startModule = (name) => new Promise((resolve) => {
  const child = spawn(process.execPath, [join(TOOLS_DIR, "test-tools.mjs"), "--module", name], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  let output = ""
  child.stdout.on("data", (chunk) => { output += chunk })
  child.stderr.on("data", (chunk) => { output += chunk })
  const timer = setTimeout(() => child.kill("SIGKILL"), MODULE_TIMEOUT_MS)
  child.once("error", (error) => resolve({ name, status: 1, output: `${output}${error.message}\n` }))
  child.once("close", (status, signal) => {
    clearTimeout(timer)
    resolve({ name, status: status ?? signal, output })
  })
})

const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}
if (args[0] === "--module") await runModule(args[1])

const startedAt = Date.now()
const available = readdirSync(TESTS_DIR)
  .filter((file) => file.endsWith(".mjs") && !file.startsWith("_") && !file.endsWith(".test.mjs"))
  .map((file) => file.slice(0, -".mjs".length))
  .sort()
const requested = []
for (let index = 0; index < args.length; index++) {
  if (args[index] !== "--only") usageError(`unknown argument ${args[index]}`)
  const value = args[++index]
  if (!value || value.startsWith("-")) usageError("--only requires a module name")
  if (!available.includes(value)) usageError(`unknown module ${value}`)
  requested.push(value)
}
const selected = requested.length > 0 ? [...new Set(requested)] : available

const queue = [...selected]
const results = []
const worker = async () => {
  for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
    const result = await startModule(name)
    results.push(result)
    console.log(result.status === 0 ? `ok   ${name}` : `FAIL ${name} (exit ${result.status})\n${result.output.trimEnd()}`)
  }
}
await Promise.all(Array.from({ length: Math.min(availableParallelism(), selected.length) }, worker))

const failed = results.filter((result) => result.status !== 0).map((result) => result.name).sort()
const assertions = results.reduce((total, result) => total + Number(ASSERTIONS_LINE.exec(result.output)?.[1] ?? 0), 0)
console.log(`\nAssertions: ${assertions} | Modules: ${results.length} | Elapsed: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
console.log(failed.length === 0 ? "ORBIT TOOLS GATE OK" : `ORBIT TOOLS GATE FAILED (${failed.join(", ")})`)
process.exit(failed.length === 0 ? 0 : 1)
