import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { check, root } from "./_harness.mjs"

const stageRepository = (label, files) => {
  const repository = join(root, "gradient-guard", label)
  mkdirSync(join(repository, "apps", "web"), { recursive: true })
  mkdirSync(join(repository, "apps", "mobile"), { recursive: true })
  for (const [path, content] of Object.entries(files)) {
    const target = join(repository, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  return repository
}

export const cases = () => {
  const clean = stageRepository("clean", {
    "apps/web/page.tsx": "export const Page = () => <main style={{ background: 'var(--bg)' }} />\n",
    "apps/mobile/screen.tsx": "export const Screen = () => null\n",
  })
  check(
    "check-gradients.mjs",
    "accepts flat application surfaces",
    ["--root", clean],
    { status: 0, stdout: /Gradient guard passed/ },
  )

  const webWash = stageRepository("web-wash", {
    "apps/web/page.tsx": "export const wash = 'linear-gradient(red, transparent)'\n",
  })
  check(
    "check-gradients.mjs",
    "rejects a web linear gradient",
    ["--root", webWash],
    { status: 1, stderr: /apps\/web\/page\.tsx:1: decorative gradient function/ },
  )

  const mobileWash = stageRepository("mobile-wash", {
    "apps/mobile/screen.tsx": "export const wash = 'radial-gradient(red, transparent)'\n",
  })
  check(
    "check-gradients.mjs",
    "rejects a mobile radial gradient",
    ["--root", mobileWash],
    { status: 1, stderr: /apps\/mobile\/screen\.tsx:1: decorative gradient function/ },
  )

  const expoImport = stageRepository("expo-import", {
    "apps/mobile/screen.tsx": "import { LinearGradient } from 'expo-linear-gradient'\nexport const Screen = LinearGradient\n",
  })
  check(
    "check-gradients.mjs",
    "rejects expo LinearGradient outside the loading indicator",
    ["--root", expoImport],
    { status: 1, stderr: /expo-linear-gradient import outside the loading indicator/ },
  )

  const functional = stageRepository("functional", {
    "apps/web/app/globals.css": ".ring {\n  mask: radial-gradient(transparent 58%, black 60%);\n}\n",
    "apps/web/components/calendar/calendar-agenda-view.tsx":
      "export const lines =\n  'repeating-linear-gradient(to bottom, var(--hairline) 0, var(--hairline) 1px, transparent 1px, transparent ' +\n  '56px)'\n",
    "apps/mobile/app/(tabs)/calendar/_components/calendar-loading-bar.tsx":
      "import { LinearGradient } from 'expo-linear-gradient'\nexport const CalendarLoadingBar = LinearGradient\n",
    "apps/mobile/test-mocks/react-native-svg.ts": "export const LinearGradient = () => null\n",
  })
  check(
    "check-gradients.mjs",
    "accepts the explicit functional allowlist",
    ["--root", functional],
    { status: 0, stdout: /Gradient guard passed/ },
  )
}
