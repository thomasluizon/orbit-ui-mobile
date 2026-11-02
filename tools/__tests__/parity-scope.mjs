import { parityPlatform } from "../lib/parity-scope.mjs"
import { T } from "./_harness.mjs"

export const cases = () => {
  for (const platform of ["web", "mobile"]) {
    for (const directory of ["app", "components", "hooks", "stores", "lib"]) {
      T(`parity path ${platform}/${directory}`, parityPlatform(`apps/${platform}/${directory}/file.ts`) === platform)
    }
  }
  T("tooling does not require application parity", parityPlatform("tools/check.mjs") === undefined)
}
