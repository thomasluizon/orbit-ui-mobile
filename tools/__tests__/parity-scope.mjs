import { parityExemptPattern, parityExemptTerms, parityPlatform } from "../lib/parity-scope.mjs"
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
  for (const term of parityExemptTerms) T(`parity pattern accepts ${term}`, parityExemptPattern.test(`Adapter: ${term}.`))
  T("parity pattern accepts a different letter case", parityExemptPattern.test("a SIDEBAR difference"))
  T("parity pattern rejects a paraphrase", !parityExemptPattern.test("Web proxy adapter: mobile has no tunnel route."))
}
