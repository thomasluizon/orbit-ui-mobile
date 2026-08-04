#!/usr/bin/env node

import { promisify } from "node:util"

import {
  execFileHidden,
  execFileSyncHidden,
  hiddenProcessOptions,
  spawnHidden,
  spawnSyncHidden,
} from "../lib/subprocess-options.mjs"
import { minimalChildEnvironment } from "../lib/child-environment.mjs"
import { T, failureCount, root } from "./_harness.mjs"

const childScript = "process.stdout.write(JSON.stringify({ cwd: process.cwd(), marker: process.env.ORBIT_SUBPROCESS_MARKER }))"
const expectedOptions = {
  cwd: root,
  env: { ...process.env, ORBIT_SUBPROCESS_MARKER: "preserved" },
  encoding: "utf8",
  maxBuffer: 4096,
  stdio: ["ignore", "pipe", "pipe"],
  timeout: 5000,
  windowsHide: false,
}

const assertChildResult = (label, result) => {
  let payload
  try {
    payload = JSON.parse(result.stdout)
  } catch {
    payload = null
  }
  T(`${label} preserves child output and environment`, result.status === 0 && payload?.cwd === root && payload?.marker === "preserved", JSON.stringify(result))
}

const subprocessOptionCases = async () => {
  const restricted = minimalChildEnvironment("reviewer", {
    ...process.env,
    CODEX_HOME: root,
    GH_TOKEN: "github-sentinel",
    GITHUB_TOKEN: "github-sentinel",
    LINEAR_API_KEY: "linear-sentinel",
    ORBIT_REVIEW_AUTHORITY_PRIVATE_KEY: "review-sentinel",
    ORBIT_TEST_CHILD_SENTINEL: "preserved only by the test harness",
    ORBIT_HARNESS_TEST: "1",
  })
  T("child environment keeps Codex home and reviewer marker", restricted.CODEX_HOME === root && restricted.ORBIT_LAUNCH_PR_REVIEW === undefined, JSON.stringify(restricted))
  T(
    "child environment excludes provider and harness credentials",
    restricted.GH_TOKEN === undefined && restricted.GITHUB_TOKEN === undefined && restricted.LINEAR_API_KEY === undefined && restricted.ORBIT_REVIEW_AUTHORITY_PRIVATE_KEY === undefined,
    Object.keys(restricted).join(", "),
  )
  T("child environment permits only explicit test controls under the test marker", restricted.ORBIT_TEST_CHILD_SENTINEL === "preserved only by the test harness", Object.keys(restricted).join(", "))

  const options = hiddenProcessOptions(expectedOptions)
  T("hidden process options force windowsHide", options.windowsHide === true, JSON.stringify(options))
  T(
    "hidden process options preserve launch settings",
    options.cwd === expectedOptions.cwd &&
      options.env === expectedOptions.env &&
      options.encoding === expectedOptions.encoding &&
      options.maxBuffer === expectedOptions.maxBuffer &&
      options.stdio === expectedOptions.stdio &&
      options.timeout === expectedOptions.timeout,
    "the compatibility layer changed a caller option",
  )

  assertChildResult(
    "spawnSyncHidden",
    spawnSyncHidden(process.execPath, ["-e", childScript], expectedOptions),
  )
  assertChildResult(
    "execFileSyncHidden",
    { status: 0, stdout: execFileSyncHidden(process.execPath, ["-e", childScript], expectedOptions) },
  )

  const spawned = spawnHidden(process.execPath, ["-e", childScript], expectedOptions)
  const spawnedResult = await new Promise((resolveResult) => {
    let stdout = ""
    spawned.stdout.setEncoding("utf8")
    spawned.stdout.on("data", (chunk) => { stdout += chunk })
    spawned.on("error", (error) => resolveResult({ status: null, stdout, error: error.message }))
    spawned.on("close", (status) => resolveResult({ status, stdout }))
  })
  assertChildResult("spawnHidden", spawnedResult)

  const execFileAsyncHidden = promisify(execFileHidden)
  const executed = await execFileAsyncHidden(process.execPath, ["-e", childScript], expectedOptions)
  assertChildResult("execFileHidden", { status: 0, stdout: executed.stdout })
}

const direct = process.argv[1] && process.argv[1].endsWith("subprocess-options.mjs")
if (direct) {
  const before = failureCount()
  await subprocessOptionCases()
  const failures = failureCount() - before
  console.log(`\n${failures === 0 ? "SUBPROCESS OPTIONS CONTRACT OK" : `SUBPROCESS OPTIONS CONTRACT FAILED (${failures})`}`)
  process.exitCode = failures === 0 ? 0 : 1
}

export { subprocessOptionCases as cases }
