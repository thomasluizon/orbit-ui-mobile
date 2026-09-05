// A WORKER never opens a browser and never starts a server.
//
// Measured 2026-08-06, both on tickets whose code was already committed and correct. ORB-39 (221
// lines, both platforms) started a dev server on :3920, wrote a Playwright visual test, sat on
// /login because a worktree has no seeded session, and was killed at the 45 minute ceiling with a
// dirty tree. ORB-98 (145 lines, 6 files, including the exact Vitest spec its ticket asked for)
// opened /login?returnUrl=%2Fpreferences and burned the rest of its budget. Two worker budgets, two
// dev servers left listening, two deliveries a human had to rescue.
//
// A prompt is advisory and decays as context fills, so this rule is the gate. It applies to every
// launched worker and no ticket can lift it.
//
// Pure: takes the command string plus injected environment and cwd, returns { block, message } or
// null. Scoped to the CALLER, which is what keeps /dev-server working: a session in the main
// checkout with no launcher marker is Thomas, and Thomas looks at the browser whenever he likes.

import { stripHeredocBodies } from "./rules-git.mjs"
import { insideLinkedWorktree } from "./repo-roots.mjs"

/** The launcher exports this into every worker it starts (tools/launch-worker.mjs). */
const LAUNCHER_MARKER = "ORBIT_LAUNCH_WORKER"

/** Binaries whose arguments are PROSE. A commit message naming `npm run dev` is not a dev server. */
/**
 * Every rule below judges the INVOKED PROGRAM and its arguments, never arbitrary text inside the
 * segment. An earlier revision scanned the whole segment, so `rg -n playwright .` was refused: a
 * worker could not inspect or delete the very code this rule bans, which aborts executable work for
 * no safety at all. The same defect was found and fixed once already in rules-orchestrator.mjs,
 * where a grep whose PATTERN named an engine was read as an invocation.
 *
 * KNOWN BYPASSES, disclosed rather than implied, because a list that reads as exhaustive and is not
 * is worse than none: a shell or interpreter wrapper (`sh -c '<command>'`, `node -e "..."`) whose
 * inner text is never inspected; a script file that runs any of this; and an npm script name that
 * fronts a dev server without being called dev, start, serve or preview. This is cost-raising
 * defence in depth. The prompt in tools/compose-prompt.mjs states the rule; this stops the reflex.
 */
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
    const action = forbiddenAction(segment)
    if (!action) continue
    return {
      block: true,
      message:
        `A worker may not start ${action}. Refused: ${segment.trim().slice(0, 160)}\n\n` +
        "Do the code and the tests, commit, push, open the pull request, and stop. Workers never merge.\n" +
        "Human inspection follows .claude/playbooks/redesign-screen.md: during D90 it happens once\n" +
        "for the whole redesign, with no per-screen human wait. A fresh worktree cannot authenticate.\n" +
        "Two workers finished their tickets and then lost the delivery to exactly this.\n" +
        "Tests are Vitest unit and behaviour tests; no Playwright, no e2e/, no dev server, no emulator.",
    }
  }
  return null
}
