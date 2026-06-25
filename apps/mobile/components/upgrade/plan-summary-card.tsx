import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { styles } from './styles'
import type { Tokens, UpgradeTextFn } from './types'

export function PlanSummaryCard({
  planLabel,
  meta,
  badges,
  t,
  tokens,
}: Readonly<{
  planLabel: string
  meta?: string
  badges?: ReactNode
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  return (
    <View style={[styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
      <Text style={[styles.cardLabel, { color: tokens.fg3 }]}>
        {t('upgrade.billing.plan.title')}
      </Text>
      <View style={styles.cardValueRow}>
        <Text style={[styles.cardValue, { color: tokens.fg1 }]}>{planLabel}</Text>
        {badges}
      </View>
      {meta ? (
        <Text style={[styles.cardMeta, { color: tokens.fg3 }]}>{meta}</Text>
      ) : null}
    </View>
  )
}
