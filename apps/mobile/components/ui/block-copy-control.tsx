import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { useTranslation } from 'react-i18next'
import { SPACING, SMALL_PILL_VISIBLE_MIN } from '@orbit/shared/theme'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { Copy } from './icons'
import { Button } from './pill-button'

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

  function copyBlock() {
    setFeedback({ status: 'idle' })
    try {
      Clipboard.setString(text)
      setFeedback({ status: 'copied' })
    } catch {
      setFeedback({ status: 'error' })
    }
  }

  const label = t(status === 'copied' ? 'chat.blockCopy.copied' : 'chat.blockCopy.copy')
  return <View style={{ alignItems: 'flex-end', gap: SPACING.s8, padding: SPACING.s8 }}>
    <Button variant="ghost" size="sm" minimumHeight={SMALL_PILL_VISIBLE_MIN} accessibleName={label} leadingIcon={<Copy size={16} color={tokens.fg1} />} onClick={copyBlock} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)}>{label}</Button>
    <Text accessibilityLiveRegion="polite" style={status === 'error' ? { color: tokens.statusBadText, fontSize: 14 } : styles.announcement}>
      {status === 'idle' ? '' : t(status === 'error' ? 'chat.blockCopy.copyError' : 'chat.blockCopy.copied')}
    </Text>
  </View>
}


const styles = StyleSheet.create({
  announcement: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
})
