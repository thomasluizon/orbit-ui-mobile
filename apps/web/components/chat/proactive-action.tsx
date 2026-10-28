'use client'

import { useAstraAllowanceCopy } from '@/hooks/use-astra-allowance-copy'

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import type { ProactiveItem } from '@orbit/shared/types'
import { proactiveActionLabelKey } from '@orbit/shared/utils'
import { useProactiveAction } from '@/hooks/use-proactive-action'
import { AstraGlyph } from '@/components/ui/astra-glyph'


export function ProactiveAction({ item, acted, isOnline, onSend }: Readonly<{
  item: ProactiveItem
  acted: boolean
  isOnline: boolean
  onSend: (prompt: string) => Promise<void>
}>) {
  const t = useTranslations()
  const allowanceText = useAstraAllowanceCopy()
  const reasonId = useId()
  const { reason, allowance, act } = useProactiveAction(item, acted, isOnline, onSend)
  const label = item.actionLabel || t(proactiveActionLabelKey(item.trigger))
  const explanation = reason ? allowanceText(reason, { allowance }) : undefined
  return <div className="flex flex-col items-start py-[8px]" style={{ gap: 8 }}>
    <button type="button" aria-label={label} disabled={reason !== null} aria-describedby={reason ? reasonId : undefined} onClick={act} className="orbit-hover-text flex min-h-12 max-w-full flex-col items-start gap-2 rounded-[12px] bg-[var(--bg-well)] px-4 py-3 text-start text-sm text-[var(--fg-2)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--fg-1)] disabled:opacity-50 transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]"><span>{label}</span><span className="flex items-center gap-2" translate="no"><AstraGlyph size={16} /></span></button>
    <p id={reasonId} role="status" className="empty:absolute text-sm text-[var(--fg-2)]">{explanation}</p>
  </div>
}
