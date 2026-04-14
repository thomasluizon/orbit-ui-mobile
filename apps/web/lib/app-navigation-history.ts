interface AppNavigationHistoryState {
  entries: string[]
  index: number
}

export type AppNavigationAction = 'init' | 'push' | 'replace' | 'pop'

const APP_NAVIGATION_HISTORY_STORAGE_KEY = 'orbit-app-navigation-history'
const MAX_APP_NAVIGATION_ENTRIES = 50

function createEmptyState(): AppNavigationHistoryState {
  return {
    entries: [],
    index: -1,
  }
}

function canUseSessionStorage(): boolean {
  return globalThis.sessionStorage !== undefined
}

function normalizeState(state: AppNavigationHistoryState): AppNavigationHistoryState {
  if (state.entries.length === 0) {
    return createEmptyState()
  }

  const normalizedIndex = Math.min(Math.max(state.index, 0), state.entries.length - 1)

  return {
    entries: state.entries,
    index: normalizedIndex,
  }
}

function trimState(state: AppNavigationHistoryState): AppNavigationHistoryState {
  if (state.entries.length <= MAX_APP_NAVIGATION_ENTRIES) {
    return normalizeState(state)
  }

  const overflow = state.entries.length - MAX_APP_NAVIGATION_ENTRIES

  return normalizeState({
    entries: state.entries.slice(overflow),
    index: state.index - overflow,
  })
}

export function readAppNavigationHistory(): AppNavigationHistoryState {
  if (!canUseSessionStorage()) {
    return createEmptyState()
  }

  try {
    const stored = globalThis.sessionStorage.getItem(APP_NAVIGATION_HISTORY_STORAGE_KEY)
    if (!stored) {
      return createEmptyState()
    }

    const parsed = JSON.parse(stored) as Partial<AppNavigationHistoryState>
    if (!Array.isArray(parsed.entries) || typeof parsed.index !== 'number') {
      return createEmptyState()
    }

    const entries = parsed.entries.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    return normalizeState({
      entries,
      index: parsed.index,
    })
  } catch {
    return createEmptyState()
  }
}

function writeAppNavigationHistory(state: AppNavigationHistoryState): void {
  if (!canUseSessionStorage()) return

  try {
    globalThis.sessionStorage.setItem(
      APP_NAVIGATION_HISTORY_STORAGE_KEY,
      JSON.stringify(trimState(state)),
    )
  } catch {
    // Session storage is a best-effort navigation hint only.
  }
}

export function createAppNavigationEntry(pathname: string, search: string): string {
  return search.length > 0 ? `${pathname}?${search}` : pathname
}

export function updateAppNavigationHistory(nextEntry: string, action: AppNavigationAction): void {
  const currentState = readAppNavigationHistory()

  if (action === 'init' || currentState.entries.length === 0 || currentState.index < 0) {
    writeAppNavigationHistory({
      entries: [nextEntry],
      index: 0,
    })
    return
  }

  if (action === 'replace') {
    const nextEntries = [...currentState.entries]
    nextEntries[currentState.index] = nextEntry
    writeAppNavigationHistory({
      entries: nextEntries,
      index: currentState.index,
    })
    return
  }

  if (action === 'push') {
    if (currentState.entries[currentState.index] === nextEntry) {
      return
    }

    const nextEntries = currentState.entries.slice(0, currentState.index + 1)
    nextEntries.push(nextEntry)

    writeAppNavigationHistory({
      entries: nextEntries,
      index: nextEntries.length - 1,
    })
    return
  }

  if (currentState.entries[currentState.index - 1] === nextEntry) {
    writeAppNavigationHistory({
      entries: currentState.entries,
      index: currentState.index - 1,
    })
    return
  }

  if (currentState.entries[currentState.index + 1] === nextEntry) {
    writeAppNavigationHistory({
      entries: currentState.entries,
      index: currentState.index + 1,
    })
    return
  }

  const existingIndex = currentState.entries.lastIndexOf(nextEntry)
  if (existingIndex >= 0) {
    writeAppNavigationHistory({
      entries: currentState.entries,
      index: existingIndex,
    })
    return
  }

  const nextEntries = currentState.entries.slice(0, currentState.index + 1)
  nextEntries.push(nextEntry)

  writeAppNavigationHistory({
    entries: nextEntries,
    index: nextEntries.length - 1,
  })
}

export function canGoBackInAppHistory(): boolean {
  return readAppNavigationHistory().index > 0
}
