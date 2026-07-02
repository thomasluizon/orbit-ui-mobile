import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Flame, Pencil, Target } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { formatLocaleDate } from '@orbit/shared/utils'
import type { ChallengeParticipant } from '@orbit/shared/types/challenge'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PillButton } from '@/components/ui/pill-button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useAppToast } from '@/hooks/use-app-toast'
import {
  useChallengeDetail,
  useLeaveChallenge,
  useSetChallengeHabits,
} from '@/hooks/use-challenges'
import { createTokensV2, tintFromPrimary, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { getChallengeErrorKey } from './challenge-errors'
import { HabitPicker } from './habit-picker'
import { ShareJoinCode } from './share-join-code'

interface ChallengeDetailProps {
  challengeId: string
  onLeft: () => void
}

function StreakCounterView({
  days,
  label,
  tokens,
}: Readonly<{ days: number; label: string; tokens: AppTokensV2 }>) {
  return (
    <View style={styles.streakBlock}>
      <Text testID="challenge-streak-count" style={[styles.streakCount, { color: tokens.fg1 }]}>
        {days}
      </Text>
      <Text style={[styles.streakLabel, { color: tokens.fg3 }]}>{label}</Text>
    </View>
  )
}

function MembersList({
  participants,
  tokens,
}: Readonly<{ participants: ChallengeParticipant[]; tokens: AppTokensV2 }>) {
  return (
    <View testID="challenge-members">
      {participants.map((participant) => (
        <View key={participant.userId} style={styles.memberRow}>
          <UserAvatar name={participant.name} size={36} />
          <Text style={[styles.memberName, { color: tokens.fg1 }]} numberOfLines={1}>
            {participant.name}
          </Text>
        </View>
      ))}
    </View>
  )
}

/** Challenge detail: type-appropriate shared viz (no per-person numbers), members, link-habits CTA,
 *  invite share, and leave. */
export function ChallengeDetail({ challengeId, onLeft }: Readonly<ChallengeDetailProps>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { showError, showSuccess } = useAppToast()
  const { data: challenge, isLoading, isError, refetch } = useChallengeDetail(challengeId)
  const leaveChallenge = useLeaveChallenge()
  const setChallengeHabits = useSetChallengeHabits()
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [habitsOpen, setHabitsOpen] = useState(false)
  const [editorHabitIds, setEditorHabitIds] = useState<string[]>([])

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={tokens.primary} />
      </View>
    )
  }

  if (isError) {
    return (
      <View style={styles.errorBlock}>
        <Text style={[styles.errorBody, { color: tokens.fg3 }]}>
          {t('challenges.errors.loadFailed')}
        </Text>
        <PillButton
          variant="ghost"
          onPress={() => {
            void refetch()
          }}
        >
          {t('common.retry')}
        </PillButton>
      </View>
    )
  }

  if (!challenge) {
    return <Text style={[styles.notFound, { color: tokens.fg3 }]}>{t('challenges.detail.notFound')}</Text>
  }

  const isCoop = challenge.type === 'CoopGoal'
  const target = challenge.targetCount ?? 0
  const ratio = target > 0 ? Math.min(1, challenge.currentProgress / target) : 0
  const hasLinkedHabits = challenge.yourLinkedHabitIds.length > 0

  function openHabitsEditor() {
    setEditorHabitIds(challenge?.yourLinkedHabitIds ?? [])
    setHabitsOpen(true)
  }

  function toggleEditorHabit(id: string) {
    setEditorHabitIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    )
  }

  async function saveHabits() {
    try {
      await setChallengeHabits.mutateAsync({ challengeId, habitIds: editorHabitIds })
      showSuccess(t('challenges.detail.habitsSaved'))
      setHabitsOpen(false)
    } catch (error: unknown) {
      showError(t(getChallengeErrorKey(error)))
    }
  }

  async function leave() {
    try {
      await leaveChallenge.mutateAsync(challengeId)
      showSuccess(t('challenges.detail.leaveSuccess'))
      onLeft()
    } catch (error: unknown) {
      showError(t(getChallengeErrorKey(error)))
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: tintFromPrimary(tokens, 0.12) }]}>
          {isCoop ? (
            <Target size={13} strokeWidth={2} color={tokens.primary} />
          ) : (
            <Flame size={13} strokeWidth={2} color={tokens.primary} />
          )}
          <Text style={[styles.badgeText, { color: tokens.primary }]}>
            {isCoop ? t('challenges.type.coopGoal') : t('challenges.type.streakTogether')}
          </Text>
        </View>
        {challenge.isComplete ? (
          <Text style={[styles.completeText, { color: tokens.statusDone }]}>
            {t('challenges.detail.complete')}
          </Text>
        ) : null}
      </View>

      <Text style={[styles.title, { color: tokens.fg1 }]}>{challenge.title}</Text>

      {isCoop && challenge.periodEndUtc ? (
        <Text style={[styles.subtle, { color: tokens.fg3 }]}>
          {t('challenges.detail.endsOn', {
            date: formatLocaleDate(challenge.periodEndUtc, i18n.language),
          })}
        </Text>
      ) : null}

      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionHeader, styles.sectionHeaderInRow, { color: tokens.fg1 }]}>
          {isCoop ? t('challenges.detail.progressLabel') : t('challenges.detail.sharedStreak')}
        </Text>
        {hasLinkedHabits ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('challenges.detail.editHabits')}
            hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
            onPress={openHabitsEditor}
            style={({ pressed }) => [
              styles.editButton,
              pressed
                ? { backgroundColor: tokens.bgElev, transform: [{ scale: 0.96 }] }
                : null,
            ]}
          >
            <Pencil size={18} strokeWidth={1.8} color={tokens.fg1} />
          </Pressable>
        ) : null}
      </View>

      {isCoop ? (
        <View style={styles.progressBlock}>
          <ProgressBar progress={ratio} label={t('challenges.detail.progressLabel')} />
          <Text style={[styles.progressText, { color: tokens.fg2 }]}>
            {challenge.currentProgress} / {target}
          </Text>
        </View>
      ) : (
        <StreakCounterView
          days={challenge.currentProgress}
          label={t('challenges.detail.sharedStreak')}
          tokens={tokens}
        />
      )}

      {hasLinkedHabits ? null : (
        <View style={[styles.linkCard, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
          <Text style={[styles.linkTitle, { color: tokens.fg1 }]}>
            {t('challenges.detail.linkHabitsTitle')}
          </Text>
          <Text style={[styles.linkBody, { color: tokens.fg3 }]}>
            {t('challenges.detail.linkHabitsBody')}
          </Text>
          <PillButton fullWidth onPress={openHabitsEditor}>
            {t('challenges.detail.linkHabitsCta')}
          </PillButton>
        </View>
      )}

      <Text style={[styles.sectionHeader, { color: tokens.fg1 }]}>
        {t('challenges.detail.membersTitle')}
      </Text>
      <MembersList participants={challenge.participants} tokens={tokens} />

      <Text style={[styles.sectionHeader, { color: tokens.fg1 }]}>
        {t('challenges.detail.shareTitle')}
      </Text>
      <ShareJoinCode title={challenge.title} joinCode={challenge.joinCode} />

      <View style={styles.leaveBlock}>
        <PillButton variant="ghost" fullWidth onPress={() => setConfirmLeave(true)}>
          {t('challenges.detail.leave')}
        </PillButton>
      </View>

      <BottomSheetModal
        open={habitsOpen}
        onClose={() => setHabitsOpen(false)}
        title={t('challenges.detail.linkHabitsTitle')}
        snapPoints={['55%', '85%']}
      >
        <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <HabitPicker selectedIds={editorHabitIds} onToggle={toggleEditorHabit} />
          <PillButton
            fullWidth
            onPress={saveHabits}
            disabled={setChallengeHabits.isPending}
            busy={setChallengeHabits.isPending}
          >
            {t('common.save')}
          </PillButton>
        </ScrollView>
      </BottomSheetModal>

      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title={t('challenges.detail.leaveConfirmTitle')}
        description={t('challenges.detail.leaveConfirmBody')}
        confirmLabel={t('challenges.detail.leave')}
        variant="danger"
        onConfirm={leave}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingBottom: 32, gap: 8 },
  centered: { paddingVertical: 48, alignItems: 'center' },
  errorBlock: { paddingHorizontal: 32, paddingVertical: 48, alignItems: 'center', gap: 12 },
  errorBody: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  notFound: { padding: 32, textAlign: 'center', fontFamily: 'Rubik_400Regular' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  badgeText: { fontFamily: 'Rubik_500Medium', fontSize: 12 },
  completeText: { marginLeft: 'auto', fontFamily: 'Rubik_500Medium', fontSize: 12 },
  title: { fontFamily: 'Rubik_500Medium', fontSize: 24 },
  subtle: { fontFamily: 'Rubik_400Regular', fontSize: 13 },
  sectionHeader: { fontFamily: 'Rubik_500Medium', fontSize: 20, marginTop: 16, marginBottom: 8 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 16,
    marginBottom: 8,
  },
  sectionHeaderInRow: { marginTop: 0, marginBottom: 0 },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBlock: { gap: 8 },
  progressText: { fontFamily: 'Roboto_400Regular', fontSize: 14, fontVariant: ['tabular-nums'] },
  streakBlock: { alignItems: 'center', gap: 2, paddingVertical: 8 },
  streakCount: { fontFamily: 'Inter_700Bold', fontSize: 44, lineHeight: 44, fontVariant: ['tabular-nums'] },
  streakLabel: { fontFamily: 'Rubik_400Regular', fontSize: 14 },
  linkCard: { gap: 8, marginTop: 6, padding: 16, borderRadius: 16, borderWidth: 1 },
  linkTitle: { fontFamily: 'Rubik_500Medium', fontSize: 15 },
  linkBody: { fontFamily: 'Rubik_400Regular', fontSize: 13, lineHeight: 19 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  memberName: { flex: 1, minWidth: 0, fontFamily: 'Rubik_400Regular', fontSize: 15 },
  leaveBlock: { marginTop: 8 },
  sheetContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32, gap: 16 },
})
