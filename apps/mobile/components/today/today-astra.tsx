import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import type { ComposerProps, ComposerSuggestions } from '@orbit/shared/contracts/composer'
import { getReturningDays, selectNewestUnreadProactiveCheckin, shouldShowTodayAstraLine } from '@orbit/shared/utils'
import { useChatComposer } from '@/hooks/use-chat-composer'
import { useStreakInfo } from '@/hooks/use-gamification'
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
  today: string
  isTodaySelected: boolean
  suppressed: boolean
}

export function TodayAstra({ today, isTodaySelected, suppressed }: Readonly<TodayAstraProps>) {
  const { t } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const offline = useOffline()
  const chat = useChatComposer({ isOnline: offline.isOnline, offlineTitle: t('chat.offline.title') })
  const streak = useStreakInfo(isTodaySelected)
  const { profile, isPending: profilePending, isError: profileError } = useProfile()
  const { notifications } = useNotifications()
  const markRead = useMarkNotificationRead()
  const setConversationOpen = useUIStore((state) => state.setAstraConversationOpen)
  const setDraft = useChatStore((state) => state.setDraft)
  const returningDays = getReturningDays([streak.data?.lastActiveDate], today)
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
      ? { text: proactive.body, action: t('todayAstra.openConversation'), conversation: true }
      : returningDays !== null
        ? { text: t('todayAstra.returning', { days: returningDays }), action: t('todayAstra.openProgress'), conversation: false }
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
            if (line.conversation) {
              if (proactive) markRead.mutate(proactive.id)
              setConversationOpen(true)
            } else {
              router.push('/progress')
            }
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
