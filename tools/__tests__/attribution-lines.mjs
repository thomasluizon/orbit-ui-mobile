import { attributionFindings } from "../lib/attribution-lines.mjs"

import { T } from "./_harness.mjs"

const UNIT = "lib/attribution-lines.mjs"

/** Built from parts, so this source file never holds an attribution line of its own. */
const TRAILER = ["Co", "Authored", "By: Claude Opus 5.5 <noreply@anthropic.com>"].join("-")
const GENERATED = `\u{1F916} ${["Generated", "with"].join(" ")} [Claude Code](https://claude.com/claude-code)`

export const cases = () => {
  T(`${UNIT}: a sentence that names both strings has no finding`,
    attributionFindings("body", "Never add a `Co-Authored-By:` trailer or a \"Generated with\" line.").length === 0)
  const trailer = attributionFindings("body", `Work.\r\n\r\n${TRAILER}`)
  T(`${UNIT}: a co-author trailer after CRLF lines names its line`,
    trailer.length === 1 && trailer[0] === `body line 3: a co-author trailer: ${TRAILER}`)
  T(`${UNIT}: an indented trailer in lower case is found`, attributionFindings("body", `  ${TRAILER.toLowerCase()}`).length === 1)
  const generated = attributionFindings("commit abc", GENERATED)
  T(`${UNIT}: a generated-with line after an emoji is found`, generated.length === 1 && generated[0].startsWith("commit abc line 1: a generated-with line"))
  T(`${UNIT}: each attribution line is one finding`, attributionFindings("body", `${TRAILER}\n${GENERATED}\n${TRAILER}`).length === 3)
}
