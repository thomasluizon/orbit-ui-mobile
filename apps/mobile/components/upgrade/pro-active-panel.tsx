import { Text, View } from 'react-native'
import { VerifiedBadge } from '@/components/ui/verified-badge'
import { UsageCard } from './usage-card'
import { styles } from './styles'
import type { Tokens, UpgradeTextFn } from './types'

export function ProActivePanel({
  profile,
  usagePercent,
  usageProfile,
  t,
  tokens,
}: Readonly<{
  profile: { isLifetimePro?: boolean } | null
  usagePercent: number
  usageProfile: { aiMessagesUsed: number; aiMessagesLimit: number } | null
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  return (
    <>
      <View style={styles.proPanel}>
        <VerifiedBadge size={84} />
        <Text style={[styles.proPanelTitle, { color: tokens.fg1 }]}>
          {profile?.isLifetimePro
            ? t('upgrade.billing.plan.lifetime')
            : t('upgrade.alreadyPro')}
        </Text>
        <Text style={[styles.proPanelHint, { color: tokens.fg3 }]}>
          {profile?.isLifetimePro
            ? t('upgrade.billing.plan.lifetimeHint')
            : t('upgrade.manageHint')}
        </Text>
      </View>
      <UsageCard
        usagePercent={usagePercent}
        usageUrgent={usagePercent > 80}
        profile={usageProfile}
        t={t}
        tokens={tokens}
      />
    </>
  )
}
