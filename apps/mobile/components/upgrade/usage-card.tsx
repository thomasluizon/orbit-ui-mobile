import { createAstraAllowanceTranslator, type AstraAllowance } from '@orbit/shared/utils'
import { AI_MESSAGE_COUNTER_THRESHOLD } from '@orbit/shared/chat'
import { Text, View } from 'react-native'
import { ProgressBar } from '@/components/ui/progress-bar'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { styles } from './styles'
import type { Tokens, UpgradeTextFn } from './types'

export function UsageCard({
  locale = 'en',
  usagePercent,
  profile,
  t,
  tokens,
}: Readonly<{
  locale?: string
  usagePercent: number
  profile: ({ aiMessagesUsed: number; aiMessagesLimit: number } & AstraAllowance) | null
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  const translate = createAstraAllowanceTranslator(t, profile, locale)
  const remaining = profile ? profile.aiMessagesLimit - profile.aiMessagesUsed : null
  const nearLimit = remaining !== null && remaining <= AI_MESSAGE_COUNTER_THRESHOLD
  return (
    <View style={{ gap: 12 }}>
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={[styles.billingSecondary, { fontFamily: 'Geist_500Medium', color: tokens.fg2 }]}>
        {t('upgrade.billing.usage.title')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <Text style={[styles.billingSecondary, { color: tokens.fg1 }]}>
          {translate('upgrade.billing.usage.aiMessages')}
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
        label={translate('upgrade.billing.usage.aiMessages')}

      />
    </View>
    {profile?.aiMessagesPeriod === 'week' && !nearLimit ? <Text style={[styles.billingSecondary, { color: tokens.fg3 }]}>{translate('shell.composer.limit.renewal')}</Text> : null}
    {nearLimit ? (
      <CapacityNotice
        message={translate(remaining <= 0 ? 'shell.composer.limit.exhausted' : 'upgrade.billing.usage.nearLimit')}
        body={translate('shell.composer.limit.renewal')}
      />
    ) : null}
    </View>
  )
}
