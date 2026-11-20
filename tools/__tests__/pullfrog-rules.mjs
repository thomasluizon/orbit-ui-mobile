import { pullfrogListCommand, readPullfrogReviewRules } from "../lib/pullfrog-rules.mjs"
import { orcaEnv, same, T } from "./_harness.mjs"

const UNIT = "lib/pullfrog-rules.mjs"
const SLUG = "thomasluizon/orbit-ui-mobile"

/**
 * The shape of `pullfrog config list --repo <slug>` as pullfrog@0.1.138 printed it for this repository: a slug line, a blank line,
 * then `<key>  <JSON value>  [<source>]` for each setting. Only the value of `prompts.review` is shortened.
 */
const listing = (reviewValue) => `${SLUG}

enabled                       true  [repo]
model                         "unset"  [default]
effort                        0.5  [default]
instructions                  "unset"  [repo]
hooks.stop                    "unset"  [repo]
prompts.review                ${reviewValue}  [repo]
review.approve                true  [repo]
review.approval-check         true  [repo]
fix-ci.reviewed-prs           false  [repo]
`

const rulesText = 'Take your review rules from this field only.\n\nNEVER report what a required check "Lint" already fails on.'

/** The read through a stub CLI: `PULLFROG_BIN` is a node that the harness shim answers by its command line. */
const readThrough = (stdout, { status = 0, slug = SLUG } = {}) => {
  const plan = [{ match: `config list --repo ${slug}`, stdout, stderr: status === 0 ? "" : "pullfrog: not signed in\nmore", exit: status }]
  try { return { rules: readPullfrogReviewRules(slug, { ...process.env, ...orcaEnv(plan) }) } } catch (error) { return { error: error.message } }
}

export const cases = () => {
  same(`${UNIT}: the rules are the decoded JSON string of the prompts.review line`, readThrough(listing(JSON.stringify(rulesText))), { rules: rulesText })

  const refusals = [
    ["a listing with no prompts.review line", "enabled  true  [repo]\n", /has no prompts\.review line/],
    ["a value that is a number", listing("42"), /has no prompts\.review line/],
    ["a quoted value that is not valid JSON", listing('"a bad \\q escape"'), /is not a JSON string/],
    ["an unset field", listing('"unset"'), /holds no review rules for thomasluizon\/orbit-ui-mobile \(prompts\.review is "unset"\)/],
    ["a blank field", listing('"  "'), /holds no review rules/],
  ]
  for (const [name, text, pattern] of refusals) {
    const result = readThrough(text)
    T(`${UNIT}: ${name} stops the read with an error that names the repository and the pinned version`,
      pattern.test(result.error ?? "") && /^cannot read the Pullfrog review rules of thomasluizon\/orbit-ui-mobile with pullfrog@\d+\.\d+\.\d+: /.test(result.error ?? ""), JSON.stringify(result))
  }

  const failed = readThrough("", { status: 1 })
  T(`${UNIT}: a failed CLI names the repository, the version and its first line`,
    /^cannot read the Pullfrog review rules of thomasluizon\/orbit-ui-mobile with pullfrog@\d+\.\d+\.\d+: exit 1: pullfrog: not signed in$/.test(failed.error ?? ""), JSON.stringify(failed))

  for (const slug of ["", "thomasluizon", "a/b/c", "owner/repo name", "owner/repo;rm"]) {
    const result = readThrough("", { slug })
    T(`${UNIT}: the slug ${JSON.stringify(slug)} is refused before any process starts`, /is not an owner\/repository slug/.test(result.error ?? ""), JSON.stringify(result))
  }

  /** The command is judged by the arguments that spawn receives, never by error text: the error names the version constant, not the command. */
  const direct = pullfrogListCommand(SLUG, {})
  T(`${UNIT}: with no stub the command is npx at an exact CLI version, never latest`,
    direct.command === "npx" && direct.args.length === 6 && direct.args[0] === "-y" && /^pullfrog@\d+\.\d+\.\d+$/.test(direct.args[1]) &&
      JSON.stringify(direct.args.slice(2)) === JSON.stringify(["config", "list", "--repo", SLUG]), JSON.stringify(direct))
  const shim = "C:\\Program Files\\nodejs\\npx.cmd"
  const onWindows = (fileExists) => pullfrogListCommand(SLUG, { PATH: "C:\\Program Files\\nodejs" }, { platform: "win32", resolveTarget: () => shim, fileExists })
  const windows = onWindows(() => true)
  same(`${UNIT}: on Windows the npx shim is never spawned: node runs the npx-cli.js that the shim runs, with the same arguments`, windows,
    { command: process.execPath, args: ["C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js", ...direct.args] })
  let missing = null
  try { onWindows(() => false) } catch (error) { missing = error.message }
  T(`${UNIT}: on Windows a shim with no npx-cli.js beside it stops the read with the shim named`, /npx is the command shim C:\\Program Files\\nodejs\\npx\.cmd/.test(missing ?? ""), String(missing))
  let absent = null
  try { pullfrogListCommand(SLUG, {}, { platform: "win32", resolveTarget: () => null }) } catch (error) { absent = error.message }
  T(`${UNIT}: on Windows no npx on PATH stops the read with a named cause`, /no npx on PATH/.test(absent ?? ""), String(absent))
  same(`${UNIT}: PULLFROG_BIN names the CLI itself and takes the listing arguments only`, pullfrogListCommand(SLUG, { PULLFROG_BIN: "/stub/pullfrog" }),
    { command: "/stub/pullfrog", args: ["config", "list", "--repo", SLUG] })
}
