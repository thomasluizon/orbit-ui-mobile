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
import { createTokensV2, primaryGlow } from '@/lib/theme'
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
  /** Force-hide the FAB (also auto-hidden on the Astra tab). */
  showFab?: boolean
}

interface TabDef {
  id: BottomTabId
  labelKey: string
  Icon: LucideIcon
}

const TABS: readonly TabDef[] = [
  { id: 'today', labelKey: 'nav.home', Icon: Home },
  { id: 'chat', labelKey: 'nav.astra', Icon: MessageCircle },
  { id: 'calendar', labelKey: 'nav.calendar', Icon: CalendarDays },
  { id: 'profile', labelKey: 'nav.you', Icon: User },
]

/** Kit bottom navigation: opaque canvas bar with top hairline, 4 labelled tabs
 *  and a centered 60px Plus FAB ringed by the canvas color plus primary glow. */
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
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: fabDisabled ? tokens.bgSheet : tokens.primary },
            fabDisabled ? null : primaryGlow(tokens),
            pressed && !fabDisabled ? styles.fabPressed : null,
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
            size={28}
            color={fabDisabled ? tokens.fg3 : tokens.fgOnPrimary}
            strokeWidth={2.2}
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
  const color = isActive ? tokens.primary : tokens.fg3

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isActive }}
      style={({ pressed }) => [
        styles.tabBtn,
        pressed ? styles.tabBtnPressed : null,
      ]}
    >
      <View style={styles.iconWrap}>
        <tab.Icon size={24} color={color} strokeWidth={isActive ? 2.2 : 1.8} />
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
    borderTopWidth: 1,
  },
  fab: {
    position: 'absolute',
    left: '50%',
    top: -30,
    marginLeft: -30,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  fabPressed: {
    transform: [{ scale: 0.94 }],
  },
  fabRing: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 36,
    borderWidth: 6,
  },
  fabDisabledInnerRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabsRow: {
    flexDirection: 'row',
  },
  tabSlot: {
    flex: 1,
    flexDirection: 'row',
  },
  fabGap: {
    width: 84,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 20,
  },
  tabBtnPressed: {
    opacity: 0.7,
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
