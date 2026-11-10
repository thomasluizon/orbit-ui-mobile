import { parityPlatform } from "../lib/parity-scope.mjs"
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
}
