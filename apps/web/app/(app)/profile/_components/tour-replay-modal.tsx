'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { useTourStore } from '@/stores/tour-store'
import { resetTour } from '@/app/actions/profile'
import { useQueryClient } from '@tanstack/react-query'
import { profileKeys } from '@orbit/shared/query'
import type { Profile, TourSection } from '@orbit/shared/types'
import { useProfile } from '@/hooks/use-profile'
import { TOUR_SECTIONS, TOUR_SECTION_ICONS } from '@orbit/shared/types'
import { getSectionStepCount } from '@orbit/shared/tour'
import {
  CheckCircle,
  Target,
  MessageCircle,
  CalendarDays,
  User,
  Play,
  RotateCcw,
} from 'lucide-react'

const SECTION_ICON_MAP = {
  'check-circle': CheckCircle,
  'target': Target,
  'message-circle': MessageCircle,
  'calendar-days': CalendarDays,
  'user': User,
} as const

interface TourReplayModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function getSectionCompletion(): Record<TourSection, boolean> {
  try {
    const stored = localStorage.getItem('orbit_tour_sections')
    if (stored) return JSON.parse(stored)
  } catch {
    // fallback
  }
  return { habits: false, goals: false, chat: false, calendar: false, profile: false }
}

export function TourReplayModal({ open, onOpenChange }: Readonly<TourReplayModalProps>) {
  const t = useTranslations()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { startFullTour, startSectionReplay } = useTourStore()
  const { profile } = useProfile()
  const sectionCompletion = getSectionCompletion()
  const availableSections = TOUR_SECTIONS.filter((section) =>
    profile?.hasProAccess ? true : section !== 'goals',
  )

  const handleReplayAll = useCallback(async () => {
    onOpenChange(false)

    // Reset tour on backend
    try {
      await resetTour()
    } catch {
      // Silently fail
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
      <div className="space-y-4">
        {/* Replay full tour button */}
        <button
          type="button"
          onClick={handleReplayAll}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[var(--primary-pressed)]"
        >
          <RotateCcw className="size-4" />
          {t('tour.replay.replayAll')}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-[var(--fg-3)]">
            {t('tour.sections.habits').charAt(0).toUpperCase()}
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Section cards */}
        <div className="space-y-2">
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
                className="w-full flex items-center gap-3 rounded-xl border border-[var(--hairline)] bg-[var(--bg-elev)] p-4 text-left transition-colors hover:bg-[var(--bg-elev)] hover:border-[var(--hairline)]"
              >
                <div className="shrink-0 flex items-center justify-center rounded-lg bg-[var(--bg-sunk)] p-2.5">
                  {Icon && <Icon className="size-4 text-[var(--primary)]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--fg-1)]">
                    {t(`tour.sections.${section}`)}
                  </p>
                  <p className="text-xs text-[var(--fg-2)]">
                    {t('tour.replay.steps', { count: stepCount })}
                  </p>
                </div>
                {completed ? (
                  <CheckCircle className="size-4 text-[var(--status-done)] shrink-0" />
                ) : (
                  <Play className="size-4 text-[var(--fg-3)] shrink-0" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </AppOverlay>
  )
}
