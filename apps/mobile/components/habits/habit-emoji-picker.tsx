import { useCallback, useMemo, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import EmojiPicker, {
  en,
  pt,
  type EmojiType,
} from 'rn-emoji-keyboard'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '@/lib/use-app-theme'

interface HabitEmojiPickerProps {
  open: boolean
  onClose: () => void
  onSelect: (emoji: string) => void
  /** The currently saved icon (shown in the name-preview bar). */
  currentIcon?: string | null
  /** Shown when user long-presses an emoji or taps the "clear" button. */
  onClear?: () => void
}

/**
 * Notion-style full-color Unicode emoji picker for mobile, built on
 * `rn-emoji-keyboard`. Provides its own centered bottom-sheet (safe-area
 * aware), search, categories, recents, and skin-tones — themed against
 * our active color scheme tokens.
 *
 * Polish vs. stock picker:
 *  - Persistent name-preview strip as the picker's header (`customButtons`).
 *    Shows the most recently interacted emoji's name, so users see what
 *    they're about to confirm. Falls back to the current saved icon when
 *    nothing has been tapped yet in this session.
 *  - Confirm-first flow: tapping an emoji updates the preview first and
 *    does not auto-close, matching the quieter web Notion-style picker.
 */
export function HabitEmojiPicker({
  open,
  onClose,
  onSelect,
  currentIcon,
  onClear,
}: HabitEmojiPickerProps) {
  const { colors } = useAppTheme()
  const { t, i18n } = useTranslation()

  // Track the active preview while the sheet is open. We commit on the
  // "Confirm" button in the custom footer so users can see the name bar
  // react to their taps before saving (rn-emoji-keyboard has no hover API).
  const [pending, setPending] = useState<EmojiType | null>(null)

  const handleSelect = useCallback(
    (emoji: EmojiType) => {
      if (emoji?.emoji) setPending(emoji)
    },
    [],
  )

  const handleConfirm = useCallback(() => {
    if (pending?.emoji) {
      onSelect(pending.emoji)
      setPending(null)
      onClose()
    }
  }, [pending, onSelect, onClose])

  const handleClose = useCallback(() => {
    setPending(null)
    onClose()
  }, [onClose])

  const locale = i18n.language?.toLowerCase() ?? 'en'
  const translation = locale.startsWith('pt') ? pt : en

  const previewEmoji = pending?.emoji ?? currentIcon ?? null
  const previewName = pending?.name ?? null

  const customFooter = useMemo(
    () => (
      <PreviewBar
        emoji={previewEmoji}
        name={previewName}
        placeholder={t('habits.emojiPicker.hoverHint')}
        confirmLabel={t('habits.emojiPicker.done')}
        clearLabel={t('habits.emojiPicker.clear')}
        canConfirm={!!pending}
        canClear={!!currentIcon && !!onClear}
        onConfirm={handleConfirm}
        onClear={() => {
          onClear?.()
          setPending(null)
          onClose()
        }}
        colors={colors}
      />
    ),
    [
      previewEmoji,
      previewName,
      pending,
      currentIcon,
      onClear,
      onClose,
      handleConfirm,
      colors,
      t,
    ],
  )

  return (
    <EmojiPicker
      open={open}
      onClose={handleClose}
      onEmojiSelected={handleSelect}
      enableSearchBar
      enableRecentlyUsed
      expandable
      categoryPosition="top"
      translation={translation}
      customButtons={customFooter}
      theme={{
        backdrop: 'rgba(0,0,0,0.55)',
        knob: colors.borderEmphasis,
        container: colors.surface,
        header: colors.textMuted,
        skinTonesContainer: colors.surfaceElevated,
        category: {
          icon: colors.textSecondary,
          iconActive: colors.textInverse,
          container: colors.surfaceElevated,
          containerActive: colors.primary,
        },
        search: {
          background: colors.surfaceElevated,
          text: colors.textPrimary,
          placeholder: colors.textMuted,
          icon: colors.textMuted,
        },
        emoji: {
          selected: colors.primary,
        },
      }}
    />
  )
}

/**
 * The preview bar shown in the picker footer via `customButtons`. Displays
 * the currently interacted emoji's name (or the saved icon as a fallback)
 * and provides explicit confirm / clear actions.
 */
function PreviewBar({
  emoji,
  name,
  placeholder,
  confirmLabel,
  clearLabel,
  canConfirm,
  canClear,
  onConfirm,
  onClear,
  colors,
}: Readonly<{
  emoji: string | null
  name: string | null
  placeholder: string
  confirmLabel: string
  clearLabel: string
  canConfirm: boolean
  canClear: boolean
  onConfirm: () => void
  onClear: () => void
  colors: ReturnType<typeof useAppTheme>['colors']
}>) {
  const styles = createStyles(colors)
  return (
    <View style={styles.bar}>
      <View style={styles.nameArea}>
        {emoji ? (
          <Text allowFontScaling={false} style={styles.emojiPreview}>
            {emoji}
          </Text>
        ) : null}
        <Text
          numberOfLines={1}
          style={[
            styles.nameText,
            !emoji && !name ? styles.nameTextMuted : null,
          ]}
        >
          {name ?? (emoji ?? placeholder)}
        </Text>
      </View>
      <View style={styles.actions}>
        {canClear ? (
          <TouchableOpacity
            onPress={onClear}
            style={styles.secondaryBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={clearLabel}
          >
            <Text style={styles.secondaryBtnText}>{clearLabel}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={onConfirm}
          disabled={!canConfirm}
          style={[styles.primaryBtn, !canConfirm ? styles.primaryBtnDisabled : null]}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
          accessibilityState={{ disabled: !canConfirm }}
        >
          <Text
            style={[
              styles.primaryBtnText,
              !canConfirm ? styles.primaryBtnTextDisabled : null,
            ]}
          >
            {confirmLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderMuted,
      backgroundColor: colors.surface,
    },
    nameArea: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minWidth: 0,
    },
    emojiPreview: {
      fontSize: 22,
      lineHeight: 24,
    },
    nameText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    nameTextMuted: {
      color: colors.textMuted,
      fontWeight: '500',
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    secondaryBtn: {
      height: 34,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    primaryBtn: {
      height: 34,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnDisabled: {
      backgroundColor: colors.surfaceElevated,
    },
    primaryBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textInverse,
    },
    primaryBtnTextDisabled: {
      color: colors.textMuted,
    },
  })
}
