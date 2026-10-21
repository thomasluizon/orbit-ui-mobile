import { motionDurations } from '../theme/motion'
import { DAILY_STREAK_MOMENT_DURATION } from './celebration-queue'

export type CelebrationPhase = 'enter' | 'hold' | 'manual-exit' | 'automatic-exit'
export interface CelebrationPresentationSnapshot {
  phase: CelebrationPhase
  revision: number
  hidden: boolean
  startedAt: number
  exitDeadline: number | null
}

export class CelebrationPresentation {
  private snapshot: CelebrationPresentationSnapshot
  private listeners = new Set<() => void>()
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private pauses = new Set<'focus' | 'hover'>()
  private deadline: number | null = null
  private running = false
  private completed = false
  private reduced: boolean
  private backgroundSettled = false

  constructor(private readonly options: {
    daily: boolean
    reduced: boolean
    isCurrent: () => boolean
    complete: () => void
  }) {
    this.reduced = options.reduced
    this.snapshot = { phase: options.reduced ? 'hold' : 'enter', revision: 0, hidden: false, startedAt: 0, exitDeadline: null }
  }

  getSnapshot = (): CelebrationPresentationSnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  start(hidden: boolean): void {
    this.backgroundSettled = hidden
    this.running = true
    this.completed = false
    this.snapshot = { ...this.snapshot, startedAt: Date.now(), hidden }
    if (hidden) this.update({ phase: 'hold' })
    if (this.options.daily) this.deadline = Date.now() + DAILY_STREAK_MOMENT_DURATION
    this.schedule()
  }

  stop = (): void => {
    this.running = false
    this.clearTimers()
  }

  private update(change: Partial<CelebrationPresentationSnapshot>) {
    this.snapshot = { ...this.snapshot, ...change, revision: this.snapshot.revision + 1 }
    this.listeners.forEach((listener) => listener())
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout)
    this.timers.clear()
  }

  private later(deadline: number, callback: () => void) {
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      if (this.running && !this.completed && this.options.isCurrent()) callback()
    }, Math.max(0, deadline - Date.now()))
    this.timers.add(timer)
  }

  private complete() {
    if (!this.running || this.completed || !this.options.isCurrent()) return
    this.completed = true
    this.clearTimers()
    this.options.complete()
  }

  finishExit = (revision: number): void => {
    if (revision !== this.snapshot.revision || this.snapshot.exitDeadline === null) return
    if (Date.now() >= this.snapshot.exitDeadline) this.complete()
  }

  dismiss = (): void => {
    if (!this.running || this.completed || this.snapshot.phase === 'manual-exit') return
    this.beginExit('manual-exit')
  }

  private beginExit(phase: 'manual-exit' | 'automatic-exit') {
    this.clearTimers()
    if (this.reduced) { this.complete(); return }
    const exitDeadline = phase === 'automatic-exit' ? this.deadline! : Date.now() + motionDurations.base
    this.update({ phase, exitDeadline })
    const revision = this.snapshot.revision
    this.later(exitDeadline, () => this.finishExit(revision))
  }

  pause = (reason: 'focus' | 'hover', paused: boolean): void => {
    if (this.snapshot.phase === 'manual-exit' || this.completed) return
    if (paused === this.pauses.has(reason)) return
    if (paused) this.pauses.add(reason)
    else this.pauses.delete(reason)
    if (!this.options.daily) return
    this.clearTimers()
    this.deadline = this.pauses.size ? null : Date.now() + DAILY_STREAK_MOMENT_DURATION
    if (this.snapshot.phase === 'automatic-exit') this.update({ phase: 'hold', exitDeadline: null })
    this.schedule()
  }

  setReducedMotion(reduced: boolean): void {
    if (this.reduced === reduced) return
    this.reduced = reduced
    if (this.snapshot.exitDeadline !== null) { this.complete(); return }
    this.clearTimers()
    this.update({ phase: 'hold' })
    this.schedule()
  }

  setHidden = (hidden: boolean): void => {
    if (hidden === this.snapshot.hidden) return
    this.backgroundSettled = true
    this.clearTimers()
    if (this.deadline !== null && Date.now() >= this.deadline) { this.complete(); return }
    if (this.snapshot.phase === 'manual-exit') {
      const { exitDeadline } = this.snapshot
      this.update({ hidden })
      if (exitDeadline !== null) this.later(exitDeadline, () => this.complete())
      return
    }
    this.update({ hidden, phase: 'hold', exitDeadline: null })
    this.schedule()
  }

  private schedule() {
    if (!this.running || this.completed) return
    if (this.snapshot.phase === 'enter') {
      this.later(this.snapshot.startedAt + motionDurations.slow, () => {
        if (this.snapshot.phase === 'enter') this.update({ phase: 'hold' })
      })
    }
    if (this.deadline === null) return
    const deadline = this.deadline
    if (Date.now() >= deadline) { this.complete(); return }
    if (this.reduced || this.snapshot.hidden || this.backgroundSettled) this.later(deadline, () => this.complete())
    else this.later(deadline - motionDurations.base, () => {
      if (Date.now() >= deadline) this.complete()
      else this.beginExit('automatic-exit')
    })
  }
}
