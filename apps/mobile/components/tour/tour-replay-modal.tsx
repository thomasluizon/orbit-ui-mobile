import { useMemo, useCallback, useState, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native'
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
  X,
} from 'lucide-react-native'
import { profileKeys } from '@orbit/shared/query'
import type { Profile, TourSection } from '@orbit/shared/types'
import { TOUR_SECTIONS, TOUR_SECTION_ICONS } from '@orbit/shared/types'
import { getSectionStepCount } from '@orbit/shared/tour'
import { API } from '@orbit/shared/api'
import { apiClient } from '@/lib/api-client'
import { useTourStore } from '@/stores/tour-store'
import { useAppTheme } from '@/lib/use-app-theme'
import { createColors } from '@/lib/theme'
import { useProfile } from '@/hooks/use-profile'

type AppColors = ReturnType<typeof createColors>

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
  const { colors } = useAppTheme()
  const styles = useMemo(() => createModalStyles(colors), [colors])
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
  })
  const availableSections = TOUR_SECTIONS.filter((section) =>
    profile?.hasProAccess ? true : section !== 'goals',
  )

  useEffect(() => {
    if (visible) {
      AsyncStorage.getItem('orbit_tour_sections').then((stored) => {
        if (stored) setSectionCompletion(JSON.parse(stored))
      })
    }
  }, [visible])

  const handleReplayAll = useCallback(async () => {
    onClose()

    try {
      await apiClient(API.profile.tour, { method: 'DELETE' })
    } catch {
      // Silently fail
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
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouch} onPress={onClose} />
        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {t('tour.replay.modalTitle')}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Replay all */}
          <Pressable style={styles.replayAllButton} onPress={handleReplayAll}>
            <RotateCcw size={16} color={colors.white} />
            <Text style={styles.replayAllText}>
              {t('tour.replay.replayAll')}
            </Text>
          </Pressable>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Section cards */}
          {availableSections.map((section) => {
            const iconKey = TOUR_SECTION_ICONS[section]
            const Icon =
              SECTION_ICON_MAP[iconKey as keyof typeof SECTION_ICON_MAP]
            const stepCount = getSectionStepCount(section)
            const completed = sectionCompletion[section]

            return (
              <Pressable
                key={section}
                style={({ pressed }) => [
                  styles.sectionCard,
                  pressed && styles.sectionCardPressed,
                ]}
                onPress={() => handleReplaySection(section)}
              >
                <View style={styles.sectionIcon}>
                  {Icon && <Icon size={16} color={colors.primary} />}
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
                  <CheckCircle size={16} color="#22c55e" />
                ) : (
                  <Play size={16} color={colors.textMuted} />
                )}
              </Pressable>
            )
          })}
        </View>
      </View>
    </Modal>
  )
}

function createModalStyles(colors: AppColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdropTouch: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingBottom: 40,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.borderMuted,
      alignSelf: 'center',
      marginTop: 12,
      marginBottom: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    replayAllButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingVertical: 14,
      marginBottom: 16,
    },
    replayAllText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.white,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginBottom: 12,
    },
    sectionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      backgroundColor: colors.surface,
      marginBottom: 8,
    },
    sectionCardPressed: {
      opacity: 0.7,
    },
    sectionIcon: {
      borderRadius: 12,
      backgroundColor: colors.primary_10,
      padding: 10,
      marginRight: 12,
    },
    sectionBody: {
      flex: 1,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    sectionSteps: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
  })
}
