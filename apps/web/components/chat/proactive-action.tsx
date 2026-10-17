'use client'

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import type { ProactiveItem } from '@orbit/shared/types'
import { proactiveActionLabelKey } from '@orbit/shared/utils'
import { useProactiveAction } from '@/hooks/use-proactive-action'
import { Button } from '@/components/ui/pill-button'

export function ProactiveAction({ item, acted, onSend }: Readonly<{
  item: ProactiveItem
  acted: boolean
  onSend: (prompt: string) => Promise<void>
}>) {
  const t = useTranslations()
  const reasonId = useId()
  const { reason, allowance, act } = useProactiveAction(item, acted, onSend)
  const label = item.actionLabel || t(proactiveActionLabelKey(item.trigger))
  const explanation = reason ? t(reason, { allowance }) : undefined
  return <div className="flex flex-col items-start gap-[8px] py-[8px]">
    <Button variant="ghost" disabled={reason !== null} descriptionId={reason ? reasonId : undefined} onClick={act}>{label}</Button>
    {explanation ? <p id={reasonId} role="status" className="text-sm text-[var(--fg-2)]">{explanation}</p> : null}
  </div>
}
