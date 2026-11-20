/** The review rules that Pullfrog applies to a repository, read live from the Pullfrog console, never copied into a file. */

import { spawnSync } from "node:child_process"

/** The Pullfrog CLI that printed the listing this parser reads. A newer version is a reviewed change. */
const PULLFROG_CLI_VERSION = "0.1.138"

const SLUG = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
/** `prompts.review  "<JSON string>"  [<source>]` is one line of `pullfrog config list`. */
const REVIEW_RULES_LINE = /^prompts\.review[ \t]+(".*")[ \t]+\[[A-Za-z-]+\][ \t]*$/m
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
export const pullfrogListCommand = (slug, environment = process.env) => {
  if (!SLUG.test(slug)) throw new Error(`cannot read the Pullfrog review rules: "${slug}" is not an owner/repository slug`)
  const [command, runner] = environment.PULLFROG_BIN ? [environment.PULLFROG_BIN, []] : ["npx", ["-y", `pullfrog@${PULLFROG_CLI_VERSION}`]]
  return { command, args: [...runner, "config", "list", "--repo", slug] }
}

/** Reads the review rules of `slug`. Any failure throws an error that names the repository and the CLI version, so a compose stops with a named cause. */
export const readPullfrogReviewRules = (slug, environment = process.env) => {
  const { command, args } = pullfrogListCommand(slug, environment)
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 120_000, env: environment, windowsHide: true })
  const unreadable = (reason) => new Error(`cannot read the Pullfrog review rules of ${slug} with pullfrog@${PULLFROG_CLI_VERSION}: ${reason}`)
  if (result.error) throw unreadable(result.error.message)
  if (result.status !== 0) throw unreadable(`exit ${result.status}: ${(result.stderr || result.stdout).trim().split("\n")[0]}`)
  try { return parsePullfrogReviewRules(result.stdout, slug) } catch (error) { throw unreadable(error.message) }
}
