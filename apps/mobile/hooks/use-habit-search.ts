import { useEffect, useState } from 'react'
import { useSearchHabits } from './use-habit-queries'
import { useProfile } from './use-profile'
import { formatAPIDateInTimeZone } from '@orbit/shared/utils'

export function useHabitSearch() {
  const { profile } = useProfile()
  const today = formatAPIDateInTimeZone(new Date(), profile?.timeZone)
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [showLoading, setShowLoading] = useState(false)
  const response = useSearchHabits({ search: query, page, pageSize: 20 })
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

  return { ...response, today, text, query, page, setPage, changeText, busy, showLoading: busy && showLoading }
}
