import { PlanAnnouncementTracker } from '../chat/astra-plan'
import type { ChatMessage } from '../types/chat'
import type { StateHook } from './state-adapter'

interface PlanAnnouncementAdapters {
  useState: StateHook
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) => void
}

export type PlanAnnouncementHook = (messages: readonly ChatMessage[], runningLabel: string) => string

export function createUsePlanAnnouncement({ useState, useEffect }: PlanAnnouncementAdapters): PlanAnnouncementHook {
  return function usePlanAnnouncement(messages, runningLabel) {
    const [tracker] = useState(() => new PlanAnnouncementTracker())
    const [announcement, setAnnouncement] = useState('')
    useEffect(() => {
      let mounted = true
      void Promise.resolve().then(() => {
        if (!mounted) return
        const next = tracker.next(messages, runningLabel)
        if (next) setAnnouncement(next)
      })
      return () => { mounted = false }
    }, [messages, runningLabel, tracker])
    return announcement
  }
}
