'use client'

import { useEffect, useState } from 'react'
import { useHabits } from './use-habits'

export function useHabitSearch() {
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [showLoading, setShowLoading] = useState(false)
  const response = useHabits({ search: query, page, pageSize: 20 })
  const busy = text.trim() !== query || response.isFetching || response.isPending

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 300)
    return () => clearTimeout(timer)
  }, [text])

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
