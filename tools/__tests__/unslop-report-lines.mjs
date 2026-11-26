import { readFileSync } from "node:fs"
import { join } from "node:path"

import { REPO_ROOT, T } from "./_harness.mjs"

const EN_JSON = "packages/shared/src/i18n/en.json"

/** The key name that a line of en.json defines, or "" when the line is not a key line. */
const keyOfLine = (line) => /^\s*"([^"]+)"\s*:/.exec(line ?? "")?.[1] ?? ""

/** A key in backticks, dotted or bare, with `*` as a wildcard. Returns one regular expression for each segment. */
const segmentPatterns = (bullet) =>
  [...bullet.matchAll(/`([A-Za-z0-9_*]+(?:\.[A-Za-z0-9_*]+)*)`/g)]
    .flatMap((match) => match[1].split("."))
    .map((segment) => new RegExp(`^${segment.replace(/\*/g, ".*")}$`))

export const cases = () => {
  const report = readFileSync(join(REPO_ROOT, "design/unslop-ui-report.md"), "utf8").split("\n")
  const locale = readFileSync(join(REPO_ROOT, EN_JSON), "utf8").split("\n")
  let checked = 0
  for (const bullet of report) {
    const patterns = segmentPatterns(bullet)
    const cites = [
      ...[...bullet.matchAll(/en\.json:(\d+)/g)].map((match) => Number(match[1])),
      ...[...bullet.matchAll(/en\.json[^\n]*?\bat line (\d+)/g)].map((match) => Number(match[1])),
    ]
    for (const lineNumber of cites) {
      checked++
      const name = keyOfLine(locale[lineNumber - 1])
      T(
        `report cites en.json:${lineNumber} where the key of the bullet is defined`,
        name !== "" && patterns.some((pattern) => pattern.test(name)),
        `en.json line ${lineNumber} is ${JSON.stringify(locale[lineNumber - 1]?.trim())}, which no key of this bullet names: ${bullet.slice(0, 120)}`,
      )
    }
  }
  T("the report cites at least one en.json line", checked > 0, "no en.json:N citation found")
}
