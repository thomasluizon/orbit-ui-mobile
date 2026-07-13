'use client'

import { useMemo } from 'react'
import { useLocale } from 'next-intl'
import { createLocaleDateFormatters } from '@orbit/shared/hooks'

export function useDateFormat() {
  const locale = useLocale()
  return useMemo(() => createLocaleDateFormatters(locale), [locale])
}
