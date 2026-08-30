import { useEffect, useRef, useSyncExternalStore } from 'react'
import { hashKey, type QueryKey } from '@tanstack/query-core'

export type LiveSuggestionQueryKind = 'habits' | 'calendar'

interface RegisteredQueryKey {
  hash: string
  key: QueryKey
}

type LiveSuggestionQuerySnapshot = Record<LiveSuggestionQueryKind, RegisteredQueryKey | null>

let snapshot: LiveSuggestionQuerySnapshot = {
  habits: null,
  calendar: null,
}
const listeners = new Set<() => void>()

function emitChange() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function registerLiveSuggestionQuery(
  kind: LiveSuggestionQueryKind,
  key: QueryKey,
): () => void {
  const hash = hashKey(key)
  snapshot = { ...snapshot, [kind]: { hash, key } }
  emitChange()

  return () => {
    if (snapshot[kind]?.hash !== hash) return
    snapshot = { ...snapshot, [kind]: null }
    emitChange()
  }
}

export function getLiveSuggestionQueryKey(kind: LiveSuggestionQueryKind): QueryKey | null {
  return snapshot[kind]?.key ?? null
}

export function useLiveSuggestionQueryKey(kind: LiveSuggestionQueryKind): QueryKey | null {
  return useSyncExternalStore(
    subscribe,
    () => getLiveSuggestionQueryKey(kind),
    () => null,
  )
}

export function useRegisterLiveSuggestionQuery(
  kind: LiveSuggestionQueryKind,
  key: QueryKey,
): void {
  const keyRef = useRef(key)
  keyRef.current = key
  const hash = hashKey(key)

  useEffect(
    () => registerLiveSuggestionQuery(kind, keyRef.current),
    [hash, kind],
  )
}

export function resetLiveSuggestionQueries(): void {
  snapshot = { habits: null, calendar: null }
  emitChange()
}
