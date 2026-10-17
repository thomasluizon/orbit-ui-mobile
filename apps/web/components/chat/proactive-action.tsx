'use client'

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import type { ProactiveItem } from '@orbit/shared/types'
import { proactiveActionLabelKey } from '@orbit/shared/utils'
import { useProactiveAction } from '@/hooks/use-proactive-action'
import { Button } from '@/components/ui/pill-button'

export function ProactiveAction({ item, acted, isOnline, onSend }: Readonly<{
  item: ProactiveItem
  acted: boolean
  isOnline: boolean
  onSend: (prompt: string) => Promise<void>
}>) {
  const t = useTranslations()
  const reasonId = useId()
  const { reason, allowance, act } = useProactiveAction(item, acted, isOnline, onSend)
  const label = item.actionLabel || t(proactiveActionLabelKey(item.trigger))
  const explanation = reason ? t(reason, { allowance }) : undefined
  return <div className="flex flex-col items-start py-[8px]" style={{ gap: explanation ? 8 : 0 }}>
    <Button variant="ghost" disabled={reason !== null} descriptionId={reason ? reasonId : undefined} onClick={act}>{label}</Button>
    <p id={reasonId} role="status" className="text-sm text-[var(--fg-2)]">{explanation}</p>
  </div>
}
