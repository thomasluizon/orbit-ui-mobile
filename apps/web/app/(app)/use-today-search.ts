'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useUIStore } from '@/stores/ui-store'

export interface TodaySearch {
  localSearchQuery: string
  searchOpen: boolean
  setLocalSearchQuery: (value: string) => void
  toggleSearch: () => void
}

/**
 * Owns Today's search box: the local input value, its open/closed state, and the
 * debounced commit into the shared UI store. Pure extraction of TodayPage.
 */
export function useTodaySearch(): TodaySearch {
  const searchQueryStore = useUIStore((s) => s.searchQuery)
  const setSearchQuery = useUIStore((s) => s.setSearchQuery)

  const [localSearchQuery, setLocalSearchQuery] = useState(searchQueryStore)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (searchDebounceTimer.current) clearTimeout(searchDebounceTimer.current)
    searchDebounceTimer.current = setTimeout(() => {
      setSearchQuery(localSearchQuery)
    }, 300)
    return () => {
      if (searchDebounceTimer.current) clearTimeout(searchDebounceTimer.current)
    }
  }, [localSearchQuery, setSearchQuery])

  const toggleSearch = useCallback(() => {
    setSearchOpen((open) => {
      if (open && localSearchQuery) {
        setLocalSearchQuery('')
      }
      return !open
    })
  }, [localSearchQuery])

  return { localSearchQuery, searchOpen, setLocalSearchQuery, toggleSearch }
}
