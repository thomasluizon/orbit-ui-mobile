import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Pencil } from '@/components/ui/icons'
import { useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { AccountabilityPair } from '@orbit/shared/types/accountability'
import { formatAPIDate, formatLocaleDate, getAccountabilityErrorKey } from '@orbit/shared/utils'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { PillButton } from '@/components/ui/pill-button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { useAppToast } from '@/hooks/use-app-toast'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useHabits } from '@/hooks/use-habits'
import {
  useAccountabilityCheckIns,
  useAccountabilityPairs,
  useCheckInAccountability,
  useEndAccountabilityPair,
  useSetAccountabilityHabits,
} from '@/hooks/use-accountability'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { HabitMultiSelect } from './social/_components/habit-multi-select'

const MAX_NOTE = 200

export default function AccountabilityPairScreen() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const goBackOrFallback = useGoBackOrFallback()
  const { pairId } = useLocalSearchParams<{ pairId?: string }>()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)

  const { showSuccess, showError } = useAppToast()
  const { data } = useAccountabilityPairs()
  const { data: habitsData } = useHabits({})
  const checkInsQuery = useAccountabilityCheckIns(pairId ?? null)
  const checkIn = useCheckInAccountability()
  const setHabits = useSetAccountabilityHabits()
  const end = useEndAccountabilityPair()

  const [note, setNote] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editHabitIds, setEditHabitIds] = useState<string[]>([])
  const [confirmUnpair, setConfirmUnpair] = useState(false)

  const pair: AccountabilityPair | undefined = data?.activePairs.find((item) => item.id === pairId)

  const today = formatAPIDate(new Date())
  const checkedInToday = pair?.myLastCheckInDate === today

  const myHabitTitles = (pair?.myHabitIds ?? [])
    .map((id) => habitsData?.habitsById.get(id)?.title)
    .filter((title): title is string => Boolean(title))

  async function handleCheckIn() {
    if (!pair) return
    try {
      await checkIn.mutateAsync({ pairId: pair.id, note: note.trim() || undefined })
      showSuccess(t('social.buddies.checkInSuccess'))
      setNote('')
    } catch (error: unknown) {
      showError(t(getAccountabilityErrorKey(error)))
    }
  }

  function openEdit() {
    if (!pair) return
    setEditHabitIds(pair.myHabitIds)
    setEditOpen(true)
  }

  async function handleSaveHabits() {
    if (!pair) return
    if (editHabitIds.length === 0) {
      showError(t('social.buddies.errors.habitRequired'))
      return
    }
    try {
      await setHabits.mutateAsync({ pairId: pair.id, habitIds: editHabitIds })
      showSuccess(t('social.buddies.detail.editSuccess'))
      setEditOpen(false)
    } catch (error: unknown) {
      showError(t(getAccountabilityErrorKey(error)))
    }
  }

  async function handleUnpair() {
    if (!pair) return
    try {
      await end.mutateAsync(pair.id)
      showSuccess(t('social.buddies.detail.unpairSuccess'))
      goBackOrFallback('/social')
    } catch (error: unknown) {
      showError(t(getAccountabilityErrorKey(error)))
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: tokens.bg }]} edges={['top']}>
      <AppBar
        back
        onBack={() => goBackOrFallback('/social')}
        title={pair ? pair.buddy.displayName : t('social.buddies.detail.title')}
        backLabel={t('common.goBack')}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!pair ? (
          <Text style={styles.notFound}>{t('social.buddies.detail.notFound')}</Text>
        ) : (
          <>
            <View style={styles.cadenceRow}>
              <Text style={styles.cadenceLabel}>{t('social.buddies.detail.cadenceLabel')}</Text>
              <Text style={styles.cadenceValue}>{t(`social.buddies.cadence.${pair.cadence}`)}</Text>
            </View>
            <View style={styles.cadenceRow}>
              <Text style={styles.cadenceLabel}>
                {t('social.buddies.detail.buddyHabits', { name: pair.buddy.displayName })}
              </Text>
              <Text style={styles.buddyHabitsValue}>{pair.buddyHabitIds.length}</Text>
            </View>

            <SectionLabel
              bottom={8}
              inset={false}
              trailing={
                <Pressable
                  onPress={openEdit}
                  accessibilityRole="button"
                  accessibilityLabel={t('social.buddies.detail.editHabits')}
                  hitSlop={2}
                  style={({ pressed }) => [
                    styles.editHabitsButton,
                    pressed && styles.editHabitsButtonPressed,
                  ]}
                >
                  <Pencil size={18} color={tokens.fg2} strokeWidth={1.8} />
                </Pressable>
              }
            >
              {t('social.buddies.detail.yourHabits')}
            </SectionLabel>
            <View style={styles.chips}>
              {myHabitTitles.map((title) => (
                <View key={title} style={styles.chip}>
                  <Text style={styles.chipText}>{title}</Text>
                </View>
              ))}
            </View>

            <SectionLabel bottom={8} inset={false}>
              {t('social.buddies.checkInTitle')}
            </SectionLabel>
            {checkedInToday ? (
              <Text style={styles.muted}>{t('social.buddies.checkedInLabel')}</Text>
            ) : (
              <View style={styles.composer}>
                <View style={styles.noteBlock}>
                  <TextInput
                    value={note}
                    onChangeText={(value) => setNote(value.slice(0, MAX_NOTE))}
                    maxLength={MAX_NOTE}
                    placeholder={t('social.buddies.checkInNotePlaceholder')}
                    placeholderTextColor={tokens.fg3}
                    multiline
                    style={styles.note}
                  />
                  <Text style={styles.noteCounter}>
                    {note.length}/{MAX_NOTE}
                  </Text>
                </View>
                <PillButton
                  onPress={() => void handleCheckIn()}
                  disabled={checkIn.isPending}
                  busy={checkIn.isPending}
                  // eslint-disable-next-line local/no-fullbleed-button -- full-screen check-in submit (allowlist: form submit)
                  fullWidth
                >
                  {t('social.buddies.checkInSubmit')}
                </PillButton>
              </View>
            )}

            <SectionLabel bottom={8} inset={false}>
              {t('social.buddies.detail.history')}
            </SectionLabel>
            {!checkInsQuery.isPending &&
              ((checkInsQuery.data?.items.length ?? 0) === 0 ? (
                <Text style={styles.muted}>{t('social.buddies.detail.historyEmpty')}</Text>
              ) : (
                <View style={styles.history}>
                  {checkInsQuery.data?.items.map((item) => (
                    <View key={item.id} style={styles.historyItem}>
                      <View style={styles.historyHead}>
                        <Text style={styles.historyName} numberOfLines={1}>
                          {item.displayName}
                        </Text>
                        <Text style={styles.historyDate}>
                          {formatLocaleDate(item.date, locale, { month: 'short', day: 'numeric' })}
                        </Text>
                      </View>
                      {item.note ? <Text style={styles.historyNote}>{item.note}</Text> : null}
                    </View>
                  ))}
                </View>
              ))}

            <Pressable
              onPress={() => setConfirmUnpair(true)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.unpairAction, pressed && styles.unpairActionPressed]}
            >
              <Text style={styles.unpairText}>{t('social.buddies.detail.unpair')}</Text>
            </Pressable>
          </>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>

      <BottomSheetModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={t('social.buddies.detail.editHabitsTitle')}
        snapPoints={['70%', '92%']}
        contentManagesScroll
      >
        <View style={styles.sheetContainer}>
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <HabitMultiSelect selectedIds={editHabitIds} onChange={setEditHabitIds} />
          </ScrollView>
          <View style={styles.sheetFooter}>
            <PillButton
              onPress={() => void handleSaveHabits()}
              disabled={editHabitIds.length === 0 || setHabits.isPending}
              busy={setHabits.isPending}
              // eslint-disable-next-line local/no-fullbleed-button -- BottomSheetModal edit-habits footer primary action
              fullWidth
            >
              {t('common.save')}
            </PillButton>
          </View>
        </View>
      </BottomSheetModal>

      <ConfirmDialog
        open={confirmUnpair}
        onOpenChange={setConfirmUnpair}
        title={t('social.buddies.detail.unpairConfirmTitle', {
          name: pair?.buddy.displayName ?? '',
        })}
        description={t('social.buddies.detail.unpairConfirmBody')}
        confirmLabel={t('social.buddies.detail.unpair')}
        onConfirm={() => void handleUnpair()}
        variant="danger"
      />
    </SafeAreaView>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    safeArea: { flex: 1 },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 20, paddingBottom: 24 },
    notFound: { fontFamily: 'Rubik_400Regular', fontSize: 15, color: tokens.fg3, paddingVertical: 24 },
    cadenceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 12,
    },
    cadenceLabel: {
      flexShrink: 1,
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      color: tokens.fg3,
    },
    cadenceValue: { fontFamily: 'Rubik_500Medium', fontSize: 14, color: tokens.fg1 },
    buddyHabitsValue: {
      fontFamily: 'Roboto_500Medium',
      fontSize: 14,
      color: tokens.fg1,
      fontVariant: ['tabular-nums'],
    },
    editHabitsButton: {
      width: 40,
      height: 40,
      marginVertical: -8,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editHabitsButtonPressed: {
      backgroundColor: tokens.bgElev,
      transform: [{ scale: 0.96 }],
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    chipText: { fontFamily: 'Rubik_400Regular', fontSize: 13, color: tokens.fg2 },
    muted: { fontFamily: 'Rubik_400Regular', fontSize: 14, color: tokens.fg3 },
    composer: { gap: 10 },
    noteBlock: { gap: 4 },
    noteCounter: {
      alignSelf: 'flex-end',
      fontFamily: 'Roboto_400Regular',
      fontSize: 12,
      color: tokens.fg4,
      fontVariant: ['tabular-nums'],
    },
    note: {
      minHeight: 72,
      borderRadius: 14,
      backgroundColor: tokens.bgField,
      borderWidth: 1,
      borderColor: tokens.hairline,
      padding: 14,
      fontFamily: 'Rubik_400Regular',
      fontSize: 16,
      color: tokens.fg1,
      textAlignVertical: 'top',
    },
    history: { gap: 12 },
    historyItem: { gap: 2 },
    historyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    historyName: { flex: 1, fontFamily: 'Rubik_500Medium', fontSize: 14, color: tokens.fg1 },
    historyDate: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 12,
      color: tokens.fg3,
      fontVariant: ['tabular-nums'],
    },
    historyNote: { fontFamily: 'Rubik_400Regular', fontSize: 14, color: tokens.fg2 },
    unpairAction: {
      alignSelf: 'flex-start',
      marginTop: 20,
      marginLeft: -16,
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 999,
      justifyContent: 'center',
    },
    unpairActionPressed: {
      backgroundColor: `${tokens.statusBad}1A`,
      transform: [{ scale: 0.96 }],
    },
    unpairText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      color: tokens.statusBadText,
    },
    sheetContainer: { flex: 1 },
    sheetScroll: { flex: 1 },
    sheetBody: { paddingHorizontal: 22, paddingTop: 4, paddingBottom: 16 },
    sheetFooter: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 24 },
  })
}
