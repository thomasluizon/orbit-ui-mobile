import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { T, run, stageRepo } from "./_harness.mjs"

function write(path, body) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
}

export async function cases() {
  const repository = stageRepo("surface-manifest")
  T("surface-manifest fixture repository was created", Boolean(repository))
  if (!repository) return

  const files = {
    "apps/web/app/(app)/page.tsx": "export default function TodayPage() { return null }\n",
    "apps/web/app/chat/page.tsx": "export default function ChatRedirect() { return null }\n",
    "apps/web/app/(app)/layout.tsx": "import { MessageBubble } from '@/components/chat/message-bubble'\nimport { Composer } from '@/components/shell/composer'\nexport default function Layout() { return <><MessageBubble /><Composer /></> }\n",
    "apps/web/app/(chat)/error.tsx": "export default function ErrorScreen() { return null }\n",
    "apps/web/app/global-error.tsx": "export default function GlobalError() { return null }\n",
    "apps/web/app/(app)/explore/page.tsx": "export default function Page() { return null }\n",
    "apps/web/app/(app)/insights/page.tsx": "export default function Page() { return null }\n",
    "apps/web/app/not-found.tsx": "export default function NotFound() { return null }\n",
    "apps/web/components/chat/message-bubble.tsx": "import { PendingOperationCard } from './pending-operation-card'\nexport function MessageBubble() { return <PendingOperationCard /> }\n",
    "apps/web/components/chat/pending-operation-card.tsx": "export function PendingOperationCard() { return null }\n",
    "apps/web/components/shell/composer.tsx": "export function Composer() { return null }\n",
    "apps/mobile/app/chat.tsx": "export default function ChatRedirect() { return null }\n",
    "apps/mobile/app/_layout.tsx": "import { PendingOperationCard } from '@/components/chat/pending-operation-card'\nimport { Composer } from '@/components/shell/composer'\nexport default function Layout() { return <><PendingOperationCard /><Composer /></> }\n",
    "apps/mobile/app/preferences.tsx": "export default function Preferences() { return null }\n",
    "apps/mobile/app/preferences-sections.tsx": "export function PreferencesSections() { return null }\n",
    "apps/mobile/app/+not-found.tsx": "export default function NotFound() { return null }\n",
    "apps/mobile/components/chat/pending-operation-card.tsx": "export function PendingOperationCard() { return null }\n",
    "apps/mobile/components/shell/composer.tsx": "export function Composer() { return null }\n",
    "apps/mobile/components/ui/app-error-boundary.tsx": "export function AppErrorBoundary() { return null }\n",
    "apps/mobile/components/ui/sheet.tsx": "import { Modal } from 'react-native'\nexport function Sheet() { return <Modal /> }\n",
    "apps/mobile/components/preferences/picker.tsx": "import { Sheet } from '@/components/ui/sheet'\nexport function Picker() { return <Sheet /> }\n",
    "apps/mobile/components/ui/selection-field.tsx": "import { Sheet } from '@/components/ui/sheet'\nexport function SelectionField() { return <Sheet /> }\n",
    "apps/mobile/components/preferences/frequency-field.tsx": "import { SelectionField } from '@/components/ui/selection-field'\nexport function FrequencyField() { return <SelectionField /> }\n",
    "apps/mobile/modules/orbit-widget/android/src/main/res/layout/widget_layout.xml": "<FrameLayout />\n",
    "apps/mobile/modules/orbit-widget/android/build/generated/widget.xml": "<Generated />\n",
    "apps/mobile/modules/orbit-widget/android/.gradle/cache.bin": "generated\n",
    "apps/mobile/modules/orbit-widget/android/.cxx/debug/generated.ninja": "generated\n",
  }
  for (const [relativePath, body] of Object.entries(files)) write(join(repository.path, relativePath), body)
  repository.git(["add", ...Object.keys(files)])
  repository.git(["commit", "-q", "-m", "surface fixture"])

  const result = run("surface-manifest.mjs", ["--baseline", "HEAD", "--json"], {
    cwd: repository.path,
    env: { ORBIT_SURFACE_ROOT: repository.path },
  })
  T("surface-manifest derives the fixture", result.status === 0, result.stderr)
  if (result.status !== 0) return

  const manifest = JSON.parse(readFileSync(join(repository.path, ".claude", "manifests", "surfaces.json"), "utf8"))
  const surfaces = [...new Map(manifest.cells.map((cell) => [cell.surfaceId, cell])).values()]
  const ids = new Set(surfaces.map((surface) => surface.surfaceId))
  T(
    "the web root is inventoried without the retired tab-view module",
    surfaces.some((surface) => surface.surfaceId === "route-root" && surface.kind === "route" && surface.href === "/"),
  )
  T("mobile section files without a default export are not routes", !ids.has("m-route-preferences-sections"))
  T("mobile default-export screens remain routes", ids.has("m-route-preferences"))
  T("mobile aliases resolve inside the mobile app for overlays", ids.has("m-overlay-preferences-picker"))
  T("a caller reaching Sheet only through the selection-field wrapper is inventoried", ids.has("m-overlay-preferences-frequency-field"))
  T("web and mobile not-found surfaces are inventoried", ids.has("not-found-root") && ids.has("m-not-found-root"))
  T("web and mobile error surfaces are inventoried", ids.has("error-chat") && ids.has("m-error-root"))
  T("the Next root-layout global error is inventoried", surfaces.some((surface) => surface.surfaceId === "error-global" && surface.sourceFile === "apps/web/app/global-error.tsx"))
  T("the Android widget is an authoritative surface", ids.has("m-widget-orbit-widget"))
  const widget = surfaces.find((surface) => surface.surfaceId === "m-widget-orbit-widget")
  T("Android widget ownership excludes generated build trees", widget?.ownedFiles.every((path) => !/\/android\/(?:build|\.gradle|\.cxx)\//.test(path)), JSON.stringify(widget?.ownedFiles))
  T("web layout-hosted chat blocks remain visible under the redirect route", surfaces.some((surface) => surface.surfaceId === "block-chat-pending-operation-card" && surface.parentSurfaceId === "route-chat"))
  T("mobile layout-hosted chat blocks remain visible under the redirect route", surfaces.some((surface) => surface.surfaceId === "m-block-chat-pending-operation-card" && surface.parentSurfaceId === "m-route-chat"))
  for (const platform of ["web", "mobile"]) {
    const prefix = platform === "mobile" ? "m-" : ""
    const composerCells = manifest.cells.filter((cell) => cell.surfaceId === `${prefix}block-chat-composer`)
    T(
      `${platform} shell composer contributes all theme and locale cells under the chat route`,
      composerCells.length === 4 && composerCells.every((cell) =>
        cell.sourceFile === `apps/${platform}/components/shell/composer.tsx` &&
        cell.parentSurfaceId === `${prefix}route-chat` && cell.kind === "block"),
      JSON.stringify(composerCells),
    )
  }
  T(
    "web-only routes carry an explicit counterpart reason",
    ["route-explore", "route-insights"].every((surfaceId) => surfaces.find((surface) => surface.surfaceId === surfaceId)?.counterpart?.status === "web-only"),
  )
  T("the fixture commit remains the generated manifest source", manifest.generatedFrom === spawnSync("git", ["rev-parse", "HEAD"], { cwd: repository.path, encoding: "utf8" }).stdout.trim())
}
