import { Copy } from '@/components/ui/icons'

import { IconButton } from '@/components/ui/icon-button'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useTranslation } from 'react-i18next'
import { SPACING } from '@orbit/shared/theme'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function BlockCopyControl({ text }: Readonly<{ text: string }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [feedback, setFeedback] = useState<{ status: 'idle' | 'copied' | 'error' }>({ status: 'idle' })
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const { status } = feedback
  useEffect(() => {
    if (feedback.status !== 'copied' || focused || hovered) return
    const resetTimer = setTimeout(() => setFeedback({ status: 'idle' }), 5000)
    return () => clearTimeout(resetTimer)
  }, [feedback, focused, hovered])

  async function copyBlock() {
    setFeedback({ status: 'idle' })
    try {
      await Clipboard.setStringAsync(text)
      setFeedback({ status: 'copied' })
    } catch {
      setFeedback({ status: 'error' })
    }
  }

  const label = t(status === 'copied' ? 'chat.blockCopy.copied' : 'chat.blockCopy.copy')
  return <View style={{ alignItems: 'flex-end', gap: SPACING.s8, padding: SPACING.s8 }}>
    <IconButton label={label} onClick={() => { void copyBlock() }} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)}><Copy size={20} strokeWidth={1.5} accessible={false} /></IconButton>
    <Text accessibilityLiveRegion="polite" style={status === 'error' ? { color: tokens.statusBadText, fontSize: 14 } : styles.announcement}>
      {status === 'idle' ? '' : t(status === 'error' ? 'chat.blockCopy.copyError' : 'chat.blockCopy.copied')}
    </Text>
  </View>
}

const styles = StyleSheet.create({
  announcement: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
})
