'use client'

let lastWakeAt = -Infinity

export function wakeUpstream(): void {
  const apiBase = process.env.NEXT_PUBLIC_EVENT_API_BASE
  if (!apiBase || typeof window === 'undefined') return
  const now = Date.now()
  if (now - lastWakeAt < 60_000) return
  lastWakeAt = now
  // WHY: An opaque wake has no readable result; query retries determine recovery: https://github.com/thomasluizon/orbit-tickets/issues/1309
  void fetch(new URL('/health', apiBase).href, { mode: 'no-cors', cache: 'no-store' }).catch(() => undefined)
}
