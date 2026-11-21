import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { escapeRegex } from "../lib/escape-regex.mjs"

import { T, check, realOrchestratorConfig, root, stage, stageWithConfig } from "./_harness.mjs"

const TOOL = "migrate-run-state.mjs"
const HEAD = "d".repeat(40)

/**
 * A gh stand-in for one apply: no run record exists (`issue list` prints an empty array, which --json always does for no
 * match), `issue create` prints the issue URL as gh does, `issue comment` accepts its body, and the one command named by
 * `failing` exits 1 with `message`. With a `failing` of null, every call answers.
 */
const stubGh = (failing, message) => {
  const script = stage(`migrate-run-state/gh-${failing ?? "none"}-${message?.length ?? 0}`, [
    "#!/bin/sh",
    "case \"$*\" in",
    ...(failing === null ? [] : [`  "issue ${failing}"*) cat >/dev/null; echo "gh: ${message}" >&2; exit 1;;`]),
    "  \"issue list\"*) printf '[]';;",
    "  \"issue create\"*) cat >/dev/null; printf 'https://github.com/thomasluizon/orbit-tickets/issues/2300\\n';;",
    "  \"issue comment\"*) cat >/dev/null;;",
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
  const manifest = stage("migrate-run-state/manifest.json", JSON.stringify([{ kind: "review", file: stage("migrate-run-state/review.md", "Looks fine.\n"), issue: 2152, head: HEAD }]))
  check(TOOL, "an invalid manifest item exits 2 before any GitHub call", ["--manifest", manifest], { status: 2, stderr: /VERDICT/ }, { path: staged.path })
  check(TOOL, "a manifest that is not an array exits 2", ["--manifest", stage("migrate-run-state/object.json", "{}")], { status: 2, stderr: /must be a JSON array/ }, { path: staged.path })
  check(TOOL, "an unreadable manifest exits 2", ["--manifest", join(root, "migrate-run-state", "absent.json")], { status: 2, stderr: /cannot read the manifest/ }, { path: staged.path })
  const decision = stage("migrate-run-state/decision.md", "Batch the notes of one round into one comment.\n")
  const applyManifest = stage("migrate-run-state/apply.json", JSON.stringify([{ kind: "decision", file: decision, issue: 2152 }]))
  const refused = (label, failing, message) => check(TOOL, label, ["--apply", "--manifest", applyManifest],
    { status: 1, stderr: new RegExp(escapeRegex(message)) }, { path: staged.path, env: { GH_BIN: stubGh(failing, message) } })
  // A failed GitHub write is exit 1, whatever words its message holds: the exit code reads the error class, never the text.
  refused("a comment that GitHub refuses for a missing token exits 1, not 2", "comment", "needs a token")
  refused("a refused write that says \"must be\" exits 1", "create", "Validation Failed: title must be shorter (HTTP 422)")
  refused("a refused write that says \"needs the contents write permission\" exits 1", "comment", "Resource not accessible by personal access token (HTTP 403) needs the contents write permission")
  check(TOOL, "a gh that is not installed exits 1", ["--apply", "--manifest", applyManifest], { status: 1, stderr: /ENOENT/ },
    { path: staged.path, env: { GH_BIN: join(root, "migrate-run-state", "no-such-gh") } })
  check(TOOL, "a manifest item whose file is missing exits 2 before any GitHub call", ["--apply", "--manifest",
    stage("migrate-run-state/missing-file.json", JSON.stringify([{ kind: "decision", file: join(root, "migrate-run-state", "gone.md"), issue: 2152 }]))],
  { status: 2, stderr: /cannot be read: ENOENT/ }, { path: staged.path, env: { GH_BIN: join(root, "migrate-run-state", "no-such-gh") } })
  check(TOOL, "a manifest item with an unknown repo key exits 2 before any GitHub call", ["--manifest",
    stage("migrate-run-state/unknown-repo.json", JSON.stringify([{ kind: "body", file: decision, repo: "nowhere", pr: 2486 }]))], { status: 2, stderr: /unknown repo key nowhere/ }, { path: staged.path })
  check(TOOL, "--run-state is not an option", ["--run-state", "record.json"], { status: 2, stderr: /unknown option or missing value: --run-state/ }, { path: staged.path })
  check(TOOL, "the usage names no --run-state option", ["--help"], { status: 0, stdout: /^(?![\s\S]*--run-state)/ }, { path: staged.path })
  const succeeded = stageWithConfig("migrate-run-state-applied", TOOL, realOrchestratorConfig())
  const printed = check(TOOL, "a successful --apply posts each item and prints the posted list", ["--apply", "--manifest", applyManifest], { status: 0 },
    { path: succeeded.path, env: { GH_BIN: stubGh(null) } })
  const runFile = (name) => JSON.parse(readFileSync(join(succeeded.base, ".git", "orbit-test-run-files", "run-state", name), "utf8"))
  T(`${TOOL}: a successful --apply records each posted item in run-state/migration.json`,
    JSON.stringify(Object.values(runFile("migration.json").posted)) === JSON.stringify([{ kind: "decision", target: "#2152" }]) && JSON.parse(printed.stdout).posted.length === 1)
  const dry = stageWithConfig("migrate-run-state-dry", TOOL, realOrchestratorConfig())
  check(TOOL, "a dry run exits 0", ["--manifest", applyManifest], { status: 0 }, { path: dry.path, env: { GH_BIN: stubGh(null) } })
  T(`${TOOL}: a dry run records no posted item`, !existsSync(join(dry.base, ".git", "orbit-test-run-files", "run-state", "migration.json")))
}
