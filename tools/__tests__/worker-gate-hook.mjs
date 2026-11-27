import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { workerSettings } from "../lib/worker.mjs"
import { gate, gateCommands, tailOf } from "../lib/worker-gate-hook.mjs"
import { T, root, same } from "./_harness.mjs"
const dir =join(root, "gate-hook")
const git = (...args) => spawnSync("git", ["-c", "user.email=g@o.test", "-c", "user.name=G", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" }).stdout.trim()
const write = (path, body) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), body) }
const text = ({ program, args }) => [program, ...args].join(" ")
export const cases = () => {
  write("apps/web/package.json", JSON.stringify({ scripts: { "type-check": "x", lint: "x" } }))
  for (const path of ["tools/lib/alpha.mjs", "tools/__tests__/alpha.mjs", "tools/test-tools.mjs", "tools/check-dashes.mjs", "eslint-rules/package.json"]) write(path, "")
  write("tools/__tests__/skills.mjs", 'export const named = ["SKILL.md", "../replay-scripts.json"]\n')
  for (const args of [["init", "-q", "--initial-branch=main"], ["add", "-A"], ["commit", "-q", "-m", "base"], ["update-ref", "refs/remotes/origin/main", "HEAD"], ["switch", "-q", "-c", "work"]]) git(...args)
  write("apps/web/src/a.ts", "export {}\n")
  const record = () => JSON.parse(readFileSync(join(git("rev-parse", "--absolute-git-dir"), "orbit-gate.json"), "utf8"))
  const options = { cwd: dir, run: "r", now: new Date(0), execute: (top, entry) => ({ command: text(entry), ok: !text(entry).includes("type-check"), tail: "TS2322" }) }
  const first = gate(options)
  T("worker-gate-hook: a failing type check gives decision block with the command and its output, and writes one block", first.decision === "block" && first.reason.includes("Failed command: npm run type-check -w apps/web\nTS2322") && !record().green && record().blocks === 1, first.reason)
  gate(options); gate(options)
  same("worker-gate-hook: the fourth red stop does not block and writes green false", [gate(options), record().green, record().blocks], [null, false, 3])
  const allGreen = { ...options, run: "d", execute: (top, entry) => ({ command: text(entry), ok: true, tail: "" }) }
  const dirty = gate(allGreen)
  T("worker-gate-hook: every command green and an uncommitted file gives decision block and green false", dirty?.decision === "block" && dirty.reason.includes("Failed command: git status --porcelain --untracked-files=all\n?? apps/web/src/a.ts") && !record().green, JSON.stringify(dirty))
  git("add", "-A"); git("commit", "-q", "-m", "work")
  same("worker-gate-hook: a green gate writes green true and does not block", [gate({ ...options, run: "g", execute: (top, entry) => ({ command: text(entry), ok: true, tail: "" }) }), record().green], [null, true])
  same("worker-gate-hook: a tools diff runs test-tools for its module, and tailOf keeps 40 lines", [gateCommands(dir, ["tools/lib/alpha.mjs"], () => true).map(text), tailOf("x\n".repeat(99)).split("\n").length], [["node tools/test-tools.mjs --only alpha", "node tools/check-dashes.mjs --files tools/lib/alpha.mjs"], 40])
  const modules = (...paths) => gateCommands(dir, paths, () => true).map(text).filter((entry) => entry.includes("test-tools"))
  same("worker-gate-hook: a .claude file and a non-mjs file of tools select the module that names them", [modules(".claude/skills/x/SKILL.md"), modules("tools/replay-scripts.json")], [["node tools/test-tools.mjs --only skills"], ["node tools/test-tools.mjs --only skills"]])
  same("worker-gate-hook: a changed path that no module names runs the whole tool suite", [modules("tools/lib/gate-commands.mjs"), modules("tools/lib/alpha.mjs", ".claude/orchestrator.json"), modules("tools/__tests__/gone.mjs")], [["node tools/test-tools.mjs"], ["node tools/test-tools.mjs"], ["node tools/test-tools.mjs"]])
  same("worker-gate-hook: a change in the eslint-rules workspace runs vitest related in it", gateCommands(dir, ["eslint-rules/a.cjs"], () => true).map(text).filter((entry) => entry.includes("vitest")), ["npx vitest related --run --passWithNoTests a.cjs"])
  const bare = join(root, "gate-hook-bare")
  for (const path of ["tools/release-smoke.mjs", "tools/__tests__/release-smoke.test.mjs", "eslint-rules/no-comments.cjs"]) { mkdirSync(dirname(join(bare, path)), { recursive: true }); writeFileSync(join(bare, path), "") }
  same("worker-gate-hook: a repository with no test-tools.mjs, check-dashes.mjs or eslint-rules package gets no command for them", gateCommands(bare, ["tools/release-smoke.mjs", "eslint-rules/no-comments.cjs"], () => true).map(text), [])
  const stop = workerSettings({ hotPath: "/h", skillNames: [], gate: { run: "r", head: "a" } }).hooks.Stop[0].hooks[0].command
  T("worker-gate-hook: a code worker gets the Stop hook, and a find or replan run gets none", stop.includes("worker-gate-hook.mjs") && stop.includes("--run 'r' --head 'a'") && workerSettings({ hotPath: "/h", skillNames: [], gate: null }).hooks.Stop === undefined, stop)
}
