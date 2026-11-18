import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"

import { expandCommands } from "./command-expander.mjs"
import { dropLeadingFlags } from "./rules-dependencies.mjs"
import { stripHeredocBodies } from "./rules-git.mjs"
import { invocationsOf, LIST_START_WORDS, PLAIN_SUBSET_ADVICE, programName, readCommand, walkCommands } from "./shell-subset.mjs"
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
/** `launch-worker.mjs --review` and `--proof` add this. A typed assignment never sets it. */
const READ_ONLY_MARKER = "ORBIT_READ_ONLY_RUN"
/** The programs that call GitHub. A read-only run never starts one through `xargs`. */
const GITHUB_PROGRAMS = new Set(["gh", "curl", "wget"])
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

/** Binaries whose arguments are PROSE. A commit message naming `npm run dev` is not a dev server. */
const BROWSER_DRIVERS = new Set(["playwright", "maestro", "cypress", "puppeteer", "chromedriver", "geckodriver", "webdriver", "adb", "emulator"])
/** Package runners that front another program. The real invocation is whatever follows them. The shell wrappers are the `WRAPPERS` of `shell-subset.mjs`. */
const RUNNER_PREFIXES = new Set(["npx", "bunx"])
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

/** The action of a command whose nesting is too deep to inspect. */
const UNINSPECTABLE_ACTION = "a command nested too deep to inspect"
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

/**
 * Drops a package runner and its flags, so `npx playwright test` is judged as `playwright test`. The tokens are the program and
 * its arguments, with no shell wrapper: `invocationsOf` of `shell-subset.mjs` already took those away.
 */
