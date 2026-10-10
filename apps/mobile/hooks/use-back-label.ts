import { useRootNavigationState } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { getBackLabel } from '@orbit/shared/utils/back-label'
import { getBackDestination } from '@/lib/back-destination'

export function useBackLabel(fallbackRoute: string): string {
  const state = useRootNavigationState()
  const { t } = useTranslation()
  return getBackLabel(getBackDestination(state) ?? fallbackRoute, t)
}
