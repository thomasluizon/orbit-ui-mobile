'use client'

import { useRef } from 'react'
import { motion } from 'motion/react'
import type { ResultDialogProps } from '@orbit/shared/contracts/flow'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import { ActionRow } from '@/components/ui/action-row'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { PillButton } from '@/components/ui/pill-button'
import { Sheet } from '@/components/ui/sheet'
import { useViewportMatch } from '@/hooks/use-viewport-match'

const HOP_HEIGHT = 12

/** The result dialog: centred at every width, Orbit at 128, one sentence, a filled action and a ghost action. It asks nothing. */
export function ResultDialog({ title, sentence, primaryLabel, onPrimary, secondaryLabel, onSecondary, onClose, orbitState = 'feliz' }: Readonly<ResultDialogProps>) {
  const primaryRef = useRef<HTMLButtonElement>(null)
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  const hop = orbitState === 'feliz' && !reducedMotion
  const duration = motionDurations.slow / 1000
  return (
    <Sheet centred accessibleTitle={title} accessibleDescription={sentence} initialFocus={primaryRef} onClose={onClose}>
      <div data-result-dialog="" data-orbit-state={orbitState} className="flex flex-col items-center gap-6 px-6 pb-6 pt-2 text-center">
        <motion.span aria-hidden="true" animate={hop ? { y: [0, -HOP_HEIGHT, 0] } : { y: 0 }}
          transition={{ duration, ease: [...motionEasings.standard] as [number, number, number, number] }}>
          <OrbitMascot size={128} state={orbitState} />
        </motion.span>
        <div aria-hidden="true" className="flex flex-col gap-3">
          <p className="font-display text-[28px] leading-9 text-[var(--fg-1)]">{title}</p>
          <p className="text-[17px] leading-[26px] text-[var(--fg-2)]">{sentence}</p>
        </div>
        <ActionRow align="center">
          <div className="w-full"><PillButton buttonRef={primaryRef} onClick={onPrimary}>{primaryLabel}</PillButton></div>
          {secondaryLabel && onSecondary ? <PillButton variant="ghost" size="sm" onClick={onSecondary}>{secondaryLabel}</PillButton> : null}
        </ActionRow>
      </div>
    </Sheet>
  )
}
