import { readAppNavigationHistory } from '@/lib/app-navigation-history'

type BackNavigation =
  | { kind: 'history'; route: string | undefined }
  | { kind: 'fallback'; route: string }

export function getBackNavigation(fallbackRoute: string): BackNavigation {
  const { entries, index } = readAppNavigationHistory()
  const currentEntry = `${globalThis.location.pathname}${globalThis.location.search}`
  const previousEntry = entries[entries[index] === currentEntry ? index - 1 : index]
  if (previousEntry) return { kind: 'history', route: previousEntry }

  const referrer = globalThis.document.referrer
  const hasSameOriginReferrer = URL.canParse(referrer) && new URL(referrer).origin === globalThis.location.origin
  if (globalThis.history.length > 1 && hasSameOriginReferrer) {
    return { kind: 'history', route: undefined }
  }

  return { kind: 'fallback', route: fallbackRoute }
}
