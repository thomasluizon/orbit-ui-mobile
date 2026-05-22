import type { ComponentType } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  CalendarDays,
  Home,
  type LucideProps,
  Plus,
  Sparkles,
  User,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export type BottomTabId = 'today' | 'chat' | 'calendar' | 'profile'

type LucideIcon = ComponentType<LucideProps>

interface BottomTabBarProps {
  active: BottomTabId
  onTab: (id: BottomTabId) => void
  /** Centered Plus FAB tap handler. */
  onFab?: () => void
  /** Dot on the Astra tab indicating an unread thread. */
  astraUnread?: boolean
  /** Force-hide the FAB (also auto-hidden on Astra/Profile per PRD). */
  showFab?: boolean
}

interface TabDef {
  id: BottomTabId
  labelKey: string
  Icon: LucideIcon
  /** When true the icon turns primary while active (v8 Astra emphasis). */
  emphasize?: boolean
}

const TABS: readonly TabDef[] = [
  { id: 'today', labelKey: 'nav.home', Icon: Home },
  { id: 'chat', labelKey: 'nav.astra', Icon: Sparkles, emphasize: true },
  { id: 'calendar', labelKey: 'nav.calendar', Icon: CalendarDays },
  { id: 'profile', labelKey: 'nav.you', Icon: User },
]

/**
 * v8 bottom navigation: 4 tabs + centered Plus FAB.
 * FAB auto-hides on Astra and Profile tabs (per PRD §8). Astra tab uses
 * Sparkles + primary tint when active to signal AI prominence.
 *
 * NOTE: this component is presentation-only — Phase 3 wires it into expo-router.
 */
export function BottomTabBar({
  active,
  onTab,
  onFab,
  astraUnread = false,
  showFab = true,
}: Readonly<BottomTabBarProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { t } = useTranslation()

  const fabVisible = showFab && active !== 'chat' && active !== 'profile'

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: tokens.bg,
          borderTopColor: tokens.hairline,
        },
      ]}
    >
      {fabVisible ? (
        <Pressable
          onPress={onFab}
          accessibilityRole="button"
          accessibilityLabel={t('nav.create')}
          style={[
            styles.fab,
            {
              backgroundColor: tokens.primary,
              // The 5px outer ring is the v8 "U-notch" trick: a shadow drawn in
              // the background color so the FAB visually punches through the
              // top hairline of the tab bar.
              shadowColor: tokens.bg,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 1,
              shadowRadius: 5,
              elevation: 6,
            },
          ]}
        >
          <View
            style={[
              styles.fabRing,
              { borderColor: tokens.bg },
            ]}
          />
          <Plus
            size={24}
            color={tokens.fgOnPrimary}
            strokeWidth={1.7}
          />
        </Pressable>
      ) : null}

      <View style={styles.tabsRow}>
        {TABS.map((tab, index) => {
          const isActive = tab.id === active
          // Reserve a centered gap for the FAB between tabs[1] and tabs[2].
          const renderGapAfter = index === 1
          return (
            <View key={tab.id} style={styles.tabSlot}>
              <TabButton
                tab={tab}
                label={t(tab.labelKey)}
                isActive={isActive}
                tokens={tokens}
                onPress={() => onTab(tab.id)}
                showUnread={tab.id === 'chat' && astraUnread}
              />
              {renderGapAfter ? <View style={styles.fabGap} /> : null}
            </View>
          )
        })}
      </View>
    </View>
  )
}

function TabButton({
  tab,
  label,
  isActive,
  tokens,
  onPress,
  showUnread,
}: Readonly<{
  tab: TabDef
  label: string
  isActive: boolean
  tokens: ReturnType<typeof createTokensV2>
  onPress: () => void
  showUnread: boolean
}>) {
  const tint = isActive ? tokens.fg1 : tokens.fg3
  const iconColor = tab.emphasize && isActive ? tokens.primary : tint

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isActive }}
      style={styles.tabBtn}
    >
      {isActive ? (
        <View
          style={[
            styles.activeIndicator,
            { backgroundColor: tokens.primary },
          ]}
        />
      ) : null}
      <View style={styles.iconWrap}>
        <tab.Icon size={22} color={iconColor} strokeWidth={1.5} />
        {showUnread ? (
          <View
            style={[
              styles.unreadDot,
              {
                backgroundColor: tokens.primary,
                borderColor: tokens.bg,
              },
            ]}
          />
        ) : null}
      </View>
      <Text
        style={[
          styles.tabLabel,
          {
            color: tint,
            fontWeight: isActive ? '500' : '400',
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  fab: {
    position: 'absolute',
    left: '50%',
    top: -28,
    marginLeft: -28,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  // The 5px outer ring punches through the tab bar top edge.
  fabRing: {
    position: 'absolute',
    top: -5,
    left: -5,
    right: -5,
    bottom: -5,
    borderRadius: 33,
    borderWidth: 5,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingBottom: 10,
  },
  tabSlot: {
    flex: 1,
    flexDirection: 'row',
  },
  fabGap: {
    width: 56,
  },
  tabBtn: {
    flex: 1,
    paddingTop: 4,
    alignItems: 'center',
    gap: 5,
    position: 'relative',
  },
  activeIndicator: {
    position: 'absolute',
    top: -1,
    width: 14,
    height: 2,
    borderRadius: 1,
  },
  iconWrap: {
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -3,
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 2,
  },
  tabLabel: {
    fontFamily: 'Geist',
    fontSize: 11,
    letterSpacing: 0.11,
  },
})
