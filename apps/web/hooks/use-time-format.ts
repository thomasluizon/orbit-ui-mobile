'use client'

import { useCallback, useMemo } from 'react'
import { useLocale } from 'next-intl'
import { formatLocaleTime } from '@orbit/shared/utils'

export function useTimeFormat() {
  const locale = useLocale()

  const displayTime = useCallback(
    (time: string | null | undefined): string => {
      if (!time) return ''
      return formatLocaleTime(time, locale)
    },
    [locale],
  )

  return useMemo(() => ({ displayTime }), [displayTime])
}
