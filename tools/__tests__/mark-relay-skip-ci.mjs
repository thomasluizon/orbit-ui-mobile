import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { check, run, stageRepo, T, TOOLS_DIR } from "./_harness.mjs"

const TOOL = "mark-relay-skip-ci.mjs"

export const cases = () => {
  check(TOOL, "no message file is a usage error", [], { status: 2, stderr: /expected <message-file>/ })
  check(TOOL, "an unknown flag is a usage error", ["--orbit-not-a-flag"], { status: 2 })

  const repo = stageRepo("mark-relay-skip-ci")
  if (!repo) {
    T(`${TOOL}: the fixture repository is staged`, false)
    return
  }
  const hooks = join(repo.path, ".orbit-hooks")
  mkdirSync(hooks, { recursive: true })
  writeFileSync(join(hooks, "prepare-commit-msg"), `#!/bin/sh\nexec "${process.execPath}" "${join(TOOLS_DIR, TOOL)}" "$@"\n`)
  chmodSync(join(hooks, "prepare-commit-msg"), 0o755)
  repo.git(["config", "core.hooksPath", hooks])
  const write = (path, text) => {
    mkdirSync(join(repo.path, path, ".."), { recursive: true })
    writeFileSync(join(repo.path, path), text)
  }
  const lastMessage = () => repo.git(["log", "-1", "--format=%B"]).stdout
  const commit = (label, paths, message = "docs: relay the record") => {
    for (const path of paths) write(path, `${label}\n`)
    repo.git(["add", "--", ...paths])
    const result = repo.git(["commit", "-q", "-m", message, "--", ...paths])
    T(`${TOOL}: the ${label} commit lands`, result.status === 0, result.stderr)
    return lastMessage()
  }

  write("apps/web/unrelated.ts", "staged elsewhere\n")
  repo.git(["add", "apps/web/unrelated.ts"])
  const relay = commit("relay", [".claude/handoffs/NEXT.md", ".claude/specs/orbit-prod-release.md"])
  T(`${TOOL}: a pathspec commit of the prompt and its spec carries [skip ci], with other work staged in the index`,
    relay === "docs: relay the record\n\n[skip ci]\n\n", JSON.stringify(relay))
  T(`${TOOL}: the other staged work stays staged and out of the relay commit`,
    repo.git(["diff", "--cached", "--name-only"]).stdout.trim() === "apps/web/unrelated.ts" &&
      repo.git(["show", "--name-only", "--format=", "HEAD"]).stdout.trim().split("\n").sort().join() === ".claude/handoffs/NEXT.md,.claude/specs/orbit-prod-release.md")
  repo.git(["reset", "-q", "apps/web/unrelated.ts"])

  T(`${TOOL}: the prompt alone carries [skip ci]`, commit("prompt only", [".claude/handoffs/NEXT.md"]).includes("[skip ci]"))
  T(`${TOOL}: a spec without the prompt runs CI`, !commit("spec only", [".claude/specs/orbit-prod-release.md"]).includes("[skip ci]"))
  T(`${TOOL}: the prompt with a code change runs CI`, !commit("prompt and code", [".claude/handoffs/NEXT.md", "tools/example.mjs"]).includes("[skip ci]"))
  T(`${TOOL}: the prompt with a spec in a nested folder runs CI`, !commit("nested spec", [".claude/handoffs/NEXT.md", ".claude/specs/old/plan.md"]).includes("[skip ci]"))
  const marked = commit("marked", [".claude/handoffs/NEXT.md"], "docs: relay [skip ci]")
  T(`${TOOL}: a message that holds the marker keeps one marker`, marked.split("[skip ci]").length === 2, JSON.stringify(marked))

  write(".claude/handoffs/NEXT.md", "template\n")
  repo.git(["add", ".claude/handoffs/NEXT.md"])
  const template = join(repo.path, "template-message")
  writeFileSync(template, "docs: relay\n\n# Please enter the commit message for your changes.\n# On branch main\n")
  run(TOOL, [template, "template"], { cwd: repo.path })
  T(`${TOOL}: the marker lands above the comment lines that git strips`,
    readFileSync(template, "utf8") === "docs: relay\n\n[skip ci]\n\n# Please enter the commit message for your changes.\n# On branch main\n", readFileSync(template, "utf8"))
  for (const source of ["merge", "squash"]) {
    const message = join(repo.path, `${source}-message`)
    writeFileSync(message, "Merge branch 'main'\n")
    check(TOOL, `a ${source} message stays as it is`, [message, source], { status: 0 }, { cwd: repo.path })
    T(`${TOOL}: the ${source} message has no marker`, readFileSync(message, "utf8") === "Merge branch 'main'\n")
  }
  check(TOOL, "an unreadable message file fails", [join(repo.path, "missing-message")], { status: 1, stderr: /cannot read/ }, { cwd: repo.path })
}
