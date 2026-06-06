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

    try {
      await resetTour()
    } catch {
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
      <div className="space-y-5">
        <button
          type="button"
          onClick={handleReplayAll}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[var(--primary-pressed)]"
        >
          <RotateCcw className="size-4" />
          {t('tour.replay.replayAll')}
        </button>

        <div>
          {availableSections.map((section, index) => {
            const iconKey = TOUR_SECTION_ICONS[section]
            const Icon = SECTION_ICON_MAP[iconKey as keyof typeof SECTION_ICON_MAP]
            const stepCount = getSectionStepCount(section)
            const completed = sectionCompletion[section]

            return (
              <div key={section}>
                {index > 0 ? (
                  <div className="h-px bg-[var(--hairline)]" />
                ) : null}
                <button
                  type="button"
                  onClick={() => handleReplaySection(section)}
                  className="w-full flex items-center gap-3.5 py-3.5 text-left transition-opacity hover:opacity-70"
                >
                  {Icon && (
                    <Icon
                      className="size-[18px] shrink-0 text-[var(--fg-3)]"
                      strokeWidth={1.6}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium text-[var(--fg-1)]">
                      {t(`tour.sections.${section}`)}
                    </p>
                    <p className="text-[13px] text-[var(--fg-3)] mt-0.5">
                      {t('tour.replay.steps', { count: stepCount })}
                    </p>
                  </div>
                  {completed ? (
                    <CheckCircle className="size-4 text-[var(--status-done)] shrink-0" />
                  ) : (
                    <Play className="size-4 text-[var(--fg-3)] shrink-0" />
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </AppOverlay>
  )
}
