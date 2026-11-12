import { parityExemptionJustified, parityExemptTerms, parityPlatform } from "../lib/parity-scope.mjs"
import { T } from "./_harness.mjs"

export const cases = () => {
  for (const platform of ["web", "mobile"]) {
    for (const directory of ["app", "components", "hooks", "stores", "lib"]) {
      T(`parity path ${platform}/${directory}`, parityPlatform(`apps/${platform}/${directory}/file.ts`) === platform)
    }
  }
  T("tooling does not require application parity", parityPlatform("tools/check.mjs") === undefined)
  T("web favicon binary is not a parity change", parityPlatform("apps/web/app/favicon.ico") === undefined)
  T("web apple icon binary is not a parity change", parityPlatform("apps/web/app/apple-icon.png") === undefined)
  T("web manifest route is a web parity change", parityPlatform("apps/web/app/manifest.webmanifest/route.ts") === "web")
  T("web stylesheet is a web parity change", parityPlatform("apps/web/app/globals.css") === "web")
  T("mobile layout source is a mobile parity change", parityPlatform("apps/mobile/app/_layout.tsx") === "mobile")
  T("the accepted parity terms are the approved adapter and layout-shell list", parityExemptTerms.join("|") ===
    "BFF|direct API|cookie|SecureStore|shadcn|StyleSheet|next-intl|i18next|Radix Primitives|rn-primitives|navigation chrome|sidebar|tab bar|command palette|keyboard shortcuts|hover affordances")
  for (const term of parityExemptTerms) T(`a parity section naming ${term} is justified`, parityExemptionJustified(`## Parity\n\nAdapter: ${term}.`))
  T("a parity term matches in a different letter case", parityExemptionJustified("## Parity\n\na SIDEBAR difference"))
  T("a parity section with a paraphrase is not justified", !parityExemptionJustified("## Parity\n\nWeb proxy adapter: mobile has no tunnel route."))
  T("a parity heading with a CRLF line ending still opens the section", parityExemptionJustified("## Parity\r\n\r\nBFF vs direct API adapter.\r\n"))
  T("a term under the next heading does not justify an empty parity section",
    !parityExemptionJustified("## Parity\n\n## Test evidence\n\nBFF cookie adapter."))
  T("a term outside any parity section does not justify the exemption", !parityExemptionJustified("## Summary\n\nBFF vs direct API adapter."))
  T("an empty or absent body is not justified", !parityExemptionJustified("") && !parityExemptionJustified(null))
}
