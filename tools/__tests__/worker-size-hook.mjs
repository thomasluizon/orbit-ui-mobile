import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { workerSettings } from "../lib/worker.mjs"
import { argumentOf, blockOutput, denyOutput, patchPaths, preDenial } from "../lib/worker-size-hook.mjs"
import { T, root, same, toolPath } from "./_harness.mjs"

const HOOK = toolPath("lib/worker-size-hook.mjs")
const lines = (count, text = "line") => Array.from({ length: count }, (_, index) => `${text} ${index}\n`).join("")

/** A worktree on a branch of `origin/main`, with one committed file, and the helpers that write to it and run the hook. */
const worktree = (name) => {
  const directory = join(root, "size-hook", name)
  mkdirSync(directory, { recursive: true })
  const git = (...args) => {
    const result = spawnSync("git", ["-c", "user.email=gate@orbit.test", "-c", "user.name=Orbit Gate", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { cwd: directory, encoding: "utf8" })
    if (result.status !== 0) throw new Error(`fixture git ${args.join(" ")} failed: ${result.stderr}`)
    return result.stdout
  }
  const write = (path, body) => {
    mkdirSync(dirname(join(directory, path)), { recursive: true })
    writeFileSync(join(directory, path), body)
  }
  git("init", "-q", "--initial-branch=main")
  write("kept.ts", "export const kept = 1\n")
  git("add", "-A")
  git("commit", "-q", "-m", "base")
  git("update-ref", "refs/remotes/origin/main", "HEAD")
  git("switch", "-q", "-c", "work")
  const run = (event, input) => spawnSync(process.execPath, [HOOK, event], { cwd: directory, encoding: "utf8", input: JSON.stringify({ cwd: directory, ...input }) })
  const pre = (tool_name, tool_input) => run("pre", { hook_event_name: "PreToolUse", tool_name, tool_input })
  const post = (tool_name, tool_input = {}) => run("post", { hook_event_name: "PostToolUse", tool_name, tool_input, tool_response: {} })
  return { directory, git, write, run, pre, post }
}

/** The deny reason of a PreToolUse run, or null when the hook let the call run. */
const denied = (result) => {
  if (result.status !== 0) return `exit ${result.status}: ${result.stderr}`
  if (result.stdout === "") return null
  const { hookSpecificOutput } = JSON.parse(result.stdout)
  return hookSpecificOutput.hookEventName === "PreToolUse" && hookSpecificOutput.permissionDecision === "deny" ? hookSpecificOutput.permissionDecisionReason : `unexpected ${result.stdout}`
}

const capText = (count, files) =>
  `The diff is at ${count} lines and ${files} files. The cap is 400 lines and 30 files. Commit the finished work and end the run. Name the rest in the pull request text with the line "Part remaining: <what is left>" for a part, or in the Remaining line for a ticket with no parts.`

const softCases = () => {
  const { directory, write, pre } = worktree("soft")
  write("a.ts", lines(299))
  T("worker-size-hook: at 299 lines a Write of a new file is allowed", denied(pre("Write", { file_path: join(directory, "new.ts"), content: "x" })) === null)
  write("a.ts", lines(300))
  same("worker-size-hook: at 300 lines an Edit of a new file is denied with the cap text", denied(pre("Edit", { file_path: join(directory, "new.ts"), old_string: "a", new_string: "b" })), capText(300, 1))
  same("worker-size-hook: at 300 lines a Write of a new file in a new folder is denied", denied(pre("Write", { file_path: join(directory, "deep/new/folder.ts"), content: "x" })), capText(300, 1))
  T("worker-size-hook: at 300 lines an Edit of a file that the diff holds is allowed", denied(pre("Edit", { file_path: join(directory, "a.ts"), old_string: "a", new_string: "b" })) === null)
  T("worker-size-hook: at 300 lines an Edit of a committed file that the diff does not hold is denied", denied(pre("Edit", { file_path: join(directory, "kept.ts"), old_string: "a", new_string: "b" })) !== null)
  T("worker-size-hook: at 300 lines a Write outside the worktree is allowed", denied(pre("Write", { file_path: join(root, "size-hook", "outside.mjs"), content: "x" })) === null)
  T("worker-size-hook: at 300 lines a Bash call is allowed", denied(pre("Bash", { command: "echo x > b.ts" })) === null)
  T("worker-size-hook: an Edit with a relative path resolves from the call directory", denied(pre("Edit", { file_path: "a.ts", old_string: "a", new_string: "b" })) === null)
}

const fileCapCases = () => {
  const { directory, write, pre } = worktree("files")
  for (let index = 0; index < 29; index++) write(`f${index}.ts`, "x\n")
  T("worker-size-hook: at 29 files a new file is allowed", denied(pre("Write", { file_path: join(directory, "new.ts"), content: "x" })) === null)
  write("f29.ts", "x\n")
  same("worker-size-hook: at 30 files a new file is denied", denied(pre("Write", { file_path: join(directory, "new.ts"), content: "x" })), capText(30, 30))
  T("worker-size-hook: at 30 files a file that the diff holds is allowed", denied(pre("Edit", { file_path: join(directory, "f3.ts"), old_string: "x", new_string: "y" })) === null)
}

const hardCapCases = () => {
  const { directory, write, pre } = worktree("hard")
  write("a.ts", lines(399))
  T("worker-size-hook: at 399 lines an Edit of a file in the diff is allowed", denied(pre("Edit", { file_path: join(directory, "a.ts"), old_string: "a", new_string: "b" })) === null)
  write("a.ts", lines(400))
  same("worker-size-hook: at 400 lines an Edit of a file in the diff is denied", denied(pre("Edit", { file_path: join(directory, "a.ts"), old_string: "a", new_string: "b" })), capText(400, 1))
  T("worker-size-hook: at 400 lines a Write outside the worktree is allowed, so the pull request text can be written", denied(pre("Write", { file_path: join(root, "size-hook", "body.md"), content: "x" })) === null)
  T("worker-size-hook: at 400 lines a Write of a body file inside the worktree is denied", denied(pre("Write", { file_path: join(directory, "body.md"), content: "x" })) !== null)
  const bash = (command) => denied(pre("Bash", { command }))
  for (const command of [
    "npx vitest --run a.test.ts",
    "CI=1 npx vitest --run a.test.ts 2>&1",
    "npx --no-install tsc --noEmit",
    "npx eslint apps/web/a.ts",
    "npm run type-check",
    "npm run lint",
    "node tools/check-dashes.mjs --files a.ts",
    "git status",
    "git add a.ts && git commit -m \"a > b\"",
    "git -C /work log --oneline",
    "git diff --stat 2>&1",
    "git push -u origin work",
    "git -C . push",
    "git status; git push",
    "gh pr create --fill",
    "gh pr create --title t --body-file /tmp/body.md --label parity:exempt",
    "gh pr edit --body-file /tmp/body.md",
    "gh pr edit 50 --add-label parity:exempt",
    "gh pr comment --body-file /tmp/note.md",
    "gh pr checks 2>&1",
    "gh pr view 50 --json body",
    "npx tsc --noEmit 2>/dev/null && git status",
  ]) T(`worker-size-hook: at 400 lines ${JSON.stringify(command)} is allowed`, bash(command) === null, String(bash(command)))
  for (const command of [
    "echo x > a.ts",
    "echo x >> a.ts",
    "git log > a.ts",
    "git status && echo x > a.ts",
    "gh pr create --fill > body.md",
    "gh pr merge 50",
    "gh run download 1",
    "gh issue edit 9 --body x",
    "gh api repos/o/r/pulls",
    "gh pr checkout 50",
    "npm install left-pad",
    "npx prettier --write a.ts",
    "npx -c 'echo x > a.ts'",
    "node tools/drive.mjs",
    "node ../check-evil.mjs",
    "cat a.ts | tee b.ts",
    "npx vitest --run a.test.ts | tail -20",
    "rm a.ts",
    "git status && sed -i s/a/b/ a.ts",
    "git status $(touch c.ts)",
    "",
  ]) same(`worker-size-hook: at 400 lines ${JSON.stringify(command)} is denied with the cap text`, bash(command), capText(400, 1))
  same("worker-size-hook: at 400 lines a Monitor call follows the Bash rule", [denied(pre("Monitor", { command: "git status" })), denied(pre("Monitor", { command: "echo x > a" }))], [null, capText(400, 1)])
}

const postCases = () => {
  const { directory, write, git, post } = worktree("post")
  const record = () => JSON.parse(readFileSync(join(directory, git("rev-parse", "--git-dir").trim(), "orbit-size.json"), "utf8"))
  write("a.ts", lines(5))
  const first = post("Read", { file_path: "a.ts" })
  T("worker-size-hook: the first post call writes the count and blocks nothing", first.status === 0 && first.stdout === "", `${first.status} ${first.stdout}`)
  const before = record()
  same("worker-size-hook: the record holds the count, the head and the time", [before.lines, before.files, before.head === git("rev-parse", "HEAD").trim(), Number.isNaN(Date.parse(before.at))], [5, 1, true, false])
  write("b.ts", lines(100))
  const small = post("Bash", { command: "node make.mjs" })
  T("worker-size-hook: a new file under the soft cap blocks nothing", small.status === 0 && small.stdout === "", small.stdout)
  write("a.ts", lines(150))
  T("worker-size-hook: a change to a file of the diff at 250 lines blocks nothing", post("Edit").stdout === "")
  write("c.ts", lines(60))
  const blocked = post("Bash", { command: "node make.mjs" })
  same("worker-size-hook: a Bash call that adds a new file at 310 lines gets a block that names the file", [blocked.status, blocked.stdout === "" ? null : JSON.parse(blocked.stdout)], [0, blockOutput("The diff is at 310 lines and 3 files. Undo the change to c.ts. Change only files that are already in the diff.")])
  same("worker-size-hook: the next call blocks again until the worker undoes the file", JSON.parse(post("Read").stdout).reason.includes("c.ts"), true)
  rmSync(join(directory, "c.ts"))
  const undone = post("Bash", { command: "node rm.mjs" })
  T("worker-size-hook: after the worker removes the file the call is not blocked", undone.status === 0 && undone.stdout === "", undone.stdout)
  same("worker-size-hook: the record holds the new count", [record().lines, record().files], [250, 2])

  const files = worktree("post-files")
  for (let index = 0; index < 29; index++) files.write(`f${index}.ts`, "x\n")
  files.post("Read")
  files.write("f29.ts", "x\n")
  const thirtieth = files.post("Bash", { command: "node make.mjs" })
  same("worker-size-hook: a new file at 30 files gets a block", JSON.parse(thirtieth.stdout).reason, "The diff is at 30 lines and 30 files. Undo the change to f29.ts. Change only files that are already in the diff.")
}

/** A path that leaves the diff for a call and comes back is not new scope: a stash and its pop, or a checkout of another commit and back. */
const returnCases = () => {
  const { directory, write, git, pre, post } = worktree("return")
  write("kept.ts", lines(10))
  write("a.ts", lines(5))
  post("Edit")
  write("a.ts", lines(290))
  git("add", "a.ts")
  git("commit", "-q", "-m", "work")
  T("worker-size-hook: a commit that brings a held file to 301 lines blocks nothing", post("Bash", { command: "git commit" }).stdout === "")
  git("stash", "push", "-q", "-m", "size-hook-return")
  T("worker-size-hook: a stash at 301 lines blocks nothing", post("Bash", { command: "git stash" }).stdout === "")
  git("stash", "pop", "-q")
  const popped = post("Bash", { command: "git stash pop" })
  T("worker-size-hook: a stash pop that brings back a held file at 301 lines blocks nothing", popped.status === 0 && popped.stdout === "", popped.stdout)
  T("worker-size-hook: the next call after the stash pop blocks nothing", post("Read").stdout === "")
  git("commit", "-q", "-am", "kept")
  git("checkout", "-q", "origin/main")
  T("worker-size-hook: a checkout of the base commit blocks nothing", post("Bash", { command: "git checkout origin/main" }).stdout === "")
  git("checkout", "-q", "work")
  const back = post("Bash", { command: "git checkout work" })
  T("worker-size-hook: a checkout back to the branch at 301 lines blocks nothing", back.status === 0 && back.stdout === "", back.stdout)
  write("a.ts", lines(300))
  post("Edit")
  git("checkout", "origin/main", "--", "kept.ts")
  T("worker-size-hook: a restore of a held file to the base blocks nothing", post("Bash", { command: "git checkout origin/main -- kept.ts" }).stdout === "")
  T("worker-size-hook: at 300 lines an Edit of a held file that the restore took out of the diff is allowed", denied(pre("Edit", { file_path: join(directory, "kept.ts"), old_string: "a", new_string: "b" })) === null)
  same("worker-size-hook: at 300 lines a Write of a path that the worktree never held is still denied", denied(pre("Write", { file_path: join(directory, "new.ts"), content: "x" })), capText(300, 1))
  write("new.ts", lines(5))
  same("worker-size-hook: a path that the worktree never held still gets a block after the return", JSON.parse(post("Write").stdout || "{}").reason, "The diff is at 305 lines and 2 files. Undo the change to new.ts. Change only files that are already in the diff.")
}

/** An EF Core migration, a model snapshot and an OpenAPI document are written by a tool in the api repository, so they count 0. */
const generatedCases = () => {
  const { directory, write, pre, post } = worktree("generated")
  const migrations = "src/Orbit.Infrastructure/Migrations"
  write("src/Orbit.Domain/Entity.cs", lines(12))
  post("Read")
  write(`${migrations}/20261112193505_AddX.Designer.cs`, lines(3600))
  write(`${migrations}/20261112193505_AddX.cs`, lines(74))
  write(`${migrations}/OrbitDbContextModelSnapshot.cs`, lines(3600))
  write("src/Orbit.Api/openapi_v2-r2.json", lines(900))
  const result = post("Bash", { command: "dotnet ef migrations add AddX" })
  T("worker-size-hook: new migration, snapshot and OpenAPI files of 8,000 lines block nothing", result.status === 0 && result.stdout === "", result.stdout)
  T("worker-size-hook: an Edit of a file in the diff is allowed beside the generated files", denied(pre("Edit", { file_path: join(directory, "src/Orbit.Domain/Entity.cs"), old_string: "a", new_string: "b" })) === null)
  T("worker-size-hook: a new hand-written file beside the generated files is allowed under the soft cap", denied(pre("Write", { file_path: join(directory, "src/Orbit.Domain/New.cs"), content: "x" })) === null)
  write("src/Orbit.Domain/Big.cs", lines(300))
  same("worker-size-hook: hand-written lines beside the generated files still count", denied(pre("Write", { file_path: join(directory, "src/Orbit.Domain/New.cs"), content: "x" })), capText(386, 3))
}

const entryCases = () => {
  const { directory, pre, post, run } = worktree("entry")
  const broken = run("pre", { cwd: join(root, "size-hook"), tool_name: "Bash", tool_input: { command: "git status" } })
  T("worker-size-hook: a call that cannot be measured exits 2 and says why", broken.status === 2 && /^Blocked: the size hook could not measure this call\./.test(broken.stderr), `${broken.status} ${broken.stderr}`)
  const wrong = spawnSync(process.execPath, [HOOK, "between"], { cwd: directory, encoding: "utf8", input: "{}" })
  same("worker-size-hook: an unknown event exits 2", wrong.status, 2)
  T("worker-size-hook: input that is not JSON exits 2", spawnSync(process.execPath, [HOOK, "pre"], { cwd: directory, encoding: "utf8", input: "not json" }).status === 2)
  T("worker-size-hook: a clean worktree lets every tool run", denied(pre("Write", { file_path: join(directory, "x.ts"), content: "x" })) === null && post("Read").stdout === "")
  same("worker-size-hook: the deny output is the PreToolUse form of claude 2.1.332", denyOutput("why"), { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "why" } })
  same("worker-size-hook: preDenial ignores a tool that it does not check", preDenial({ tool_name: "Read", cwd: directory, tool_input: { file_path: "a" } }, { lines: 900, files: 90, top: directory, paths: [] }), null)
}

