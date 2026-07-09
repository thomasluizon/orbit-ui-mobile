import { useMemo, useCallback, useState, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  CheckCircle,
  Target,
  MessageCircle,
  CalendarDays,
  User,
  Play,
  RotateCcw,
} from 'lucide-react-native'
import { profileKeys } from '@orbit/shared/query'
import type { Profile, TourSection } from '@orbit/shared/types'
import { TOUR_SECTIONS, TOUR_SECTION_ICONS } from '@orbit/shared/types'
import { getSectionStepCount } from '@orbit/shared/tour'
import { API } from '@orbit/shared/api'
import { apiClient } from '@/lib/api-client'
import { useTourStore } from '@/stores/tour-store'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { PillButton } from '@/components/ui/pill-button'
import { useProfile } from '@/hooks/use-profile'

type AppTokens = ReturnType<typeof createTokensV2>

const SECTION_ICON_MAP = {
  'check-circle': CheckCircle,
  target: Target,
  'message-circle': MessageCircle,
  'calendar-days': CalendarDays,
  user: User,
} as const

interface TourReplayModalProps {
  visible: boolean
  onClose: () => void
}

export function TourReplayModal({ visible, onClose }: TourReplayModalProps) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const queryClient = useQueryClient()
  const { startFullTour, startSectionReplay } = useTourStore()
  const { profile } = useProfile()
  const [sectionCompletion, setSectionCompletion] = useState<
    Record<TourSection, boolean>
  >({
    habits: false,
    goals: false,
    chat: false,
    calendar: false,
    profile: false,
    'coach-today': false,
    'coach-astra': false,
    'coach-calendar': false,
  })
  const availableSections = TOUR_SECTIONS.filter((section) =>
    profile?.hasProAccess ? true : section !== 'goals',
  )

  useEffect(() => {
    if (visible) {
      void AsyncStorage.getItem('orbit_tour_sections').then((stored) => {
        if (stored) setSectionCompletion(JSON.parse(stored) as Record<TourSection, boolean>)
      })
    }
  }, [visible])

  const handleReplayAll = useCallback(async () => {
    onClose()

    try {
      await apiClient(API.profile.tour, { method: 'DELETE' })
    } catch {
    }

    queryClient.setQueryData(
      profileKeys.detail(),
      (old: Profile | undefined) => {
        if (!old) return old
        return { ...old, hasCompletedTour: false }
      },
    )

    startFullTour()
  }, [onClose, queryClient, startFullTour])

  const handleReplaySection = useCallback(
    (section: TourSection) => {
      onClose()
      startSectionReplay(section)
    },
    [onClose, startSectionReplay],
  )

  return (
    <BottomSheetModal
      open={visible}
      onClose={onClose}
      title={t('tour.replay.modalTitle')}
      snapPoints={['80%']}
    >
      <View style={styles.body}>
        <PillButton
          fullWidth
          onPress={() => void handleReplayAll()}
          leading={<RotateCcw size={18} color={tokens.fgOnPrimary} strokeWidth={1.8} />}
          style={styles.replayAll}
        >
          {t('tour.replay.replayAll')}
        </PillButton>

        <View style={styles.sectionList}>
          {availableSections.map((section, index) => {
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
    </BottomSheetModal>
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
