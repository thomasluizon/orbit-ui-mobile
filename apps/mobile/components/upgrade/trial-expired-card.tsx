import { Check, Sparkles } from 'lucide-react-native'
import { Text, View } from 'react-native'
import { TRIAL_EXPIRED_FEATURE_KEYS } from '@orbit/shared/utils/upgrade'
import { styles } from './styles'
import type { Tokens, UpgradeTextFn } from './types'

export function TrialExpiredCard({
  t,
  tokens,
}: Readonly<{
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  return (
    <View
      style={[
        styles.card,
        styles.expiredCard,
        { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
      ]}
    >
      <View style={styles.expiredHeader}>
        <Sparkles size={18} strokeWidth={1.8} color={tokens.primarySoft} />
        <Text style={[styles.expiredTitle, { color: tokens.fg1 }]}>
          {t('trial.expired.title')}
        </Text>
      </View>
      <Text style={[styles.expiredSub, { color: tokens.fg3 }]}>
        {t('trial.expired.dontLose')}
      </Text>
      <View style={styles.expiredList}>
        {TRIAL_EXPIRED_FEATURE_KEYS.map((feature) => (
          <View key={feature} style={styles.featureCheckRow}>
            <Check size={16} strokeWidth={2.4} color={tokens.primarySoft} />
            <Text style={[styles.featureCheckText, { color: tokens.fg2 }]}>
              {t(feature)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}
