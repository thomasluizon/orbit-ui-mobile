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
    "apps/web/app/(chat)/chat/page.tsx": "import { MessageBubble } from '@/components/chat/message-bubble'\nexport default function Page() { return <MessageBubble /> }\n",
    "apps/web/app/(chat)/error.tsx": "export default function ErrorScreen() { return null }\n",
    "apps/web/app/(app)/explore/page.tsx": "export default function Page() { return null }\n",
    "apps/web/app/(app)/insights/page.tsx": "export default function Page() { return null }\n",
    "apps/web/app/not-found.tsx": "export default function NotFound() { return null }\n",
    "apps/web/components/chat/message-bubble.tsx": "import { PendingOperationCard } from './pending-operation-card'\nexport function MessageBubble() { return <PendingOperationCard /> }\n",
    "apps/web/components/chat/pending-operation-card.tsx": "export function PendingOperationCard() { return null }\n",
    "apps/mobile/app/chat.tsx": "import { PendingOperationCard } from '@/components/chat/pending-operation-card'\nexport default function Chat() { return <PendingOperationCard /> }\n",
    "apps/mobile/app/preferences.tsx": "export default function Preferences() { return null }\n",
    "apps/mobile/app/preferences-sections.tsx": "export function PreferencesSections() { return null }\n",
    "apps/mobile/app/+not-found.tsx": "export default function NotFound() { return null }\n",
    "apps/mobile/components/chat/pending-operation-card.tsx": "export function PendingOperationCard() { return null }\n",
    "apps/mobile/components/ui/app-error-boundary.tsx": "export function AppErrorBoundary() { return null }\n",
    "apps/mobile/components/bottom-sheet-modal.tsx": "import { Modal } from 'react-native'\nexport function BottomSheetModal() { return <Modal /> }\n",
    "apps/mobile/components/preferences/picker.tsx": "import { BottomSheetModal } from '@/components/bottom-sheet-modal'\nexport function Picker() { return <BottomSheetModal /> }\n",
    "apps/mobile/modules/orbit-widget/android/src/main/res/layout/widget_layout.xml": "<FrameLayout />\n",
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
  T("mobile section files without a default export are not routes", !ids.has("m-route-preferences-sections"))
  T("mobile default-export screens remain routes", ids.has("m-route-preferences"))
  T("mobile aliases resolve inside the mobile app for overlays", ids.has("m-overlay-preferences-picker"))
  T("web and mobile not-found surfaces are inventoried", ids.has("not-found-root") && ids.has("m-not-found-root"))
  T("web and mobile error surfaces are inventoried", ids.has("error-chat") && ids.has("m-error-root"))
  T("the Android widget is an authoritative surface", ids.has("m-widget-orbit-widget"))
  T("web chat blocks are visible under route-chat", surfaces.some((surface) => surface.surfaceId === "block-chat-pending-operation-card" && surface.parentSurfaceId === "route-chat"))
  T("mobile chat blocks are visible under m-route-chat", surfaces.some((surface) => surface.surfaceId === "m-block-chat-pending-operation-card" && surface.parentSurfaceId === "m-route-chat"))
  T(
    "web-only routes carry an explicit counterpart reason",
    ["route-explore", "route-insights"].every((surfaceId) => surfaces.find((surface) => surface.surfaceId === surfaceId)?.counterpart?.status === "web-only"),
  )
  T("the fixture commit remains the generated manifest source", manifest.generatedFrom === spawnSync("git", ["rev-parse", "HEAD"], { cwd: repository.path, encoding: "utf8" }).stdout.trim())
}
