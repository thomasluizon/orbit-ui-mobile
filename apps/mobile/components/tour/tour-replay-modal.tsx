import { useMemo, useCallback, useState, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  CheckCircle,
  MessageCircle,
  CalendarDays,
  User,
  Play,
} from '@/components/ui/icons'
import { profileKeys } from '@orbit/shared/query'
import type { Profile, TourSection } from '@orbit/shared/types'
import { TOUR_SECTIONS, TOUR_SECTION_ICONS } from '@orbit/shared/types'
import { getSectionStepCount } from '@orbit/shared/tour'
import { API } from '@orbit/shared/api'
import { apiClient } from '@/lib/api-client'
import { useTourStore } from '@/stores/tour-store'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'

type AppTokens = ReturnType<typeof createTokensV2>

const SECTION_ICON_MAP = {
  'check-circle': CheckCircle,
  'message-circle': MessageCircle,
  'calendar-days': CalendarDays,
  user: User,
} as const

interface TourReplayModalProps {
  visible: boolean
  onClose: () => void
}

export function TourReplayModal({ visible, onClose }: Readonly<TourReplayModalProps>) {
  const { t } = useTranslation()
  const { sheetRef, closeSheet } = useSheetHost()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const queryClient = useQueryClient()
  const { startFullTour, startSectionReplay } = useTourStore()
  const [sectionCompletion, setSectionCompletion] = useState<
    Record<TourSection, boolean>
  >({
    habits: false,
    chat: false,
    calendar: false,
    profile: false,
    'coach-today': false,
    'coach-astra': false,
    'coach-calendar': false,
  })

  useEffect(() => {
    if (visible) {
      void AsyncStorage.getItem('orbit_tour_sections').then((stored) => {
        if (stored) setSectionCompletion(JSON.parse(stored) as Record<TourSection, boolean>)
      })
    }
  }, [visible])

  const resetTourProgress = useCallback(async () => {
    queryClient.setQueryData(
      profileKeys.detail(),
      (old: Profile | undefined) => {
        if (!old) return old
        return { ...old, hasCompletedTour: false }
      },
    )

    try {
      await apiClient(API.profile.tour, { method: 'DELETE' })
    } catch {
    }
  }, [queryClient])

  const handleReplayAll = useCallback(() => {
    closeSheet(() => {
      onClose()
      void resetTourProgress()
      startFullTour()
    })
  }, [closeSheet, onClose, resetTourProgress, startFullTour])

  const handleReplaySection = useCallback(
    (section: TourSection) => {
      closeSheet(() => {
        onClose()
        startSectionReplay(section)
      })
    },
    [closeSheet, onClose, startSectionReplay],
  )

  return (
    visible ? (<Sheet
      ref={sheetRef}
      open
      onClose={onClose}
      title={t('tour.replay.modalTitle')}
    >
      <View style={styles.body}>
        <PillButton onClick={handleReplayAll}>
          {t('tour.replay.replayAll')}
        </PillButton>

        <View style={styles.sectionList}>
          {TOUR_SECTIONS.map((section, index) => {
            const iconKey = TOUR_SECTION_ICONS[section]
            const Icon =
              SECTION_ICON_MAP[iconKey as keyof typeof SECTION_ICON_MAP]
            const stepCount = getSectionStepCount(section)
            const completed = sectionCompletion[section]

            return (
              <View key={section}>
                {index > 0 ? <View style={styles.sectionDivider} /> : null}
                <Pressable
                  style={({ pressed }) => [
                    styles.sectionRow,
                    pressed && styles.sectionRowPressed,
                  ]}
                  onPress={() => handleReplaySection(section)}
                  accessibilityRole="button"
                >
                  <View style={styles.sectionIconSlot}>
                    <Icon size={22} color={tokens.fg1} strokeWidth={1.8} />
                  </View>
                  <View style={styles.sectionBody}>
                    <Text style={styles.sectionTitle}>
                      {t(`tour.sections.${section}`)}
                    </Text>
                    <Text style={styles.sectionSteps}>
                      {t('tour.replay.steps', { count: stepCount })}
                    </Text>
                  </View>
                  {completed ? (
                    <CheckCircle size={18} color={tokens.statusDone} strokeWidth={1.8} />
                  ) : (
                    <Play size={18} color={tokens.fg4} strokeWidth={1.8} />
                  )}
                </Pressable>
              </View>
            )
          })}
        </View>
      </View>
    </Sheet>) : null
  )
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    body: {
      paddingHorizontal: 22,
      paddingBottom: 8,
    },
    replayAll: {
      marginBottom: 16,
    },
    sectionList: {
      gap: 0,
    },
    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 16,
      paddingHorizontal: 8,
      marginHorizontal: -8,
      borderRadius: 12,
      minHeight: 44,
    },
    sectionRowPressed: {
      backgroundColor: tokens.bgElev,
    },
    sectionDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: tokens.hairline,
    },
    sectionIconSlot: {
      width: 26,
      alignItems: 'center',
    },
    sectionBody: {
      flex: 1,
      gap: 2,
    },
    sectionTitle: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 18,
      color: tokens.fg1,
    },
    sectionSteps: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      color: tokens.fg3,
    },
  })
}
