'use client'

import { useEffect, useRef } from 'react'
import { useThrottleStore } from '@/stores/throttle-store'
import { getQueryClient } from '@/lib/query-client'
import { FailureScreen } from './failure-screen'

export function ThrottleScreen() {
  const { error, clear } = useThrottleStore()
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (error) dialog.current?.showModal()
    else dialog.current?.close()
  }, [error])
  return (
    <dialog ref={dialog} aria-labelledby="throttle-heading" onCancel={(event) => event.preventDefault()}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-[var(--bg)] p-0 text-[var(--fg-1)]">
      {error ? <FailureScreen error={error} titleId="throttle-heading" retry={async () => {
        clear()
        await getQueryClient().refetchQueries({ type: 'active' })
      }} /> : null}
    </dialog>
  )
}
