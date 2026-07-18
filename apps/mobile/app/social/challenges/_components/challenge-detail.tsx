import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Flame, Pencil, Target } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { formatLocaleDate } from '@orbit/shared/utils'
import type { ChallengeParticipant } from '@orbit/shared/types/challenge'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PillButton } from '@/components/ui/pill-button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { SkeletonLine } from '@/components/ui/skeleton'
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

function ChallengeHeader({
  isCoop,
  typeLabel,
  completeLabel,
  title,
  endsOnText,
  tokens,
}: Readonly<{
  isCoop: boolean
  typeLabel: string
  completeLabel: string | null
  title: string
  endsOnText: string | null
  tokens: AppTokensV2
}>) {
  return (
    <>
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: tintFromPrimary(tokens, 0.12) }]}>
          {isCoop ? (
            <Target size={13} strokeWidth={2} color={tokens.primarySoft} />
          ) : (
            <Flame size={13} strokeWidth={2} color={tokens.primarySoft} />
          )}
          <Text style={[styles.badgeText, { color: tokens.primarySoft }]}>{typeLabel}</Text>
        </View>
        {completeLabel ? (
          <Text style={[styles.completeText, { color: tokens.statusDone }]}>{completeLabel}</Text>
        ) : null}
      </View>

      <Text style={[styles.title, { color: tokens.fg1 }]}>{title}</Text>

      {endsOnText ? (
        <Text style={[styles.subtle, { color: tokens.fg3 }]}>{endsOnText}</Text>
      ) : null}
    </>
  )
}

function SharedProgressSection({
  isCoop,
  current,
  target,
  heading,
  editLabel,
  onEdit,
  tokens,
}: Readonly<{
  isCoop: boolean
  current: number
  target: number
  heading: string
  editLabel: string
  onEdit?: () => void
  tokens: AppTokensV2
}>) {
  const ratio = target > 0 ? Math.min(1, current / target) : 0
  return (
    <>
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionHeader, styles.sectionHeaderInRow, { color: tokens.fg1 }]}>
          {heading}
        </Text>
        {onEdit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={editLabel}
            hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
            onPress={onEdit}
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
          <ProgressBar progress={ratio} label={heading} />
          <Text style={[styles.progressText, { color: tokens.fg2 }]}>
            {current} / {target}
          </Text>
        </View>
      ) : (
        <StreakCounterView days={current} label={heading} tokens={tokens} />
      )}
    </>
  )
}

function LinkHabitsCard({
  title,
  body,
  cta,
  onLink,
  tokens,
}: Readonly<{
  title: string
  body: string
  cta: string
  onLink: () => void
  tokens: AppTokensV2
}>) {
  return (
    <View style={[styles.linkCard, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
      <Text style={[styles.linkTitle, { color: tokens.fg1 }]}>{title}</Text>
      <Text style={[styles.linkBody, { color: tokens.fg3 }]}>{body}</Text>
      {/* eslint-disable-next-line local/no-fullbleed-button -- link-habits prompt card CTA */}
      <PillButton fullWidth onPress={onLink}>
        {cta}
      </PillButton>
    </View>
  )
}

function HabitsEditorSheet({
  open,
  onClose,
  title,
  saveLabel,
  selectedIds,
  onToggle,
  onSave,
  saving,
}: Readonly<{
  open: boolean
  onClose: () => void
  title: string
  saveLabel: string
  selectedIds: string[]
  onToggle: (id: string) => void
  onSave: () => void
  saving: boolean
}>) {
  return (
    <BottomSheetModal open={open} onClose={onClose} title={title} snapPoints={['55%', '85%']} contentManagesScroll>
      <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
        <HabitPicker selectedIds={selectedIds} onToggle={onToggle} />
        {/* eslint-disable-next-line local/no-fullbleed-button -- HabitsEditorSheet footer primary action */}
        <PillButton fullWidth onPress={onSave} disabled={saving} busy={saving}>
          {saveLabel}
        </PillButton>
      </ScrollView>
    </BottomSheetModal>
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
      <View
        style={styles.container}
        accessibilityRole="progressbar"
        accessibilityLabel={t('common.loading')}
      >
        <SkeletonLine width={110} height={24} />
        <SkeletonLine width="75%" height={28} />
        <View style={styles.skeletonProgress}>
          <SkeletonLine width="100%" height={8} />
          <SkeletonLine width="30%" height={14} />
        </View>
        <SkeletonLine width="45%" height={20} />
        {[0, 1].map((index) => (
          <View key={index} style={styles.memberRow}>
            <SkeletonLine width={36} height={36} style={styles.skeletonAvatar} />
            <SkeletonLine width="50%" height={15} />
          </View>
        ))}
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
      <ChallengeHeader
        isCoop={isCoop}
        typeLabel={isCoop ? t('challenges.type.coopGoal') : t('challenges.type.streakTogether')}
        completeLabel={challenge.isComplete ? t('challenges.detail.complete') : null}
        title={challenge.title}
        endsOnText={
          isCoop && challenge.periodEndUtc
            ? t('challenges.detail.endsOn', {
                date: formatLocaleDate(challenge.periodEndUtc, i18n.language),
              })
            : null
        }
        tokens={tokens}
      />

      <SharedProgressSection
        isCoop={isCoop}
        current={challenge.currentProgress}
        target={challenge.targetCount ?? 0}
        heading={isCoop ? t('challenges.detail.progressLabel') : t('challenges.detail.sharedStreak')}
        editLabel={t('challenges.detail.editHabits')}
        onEdit={hasLinkedHabits ? openHabitsEditor : undefined}
        tokens={tokens}
      />

      {hasLinkedHabits ? null : (
        <LinkHabitsCard
          title={t('challenges.detail.linkHabitsTitle')}
          body={t('challenges.detail.linkHabitsBody')}
          cta={t('challenges.detail.linkHabitsCta')}
          onLink={openHabitsEditor}
          tokens={tokens}
        />
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
        {/* eslint-disable-next-line local/no-fullbleed-button -- full-screen leave action at page bottom */}
        <PillButton variant="ghost" fullWidth onPress={() => setConfirmLeave(true)}>
          {t('challenges.detail.leave')}
        </PillButton>
      </View>

      <HabitsEditorSheet
        open={habitsOpen}
        onClose={() => setHabitsOpen(false)}
        title={t('challenges.detail.linkHabitsTitle')}
        saveLabel={t('common.save')}
        selectedIds={editorHabitIds}
        onToggle={toggleEditorHabit}
        onSave={() => void saveHabits()}
        saving={setChallengeHabits.isPending}
      />

      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title={t('challenges.detail.leaveConfirmTitle')}
        description={t('challenges.detail.leaveConfirmBody')}
        confirmLabel={t('challenges.detail.leave')}
        variant="danger"
        onConfirm={() => void leave()}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingBottom: 32, gap: 8 },
  skeletonProgress: { gap: 8, marginTop: 12 },
  skeletonAvatar: { borderRadius: 18 },
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
