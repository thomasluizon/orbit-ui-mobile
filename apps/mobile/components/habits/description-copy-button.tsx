import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { useTranslation } from 'react-i18next'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { Check, Copy } from '@/components/ui/icons'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export function DescriptionCopyButton({ description }: Readonly<{ description: string }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [hovered, setHovered] = useState(false)
  const [status, setStatus] = useState<'idle' | 'pending' | 'copied' | 'error'>('idle')
  const disabled = !description.trim() || status === 'pending'

  async function copyDescription() {
    if (disabled) return
    setStatus('pending')
    try {
      Clipboard.setString(description)
      const copiedDescription = await Clipboard.getString()
      setStatus(copiedDescription === description ? 'copied' : 'error')
    } catch {
      setStatus('error')
    }
  }

  return (
    <View style={styles.copyRow}>
      <InsetFocusPressable
        accessibilityRole="button"
        accessibilityLabel={t('habits.detail.copyDescription')}
        accessibilityState={{ disabled, busy: status === 'pending' }}
        disabled={disabled}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onPress={() => { void copyDescription() }}
        style={({ pressed }) => [styles.copyButton, { opacity: disabled ? 0.4 : 1, backgroundColor: (pressed || hovered) && !disabled ? tokens.bgHover : tokens.bgElev }]}
      >
        {status === 'copied' ? <Check size={20} strokeWidth={1.5} color={tokens.fg2} /> : <Copy size={20} strokeWidth={1.5} color={tokens.fg2} />}
      </InsetFocusPressable>
      <Text accessibilityLiveRegion="polite" style={[styles.feedback, { color: tokens.fg2 }]}>{status === 'copied' ? t('habits.detail.descriptionCopied') : ''}</Text>
      {status === 'error' ? <Text accessibilityRole="alert" style={[styles.feedback, { color: tokens.statusBadText }]}>{t('habits.detail.copyFailed')}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  copyRow: { minWidth: 0, alignItems: 'flex-end', gap: 8 },
  copyButton: { width: TOUCH_TARGET_MIN, height: TOUCH_TARGET_MIN, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  feedback: { maxWidth: '100%', fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
})
