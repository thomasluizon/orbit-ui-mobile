import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { REPO_ROOT, T, same, stage, stageRepo } from "./_harness.mjs"
import { proofOrder, protectedDirectories, readOnlyPaths, resultVerdict, reviewBrief, reviewOrder, runDirectorySnapshot, runDirectoryWrites, SANDBOX_EXEC, sandboxedInvocation, writeSandboxAvailable, writeSandboxProfile } from "../lib/review-run.mjs"

const UNIT = "lib/review-run.mjs"

const gitWith = (environment) => (directory, args) => spawnSync("git", ["-C", directory, "-c", "user.email=gate@orbit.test", "-c", "user.name=Orbit Gate", ...args], {
  encoding: "utf8",
  env: { ...process.env, ...environment },
})

const verdictCases = () => {
  same(`${UNIT}: a clean review verdict is read`, resultVerdict("VERDICT: CLEAN\n\nHEAD: abc\n", "review"), "VERDICT: CLEAN")
  same(`${UNIT}: a review verdict with defects is read`, resultVerdict("VERDICT: DEFECTS (3)\r\nmore", "review"), "VERDICT: DEFECTS (3)")
  same(`${UNIT}: a passing proof is read`, resultVerdict("PROOF: PASS\n", "proof"), "PROOF: PASS")
  same(`${UNIT}: a failing proof is read`, resultVerdict("PROOF: FAIL (2 defects)\n", "proof"), "PROOF: FAIL (2 defects)")
  for (const [text, mode] of [
    ["PROOF: PASS", "review"],
    ["VERDICT: CLEAN", "proof"],
    ["The verdict is VERDICT: CLEAN", "review"],
    ["\nVERDICT: CLEAN", "review"],
    ["VERDICT: DEFECTS", "review"],
    ["", "proof"],
  ]) {
    same(`${UNIT}: ${JSON.stringify(text)} is no ${mode} verdict line`, resultVerdict(text, mode), null)
  }
}

const pathCases = () => {
  const order = stage("review-run/order.md", "Review the head.\n")
  const output = join(dirname(order), "result.md")
  const copy = dirname(stage("review-run/copy/file.txt", "a copy outside every repository\n"))
  const repository = stageRepo("review-run-paths")
  mkdirSync(join(repository.path, "nested"), { recursive: true })
  const outside = readOnlyPaths(order, output, copy, "review")
  T(`${UNIT}: a copy outside every repository is accepted and is no git worktree`, outside.runDirectory === realpathSync(copy) && outside.gitWorktree === false, JSON.stringify(outside))
  const worktreeRoot = readOnlyPaths(order, output, repository.path, "proof")
  T(`${UNIT}: a worktree root is accepted as a git run directory`, worktreeRoot.gitWorktree === true && worktreeRoot.orderFile === realpathSync(order), JSON.stringify(worktreeRoot))
  for (const [label, argv, pattern] of [
    ["a missing --directory", [order, output, null], /--directory is required for --review/],
    ["a directory inside a repository that is not its root", [order, output, join(repository.path, "nested")], /is inside a repository but is not a worktree root/],
    ["a run directory that does not exist", [order, output, join(copy, "absent")], /run directory not found/],
    ["an output that already exists", [order, order, copy], /review output must be a new file/],
    ["an order inside the run directory", [join(copy, "file.txt"), output, copy], /order lives inside the run directory/],
    ["an output inside the run directory", [order, join(copy, "result.md"), copy], /output lives inside the run directory/],
  ]) {
    let message = "accepted"
    try { readOnlyPaths(...argv, "review") } catch (error) { message = error.message }
    T(`${UNIT}: refuses ${label}`, pattern.test(message), message)
  }
}

