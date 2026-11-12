import { parityExemptionJustified, parityExemptTerms, parityPlatform } from "../../tools/lib/parity-scope.mjs"
import { readFileSync, writeFileSync } from "node:fs"
import { dashFindings } from "../../tools/check-dashes.mjs"
import { attributionFindings } from "../../tools/lib/attribution-lines.mjs"

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
const attribution = attributionFindings("pull request body", text)
if (attribution.length) {
  console.error("::error::The pull request body must carry no co-author trailer and no generated-with line.")
  for (const finding of attribution) console.error(`  ${finding}`)
  failed = true
}

const paths = readFileSync(changedPaths, "utf8").split(/\r?\n/)
const web = paths.some((path) => parityPlatform(path) === "web")
const mobile = paths.some((path) => parityPlatform(path) === "mobile")
const acceptedTerms = `one of these platform adapters or layout-shell divergences: ${parityExemptTerms.join(", ")}`
if (labels.includes("parity:exempt") && (web || mobile)) {
  if (!parityExemptionJustified(text)) {
    console.error(`::error::parity:exempt requires a line under ## Parity that names ${acceptedTerms}.`)
    failed = true
  }
} else if (web !== mobile) {
  console.error(`::error::UI changes must land on both platforms or carry parity:exempt with a line under ## Parity that names ${acceptedTerms}.`)
  failed = true
}
if (failed) process.exitCode = 1
