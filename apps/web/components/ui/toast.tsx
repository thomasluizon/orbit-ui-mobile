'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ToastProps } from '@orbit/shared/contracts/feedback'
import { Check } from '@/components/ui/icons'

const MINIMUM_DONE_LIFE_MS = 5000

function useDoneTimer(
  kind: ToastProps['kind'],
  message: string,
  doneAfterMs: number | undefined,
  onDone: (() => void) | undefined,
  paused: boolean,
) {
  const remainingMs = useRef(MINIMUM_DONE_LIFE_MS)
  const completed = useRef(false)

  useEffect(() => {
    remainingMs.current = Math.max(MINIMUM_DONE_LIFE_MS, doneAfterMs ?? MINIMUM_DONE_LIFE_MS)
    completed.current = false
  }, [doneAfterMs, kind, message, onDone])

  useEffect(() => {
    if (kind !== 'done' || paused || completed.current || !onDone) return

    const startedAt = Date.now()
    const timer = window.setTimeout(() => {
      if (completed.current) return
      completed.current = true
      remainingMs.current = 0
      onDone()
    }, remainingMs.current)

    return () => {
      window.clearTimeout(timer)
      if (!completed.current) {
        remainingMs.current = Math.max(0, remainingMs.current - (Date.now() - startedAt))
      }
    }
  }, [kind, onDone, paused])
}

function WorkingMark() {
  return (
    <span className="flex items-center gap-1 text-[var(--fg-2)]" data-working-mark aria-hidden="true">
      <span className="size-1 rounded-full bg-current" />
      <span className="size-1 rounded-full bg-current" />
      <span className="size-1 rounded-full bg-current" />
    </span>
  )
}

function DoneMark() {
  return (
    <span
      className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--status-done)] text-[var(--bg)]"
      data-done-mark
      aria-hidden="true"
    >
      <Check size={16} strokeWidth={2.4} />
    </span>
  )
}

/** Stable live-region feedback. It owns no portal, position, scrim, focus, or z-index. */
export function Toast(props: Readonly<ToastProps>) {
  const [announcedMessage, setAnnouncedMessage] = useState('')
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const onDone = props.kind === 'done' ? props.onDone : undefined
  const doneAfterMs = props.kind === 'done' ? props.doneAfterMs : undefined

  useDoneTimer(props.kind, props.message, doneAfterMs, onDone, hovered || focused)

  useEffect(() => {
    const timer = window.setTimeout(() => setAnnouncedMessage(props.message), 0)
    return () => window.clearTimeout(timer)
  }, [props.message])

  const handleBlur = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
  }, [])

  const role = props.kind === 'lost' ? 'alert' : 'status'

  return (
    <div
      role={role}
      aria-live={props.kind === 'lost' ? 'assertive' : 'polite'}
      aria-atomic="true"
      data-kind={props.kind}
      tabIndex={-1}
      className="flex items-center gap-3 rounded-[var(--r-card)] bg-[var(--bg-elev)] p-4 text-[var(--fg-1)] shadow-[var(--sh-2)]"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={handleBlur}
    >
      {props.kind === 'working' ? <WorkingMark /> : null}
      {props.kind === 'done' ? <DoneMark /> : null}
      {(props.kind === 'neutral' || props.kind === 'lost') && props.icon ? (
        <span className="shrink-0 text-[var(--fg-2)]" aria-hidden="true">
          {props.icon}
        </span>
      ) : null}

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-medium" style={{ fontFamily: 'var(--font-sans)' }}>
          {announcedMessage}
        </span>
        {props.kind === 'lost' && announcedMessage ? (
          <span className="text-sm text-[var(--fg-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
            {props.detail}
          </span>
        ) : null}
      </span>

      {(props.kind === 'neutral' || props.kind === 'lost') && props.actionLabel ? (
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent p-2 text-sm font-medium text-[var(--fg-1)] underline underline-offset-4 hover:text-[var(--fg-2)]"
          style={{ fontFamily: 'var(--font-sans)' }}
          onFocus={() => setFocused(true)}
          onClick={props.onAction}
        >
          {props.actionLabel}
        </button>
      ) : null}
    </div>
  )
}
