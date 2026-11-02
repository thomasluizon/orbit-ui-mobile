import { useEffect, useState } from 'react'
import { Image, type ImageStyle, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { getToken } from '@/lib/secure-store'
import { API_BASE } from '@/lib/api-base'
import { getAccountGeneration } from '@/lib/session-epoch'
import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export function ConversationImage({ conversationId, turnId, style }: Readonly<{ conversationId: string; turnId: string; style: ImageStyle }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [token, setToken] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let mounted = true
    const generation = getAccountGeneration()
    void getToken().then(credential => {
      if (!mounted || generation !== getAccountGeneration()) return
      setToken(credential)
      setFailed(!credential)
    }, () => { if (mounted && generation === getAccountGeneration()) setFailed(true) })
    return () => { mounted = false }
  }, [conversationId, turnId, attempt])
  if (failed) return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    <Text accessibilityLiveRegion="polite" style={{ color: tokens.fg2, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20, flexShrink: 1 }}>{t('common.error')}</Text>
    <IconButton label={t('common.retry')} onClick={() => { setToken(null); setFailed(false); setAttempt(value => value + 1) }}><RefreshCw size={20} color={tokens.fg1} /></IconButton>
  </View>
  return token ? <Image key={attempt} source={{ uri: `${API_BASE}${API.chat.conversationImage(conversationId, turnId)}`, headers: { Authorization: `Bearer ${token}` }, cache: 'reload' }} accessibilityLabel={t('chat.attachmentPreview')} style={style} resizeMode="cover" onError={() => setFailed(true)} /> : null
}
