import { SHELL_CONTENT_MAX_WIDTH } from '@orbit/shared/theme'
import type { TabBarProps } from '@orbit/shared/contracts/navigation'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function BottomTabBar({ items, activeId, onSelect, label }: Readonly<TabBarProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { fontScale } = useWindowDimensions()
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const activeIndex = items.findIndex((item) => item.id === activeId)
  return (
    <View testID="bottom-tab-destinations" accessibilityRole="tablist" accessibilityLabel={label} style={[styles.container, { backgroundColor: tokens.bg, borderTopColor: tokens.hairline }]}>
      {items.map((item, index) => {
        const active = index === activeIndex
        return (
          <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label}
            accessibilityState={{ selected: active }} testID={`tab-${item.id}-${active ? 'current' : 'inactive'}`}
            onPress={() => onSelect(item.id)} onFocus={() => setFocusedId(item.id)} onBlur={() => setFocusedId(null)}
            style={[styles.tab, { minWidth: 80 * fontScale }, focusedId === item.id && { outlineWidth: 2, outlineStyle: 'solid', outlineColor: tokens.primary, outlineOffset: -2 }]}>
            {({ pressed }) => <>
              {item.icon ? <View testID={`tab-indicator-${item.id}`} style={[styles.indicator, pressed && { backgroundColor: tokens.bgHover }]}>{item.icon({ active })}</View> : null}
              <Text style={[styles.label, { color: active ? tokens.primarySoft : tokens.fg3 }]}>{item.label}</Text>
            </>}
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'stretch', alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', minHeight: 80, borderTopWidth: 1, maxWidth: SHELL_CONTENT_MAX_WIDTH, width: '100%' },
  tab: { alignItems: 'center', flexGrow: 1, flexBasis: 0, gap: 4, minHeight: 48, justifyContent: 'center', paddingVertical: 12 },
  indicator: { width: 56, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 999, overflow: 'hidden' },
  label: { fontFamily: 'Geist_500Medium', fontSize: 12, lineHeight: 16 },
})
