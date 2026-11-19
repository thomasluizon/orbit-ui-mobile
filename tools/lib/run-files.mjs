/**
 * Durable run files in the private tickets repository, read and written through the GitHub contents API.
 * The blob sha of the file is the compare-and-swap token: a write names the sha it read, and GitHub refuses
 * the write when another writer replaced the file first. Any computer with `gh` signed in reads the same state.
 */

import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { readOrchestratorConfig } from "./orchestrator-config.mjs"
import { gitDirectoryOf, REPO_ROOT } from "./run-state.mjs"

export const INTAKE_FILE = "run-state/intake.json"
const COMMAND_TIMEOUT_MS = 30_000
const MAX_BUFFER = 128 * 1024 * 1024
const WRITE_ATTEMPTS = 5
const STATUS_LINE = /^HTTP\/\S+ (\d{3})/
const HEADER_END = /\r?\n\r?\n/

export class RunFileConflict extends Error {}

export const runFilePath = (path) => {
  if (typeof path !== "string" || !/^[\w.-]+(?:\/[\w.-]+)*$/.test(path) || path.split("/").some((part) => part === "." || part === "..")) {
    throw new Error(`run file path must be a relative path of plain names, got ${JSON.stringify(path)}`)
  }
  return path
}

/**
 * The status code and the body of one `gh api --include` answer. `--include` puts the HTTP status line first and the
 * headers after it, then a blank line and the body, on success and on failure alike. An answer without a status line
 * (gh could not reach GitHub) gives status 0.
 */
export const splitIncluded = (stdout) => {
  const status = Number(STATUS_LINE.exec(stdout)?.[1] ?? 0)
  if (status === 0) return { status, body: stdout }
  const end = HEADER_END.exec(stdout)
  return { status, body: end === null ? "" : stdout.slice(end.index + end[0].length) }
}

/** The contents API of the tickets repository through `gh api`, synchronous so every intake caller stays a plain call. */
export const githubRunFiles = ({ repository = readOrchestratorConfig().tickets.repository, gh = process.env.GH_BIN || "gh", environment = process.env } = {}) => {
  const api = (args, input) => {
    const result = spawnSync(gh, ["api", "--include", ...args], { encoding: "utf8", env: environment, input, timeout: COMMAND_TIMEOUT_MS, maxBuffer: MAX_BUFFER })
    if (result.error) throw new Error(`gh api ${args[0]} could not run: ${result.error.message}`)
    const { status, body } = splitIncluded(result.stdout ?? "")
    return { ok: result.status === 0, status, stdout: body, stderr: (result.stderr ?? "").trim() }
  }
  const json = (label, stdout) => {
    try { return JSON.parse(stdout) } catch (error) { throw new Error(`${label} returned invalid JSON: ${error.message}`) }
  }
  // A path the repository lacks and a repository the signed-in account cannot see answer the same 404 on the contents API
  // (both probed against GitHub: the status line and the body are the same). Only a readable repository makes 404 mean "absent".
  const absent = (location) => {
    const visible = api([`repos/${repository}`])
    if (!visible.ok) throw new Error(`gh api ${location} answered 404 and the repository ${repository} is not readable (HTTP ${visible.status || "none"}): ${visible.stderr}`)
    return { bytes: null, sha: null }
  }
  const store = {
    repository,
    read: (path) => {
      const location = `repos/${repository}/contents/${runFilePath(path)}`
      const response = api([location])
      if (!response.ok && response.status === 404) return absent(location)
      if (!response.ok) throw new Error(`gh api ${location} failed: ${response.stderr}`)
      const file = json(location, response.stdout)
      if (file?.type !== "file" || typeof file.sha !== "string") throw new Error(`${location} is not a file`)
      // A file over 1 MB comes back with encoding "none" and empty content; the blob API serves it up to 100 MB.
      const blob = file.encoding === "base64" ? file : json(`git blob ${file.sha}`, (() => {
        const read = api([`repos/${repository}/git/blobs/${file.sha}`])
        if (!read.ok) throw new Error(`gh api git blob ${file.sha} failed: ${read.stderr}`)
        return read.stdout
      })())
      if (blob.encoding !== "base64" || typeof blob.content !== "string") throw new Error(`${location} carried no base64 content`)
      return { bytes: Buffer.from(blob.content, "base64"), sha: file.sha }
    },
    write: (path, bytes, sha, message) => {
      const location = `repos/${repository}/contents/${runFilePath(path)}`
      const body = JSON.stringify({ message, content: Buffer.from(bytes).toString("base64"), ...(sha ? { sha } : {}) })
      const response = api(["-X", "PUT", location, "--input", "-"], body)
      // GitHub refuses a stale sha with 409, and a missing sha on a file that exists with 422. A 422 is a lost race when the
      // file now holds another sha than the one this write read: the caller reads again and retries. A 422 with the same sha
      // is an invalid request, which a retry cannot correct.
      const conflict = !response.ok && (response.status === 409 || (response.status === 422 && store.read(path).sha !== (sha ?? null)))
      if (!response.ok && conflict) throw new RunFileConflict(`${location} changed since sha ${sha ?? "none"}`)
      if (!response.ok) throw new Error(`gh api PUT ${location} failed: ${response.stderr}`)
      const written = json(location, response.stdout)
      if (typeof written?.content?.sha !== "string") throw new Error(`${location} write returned no content sha`)
      return { sha: written.content.sha, commit: written.commit?.sha ?? null }
    },
  }
  return store
}

