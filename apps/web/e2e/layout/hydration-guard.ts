import type { Page } from '@playwright/test'

const HYDRATION_TIMEOUT_MS = 15_000

export interface ProbedFiber {
  tag: number
  memoizedState: unknown
  child: ProbedFiber | null
  sibling: ProbedFiber | null
}

interface ProbedFiberRoot {
  current: ProbedFiber
}

interface HydrationProbeWindow {
  __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown
  __orbitLayoutFullyHydrated?: boolean
}

/**
 * Counts the server-rendered boundaries React has not hydrated yet: a HostRoot (tag 3) whose state has
 * `isDehydrated`, and a Suspense (tag 13) or Activity (tag 31) fiber whose state holds a `dehydrated` instance.
 * Tags and fields come from next/dist/compiled/react-dom/cjs/react-dom-client.production.js. The function is
 * serialized into the init script, so it must not read anything outside its own body.
 */
export function countDehydratedBoundaries(rootFiber: ProbedFiber): number {
  const HOST_ROOT = 3
  const SUSPENSE_COMPONENT = 13
  const ACTIVITY_COMPONENT = 31
  let dehydratedCount = 0
  const pending: ProbedFiber[] = [rootFiber]
  while (pending.length > 0) {
    const fiber = pending.pop() as ProbedFiber
    const state = fiber.memoizedState as { isDehydrated?: unknown, dehydrated?: unknown } | null
    if (fiber.tag === HOST_ROOT && state !== null && state.isDehydrated === true) dehydratedCount += 1
    if ((fiber.tag === SUSPENSE_COMPONENT || fiber.tag === ACTIVITY_COMPONENT) && state !== null
      && state.dehydrated !== null && state.dehydrated !== undefined) dehydratedCount += 1
    if (fiber.child !== null) pending.push(fiber.child)
    if (fiber.sibling !== null) pending.push(fiber.sibling)
  }
  return dehydratedCount
}

/**
 * Installs a minimal React DevTools hook. React injects into it when its client bundle loads and calls
 * `onCommitFiberRoot` after every commit; the first commit with no dehydrated boundary marks the page hydrated.
 * React injects only when `supportsFiber` is set and `isDisabled` is falsy, and it checks `typeof` before it calls
 * any other hook method, so the hook holds only `supportsFiber`, `inject` and `onCommitFiberRoot`.
 */
function installHydrationProbe(countDehydrated: (rootFiber: ProbedFiber) => number) {
  const probeWindow = window as unknown as HydrationProbeWindow
  let rendererCount = 0
  probeWindow.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    inject() {
      rendererCount += 1
      return rendererCount
    },
    onCommitFiberRoot(_rendererId: number, root: ProbedFiberRoot) {
      if (probeWindow.__orbitLayoutFullyHydrated !== true && countDehydrated(root.current) === 0) {
        probeWindow.__orbitLayoutFullyHydrated = true
      }
    },
  }
}

export const hydrationProbeScript = `(${installHydrationProbe.toString()})(${countDehydratedBoundaries.toString()})`

/**
 * Playwright clicks server HTML before React attaches a handler, and the click is lost. A root-only check is not
 * enough: `hydrateRoot` sets `__reactContainer$` on `document` while a Suspense boundary is still dehydrated, its
 * client chunk is not loaded, and the first click on a control inside it is lost. This waits until a commit shows
 * no dehydrated boundary.
 */
export async function waitForFullHydration(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as HydrationProbeWindow).__orbitLayoutFullyHydrated === true,
    undefined,
    { timeout: HYDRATION_TIMEOUT_MS },
  )
}

export async function openTodayListOptions(page: Page, label: string) {
  await page.locator('[data-shell-header] [data-today-header-actions]')
    .getByRole('button', { name: label, exact: true }).click()
}

export function assertNoHydrationErrors(messages: readonly string[]) {
  const errors = messages.filter((message) =>
    /Minified React error #418\b|react\.dev\/errors\/418\b|Hydration failed because|A tree hydrated but/.test(message))
  if (errors.length > 0) throw new Error(`Layout hydration mismatch:\n${errors.join('\n')}`)
}
