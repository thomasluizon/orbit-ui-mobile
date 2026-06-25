import { Check, X as XIcon } from 'lucide-react-native'
import { Text, View } from 'react-native'
import { UPGRADE_FEATURE_CATEGORIES } from '@orbit/shared/utils/upgrade'
import { primaryGlow, tintFromPrimary } from '@/lib/theme'
import { styles } from './styles'
import type { Tokens, UpgradeTextFn } from './types'

const UPGRADE_FEATURES = UPGRADE_FEATURE_CATEGORIES.flatMap((category) => category.features)

function PlanColumn({
  plan,
  t,
  tokens,
}: Readonly<{
  plan: 'free' | 'pro'
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  const isPro = plan === 'pro'
  return (
    <View
      style={[
        styles.planColumn,
        isPro
          ? [
              styles.planColumnPro,
              primaryGlow(tokens),
              { borderColor: tokens.primary, backgroundColor: tintFromPrimary(tokens, 0.04) },
            ]
          : { borderColor: tokens.hairline, backgroundColor: tokens.bgCard },
      ]}
    >
      <View style={styles.planColumnHeader}>
        <Text style={[styles.planColumnTitle, { color: isPro ? tokens.primarySoft : tokens.fg1 }]}>
          {isPro ? t('common.proBadge') : t('upgrade.free')}
        </Text>
        {isPro ? (
          <View style={[styles.planColumnBadge, { backgroundColor: tintFromPrimary(tokens, 0.16) }]}>
            <Text style={[styles.planColumnBadgeText, { color: tokens.primarySoft }]}>
              {t('upgrade.recommended')}
            </Text>
          </View>
        ) : null}
      </View>
      {UPGRADE_FEATURES.map((feature) => {
        const included =
          feature.type === 'text'
            ? true
            : isPro
              ? !!feature.proEnabled
              : !!feature.freeEnabled
        const text =
          feature.type === 'text'
            ? t(`upgrade.features.${feature.key}.${plan}`)
            : t(`upgrade.features.${feature.key}.label`)
        const textColor = included ? (isPro ? tokens.fg1 : tokens.fg2) : tokens.fg4
        return (
          <View key={feature.key} style={styles.planFeatureRow}>
            {included ? (
              <Check size={15} strokeWidth={2.4} color={isPro ? tokens.primary : tokens.fg3} />
            ) : (
              <XIcon size={15} strokeWidth={1.8} color={tokens.fg4} />
            )}
            <Text style={[styles.planFeatureText, { color: textColor }]} numberOfLines={1}>
              {text}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

export function PlanComparisonCards({
  t,
  tokens,
}: Readonly<{
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  return (
    <View style={styles.comparisonPad}>
      <PlanColumn plan="free" t={t} tokens={tokens} />
      <PlanColumn plan="pro" t={t} tokens={tokens} />
    </View>
  )
}