/** The patch text of the Codex `apply_patch` tool, in the shape that the installed codex 0.172.0 sent to a hook: `tool_input.command`. */
const patch = (...hunks) => `*** Begin Patch\n${hunks.join("\n")}\n*** End Patch`
const addFile = (path) => `*** Add File: ${path}\n+x`
const updateFile = (path, to = null) => `*** Update File: ${path}\n${to === null ? "" : `*** Move to: ${to}\n`}@@\n-a\n+b`
const deleteFile = (path) => `*** Delete File: ${path}`

const patchCases = () => {
  same("worker-size-hook: the paths of a patch are the files of its hunks and the target of a move, in order", patchPaths(patch(addFile("a.ts"), updateFile("b.ts", "c/d.ts"), deleteFile("e e.ts"))), ["a.ts", "b.ts", "c/d.ts", "e e.ts"])
  same("worker-size-hook: a patch line that holds a header text after a plus sign names no path", patchPaths(patch("*** Update File: a.ts\n@@\n+*** Add File: fake.ts")), ["a.ts"])
  const { write, pre } = worktree("patch")
  const apply = (...hunks) => denied(pre("apply_patch", { command: patch(...hunks) }))
  write("a.ts", lines(299))
  T("worker-size-hook: at 299 lines an apply_patch of a new file is allowed", apply(addFile("new.ts")) === null)
  write("a.ts", lines(300))
  same("worker-size-hook: at 300 lines an apply_patch of a new file is denied with the cap text", apply(addFile("new.ts")), capText(300, 1))
  same("worker-size-hook: at 300 lines an apply_patch that moves a file to a new path is denied", apply(updateFile("a.ts", "moved.ts")), capText(300, 1))
  same("worker-size-hook: at 300 lines an apply_patch of a file that the diff holds and of a new file is denied", apply(updateFile("a.ts"), addFile("new.ts")), capText(300, 1))
  T("worker-size-hook: at 300 lines an apply_patch of a file that the diff holds is allowed", apply(updateFile("a.ts")) === null)
  T("worker-size-hook: at 300 lines an apply_patch of a committed file that the diff does not hold is denied", apply(deleteFile("kept.ts")) !== null)
  T("worker-size-hook: at 300 lines an apply_patch outside the worktree is allowed", apply(addFile(join(root, "size-hook", "outside.mjs"))) === null)
  write("a.ts", lines(400))
  same("worker-size-hook: at 400 lines an apply_patch of a file in the diff is denied", apply(updateFile("a.ts")), capText(400, 1))
  T("worker-size-hook: at 400 lines an apply_patch outside the worktree is allowed", apply(addFile(join(root, "size-hook", "outside.mjs"))) === null)
  T("worker-size-hook: a patch with no path and a call with no patch text give no denial", apply() === null && denied(pre("apply_patch", {})) === null)
  T("worker-size-hook: a Bash call at 400 lines still follows the shell rule beside the patch tool", denied(pre("Bash", { command: "git status" })) === null && denied(pre("Bash", { command: "apply_patch" })) !== null)
}

