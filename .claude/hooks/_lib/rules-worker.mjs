// A WORKER never opens a browser and never starts a server.
//
// Measured 2026-08-06, both on tickets whose code was already committed and correct. ORB-39 (221
// lines, both platforms) started a dev server on :3920, wrote a Playwright visual test, sat on
// /login because a worktree has no seeded session, and was killed at the 45 minute ceiling with a
// dirty tree. ORB-98 (145 lines, 6 files, including the exact Vitest spec its ticket asked for)
// opened /login?returnUrl=%2Fpreferences and burned the rest of its budget. Two worker budgets, two
// dev servers left listening, two deliveries a human had to rescue.
//
// The prompt says so too (tools/compose-prompt.mjs), and the prompt alone already failed once: it
// was scoped to visible-effect tickets, ORB-86 received it and made 4 browser-related log entries
// while ORB-98 did not and made 51. A prompt is advisory and decays as context fills, so this is the
// gate. It takes no subset and no ticket can lift it.
//
// Pure: takes the command string plus injected environment and cwd, returns { block, message } or
// null. Scoped to the CALLER, which is what keeps /dev-server working: a session in the main
// checkout with no launcher marker is Thomas, and Thomas looks at the browser whenever he likes.

import { stripHeredocBodies } from "./rules-git.mjs"
import { insideLinkedWorktree } from "./repo-roots.mjs"

/** The launcher exports this into every worker it starts (tools/launch-worker.mjs). */
const LAUNCHER_MARKER = "ORBIT_LAUNCH_WORKER"

/** Binaries whose arguments are PROSE. A commit message naming `npm run dev` is not a dev server. */
const QUOTING_BINARIES = new Set(["git", "echo", "printf", "cat"])

const FORBIDDEN = [
  { pattern: /(?<![\w-])(?:next|vite|remix|nuxt)\s+dev(?![\w-])/i, what: "a dev server" },
  { pattern: /(?<![\w-])(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start|serve|preview)(?![\w:-])/i, what: "a dev server" },
  { pattern: /(?<![\w-])(?:expo\s+(?:start|run)|turbo\s+run\s+dev|dotnet\s+run)(?![\w-])/i, what: "a dev server or an emulator" },
  { pattern: /(?<![\w-])(?:playwright|maestro|cypress|puppeteer|chromedriver|webdriver)(?![\w-])/i, what: "a browser driver" },
  { pattern: /(?<![\w-])(?:adb|emulator)\s+/i, what: "an emulator" },
  { pattern: /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?/i, what: "a request to a locally served app" },
]

const SEGMENT_SPLIT = /[&|;\n]+/
const LEADING_ASSIGNMENT = /^\s*[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)(?:\s+|$)/

/** The binary a segment invokes, lowercased and stripped of directory and Windows extension. */
function invokedBinary(segment) {
  let rest = segment.replace(/^[\s(){]*/, "")
  for (let match = LEADING_ASSIGNMENT.exec(rest); match; match = LEADING_ASSIGNMENT.exec(rest)) rest = rest.slice(match[0].length)
  const token = /^("[^"]*"|'[^']*'|\S+)/.exec(rest)?.[1] ?? ""
  return token
    .replaceAll(/["']/g, "")
    .split(/[/\\]/)
    .pop()
    .replace(/\.(?:exe|cmd|bat|ps1)$/i, "")
    .toLowerCase()
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
    if (QUOTING_BINARIES.has(invokedBinary(segment))) continue
    const hit = FORBIDDEN.find((entry) => entry.pattern.test(segment))
    if (!hit) continue
    return {
      block: true,
      message:
        `A worker may not start ${hit.what}. Refused: ${segment.trim().slice(0, 160)}\n\n` +
        "Do the code and the tests, commit, push, open the pull request, and stop. Visual evidence is\n" +
        "owed by a HUMAN after the pull request exists (D7): only a human grants visual completion, the\n" +
        "run merges nothing unattended, and a fresh worktree cannot authenticate, so the attempt can\n" +
        "only ever fail. Two workers finished their tickets and then lost the delivery to exactly this.\n" +
        "Tests are Vitest unit and behaviour tests; no Playwright, no e2e/, no dev server, no emulator.",
    }
  }
  return null
}
