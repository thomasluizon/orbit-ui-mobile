import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { styles } from './styles'
import type { Tokens, UpgradeTextFn } from './types'

export function PlanSummaryCard({
  planLabel,
  meta,
  body,
  badges,
  tokens,
}: Readonly<{
  planLabel: string
  meta?: string
  body?: string
  badges?: ReactNode
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  return (
    <View style={[styles.billingCard, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Text style={[styles.billingHeading, { color: tokens.fg1 }]}>{planLabel}</Text>
        {badges}
      </View>
      {body ? <Text style={[styles.billingBody, { color: tokens.fg2 }]}>{body}</Text> : null}
      {meta ? (
        <Text style={[styles.billingMeta, { color: tokens.fg3 }]}>{meta}</Text>
      ) : null}
    </View>
  )
}
