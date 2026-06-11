import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Lock } from 'lucide-react-native'
import { createTokensV2, radius, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export interface SectionHeadTab<T extends string = string> {
  id: T
  label: string
  /** When true the tab is rendered with a lock glyph and routes to upgrade on press. */
  locked?: boolean
}

interface SectionHeadTabsProps<T extends string = string> {
  tabs: readonly SectionHeadTab<T>[]
  active: T
  onChange: (id: T) => void
}

/**
 * Kit pill-chip row used as the Today / All / General / Goals view switcher:
 * inactive chips sit on the bg-elev well with a hairline ring, the active chip
 * fills selection-bg with a primary ring and primary text.
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
            hitSlop={{ top: 6, bottom: 6 }}
            style={({ pressed }) => [
              styles.tab,
              {
                backgroundColor: isActive
                  ? tokens.selectionBg
                  : pressed
                    ? tokens.bgElev2
                    : tokens.bgElev,
                borderColor: isActive
                  ? tintFromPrimary(tokens, 0.45)
                  : tokens.hairline,
              },
              pressed && !isActive ? styles.tabPressed : null,
            ]}
          >
            {tab.locked ? (
              <Lock
                size={14}
                color={isActive ? tokens.primarySoft : tokens.fg2}
                strokeWidth={1.8}
              />
            ) : null}
            <Text
              style={[
                styles.label,
                { color: isActive ? tokens.primarySoft : tokens.fg2 },
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
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  tabPressed: {
    transform: [{ scale: 0.96 }],
  },
  label: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
  },
})
