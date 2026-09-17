import type { TabBarProps } from '@orbit/shared/contracts/navigation'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function BottomTabBar({ items, activeId, onSelect, label }: Readonly<TabBarProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const activeIndex = items.findIndex((item) => item.id === activeId)
  return (
    <View testID="bottom-tab-destinations" accessibilityRole="tablist" accessibilityLabel={label} style={[styles.container, { backgroundColor: tokens.bg, borderTopColor: tokens.hairline }]}>
      {items.map((item, index) => {
        const active = index === activeIndex
        return (
          <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label}
            accessibilityState={{ selected: active }} testID={`tab-${item.id}-${active ? 'current' : 'inactive'}`}
            onPress={() => onSelect(item.id)} style={styles.tab}>
            {({ pressed }) => <>
              {pressed ? <View pointerEvents="none" style={[styles.pressedBackground, { backgroundColor: tokens.bgHover }]} /> : null}
              {item.icon?.({ active })}
              <Text style={[styles.label, { color: active && pressed ? tokens.primaryText : active ? tokens.primarySoft : tokens.fg3 }]} numberOfLines={1}>{item.label}</Text>
            </>}
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', alignSelf: 'center', flexDirection: 'row', height: 56, borderTopWidth: 1, maxWidth: 740, width: '100%' },
  tab: { alignItems: 'center', flex: 1, gap: 4, height: 44, justifyContent: 'center', minWidth: 0 },
  pressedBackground: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  label: { fontFamily: 'Geist_500Medium', fontSize: 12 },
})
