/** The review rules that Pullfrog applies to a repository, read live from the Pullfrog console, never copied into a file. */

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { win32 } from "node:path"

import { resolveSpawnTarget } from "./win-spawn-target.mjs"

/** The Pullfrog CLI that printed the listing this parser reads. A newer version is a reviewed change. */
const PULLFROG_CLI_VERSION = "0.1.138"

const SLUG = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
/** `prompts.review  "<JSON string>"  [<source>]` is one line of `pullfrog config list`; an identity without write access sees `[<source>, read-only]`. */
const REVIEW_RULES_LINE = /^prompts\.review[ \t]+(".*")[ \t]+\[[A-Za-z-]+(?:, read-only)?\][ \t]*$/m
const UNSET = "unset"

/** The review rules in the output of `pullfrog config list`, or an error that names why there are none. */
const parsePullfrogReviewRules = (listing, slug) => {
  const line = REVIEW_RULES_LINE.exec(String(listing))
  if (line === null) throw new Error(`the Pullfrog listing of ${slug} has no prompts.review line`)
  let rules
  try { rules = JSON.parse(line[1]) } catch (error) { throw new Error(`the prompts.review value of ${slug} is not a JSON string: ${error.message}`) }
  if (typeof rules !== "string" || rules === UNSET || rules.trim() === "") throw new Error(`the Pullfrog console holds no review rules for ${slug} (prompts.review is ${JSON.stringify(rules)})`)
  return rules
}

/** The command that lists the Pullfrog settings of `slug`. `PULLFROG_BIN` names the CLI itself, so a test names a stub. */
export const pullfrogListCommand = (slug, environment = process.env, { platform = process.platform, resolveTarget = resolveSpawnTarget, fileExists = existsSync } = {}) => {
  if (!SLUG.test(slug)) throw new Error(`"${slug}" is not an owner/repository slug`)
  if (environment.PULLFROG_BIN) return { command: environment.PULLFROG_BIN, args: ["config", "list", "--repo", slug] }
  const [command, npx] = npxRunner({ platform, pathValue: environment.PATH ?? "", pathExt: environment.PATHEXT ?? "", resolveTarget, fileExists })
  return { command, args: [...npx, "-y", `pullfrog@${PULLFROG_CLI_VERSION}`, "config", "list", "--repo", slug] }
}

/**
 * Node spawns no .cmd shim without a shell (CVE-2024-27980), and a shell joins arguments without escaping them. On Windows
 * this runs the npx-cli.js that npm's own npx.cmd runs from the directory of the shim (npm/bin/npx.cmd: %~dp0\node_modules\npm\bin\npx-cli.js).
 */
const npxRunner = ({ platform, pathValue, pathExt, resolveTarget, fileExists }) => {
  if (platform !== "win32") return ["npx", []]
  const target = resolveTarget("npx", { platform, pathValue, pathExt })
  if (target === null) throw new Error("no npx on PATH")
  if (![".cmd", ".bat"].includes(win32.extname(target).toLowerCase())) return [target, []]
  const cli = win32.join(win32.dirname(target), "node_modules", "npm", "bin", "npx-cli.js")
  if (!fileExists(cli)) throw new Error(`npx is the command shim ${target}, and ${cli} does not exist`)
  return [process.execPath, [cli]]
}

/** Reads the review rules of `slug`. Any failure throws an error that names the repository and the CLI version, so a compose stops with a named cause. */
export const readPullfrogReviewRules = (slug, environment = process.env, platformOptions = {}) => {
  const unreadable = (reason) => new Error(`cannot read the Pullfrog review rules of ${slug} with pullfrog@${PULLFROG_CLI_VERSION}: ${reason}`)
  let listCommand
  try { listCommand = pullfrogListCommand(slug, environment, platformOptions) } catch (error) { throw unreadable(error.message) }
  const result = spawnSync(listCommand.command, listCommand.args, { encoding: "utf8", timeout: 120_000, env: environment, windowsHide: true })
  if (result.error) throw unreadable(result.error.message)
  if (result.status !== 0) throw unreadable(`exit ${result.status}: ${(result.stderr || result.stdout).trim().split("\n")[0]}`)
  try { return parsePullfrogReviewRules(result.stdout, slug) } catch (error) { throw unreadable(error.message) }
}
