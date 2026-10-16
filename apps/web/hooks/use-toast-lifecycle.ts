'use client'

import { useCallback, useEffect, useEffectEvent, useState } from 'react'
import { getToastDuration, subscribeToastNavigation, ToastLifetime } from '@orbit/shared/hooks'
import type { ToastProps } from '@orbit/shared/contracts/feedback'

export function useToastLifecycle(
  props: ToastProps,
  paused: boolean,
  onDismiss?: () => void,
) {
  const { kind, message } = props
  const hasAction = Boolean(props.actionLabel)
  const onDone = kind === 'neutral' || kind === 'done' ? props.onDone : undefined
  const duration = getToastDuration(props.doneAfterMs)
  const timed = hasAction || Boolean(onDone)
  const [lifecycle, setLifecycle] = useState(() => ({ kind, message, duration, lifetime: new ToastLifetime(duration) }))
  if (lifecycle.kind !== kind || lifecycle.message !== message || lifecycle.duration !== duration) {
    setLifecycle({ kind, message, duration, lifetime: new ToastLifetime(duration) })
  }
  const { lifetime } = lifecycle
  const [dismissedLifetime, setDismissedLifetime] = useState<ToastLifetime | null>(null)
  const dismiss = useCallback(() => {
    if (!lifetime.finish()) return
    setDismissedLifetime(lifetime)
    onDone?.()
    onDismiss?.()
  }, [lifetime, onDone, onDismiss])
  const finish = useEffectEvent(dismiss)

  useEffect(() => {
    if (timed && !paused) lifetime.start(() => finish())
    return () => lifetime.pause()
  }, [lifetime, paused, timed])

  useEffect(() => subscribeToastNavigation(() => { if (hasAction) finish() }), [hasAction])
  return { dismissed: dismissedLifetime === lifetime, dismiss }
}
