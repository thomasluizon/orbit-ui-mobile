import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"

import { stripHeredocBodies } from "./rules-git.mjs"
import { insideLinkedWorktree } from "./repo-roots.mjs"

/** The launcher exports this into every worker it starts (tools/launch-worker.mjs). */
const LAUNCHER_MARKER = "ORBIT_LAUNCH_WORKER"

/** Binaries whose arguments are PROSE. A commit message naming `npm run dev` is not a dev server. */
const BROWSER_DRIVERS = new Set(["playwright", "maestro", "cypress", "puppeteer", "chromedriver", "geckodriver", "webdriver", "adb", "emulator"])
/** Package runners that front another program. The real invocation is whatever follows them. */
const RUNNER_PREFIXES = new Set(["npx", "bunx", "sudo", "command", "time"])
const RUNNER_SUBCOMMANDS = new Map([
  ["pnpm", "dlx"],
  ["yarn", "dlx"],
  ["npm", "exec"],
  ["bun", "x"],
])
const DEV_SCRIPTS = new Set(["dev", "start", "serve", "preview"])
const DEV_BINARIES = new Set(["next", "vite", "remix", "nuxt"])
const SCRIPT_RUNNERS = new Set(["npm", "pnpm", "yarn", "bun"])
const SCRIPT_DEPTH_LIMIT = 8
const NETWORK_CLIENTS = new Set(["curl", "wget", "http", "https", "httpie", "open", "xdg-open", "start", "invoke-webrequest", "invoke-restmethod"])
const LOCAL_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?/i

const SEGMENT_SPLIT = /[&|;\n]+/
const LEADING_ASSIGNMENT = /^\s*[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)(?:\s+|$)/

