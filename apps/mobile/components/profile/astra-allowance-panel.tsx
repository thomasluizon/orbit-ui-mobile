import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { Profile } from '@orbit/shared/types/profile'
import { PillButton } from '@/components/ui/pill-button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface AstraAllowancePanelProps {
  profile: Profile
  onPlanAction: () => void
}

export function AstraAllowancePanel({
  profile,
  onPlanAction,
}: Readonly<AstraAllowancePanelProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const isPro = profile.hasProAccess
  const isSpent = profile.aiMessagesLimit > 0
    && profile.aiMessagesUsed >= profile.aiMessagesLimit
  const actionLabel = isPro
    ? t('profile.allowance.manageSubscription')
    : t('profile.allowance.seePro')
  const planLabel = isPro
    ? t('profile.allowance.pro')
    : t('profile.allowance.free')

  return (
    <View
      testID="astra-allowance-panel"
      style={[
        styles.panel,
        { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: tokens.fg1 }]}>
          {t('profile.allowance.title')}
        </Text>
        <Text style={[styles.usage, { color: tokens.fg3 }]}>
          {t('profile.allowance.usage', {
            used: profile.aiMessagesUsed,
            limit: profile.aiMessagesLimit,
          })}
        </Text>
      </View>
      <ProgressBar
        value={profile.aiMessagesUsed}
        max={profile.aiMessagesLimit}
        label={t('profile.allowance.title')}
      />
      {isSpent ? (
        <Text style={[styles.spent, { color: tokens.fg3 }]}>
          {t('profile.allowance.spent')}
        </Text>
      ) : null}
      <View style={styles.planRow}>
        <Text style={[styles.planLabel, { color: tokens.fg3 }]}>
          {t('profile.allowance.plan')}
        </Text>
        <Text style={[styles.planValue, { color: tokens.fg2 }]}>
          {planLabel}
        </Text>
      </View>
      <View style={styles.actionRow}>
        <PillButton
          variant="ghost"
          size="sm"
          onClick={onPlanAction}
          accessibleName={actionLabel}
        >
          {actionLabel}
        </PillButton>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    gap: 12,
    padding: 16,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  header: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  title: {
    minWidth: 0,
    flex: 1,
    fontFamily: 'Geist_400Regular',
    fontSize: 17,
    lineHeight: 23.8,
  },
  usage: {
    flexShrink: 0,
    fontFamily: 'GeistMono_400Regular',
    fontSize: 12,
    lineHeight: 16.8,
    fontVariant: ['tabular-nums'],
  },
  spent: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  planLabel: {
    minWidth: 0,
    flex: 1,
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
  },
  planValue: {
    flexShrink: 0,
    fontFamily: 'GeistMono_400Regular',
    fontSize: 12,
  },
  actionRow: {
    flexDirection: 'row',
  },
})
