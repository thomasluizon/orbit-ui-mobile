import { Text, View } from 'react-native'
import { Lock } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { PillButton } from '@/components/ui/pill-button'
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
  return (
    <View style={styles.lockedBlock}>
      <View
        style={[
          styles.lockedIconCircle,
          { backgroundColor: tokens.bgField },
        ]}
      >
        <Lock size={28} color={tokens.fg3} strokeWidth={1.4} />
      </View>
      <Text style={[styles.lockedTitle, { color: tokens.fg1 }]}>
        {t('retrospective.lockedYearly')}
      </Text>
      <Text style={[styles.lockedDescription, { color: tokens.fg3 }]}>
        {t('retrospective.lockedYearlyHint')}
      </Text>
      {isTrialActive ? (
        <PillButton
          onPress={onSubscribe}
          accessibilityLabel={t('upgrade.subscribe')}
          style={styles.lockedCta}
        >
          {t('upgrade.subscribe')}
        </PillButton>
      ) : (
        <PillButton
          onPress={onOpenPortal}
          disabled={!isOnline}
          accessibilityLabel={t('retrospective.changePlan')}
          style={styles.lockedCta}
        >
          {t('retrospective.changePlan')}
        </PillButton>
      )}
      {!isOnline ? (
        <OfflineUnavailableState
          title={t('offline.title')}
          description={t('offline.description')}
          compact
        />
      ) : null}
      {portalError ? (
        <Text style={[styles.statusError, { color: tokens.statusBad }]}>
          {portalError}
        </Text>
      ) : null}
    </View>
  )
}
