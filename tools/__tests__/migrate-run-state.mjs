import { chmodSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { readRunState } from "../lib/run-state.mjs"

import { T, check, realOrchestratorConfig, root, stage, stageWithConfig } from "./_harness.mjs"

const TOOL = "migrate-run-state.mjs"
const HEAD = "d".repeat(40)

/**
 * A gh stand-in for one apply: no run record exists (`issue list` prints an empty array, which --json always does for no
 * match), `issue create` prints the issue URL as gh does, and the one command named by `failing` exits 1 with `message`.
 */
const stubGh = (failing, message) => {
  const script = stage(`migrate-run-state/gh-${failing}-${message.length}`, [
    "#!/bin/sh",
    "case \"$*\" in",
    `  "issue ${failing}"*) cat >/dev/null; echo "gh: ${message}" >&2; exit 1;;`,
    "  \"issue list\"*) printf '[]';;",
    "  \"issue create\"*) cat >/dev/null; printf 'https://github.com/thomasluizon/orbit-tickets/issues/2300\\n';;",
    "  \"issue close\"*) ;;",
    "  *) cat >/dev/null; echo \"gh: unstubbed $*\" >&2; exit 1;;",
    "esac",
    "",
  ].join("\n"))
  chmodSync(script, 0o755)
  return script
}

export const cases = () => {
  const staged = stageWithConfig("migrate-run-state", TOOL, realOrchestratorConfig())
  mkdirSync(join(staged.base, ".git"), { recursive: true })
  const runState = stage("migrate-run-state/run.json", JSON.stringify({ sessionId: "live", intake: { gmail: { completed: {}, pending: {}, highWater: "m2" } } }))
  const manifest = stage("migrate-run-state/manifest.json", JSON.stringify([{ kind: "review", file: stage("migrate-run-state/review.md", "Looks fine.\n"), issue: 2152, head: HEAD }]))
  check(TOOL, "an invalid manifest item exits 2 before any GitHub call", ["--run-state", runState, "--manifest", manifest], { status: 2, stderr: /VERDICT/ }, { path: staged.path })
  check(TOOL, "a manifest that is not an array exits 2", ["--manifest", stage("migrate-run-state/object.json", "{}")], { status: 2, stderr: /must be a JSON array/ }, { path: staged.path })
  check(TOOL, "an unreadable manifest exits 2", ["--manifest", join(root, "migrate-run-state", "absent.json")], { status: 2, stderr: /cannot read the manifest/ }, { path: staged.path })
  const decision = stage("migrate-run-state/decision.md", "Batch the notes of one round into one comment.\n")
  const applyManifest = stage("migrate-run-state/apply.json", JSON.stringify([{ kind: "decision", file: decision, issue: 2152 }]))
  const applied = (label, failing, message) => check(TOOL, label, ["--apply", "--run-state", runState, "--manifest", applyManifest],
    { status: 1, stderr: new RegExp(message.replace(/[()]/g, "\\$&")) }, { path: staged.path, env: { GH_BIN: stubGh(failing, message) } })
  // A failed GitHub write is exit 1, whatever words its message holds: the exit code reads the error class, never the text.
  applied("a comment that GitHub refuses for a missing token exits 1, not 2", "comment", "needs a token")
  applied("a refused write that says \"must be\" exits 1", "create", "Validation Failed: title must be shorter (HTTP 422)")
  applied("a refused write that says \"needs the contents write permission\" exits 1", "comment", "Resource not accessible by personal access token (HTTP 403) needs the contents write permission")
  check(TOOL, "a gh that is not installed exits 1", ["--apply", "--run-state", runState, "--manifest", applyManifest], { status: 1, stderr: /ENOENT/ },
    { path: staged.path, env: { GH_BIN: join(root, "migrate-run-state", "no-such-gh") } })
  check(TOOL, "a manifest item whose file is missing exits 2 before any GitHub call", ["--apply", "--run-state", runState, "--manifest",
    stage("migrate-run-state/missing-file.json", JSON.stringify([{ kind: "decision", file: join(root, "migrate-run-state", "gone.md"), issue: 2152 }]))],
  { status: 2, stderr: /cannot be read: ENOENT/ }, { path: staged.path, env: { GH_BIN: join(root, "migrate-run-state", "no-such-gh") } })
  check(TOOL, "a manifest item with an unknown repo key exits 2 before any GitHub call", ["--run-state", runState, "--manifest",
    stage("migrate-run-state/unknown-repo.json", JSON.stringify([{ kind: "body", file: decision, repo: "nowhere", pr: 2486 }]))], { status: 2, stderr: /unknown repo key nowhere/ }, { path: staged.path })
  T(`${TOOL}: a refused run leaves the live run record untouched`, JSON.parse(readFileSync(runState, "utf8")).intake.gmail.highWater === "m2")
  T(`${TOOL}: the test checkout has no run record of its own`, readRunState(staged.base) === null)
}
