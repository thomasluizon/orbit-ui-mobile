'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'

const EngagementPrompts = dynamic(
  () => import('./engagement-prompts').then((module) => module.EngagementPrompts),
  { ssr: false, loading: () => null },
)

export function DeferredEngagementPrompts() {
  const armed = useEngagementPromptStore((state) => state.armedPrompt !== null)
  const [requested, setRequested] = useState(armed)
  if (armed && !requested) setRequested(true)
  return requested ? <EngagementPrompts /> : null
}
