import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { createOrbitAllowanceTranslator } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'

export function useOrbitAllowanceCopy() {
  const t = useTranslations()
  const locale = useLocale()
  const { profile } = useProfile()
  return useMemo(() => createOrbitAllowanceTranslator(t, profile, locale), [t, profile, locale])
}
