import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ComposerProps, ComposerSuggestions } from '@orbit/shared/contracts/composer'
import {
  selectNewestUnreadProactiveCheckin,
  shouldShowTodayAstraLine,
} from '@orbit/shared/utils'
import { useChatComposer } from '@/hooks/use-chat-composer'
import { useMarkNotificationRead, useNotifications } from '@/hooks/use-notifications'
import { useOffline } from '@/hooks/use-offline'
import { useProfile } from '@/hooks/use-profile'
import { useUIStore } from '@/stores/ui-store'
import { useChatStore } from '@/stores/chat-store'
import { useShellComposerSlot } from '@/components/shell/shell-composer-slot'
import { Composer } from '@/components/shell/composer'
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
  const offline = useOffline()
  const chat = useChatComposer({ isOnline: offline.isOnline, offlineTitle: t('chat.offline.title') })
  const { profile, isPending: profilePending, isError: profileError } = useProfile()
  const { notifications } = useNotifications()
  const markRead = useMarkNotificationRead()
  const setConversationOpen = useUIStore((state) => state.setAstraConversationOpen)
  const setDraft = useChatStore((state) => state.setDraft)
  const proactive = selectNewestUnreadProactiveCheckin(notifications)
  const createSentence = t('todayAstra.createSentence')
  const makeSuggestion = (id: string, label: string) => ({
    id,
    label,
    onSelect: () => {
      setDraft(label)
      setConversationOpen(true)
    },
  })
  const suggestions: ComposerSuggestions | null = profilePending || profileError || !profile
    ? null
    : [
        makeSuggestion('create-habit', createSentence),
        makeSuggestion('starter-1', chat.starterChips[0] ?? createSentence),
        makeSuggestion('starter-2', chat.starterChips[1] ?? createSentence),
        makeSuggestion('starter-3', chat.starterChips[2] ?? createSentence),
      ]

  let composerProps: ComposerProps = {
    ...chat.composerProps,
    suggestions: suggestions ?? chat.composerProps.suggestions,
    onOpenConversation: () => setConversationOpen(true),
    conversationLabel: t('todayAstra.openConversation'),
  }
  if (!offline.isOnline) {
    composerProps = { ...composerProps, state: 'offline', limitReason: t('todayAstra.offline') } as ComposerProps
  }
  useShellComposerSlot(!suppressed && suggestions !== null, <Composer {...composerProps} />)

  const line = shouldShowTodayAstraLine({ isTodaySelected, inDrillOrSurface: suppressed, isOnline: offline.isOnline, atLimit: chat.atMessageLimit })
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
          style={styles.action}
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
