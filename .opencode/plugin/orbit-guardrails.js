// Orbit's Claude Code hooks, ported to opencode for enforcement parity on this
// machine. Same shared logic core (.claude/hooks/_lib/) the Claude Code hooks
// use — fix a rule once in _lib, both tools enforce it. opencode auto-loads this
// from .opencode/plugin/; no wiring needed.
//
// Mapping (opencode has no PostToolUse; tool.execute.before sees the PENDING
// edit, tool.execute.after sees the written file):
//   tool.execute.before(bash)        -> git guard + Expo-pin guard + secret-in-argv
//                                       (block = throw)
//   tool.execute.before(edit|write)  -> em-dash + brand-color + the i18n copy-register
//                                       rules (AI-cliché, placeholder, typed UPPERCASE)
//                                       on the added text (block)
//   tool.execute.after(edit|write)   -> whole-file rules (ts-antipatterns, workaround
//                                       markers, csharp authz/tz/fluentconfig) + parity;
//                                       a throw surfaces the violation to the model the
//                                       way the Claude Code PostToolUse exit-2 does
//   event(session.idle)              -> proactivity reminder (best-effort nudge)

import { execFileSync } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"
import { pathToFileURL, fileURLToPath } from "node:url"
import { dirname, join, isAbsolute } from "node:path"

const here = (() => {
  try {
    return dirname(fileURLToPath(import.meta.url))
  } catch {
    return null
  }
})()

function libCandidates(directory) {
  const list = []
  if (directory) list.push(join(directory, ".claude", "hooks", "_lib"))
  if (here) list.push(join(here, "..", "..", ".claude", "hooks", "_lib"))
  return list
}

async function lib(mod, directory) {
  for (const base of libCandidates(directory)) {
    const p = join(base, mod)
    if (existsSync(p)) return import(pathToFileURL(p).href)
  }
  throw new Error(`orbit hook _lib not found: ${mod}`)
}

const parityState = new Map() // sessionID -> { web, mobile, shared, api }

function throwBlocks(results, tag) {
  const msgs = results.filter(Boolean).map((r) => r.message)
  if (msgs.length) throw new Error(`[orbit:${tag}]\n${msgs.join("\n")}`)
}

export default async ({ directory, worktree } = {}) => {
  const dir = directory || worktree || process.cwd()
  const [git, content, copy, secrets, source, parity, io, gate] = await Promise.all([
    lib("rules-git.mjs", dir),
    lib("rules-content.mjs", dir),
    lib("rules-copy.mjs", dir),
    lib("rules-secrets.mjs", dir),
    lib("rules-source.mjs", dir),
    lib("rules-parity.mjs", dir),
    lib("io.mjs", dir),
    lib("rules-gate-tamper.mjs", dir),
  ])
  const resolveHeadBranch = (d) =>
    execFileSync("git", ["-C", d || dir, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  const resolveRemoteUrl = (d) =>
    execFileSync("git", ["-C", d || dir, "remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()

  return {
    "tool.execute.before": async (input, output) => {
      try {
        const tool = input?.tool
        const args = output?.args || {}
        if (tool === "bash" && typeof args.command === "string") {
          throwBlocks(
            [
              git.checkGitCommand(args.command, { resolveHeadBranch, resolveRemoteUrl, cwd: dir }),
              git.checkGitWorktreeRemove(args.command),
              git.checkNpmExpoPin(args.command),
              secrets.checkSecretInArgv(args.command),
              gate.checkGateTamperBash(args.command),
            ],
            "command",
          )
        } else if (tool === "edit" || tool === "write") {
          const { filePath, addedText } = io.fromOpenCodeEdit(args)
          if (filePath) throwBlocks([gate.checkGateTamperEdit(filePath)], "gate-tamper")
          if (filePath && addedText) {
            throwBlocks(
              [
                content.checkEmDashes(addedText, filePath),
                content.checkBrandColors(addedText, filePath),
                copy.checkAiClicheCopy(addedText, filePath),
                copy.checkPlaceholderContent(addedText, filePath),
                copy.checkTypedUppercase(addedText, filePath),
              ],
              "content",
            )
          }
        }
      } catch (err) {
        if (err && typeof err.message === "string" && err.message.startsWith("[orbit:")) throw err
      }
    },

    "tool.execute.after": async (input, output) => {
      try {
        const tool = input?.tool
        if (tool !== "edit" && tool !== "write") return
        const { filePath } = io.fromOpenCodeEdit(output?.args || {})
        if (!filePath) return
        const abs = isAbsolute(filePath) ? filePath : join(dir, filePath)
        const contents = existsSync(abs) ? readFileSync(abs, "utf8") : null

        throwBlocks(
          [
            source.checkTsAntipatterns(filePath, contents),
            source.checkMobileSupabaseLazy(filePath, contents),
            source.checkEfMigrationRawIndex(filePath, contents),
            source.checkNewTodos(filePath, contents),
            source.checkCsharpAuthz(filePath, contents),
            source.checkCsharpTimezone(filePath, contents),
            source.checkCsharpFluentConfig(filePath, contents),
          ],
          "standards",
        )

        // Parity is a soft nudge, not a hard block — surface to the log.
        const scope = parity.classifyScope(filePath)
        if (scope) {
          const sid = input?.sessionID || "session"
          const st = parityState.get(sid) || { web: 0, mobile: 0, shared: 0, api: 0 }
          st[scope] = (st[scope] || 0) + 1
          parityState.set(sid, st)
          for (const m of parity.parityMessages(st)) console.error(`[orbit:parity] ${m}`)
        }
      } catch (err) {
        if (err && typeof err.message === "string" && err.message.startsWith("[orbit:")) throw err
      }
    },

    event: async ({ event }) => {
      if (event?.type !== "session.idle") return
      console.error(
        "[orbit proactivity] session idle — before assuming or asking, verify/do it with a tool you already have; " +
          "inspect any named artifact first; invoke the matching skill instead of improvising.",
      )
    },
  }
}
