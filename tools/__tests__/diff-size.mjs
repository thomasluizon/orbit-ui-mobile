import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { changedFiles, changedLines, deletedChromiumTests, gitFiles, overCap, provedPaths } from "../lib/diff-size.mjs"
import { T, root, same } from "./_harness.mjs"

const lines = (count, text = "line") => Array.from({ length: count }, (_, index) => `${text} ${index}\n`).join("")
const chromiumTest = "import { launch } from '../support/chromium'\n"

const repository = (name) => {
  const directory = join(root, name)
  mkdirSync(directory, { recursive: true })
  const run = (...args) => spawnSync("git", ["-c", "user.email=gate@orbit.test", "-c", "user.name=Orbit Gate", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args],
    { cwd: directory, encoding: "utf8" })
  const git = (...args) => {
    const result = run(...args)
    if (result.status !== 0) throw new Error(`fixture git ${args.join(" ")} failed: ${result.stderr}`)
    return result.stdout
  }
  const write = (path, body) => {
    mkdirSync(dirname(join(directory, path)), { recursive: true })
    writeFileSync(join(directory, path), body)
  }
  const commit = (message) => {
    git("add", "-A")
    git("commit", "-q", "-m", message)
  }
  git("init", "-q", "--initial-branch=main")
  return { directory, run, git, write, commit }
}

const count = (files, path) => changedLines(files.filter((file) => file.path === path))

const localCases = () => {
  const { directory, git, write, commit } = repository("diff-size-local")
  const chromium = [1, 2, 3, 4].map((index) => `apps/web/__tests__/visual/chromium-${index}.test.tsx`)
  const plain = "apps/web/__tests__/plain.test.ts"
  for (const path of chromium) write(path, chromiumTest)
  write(plain, "import { it } from 'vitest'\n")
  write("deleted.ts", lines(20))
  write("old name.ts", lines(30, "moved"))
  write("edited.ts", lines(5, "edited"))
  write("apps/web/vitest/shard-timings.json", "{}\n")
  write("image.bin", Buffer.from([0, 1, 2]))
  commit("base")
  git("switch", "-q", "-c", "work")
  git("rm", "-q", "deleted.ts", plain, ...chromium)
  git("mv", "old name.ts", "new name.ts")
  write("edited.ts", `${lines(5, "edited")}one more\n`)
  write("apps/web/vitest/shard-timings.json", lines(40))
  write("image.bin", Buffer.from([0, 3, 4, 5]))
  commit("work")

  const committed = gitFiles({ cwd: directory, base: "main" })
  const file = (path) => committed.find((entry) => entry.path === path)
  same("diff-size: a whole deleted file counts 0", [file("deleted.ts")?.status, file("deleted.ts")?.deletions, count(committed, "deleted.ts")], ["D", 20, 0])
  same("diff-size: a whole deleted test file counts 0", [file(plain)?.status, count(committed, plain)], ["D", 0])
  same("diff-size: a pure rename counts 0", [file("new name.ts"), file("old name.ts")], [{ path: "new name.ts", status: "R100", additions: 0, deletions: 0, binary: false }, undefined])
  same("diff-size: shard-timings.json counts 0", [file("apps/web/vitest/shard-timings.json")?.additions, count(committed, "apps/web/vitest/shard-timings.json")], [40, 0])
  same("diff-size: a binary file counts 0", [file("image.bin")?.binary, count(committed, "image.bin")], [true, 0])
  same("diff-size: only the edit counts", [changedLines(committed), changedFiles(committed)], [1, ["edited.ts"]])

  // The same change in the words of a pull request: GitHub REST `status` and GraphQL `changeType`.
  for (const [source, words] of [["REST", { D: "removed", M: "modified", R100: "renamed" }], ["GraphQL", { D: "DELETED", M: "MODIFIED", R100: "RENAMED" }]]) {
    const pull = committed.map(({ path, status, additions, deletions, binary }) => ({ path, status: words[status], additions: binary ? 0 : additions, deletions: binary ? 0 : deletions }))
    same(`diff-size: a ${source} pull request gives the numbers of the local branch`, [changedLines(pull), changedFiles(pull)], [changedLines(committed), changedFiles(committed)])
  }

  same("diff-size: the deleted chromium tests are read from the merge base", deletedChromiumTests(committed, { cwd: directory, base: "main" }), chromium)
  same("diff-size: 4 deleted chromium test files are over the cap", overCap(committed, { cwd: directory, base: "main" }), ["chromium-deletions-over-cap:4"])
  same("diff-size: 3 deleted chromium test files pass", overCap(committed.filter(({ path }) => path !== chromium[0]), { cwd: directory, base: "main" }), [])
  let refused = ""
  try {
    overCap(committed)
  } catch (error) {
    refused = error.message
  }
  T("diff-size: a deleted web test with no repository to read is an error, never a pass", refused.includes("needs cwd and base"), refused)

  write("untracked dir/new file.ts", lines(50, "fresh"))
  write("untracked.bin", Buffer.from([7, 0, 7]))
  const untracked = gitFiles({ cwd: directory, base: "main" })
  same("diff-size: a new untracked file of 50 lines adds 50", [count(untracked, "untracked dir/new file.ts"), changedLines(untracked)], [50, 51])
  same("diff-size: an untracked binary file counts 0", count(untracked, "untracked.bin"), 0)
  same("diff-size: a subdirectory gives the same files", gitFiles({ cwd: join(directory, "untracked dir"), base: "main" }), untracked)
  write("no-newline.ts", "a\nb")
  same("diff-size: a last line with no newline counts", count(gitFiles({ cwd: directory, base: "main" }), "no-newline.ts"), 2)

  git("add", "untracked dir/new file.ts")
  write("edited.ts", `${lines(5, "edited")}one more\ntwo more\n`)
  const dirty = gitFiles({ cwd: directory, base: "main" })
  same("diff-size: a staged new file and an edit with no commit count", [count(dirty, "untracked dir/new file.ts"), count(dirty, "edited.ts")], [50, 2])
}

