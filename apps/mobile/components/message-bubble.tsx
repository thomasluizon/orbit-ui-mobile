import { View, Text, Image, StyleSheet } from 'react-native'
import { Sparkles } from 'lucide-react-native'
import type { ChatMessage } from '@orbit/shared/types/chat'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
  message: ChatMessage
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const colors = {
  primary: '#8b5cf6',
  surface: '#13111f',
  surfaceElevated: '#1a1829',
  textPrimary: '#f0eef6',
  textSecondary: '#9b95ad',
  textMuted: '#7a7490',
  green: '#22c55e',
  red: '#ef4444',
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.aiContainer]}>
      {/* AI avatar */}
      {!isUser && (
        <View style={styles.aiAvatar}>
          <Sparkles size={14} color={colors.primary} />
        </View>
      )}

      <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
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

        {/* Action results */}
        {message.actions && message.actions.length > 0 && (
          <View style={styles.actionsContainer}>
            {message.actions.map((action, idx) => (
              <View
                key={`${action.type}-${idx}`}
                style={[
                  styles.actionChip,
                  action.status === 'Success' && styles.actionSuccess,
                  action.status === 'Failed' && styles.actionFailed,
                ]}
              >
                <Text
                  style={[
                    styles.actionText,
                    action.status === 'Success' && styles.actionTextSuccess,
                    action.status === 'Failed' && styles.actionTextFailed,
                  ]}
                >
                  {action.status === 'Success' ? '\u2713' : '\u2717'}{' '}
                  {action.entityName ?? action.type}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Timestamp */}
        <Text style={styles.timestamp}>
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// TypingIndicator
// ---------------------------------------------------------------------------

export function TypingIndicator() {
  return (
    <View style={[styles.container, styles.aiContainer]}>
      <View style={styles.aiAvatar}>
        <Sparkles size={14} color={colors.primary} />
      </View>
      <View style={[styles.bubble, styles.aiBubble, styles.typingBubble]}>
        <View style={styles.dotsRow}>
          <View style={[styles.dot, styles.dot1]} />
          <View style={[styles.dot, styles.dot2]} />
          <View style={[styles.dot, styles.dot3]} />
        </View>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginBottom: 16,
    paddingHorizontal: 16,
    gap: 8,
  },
  userContainer: {
    justifyContent: 'flex-end',
  },
  aiContainer: {
    justifyContent: 'flex-start',
  },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${colors.primary}20`,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: colors.surfaceElevated,
    borderBottomLeftRadius: 4,
  },
  imageAttachment: {
    width: 200,
    height: 150,
    borderRadius: 12,
    marginBottom: 8,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  userText: {
    color: '#fff',
  },
  actionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  actionChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  actionSuccess: {
    backgroundColor: 'rgba(34,197,94,0.15)',
  },
  actionFailed: {
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  actionTextSuccess: {
    color: colors.green,
  },
  actionTextFailed: {
    color: colors.red,
  },
  timestamp: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  typingBubble: {
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.textMuted,
    opacity: 0.4,
  },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.6 },
  dot3: { opacity: 0.8 },
})
