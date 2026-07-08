import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { getSocialErrorKey } from '@orbit/shared/utils'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { PillButton } from '@/components/ui/pill-button'
import { useAppToast } from '@/hooks/use-app-toast'
import { useSendCheer } from '@/hooks/use-friends'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export interface CheerTarget {
  recipientId: string
  displayName: string
}

const REACTIONS = [
  { emoji: '👏', labelKey: 'social.cheer.reactions.clap' },
  { emoji: '🔥', labelKey: 'social.cheer.reactions.fire' },
  { emoji: '💪', labelKey: 'social.cheer.reactions.muscle' },
  { emoji: '⭐', labelKey: 'social.cheer.reactions.star' },
  { emoji: '🎉', labelKey: 'social.cheer.reactions.party' },
  { emoji: '💜', labelKey: 'social.cheer.reactions.heart' },
] as const

const MAX_NOTE = 200

interface CheerComposerProps {
  target: CheerTarget | null
  onClose: () => void
}

/** Bottom-sheet composer for a general cheer: optional emoji reactions written into an optional note. */
export function CheerComposer({ target, onClose }: Readonly<CheerComposerProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const { showSuccess, showError } = useAppToast()
  const sendCheer = useSendCheer()
  const [note, setNote] = useState('')

  function close() {
    setNote('')
    onClose()
  }

  function appendReaction(emoji: string) {
    setNote((current) => (current + emoji).slice(0, MAX_NOTE))
  }

  async function handleSend() {
    if (!target) return
    const trimmed = note.trim()
    try {
      await sendCheer.mutateAsync({
        recipientId: target.recipientId,
        note: trimmed.length > 0 ? trimmed : undefined,
      })
      showSuccess(t('social.cheer.success'))
      close()
    } catch (error: unknown) {
      showError(t(getSocialErrorKey(error)))
    }
  }

  return (
    <BottomSheetModal
      open={target !== null}
      onClose={close}
      title={t('social.cheer.title')}
      snapPoints={['58%']}
    >
      <View style={styles.body}>
        {target ? (
          <Text style={styles.subtitle}>{t('social.cheer.subtitle', { name: target.displayName })}</Text>
        ) : null}
        <View style={styles.reactions}>
          {REACTIONS.map((reaction) => (
            <Pressable
              key={reaction.emoji}
              accessibilityRole="button"
              accessibilityLabel={t(reaction.labelKey)}
              onPress={() => appendReaction(reaction.emoji)}
              style={({ pressed }) => [
                styles.reaction,
                pressed
                  ? [
                      styles.reactionPressed,
                      { backgroundColor: tintFromPrimary(tokens, 0.12), borderColor: tokens.primary },
                    ]
                  : null,
              ]}
            >
              <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.noteBlock}>
          <TextInput
            value={note}
            onChangeText={(value) => setNote(value.slice(0, MAX_NOTE))}
            maxLength={MAX_NOTE}
            placeholder={t('social.cheer.notePlaceholder')}
            placeholderTextColor={tokens.fg3}
            multiline
            style={styles.note}
          />
          <Text style={styles.noteCounter}>
            {note.length}/{MAX_NOTE}
          </Text>
        </View>
        <PillButton onPress={() => void handleSend()} disabled={sendCheer.isPending} busy={sendCheer.isPending} fullWidth>
          {t('social.cheer.send')}
        </PillButton>
      </View>
    </BottomSheetModal>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    body: { paddingHorizontal: 22, paddingTop: 4, paddingBottom: 24, gap: 16 },
    subtitle: { fontFamily: 'Rubik_400Regular', fontSize: 14, color: tokens.fg3 },
    reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    reaction: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    reactionPressed: {
      transform: [{ scale: 0.96 }],
    },
    reactionEmoji: { fontSize: 24 },
    noteBlock: { gap: 4 },
    noteCounter: {
      alignSelf: 'flex-end',
      fontFamily: 'Roboto_400Regular',
      fontSize: 12,
      color: tokens.fg4,
      fontVariant: ['tabular-nums'],
    },
    note: {
      minHeight: 88,
      borderRadius: 14,
      backgroundColor: tokens.bgField,
      borderWidth: 1,
      borderColor: tokens.hairline,
      padding: 14,
      fontFamily: 'Rubik_400Regular',
      fontSize: 16,
      color: tokens.fg1,
      textAlignVertical: 'top',
    },
  })
}
