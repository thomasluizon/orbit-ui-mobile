import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { useTranslation } from 'react-i18next'
import { SMALL_PILL_VISIBLE_MIN } from '@orbit/shared/theme'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { Copy } from './icons'
import { Button } from './pill-button'

export function BlockCopyControl({ text }: Readonly<{ text: string }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(resetTimer.current), [])

  function copyBlock() {
    clearTimeout(resetTimer.current)
    setStatus('idle')
    try {
      Clipboard.setString(text)
      setStatus('copied')
      resetTimer.current = setTimeout(() => setStatus('idle'), 5000)
    } catch {
      setStatus('error')
    }
  }

  const label = t(status === 'copied' ? 'chat.blockCopy.copied' : 'chat.blockCopy.copy')
  return <View style={{ alignItems: 'flex-end', gap: 8, padding: 8 }}>
    <Button variant="ghost" size="sm" minimumHeight={SMALL_PILL_VISIBLE_MIN} accessibleName={label} leadingIcon={<Copy size={16} color={tokens.fg1} />} onClick={copyBlock}>{label}</Button>
    <Text accessibilityLiveRegion="polite" style={status === 'error' ? { color: tokens.statusBadText, fontSize: 14 } : styles.announcement}>
      {status === 'idle' ? '' : t(status === 'error' ? 'chat.blockCopy.copyError' : 'chat.blockCopy.copied')}
    </Text>
  </View>
}


const styles = StyleSheet.create({
  announcement: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
})
