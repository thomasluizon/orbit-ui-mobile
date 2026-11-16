/**
 * The read-only mode of tools/launch-worker.mjs: a review or a device proof that writes nothing tracked
 * in any repository it can reach. sandbox-exec applies a write profile to the whole worker process tree,
 * which no environment variable, git option or file write can drop. The run directory is the one
 * worktree the worker may write, so a before and after status of it finds a changed tracked file.
 */

import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs"
import { createServer } from "node:net"
import { dirname, join, relative, resolve, isAbsolute } from "node:path"

import { parseWorktreeList } from "./git-worktrees.mjs"
import { researchPaths } from "./research-run.mjs"

/** The first line of each result. tools/compose-prompt.mjs writes the same lines into each order. */
export const REVIEW_VERDICT_LINE = /^VERDICT: (?:CLEAN|DEFECTS \(\d+\))$/
export const PROOF_VERDICT_LINE = /^PROOF: (?:PASS|FAIL \(\d+ defects?\))$/

/** The verdict line of a result in `mode` ("review" or "proof"), or null when the first line is not one. */
export const resultVerdict = (text, mode) => {
  const first = String(text ?? "").split(/\r?\n/, 1)[0].trim()
  return (mode === "proof" ? PROOF_VERDICT_LINE : REVIEW_VERDICT_LINE).test(first) ? first : null
}


const git = (directory, args) => spawnSync("git", ["-C", directory, ...args], {
  encoding: "utf8",
  windowsHide: true,
  maxBuffer: 64 * 1024 * 1024,
  // A status in another worker's worktree must never take that worktree's index lock.
  env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
})

const inside = (path, directory) => {
  const relation = relative(directory, path)
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation))
}

/**
 * The checked order, output and run directory of a read-only run. The order and the output follow the
 * research rules: outside every repository, and the output a new file. The run directory is a worktree
 * root, such as a detached worktree at the head under review, or a copy outside every repository.
 */
export const readOnlyPaths = (orderArgument, outputArgument, directoryArgument, mode) => {
  if (!directoryArgument || directoryArgument.startsWith("--")) throw new Error(`--directory is required for --${mode}`)
  const { orderFile, outputFile } = researchPaths(orderArgument, outputArgument, mode)
  let runDirectory
  try { runDirectory = realpathSync(resolve(directoryArgument)) } catch { throw new Error(`run directory not found: ${directoryArgument}`) }
  if (!statSync(runDirectory).isDirectory()) throw new Error(`run directory is not a directory: ${runDirectory}`)
  for (const [label, path] of [["order", orderFile], ["output", outputFile]]) {
    if (inside(path, runDirectory)) throw new Error(`${label} lives inside the run directory ${runDirectory}; keep it in the scratchpad`)
  }
  const topLevel = git(runDirectory, ["rev-parse", "--show-toplevel"])
  if (topLevel.status === 0 && realpathSync(topLevel.stdout.trim()) !== runDirectory) {
    throw new Error(`run directory ${runDirectory} is inside a repository but is not a worktree root`)
  }
  return { orderFile, outputFile, runDirectory, gitWorktree: topLevel.status === 0 }
}

/** The macOS program that applies a sandbox profile to a process and to every process it starts. */
export const SANDBOX_EXEC = "/usr/bin/sandbox-exec"

/** Whether this machine can confine a read-only worker. Only macOS has sandbox-exec. */
export const writeSandboxAvailable = (platform = process.platform) => platform === "darwin" && existsSync(SANDBOX_EXEC)

const realPath = (path) => {
  try { return realpathSync(path) } catch { return null }
}

/** Each worktree path of the repository that holds `directory`, the primary checkout first. */
const worktreesOf = (directory) => {
  const listed = git(directory, ["worktree", "list", "--porcelain"])
  if (listed.status !== 0) return []
  return parseWorktreeList(listed.stdout).filter((worktree) => worktree.path && !worktree.prunable).map((worktree) => worktree.path)
}

/**
 * The directories that the read-only worker may not write: the directory that holds each configured
 * repository (so each sibling repository, such as the brain vault, is in it), each configured
 * repository, each worktree of a configured repository or of the run directory's repository, and each
 * extra root (the configured hygiene roots). Only existing directories, each one once, by real path.
 */
export const protectedDirectories = ({ repositories, runDirectory = null, extraRoots = [] }) => {
  const directories = new Set()
  const add = (path) => {
    const real = realPath(path)
    if (real !== null) directories.add(real)
  }
  for (const repository of repositories) {
    if (!existsSync(repository)) continue
    add(dirname(realPath(repository) ?? repository))
    add(repository)
    for (const worktree of worktreesOf(repository)) add(worktree)
  }
  if (runDirectory !== null) for (const worktree of worktreesOf(runDirectory)) add(worktree)
  for (const root of extraRoots) add(root)
  return [...directories].sort()
}

