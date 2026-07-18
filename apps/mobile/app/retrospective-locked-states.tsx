import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/ui/empty-state'
import { Lock } from '@/components/ui/icons'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { styles, type Tokens } from './retrospective-styles'

interface RetrospectiveLockedYearlyProps {
  tokens: Tokens
  isTrialActive: boolean
  isOnline: boolean
  portalError: string
  onSubscribe: () => void
  onOpenPortal: () => void
}

export function RetrospectiveLockedYearly({
  tokens,
  isTrialActive,
  isOnline,
  portalError,
  onSubscribe,
  onOpenPortal,
}: Readonly<RetrospectiveLockedYearlyProps>) {
  const { t } = useTranslation()
  const action = isTrialActive
    ? { label: t('upgrade.subscribe'), onPress: onSubscribe }
    : { label: t('retrospective.changePlan'), onPress: onOpenPortal, disabled: !isOnline }

  return (
    <EmptyState
      icon={Lock}
      title={t('retrospective.lockedYearly')}
      description={t('retrospective.lockedYearlyHint')}
      action={action}
      footer={
        <>
          {isOnline ? null : (
            <OfflineUnavailableState
              title={t('offline.title')}
              description={t('offline.description')}
              compact
            />
          )}
          {portalError ? (
            <Text style={[styles.statusError, { color: tokens.statusBadText }]}>{portalError}</Text>
          ) : null}
        </>
      }
    />
  )
}
