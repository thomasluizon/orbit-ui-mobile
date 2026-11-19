#!/usr/bin/env node

import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"

import { configuredRepositorySlug } from "./lib/admission.mjs"
import { runBounded } from "./lib/bounded-process.mjs"
import { githubEnvironment, redactSecrets, repositorySlug } from "./lib/github-auth.mjs"
import { addComment, createRunRecord, findRunRecord } from "./lib/github-issues.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import { runFiles } from "./lib/run-files.mjs"
import { ManifestError, MANIFEST_KINDS, migrateRunState } from "./lib/run-migration.mjs"
import { REPO_ROOT, runStatePath, updateRunState } from "./lib/run-state.mjs"

const USAGE = `usage: migrate-run-state.mjs [--apply] [--manifest <file>]

  Moves a run's working state from this computer to GitHub, once. Without --apply it is a dry run: it
  reads and validates everything, prints the plan as JSON, and writes nothing. The intake marks come from
  the run record of this checkout (.git/orbit-orchestrate-run.json); a missing record moves no marks.

  --manifest <file>   a JSON array of the live scratchpad items to post, each with its file:
                        {"kind":"round-note","file":"<path>","issue":2152,"round":2,"head":"<40-hex sha>"}
                        {"kind":"review","file":"<path>","issue":2152,"head":"<40-hex sha>"}
                        {"kind":"report","file":"<path>","issue":2152,"commits":["<sha>"]}
                        {"kind":"decision","file":"<path>","issue":2152}  or  {"kind":"decision","file":"<path>","runRecord":true}
                        {"kind":"body","file":"<path>","repo":"ui","pr":2486}
                        {"kind":"reply","file":"<path>","repo":"ui","pr":2486,"thread":"PRRT_..."}
                      Kinds: ${MANIFEST_KINDS.join(", ")}. Every item is validated before the first write
  --apply             find or create the closed "Orbit run record" issue, merge the intake marks into
                      run-state/intake.json in the tickets repository (a mark already there wins), post every
                      manifest item (a note to its ticket or the run record, a body to its pull request, a
                      reply through tools/resolve-bot-thread.mjs), then clear the intake marks of the local run
                      record so nothing carries them again. Each posted item is recorded in
                      run-state/migration.json as it posts, so a rerun after a failure posts only the items that
                      did not post
  --help, -h          print this usage and exit 0

Prints one JSON object: apply, runRecord, intake, items, and with --apply the items posted.

exit codes: 0 planned or applied, 1 a GitHub read or write failed, 2 usage error or an invalid manifest item`

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const argv = process.argv.slice(2)
const options = { apply: false, manifest: null }
for (let index = 0; index < argv.length; index++) {
  const flag = argv[index]
  if (flag === "--help" || flag === "-h") {
    console.log(USAGE)
    process.exit(0)
  }
  if (flag === "--apply") options.apply = true
  else if (flag === "--manifest" && typeof argv[index + 1] === "string" && !argv[index + 1].startsWith("--")) options.manifest = resolve(argv[++index])
  else fail(2, `${USAGE}\n\nunknown option or missing value: ${flag}`)
}

const readJson = (path, label, missing) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    if (error.code === "ENOENT" && missing !== undefined) return missing
    fail(2, `migrate-run-state: cannot read the ${label} ${path}: ${error.message}`)
  }
}

const runState = readJson(runStatePath(), "run record", null)
const manifest = options.manifest === null ? [] : readJson(options.manifest, "manifest")
if (!Array.isArray(manifest)) fail(2, "migrate-run-state: the manifest must be a JSON array")

let config
try { config = readOrchestratorConfig() } catch (error) { fail(2, error.message) }
const repositoryOf = (key) => {
  if (typeof config.repos[key] !== "string") throw new ManifestError(`unknown repo key ${key}`)
  return { path: config.repos[key], slug: configuredRepositorySlug(config.repos[key], repositorySlug(REPO_ROOT).split("/")[0]) }
}
const runChild = async (file, args, { input, environment }) => {
  const result = await runBounded(file, args, { env: environment, input, timeoutMs: config.timeouts.gitRemoteSeconds * 1000 })
  if (result.error || result.timedOut || result.status !== 0) throw new Error(`${args.slice(0, 2).join(" ")} failed: ${(result.stderr || result.error?.message || `exit ${result.status}`).trim()}`)
  return result.stdout
}
const actions = {
  findRunRecord,
  createRunRecord,
  postComment: (number, body) => addComment(number, body),
  editPullBody: async (key, pr, body) => {
    const repository = repositoryOf(key)
    const auth = await githubEnvironment(repository.path)
    await runChild(process.env.GH_BIN || "gh", ["pr", "edit", String(pr), "--repo", repository.slug, "--body-file", "-"], { input: body, environment: auth.environment })
  },
  replyThread: async (key, pr, thread, body) => {
    await runChild(process.execPath, [join(REPO_ROOT, "tools", "resolve-bot-thread.mjs"), "--thread", thread, "--repo", key, "--pr", String(pr)], { input: body, environment: process.env })
  },
}

// An unknown repo key stops here, before the first write, as an invalid manifest item.
try {
  for (const item of manifest) if (typeof item?.repo === "string") repositoryOf(item.repo)
} catch (error) {
  fail(error instanceof ManifestError ? 2 : 1, `migrate-run-state: ${redactSecrets(error.message)}`)
}
let result
try {
  result = await migrateRunState({ localIntake: runState?.intake ?? {}, manifest, apply: options.apply, actions, store: runFiles() })
} catch (error) {
  fail(error instanceof ManifestError ? 2 : 1, `migrate-run-state: ${redactSecrets(error.message)}`)
}
if (options.apply && runState?.intake !== undefined) {
  // The marks now live on GitHub. A same-session write inherits the old key, so null replaces it instead of a delete.
  updateRunState((state) => (state ? { ...state, intake: null } : undefined))
}
console.log(JSON.stringify(result, null, 2))
