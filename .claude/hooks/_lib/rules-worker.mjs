import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"

import { expandCommands } from "./command-expander.mjs"
import { dropLeadingFlags } from "./rules-dependencies.mjs"
import { stripHeredocBodies } from "./rules-git.mjs"
import { insideLinkedWorktree } from "./repo-roots.mjs"

/** The launcher exports this into every worker it starts (tools/launch-worker.mjs). */
const LAUNCHER_MARKER = "ORBIT_LAUNCH_WORKER"
/** `launch-worker.mjs --proof` adds this, so a device proof worker may drive a device. A typed assignment never sets it. */
const DEVICE_PROOF_MARKER = "ORBIT_DEVICE_PROOF"
const DEVICE_DRIVERS = new Set(["adb", "emulator"])
/** The owner's own emulator. A proof uses a named simulator or a throwaway AVD, never this one. */
const OWNER_EMULATOR = "Orbit_Pixel_9_API_35"
/** The launcher pins a proof's throwaway emulator: adb's default serial and the emulator console port. */
const PINNED_SERIAL = "ANDROID_SERIAL"
const PINNED_PORT = "ORBIT_PROOF_EMULATOR_PORT"
/** adb flags that choose a device or a server other than the default serial. `-s` is judged on its value. */
const ADB_DEVICE_FLAGS = new Set(["-e", "-d", "-t", "-H", "-P", "-L"])
/** `launch-worker.mjs --review` and `--proof` add this. A typed assignment never sets it. */
const READ_ONLY_MARKER = "ORBIT_READ_ONLY_RUN"
/** The gh subcommands that only read GitHub. `gh api` is judged on its method and fields. */
const GH_READS = new Map([
  ["pr", new Set(["view", "diff", "checks", "list", "status"])],
  ["issue", new Set(["view", "list", "status"])],
  ["run", new Set(["view", "list", "watch", "download"])],
  ["workflow", new Set(["view", "list"])],
  ["release", new Set(["view", "list"])],
  ["repo", new Set(["view"])],
  ["label", new Set(["list"])],
  ["cache", new Set(["list"])],
  ["search", null],
  ["status", null],
  ["auth", new Set(["status"])],
  ["help", null],
  ["version", null],
])
/** gh api flags that take a value, so the value is never read as the endpoint. */
const GH_API_VALUE_FLAGS = new Set(["-X", "--method", "-f", "-F", "--field", "--raw-field", "--input", "-H", "--header", "-q", "--jq", "-t", "--template", "--cache", "--hostname", "-p", "--preview"])
const GH_API_BODY_FLAGS = new Set(["-f", "-F", "--field", "--raw-field", "--input"])
const CURL_BODY_FLAGS = new Set(["-d", "--data", "--data-raw", "--data-binary", "--data-urlencode", "--json", "-F", "--form", "-T", "--upload-file"])

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
const LOCAL_URL = /(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)(?:[/?#]|$)|https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?:[/?#]|$)/i

const SEGMENT_SPLIT = /[&|;\n]+/
/** `expandCommands` writes this in place of a `$(…)` or backtick substitution it has lifted into its own segment. */
const SUBSTITUTION_PLACEHOLDER = "__substitution__"

/**
 * The commands a guard judges: each executable body of `command`, with `bash -c`, `sh -c`, `eval`,
 * `$(…)`, backticks and subshells unwrapped (the expander that rules-git uses). Returns null when the
 * expander gives up on the nesting depth, and the caller treats that as a refusal.
 */
function executableSegments(command) {
  try {
    return expandCommands(stripHeredocBodies(command))
  } catch {
    return null
  }
}

/** The refusal for a command whose nesting is too deep to inspect. */
const UNINSPECTABLE = {
  block: true,
  message:
    "Refused: this command nests shell wrappers deeper than the hook can inspect.\n\n" +
    "Run each command on its own line, without a nested bash -c, eval or $(…).",
}
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

/** Drops `env` with its flags and NAME=value operands, so `env A=1 adb devices` is judged as `adb devices`. */
function withoutEnv(tokens) {
  let index = 1
  while (index < tokens.length) {
    const token = tokens[index]
    if (token === "-u" || token === "--unset") index += 2
    else if (token.startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) index += 1
    else break
  }
  return tokens.slice(index)
}

/** Strips package-runner prefixes so `npx playwright test` is judged as `playwright test`. */
function withoutRunners(tokens) {
  let rest = tokens
  for (let guard = 0; guard < 4 && rest.length > 1; guard += 1) {
    const binary = normalize(rest[0])
    if (binary === "env") {
      rest = withoutEnv(rest)
      continue
    }
    if (RUNNER_PREFIXES.has(binary)) {
      rest = dropLeadingFlags(rest.slice(1))
      continue
    }
    if (RUNNER_SUBCOMMANDS.get(binary) === normalize(rest[1]) || (["pnpm", "yarn"].includes(binary) && normalize(rest[1]) === "exec")) {
      rest = dropLeadingFlags(rest.slice(2))
      continue
    }
    return rest
  }
  return rest
}

const OWNER_EMULATOR_ACTION = "the owner's emulator"

/** Whether a device proof segment reaches the owner's emulator: by name, or through the tool whose default AVD it is. */
function reachesOwnerEmulator(tokens) {
  if (tokens.some((token) => token.replaceAll(/["']/g, "").replace(/^@/, "").endsWith(OWNER_EMULATOR))) return true
  return normalize(tokens[0]) === "node" && normalize(tokens[1]) === "android-emulator.mjs" && !tokens.some((token) => token === "--avd" || token.startsWith("--avd="))
}

const UNPINNED_ACTION = "an unpinned device"
const unquote = (token) => String(token ?? "").replaceAll(/["']/g, "")

/**
 * A token with a reference to a pinned variable, `$NAME` or `${NAME}` bare or quoted, read as the
 * pinned value. The shell expands the reference after this hook reads the command, and the assignment
 * rule of leavesPinnedDevice keeps the variable at its pinned value.
 */
function pinnedValue(token, pin) {
  const reference = /^\$(?:\{([A-Z_]+)\}|([A-Z_]+))$/.exec(unquote(token))
  const name = reference?.[1] ?? reference?.[2]
  if (name === PINNED_SERIAL) return pin.serial
  if (name === PINNED_PORT) return pin.port
  return unquote(token)
}

/** The value of `flag` in `tokens`, as `flag value` or `flag=value`, or null. */
function flagValue(tokens, flag) {
  const index = tokens.indexOf(flag)
  if (index !== -1) return unquote(tokens[index + 1])
  const joined = tokens.find((token) => token.startsWith(`${flag}=`))
  return joined === undefined ? null : unquote(joined.slice(flag.length + 1))
}

/**
 * Whether a proof segment leaves the device that the launcher pinned: it clears or changes the pinned
 * serial, names another serial or another adb server, or boots an emulator on another console port.
 * adb reaches every running emulator by serial, so only the pinned serial keeps the owner's emulator safe.
 */
function leavesPinnedDevice(segment, tokens, pin) {
  for (const [name, value] of [[PINNED_SERIAL, pin.serial], [PINNED_PORT, pin.port]]) {
    if (new RegExp(`\\bunset\\b[^\\n]*\\b${name}\\b`).test(segment) || new RegExp(`(?:^|\\s)(?:-u|--unset)[\\s=]*${name}\\b`).test(segment)) return true
    for (const match of segment.matchAll(new RegExp(`\\b${name}=(["']?)([^\\s"']*)\\1`, "g"))) if (match[2] !== value) return true
  }
  const binary = normalize(tokens[0])
  const bootTool = binary === "node" && normalize(tokens[1]) === "android-emulator.mjs"
  if (binary !== "adb" && binary !== "emulator" && !bootTool) return false
  if (!pin.serial || !pin.port) return true
  if (binary === "adb") {
    for (let index = 1; index < tokens.length && tokens[index].startsWith("-"); index += 1) {
      const token = unquote(tokens[index])
      if (token === "-s") {
        if (pinnedValue(tokens[index + 1], pin) !== pin.serial) return true
        index += 1
      } else if (ADB_DEVICE_FLAGS.has(token)) return true
    }
    return false
  }
  if (bootTool && tokens.includes("--status")) return false
  const port = flagValue(tokens, binary === "emulator" ? "-port" : "--port")
  return port === null || pinnedValue(port, pin) !== pin.port
}

/** What a segment starts, or null. Judged on the program and its arguments, never on stray text. */
function forbiddenAction(segment, deviceProof) {
  const tokens = withoutRunners(tokensOf(segment))
  if (tokens.length === 0) return null
  const binary = normalize(tokens[0])
  const args = tokens.slice(1).filter((token) => !token.startsWith("-")).map(normalize)

  if (deviceProof && reachesOwnerEmulator(tokens)) return OWNER_EMULATOR_ACTION
  if (deviceProof && leavesPinnedDevice(segment, tokens, deviceProof)) return UNPINNED_ACTION
  if (deviceProof && DEVICE_DRIVERS.has(binary)) return null
  if (BROWSER_DRIVERS.has(binary)) return "a browser driver or an emulator"
  if (DEV_BINARIES.has(binary) && (args[0] === "dev" || (["vite", "remix"].includes(binary) && (!tokens[1] || tokens[1].startsWith("-"))))) return "a dev server"
  if (SCRIPT_RUNNERS.has(binary) && DEV_SCRIPTS.has(args[0] === "run" ? args[1] : args[0])) return "a dev server"
  if (binary === "expo" && (args[0] === "start" || args[0] === "run")) return "a dev server or an emulator"
  if (binary === "turbo" && args[0] === "run" && args[1] === "dev") return "a dev server"
  if (binary === "dotnet" && args[0] === "run") return "a dev server"
  if (NETWORK_CLIENTS.has(binary) && tokens.some((token) => LOCAL_URL.test(token.replace(/["']/g, "")))) return "a request to a locally served app"
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

function inspectSegment(segment, cwd, depth, activeScripts, deviceProof) {
  const directAction = forbiddenAction(segment, deviceProof)
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
      const action = inspectSegment(scriptSegment, target.directory, depth + 1, nextActive, deviceProof)
      if (action) return action
    }
  }
  return null
}

/**
 * @param command the Bash, Monitor or PowerShell command about to run
 * @param options `{ env, cwd, repoRoots }`
 * @returns `{ block, message }` when the caller is a worker reaching for a browser, else null
 */
export function checkWorkerBrowser(command, { env = {}, cwd = "", repoRoots = [] } = {}) {
  if (typeof command !== "string") return null
  const isWorker = Boolean(env[LAUNCHER_MARKER]) || (cwd !== "" && insideLinkedWorktree(cwd, repoRoots))
  if (!isWorker) return null
  const deviceProof = env[DEVICE_PROOF_MARKER] === "1" ? { serial: env[PINNED_SERIAL] ?? "", port: env[PINNED_PORT] ?? "" } : null

  const segments = executableSegments(command)
  if (segments === null) return UNINSPECTABLE
  for (const segment of segments) {
    const action = inspectSegment(segment, cwd, 0, new Set(), deviceProof)
    if (!action) continue
    if (action === OWNER_EMULATOR_ACTION) {
      return {
        block: true,
        message:
          `A device proof may not use the owner's emulator ${OWNER_EMULATOR}. Refused: ${segment.trim().slice(0, 160)}\n\n` +
          "Use the simulators that the order names, or create one throwaway AVD from the installed arm64 play image,\n" +
          "run it headless with no personal account, and delete it when the proof ends. Pass --avd <throwaway name>\n" +
          "to node tools/android-emulator.mjs, whose default AVD is the owner's.",
      }
    }
    if (action === UNPINNED_ACTION) {
      return {
        block: true,
        message:
          `A device proof may use only its pinned device ${deviceProof.serial || "(the launcher pinned none)"}. Refused: ${segment.trim().slice(0, 160)}\n\n` +
          `The launcher sets ${PINNED_SERIAL} and ${PINNED_PORT}. Boot the throwaway AVD with\n` +
          `node tools/android-emulator.mjs --avd <throwaway name> --port $${PINNED_PORT}, run adb with no device flag\n` +
          `or with -s $${PINNED_SERIAL}, and never clear or change either variable.`,
      }
    }
    return {
      block: true,
      message:
        `A worker may not start ${action}. Refused: ${segment.trim().slice(0, 160)}\n\n` +
        "Do the code and the tests, commit, push, open the pull request, and stop. Workers never merge.\n" +
        "Visual inspection is owed by a HUMAN, once for the whole redesign during D90, with no\n" +
        "per-screen human wait. See .claude/playbooks/redesign-screen.md. A fresh worktree cannot authenticate.\n" +
        "Run the full Vitest suites, including headless Chromium geometry tests. No Playwright,\n" +
        "no e2e/, no layout guard, no dev server, no emulator.",
    }
  }
  return null
}

/**
 * The value of a body flag token, or null when the token is not one: `-f`, `-F`, `--field`, `--raw-field`
 * and `--input` as a separate token (value in `next`), a long `--flag=value`, or a value attached to its
 * shorthand flag (`-fbody=x`), which gh also accepts.
 */
function bodyFlagValue(token, next) {
  if (GH_API_BODY_FLAGS.has(token)) return next ?? ""
  const long = [...GH_API_BODY_FLAGS].find((flag) => flag.startsWith("--") && token.startsWith(`${flag}=`))
  if (long) return token.slice(long.length + 1)
  return /^-[fF]./.test(token) ? token.slice(2) : null
}

/** Whether a raw shell word expands a `$` or backtick substitution: one outside single quotes and not escaped. */
function expandsSubstitution(word) {
  let quote = null
  for (let index = 0; index < word.length; index += 1) {
    const character = word[index]
    if (quote === "'") {
      if (character === "'") quote = null
    } else if (character === "\\") index += 1
    else if (character === "$" || character === "`") return true
    else if (character === quote) quote = null
    else if (quote === null && (character === "'" || character === '"')) quote = character
  }
  return false
}

/**
 * Whether a `gh api` call writes: a method other than GET, or a body field or input file without an explicit GET.
 * A GraphQL mutation is searched in the whole `command`, because a multi-line query or a heredoc body
 * sits on lines that the segment split separates from the `gh api` call.
 */
function ghApiWrites(command, tokens) {
  const rest = tokens.slice(2)
  let method = null
  let body = false
  // A query from `--input <file>`, a `key=@<file>` field or a shell substitution is text this hook cannot read.
  let bodyUnreadable = false
  let endpoint = null
  for (let index = 0; index < rest.length; index += 1) {
    const token = unquote(rest[index])
    if (token.startsWith("-X") && token.length > 2) method = token.slice(2)
    else if (token.startsWith("--method=")) method = token.slice("--method=".length)
    else if (token === "-X" || token === "--method") method = unquote(rest[index + 1])
    const value = bodyFlagValue(token, unquote(rest[index + 1]))
    if (value !== null) {
      body = true
      if (token === "--input" || token.startsWith("--input=") || /^[^=]*=@/.test(value)) bodyUnreadable = true
      const raw = bodyFlagValue(rest[index], rest[index + 1]) ?? ""
      if (value.startsWith("query=") && expandsSubstitution(raw)) bodyUnreadable = true
    }
    if (GH_API_VALUE_FLAGS.has(token)) index += 1
    else if (!token.startsWith("-") && endpoint === null) endpoint = token
  }
  if (method !== null) return method.toUpperCase() !== "GET"
  if (!body) return false
  // The expander lifts a substitution out of the segment, and an unquoted one leaves the placeholder as its own word.
  if (rest.some((token) => token.includes(SUBSTITUTION_PLACEHOLDER))) bodyUnreadable = true
  // A GraphQL query is a POST with a body field; only a mutation writes, and a query the hook cannot read may be one.
  return endpoint !== "graphql" || bodyUnreadable || /\bmutation\b/i.test(command)
}

/** The only gh flags that may stand before the subcommand and still read. */
const GH_BARE_FLAGS = new Set(["--version", "--help", "-h"])

/**
 * `tokens` of a gh call without the leading `-R <value>`, `--repo <value>`, `--repo=<value>` and `-R<value>`
 * flags, which gh accepts before the subcommand (`gh -R owner/name pr view 2476`). The program stays first.
 */
function withoutLeadingRepoFlag(tokens) {
  let index = 1
  while (index < tokens.length) {
    const token = unquote(tokens[index])
    if (token === "-R" || token === "--repo") index += 2
    else if (token.startsWith("--repo=") || /^-R./.test(token)) index += 1
    else break
  }
  return [tokens[0], ...tokens.slice(index)]
}

/**
 * Whether a segment of `command` writes to GitHub or reads a credential that could. Judged on the program
 * and its arguments; a GraphQL mutation is judged on the whole raw `command`.
 */
function githubWrite(segment, command) {
  const runnerTokens = withoutRunners(tokensOf(segment))
  const binary = normalize(runnerTokens[0])
  const tokens = binary === "gh" ? withoutLeadingRepoFlag(runnerTokens) : runnerTokens
  const args = tokens.slice(1).filter((token) => !token.startsWith("-")).map(normalize)
  if (binary === "gh") {
    if (args[0] === "api") return ghApiWrites(command, tokens)
    if (tokens.length === 1) return false
    // A leading flag other than these three is a global flag this hook does not know, so it fails safe.
    if (tokens[1].startsWith("-")) return !GH_BARE_FLAGS.has(tokens[1])
    if (!GH_READS.has(args[0])) return true
    const reads = GH_READS.get(args[0])
    return reads !== null && !reads.has(args[1])
  }
  if (binary === "security") return args.some((arg) => /^(?:find-(?:generic|internet)-password|dump-keychain|export)$/.test(arg))
  if (binary === "git") return args[0] === "credential" || args[0]?.startsWith("credential-")
  if (["curl", "wget"].includes(binary) && /github(?:usercontent)?\.com/i.test(segment)) {
    const method = flagValue(tokens, "-X") ?? flagValue(tokens, "--request") ?? flagValue(tokens, "--method") ?? tokens.find((token) => /^-X[A-Za-z]/.test(token))?.slice(2) ?? null
    if (method !== null && method.toUpperCase() !== "GET") return true
    return tokens.some((token) => CURL_BODY_FLAGS.has(unquote(token)) || unquote(token).startsWith("--post-") || unquote(token).startsWith("--data"))
  }
  return false
}

/**
 * A read-only review or proof (launch-worker.mjs --review or --proof) reads GitHub and never writes it.
 * This judges the command text only: a script that calls GitHub itself passes. The worker still holds
 * the owner's token, because the login keychain serves it and the worker's own Claude login together.
 * Returns `{ block, message }` for a GitHub write or a credential read in a read-only run, else null.
 */
export function checkReadOnlyRun(command, { env = {} } = {}) {
  if (typeof command !== "string" || env[READ_ONLY_MARKER] !== "1") return null
  const segments = executableSegments(command)
  if (segments === null) return UNINSPECTABLE
  for (const segment of segments) {
    if (!githubWrite(segment, command)) continue
    return {
      block: true,
      message:
        `A read-only run writes nothing to GitHub and reads no credential. Refused: ${segment.trim().slice(0, 160)}\n\n` +
        "Read with gh pr view, gh pr diff, gh pr checks, gh run view and gh api GET requests. Put each\n" +
        "action that needs a write in the result file; the orchestrator does it.",
    }
  }
  return null
}
