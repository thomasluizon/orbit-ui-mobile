import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { styles } from './styles'
import type { Tokens } from './types'

export function PlanSummaryCard({
  planLabel,
  facts = [],
  body,
  badges,
  tokens,
}: Readonly<{
  planLabel: string
  facts?: (string | null)[]
  body?: string
  badges?: ReactNode
  tokens: Tokens
}>) {
  return (
    <View style={[styles.billingCard, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Text accessibilityRole="header" style={[styles.billingHeading, { color: tokens.fg1 }]}>{planLabel}</Text>
        {badges}
      </View>
      {body ? <Text style={[styles.billingBody, { color: tokens.fg2 }]}>{body}</Text> : null}
      {facts.some(Boolean) ? <View style={{ gap: 4 }}>
        {facts.filter((fact): fact is string => Boolean(fact)).map((fact) => <Text key={fact} style={[styles.billingMeta, { color: tokens.fg2 }]}>{fact}</Text>)}
      </View> : null}
    </View>
  )
}
