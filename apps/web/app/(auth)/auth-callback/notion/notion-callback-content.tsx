'use client'

import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { connectionKeys } from '@orbit/shared/query'
import { NOTION_CALLBACK_PATH, NOTION_RETURN_PATH, notionCallbackRequestSchema } from '@orbit/shared/types/notion-connection'
import { completeNotion } from '@/lib/actions/profile'
import { getAccountGeneration } from '@/lib/session-epoch'
import { getHeldAccountId } from '@/stores/auth-store'

export function NotionCallbackContent() {
  const t = useTranslations()
  const params = useSearchParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const started = useRef(false)
  const code = params.get('code')
  const state = params.get('state')
  const error = params.get('error')
  useEffect(() => {
    if (started.current) return
    started.current = true
    const generation = getAccountGeneration()
    async function complete() {
      if (error === 'access_denied') { router.replace(NOTION_RETURN_PATH); return }
      try {
        if (error) throw new Error('Notion authorization failed')
        const request = notionCallbackRequestSchema.parse({ code, state, redirectUri: `${window.location.origin}${NOTION_CALLBACK_PATH}` })
        await completeNotion(request, getHeldAccountId())
        if (getAccountGeneration() !== generation) return
        await queryClient.invalidateQueries({ queryKey: connectionKeys.notion() })
        router.replace(NOTION_RETURN_PATH)
      } catch {
        if (getAccountGeneration() === generation) router.replace(`${NOTION_RETURN_PATH}?notionError=1`)
      }
    }
    void complete()
  }, [code, state, error, router, queryClient])
  return <p role="status" className="text-sm text-[var(--fg-2)]">{t('common.loading')}</p>
}
