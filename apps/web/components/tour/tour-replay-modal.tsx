'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle,
  Target,
  MessageCircle,
  CalendarDays,
  User,
  Play,
  RotateCcw,
} from 'lucide-react'
import { profileKeys } from '@orbit/shared/query'
import type { Profile, TourSection } from '@orbit/shared/types'
import { TOUR_SECTIONS, TOUR_SECTION_ICONS } from '@orbit/shared/types'
import { getSectionStepCount } from '@orbit/shared/tour'
import { useProfile } from '@/hooks/use-profile'
import { useTourStore } from '@/stores/tour-store'
import { AppOverlay } from '@/components/ui/app-overlay'

const SECTION_ICON_MAP = {
  'check-circle': CheckCircle,
  target: Target,
  'message-circle': MessageCircle,
  'calendar-days': CalendarDays,
  user: User,
} as const

interface TourReplayModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Web port of `apps/mobile/components/tour/tour-replay-modal.tsx`.
 *
 * Originally only present on mobile. The user wants both platforms at
 * parity, so this back-ports the modal: replay-all + per-section replay
 * with a section-completion checkmark sourced from localStorage. Renders
 * via `AppOverlay` so it adapts to Dialog (desktop) or Drawer (mobile)
 * automatically.
 *
 * The shared `useTourStore` exposes `startFullTour` /
 * `startSectionReplay` so the action wiring is identical between web
 * and mobile. Reset of `hasCompletedTour` goes through
 * `DELETE /api/profile/tour` via the catch-all proxy.
 */
export function TourReplayModal({ open, onOpenChange }: TourReplayModalProps) {
  const t = useTranslations()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { startFullTour, startSectionReplay } = useTourStore()
  const { profile } = useProfile()

  const [sectionCompletion, setSectionCompletion] = useState<Record<TourSection, boolean>>({
    habits: false,
    goals: false,
    chat: false,
    calendar: false,
    profile: false,
  })

  const availableSections = TOUR_SECTIONS.filter((section) =>
    profile?.hasProAccess ? true : section !== 'goals',
  )

  // Section completion is stored client-side to give immediate feedback
  // without a round-trip. Mirrors the mobile implementation which uses
  // AsyncStorage; web uses localStorage under the same key.
  useEffect(() => {
    if (!open) return
    try {
      const raw = globalThis.localStorage.getItem('orbit_tour_sections')
      if (raw) setSectionCompletion(JSON.parse(raw))
    } catch {
      // Storage failures are non-fatal.
    }
  }, [open])

  const handleReplayAll = useCallback(async () => {
    onOpenChange(false)

    try {
      await fetch('/api/profile/tour', { method: 'DELETE' })
    } catch {
      // Silently fail — the optimistic cache update below is what
      // unlocks the tour locally.
    }

    queryClient.setQueryData(profileKeys.detail(), (old: Profile | undefined) => {
      if (!old) return old
      return { ...old, hasCompletedTour: false }
    })

    router.push('/')
    setTimeout(() => startFullTour(), 300)
  }, [onOpenChange, queryClient, router, startFullTour])

  const handleReplaySection = useCallback(
    (section: TourSection) => {
      onOpenChange(false)

      const routeMap: Record<TourSection, string> = {
        habits: '/',
        goals: '/',
        chat: '/chat',
        calendar: '/calendar',
        profile: '/profile',
      }

      router.push(routeMap[section])
      setTimeout(() => startSectionReplay(section), 300)
    },
    [onOpenChange, router, startSectionReplay],
  )

  return (
    <AppOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={t('tour.replay.modalTitle')}
    >
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={handleReplayAll}
          className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-all active:scale-[0.98]"
        >
          <RotateCcw className="size-4" />
          {t('tour.replay.replayAll')}
        </button>

        <div className="h-px bg-border" />

        <div className="flex flex-col gap-2">
          {availableSections.map((section) => {
            const iconKey = TOUR_SECTION_ICONS[section]
            const Icon = SECTION_ICON_MAP[iconKey as keyof typeof SECTION_ICON_MAP]
            const stepCount = getSectionStepCount(section)
            const completed = sectionCompletion[section]

            return (
              <button
                key={section}
                type="button"
                onClick={() => handleReplaySection(section)}
                className="flex items-center gap-3 rounded-2xl border border-border-muted bg-surface p-4 text-left transition-colors hover:bg-surface-elevated"
              >
                <div className="rounded-xl bg-primary/10 p-2.5">
                  {Icon ? <Icon className="size-4 text-primary" /> : null}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-text-primary">
                    {t(`tour.sections.${section}`)}
                  </div>
                  <div className="mt-0.5 text-xs text-text-secondary">
                    {t('tour.replay.steps', { count: stepCount })}
                  </div>
                </div>
                {completed ? (
                  <CheckCircle className="size-4 text-emerald-500" />
                ) : (
                  <Play className="size-4 text-text-muted" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </AppOverlay>
  )
}
