const MINIMUM_TOAST_LIFE_MS = 5000

export function getToastDuration(requestedDuration?: number): number {
  return Math.max(MINIMUM_TOAST_LIFE_MS, requestedDuration ?? MINIMUM_TOAST_LIFE_MS)
}

export class ToastLifetime {
  private remainingMs: number
  private startedAt = 0
  private completed = false
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(duration: number) {
    this.remainingMs = duration
  }

  start(onDone: () => void): void {
    if (this.completed || this.timer !== undefined) return
    this.startedAt = Date.now()
    this.timer = setTimeout(onDone, this.remainingMs)
  }

  pause(): void {
    if (this.timer === undefined) return
    clearTimeout(this.timer)
    this.timer = undefined
    this.remainingMs = Math.max(0, this.remainingMs - (Date.now() - this.startedAt))
  }

  finish(): boolean {
    if (this.completed) return false
    this.pause()
    this.completed = true
    return true
  }
}

const navigationListeners = new Set<() => void>()

export function subscribeToastNavigation(listener: () => void): () => void {
  navigationListeners.add(listener)
  return () => { navigationListeners.delete(listener) }
}

export function notifyToastNavigation(): void {
  for (const listener of [...navigationListeners]) listener()
}
