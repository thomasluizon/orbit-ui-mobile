import { type ComponentType, useMemo } from 'react'
import { Pressable, StyleSheet, Text, View, type ColorValue } from 'react-native'
import { useTranslation } from 'react-i18next'
import { CalendarDays, ChartLine, Home, User } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export type BottomTabId = 'hoje' | 'calendario' | 'progresso' | 'perfil'

type IconComponent = ComponentType<{
  size?: number
  color?: ColorValue
  strokeWidth?: number
}>

interface BottomTabBarProps {
  active: BottomTabId | null
  onTab: (id: BottomTabId) => void
}

interface TabDefinition {
  id: BottomTabId
  labelKey: string
  Icon: IconComponent
}

const TABS: readonly TabDefinition[] = [
  { id: 'hoje', labelKey: 'nav.today', Icon: Home },
  { id: 'calendario', labelKey: 'nav.calendar', Icon: CalendarDays },
  { id: 'progresso', labelKey: 'nav.progress', Icon: ChartLine },
  { id: 'perfil', labelKey: 'nav.profile', Icon: User },
]

export function BottomTabBar({ active, onTab }: Readonly<BottomTabBarProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const { t } = useTranslation()

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('nav.mainNavigation')}
      style={[styles.container, { backgroundColor: tokens.bg }]}
    >
      {TABS.map((tab) => {
        const activeTab = tab.id === active
        const iconColor = activeTab ? tokens.primary : tokens.fg4
        const labelColor = activeTab ? tokens.primarySoft : tokens.fg3
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityLabel={t(tab.labelKey)}
            accessibilityState={{ selected: activeTab }}
            onPress={() => onTab(tab.id)}
            style={({ pressed }) => [styles.tab, pressed ? styles.pressed : null]}
          >
            <tab.Icon
              size={24}
              color={iconColor}
              strokeWidth={activeTab ? 2 : 1.5}
            />
            <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
              {t(tab.labelKey)}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 56,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
    height: 44,
    justifyContent: 'center',
    minWidth: 0,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
  label: {
    fontFamily: 'Geist_500Medium',
    fontSize: 12,
  },
})
