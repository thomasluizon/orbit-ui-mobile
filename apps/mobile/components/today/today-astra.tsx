import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  selectNewestUnreadProactiveCheckin,
  shouldShowTodayAstraLine,
} from '@orbit/shared/utils'
import { useMarkNotificationRead, useNotifications } from '@/hooks/use-notifications'
import { useOffline } from '@/hooks/use-offline'
import { useProfile } from '@/hooks/use-profile'
import { useUIStore } from '@/stores/ui-store'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface TodayAstraProps {
  isTodaySelected: boolean
  suppressed: boolean
}

export function TodayAstra({ isTodaySelected, suppressed }: Readonly<TodayAstraProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const [actionPressed, setActionPressed] = useState(false)
  const offline = useOffline()
  const { profile } = useProfile()
  const { notifications } = useNotifications()
  const markRead = useMarkNotificationRead()
  const setConversationOpen = useUIStore((state) => state.setAstraConversationOpen)
  const proactive = selectNewestUnreadProactiveCheckin(notifications)
  const atMessageLimit = profile != null && profile.aiMessagesUsed >= profile.aiMessagesLimit

  const line = shouldShowTodayAstraLine({ isTodaySelected, inDrillOrSurface: suppressed, isOnline: offline.isOnline, atLimit: atMessageLimit })
    ? proactive
      ? { text: proactive.body, action: t('todayAstra.openConversation'), notificationId: proactive.id }
      : null
    : null
  if (!line) return null

  return (
    <View style={styles.line}>
      <AstraGlyph size={20} color={tokens.fg3} />
      <Text style={[styles.text, { color: tokens.fg2 }]}>
        {line.text}{' '}
        <Text
          accessibilityRole="link"
          style={[
            styles.action,
            actionPressed ? { backgroundColor: tokens.bgHover, color: tokens.fg1 } : null,
          ]}
          onPressIn={() => setActionPressed(true)}
          onPressOut={() => setActionPressed(false)}
          onPress={() => {
            markRead.mutate(line.notificationId)
            setConversationOpen(true)
          }}
        >
          {line.action}
        </Text>
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  line: { minHeight: 42, flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8 },
  text: { minWidth: 0, flex: 1, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
  action: { textDecorationLine: 'underline' },
})
