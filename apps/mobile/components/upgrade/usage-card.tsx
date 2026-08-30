import { Text, View } from 'react-native'
import { ProgressBar } from '@/components/ui/progress-bar'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { styles } from './styles'
import type { Tokens, UpgradeTextFn } from './types'

export function UsageCard({
  usagePercent,
  usageUrgent,
  profile,
  t,
  tokens,
}: Readonly<{
  usagePercent: number
  usageUrgent: boolean
  profile: { aiMessagesUsed: number; aiMessagesLimit: number } | null
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  return (
    <View style={{ gap: 12 }}>
    <View style={[styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
      <Text style={[styles.cardLabel, { color: tokens.fg3 }]}>
        {t('upgrade.billing.usage.title')}
      </Text>
      <View style={styles.usageRow}>
        <Text style={[styles.usageLabel, { color: tokens.fg1 }]}>
          {t('upgrade.billing.usage.aiMessages')}
        </Text>
        <Text
          style={[
            styles.usageValue,
            { color: usageUrgent ? tokens.statusOverdueText : tokens.fg2 },
          ]}
        >
          {t('upgrade.billing.usage.aiMessagesOf', {
            used: profile?.aiMessagesUsed ?? 0,
            limit: profile?.aiMessagesLimit ?? 0,
          })}
        </Text>
      </View>
      <ProgressBar
        value={usagePercent / 100} max={1}
        label={t('upgrade.billing.usage.aiMessages')}

      />
    </View>
    {usageUrgent ? (
      <CapacityNotice
        message={t('upgrade.billing.usage.nearLimit')}
        body={t('upgrade.billing.usage.nearLimitBody')}
      />
    ) : null}
    </View>
  )
}
