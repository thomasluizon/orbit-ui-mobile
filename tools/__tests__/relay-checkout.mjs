import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { T, stageRepo, toolPath } from "./_harness.mjs"

export const cases = async () => {
  const { path: checkout, git, origin } = stageRepo("relay-checkout-cli")
  mkdirSync(join(checkout, "tools"), { recursive: true })
  cpSync(toolPath("lib"), join(checkout, "tools", "lib"), { recursive: true })
  cpSync(toolPath("relay-checkout.mjs"), join(checkout, "tools", "relay-checkout.mjs"))
  const paths = ["tools/removed.mjs", "tools/old name.mjs", ".claude/skills/probe/SKILL.md", ".claude/hooks/probe.mjs", ".claude/rules/probe.md"]
  const write = (path, text) => {
    mkdirSync(dirname(join(checkout, path)), { recursive: true })
    writeFileSync(join(checkout, path), text)
  }
  for (const path of paths) write(path, "base\n")
  git(["add", ...paths])
  git(["commit", "-qm", "harness base"])
  git(["push", "-q", "origin", "main"])
  const base = git(["rev-parse", "HEAD"]).stdout.trim()
  git(["checkout", "-qb", "relay-docs"])
  write(".claude/specs/probe.md", "relay spec\n")
  write(".claude/handoffs/NEXT.md", "relay prompt\n")
  write("other.md", "outside harness\n")
  git(["add", ".claude/specs/probe.md", ".claude/handoffs/NEXT.md", "other.md"])
  git(["commit", "-qm", "relay docs"])
  const invoke = (args) => spawnSync(process.execPath, [join(checkout, "tools", "relay-checkout.mjs"), ...args], { cwd: origin, encoding: "utf8" })
  const current = invoke(["--check"])
  T("relay-checkout CLI: main plus docs has no harness differences from any cwd", current.status === 0 && JSON.stringify(JSON.parse(current.stdout)) === "[]", current.stderr)
  const head = git(["rev-parse", "HEAD"]).stdout.trim()
  const noOp = invoke([])
  T("relay-checkout CLI: sync on main plus docs is a no-op", noOp.status === 0 && git(["rev-parse", "HEAD"]).stdout.trim() === head, noOp.stderr)
  git(["checkout", "-q", "main"])
  git(["rm", "tools/removed.mjs"])
  git(["mv", "tools/old name.mjs", "tools/new name.mjs"])
  for (const path of paths.slice(2)) write(path, "changed\n")
  write("tools/added.mjs", "added\n")
  git(["add", ...paths.slice(2), "tools/added.mjs"])
  git(["commit", "-qm", "refresh harness"])
  git(["push", "-q", "origin", "main"])
  git(["checkout", "-q", "relay-docs"])
  git(["update-ref", "refs/remotes/origin/main", base])
  const changed = invoke(["--check"])
  const expected = [...paths, "tools/new name.mjs", "tools/added.mjs"].sort()
  T("relay-checkout CLI: check fetches and names every changed harness path including rename sides", changed.status === 1 && changed.stdout.length > 0 && JSON.stringify(JSON.parse(changed.stdout).sort()) === JSON.stringify(expected), changed.stdout + changed.stderr)
  T("relay-checkout CLI: check does not merge", git(["rev-parse", "HEAD"]).stdout.trim() === head)
  const sync = invoke([])
  T("relay-checkout CLI: sync merges freshly fetched main", sync.status === 0 && git(["merge-base", "--is-ancestor", "origin/main", "HEAD"]).status === 0, sync.stderr)
  git(["remote", "set-url", "origin", join(checkout, "missing-origin")])
  const failed = invoke(["--check"])
  T("relay-checkout CLI: a failed check reports fetch failure", failed.status === 1 && failed.stderr.includes("fetch"), failed.stderr)
}
