'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { PillButton } from '@/components/ui/pill-button'
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
        <PillButton
          fullWidth
          onClick={() => {
            void handleReplayAll()
          }}
          leading={<RotateCcw size={18} strokeWidth={1.8} aria-hidden="true" />}
        >
          {t('tour.replay.replayAll')}
        </PillButton>

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
                  className="w-full flex items-center text-left cursor-pointer bg-transparent transition-colors duration-150 ease-out hover:bg-[var(--bg-elev)]"
                  style={{
                    appearance: 'none',
                    border: 0,
                    padding: '14px 0',
                    gap: 14,
                  }}
                >
                  {Icon && (
                    <span
                      aria-hidden="true"
                      className="inline-flex shrink-0 justify-center"
                      style={{ width: 26 }}
                    >
                      <Icon size={22} strokeWidth={1.8} color="var(--fg-1)" />
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: 16,
                        fontWeight: 400,
                        lineHeight: 1.25,
                        color: 'var(--fg-1)',
                      }}
                    >
                      {t(`tour.sections.${section}`)}
                    </p>
                    <p
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: 13,
                        lineHeight: 1.35,
                        color: 'var(--fg-3)',
                        marginTop: 2,
                      }}
                    >
                      {t('tour.replay.steps', { count: stepCount })}
                    </p>
                  </div>
                  {completed ? (
                    <CheckCircle
                      size={18}
                      strokeWidth={1.8}
                      className="shrink-0"
                      color="var(--status-done)"
                    />
                  ) : (
                    <Play
                      size={18}
                      strokeWidth={1.8}
                      className="shrink-0"
                      color="var(--fg-3)"
                    />
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
