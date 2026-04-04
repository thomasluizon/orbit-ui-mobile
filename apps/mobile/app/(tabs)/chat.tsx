import { useState, useRef, useCallback, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Animated,
} from 'react-native'
import {
  Sparkles,
  SendHorizontal,
  Image as ImageIcon,
  Mic,
} from 'lucide-react-native'
import { useQueryClient } from '@tanstack/react-query'
import { habitKeys } from '@orbit/shared/query'
import type { ChatMessage, ChatResponse } from '@orbit/shared/types/chat'
import { useProfile } from '@/hooks/use-profile'
import { apiClient } from '@/lib/api-client'
import { MessageBubble, TypingIndicator } from '@/components/message-bubble'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STARTER_CHIPS = [
  'Log a habit',
  'Create a routine',
  'How am I doing?',
  'Plan my week',
]

const SUGGESTION_CHIPS = [
  'I meditated today',
  'Went to the gym',
  'Need groceries',
]

// ---------------------------------------------------------------------------
// Colors (from globals.css design tokens)
// ---------------------------------------------------------------------------

const colors = {
  primary: '#8b5cf6',
  primary_15: 'rgba(139, 92, 246, 0.15)',
  background: '#07060e',
  surface: '#13111f',
  surfaceElevated: '#1a1829',
  border: 'rgba(255,255,255,0.07)',
  borderMuted: 'rgba(255,255,255,0.04)',
  border50: 'rgba(255,255,255,0.035)',
  textPrimary: '#f0eef6',
  textSecondary: '#9b95ad',
  textMuted: '#7a7490',
  amber400: '#fbbf24',
  red400: '#f87171',
}

// ---------------------------------------------------------------------------
// Animated Sparkle Icon for empty state
// ---------------------------------------------------------------------------

