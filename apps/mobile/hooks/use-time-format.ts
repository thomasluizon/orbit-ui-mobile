import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { formatLocaleTime } from '@orbit/shared/utils'

export function useTimeFormat() {
  const { i18n } = useTranslation()

  const displayTime = useCallback(
    (time: string | null | undefined): string => {
      if (!time) return ''
      return formatLocaleTime(time, i18n.language)
    },
    [i18n.language],
  )

  return useMemo(
    () => ({ displayTime, locale: i18n.language }),
    [displayTime, i18n.language],
  )
}
