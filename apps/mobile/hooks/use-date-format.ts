import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { createLocaleDateFormatters } from '@orbit/shared/hooks'

export function useDateFormat() {
  const { i18n } = useTranslation()
  return useMemo(() => createLocaleDateFormatters(i18n.language), [i18n.language])
}