const worktreeArgumentCases = () => {
  const { directory, write, git } = worktree("argument")
  const outside = join(root, "size-hook")
  const at = (event, args, input) => spawnSync(process.execPath, [HOOK, event, ...args], { cwd: outside, encoding: "utf8", input: JSON.stringify({ cwd: outside, ...input }) })
  same("worker-size-hook: argumentOf reads a value, and a missing flag, a missing value and an empty value give null", [argumentOf(["pre", "--worktree", "/w"], "--worktree"), argumentOf(["pre"], "--worktree"), argumentOf(["pre", "--worktree"], "--worktree"), argumentOf(["pre", "--worktree", ""], "--worktree")], ["/w", null, null, null])
  write("a.ts", lines(400))
  const bash = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "echo x > a.ts" } }
  same("worker-size-hook: a call with a cwd outside the worktree measures the worktree of --worktree", denied(at("pre", ["--worktree", directory], bash)), capText(400, 1))
  const blind = at("pre", [], bash)
  T("worker-size-hook: the same call with no --worktree cannot measure its cwd and exits 2", blind.status === 2, `${blind.status}`)
  const empty = at("pre", ["--worktree", ""], bash)
  T("worker-size-hook: an empty --worktree falls back to the cwd of the call", empty.status === 2, `${empty.status}`)
  const recorded = at("post", ["--worktree", directory], { hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "git status" }, tool_response: "" })
  const file = join(directory, git("rev-parse", "--git-dir").trim(), "orbit-size.json")
  T("worker-size-hook: a post call with a cwd outside the worktree records the count in the git directory of --worktree", recorded.status === 0 && JSON.parse(readFileSync(file, "utf8")).lines === 400, `${recorded.status} ${recorded.stderr}`)
}

