'use client'

import { useRef } from 'react'
import type { ResultDialogProps } from '@orbit/shared/contracts/flow'
import { ActionRow } from '@/components/ui/action-row'
import { OrbitHop } from '@/components/ui/orbit-hop'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { PillButton } from '@/components/ui/pill-button'
import { Sheet } from '@/components/ui/sheet'

interface ResultDialogFrameProps {
  label: string
  hint?: string
  initialFocus?: React.RefObject<HTMLElement | null>
  onClose: () => void
  children: React.ReactNode
}

/** The centred panel of the result dialog over the scrim, at every width. The result dialog and its read failure share it. */
export function ResultDialogFrame({ label, hint, initialFocus, onClose, children }: Readonly<ResultDialogFrameProps>) {
  return <Sheet centred accessibleTitle={label} accessibleDescription={hint} initialFocus={initialFocus} onClose={onClose}>{children}</Sheet>
}

/** The result dialog: centred at every width, Orbit at 128, one sentence, a filled action over a ghost action. Both actions share one size and the full width of the panel. It asks nothing. */
export function ResultDialog({ title, sentence, primaryLabel, onPrimary, secondaryLabel, onSecondary, onClose, orbitState = 'feliz' }: Readonly<ResultDialogProps>) {
  const primaryRef = useRef<HTMLButtonElement>(null)
  return (
    <ResultDialogFrame label={title} hint={sentence} initialFocus={primaryRef} onClose={onClose}>
      <div data-result-dialog="" data-orbit-state={orbitState} className="flex flex-col items-center gap-6 px-6 pb-6 pt-2 text-center">
        <OrbitHop active={orbitState === 'feliz'}><OrbitMascot size={128} state={orbitState} /></OrbitHop>
        <div aria-hidden="true" className="flex flex-col gap-3">
          <p className="font-display text-[28px] leading-[1.18] text-[var(--fg-1)]">{title}</p>
          <p className="text-[17px] leading-[26px] text-[var(--fg-2)]">{sentence}</p>
        </div>
        <ActionRow align="center">
          <div className="w-full"><PillButton buttonRef={primaryRef} matchedWidth onClick={onPrimary}>{primaryLabel}</PillButton></div>
          {secondaryLabel && onSecondary ? <div className="w-full"><PillButton variant="ghost" matchedWidth onClick={onSecondary}>{secondaryLabel}</PillButton></div> : null}
        </ActionRow>
      </div>
    </ResultDialogFrame>
  )
}
