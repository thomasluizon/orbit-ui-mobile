import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { createAstraAllowanceTranslator } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'

export function useAstraAllowanceCopy() {
  const { t, i18n } = useTranslation()
  const { profile } = useProfile()
  return useMemo(() => createAstraAllowanceTranslator(t, profile, i18n.language), [t, profile, i18n.language])
}
