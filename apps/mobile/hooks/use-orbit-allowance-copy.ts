import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { createOrbitAllowanceTranslator } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'

export function useOrbitAllowanceCopy() {
  const { t, i18n } = useTranslation()
  const { profile } = useProfile()
  return useMemo(() => createOrbitAllowanceTranslator(t, profile, i18n.language), [t, profile, i18n.language])
}
