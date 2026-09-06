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
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={[styles.billingSecondary, { color: tokens.fg2 }]}>
        {t('upgrade.billing.usage.title')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <Text style={[styles.billingSecondary, { color: tokens.fg1 }]}>
          {t('upgrade.billing.usage.aiMessages')}
        </Text>
        <Text
          style={[
            styles.billingMeta,
            { color: tokens.fg3 },
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
