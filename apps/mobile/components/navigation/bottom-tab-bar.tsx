import type { TabBarProps } from '@orbit/shared/contracts/navigation'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function BottomTabBar({ items, activeId, onSelect, label }: Readonly<TabBarProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const activeIndex = items.findIndex((item) => item.id === activeId)
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={[styles.container, { backgroundColor: tokens.bg, borderTopColor: tokens.hairline }]}>
      {items.map((item, index) => {
        const active = index === activeIndex
        return (
          <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label}
            accessibilityState={{ selected: active }} testID={`tab-${item.id}-${active ? 'current' : 'inactive'}`}
            onPress={() => onSelect(item.id)} style={({ pressed }) => [styles.tab, { backgroundColor: pressed ? tokens.bgHover : 'transparent' }]}>
            {item.icon?.({ active })}
            <Text style={[styles.label, { color: active ? tokens.primarySoft : tokens.fg3 }]} numberOfLines={1}>{item.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', flexDirection: 'row', height: 56, borderTopWidth: 1 },
  tab: { alignItems: 'center', flex: 1, gap: 4, height: 44, justifyContent: 'center', minWidth: 0 },
  label: { fontFamily: 'Geist_500Medium', fontSize: 12 },
})