const mergeCases = () => {
  const { directory, run, git, write, commit } = repository("diff-size-merge")
  write("shared.ts", "base\n")
  commit("base")
  git("switch", "-q", "-c", "work")
  write("shared.ts", "work\n")
  commit("work")
  git("switch", "-q", "main")
  write("shared.ts", "main\n")
  write("from-main.ts", lines(500))
  commit("main")
  git("switch", "-q", "work")
  const merge = run("merge", "main")
  T("diff-size: the merge fixture stops on a conflict", merge.status === 1, merge.stdout)
  same("diff-size: lines that arrive from the base in an open merge do not count",
    changedFiles(gitFiles({ cwd: directory, base: "main" })), ["shared.ts"])
}

const capCases = () => {
  const file = (path, additions, deletions = 0) => ({ path, status: "M", additions, deletions })
  same("diff-size: 400 lines pass", overCap([file("a.ts", 250, 150)]), [])
  same("diff-size: 401 lines are over the cap", overCap([file("a.ts", 250, 151)]), ["size-over-cap:401"])
  const many = (total) => Array.from({ length: total }, (_, index) => file(`file-${index}.ts`, 1))
  same("diff-size: 30 files pass", overCap(many(30)), [])
  same("diff-size: 31 files are over the cap", overCap(many(31)), ["files-over-cap:31"])
  const generated = ["package-lock.json", "evals/astra/package-lock.json", ".github/layout-shard-timings.json", "apps/mobile/__tests__/__snapshots__/header.test.ts.snap"]
  same("diff-size: each generated file counts 0", changedLines(generated.map((path) => file(path, 900))), 0)
  same("diff-size: a file that only looks generated counts", changedLines([file("apps/web/package-lock.json.ts", 2), file("a/shard-timings.json", 3)]), 5)
  const proved = new Set(["proved.ts"])
  const files = [file("proved.ts", 900), file("a.ts", 4)]
  same("diff-size: a proved path counts 0", [changedLines(files, { proved }), changedFiles(files, { proved }), overCap(files, { proved })], [4, ["a.ts"], []])
}

const replayCases = () => {
  const { directory, git, write, commit } = repository("diff-size-replay")
  write("a.ts", "a\n")
  commit("base")
  git("switch", "-q", "-c", "work")
  write("a.ts", "b\n")
  const trusted = join(root, "diff-size-trusted")
  const runs = join(trusted, "runs")
  const cache = join(directory, ".git", "orbit-proved.json")
  mkdirSync(join(trusted, "tools"), { recursive: true })
  const list = (scripts) => writeFileSync(join(trusted, "tools", "replay-scripts.json"), JSON.stringify(scripts))
  const prove = () => provedPaths({ cwd: directory, base: "main", root: trusted })
  const ran = () => (existsSync(runs) ? readFileSync(runs, "utf8") : "")

  list([])
  same("diff-size: an empty list proves nothing and writes no cache", [[...prove()], ran(), existsSync(cache)], [[], "", false])
  same("diff-size: the list of this repository proves nothing", [...provedPaths({ cwd: directory, base: "main" })], [])

  writeFileSync(join(trusted, "tools", "prove.mjs"),
    `import { appendFileSync } from "node:fs"\nappendFileSync(${JSON.stringify(runs)}, process.argv.slice(2).join(" ") + "\\n")\nconsole.log("a.ts")\nconsole.log("moved/b.ts")\n`)
  list(["tools/prove.mjs"])
  same("diff-size: a listed script proves the paths it prints", [...prove()], ["a.ts", "moved/b.ts"])
  same("diff-size: the script gets the replay flag and the base", ran(), "--replay --base main\n")
  same("diff-size: an unchanged diff reads the cache", [[...prove()], ran().split("\n").length - 1], [["a.ts", "moved/b.ts"], 1])
  write("a.ts", "c\n")
  prove()
  same("diff-size: a changed tracked file runs the script again", ran().split("\n").length - 1, 2)
  write("new.ts", "new\n")
  prove()
  write("new.ts", "newer\n")
  prove()
  same("diff-size: a new or changed untracked file runs the script again", ran().split("\n").length - 1, 4)
  git("branch", "-f", "main", git("commit-tree", "-p", "main", "-m", "next", "main^{tree}").trim())
  prove()
  same("diff-size: a new base commit runs the script again", ran().split("\n").length - 1, 5)

  writeFileSync(join(trusted, "tools", "broken.mjs"), "console.error('no proof')\nprocess.exit(1)\n")
  list(["tools/broken.mjs"])
  rmSync(cache)
  let failure = ""
  try {
    prove()
  } catch (error) {
    failure = error.message
  }
  T("diff-size: a script that fails is an error and writes no cache", failure.includes("no proof") && !existsSync(cache), failure)
}

export const cases = () => {
  localCases()
  mergeCases()
  capCases()
  replayCases()
}
