import type { ReactNode } from 'react'
import { View, Text } from 'react-native'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export function CompactFigure({ value, unit }: Readonly<{ value: string | number; unit: string }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <View testID="compact-figure" style={{ minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 }}><Text style={{ fontSize: 22, fontFamily: 'SpaceGrotesk_600SemiBold', fontVariant: ['tabular-nums'], color: tokens.fg1 }}>{value}</Text><Text style={{ fontSize: 14, color: tokens.fg2 }}>{unit}</Text></View>
}

export function FigureList({ children }: Readonly<{ children: ReactNode }>) {
  return <View style={{ minWidth: 0, gap: 8 }}>{children}</View>
}
