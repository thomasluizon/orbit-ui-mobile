import { Pressable, StyleSheet, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export interface SectionHeadTab<T extends string = string> {
  id: T
  label: string
  /** When true the tab is rendered but routes to upgrade on press. */
  locked?: boolean
}

interface SectionHeadTabsProps<T extends string = string> {
  tabs: readonly SectionHeadTab<T>[]
  active: T
  onChange: (id: T) => void
}

/**
 * Tab bar that spreads each option proportionally across the row (Today /
 * All / General / Goals). Each tab is `flex: 1` so the row fills the canvas
 * width with equal slots. Active tab fills bg-elev with a stronger inset ring.
 */
export function SectionHeadTabs<T extends string = string>({
  tabs,
  active,
  onChange,
}: Readonly<SectionHeadTabsProps<T>>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View style={styles.wrap}>
      {tabs.map((tab) => {
        const isActive = tab.id === active
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: isActive }}
            style={[
              styles.tab,
              {
                backgroundColor: isActive ? tokens.bgElev : 'transparent',
                borderColor: isActive ? tokens.fg3 : tokens.hairlineStrong,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                {
                  color: isActive ? tokens.fg1 : tokens.fg2,
                  fontWeight: isActive ? '600' : '500',
                },
              ]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
  },
  tab: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  label: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
  },
})
