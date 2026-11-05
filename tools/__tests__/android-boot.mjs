import { readFileSync } from "node:fs"
import { join } from "node:path"
import yaml from "js-yaml"
import { fatalLogcat, firstScreenRendered } from "../android-boot.mjs"
import { REPO_ROOT, T } from "./_harness.mjs"

const packageName = "org.useorbit.app"
const labels = ["en", "pt-BR"].map((locale) => JSON.parse(readFileSync(join(REPO_ROOT, "packages/shared/src/i18n", `${locale}.json`), "utf8")).onboarding.flow.what.title)

function hierarchy(text, overrides = {}) {
  const attributes = {
    index: "0", text, "resource-id": "", class: "android.widget.TextView", package: packageName,
    "content-desc": "", checkable: "false", checked: "false", clickable: "false", enabled: "true",
    focusable: "false", focused: "false", scrollable: "false", "long-clickable": "false", password: "false",
    selected: "false", bounds: "[0,100][400,160]", "drawing-order": "1", hint: "", ...overrides,
  }
  return `<?xml version="1.0" encoding="UTF-8"?><hierarchy rotation="0"><node ${Object.entries(attributes).map(([key, value]) => `${key}="${value}"`).join(" ")}/></hierarchy>`
}

export const cases = () => {
  for (const label of labels) T("android-boot: accepts the actual first route title in each locale", firstScreenRendered(hierarchy(label), packageName, labels))
  T("android-boot: accepts an accessibility description", firstScreenRendered(hierarchy("", { "content-desc": labels[0] }), packageName, labels))
  T("android-boot: rejects the splash logo", !firstScreenRendered(hierarchy("Orbit"), packageName, labels))
  T("android-boot: rejects another package's matching title", !firstScreenRendered(hierarchy(labels[0], { package: "com.android.launcher3" }), packageName, labels))
  T("android-boot: rejects zero-area nodes", !firstScreenRendered(hierarchy(labels[0], { bounds: "[0,0][0,0]" }), packageName, labels))
  T("android-boot: rejects disabled nodes", !firstScreenRendered(hierarchy(labels[0], { enabled: "false" }), packageName, labels))
  let malformedRejected = false
  try { firstScreenRendered("<hierarchy><node>", packageName, labels) } catch { malformedRejected = true }
  T("android-boot: rejects incomplete XML", malformedRejected)
  for (const failure of [
    "E AndroidRuntime: FATAL EXCEPTION: mqt_native_modules",
    "E ReactNativeJS: Invariant Violation: Tried to register two views with the same name RNCSafeAreaProvider",
    "E ReactNativeJS: Error: top-level module failed",
    "F libc: Fatal signal 11 (SIGSEGV)",
  ]) T(`android-boot: rejects ${failure}`, fatalLogcat(failure))
  T("android-boot: accepts normal startup logs", !fatalLogcat("I ReactNativeJS: Running application\nI ReactNative: Application context initialized"))

  const workflow = yaml.load(readFileSync(join(REPO_ROOT, ".github/workflows/android-release.yml"), "utf8"))
  const steps = workflow.jobs["release-android"].steps
  const bootIndex = steps.findIndex((step) => step.uses === "./.github/actions/android-boot")
  const uploadIndex = steps.findIndex((step) => step.name === "Submit build to Google Play")
  T("android-release: boot gate must run before Play upload", bootIndex >= 0 && bootIndex < uploadIndex)
  if (bootIndex >= 0) {
    T("android-release: the checked and uploaded AAB are identical", steps[bootIndex].with.aab === steps[uploadIndex].with.releaseFiles)
    T("android-release: boot assertions cannot be skipped or ignored", !steps[bootIndex].if && !steps[bootIndex]["continue-on-error"])
  }
}
