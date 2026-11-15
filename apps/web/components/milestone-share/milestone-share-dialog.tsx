'use client'

import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { useTranslations } from 'next-intl'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { Sheet, type SheetHandle } from '@/components/ui/sheet'
import { MILESTONE_SHARE_CARD_WIDTH } from './milestone-share-card'

/** The card keeps its logical width for the image. The preview scales it down to the width of the dialog. */
function MilestoneCardPreview({ children }: Readonly<{ children: ReactNode }>) {
  const frameRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState<{ scale: number; height: number | undefined }>({ scale: 1, height: undefined })
  useEffect(() => {
    const frame = frameRef.current
    const card = cardRef.current
    if (!frame || !card || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => {
      if (frame.clientWidth === 0) return
      const scale = Math.min(1, frame.clientWidth / MILESTONE_SHARE_CARD_WIDTH)
      setFit({ scale, height: card.offsetHeight * scale })
    })
    observer.observe(frame)
    observer.observe(card)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={frameRef} data-milestone-card-preview="" data-preview-scale={fit.scale} className="flex w-full justify-center overflow-hidden" style={{ height: fit.height }}>
      <div ref={cardRef} style={{ width: MILESTONE_SHARE_CARD_WIDTH, flex: '0 0 auto', transform: `scale(${fit.scale})`, transformOrigin: 'top center' }}>{children}</div>
    </div>
  )
}

interface MilestoneShareDialogProps {
  card: ReactNode
  actions: ReactNode
  onDismiss: () => void
  ref?: Ref<SheetHandle>
}

/** The milestone share prompt under `orbit_guided_flows`: a centred dialog with Orbit in Feliz, with no hop, above the card. */
export function MilestoneShareDialog({ card, actions, onDismiss, ref }: Readonly<MilestoneShareDialogProps>) {
  const t = useTranslations()
  return (
    <Sheet ref={ref} open centred accessibleTitle={t('milestoneShare.title')} accessibleDescription={t('milestoneShare.body')} onAttemptDismiss={onDismiss} actions={actions}>
      <div data-milestone-share-dialog="" className="flex flex-col items-center gap-6 text-center">
        <span aria-hidden="true"><OrbitMascot size={96} state="feliz" /></span>
        <p aria-hidden="true" className="font-display text-[22px] font-medium leading-[1.2] tracking-[-0.02em] text-[var(--fg-1)]">{t('milestoneShare.title')}</p>
        <MilestoneCardPreview>{card}</MilestoneCardPreview>
        <p aria-hidden="true" className="text-base leading-6 text-[var(--fg-2)]">{t('milestoneShare.body')}</p>
      </div>
    </Sheet>
  )
}
