import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { useTranslation } from 'react-i18next'
import { getMcpEndpointUrl } from '@orbit/shared/utils/advanced-settings'
import { API_BASE } from '@/lib/api-base'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { PillButton } from '@/components/ui/pill-button'
import { Sheet, useSheetHost } from '@/components/ui/sheet'

function McpWebSheet({ onClose }: Readonly<{ onClose: () => void }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { sheetRef, closeSheet } = useSheetHost()
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle')
  const endpoint = getMcpEndpointUrl(API_BASE)

  async function copyEndpoint() {
    if (copyState === 'copying') return
    setCopyState('copying')
    try {
      Clipboard.setString(endpoint)
      const copiedText = await Clipboard.getString()
      if (copiedText !== endpoint) throw new Error('Clipboard content mismatch')
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
  }

  return (
    <Sheet
      ref={sheetRef}
      title={t('orbitMcp.claudeWeb')}
      onClose={onClose}
      actions={<>
        <PillButton variant="ghost" size="sm" onClick={() => closeSheet()}>{t('orbitMcp.done')}</PillButton>
        <View accessibilityLiveRegion="polite" style={styles.copyAction}>
          <PillButton size="sm" loading={copyState === 'copying'} disabled={copyState === 'copying'} onClick={() => void copyEndpoint()}>
            {copyState === 'copied' ? t('orbitMcp.copied') : t('orbitMcp.copy')}
          </PillButton>
        </View>
      </>}
    >
      <View style={styles.content}>
        <Text selectable style={[styles.body, { color: tokens.fg2 }]}>{t('orbitMcp.webInstructions')}</Text>
        <View style={styles.steps}>
          {(['webStep1', 'webStep2', 'webStep3', 'webStep4'] as const).map((step, index) => (
            <View key={step} style={styles.step}>
              <Text style={[styles.number, { color: tokens.fg3 }]}>{index + 1}.</Text>
              <Text selectable style={[styles.stepText, styles.body, { color: tokens.fg1 }]}>{t(`orbitMcp.${step}`)}</Text>
            </View>
          ))}
        </View>
        <View>
          <Text selectable style={[styles.endpoint, { color: tokens.fg2 }]}>{endpoint}</Text>
          <Text accessibilityLiveRegion="polite" style={[styles.note, { color: tokens.statusBadText, paddingTop: copyState === 'error' ? 12 : 0 }]}>{copyState === 'error' ? t('orbitMcp.copyError') : ''}</Text>
        </View>
        <Text selectable style={[styles.note, { color: tokens.fg3 }]}>{t('orbitMcp.webNoApiKey')}</Text>
      </View>
    </Sheet>
  )
}

export function ProfileMcpGuide() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <View style={styles.entry}>
      <PillButton variant="ghost" size="sm" expanded={open} onClick={() => setOpen(true)}>{t('orbitMcp.connectionInstructions')}</PillButton>
      {open ? <McpWebSheet onClose={() => setOpen(false)} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  copyAction: { minHeight: 48, justifyContent: 'center' },
  entry: { alignItems: 'flex-start' },
  content: { gap: 24, maxWidth: 640, width: '100%', alignSelf: 'center' },
  body: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24.8 },
  steps: { gap: 12 },
  step: { flexDirection: 'row', gap: 12 },
  stepText: { flex: 1, minWidth: 0 },
  number: { fontFamily: 'GeistMono_400Regular', fontSize: 14, lineHeight: 24.8 },
  endpoint: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16.8 },
  note: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21.7 },
})
