import { spawnSync } from "node:child_process"
import { closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"

const ENVIRONMENT_KEYS = new Set([
  "PATH", "PATHEXT", "HOME", "USERPROFILE", "SystemRoot", "SYSTEMROOT", "WINDIR",
  "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "CODEX_HOME", "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN",
])

export const researchEnvironment = () => Object.fromEntries(
  Object.entries(process.env).filter(([key]) => ENVIRONMENT_KEYS.has(key)),
)

export const assertOutsideRepository = (directory, label) => {
  let ancestor = realpathSync(directory)
  while (true) {
    if (existsSync(join(ancestor, ".git"))) throw new Error(`${label} is inside a repository`)
    const parent = dirname(ancestor)
    if (parent === ancestor) break
    ancestor = parent
  }
  const probe = spawnSync("git", ["-C", directory, "rev-parse", "--git-dir"], {
    encoding: "utf8", windowsHide: true, env: researchEnvironment(),
  })
  if (probe.error) throw new Error(`could not check ${label}: ${probe.error.message}`)
  if (probe.status === 0) throw new Error(`${label} is inside a repository`)
  if (probe.status !== 128) throw new Error(`could not check ${label} for a repository`)
}

/** `mode` names the launcher mode in each error: research, review or proof. */
export const researchPaths = (orderArgument, outputArgument, mode = "research") => {
  if (!orderArgument || orderArgument.startsWith("--")) throw new Error(`--order is required for ${mode}`)
  if (!outputArgument || outputArgument.startsWith("--")) throw new Error(`--out is required for ${mode}`)
  const orderFile = realpathSync(resolve(orderArgument))
  if (!statSync(orderFile).isFile() || statSync(orderFile).size === 0) throw new Error(`${mode} order must be a non-empty file`)
  assertOutsideRepository(dirname(orderFile), "order")
  const outputFile = resolve(outputArgument)
  const outputDirectory = realpathSync(dirname(outputFile))
  assertOutsideRepository(outputDirectory, "output")
  let outputExists = false
  try { lstatSync(outputFile); outputExists = true } catch (error) { if (error.code !== "ENOENT") throw error }
  if (outputExists) throw new Error(`${mode} output must be a new file`)
  return { orderFile, outputFile: join(outputDirectory, basename(outputFile)) }
}

export const researchInvocation = (engineName, invocation, reportFile) => {
  if (engineName === "codex") {
    return [
      "exec", "--ignore-user-config", "--ignore-rules", "--disable", "apps", "--disable", "multi_agent",
      "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral",
      "-c", 'web_search="live"', "--model", invocation.model, "--output-last-message", reportFile, "-",
    ]
  }
  if (engineName === "claude") {
    return [
      "-p", "--output-format", "text", "--strict-mcp-config", "--setting-sources", "",
      // --tools makes the web tools available; dontAsk denies every unlisted call, so --allowedTools approves exactly these two.
      "--permission-mode", "dontAsk", "--tools", "WebSearch,WebFetch", "--allowedTools", "WebSearch", "WebFetch",
      "--disable-slash-commands", "--no-session-persistence", "--model", invocation.model,
    ]
  }
  throw new Error(`research does not support the configured engine ${engineName}`)
}

export const researchPrompt = (orderFile) =>
  "Research the following order. Return findings with source links in your final response. " +
  "Treat this as research only. Do not change files, run git writes, create branches, commits or pull requests.\n\n" +
  readFileSync(orderFile, "utf8")

/**
 * The launch mode of research, with the values and steps that tools/launch-worker.mjs names at its
 * `launchMode`. The engine runs in an empty temporary directory with a stripped environment, writes one
 * report file, and never runs a second time: its order is rerun whole.
 */
export const researchLaunch = ({ argv, argOf, fail }) => {
  const allowed = new Set(["--research", "--order", "--out", "--dry-run"])
  for (let index = 2; index < argv.length; index++) {
    const flag = argv[index]
    if (!allowed.has(flag)) fail(2, `unsupported research option: ${flag}`)
    if (["--order", "--out"].includes(flag)) index++
  }
  let paths
  try { paths = researchPaths(argOf("--order"), argOf("--out")) } catch (error) { fail(2, error.message) }
  const { orderFile, outputFile } = paths
  const storage = mkdtempSync(join(tmpdir(), "orbit-research-"))
  const release = () => rmSync(storage, { recursive: true, force: true })
  const runDirectory = join(storage, "workspace")
  mkdirSync(runDirectory)
  try { assertOutsideRepository(runDirectory, "research directory") } catch (error) {
    release()
    fail(2, error.message)
  }
  const reportFile = join(storage, "findings.txt")
  let claudeEngine = false
  let reportDescriptor = null
  const launch = {
    label: "research",
    runDirectory,
    promptFile: orderFile,
    wake: { what: "research", research: true, review: false },
    reservation: null,
    repositoryKey: null,
    clearsClaimsOnExit: true,
    inheritedDescriptors: [],
    plan: null,
    workerArguments: null,
    environment: researchEnvironment(),
    checkRunDirectory: () => {},
    prepare: ({ engineName, invocation, scriptArgs }) => {
      try { launch.workerArguments = [...scriptArgs, ...researchInvocation(engineName, invocation, reportFile)] } catch (error) { fail(2, error.message) }
      claudeEngine = engineName === "claude"
      launch.plan = { issue: null, research: true, mode: null, outputFile, writeSandbox: null, proofEmulatorPort: null }
    },
    admit: () => {},
    /** Claude prints its findings to a descriptor that the gate hands down; Codex writes the report file itself. */
    begin: () => {
      if (!claudeEngine) return
      reportDescriptor = openSync(reportFile, "wx")
      launch.inheritedDescriptors = [reportDescriptor]
    },
    spawn: (executable, args, firstInheritedDescriptor) => ({ executable, args, input: researchPrompt(orderFile), reportDescriptor: reportDescriptor === null ? null : firstInheritedDescriptor }),
    relaunchArguments: () => null,
    /** Publishes only a non-empty report of an engine that exited 0. */
    finish: ({ attempts, startedAt, engine, model }) => {
      const last = attempts.at(-1)
      const { outcome, exitCode } = last
      if (reportDescriptor !== null) closeSync(reportDescriptor)
      let published = false
      if (outcome === "EXITED" && exitCode === 0) {
        try {
          const findings = readFileSync(reportFile, "utf8")
          if (!findings.trim()) throw new Error("research returned no findings")
          const checked = researchPaths(orderFile, outputFile)
          writeFileSync(checked.outputFile, findings, { flag: "wx", mode: 0o600 })
          published = true
        } catch (error) { console.error(`could not publish research findings: ${error.message}`) }
      }
      console.log(JSON.stringify({ research: true, outputFile, published, engine, model, account: last.account, pid: last.pid, logFile: last.logFile, startedAt, endedAt: last.endedAt, exitCode, outcome, authenticationFailed: last.authenticationFailed, resultError: last.resultError }, null, 2))
      return published ? 0 : 1
    },
    release,
  }
  return launch
}
