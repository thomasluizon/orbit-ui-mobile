import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { REPO_ROOT, T } from "./_harness.mjs"

/** Damage that a blind replace of the retired name leaves behind: a crate name that changed inside a word. */
const DAMAGED_TOKENS = ["forbitnd"]

/** The one name twice in a pair: "Orbit" and "Orbit", Orbit|Orbit, orbit-orbit. A table row can list two equal labels. */
const DOUBLED_NAME = /\bOrbit\b["'`)\]]*(?:\s*(?:\||\/|,|&|and|or)\s*)["'`(\[]*\bOrbit\b|\borbit-orbit\b/

const trackedTextFiles = () => execFileSync("git", ["-C", REPO_ROOT, "ls-files", "-z"], { encoding: "utf8", maxBuffer: 1 << 28 })
  .split("\0")
  .filter(Boolean)
  .filter((path) => path !== "tools/__tests__/orbit-substitution-damage.mjs" && existsSync(join(REPO_ROOT, path)))
  .map((path) => ({ path, buffer: readFileSync(join(REPO_ROOT, path)) }))
  .filter(({ buffer }) => !buffer.includes(0))
  .map(({ path, buffer }) => ({ path, text: buffer.toString("utf8") }))

export const cases = () => {
  const files = trackedTextFiles()
  for (const token of DAMAGED_TOKENS) {
    const hits = files.filter(({ text }) => text.includes(token)).map(({ path }) => path)
    T(`no tracked file carries the damaged word ${token}`, hits.length === 0, hits.join(", "))
  }
  const doubled = []
  for (const { path, text } of files) {
    text.split("\n").forEach((line, index) => {
      if (!line.startsWith("|") && DOUBLED_NAME.test(line)) doubled.push(`${path}:${index + 1}: ${line.trim().slice(0, 100)}`)
    })
  }
  T("no tracked line names Orbit twice in one pair", doubled.length === 0, doubled.join("\n     "))
  T("the desktop lock file names the fastrand crate", /^name = "fastrand"$/m.test(readFileSync(join(REPO_ROOT, "apps/desktop/src-tauri/Cargo.lock"), "utf8")), "fastrand is missing from Cargo.lock")
}
