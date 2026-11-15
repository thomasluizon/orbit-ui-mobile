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

  for (const gradientFunction of [
    "linear-gradient",
    "radial-gradient",
    "conic-gradient",
    "repeating-linear-gradient",
    "repeating-radial-gradient",
    "repeating-conic-gradient",
  ]) {
    const repository = stageRepository(gradientFunction, {
      "apps/web/page.tsx": `export const wash = '${gradientFunction}(red, transparent)'\n`,
    })
    check(
      "check-gradients.mjs",
      `rejects ${gradientFunction}`,
      ["--root", repository],
      { status: 1, stderr: /apps\/web\/page\.tsx:1: decorative gradient function/ },
    )
  }

  for (const primitive of ["LinearGradient", "RadialGradient"]) {
    const repository = stageRepository(primitive, {
      "apps/mobile/screen.tsx":
        `import { ${primitive} } from 'react-native-svg'\nexport const Screen = ${primitive}\n`,
    })
    check(
      "check-gradients.mjs",
      `rejects ${primitive}`,
      ["--root", repository],
      { status: 1, stderr: new RegExp(`${primitive} rendering primitive`) },
    )
  }

  for (const primitive of ["linearGradient", "radialGradient"]) {
    const repository = stageRepository(primitive, {
      "apps/web/page.tsx":
        `export const Page = () => <svg><${primitive} id="wash" /></svg>\n`,
    })
    check(
      "check-gradients.mjs",
      `rejects intrinsic ${primitive}`,
      ["--root", repository],
      { status: 1, stderr: new RegExp(`${primitive} rendering primitive`) },
    )
  }

  const expoImport = stageRepository("expo-import", {
    "apps/mobile/screen.tsx": "import { LinearGradient } from 'expo-linear-gradient'\nexport const Screen = LinearGradient\n",
  })
  check(
    "check-gradients.mjs",
    "rejects the retired expo gradient package",
    ["--root", expoImport],
    { status: 1, stderr: /expo-linear-gradient import/ },
  )

  const agendaFunctional = stageRepository("agenda-functional", {
    "apps/web/components/calendar/calendar-agenda-view.tsx":
      "export const pane = {\n  backgroundImage: 'linear-gradient(var(--bg-card), var(--bg-card))',\n}\nexport const lines =\n  'repeating-linear-gradient(to bottom, var(--hairline) 0, var(--hairline) 1px, transparent 1px, transparent ' +\n  '56px)'\n",
  })
  check(
    "check-gradients.mjs",
    "accepts the agenda functional allowances",
    ["--root", agendaFunctional],
    { status: 0, stdout: /Gradient guard passed/ },
  )

  for (const [label, css, expected] of [
    ["a rotation keyframe", "@keyframes busy-ring {\n  to { transform: rotate(360deg); }\n}\n", /apps\/web\/app\/globals\.css:1: spinner keyframes "busy-ring"/],
    ["a rotate property keyframe", "@keyframes wheel { from { rotate: 0deg; } to { rotate: 1turn; } }\n", /apps\/web\/app\/globals\.css:1: spinner keyframes "wheel"/],
    ["a keyframe named spin", "@keyframes spin { 50% { opacity: 0.5; } }\n", /apps\/web\/app\/globals\.css:1: spinner keyframes "spin"/],
    ["an animation that runs the spin keyframes", ".ring {\n  animation: spin 1s linear infinite;\n}\n", /apps\/web\/app\/globals\.css:2: spinner animation/],
  ]) {
    const repository = stageRepository(`spinner-${label.replaceAll(" ", "-")}`, { "apps/web/app/globals.css": css })
    check("check-gradients.mjs", `rejects ${label}`, ["--root", repository], { status: 1, stderr: expected })
  }

  const loopsWithoutRotation = stageRepository("loops-without-rotation", {
    "apps/web/app/globals.css": "@keyframes skeleton-pulse { 50% { opacity: 0.55; } }\n.skeleton-pulse { animation: skeleton-pulse 1.1s ease-in-out infinite; }\n@keyframes chevron-open { to { transform: rotate(180deg); } }\n.spinner-free { animation: chevron-open 0.2s; }\n",
  })
  check(
    "check-gradients.mjs",
    "accepts an opacity loop and a partial rotation",
    ["--root", loopsWithoutRotation],
    { status: 0, stdout: /Gradient guard passed/ },
  )

  const timeGridFunctional = stageRepository("time-grid-functional", {
    "apps/web/components/calendar/calendar-time-grid.tsx":
      "export const pane = {\n  backgroundImage: 'linear-gradient(var(--bg-card), var(--bg-card))',\n}\nexport const lines =\n  'repeating-linear-gradient(to bottom, var(--hairline) 0, var(--hairline) 1px, transparent 1px, transparent ' +\n  '56px)'\n",
  })
  check(
    "check-gradients.mjs",
    "accepts the time grid functional allowances",
    ["--root", timeGridFunctional],
    { status: 0, stdout: /Gradient guard passed/ },
  )
}
