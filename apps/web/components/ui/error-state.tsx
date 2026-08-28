'use client'

import type { ErrorStateProps } from '@orbit/shared/contracts/feedback'

/** A data-surface failure stated in the caller's words, with one optional text action. */
export function ErrorState({ message, action }: Readonly<ErrorStateProps>) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <p
        className="max-w-[65ch] text-base text-[var(--fg-1)]"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {message}
      </p>
      {action ? <div data-error-state-action>{action}</div> : null}
    </div>
  )
}
