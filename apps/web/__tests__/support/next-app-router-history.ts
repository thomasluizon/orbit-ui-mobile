import { vi } from 'vitest'
import { flushSync } from 'react-dom'
import { startTransition } from 'react'

type NextHistoryEntry = {
  __NA?: boolean
  _N?: boolean
  __PRIVATE_NEXTJS_INTERNALS_TREE?: unknown
}

export function patchNextAppRouterHistory({ deferRestoration = false }: { deferRestoration?: boolean } = {}) {
  const pushState = history.pushState.bind(history)
  const replaceState = history.replaceState.bind(history)
  const writes = { pushState: vi.fn(pushState), replaceState: vi.fn(replaceState) }
  const restoreUrl = vi.fn()
  let currentRouterState: unknown
  const restoreTraversal = vi.fn<(href: string, routerState: unknown) => void>()
  function onPopState(event: PopStateEvent) {
    const entry = event.state as NextHistoryEntry | null
    if (!entry?.__NA) return
    currentRouterState = entry.__PRIVATE_NEXTJS_INTERNALS_TREE ?? currentRouterState
    const restore = () => restoreTraversal(location.href, currentRouterState)
    if (deferRestoration) startTransition(restore)
    else flushSync(restore)
  }
  window.addEventListener('popstate', onPopState, true)
  for (const method of ['pushState', 'replaceState'] as const) {
    history[method] = (entry: NextHistoryEntry | null, title, href) => {
      if (entry?.__NA || entry?._N) {
        if (entry.__PRIVATE_NEXTJS_INTERNALS_TREE) currentRouterState = entry.__PRIVATE_NEXTJS_INTERNALS_TREE
        return writes[method](entry, title, href)
      }
      const nextEntry = entry ?? {}
      const current = history.state as NextHistoryEntry | null
      if (current?.__NA) nextEntry.__NA = current.__NA
      if (current?.__PRIVATE_NEXTJS_INTERNALS_TREE) nextEntry.__PRIVATE_NEXTJS_INTERNALS_TREE = current.__PRIVATE_NEXTJS_INTERNALS_TREE
      if (href) restoreUrl(href)
      return writes[method](nextEntry, title, href)
    }
  }
  history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: ['', {}], renderedSearch: '' } }, '', location.href)
  return {
    writes,
    restoreUrl,
    restoreTraversal,
    restore: () => {
      history.pushState = pushState
      history.replaceState = replaceState
      window.removeEventListener('popstate', onPopState, true)
    },
  }
}