function withoutRunners(tokens) {
  let rest = tokens
  for (let guard = 0; guard < 8 && rest.length > 1; guard += 1) {
    const binary = normalize(rest[0])
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

/**
 * The programs of a text segment that the reader of `shell-subset.mjs` cannot model, each one as its words: the segment with its leading list
 * words (`do`, `then`) and each shell wrapper taken away by `invocationsOf`.
 */
function textInvocations(segment) {
  const tokens = tokensOf(segment).map((token) => token.replaceAll(/["']/g, ""))
  let start = 0
  while (start < tokens.length && LIST_START_WORDS.has(tokens[start])) start += 1
  return invocationsOf(tokens.slice(start).map((text) => ({ text, dynamic: "" }))).map(({ program, args }) => [program.text, ...args.map((word) => word.text)])
}

const OTHER_AVD_ACTION = "an AVD other than the throwaway of the proof"

const UNPINNED_ACTION = "an unpinned device"
const unquote = (token) => String(token ?? "").replaceAll(/["']/g, "")

/** Whether the words start the boot tool of the proof order: `node <path>/android-emulator.mjs`. */
const isBootTool = (tokens) => normalize(tokens[0]) === "node" && normalize(tokens[1]) === "android-emulator.mjs"

/** Whether the words start `adb`, `emulator` or the boot tool of the proof order. */
const isDeviceProgram = (tokens) => ["adb", "emulator"].includes(normalize(tokens[0])) || isBootTool(tokens)

/** The text with each reference to the pinned port, `$NAME` or `${NAME}`, replaced by the pinned port. */
const withPinnedPort = (text, pin) => text.replaceAll(new RegExp(String.raw`\$\{${PINNED_PORT}\}|\$${PINNED_PORT}(?![A-Za-z0-9_])`, "g"), pin.port)

/**
 * The AVD names that the words of an `emulator` or boot tool call select: `-avd NAME`, `--avd NAME`, `--avd=NAME` and `@NAME`. A word that
 * starts an AVD option in another spelling is listed as it is, so it never equals the name of the proof.
 */
function selectedAvds(tokens) {
  const names = []
  for (let index = 1; index < tokens.length; index += 1) {
    const token = unquote(tokens[index])
    if (token === "-avd" || token === "--avd") names.push(unquote(tokens[++index]))
    else if (token.startsWith("--avd=")) names.push(token.slice("--avd=".length))
    else if (token.startsWith("@")) names.push(token.slice(1))
    else if (/^--?avd/.test(token)) names.push(token)
  }
  return names
}

/**
 * Whether an `emulator` or boot tool call of a proof boots any AVD but `orbit-proof-<pinned port>`, which is the AVD that the proof order names.
 * The default AVD of the boot tool is the owner's, so a call with no AVD boots another one. The check is an allow list on the text of each name
 * after each reference to the pinned port is read as its value, so no variable or loop can supply the owner's name.
 */
function bootsOtherAvd(tokens, pin) {
  if (normalize(tokens[0]) !== "emulator" && !isBootTool(tokens)) return false
  if (!pin.port) return false
  const names = selectedAvds(tokens)
  return names.length === 0 || names.some((name) => withPinnedPort(name, pin) !== `orbit-proof-${pin.port}`)
}

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

const PINNED_NAMES = [PINNED_SERIAL, PINNED_PORT]
/** The builtins whose words are `NAME=value`: the reader allows no option for them. */
const ASSIGNING_BUILTINS = new Set(["export", "declare", "typeset", "local", "readonly"])
const NAME_ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)(\+?)=(.*)$/s

/**
 * Whether a command of a proof changes a pinned variable: an assignment or an `env` word with another value or with a value that
 * the reader cannot know, an `export` of such an assignment, or an `unset` of the name. `env -i`, `env -u`, `export -n`
 * and `declare +x` are options that the reader refuses, so no rule here reads them.
 */
function changesPinnedVariable({ assignments, invocations }, pin) {
  const pinned = { [PINNED_SERIAL]: pin.serial, [PINNED_PORT]: pin.port }
  const assigned = [
    ...assignments,
    ...invocations.flatMap(({ before }) => before),
    ...invocations.filter(({ program }) => ASSIGNING_BUILTINS.has(programName(program.text))).flatMap(({ args }) => args),
  ]
  const changed = assigned.some((word) => {
    const match = NAME_ASSIGNMENT.exec(word.text)
    return match !== null && PINNED_NAMES.includes(match[1]) && (match[2] === "+" || word.dynamic !== "" || match[3] !== pinned[match[1]])
  })
  const unset = invocations.some(({ program, args }) => programName(program.text) === "unset" && args.some((word) => PINNED_NAMES.includes(word.text)))
  return changed || unset
}

/**
 * Whether an `adb`, `emulator` or emulator tool call of a proof leaves the device that the launcher pinned: it names another serial or
 * another adb server, or boots an emulator on another console port. adb reaches every running emulator by serial, so only the pinned
 * serial keeps the owner's emulator safe.
 */
function leavesPinnedDevice(tokens, pin) {
  const binary = normalize(tokens[0])
  const bootTool = isBootTool(tokens)
  if (!isDeviceProgram(tokens)) return false
  if (!pin.serial || !pin.port) return true
  if (binary === "adb") {
    // An allow list: adb reads a value in the same word as its option (`-t1`, `-s127.0.0.1:5555`, `-P5038`), so only `-s <pinned serial>` leads.
    for (let index = 1; index < tokens.length && tokens[index].startsWith("-"); index += 2) {
      if (unquote(tokens[index]) !== "-s" || pinnedValue(tokens[index + 1], pin) !== pin.serial) return true
    }
    return false
  }
  if (bootTool && tokens.includes("--status")) return false
  const port = flagValue(tokens, binary === "emulator" ? "-port" : "--port")
  return port === null || pinnedValue(port, pin) !== pin.port
}

/** What a program with these words starts, or null. Judged on the program and its arguments, never on stray text. */
function forbiddenAction(words, deviceProof) {
  const tokens = withoutRunners(words)
  if (tokens.length === 0) return null
  const binary = normalize(tokens[0])
  const args = tokens.slice(1).filter((token) => !token.startsWith("-")).map(normalize)

  if (deviceProof && bootsOtherAvd(tokens, deviceProof)) return OTHER_AVD_ACTION
  if (deviceProof && leavesPinnedDevice(tokens, deviceProof)) return UNPINNED_ACTION
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

/** The refusal of a proof for a command that the reader cannot model: nothing proves that the command leaves the pinned device. */
const UNREADABLE_PROOF_ACTION = "a command that the hook cannot read"

/** The action that a program with these words starts, or the action of the package script that it runs. `source` is the text that a message shows. */
function inspectWords(words, source, context) {
  const { cwd, depth, activeScripts, deviceProof } = context
  const directAction = forbiddenAction(words, deviceProof)
  if (directAction) return { action: directAction, source }
  const invocation = scriptInvocation(withoutRunners(words))
  if (!invocation) return null
  const targets = scriptTargets(invocation, cwd)
  if (!invocation.script || !targets?.length || targets.some((target) => !target)) return { action: "an unresolved package script", source }
  for (const target of targets) {
    const script = target.manifest.scripts?.[invocation.script]
    const identity = `${target.directory}:${invocation.script}`
    if (typeof script !== "string" || depth >= SCRIPT_DEPTH_LIMIT || activeScripts.has(identity)) return { action: "an unresolved package script", source }
    const found = judgeCommand(script, { ...context, cwd: target.directory, depth: depth + 1, activeScripts: new Set(activeScripts).add(identity) })
    if (found) return found
  }
  return null
}

/**
 * The first action of `command` that a worker may not start, as `{ action, source, reason }`, or null. A command in the modelled subset is judged
 * on the program and the words that `readCommand` and `invocationsOf` find. Another command is judged on the text segments of the expander, and a
 * proof refuses it when no segment is an action, because nothing proves what such a command does to the pinned device.
 */
function judgeCommand(command, context) {
  const read = readCommand(command)
  const calls = []
  // A `for` loop sets its name in the shell, so a binding is a call with no word and one assignment.
  const bind = (name, value) => calls.push({ words: [], assignments: [{ text: `${name}=${value}`, dynamic: "" }], source: `for ${name} in ${value}` })
  const reason = read.notModelled || walkCommands(read.list, null, (call) => { calls.push(call); return null }, bind)
  if (reason === "") {
    for (const call of calls) {
      const invocations = invocationsOf(call.words)
      const source = call.source ?? call.words.map((word) => word.text).join(" ")
      if (context.deviceProof && changesPinnedVariable({ assignments: call.assignments, invocations }, context.deviceProof)) return { action: UNPINNED_ACTION, source }
      for (const { program, args, wrappers } of invocations) {
        // xargs adds the words from standard input to the program, so the words on the line do not decide the device.
        if (context.deviceProof && wrappers.includes("xargs") && isDeviceProgram(withoutRunners([program, ...args].map((word) => word.text)))) return { action: UNPINNED_ACTION, source }
        const found = inspectWords([program, ...args].map((word) => word.text), source, context)
        if (found) return found
      }
    }
    return null
  }
  const segments = executableSegments(command)
  if (segments === null) return { action: UNINSPECTABLE_ACTION, source: command }
  for (const segment of segments) {
    for (const words of textInvocations(segment)) {
      const found = inspectWords(words, segment, context)
      if (found) return found
    }
  }
  return context.deviceProof ? { action: UNREADABLE_PROOF_ACTION, source: command, reason } : null
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

  const found = judgeCommand(command, { cwd, depth: 0, activeScripts: new Set(), deviceProof })
  if (!found) return null
  const { action, source, reason } = found
  if (action === UNINSPECTABLE_ACTION) return UNINSPECTABLE
  if (action === UNREADABLE_PROOF_ACTION) return unreadable(reason, "a device proof")
  if (action === OTHER_AVD_ACTION) {
    return {
      block: true,
      message:
        `A device proof may boot only its throwaway AVD orbit-proof-${deviceProof.port || "<port>"}, never the owner's emulator ${OWNER_EMULATOR}. Refused: ${source.trim().slice(0, 160)}\n\n` +
        "Use the simulators that the order names, or boot the throwaway AVD with the command of the order:\n" +
        `node <launcher>/tools/android-emulator.mjs --avd orbit-proof-$${PINNED_PORT} --port $${PINNED_PORT}\n` +
        "The default AVD of that tool is the owner's, so pass --avd. Delete the AVD when the proof ends.",
    }
  }
  if (action === UNPINNED_ACTION) {
    return {
      block: true,
      message:
        `A device proof may use only its pinned device ${deviceProof.serial || "(the launcher pinned none)"}. Refused: ${source.trim().slice(0, 160)}\n\n` +
        `The launcher sets ${PINNED_SERIAL} and ${PINNED_PORT}. Boot the throwaway AVD with\n` +
        `node <launcher>/tools/android-emulator.mjs --avd orbit-proof-$${PINNED_PORT} --port $${PINNED_PORT}, run adb with no option\n` +
        `or with -s $${PINNED_SERIAL} first, and never clear, change or bind either variable. Run adb and emulator directly, never through xargs.`,
    }
  }
  return {
    block: true,
    message:
      `A worker may not start ${action}. Refused: ${source.trim().slice(0, 160)}\n\n` +
      "Do the code and the tests, commit, push, open the pull request, and stop. Workers never merge.\n" +
      "Visual inspection is owed by a HUMAN, once for the whole redesign during D90, with no\n" +
      "per-screen human wait. See .claude/playbooks/redesign-screen.md. A fresh worktree cannot authenticate.\n" +
      "Run the full Vitest suites, including headless Chromium geometry tests. No Playwright,\n" +
      "no e2e/, no layout guard, no dev server, no emulator.",
  }
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

/**
 * Whether a `gh api` call writes: a method other than GET, or a body field or input file without an explicit GET.
 * A GraphQL mutation is searched in the whole `command`, because a multi-line query or a heredoc body
 * sits on lines that the segment split separates from the `gh api` call.
 */
function ghApiWrites(command, words) {
  const rest = words.slice(2).map((word) => word.text)
  let method = null
  let body = false
  // A query from `--input <file>`, a `key=@<file>` field or a word that the shell expands is text this hook cannot read.
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
    }
    if (GH_API_VALUE_FLAGS.has(token)) index += 1
    else if (!token.startsWith("-") && endpoint === null) endpoint = token
  }
  if (method !== null) return method.toUpperCase() !== "GET"
  if (!body) return false
  // The reader marks a word that a substitution or a variable makes, so it may hold a query or a field that this hook cannot read.
  if (words.slice(2).some((word) => word.dynamic !== "")) bodyUnreadable = true
  // A GraphQL query is a POST with a body field; only a mutation writes, and a query the hook cannot read may be one.
  return endpoint !== "graphql" || bodyUnreadable || /\bmutation\b/i.test(command)
}

/**
 * Whether the words of a `gh auth status` call ask for the token: `--show-token`, or a short flag cluster that holds `t`.
 * `-h` takes the rest of its cluster as the host name, so the letters after it are no flags.
 */
function showsToken(tokens) {
  return tokens.slice(1).map(unquote).some((word) => {
    if (/^--show-token(?:=|$)/.test(word)) return true
    if (!/^-[A-Za-z]/.test(word)) return false
    for (const letter of word.slice(1)) {
      if (letter === "t") return true
      if (letter === "h") return false
    }
    return false
  })
}

/** The only gh flags that may stand before the subcommand and still read. */
const GH_BARE_FLAGS = new Set(["--version", "--help", "-h"])

/**
 * The words of a gh call without the leading `-R <value>`, `--repo <value>`, `--repo=<value>` and `-R<value>`
 * flags, which gh accepts before the subcommand (`gh -R owner/name pr view 2476`). The program stays first.
 */
function withoutLeadingRepoFlag(words) {
  let index = 1
  while (index < words.length) {
    const token = unquote(words[index].text)
    if (token === "-R" || token === "--repo") index += 2
    else if (token.startsWith("--repo=") || /^-R./.test(token)) index += 1
    else break
  }
  return [words[0], ...words.slice(index)]
}

/**
 * Whether a program of `command`, given as its words, writes to GitHub or reads a credential that could. Judged on the program
 * and its arguments; a GraphQL mutation is judged on the whole raw `command`.
 */
function githubWrite(invocationWords, command) {
  const runnerTokens = withoutRunners(invocationWords.map((word) => word.text))
  const runnerWords = invocationWords.slice(invocationWords.length - runnerTokens.length)
  const binary = normalize(runnerTokens[0])
  const words = binary === "gh" ? withoutLeadingRepoFlag(runnerWords) : runnerWords
  const tokens = words.map((word) => word.text)
  const args = tokens.slice(1).filter((token) => !token.startsWith("-")).map(normalize)
  if (binary === "gh") {
    if (args[0] === "api") return ghApiWrites(command, words)
    if (tokens.length === 1) return false
    // A leading flag other than these three is a global flag this hook does not know, so it fails safe.
    if (tokens[1].startsWith("-")) return !GH_BARE_FLAGS.has(tokens[1])
    if (!GH_READS.has(args[0])) return true
    const reads = GH_READS.get(args[0])
    if (reads === null) return false
    // `gh auth status -t` prints the token in full, as `gh auth token` does.
    return !reads.has(args[1]) || (args[0] === "auth" && showsToken(tokens))
  }
  if (binary === "security") return args.some((arg) => /^(?:find-(?:generic|internet)-password|dump-keychain|export)$/.test(arg))
  if (binary === "git") return args[0] === "credential" || args[0]?.startsWith("credential-")
  // curl and wget read a body or a method from many spellings (`-d<value>`, `-d@file`, `-T<file>`), so a call to a GitHub host never passes: a read goes through `gh`.
  return ["curl", "wget"].includes(binary) && /github(?:usercontent)?\.com/i.test(tokens.join(" "))
}

/** The refusal for a command that the reader cannot model, in a read-only run or a proof: the guards cannot judge what such a command runs. */
const unreadable = (reason, runKind = "a read-only run") => ({
  block: true,
  message: `Refused: this command holds ${reason}, which the hook cannot inspect in ${runKind}.\n\n${PLAIN_SUBSET_ADVICE}`,
})

/**
 * A read-only review or proof (launch-worker.mjs --review or --proof) reads GitHub and never writes it. Each program that the reader of
 * `shell-subset.mjs` finds is judged on its own words, and a command outside the subset is refused. A script that calls GitHub itself passes,
 * and the worker still holds the owner's token. Returns `{ block, message }` for a GitHub write or a credential read, else null.
 */
export function checkReadOnlyRun(command, { env = {} } = {}) {
  if (typeof command !== "string" || env[READ_ONLY_MARKER] !== "1") return null
  const read = readCommand(command)
  const calls = []
  const reason = read.notModelled || walkCommands(read.list, null, (call) => { calls.push(call); return null })
  if (reason !== "") return unreadable(reason)
  for (const { words } of calls) {
    for (const { program, args, wrappers } of invocationsOf(words)) {
      // xargs adds the words from standard input, which decide the subcommand, the method and the body.
      const throughXargs = wrappers.includes("xargs") && GITHUB_PROGRAMS.has(normalize(withoutRunners([program, ...args].map((word) => word.text))[0]))
      if (!throughXargs && !githubWrite([program, ...args], command)) continue
      return {
        block: true,
        message:
          `A read-only run writes nothing to GitHub and reads no credential. Refused: ${words.map((word) => word.text).join(" ").slice(0, 160)}\n\n` +
          "Read with gh pr view, gh pr diff, gh pr checks, gh run view and gh api GET requests. Put each\n" +
          "action that needs a write in the result file; the orchestrator does it.",
      }
    }
  }
  return null
}
