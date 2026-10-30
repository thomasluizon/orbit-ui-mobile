import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { handoffDocsChanged, syncRelayCheckout } from "../lib/relay-checkout.mjs"
import { T, stageRepo, toolPath } from "./_harness.mjs"

export const cases = async () => {
  for (const mode of ["behind", "conflict", "fetch-failure", "current", "staged", "unrelated", "relative-directory"]) {
    const { path: checkout, git, origin } = stageRepo(`handoff-freshness-${mode}`)
    mkdirSync(join(checkout, "tools"), { recursive: true })
    writeFileSync(join(checkout, "tools", "probe.mjs"), "base\n")
    git(["add", "tools/probe.mjs"])
    git(["commit", "-qm", "base harness"])
    git(["push", "-q", "origin", "main"])
    const base = git(["rev-parse", "HEAD"]).stdout.trim()
    git(["checkout", "-qb", "relay-docs"])
    if (mode === "conflict") {
      writeFileSync(join(checkout, "tools", "probe.mjs"), "relay\n")
      git(["add", "tools/probe.mjs"])
      git(["commit", "-qm", "relay change"])
    }
    if (mode === "behind" || mode === "conflict" || mode === "relative-directory") {
      git(["checkout", "-q", "main"])
      writeFileSync(join(checkout, "tools", "probe.mjs"), "main\n")
      git(["add", "tools/probe.mjs"])
      git(["commit", "-qm", "main change"])
      git(["push", "-q", "origin", "main"])
      git(["checkout", "-q", "relay-docs"])
      git(["update-ref", "refs/remotes/origin/main", base])
    }
    const doc = ".claude/specs/relay.md"
    mkdirSync(join(checkout, ".claude", "specs"), { recursive: true })
    writeFileSync(join(checkout, doc), "spec\n")
    git(["add", doc])
    git(["commit", "-qm", "spec"])
    if (mode === "unrelated") writeFileSync(join(checkout, "tools", "probe.mjs"), "unrelated\n")
    else writeFileSync(join(checkout, doc), "updated spec\n")
    if (mode === "staged") {
      git(["add", doc])
      writeFileSync(join(checkout, doc), "spec\n")
    }
    if (mode === "fetch-failure") git(["remote", "set-url", "origin", join(checkout, "missing-origin")])
    const head = git(["rev-parse", "HEAD"]).stdout.trim()
    const remote = git(["rev-parse", "refs/heads/main"], origin).stdout.trim()
    T(`relay-checkout: ${mode} detects staged and working docs only`, handoffDocsChanged(checkout) === (mode !== "unrelated"))
    const commandDirectory = mode === "relative-directory" ? dirname(checkout) : checkout
    const command = mode === "relative-directory" ? `git -C "${basename(checkout)}" commit -m handoff` : "git commit -m handoff"
    if (mode === "relative-directory") {
      const observed = spawnSync("git", ["-C", basename(checkout), "branch", "--show-current"], { cwd: commandDirectory, encoding: "utf8" })
      T("relay-checkout: relative Git directory resolves from the command cwd", observed.status === 0 && observed.stdout.trim() === "relay-docs", observed.stderr)
    }
    const result = spawnSync(process.execPath, [toolPath("../.claude/hooks/require-handoff-prompt.mjs")], {
      encoding: "utf8", input: JSON.stringify({ hook_event_name: "PreToolUse", session_id: "checkout-guard-fixture", cwd: commandDirectory, tool_input: { command } }),
    })
    const fails = mode === "conflict" || mode === "fetch-failure"
    T(`relay-checkout: ${mode} runs the real handoff commit guard`, result.status === (fails ? 2 : 0), result.stderr)
    if (mode === "behind" || mode === "relative-directory") T("relay-checkout: handoff hook merges main before permitting the commit", readFileSync(join(checkout, "tools", "probe.mjs"), "utf8") === "main\n" && git(["merge-base", "--is-ancestor", "origin/main", "HEAD"]).status === 0 && git(["diff", "--name-only"]).stdout.trim() === doc)
    else T(`relay-checkout: ${mode} preserves the existing head`, git(["rev-parse", "HEAD"]).stdout.trim() === head)
    if (fails) T(`relay-checkout: ${mode} names the failure without starting a conflicted merge`, result.stderr.includes(mode === "conflict" ? "tools/probe.mjs" : "fetch") && !existsSync(join(checkout, ".git", "MERGE_HEAD")))
    T(`relay-checkout: ${mode} never pushes or switches branches`, git(["rev-parse", "refs/heads/main"], origin).stdout.trim() === remote && git(["branch", "--show-current"]).stdout.trim() === "relay-docs")
  }
  const protectedRepo = stageRepo("relay-protected")
  for (const mode of ["main", "detached"]) {
    if (mode === "detached") protectedRepo.git(["checkout", "--detach", "-q"])
    let failure
    try { syncRelayCheckout(protectedRepo.path) } catch (error) { failure = error.message }
    T(`relay-checkout: refuses ${mode}`, Boolean(failure) && failure.includes(mode === "main" ? "main is not a relay branch" : "symbolic-ref"), failure)
  }
}