const settingsCases = () => {
  const { directory, write } = worktree("settings")
  const settings = workerSettings({ hotPath: "/home/driver/hot.md", skillNames: [] })
  const [github, size] = settings.hooks.PreToolUse
  same("worker-size-hook: the GitHub hook stays first and the size hook runs before Edit, Write, Bash and Monitor", [github.matcher, size.matcher], ["Bash|Monitor", "Edit|Write|Bash|Monitor"])
  same("worker-size-hook: the size hook runs after every tool", settings.hooks.PostToolUse.map((entry) => entry.matcher), ["*"])
  const commands = [size.hooks[0].command, settings.hooks.PostToolUse[0].hooks[0].command]
  T("worker-size-hook: each size hook command blocks when it cannot run", commands.every((command) => command.endsWith(" || exit 2")) && commands[0].includes(" pre ") && commands[1].includes(" post "), commands.join(" | "))
  write("a.ts", lines(400))
  const input = JSON.stringify({ hook_event_name: "PreToolUse", cwd: directory, tool_name: "Write", tool_input: { file_path: join(directory, "b.ts"), content: "x" } })
  const result = spawnSync("sh", ["-c", commands[0]], { cwd: directory, encoding: "utf8", input })
  same("worker-size-hook: the rendered pre command denies in a shell, as the CLI runs it", [result.status, denied(result)], [0, capText(400, 1)])
  const missing = spawnSync("sh", ["-c", commands[0].replace("worker-size-hook.mjs", "no-such-hook.mjs")], { cwd: directory, encoding: "utf8", input })
  same("worker-size-hook: a size hook that cannot start blocks the call", missing.status, 2)
  T("worker-size-hook: a record file name stays inside the git directory", !existsSync(join(directory, "orbit-size.json")))
}

export const cases = async () => {
  softCases()
  fileCapCases()
  hardCapCases()
  postCases()
  returnCases()
  generatedCases()
  entryCases()
  patchCases()
  worktreeArgumentCases()
  settingsCases()
}
