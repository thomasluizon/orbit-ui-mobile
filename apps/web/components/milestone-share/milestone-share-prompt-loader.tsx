'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useAccountGeneration } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'
import { useAppToastStore } from '@/stores/app-toast-store'

export function MilestoneSharePromptLoader() {
  const t = useTranslations()
  const generation = useAccountGeneration()
  const armedPrompt = useEngagementPromptStore((state) => state.armedPrompt)
  const [account, setAccount] = useState({ generation, retiredPrompt: null as typeof armedPrompt })
  const [loaded, setLoaded] = useState<typeof import('./milestone-share-prompt') | null>(null)
  const [failedGeneration, setFailedGeneration] = useState<number | null>(null)
  if (account.generation !== generation) setAccount({ generation, retiredPrompt: armedPrompt })

  useEffect(() => {
    if (loaded || failedGeneration === generation || account.generation !== generation
      || armedPrompt?.kind !== 'milestone-share' || armedPrompt === account.retiredPrompt) return
    let active = true
    void import('./milestone-share-prompt').then(
      (module) => {
        if (active && generation === getAccountGeneration()) setLoaded(module)
      },
      () => {
        if (!active || generation !== getAccountGeneration()) return
        setFailedGeneration(generation)
        useAppToastStore.getState().showToast({
          kind: 'neutral', message: t('milestoneShare.shareError'), actionLabel: t('common.retry'),
          onAction: () => { if (generation === getAccountGeneration()) setFailedGeneration(null) },
        })
      },
    )
    return () => { active = false }
  }, [account, armedPrompt, failedGeneration, generation, loaded, t])

  const Prompt = loaded?.MilestoneSharePrompt
  return Prompt ? <Prompt /> : null
}
