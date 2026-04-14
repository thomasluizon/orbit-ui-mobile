import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { formatLocaleTime } from '@orbit/shared/utils'

export function useTimeFormat() {
  const { i18n } = useTranslation()
  const locale = i18n.language

  const displayTime = useCallback(
    (time: string | null | undefined): string => {
      if (!time) return ''
      return formatLocaleTime(time, locale)
    },
    [locale],
  )

  return useMemo(() => ({ displayTime }), [displayTime])
}
