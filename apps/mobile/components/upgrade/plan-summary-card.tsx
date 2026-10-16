import { AstraGlyph } from '@/components/ui/astra-glyph'
import type { ReactNode } from 'react'
import { Text, View, useWindowDimensions } from 'react-native'
import { responsiveTypeStyle } from '@/lib/theme'
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
  const { width } = useWindowDimensions()
  return (
    <View style={{ gap: 16, paddingVertical: 16 }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><AstraGlyph size={96} color={tokens.fg1} /></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Text accessibilityRole="header" style={[responsiveTypeStyle('displayHeading', width), { color: tokens.fg1 }]}>{planLabel}</Text>
        {badges}
      </View>
      {body ? <Text style={[styles.billingBody, { color: tokens.fg2 }]}>{body}</Text> : null}
      {facts.some(Boolean) ? <View style={{ gap: 4 }}>
        {facts.filter((fact): fact is string => Boolean(fact)).map((fact) => <Text key={fact} style={[styles.billingMeta, { color: tokens.fg2 }]}>{fact}</Text>)}
      </View> : null}
    </View>
  )
}
