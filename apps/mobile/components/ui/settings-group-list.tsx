import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { SettingsGroupProps } from '@orbit/shared/contracts/lists'
import { ChevronRight } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function SettingsGroup({ items }: Readonly<SettingsGroupProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return (
    <View style={[styles.panel, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
      {items.map((item, index) => {
        const content = (
          <>
            <Text style={[styles.label, { color: tokens.fg1 }]}>{item.label}</Text>
            {item.value ? <Text style={[styles.value, { color: tokens.fg3 }]}>{item.value}</Text> : null}
            {item.trailing}
            {item.onClick ? <ChevronRight size={24} color={tokens.fg4} strokeWidth={1.8} /> : null}
          </>
        )
        const rowStyle = [styles.row, index === 0 ? null : { borderTopColor: tokens.hairline, borderTopWidth: StyleSheet.hairlineWidth }]
        return item.onClick ? (
          <Pressable key={`${item.label}-${index}`} accessibilityRole="button" accessibilityLabel={item.label} onPress={item.onClick} style={({ pressed }) => [...rowStyle, pressed ? { backgroundColor: tokens.bgHover } : null]}>{content}</Pressable>
        ) : (
          <View key={`${item.label}-${index}`} style={rowStyle}>{content}</View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { minHeight: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { flex: 1, minWidth: 0, fontFamily: 'Geist_400Regular', fontSize: 16 },
  value: { fontFamily: 'GeistMono_400Regular', fontSize: 13, fontVariant: ['tabular-nums'] },
})
