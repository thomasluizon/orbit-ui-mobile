import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import {
  getReturningInterval,
  selectNewestUnreadProactiveCheckin,
  shouldShowTodayAstraLine,
  shouldShowTodayAstraSurface,
} from '@orbit/shared/utils'
import { useMarkNotificationRead, useNotifications } from '@/hooks/use-notifications'
import { useOffline } from '@/hooks/use-offline'
import { useProfile } from '@/hooks/use-profile'
import { useUIStore } from '@/stores/ui-store'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface TodayAstraProps {
  today: string
  isTodaySelected: boolean
  suppressed: boolean
}

export function TodayAstra({ today, isTodaySelected, suppressed }: Readonly<TodayAstraProps>) {
  const { t } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const [pressed, setPressed] = useState(false)
  const offline = useOffline()
  const { profile } = useProfile()
  const { notifications } = useNotifications()
  const markRead = useMarkNotificationRead()
  const setConversationOpen = useUIStore((state) => state.setAstraConversationOpen)
  const atMessageLimit = profile != null && profile.aiMessagesUsed >= profile.aiMessagesLimit
  const returning = getReturningInterval(profile?.lastCompletionDate, profile?.timeZone)
  const proactive = shouldShowTodayAstraLine({ isTodaySelected, inDrillOrSurface: suppressed, isOnline: offline.isOnline, atLimit: atMessageLimit })
    ? selectNewestUnreadProactiveCheckin(notifications, today, profile?.timeZone)
    : null

  const line = shouldShowTodayAstraSurface({ isTodaySelected, inDrillOrSurface: suppressed })
    ? proactive
      ? { text: proactive.body, destination: t('todayAstra.openConversation'), notificationId: proactive.id }
      : returning
        ? {
            text: returning.kind === 'elapsed'
              ? t('todayAstra.returningElapsed', { days: returning.days })
              : t('todayAstra.returningBounded'),
            destination: t('todayAstra.viewProgress'),
            notificationId: null,
          }
        : null
    : null
  if (!line) return null

  return (
    <Pressable
      accessibilityRole={line.notificationId ? 'button' : 'link'}
      accessibilityLabel={line.text}
      accessibilityHint={line.destination}
      style={[styles.line, { backgroundColor: pressed ? tokens.bgHover : tokens.bgWell }]}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        if (line.notificationId) {
          markRead.mutate(line.notificationId)
          setConversationOpen(true)
        } else {
          router.navigate('/progress')
        }
      }}
    >
      <AstraGlyph size={20} color={tokens.fg3} />
      <Text numberOfLines={2} ellipsizeMode="tail" style={[styles.text, { color: tokens.fg2 }]}>
        {line.text}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  line: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  text: { minWidth: 0, flex: 1, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
})
