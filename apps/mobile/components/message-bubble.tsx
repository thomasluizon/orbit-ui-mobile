import { useState, useMemo, useEffect, useRef } from 'react'
import { View, Text, Image, StyleSheet, Animated } from 'react-native'
import { Sparkles, User } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { ChatMessage } from '@orbit/shared/types/chat'
import { ActionChips } from '@/components/chat/action-chips'
import { BreakdownSuggestion } from '@/components/chat/breakdown-suggestion'
import { useAppTheme } from '@/lib/use-app-theme'

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
  message: ChatMessage
  onBreakdownConfirmed?: () => void
}

export function MessageBubble({ message, onBreakdownConfirmed }: Readonly<MessageBubbleProps>) {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [dismissedBreakdowns, setDismissedBreakdowns] = useState<Set<string>>(new Set())

  const isUser = message.role === 'user'

  const suggestionActions = useMemo(
    () =>
      message.actions?.filter(
        (a) => a.status === 'Suggestion' && a.suggestedSubHabits?.length,
      ) ?? [],
    [message.actions],
  )

  const nonSuggestionActions = useMemo(
    () => message.actions?.filter((a) => a.status !== 'Suggestion') ?? [],
    [message.actions],
  )

  function dismissBreakdown(key: string) {
    setDismissedBreakdowns((prev) => new Set([...prev, key]))
  }

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.aiContainer]}>
      {/* AI avatar */}
      {!isUser && (
        <View style={styles.aiAvatar}>
          <Sparkles size={20} color={colors.primary} />
        </View>
      )}

      <View
        style={[
          styles.bubbleColumn,
          isUser ? styles.bubbleColumnUser : styles.bubbleColumnAI,
        ]}
      >
        {/* Sender label */}
        <Text style={styles.senderLabel}>
          {isUser ? t('chat.senderYou') : t('chat.senderOrbit')}
        </Text>

        {/* Message bubble */}
        <View
          style={[
            styles.bubble,
            isUser ? styles.userBubble : styles.aiBubble,
          ]}
        >
          {/* Image attachment */}
          {message.imageUrl && (
            <Image
              source={{ uri: message.imageUrl }}
              style={styles.imageAttachment}
              resizeMode="cover"
            />
          )}

          {/* Message text */}
          <Text style={[styles.messageText, isUser && styles.userText]}>
            {message.content}
          </Text>
        </View>

        {/* Action chips for AI messages */}
        {!isUser && nonSuggestionActions.length > 0 && (
          <ActionChips actions={nonSuggestionActions} />
        )}

        {/* Breakdown suggestions */}
        {!isUser && suggestionActions.length > 0 && (
          <View style={styles.breakdownContainer}>
            {suggestionActions.map((action) => {
              const actionKey = action.entityId ?? action.entityName ?? 'suggestion'
              if (dismissedBreakdowns.has(actionKey)) return null
              return (
                <BreakdownSuggestion
                  key={actionKey}
                  parentName={action.entityName || 'Habit'}
                  subHabits={action.suggestedSubHabits ?? []}
                  onConfirmed={() => onBreakdownConfirmed?.()}
                  onCancelled={() => dismissBreakdown(actionKey)}
                />
              )
            })}
          </View>
        )}
      </View>

      {/* User avatar */}
      {isUser && (
        <View style={styles.userAvatar}>
          <User size={20} color={colors.textSecondary} />
        </View>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// TypingIndicator
// ---------------------------------------------------------------------------

function AnimatedDot({ delay }: { delay: number }) {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const opacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 500,
          delay,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    )
    animation.start()
    return () => animation.stop()
  }, [delay, opacity])

  return <Animated.View style={[styles.typingDot, { opacity }]} />
}

export function TypingIndicator() {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  return (
    <View style={[styles.container, styles.aiContainer]}>
      {/* AI avatar */}
      <View style={styles.aiAvatar}>
        <Sparkles size={20} color={colors.primary} />
      </View>

      <View style={styles.bubbleColumnAI}>
        {/* Sender label */}
        <Text style={styles.senderLabel}>{t('chat.senderOrbit')}</Text>

        {/* Typing bubble */}
        <View style={styles.typingBubble}>
          <View style={styles.dotsRow}>
            <AnimatedDot delay={0} />
            <AnimatedDot delay={200} />
            <AnimatedDot delay={400} />
          </View>
        </View>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

type ThemeColors = ReturnType<typeof useAppTheme>['colors']

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      marginBottom: 24,
      paddingHorizontal: 16,
      gap: 12,
    },
    userContainer: {
      justifyContent: 'flex-end',
    },
    aiContainer: {
      justifyContent: 'flex-start',
    },

    // Avatars (matching web: size-10 = 40px)
    aiAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary_20,
      borderWidth: 1,
      borderColor: colors.primary_30,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-end',
    },
    userAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 2,
      borderColor: colors.primary_20,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-end',
    },

    // Bubble column layout
    bubbleColumn: {
      maxWidth: '70%',
      flexDirection: 'column',
    },
    bubbleColumnUser: {
      alignItems: 'flex-end',
    },
    bubbleColumnAI: {
      alignItems: 'flex-start',
    },

    // Sender label
    senderLabel: {
      fontSize: 11,
      fontWeight: '500',
      color: colors.textSecondary,
      marginBottom: 4,
      paddingHorizontal: 8,
    },

    // Bubble
    bubble: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 16,
    },
    userBubble: {
      backgroundColor: colors.primary,
      borderBottomRightRadius: 6,
      // shadow-sm
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.4,
      shadowRadius: 3,
      elevation: 2,
    },
    aiBubble: {
      backgroundColor: colors.surfaceElevated,
      borderBottomLeftRadius: 6,
      // shadow-sm
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.4,
      shadowRadius: 3,
      elevation: 2,
    },

    // Image attachment
    imageAttachment: {
      width: 200,
      height: 192,
      borderRadius: 12,
      marginBottom: 8,
    },

    // Message text
    messageText: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textPrimary,
    },
    userText: {
      color: colors.white,
    },

    // Breakdown suggestions container
    breakdownContainer: {
      gap: 12,
      marginTop: 12,
      width: '100%',
    },

    // Typing indicator
    typingBubble: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 16,
      borderBottomLeftRadius: 6,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderBottomRightRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      // shadow-sm
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.4,
      shadowRadius: 3,
      elevation: 2,
    },
    dotsRow: {
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
    },
    typingDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.textSecondary,
    },
  })
}
