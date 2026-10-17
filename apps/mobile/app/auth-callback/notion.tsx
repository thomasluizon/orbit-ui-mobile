import { useEffect, useRef } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Text } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { connectionKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { NOTION_CALLBACK_PATH, NOTION_RETURN_PATH, notionCallbackRequestSchema } from '@orbit/shared/types/notion-connection'
import { apiClient } from '@/lib/api-client'
import { APP_LINK_ORIGIN } from '@/lib/app-link-origin'
import { getSessionGeneration } from '@/stores/auth-store'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export default function NotionCallbackScreen() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { code, state, error } = useLocalSearchParams<{ code?: string; state?: string; error?: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const epoch = getSessionGeneration().epoch
    async function complete() {
      if (error === 'access_denied') { router.replace(NOTION_RETURN_PATH); return }
      try {
        if (error) throw new Error('Notion authorization failed')
        const request = notionCallbackRequestSchema.parse({ code, state, redirectUri: `${APP_LINK_ORIGIN}${NOTION_CALLBACK_PATH}` })
        await apiClient<void>(API.connections.notionCallback, { method: 'POST', body: JSON.stringify(request), isCurrent: () => getSessionGeneration().epoch === epoch })
        if (getSessionGeneration().epoch !== epoch) return
        await queryClient.invalidateQueries({ queryKey: connectionKeys.notion() })
        router.replace(NOTION_RETURN_PATH)
      } catch {
        if (getSessionGeneration().epoch === epoch) router.replace(`${NOTION_RETURN_PATH}?notionError=1`)
      }
    }
    void complete()
  }, [code, state, error, router, queryClient])
  return <Text accessibilityLiveRegion="polite" style={{ fontFamily: 'Geist_400Regular', fontSize: 14, color: tokens.fg2 }}>{t('common.loading')}</Text>
}
