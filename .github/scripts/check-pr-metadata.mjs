import { readFileSync, writeFileSync } from "node:fs"
import { dashFindings } from "../../tools/check-dashes.mjs"

const [metadataPath, bodyPath, flag, changedPaths] = process.argv.slice(2)
if (flag !== "--changed-files-file" || !changedPaths) {
  console.error("usage: check-pr-metadata.mjs <metadata.json> <body.md> --changed-files-file <paths.txt>")
  process.exit(2)
}
const { title, body, labels } = JSON.parse(readFileSync(metadataPath, "utf8"))
const text = body ?? ""
writeFileSync(bodyPath, text)
let failed = false
if (process.env.CHECK_DASHES !== "false" && dashFindings(`${title} ${text}`).length) {
  console.error("::error::The pull request title and body must carry no banned dashes.")
  failed = true
}

const paths = readFileSync(changedPaths, "utf8").split(/\r?\n/)
const web = paths.some((path) => /^apps\/web\/(app|components|hooks|stores|lib)\//.test(path))
const mobile = paths.some((path) => /^apps\/mobile\/(app|components|hooks|stores|lib)\//.test(path))
if (labels.includes("parity:exempt")) {
  const section = text.split(/^## Parity[ \t]*\r?$/m)[1]?.split(/^## /m)[0].trim()
  if (!section || !/platform adapter|layout.shell|BFF|SecureStore|StyleSheet|next-intl|i18next|navigation chrome|sidebar|tab bar|command palette|keyboard shortcuts|hover affordances/i.test(section)) {
    console.error("::error::parity:exempt requires a line under ## Parity naming the platform adapter or permitted layout-shell divergence.")
    failed = true
  }
} else if (web !== mobile) {
  console.error("::error::UI changes must land on both platforms or carry parity:exempt with a justification under ## Parity.")
  failed = true
}
if (failed) process.exitCode = 1