/** The profile closes the protected directories, opens the run directory inside them, then closes its git link again. */
const profileCases = () => {
  const profile = writeSandboxProfile({ protectedDirectories: ["/work/repos", "/work/repos/ui"], homeDirectory: "/home/a.b", runDirectory: "/work/repos/review" })
  const lines = profile.split("\n")
  const at = (text) => lines.findIndex((line) => line.includes(text))
  T(`${UNIT}: the profile allows by default and denies each protected directory`,
    lines[1] === "(allow default)" && at('(deny file-write* (subpath "/work/repos"))') > 1 && at('(deny file-write* (subpath "/work/repos/ui"))') > 1, profile)
  T(`${UNIT}: the run directory opens after every protected directory, and its .git closes after that`,
    at('(allow file-write* (subpath "/work/repos/review"))') > at('(deny file-write* (subpath "/work/repos/ui"))') &&
      at('(deny file-write* (subpath "/work/repos/review/.git"))') > at('(allow file-write* (subpath "/work/repos/review"))'), profile)
  T(`${UNIT}: the git directory rule is scoped to the home directory, with its dot escaped`, profile.includes('(regex #"^/home/a\\.b/(.*/)?[^/]*\\.git(/|$)")'), profile)
  T(`${UNIT}: only the Vite and cache directories inside node_modules open again, after the protected directories`,
    at('(allow file-write* (regex #"/node_modules/\\.(vite|vite-temp|cache)(/|$)"))') > at('(deny file-write* (subpath "/work/repos/ui"))'), profile)
  T(`${UNIT}: the profile refuses each git network transport`, profile.includes('(deny process-exec (regex #"/git-remote-[^/]+$") (regex #"/ssh$"))'), profile)
  for (const path of ['/work/a"b', "/work/a\\b", "/work/a\nb"]) {
    let message = "accepted"
    try { writeSandboxProfile({ protectedDirectories: [path], homeDirectory: "/home/a", runDirectory: "/work/run" }) } catch (error) { message = error.message }
    T(`${UNIT}: the profile refuses the path ${JSON.stringify(path)}`, /cannot name a path with a quote, a backslash or a line break/.test(message), message)
  }
  const invocation = sandboxedInvocation(profile, "claude", ["-p", "order"])
  same(`${UNIT}: the sandboxed invocation runs the worker under the profile`, [invocation.executable, ...invocation.args], [SANDBOX_EXEC, "-p", profile, "claude", "-p", "order"])
  same(`${UNIT}: only macOS has the write sandbox`, [writeSandboxAvailable("linux"), writeSandboxAvailable("win32")], [false, false])
}

/** The protected list holds the directory of each repository, each worktree and each extra root, once and by real path. */
const protectedCases = () => {
  const repository = stageRepo("review-run-protected")
  const plainGit = gitWith({})
  const linked = join(dirname(repository.path), "review-run-protected-linked")
  const run = join(dirname(repository.path), "review-run-protected-run")
  plainGit(repository.path, ["worktree", "add", "-q", "--detach", linked])
  const runRepository = stageRepo("review-run-protected-other")
  plainGit(runRepository.path, ["worktree", "add", "-q", "--detach", run])
  const vault = dirname(stage("review-run/vault/note.md", "a note\n"))
  const directories = protectedDirectories({ repositories: [repository.path, repository.path, join(vault, "absent")], runDirectory: run, extraRoots: [vault, join(vault, "absent-root")] })
  same(`${UNIT}: the protected list holds each parent, repository, worktree and root once`, directories,
    [...new Set([dirname(repository.path), repository.path, linked, runRepository.path, run, vault].map((path) => realpathSync(path)))].sort())
}

/** The run directory is the one worktree the worker may write, so its own status finds each write of the run. */
const runDirectoryCases = () => {
  const repository = stageRepo("review-run-snapshot")
  const plainGit = gitWith({})
  writeFileSync(join(repository.path, "tracked.txt"), "first\n")
  plainGit(repository.path, ["add", "--", "tracked.txt"])
  plainGit(repository.path, ["commit", "-q", "-m", "a tracked file"])
  const run = realpathSync(repository.path)
  const before = runDirectorySnapshot(run, true)
  same(`${UNIT}: an unchanged run directory has no write`, runDirectoryWrites(before, runDirectorySnapshot(run, true), run), [])
  writeFileSync(join(run, "untracked.txt"), "a build output\n")
  same(`${UNIT}: an untracked file is no write`, runDirectoryWrites(before, runDirectorySnapshot(run, true), run), [])
  writeFileSync(join(run, "tracked.txt"), "a reviewer edit\n")
  plainGit(run, ["commit", "-q", "--allow-empty", "-m", "a reviewer commit"])
  same(`${UNIT}: a commit and a tracked edit in the run directory are writes`,
    runDirectoryWrites(before, runDirectorySnapshot(run, true), run).map(({ kind, detail }) => [kind, kind === "commit" ? detail.startsWith("HEAD ") : detail]),
    [["commit", true], ["tracked-change", "tracked.txt"]])
  same(`${UNIT}: a status that git can no longer read is a write`,
    runDirectoryWrites(before, { head: before.head, tracked: null }, run).map(({ kind }) => kind), ["tracked-change"])
  same(`${UNIT}: a copy outside every repository has no snapshot and no write`, [runDirectorySnapshot(run, false), runDirectoryWrites(null, null, run)], [null, []])
}

