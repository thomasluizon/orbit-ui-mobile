import { Text, View } from 'react-native'
import { Lock } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { tintFromPrimary } from '@/lib/theme'
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
          { backgroundColor: tintFromPrimary(tokens, 0.16) },
        ]}
      >
        <Lock size={30} color={tokens.primarySoft} strokeWidth={1.8} />
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