/** The same compare-and-swap over one local directory, for hermetic tests: the sha is the hash of the bytes. */
export const directoryRunFiles = (directory) => {
  const pathOf = (path) => `${directory}/${runFilePath(path)}`
  const shaOf = (bytes) => createHash("sha1").update(bytes).digest("hex")
  const readBytes = (path) => {
    try { return readFileSync(pathOf(path)) } catch (error) { if (error.code === "ENOENT") return null; throw error }
  }
  return {
    repository: directory,
    read: (path) => {
      const bytes = readBytes(path)
      return { bytes, sha: bytes === null ? null : shaOf(bytes) }
    },
    write: (path, bytes, sha) => {
      const current = readBytes(path)
      if ((current === null ? null : shaOf(current)) !== (sha ?? null)) throw new RunFileConflict(`${path} changed since sha ${sha ?? "none"}`)
      mkdirSync(dirname(pathOf(path)), { recursive: true })
      writeFileSync(`${pathOf(path)}.${process.pid}.unpublished`, bytes)
      renameSync(`${pathOf(path)}.${process.pid}.unpublished`, pathOf(path))
      return { sha: shaOf(Buffer.from(bytes)), commit: null }
    },
  }
}

/** GitHub; a hermetic test sets ORBIT_TEST_RUN_FILES=1 and gets one directory in the git directory of each test checkout. */
export const runFiles = (repoRoot = REPO_ROOT) => process.env.ORBIT_TEST_RUN_FILES === "1"
  ? directoryRunFiles(join(gitDirectoryOf(repoRoot), "orbit-test-run-files")) : githubRunFiles()

export const readRunJson = (path, store = runFiles()) => {
  const { bytes, sha } = store.read(path)
  if (bytes === null) return { value: null, sha: null }
  try { return { value: JSON.parse(bytes.toString("utf8")), sha } } catch (error) {
    throw new Error(`${store.repository} ${path} is not JSON: ${error.message}`, { cause: error })
  }
}

/**
 * One read-change-write of a JSON run file. `change` receives the current value (null when absent) and may run again
 * after a conflict, so it must derive everything from its argument. Returns the value that was written, or the value it
 * read when `change` returns undefined or a value equal to it: that sends no write, because each write is a commit to the tickets repository.
 */
export const updateRunJson = (path, change, message, store = runFiles()) => {
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const { value, sha } = readRunJson(path, store)
    const next = change(value)
    if (next === undefined || JSON.stringify(next) === JSON.stringify(value)) return value
    try {
      store.write(path, `${JSON.stringify(next, null, 2)}\n`, sha, message)
      return next
    } catch (error) {
      if (!(error instanceof RunFileConflict)) throw error
    }
  }
  throw new Error(`${store.repository} ${path} kept changing: ${WRITE_ATTEMPTS} writes lost the race`)
}