function AnimatedSparkle() {
  const scale = useRef(new Animated.Value(1)).current
  const opacity = useRef(new Animated.Value(0.7)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.1,
            duration: 1250,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 1250,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 1250,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.7,
            duration: 1250,
            useNativeDriver: true,
          }),
        ]),
      ]),
    )
    animation.start()
    return () => animation.stop()
  }, [scale, opacity])

  return (
    <View style={styles.sparkleOuter}>
      {/* Glow */}
      <View style={styles.sparkleGlow} />
      {/* Icon */}
      <Animated.View style={{ transform: [{ scale }], opacity }}>
        <Sparkles size={28} color={colors.primary} />
      </Animated.View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Chat Screen
// ---------------------------------------------------------------------------

export default function ChatScreen() {
  const queryClient = useQueryClient()
  const { profile } = useProfile()
  const flatListRef = useRef<FlatList>(null)

  // State
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [input, setInput] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)

  // Derived
  const hasProAccess = profile?.hasProAccess ?? false
  const aiMessagesUsed = profile?.aiMessagesUsed ?? 0
  const aiMessagesLimit = profile?.aiMessagesLimit ?? 10
  const atMessageLimit = !hasProAccess && aiMessagesUsed >= aiMessagesLimit
  const canSend = input.trim().length > 0 && !isTyping && !atMessageLimit
  const showSuggestions = messages.length === 0 && !isTyping

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true })
    }, 100)
  }, [])

  // Send message
  const sendMessage = useCallback(
    async (content?: string) => {
      const messageContent = content || input.trim()
      if (!messageContent || isTyping) return

      setSendError(null)

      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: messageContent,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, userMessage])
      setInput('')
      scrollToBottom()
      setIsTyping(true)
      scrollToBottom()

      try {
        // Build history for context
        const currentMessages = [...messages, userMessage]
        const recentHistory = currentMessages
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content }))

        const response = await apiClient<ChatResponse>('/api/chat', {
          method: 'POST',
          body: JSON.stringify({
            message: messageContent,
            history: recentHistory,
          }),
        })

        setIsTyping(false)

        const aiMessage: ChatMessage = {
          id: `msg-${Date.now()}-ai`,
          role: 'ai',
          content: response.aiMessage || '',
          actions: response.actions,
          timestamp: new Date(),
        }

        setMessages((prev) => [...prev, aiMessage])
        scrollToBottom()

        // Refresh habits if any action succeeded
        if (response.actions?.some((a) => a.status === 'Success')) {
          queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
        }
      } catch (err: unknown) {
        setIsTyping(false)

        const errMsg =
          err instanceof Error ? err.message : 'Failed to send message. Please try again.'
        setSendError(errMsg)

        const errorMessage: ChatMessage = {
          id: `msg-${Date.now()}-err`,
          role: 'ai',
          content: "Sorry, I couldn't process that. Please try again.",
          timestamp: new Date(),
        }

        setMessages((prev) => [...prev, errorMessage])
        scrollToBottom()
      }
    },
    [input, isTyping, messages, scrollToBottom, queryClient],
  )

  const handleSend = useCallback(() => {
    sendMessage()
  }, [sendMessage])

  // Render message item
  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => <MessageBubble message={item} />,
    [],
  )

  const keyExtractor = useCallback((item: ChatMessage) => item.id, [])

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>AI Chat</Text>
        </View>

        {/* Messages area */}
        {showSuggestions ? (
          <View style={styles.emptyState}>
            {/* Animated sparkle icon */}
            <AnimatedSparkle />

            <Text style={styles.emptyText}>How can I help you today?</Text>

            {/* Suggestion chips */}
            <View style={styles.suggestionsContainer}>
              {SUGGESTION_CHIPS.map((chip) => (
                <TouchableOpacity
                  key={chip}
                  style={styles.suggestionChip}
                  onPress={() => sendMessage(chip)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.suggestionChipText}>{chip}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={scrollToBottom}
            ListFooterComponent={isTyping ? <TypingIndicator /> : null}
          />
        )}

        {/* Bottom input area */}
        <View style={styles.inputArea}>
          {/* Error banner */}
          {sendError && (
            <Text style={styles.errorText}>{sendError}</Text>
          )}

          {/* Quick chips (after first message) - horizontal scrollable */}
          {messages.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickChipsContent}
              style={styles.quickChipsScroll}
            >
              {STARTER_CHIPS.map((chip) => (
                <TouchableOpacity
                  key={chip}
                  style={styles.quickChip}
                  onPress={() => sendMessage(chip)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickChipText}>{chip}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Input bar */}
          <View style={styles.inputBar}>
            <TouchableOpacity style={styles.iconButton} activeOpacity={0.7}>
              <ImageIcon size={15} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.iconButton} activeOpacity={0.7}>
              <Mic size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <TextInput
              style={styles.textInput}
              value={input}
              onChangeText={setInput}
              placeholder="Type a message..."
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={2000}
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={handleSend}
            />

            <TouchableOpacity
              style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!canSend}
              activeOpacity={0.7}
            >
              <SendHorizontal size={16} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Message limit */}
          {!hasProAccess && atMessageLimit && (
            <Text style={styles.limitText}>
              Message limit reached. Upgrade to Pro for unlimited messages.
            </Text>
          )}
          {!hasProAccess && !atMessageLimit && (
            <Text style={styles.usageText}>
              {aiMessagesUsed}/{aiMessagesLimit} messages used
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardAvoid: {
    flex: 1,
  },

  // Header (matching web: centered title, bold, fluid-lg equivalent)
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },

  // Empty state (matching web: centered with sparkle orb + suggestion chips)
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 20,
  },
  sparkleOuter: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkleGlow: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary_15,
  },

  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
  },

  // Suggestion chips (centered, wrapping, matching web SuggestionChips)
  suggestionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 0,
    maxWidth: 320,
  },
  suggestionChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9999,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  suggestionChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textPrimary,
  },

  // Message list
  messageList: {
    paddingVertical: 16,
  },

  // Input area (matching web: border-top, glass bg)
  inputArea: {
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: colors.background,
  },
  errorText: {
    fontSize: 14,
    color: colors.red400,
    textAlign: 'center',
    marginBottom: 8,
  },

  // Quick chips (horizontal scroll, matching web starter chips in chat)
  quickChipsScroll: {
    marginBottom: 12,
  },
  quickChipsContent: {
    gap: 8,
  },
  quickChip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border50,
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textPrimary,
  },

  // Input bar (matching web: bg-surface-elevated, rounded-lg, border-border-muted)
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  iconButton: {
    padding: 4,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    maxHeight: 120,
    minHeight: 36,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    // shadow-glow-sm equivalent
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  limitText: {
    fontSize: 10,
    color: colors.amber400,
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
  },
  usageText: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
})
