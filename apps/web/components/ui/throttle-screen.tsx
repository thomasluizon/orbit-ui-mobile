'use client'

import { useEffect, useRef } from 'react'
import { useThrottleStore } from '@/stores/throttle-store'
import { getQueryClient } from '@/lib/query-client'
import { DesktopWindowBar } from '@/components/desktop-window-bar'
import { FailureScreen } from './failure-screen'

/** A modal dialog makes the rest of the page inert and covers it, so the screen draws its own desktop window bar, after its content as the root layout does. */
export function ThrottleScreen() {
  const { error, clear } = useThrottleStore()
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (error) dialog.current?.showModal()
    else dialog.current?.close()
  }, [error])
  return (
    <dialog ref={dialog} aria-labelledby="throttle-heading" onCancel={(event) => event.preventDefault()}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-[var(--bg)] p-0 pt-[var(--safe-top)] pb-[var(--safe-bottom)] pl-[var(--safe-left)] pr-[var(--safe-right)] text-[var(--fg-1)]">
      {error ? <>
        <FailureScreen error={error} titleId="throttle-heading" retry={async () => {
          clear()
          await getQueryClient().refetchQueries({ type: 'active' })
        }} />
        <DesktopWindowBar />
      </> : null}
    </dialog>
  )
}