/**
 * A review worktree links node_modules from the primary checkout. The repository .gitignore must ignore
 * that link, a file and not a directory, or git worktree remove refuses the worktree.
 */
const ignoredLinkCases = () => {
  const repository = stageRepo("review-run-ignored-link")
  const plainGit = gitWith({})
  writeFileSync(join(repository.path, ".gitignore"), readFileSync(join(REPO_ROOT, ".gitignore"), "utf8"))
  plainGit(repository.path, ["add", "--", ".gitignore"])
  plainGit(repository.path, ["commit", "-q", "-m", "the repository ignore rules"])
  const worktree = join(dirname(repository.path), "review-run-ignored-link-review")
  plainGit(repository.path, ["worktree", "add", "-q", "--detach", worktree])
  const installed = dirname(stage("review-run/installed/node_modules/package/index.js", "module.exports = 1\n"))
  symlinkSync(dirname(installed), join(worktree, "node_modules"))
  same(`${UNIT}: a node_modules link in a review worktree is ignored (finding 16)`, plainGit(worktree, ["status", "--porcelain", "--ignored=no"]).stdout, "")
  const removed = plainGit(repository.path, ["worktree", "remove", worktree])
  T(`${UNIT}: git worktree remove removes a review worktree that holds the link (finding 16)`, removed.status === 0 && !existsSync(worktree), removed.stderr)
}

/** Each verdict line an order promises, with its placeholder filled, is one the launcher publishes. */
const orderCases = () => {
  const playbook = "## Rules\n\n#### The review brief\n\nRead the diff.\n\n- A lens.\n\n### 15. The next rule\nNot the brief.\n"
  same(`${UNIT}: the brief ends at the next heading`, reviewBrief(playbook), "Read the diff.\n\n- A lens.")
  for (const [label, text, pattern] of [
    ["no brief heading", "## Rules\n", /has no "#### The review brief" section/],
    ["an empty brief", "#### The review brief\n\n#### Next\n", /section is empty/],
  ]) {
    let message = "accepted"
    try { reviewBrief(text) } catch (error) { message = error.message }
    T(`${UNIT}: the brief reader refuses ${label}`, pattern.test(message), message)
  }
  const promised = (order) => [...order.matchAll(/`((?:VERDICT|PROOF): [^`]+)`/g)].map((match) => match[1].replace("<n>", "2"))
  const review = reviewOrder({ brief: "Read the diff.", slug: "owner/name", pullRequest: "7", head: "abc1234" })
  const proof = proofOrder({ slug: "owner/name", pullRequest: "7", head: "abc1234", plan: "1. Tap. Expected: it opens.\n", devices: ["iPhone 17"], evidenceDirectory: "/evidence" })
  same(`${UNIT}: the review order promises exactly the review verdict lines`, promised(review).map((line) => resultVerdict(line, "review")), ["VERDICT: CLEAN", "VERDICT: DEFECTS (2)"])
  same(`${UNIT}: the proof order promises exactly the proof verdict lines`, promised(proof).map((line) => resultVerdict(line, "proof")), ["PROOF: PASS", "PROOF: FAIL (2 defects)"])
  const maximum = (order) => Number(/at most (\d+) lines/.exec(order)?.[1])
  T(`${UNIT}: both orders cap the final message at 12 lines`, maximum(review) === 12 && maximum(proof) === 12, `${maximum(review)} ${maximum(proof)}`)
}

export const cases = () => {
  orderCases()
  verdictCases()
  pathCases()
  profileCases()
  protectedCases()
  runDirectoryCases()
  ignoredLinkCases()
}
