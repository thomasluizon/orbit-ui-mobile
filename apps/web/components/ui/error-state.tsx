'use client'

import type { ErrorStateProps } from '@orbit/shared/contracts/feedback'
import { OrbitMascot, useStateMascotSize } from '@/components/ui/orbit-mascot'
import { ShellCentredRegion } from '@/components/shell/shell-centred-region'

function FullSurfaceMascot() {
  return <OrbitMascot size={useStateMascotSize()} />
}

/** A data-surface failure stated in the caller's words, with one optional text action. A full-surface error carries Orbit in Parado
 *  and centres its block in the free area of the shell, as every state surface does. */
export function ErrorState({ message, action, fullSurface = false }: Readonly<ErrorStateProps>) {
  const surface = (
    <div
      className="flex flex-col items-center gap-4 px-6 py-12 text-center"
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      data-error-state=""
    >
      {fullSurface ? <FullSurfaceMascot /> : null}
      <p
        className="max-w-[65ch] text-base text-[var(--fg-1)]"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {message}
      </p>
      {action ? <div data-error-state-action>{action}</div> : null}
    </div>
  )
  return fullSurface ? <ShellCentredRegion>{surface}</ShellCentredRegion> : surface
}
