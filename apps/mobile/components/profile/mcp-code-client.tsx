import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { useTranslation } from 'react-i18next'
import { buildMcpConfigJson, MCP_CONFIG_TABS, type McpConfigTab } from '@orbit/shared/utils/advanced-settings'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { Copy } from '@/components/ui/icons'
import { ActionRow } from '@/components/ui/action-row'
import { Chip } from '@/components/ui/chip'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

function useTokens() {
  const { currentScheme, currentTheme } = useAppTheme()
  return useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
}

function McpCodeConfig({ endpoint }: Readonly<{ endpoint: string }>) {
  const { t } = useTranslation()
  const tokens = useTokens()
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle')
  const configuration = buildMcpConfigJson(endpoint)

  async function copyConfiguration() {
    if (copyStatus === 'copying') return
    setCopyStatus('copying')
    try {
      Clipboard.setString(configuration)
      const copiedText = await Clipboard.getString()
      if (copiedText !== configuration) throw new Error('Clipboard content mismatch')
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }
  }

  return (
    <View style={styles.configuration}>
      <Text style={[styles.message, { color: tokens.fg3 }]}>{t('orbitMcp.configInstructions')}</Text>
      <Text selectable style={[styles.code, { color: tokens.fg2 }]}>{configuration}</Text>
      <Text style={[styles.message, { color: tokens.fg3 }]}>{t('orbitMcp.replaceKey')}</Text>
      <ActionRow>
        <PillButton size="sm" variant="ghost" iconOnly label={t('orbitMcp.copyConfig')} minimumHeight={TOUCH_TARGET_MIN} loading={copyStatus === 'copying'} onClick={() => void copyConfiguration()}><Copy size={24} strokeWidth={1.5} color={tokens.fg1} /></PillButton>
      </ActionRow>
      <Text accessibilityLiveRegion="polite" style={[styles.message, { color: copyStatus === 'error' ? tokens.statusBadText : tokens.fg2 }]}>
        {copyStatus === 'error' ? t('orbitMcp.configCopyError') : copyStatus === 'copied' ? t('orbitMcp.copied') : ''}
      </Text>
    </View>
  )
}

export function McpCodeClient({ endpoint }: Readonly<{ endpoint: string }>) {
  const { t } = useTranslation()
  const tokens = useTokens()
  const [activeTab, setActiveTab] = useState<McpConfigTab>('web')

  return (
    <View style={[styles.well, { backgroundColor: tokens.bgWell }]}>
      <Text style={[styles.title, { color: tokens.fg1 }]}>{t('profile.apiKeys.mcpTitle')}</Text>
      <View style={styles.tabs}>
        {MCP_CONFIG_TABS.map((tab) => (
          <Chip key={tab} active={activeTab === tab} onPress={() => setActiveTab(tab)}>
            {tab === 'web' ? t('orbitMcp.claudeWeb') : t('orbitMcp.claudeCode')}
          </Chip>
        ))}
      </View>
      {activeTab === 'web' ? (
        <View style={styles.endpoint}>
          <Text selectable style={[styles.code, { color: tokens.fg2 }]}>{endpoint}</Text>
          <Text style={[styles.message, { color: tokens.fg3 }]}>{t('orbitMcp.webNoApiKey')}</Text>
        </View>
      ) : <McpCodeConfig endpoint={endpoint} />}
    </View>
  )
}

const styles = StyleSheet.create({
  well: { minWidth: 0, borderRadius: 12, gap: 24, padding: 16 },
  title: { fontFamily: 'Geist_500Medium', fontSize: 14 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  configuration: { minWidth: 0, gap: 12 },
  endpoint: { gap: 12 },
  message: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21 },
  code: { flexShrink: 1, fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16.8 },
})
