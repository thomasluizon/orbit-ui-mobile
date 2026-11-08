import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { check, root } from "./_harness.mjs"

const TOOL = "check-handoff-size.mjs"

const checkout = (label, files) => {
  const directory = join(root, "check-handoff-size", label)
  for (const [path, bytes] of Object.entries(files)) {
    mkdirSync(join(directory, path, ".."), { recursive: true })
    writeFileSync(join(directory, path), "x".repeat(bytes))
  }
  return directory
}

export const cases = () => {
  const repo = checkout("boundaries", {
    ".claude/specs/at-ceiling.md": 40960,
    ".claude/specs/grown.md": 41984,
    ".claude/handoffs/NEXT.md": 8192,
    "docs/large.md": 90000,
  })
  check(TOOL, "a changed spec of 41984 B fails and names the file and its size", ["--root", repo, "--files", ".claude/specs/grown.md"],
    { status: 1, stderr: /`\.claude\/specs\/grown\.md` within 40960 B \(it is 41984 B\)/ })
  check(TOOL, "a changed spec of 40960 B and a prompt of 8192 B pass", ["--root", repo, "--files", ".claude/specs/at-ceiling.md", ".claude/handoffs/NEXT.md"],
    { status: 0, stdout: /2 relay documents checked/ })
  check(TOOL, "an oversized spec that did not change does not fail the changed files", ["--root", repo, "--files", ".claude/specs/at-ceiling.md", "docs/large.md"],
    { status: 0, stdout: /1 relay document checked/ })
  check(TOOL, "a path outside the relay documents is ignored", ["--root", repo, "--files", "docs/large.md"], { status: 0, stdout: /0 relay documents checked/ })
  check(TOOL, "the whole tree reports every oversized relay document", ["--root", repo, "--all"], { status: 1, stderr: /grown\.md` within/ })

  const prompt = checkout("prompt", { ".claude/handoffs/NEXT.md": 8300 })
  check(TOOL, "a changed prompt of 8300 B fails", ["--root", prompt, "--files", ".claude/handoffs/NEXT.md"],
    { status: 1, stderr: /`\.claude\/handoffs\/NEXT\.md` within 8192 B \(it is 8300 B\)/ })
  check(TOOL, "a missing relay document is an input error", ["--root", prompt, "--files", ".claude/specs/absent.md"], { status: 2, stderr: /cannot read \.claude\/specs\/absent\.md/ })
  check(TOOL, "--files and --all together are a usage error", ["--root", prompt, "--all", "--files", "a.md"], { status: 2, stderr: /exactly one of --files or --all/ })
  check(TOOL, "--files without a path is a usage error", ["--files"], { status: 2, stderr: /--files requires at least one path/ })
}