/** A path as a sandbox profile string. A quote, a backslash or a line break would end the string early. */
const profileString = (path) => {
  if (/["\\\r\n]/.test(path)) throw new Error(`the write sandbox cannot name a path with a quote, a backslash or a line break: ${JSON.stringify(path)}`)
  return `"${path}"`
}

const profileRegexText = (path) => profileString(path).slice(1, -1).replace(/[.*+?^${}()|[\]]/g, "\\$&")

/**
 * The sandbox profile of a read-only run. A later rule wins over an earlier one, so the run directory
 * and the test caches inside node_modules open inside a protected directory, and the run directory's
 * `.git` link closes again after that. `homeDirectory` scopes the git-directory rule, so a test
 * fixture under the temporary directory can still make a repository.
 */
export const writeSandboxProfile = ({ protectedDirectories: directories, homeDirectory, runDirectory }) => [
  "(version 1)",
  "(allow default)",
  ...directories.map((directory) => `(deny file-write* (subpath ${profileString(directory)}))`),
  // A review worktree links node_modules from a protected checkout. Vite and Vitest write their untracked
  // bundled config and cache there, so a test run needs these directories and no package file.
  `(allow file-write* (regex #"/node_modules/\\.(vite|vite-temp|cache)(/|$)"))`,
  `(deny file-write* (regex #"^${profileRegexText(homeDirectory)}/(.*/)?[^/]*\\.git(/|$)"))`,
  `(allow file-write* (subpath ${profileString(runDirectory)}))`,
  `(deny file-write* (subpath ${profileString(join(runDirectory, ".git"))}))`,
  // Git reaches a network remote only through these programs: the http, https, ftp, ext and fd helpers, and ssh.
  // A local remote is a directory, which the rules above refuse when it is protected or a git directory under home.
  `(deny process-exec (regex #"/git-remote-[^/]+$") (regex #"/ssh$"))`,
  "",
].join("\n")

/** The sandbox-exec invocation that runs `executable` under `profile`. */
export const sandboxedInvocation = (profile, executable, args) => ({ executable: SANDBOX_EXEC, args: ["-p", profile, executable, ...args] })

const portFree = (port) => new Promise((settle) => {
  const server = createServer()
  server.once("error", () => settle(false))
  server.listen(port, "127.0.0.1", () => server.close(() => settle(true)))
})

/**
 * An even emulator console port from 5560 to 5680 whose adb port, the next one, is also free. The
 * first three emulators of a machine take 5554 to 5559 on their own, so a pinned proof emulator never
 * shares a serial with the owner's. Null when every port is taken.
 */
export const freeEmulatorPort = async () => {
  for (let port = 5560; port <= 5680; port += 2) {
    if (await portFree(port) && await portFree(port + 1)) return port
  }
  return null
}

const STATUS_ARGUMENTS = ["-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--untracked-files=no", "--ignore-submodules=none"]

/** Each changed tracked path of a worktree, keyed to its status code and content hash, or null when git cannot read it. */
const trackedChanges = (worktree) => {
  const result = git(worktree, STATUS_ARGUMENTS)
  if (result.status !== 0) return null
  const entries = result.stdout.split("\0")
  const changes = {}
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (entry.length < 4) continue
    const code = entry.slice(0, 2)
    const path = entry.slice(3)
    // A rename or a copy carries its source path as the next entry.
    if (code[0] === "R" || code[0] === "C") index += 1
    let content = "absent"
    try { content = createHash("sha1").update(readFileSync(join(worktree, path))).digest("hex") } catch { /* a deleted path has no content */ }
    changes[path] = `${code}:${content}`
  }
  return changes
}

/** The HEAD and the changed tracked paths of the run directory, or null for a copy outside every repository. */
export const runDirectorySnapshot = (runDirectory, gitWorktree) => {
  if (!gitWorktree) return null
  const head = git(runDirectory, ["rev-parse", "HEAD"])
  return { head: head.status === 0 ? head.stdout.trim() : null, tracked: trackedChanges(runDirectory) }
}

/**
 * The writes between two snapshots of the run directory: a moved HEAD, a changed tracked path, or a
 * status that git can no longer read. The sandbox refuses every other write, and the launcher holds the
 * run directory against a second launch, so each change here is the worker's own.
 */
export const runDirectoryWrites = (before, after, runDirectory) => {
  if (before === null) return []
  const writes = []
  if (before.head !== after.head) writes.push({ kind: "commit", directory: runDirectory, detail: `HEAD ${before.head} -> ${after.head}` })
  if (before.tracked === null) return writes
  if (after.tracked === null) return [...writes, { kind: "tracked-change", directory: runDirectory, detail: "git can no longer read the status of the run directory" }]
  const paths = [...new Set([...Object.keys(before.tracked), ...Object.keys(after.tracked)])]
    .filter((file) => before.tracked[file] !== after.tracked[file]).sort()
  if (paths.length > 0) writes.push({ kind: "tracked-change", directory: runDirectory, detail: paths.join(", ") })
  return writes
}

const BRIEF_HEADING = "#### The review brief"

/** The body of rule 14's review brief in `.claude/playbooks/review-and-audit.md`, the one place that defines it. */
export const reviewBrief = (playbook) => {
  const lines = playbook.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trimEnd() === BRIEF_HEADING)
  if (start === -1) throw new Error(`the playbook has no "${BRIEF_HEADING}" section`)
  const end = lines.findIndex((line, index) => index > start && /^#{2,4} /.test(line))
  const body = lines.slice(start + 1, end === -1 ? lines.length : end).join("\n").trim()
  if (body === "") throw new Error(`the "${BRIEF_HEADING}" section is empty`)
  return body
}

const NO_WRITES = `**You write nothing tracked.** Never edit, create or delete a tracked file, and never commit, stash,
reset, check out, switch, merge, rebase, fetch, create a branch or a tag, or push, in this directory or
in any other worktree or repository. You run under a macOS write sandbox: a write to a configured
repository, to one of its worktrees, to a git directory or to a git remote fails with "Operation not
permitted". Your directory is the one worktree you can write, and the launcher fails the whole run when
a tracked file in it changed. Untracked output of a test or a build is allowed. A test that makes its
own fixture repository in the temporary directory still works.

**No GitHub write.** Read GitHub with \`gh pr view\`, \`gh pr diff\` and \`gh api\` GET requests only. Never post a
comment, a review, a reaction, a label or a status, never resolve a thread, never ask for a review, and
never read a credential. A hook refuses each of these commands.`

const FINAL_MESSAGE = `**Your final message has at most 12 lines:** the verdict line, the result file path, and one line for
each of the most severe findings. The orchestrator reads the result file, not your message.`

/** The order of a pre-push review, or with `since` of a fix-round review that reads only the newer commits. */
export const reviewOrder = ({ brief, slug, pullRequest, head, since = null, baseBranch = "main" }) => {
  const scope = since === null
    ? `Read the whole diff against its merge base: \`git diff $(git merge-base origin/${baseBranch} ${head}) ${head}\`.`
    : `This is a fix round. The previous review read \`${since}\`. Read only the new commits,
\`git diff ${since}..${head}\`, and the code around each hunk.`
  return `# Read-only review of ${slug} pull request #${pullRequest}

${brief}

---

## Read-only review contract

**What you review.** Pull request #${pullRequest} of \`${slug}\` at head \`${head}\`. ${scope} Your directory is a
detached worktree at that head or a copy of it. Read by commit (\`git show ${head}:<path>\`), never by a
checkout.

${NO_WRITES}

**Your result.** Write the complete report to the result file that the launch instruction names, and
to no other file. Its first line is exactly \`VERDICT: CLEAN\` when you confirmed no finding and no
body line is wrong. Otherwise it is \`VERDICT: DEFECTS (<n>)\`, where n counts the numbered findings
and the wrong body lines. Then write the report that the brief describes: \`HEAD: <sha>\`,
\`FILES READ: <n of m>\`, \`## Findings\`, \`## Body\` and \`## Not confirmed\`.

${FINAL_MESSAGE}
`
}

/** The order of a device proof: the coordinator's steps, the permitted devices and the evidence directory. */
export const proofOrder = ({ slug, pullRequest, head, plan, devices, evidenceDirectory }) => `# Device proof of ${slug} pull request #${pullRequest}

**What you prove.** Pull request #${pullRequest} of \`${slug}\` at head \`${head}\`. Your directory is a detached
worktree at that head or a copy of it. Do each step below and compare what you observe with the
expected result that the step names.

${plan.trim()}

**Devices.** Use only these: ${devices.join(", ")}. You may also create one throwaway Android virtual device
from the installed arm64 play image, run it headless with no personal account, and delete it before
you finish. Boot it on the port that the launcher pinned:
\`node tools/android-emulator.mjs --avd <throwaway name> --port $ORBIT_PROOF_EMULATOR_PORT\`. Its serial is
\`$ANDROID_SERIAL\`, which adb uses when a command names no device. Never pass another serial, never clear
or change either variable, never boot or use \`Orbit_Pixel_9_API_35\`, the owner's emulator, and never
sign in to a personal account. Read \`.claude/playbooks/operations.md\` \`## Android devices and Play\` before you use a device.

${NO_WRITES}
A step that needs a changed tracked file, such as a version bump for a local build, runs in a copy
outside every repository (\`git archive ${head} | tar -x -C <new directory>\`), never in a worktree.

**Evidence.** Save each screenshot, recording and log in \`${evidenceDirectory}\`, and name each file
by its step.

**Your result.** Write the complete report to the result file that the launch instruction names, and
to no other file. Its first line is exactly \`PROOF: PASS\` when every step met its expected result.
Otherwise it is \`PROOF: FAIL (<n> defects)\`, where n counts the steps that did not. Then write one
section for each step: the device, the exact commands, the observed result and the evidence files.

${FINAL_MESSAGE}
`
