import { spawnSync } from "node:child_process"
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs"
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

export const researchPaths = (orderArgument, outputArgument) => {
  if (!orderArgument || orderArgument.startsWith("--")) throw new Error("--order is required for research")
  if (!outputArgument || outputArgument.startsWith("--")) throw new Error("--out is required for research")
  const orderFile = realpathSync(resolve(orderArgument))
  if (!statSync(orderFile).isFile() || statSync(orderFile).size === 0) throw new Error("research order must be a non-empty file")
  assertOutsideRepository(dirname(orderFile), "order")
  const outputFile = resolve(outputArgument)
  const outputDirectory = realpathSync(dirname(outputFile))
  assertOutsideRepository(outputDirectory, "output")
  let outputExists = false
  try { lstatSync(outputFile); outputExists = true } catch (error) { if (error.code !== "ENOENT") throw error }
  if (outputExists) throw new Error("research output must be a new file")
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
