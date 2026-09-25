'use client'

import { useEffect, useState } from 'react'
import { useAccountScopedState } from './use-session-reset'
import { useSearchHabits } from './use-habit-queries'

export function useHabitSearch() {
  /**
   * The typed text, the committed query and the page are the render source for the search box and
   * its results. The command palette unmounts this hook when it closes, but the `/search` route
   * mounts it for as long as the route is open, so an account replacement there leaves the next
   * account reading the previous one's search and refetching it under a new cookie. `showLoading`
   * stays a plain `useState`, because the effect below rewrites it from `busy` on the same render.
   */
  const [text, setText] = useAccountScopedState('')
  const [query, setQuery] = useAccountScopedState('')
  const [page, setPage] = useAccountScopedState(1)
  const [showLoading, setShowLoading] = useState(false)
  const response = useSearchHabits({ search: query, page, pageSize: 20 })
  const busy = text.trim() !== query || response.isFetching || response.isPending

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 300)
    return () => clearTimeout(timer)
  }, [setQuery, text])

  useEffect(() => {
    const timer = setTimeout(() => setShowLoading(busy), busy ? 300 : 0)
    return () => clearTimeout(timer)
  }, [busy])

  function changeText(value: string) {
    setText(value)
    setPage(1)
  }

  return { ...response, text, query, page, setPage, changeText, busy, showLoading: busy && showLoading }
}
