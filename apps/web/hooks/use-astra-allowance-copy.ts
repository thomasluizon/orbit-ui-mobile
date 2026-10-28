import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { createAstraAllowanceTranslator } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'

export function useAstraAllowanceCopy() {
  const t = useTranslations()
  const locale = useLocale()
  const { profile } = useProfile()
  return useMemo(() => createAstraAllowanceTranslator(t, profile, locale), [t, profile, locale])
}