const normalize = (token) =>
  String(token ?? "")
    .replaceAll(/["']/g, "")
    .split(/[/\\]/)
    .pop()
    .replace(/\.(?:exe|cmd|bat|ps1)$/i, "")
    .toLowerCase()

/** The tokens a segment actually invokes: leading grouping and NAME=value assignments removed. */
function tokensOf(segment) {
  let rest = segment.replace(/^[\s(){]*/, "")
  for (let match = LEADING_ASSIGNMENT.exec(rest); match; match = LEADING_ASSIGNMENT.exec(rest)) rest = rest.slice(match[0].length)
  return rest.trim().split(/\s+/).filter(Boolean)
}

/** Strips package-runner prefixes so `npx playwright test` is judged as `playwright test`. */
function withoutRunners(tokens) {
  let rest = tokens
  for (let guard = 0; guard < 4 && rest.length > 1; guard += 1) {
    const binary = normalize(rest[0])
    if (RUNNER_PREFIXES.has(binary)) {
      rest = rest.slice(1)
      continue
    }
    if (RUNNER_SUBCOMMANDS.get(binary) === normalize(rest[1])) {
      rest = rest.slice(2)
      continue
    }
    return rest
  }
  return rest
}

/** What a segment starts, or null. Judged on the program and its arguments, never on stray text. */
function forbiddenAction(segment) {
  const tokens = withoutRunners(tokensOf(segment))
  if (tokens.length === 0) return null
  const binary = normalize(tokens[0])
  const args = tokens.slice(1).filter((token) => !token.startsWith("-")).map(normalize)

  if (BROWSER_DRIVERS.has(binary)) return "a browser driver or an emulator"
  if (DEV_BINARIES.has(binary) && args[0] === "dev") return "a dev server"
  if (SCRIPT_RUNNERS.has(binary) && DEV_SCRIPTS.has(args[0] === "run" ? args[1] : args[0])) return "a dev server"
  if (binary === "expo" && (args[0] === "start" || args[0] === "run")) return "a dev server or an emulator"
  if (binary === "turbo" && args[0] === "run" && args[1] === "dev") return "a dev server"
  if (binary === "dotnet" && args[0] === "run") return "a dev server"
  if (NETWORK_CLIENTS.has(binary) && tokens.some((token) => LOCAL_URL.test(token))) return "a request to a locally served app"
  return null
}

function packageAt(directory) {
  try {
    return JSON.parse(readFileSync(join(directory, "package.json"), "utf8"))
  } catch {
    return null
  }
}

function nearestPackage(cwd) {
  if (!cwd) return null
  for (let directory = resolve(cwd); ; directory = dirname(directory)) {
    const manifest = packageAt(directory)
    if (manifest) return { directory, manifest }
    if (dirname(directory) === directory) return null
  }
}

function workspacePackages(cwd) {
  if (!cwd) return null
  try {
    for (let directory = resolve(cwd); ; directory = dirname(directory)) {
      const manifest = packageAt(directory)
      if (Array.isArray(manifest?.workspaces)) {
        const packages = []
        for (const pattern of manifest.workspaces) {
          if (typeof pattern !== "string") return null
          const star = pattern.indexOf("*")
          const paths = star < 0
            ? [pattern]
            : pattern.endsWith("/*") && star === pattern.length - 1
              ? readdirSync(join(directory, pattern.slice(0, -2)), { withFileTypes: true })
                .filter((entry) => entry.isDirectory()).map((entry) => join(pattern.slice(0, -2), entry.name))
              : null
          if (!paths) return null
          for (const path of paths) {
            const workspaceDirectory = resolve(directory, path)
            const workspaceManifest = packageAt(workspaceDirectory)
            if (workspaceManifest) packages.push({ directory: workspaceDirectory, manifest: workspaceManifest, path: relative(directory, workspaceDirectory) })
          }
        }
        return packages
      }
      if (dirname(directory) === directory) return null
    }
  } catch {
    return null
  }
}

function scriptInvocation(tokens) {
  const binary = normalize(tokens[0])
  if (!SCRIPT_RUNNERS.has(binary)) return null
  const args = tokens.slice(1)
  const workspaces = []
  if (binary === "yarn" && normalize(args[0]) === "workspace") {
    workspaces.push(args[1])
    args.splice(0, 2)
  }
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (token === "--") break
    if (["-w", "--workspace", "--filter"].includes(token)) {
      workspaces.push(args.splice(index, 2)[1])
      index -= 1
    } else if (/^(?:-w|--workspace|--filter)=/.test(token)) {
      workspaces.push(token.slice(token.indexOf("=") + 1))
      args.splice(index, 1)
      index -= 1
    }
  }
  const subcommand = normalize(args[0])
  if (subcommand === "run" || subcommand === "run-script") return { script: args[1], workspaces }
  if (subcommand === "test") return { script: "test", workspaces }
  if (binary !== "npm" && subcommand && !subcommand.startsWith("-")) {
    if (["install", "add", "dlx", "exec", "x", "workspace"].includes(subcommand)) return null
    return { script: args[0], workspaces }
  }
  return null
}

function scriptTargets(invocation, cwd) {
  if (invocation.workspaces.length === 0) {
    const target = nearestPackage(cwd)
    return target ? [target] : null
  }
  const packages = workspacePackages(cwd)
  if (!packages) return null
  return invocation.workspaces.map((workspace) => packages.find(({ manifest, path }) => manifest.name === workspace || path === workspace))
}

function inspectSegment(segment, cwd, depth, activeScripts) {
  const directAction = forbiddenAction(segment)
  if (directAction) return directAction
  const invocation = scriptInvocation(withoutRunners(tokensOf(segment)))
  if (!invocation) return null
  const targets = scriptTargets(invocation, cwd)
  if (!invocation.script || !targets?.length || targets.some((target) => !target)) return "an unresolved package script"
  for (const target of targets) {
    const script = target.manifest.scripts?.[invocation.script]
    const identity = `${target.directory}:${invocation.script}`
    if (typeof script !== "string" || depth >= SCRIPT_DEPTH_LIMIT || activeScripts.has(identity)) return "an unresolved package script"
    const nextActive = new Set(activeScripts).add(identity)
    for (const scriptSegment of stripHeredocBodies(script).split(SEGMENT_SPLIT)) {
      const action = inspectSegment(scriptSegment, target.directory, depth + 1, nextActive)
      if (action) return action
    }
  }
  return null
}

/**
 * @param command the Bash or PowerShell command about to run
 * @param options `{ env, cwd, repoRoots }`
 * @returns `{ block, message }` when the caller is a worker reaching for a browser, else null
 */
export function checkWorkerBrowser(command, { env = {}, cwd = "", repoRoots = [] } = {}) {
  if (typeof command !== "string") return null
  const isWorker = Boolean(env[LAUNCHER_MARKER]) || (cwd !== "" && insideLinkedWorktree(cwd, repoRoots))
  if (!isWorker) return null

  for (const segment of stripHeredocBodies(command).split(SEGMENT_SPLIT)) {
    const action = inspectSegment(segment, cwd, 0, new Set())
    if (!action) continue
    return {
      block: true,
      message:
        `A worker may not start ${action}. Refused: ${segment.trim().slice(0, 160)}\n\n` +
        "Do the code and the tests, commit, push, open the pull request, and stop. Workers never merge.\n" +
        "Visual inspection is owed by a HUMAN, once for the whole redesign during D90, with no\n" +
        "per-screen human wait. See .claude/playbooks/redesign-screen.md. A fresh worktree cannot authenticate.\n" +
        "Tests are Vitest unit and behaviour tests; no Playwright, no e2e/, no dev server, no emulator.",
    }
  }
  return null
}
