import { Fragment, type ComponentType } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import {
  CalendarDays,
  Home,
  type LucideProps,
  MessageCircle,
  Plus,
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
  { id: 'chat', labelKey: 'nav.astra', Icon: MessageCircle, emphasize: true },
  { id: 'calendar', labelKey: 'nav.calendar', Icon: CalendarDays },
  { id: 'profile', labelKey: 'nav.you', Icon: User },
]

/** v8 bottom navigation: 4 tabs + centered Plus FAB; FAB auto-hides on the Astra and Profile tabs. */
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

  const fabVisible = showFab && active !== 'chat'
  const fabDisabled = active !== 'today'

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
          onPress={fabDisabled ? undefined : onFab}
          disabled={fabDisabled}
          accessibilityRole="button"
          accessibilityLabel={t('nav.create')}
          accessibilityState={{ disabled: fabDisabled }}
          style={[
            styles.fab,
            {
              backgroundColor: fabDisabled ? tokens.bgElev : tokens.primary,
              shadowColor: tokens.bg,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 1,
              shadowRadius: 5,
              elevation: fabDisabled ? 0 : 6,
            },
          ]}
        >
          <View
            style={[
              styles.fabRing,
              { borderColor: tokens.bg },
            ]}
          />
          {fabDisabled ? (
            <View
              style={[
                styles.fabDisabledInnerRing,
                { borderColor: tokens.hairline },
              ]}
            />
          ) : null}
          <Plus
            size={24}
            color={fabDisabled ? tokens.fg3 : tokens.fgOnPrimary}
            strokeWidth={1.7}
          />
        </Pressable>
      ) : null}

      <View style={styles.tabsRow}>
        {TABS.map((tab, index) => {
          const isActive = tab.id === active
          return (
            <Fragment key={tab.id}>
              <View style={styles.tabSlot}>
                <TabButton
                  tab={tab}
                  label={t(tab.labelKey)}
                  isActive={isActive}
                  tokens={tokens}
                  onPress={() => onTab(tab.id)}
                  showUnread={tab.id === 'chat' && astraUnread}
                />
              </View>
              {index === 1 ? <View style={styles.fabGap} /> : null}
            </Fragment>
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
        <tab.Icon size={24} color={iconColor} strokeWidth={1.6} />
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
    top: -14,
    marginLeft: -28,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  fabRing: {
    position: 'absolute',
    top: -5,
    left: -5,
    right: -5,
    bottom: -5,
    borderRadius: 33,
    borderWidth: 5,
  },
  fabDisabledInnerRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingTop: 14,
    paddingBottom: 16,
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
    paddingVertical: 8,
    alignItems: 'center',
    position: 'relative',
  },
  activeIndicator: {
    position: 'absolute',
    top: -2,
    width: 16,
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
})
