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
    "apps/mobile/components/ui/confirm-sheet.tsx": "import { Sheet } from '@/components/ui/sheet'\nexport function ConfirmSheet() { return <Sheet /> }\n",
    "apps/mobile/components/preferences/frequency-field.tsx": "import { ConfirmSheet } from '@/components/ui/confirm-sheet'\nexport function FrequencyField() { return <ConfirmSheet /> }\n",
    "apps/mobile/modules/orbit-widget/android/src/main/res/layout/widget_layout.xml": "<FrameLayout />\n",
    "apps/mobile/modules/orbit-widget/android/build/generated/widget.xml": "<Generated />\n",
    "apps/mobile/modules/orbit-widget/android/.gradle/cache.bin": "generated\n",
    "apps/mobile/modules/orbit-widget/android/.cxx/debug/generated.ninja": "generated\n",
    ".gitignore": "apps/mobile/modules/*/android/local.properties\n",
  }
  for (const [relativePath, body] of Object.entries(files)) write(join(repository.path, relativePath), body)
  repository.git(["add", ...Object.keys(files)])
  repository.git(["commit", "-q", "-m", "surface fixture"])

  // Android Studio writes this file on first open, so it exists only on a developer machine. A
  // manifest that counts it disagrees with the CI regeneration over a file that is not in git, and
  // the drift gate then goes red on a change nobody can reproduce.
  //
  // What excludes it is that it is UNTRACKED, not that .gitignore names it: `git ls-files` reads
  // the index and never consults ignore rules. The fixture .gitignore staged above therefore
  // changes no outcome here and is present only to mirror the real repository. Do not read this
  // case as proof the generator honours .gitignore and replace `git ls-files` with
  // `git check-ignore`, which would stop excluding an untracked file nothing ignores.
  write(join(repository.path, "apps/mobile/modules/orbit-widget/android/local.properties"), "sdk.dir=/opt/android-sdk\n")

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
  // The wrapper is named from OVERLAY_BASES rather than invented: a caller imports the wrapper and
  // never `sheet`, and isOverlaySource is direct-import only, so the base list is the only thing
  // that keeps that caller in the inventory. A fixture wrapper the real tree does not have would
  // test nothing, which is what the retired `selection-field` entry had become.
  T("a caller reaching Sheet only through a listed wrapper is inventoried", ids.has("m-overlay-preferences-frequency-field"))
  T("web and mobile not-found surfaces are inventoried", ids.has("not-found-root") && ids.has("m-not-found-root"))
  T("web and mobile error surfaces are inventoried", ids.has("error-chat") && ids.has("m-error-root"))
  T("the Next root-layout global error is inventoried", surfaces.some((surface) => surface.surfaceId === "error-global" && surface.sourceFile === "apps/web/app/global-error.tsx"))
  T("the Android widget is an authoritative surface", ids.has("m-widget-orbit-widget"))
  const widget = surfaces.find((surface) => surface.surfaceId === "m-widget-orbit-widget")
  T("Android widget ownership excludes generated build trees", widget?.ownedFiles.every((path) => !/\/android\/(?:build|\.gradle|\.cxx)\//.test(path)), JSON.stringify(widget?.ownedFiles))
  T(
    "Android widget ownership excludes an untracked developer file",
    widget?.ownedFiles.every((path) => !path.endsWith("/local.properties")),
    JSON.stringify(widget?.ownedFiles),
  )
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

  const manifestPath = join(repository.path, ".claude", "manifests", "surfaces.json")
  const checkOptions = { cwd: repository.path, env: { ORBIT_SURFACE_ROOT: repository.path } }
  // A pinned baseline, not "HEAD": the real repository pins 7d7c42c3, so baselineSha is a constant
  // there. A fixture that kept the symbolic ref would move its own baseline on the next commit and
  // report that as drift.
  const baseline = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repository.path, encoding: "utf8" }).stdout.trim()
  const checkArgs = ["--baseline", baseline, "--check"]

  // The property every drift assertion below rests on: the generator is a function of the tree and
  // this machine. A generator that answers differently twice over one unchanged tree turns the gate
  // into a coin toss, and no amount of drift coverage would show it. Two runs on ONE machine cannot
  // see the cross-platform class, where the two runs differ by path separator rather than by tree;
  // `chatBlockEntries` carries that one, and its own comment names the condition.
  //
  // Both exit codes are asserted because the generator writes nothing on a non-zero exit. Without
  // them a second run that crashed would leave the first run's bytes on disk and the byte
  // comparison would pass, so the single assertion the drift gate rests on would go green on a
  // dead process.
  const firstDerivation = run("surface-manifest.mjs", ["--baseline", baseline], checkOptions)
  T("the first determinism run writes a manifest", firstDerivation.status === 0, firstDerivation.stderr)
  const firstWrite = readFileSync(manifestPath, "utf8")
  const secondDerivation = run("surface-manifest.mjs", ["--baseline", baseline], checkOptions)
  T("the second determinism run writes a manifest", secondDerivation.status === 0, secondDerivation.stderr)
  T("two runs over one unchanged tree write the same bytes", readFileSync(manifestPath, "utf8") === firstWrite)

  const fresh = run("surface-manifest.mjs", checkArgs, checkOptions)
  T("--check accepts a manifest generated from the same tree", fresh.status === 0, fresh.stderr)

  // The exclusion this mode is built on: a manifest can never name the commit that carries it,
  // so a moved HEAD alone is not drift. Without this, every correct manifest would fail.
  write(join(repository.path, "notes.md"), "no surface changes here\n")
  repository.git(["add", "notes.md"])
  repository.git(["commit", "-q", "-m", "a commit that moves no surface"])
  const movedHead = run("surface-manifest.mjs", checkArgs, checkOptions)
  const staleGeneratedFrom = JSON.parse(readFileSync(manifestPath, "utf8")).generatedFrom
  T(
    "--check ignores a generatedFrom that the carrying commit could not have known",
    movedHead.status === 0 && staleGeneratedFrom !== spawnSync("git", ["rev-parse", "HEAD"], { cwd: repository.path, encoding: "utf8" }).stdout.trim(),
    movedHead.stderr,
  )

  write(join(repository.path, "apps/web/app/(app)/progress/page.tsx"), "export default function Progress() { return null }\n")
  const before = readFileSync(manifestPath, "utf8")
  const added = run("surface-manifest.mjs", checkArgs, checkOptions)
  T(
    "--check exits 1 and names a surface the tree gained after generation",
    added.status === 1 && added.stderr.includes("route-progress"),
    added.stderr,
  )
  T("a failing --check repairs nothing it was asked to report", readFileSync(manifestPath, "utf8") === before)

  const drifted = JSON.parse(before)
  const ownershipCell = drifted.cells.find((cell) => cell.surfaceId === "route-root")
  ownershipCell.ownedFiles = [...ownershipCell.ownedFiles, "apps/web/app/(app)/invented.tsx"]
  writeFileSync(manifestPath, `${JSON.stringify(drifted, null, 2)}\n`)
  const ownershipDrift = run("surface-manifest.mjs", checkArgs, checkOptions)
  T(
    "--check exits 1 when frozen ownership no longer matches the tree",
    ownershipDrift.status === 1 && ownershipDrift.stderr.includes("route-root"),
    ownershipDrift.stderr,
  )

  const rejected = run("surface-manifest.mjs", ["--check", "--json"], checkOptions)
  T("--check and --json are refused rather than silently ordered", rejected.status === 2, rejected.stderr)
}
