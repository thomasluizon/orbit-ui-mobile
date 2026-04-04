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
} from 'react-native'
import {
  Sparkles,
  SendHorizontal,
  Image as ImageIcon,
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

const colors = {
  primary: '#8b5cf6',
  background: '#07060e',
  surface: '#13111f',
  surfaceElevated: '#1a1829',
  border: 'rgba(255,255,255,0.07)',
  borderMuted: 'rgba(255,255,255,0.04)',
  textPrimary: '#f0eef6',
  textSecondary: '#9b95ad',
  textMuted: '#7a7490',
  amber: '#f59e0b',
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
            {/* Sparkle icon */}
            <View style={styles.sparkleContainer}>
              <Sparkles size={28} color={colors.primary} />
            </View>
            <Text style={styles.emptyText}>How can I help you today?</Text>

            {/* Suggestion chips */}
            <View style={styles.chipsContainer}>
              {STARTER_CHIPS.map((chip) => (
                <TouchableOpacity
                  key={chip}
                  style={styles.chip}
                  onPress={() => sendMessage(chip)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chipText}>{chip}</Text>
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

          {/* Quick chips (after first message) */}
          {messages.length > 0 && (
            <View style={styles.quickChips}>
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
            </View>
          )}

          {/* Input bar */}
          <View style={styles.inputBar}>
            <TouchableOpacity style={styles.attachButton} activeOpacity={0.7}>
              <ImageIcon size={16} color={colors.textMuted} />
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 20,
  },
  sparkleContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 8,
    maxWidth: 320,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  messageList: {
    paddingVertical: 16,
  },
  inputArea: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: colors.background,
  },
  errorText: {
    fontSize: 13,
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 8,
  },
  quickChips: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  quickChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  attachButton: {
    padding: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    paddingVertical: 8,
    paddingHorizontal: 4,
    maxHeight: 120,
    minHeight: 36,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  limitText: {
    fontSize: 10,
    color: colors.amber,
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
