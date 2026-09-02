'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import { useTourStore } from '@/stores/tour-store'
import { resetTour } from '@/app/actions/profile'
import { useQueryClient } from '@tanstack/react-query'
import { profileKeys } from '@orbit/shared/query'
import type { Profile, TourSection } from '@orbit/shared/types'
import { TOUR_SECTIONS, TOUR_SECTION_ICONS } from '@orbit/shared/types'
import { getSectionStepCount } from '@orbit/shared/tour'
import {
  CheckCircle,
  MessageCircle,
  CalendarDays,
  User,
  Play,
} from '@/components/ui/icons'

const SECTION_ICON_MAP = {
  'check-circle': CheckCircle,
  'message-circle': MessageCircle,
  'calendar-days': CalendarDays,
  'user': User,
} as const

const SECTION_ROUTE_MAP: Record<TourSection, string> = {
  habits: '/',
  chat: '/chat',
  calendar: '/calendar',
  profile: '/profile',
  'coach-today': '/',
  'coach-astra': '/chat',
  'coach-calendar': '/calendar',
}

interface TourReplayModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function getSectionCompletion(): Record<TourSection, boolean> {
  try {
    const stored = localStorage.getItem('orbit_tour_sections:v1')
    if (stored) return JSON.parse(stored) as Record<TourSection, boolean>
  } catch {
  }
  return {
    habits: false,
    chat: false,
    calendar: false,
    profile: false,
    'coach-today': false,
    'coach-astra': false,
    'coach-calendar': false,
  }
}

export function TourReplayModal({ open, onOpenChange }: Readonly<TourReplayModalProps>) {
  const t = useTranslations()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { startFullTour, startSectionReplay } = useTourStore()
  const sectionCompletion = getSectionCompletion()

  const { sheetRef, closeSheet } = useSheetHost()

  const resetTourProgress = useCallback(async () => {
    queryClient.setQueryData(profileKeys.detail(), (old: Profile | undefined) => {
      if (!old) return old
      return { ...old, hasCompletedTour: false }
    })

    try {
      await resetTour()
    } catch {
    }
  }, [queryClient])

  const handleReplayAll = useCallback(() => {
    closeSheet(() => {
      onOpenChange(false)
      void resetTourProgress()
      router.push('/')
      startFullTour()
    })
  }, [closeSheet, onOpenChange, resetTourProgress, router, startFullTour])

  const handleReplaySection = useCallback(
    (section: TourSection) => {
      closeSheet(() => {
        onOpenChange(false)
        router.push(SECTION_ROUTE_MAP[section])
        startSectionReplay(section)
      })
    },
    [closeSheet, onOpenChange, router, startSectionReplay],
  )

  return (
    open ? (<Sheet
      ref={sheetRef}
      open
      onClose={() => onOpenChange(false)}
      title={t('tour.replay.modalTitle')}
    >
      <div className="space-y-5 sm:mx-auto sm:w-full sm:max-w-[360px]">
        <div>
          <PillButton onClick={handleReplayAll}>
            {t('tour.replay.replayAll')}
          </PillButton>
        </div>

        <div>
          {TOUR_SECTIONS.map((section, index) => {
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
                  className="w-full flex items-center text-left cursor-pointer bg-transparent transition-colors duration-150 ease-out hover:bg-[var(--bg-elev)] active:bg-[var(--bg-hover)]"
                  style={{
                    appearance: 'none',
                    border: 0,
                    padding: '14px 8px 14px 0',
                    gap: 14,
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex shrink-0 justify-center"
                    style={{ width: 26 }}
                  >
                    <Icon size={22} strokeWidth={1.8} color="var(--fg-1)" />
                  </span>
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
                      color="var(--fg-4)"
                    />
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </Sheet>) : null
  )
}
