import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Check, Search, X } from 'lucide-react-native'
import type { AccountabilityCadence } from '@orbit/shared/types/accountability'
import { getAccountabilityErrorKey } from '@orbit/shared/utils'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { PillButton } from '@/components/ui/pill-button'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useAppToast } from '@/hooks/use-app-toast'
import { useFriends } from '@/hooks/use-friends'
import { useInviteAccountabilityBuddy } from '@/hooks/use-accountability'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { HabitMultiSelect } from './habit-multi-select'

const CADENCES: AccountabilityCadence[] = ['Daily', 'Weekly']
const FRIEND_SEARCH_THRESHOLD = 6

interface NewPairFlowProps {
  open: boolean
  onClose: () => void
  initialHabitId?: string | null
}

/** Bottom-sheet flow to invite a friend: pick friend, pick cadence, pick 1–10 of your habits. */
export function NewPairFlow({ open, onClose, initialHabitId }: Readonly<NewPairFlowProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const { showSuccess, showError } = useAppToast()
  const { data } = useFriends()
  const friends = data?.friends ?? []
  const invite = useInviteAccountabilityBuddy()

  const [buddyUserId, setBuddyUserId] = useState<string | null>(null)
  const [cadence, setCadence] = useState<AccountabilityCadence>('Daily')
  const [habitIds, setHabitIds] = useState<string[]>(initialHabitId ? [initialHabitId] : [])
  const [friendQuery, setFriendQuery] = useState('')

  const friendSearch = friendQuery.trim().toLowerCase()
  const visibleFriends = friendSearch
    ? friends.filter(
        (friend) =>
          friend.displayName.toLowerCase().includes(friendSearch) ||
          friend.handle.toLowerCase().includes(friendSearch),
      )
    : friends

  const canSubmit =
    buddyUserId !== null && habitIds.length >= 1 && habitIds.length <= 10 && !invite.isPending

  function resetState() {
    setBuddyUserId(null)
    setCadence('Daily')
    setHabitIds(initialHabitId ? [initialHabitId] : [])
    setFriendQuery('')
  }

  function handleClose() {
    resetState()
    onClose()
  }

  async function handleSubmit() {
    if (!buddyUserId) return
    if (habitIds.length === 0) {
      showError(t('social.buddies.errors.habitRequired'))
      return
    }
    try {
      await invite.mutateAsync({ buddyUserId, cadence, habitIds })
      showSuccess(t('social.buddies.newPair.success'))
      handleClose()
    } catch (error: unknown) {
      showError(t(getAccountabilityErrorKey(error)))
    }
  }

  return (
    <BottomSheetModal
      open={open}
      onClose={handleClose}
      title={t('social.buddies.newPair.title')}
      snapPoints={['70%', '92%']}
      contentManagesScroll
    >
      <View style={styles.container}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.fieldLabel}>{t('social.buddies.newPair.friendLabel')}</Text>
          {friends.length === 0 ? (
            <Text style={styles.muted}>{t('social.buddies.newPair.noFriends')}</Text>
          ) : (
            <View style={styles.list}>
              {friends.length > FRIEND_SEARCH_THRESHOLD ? (
                <View style={styles.search}>
                  <Search size={16} color={tokens.fg3} strokeWidth={2} />
                  <TextInput
                    value={friendQuery}
                    onChangeText={setFriendQuery}
                    placeholder={t('social.buddies.newPair.searchFriends')}
                    placeholderTextColor={tokens.fg3}
                    style={styles.searchInput}
                    autoCorrect={false}
                  />
                  {friendQuery.length > 0 ? (
                    <Pressable
                      onPress={() => setFriendQuery('')}
                      accessibilityRole="button"
                      accessibilityLabel={t('common.clear')}
                      hitSlop={15}
                    >
                      <X size={15} color={tokens.fg3} strokeWidth={2} />
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              {visibleFriends.length === 0 ? (
                <Text style={styles.muted}>{t('social.buddies.newPair.noFriendMatch')}</Text>
              ) : (
                visibleFriends.map((friend) => {
                  const active = friend.userId === buddyUserId
                  return (
                    <Pressable
                      key={friend.userId}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => setBuddyUserId(friend.userId)}
                      style={({ pressed }) => [
                        styles.friendRow,
                        {
                          backgroundColor: active ? tintFromPrimary(tokens, 0.12) : tokens.bgElev,
                          borderColor: active ? tokens.primary : tokens.hairline,
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      <UserAvatar name={friend.displayName} />
                      <Text
                        style={[styles.friendName, { color: active ? tokens.primary : tokens.fg1 }]}
                        numberOfLines={1}
                      >
                        {friend.displayName}
                      </Text>
                      {active ? <Check size={18} color={tokens.primary} strokeWidth={2} /> : null}
                    </Pressable>
                  )
                })
              )}
            </View>
          )}

          <Text style={styles.fieldLabel}>{t('social.buddies.newPair.cadenceLabel')}</Text>
          <View style={styles.cadenceRow}>
            {CADENCES.map((option) => {
              const active = option === cadence
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setCadence(option)}
                  style={({ pressed }) => [
                    styles.cadenceChip,
                    {
                      backgroundColor: active ? tintFromPrimary(tokens, 0.12) : tokens.bgElev,
                      borderColor: active ? tokens.primary : tokens.hairline,
                    },
                    pressed && styles.pressedChip,
                  ]}
                >
                  <Text style={[styles.cadenceText, { color: active ? tokens.primary : tokens.fg2 }]}>
                    {t(`social.buddies.cadence.${option}`)}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <Text style={styles.fieldLabel}>{t('social.buddies.newPair.habitsLabel')}</Text>
          <HabitMultiSelect selectedIds={habitIds} onChange={setHabitIds} />
        </ScrollView>

        <View style={styles.footer}>
          <PillButton onPress={() => void handleSubmit()} disabled={!canSubmit} busy={invite.isPending} fullWidth>
            {t('social.buddies.newPair.submit')}
          </PillButton>
        </View>
      </View>
    </BottomSheetModal>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    container: { flex: 1 },
    scroll: { flex: 1 },
    body: { paddingHorizontal: 22, paddingTop: 4, paddingBottom: 16, gap: 12 },
    footer: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 24 },
    fieldLabel: { fontFamily: 'Rubik_500Medium', fontSize: 14, color: tokens.fg2, marginTop: 4 },
    muted: { fontFamily: 'Rubik_400Regular', fontSize: 14, color: tokens.fg3 },
    list: { gap: 6 },
    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      height: 44,
      borderRadius: 14,
      backgroundColor: tokens.bgSunk,
      borderWidth: 1,
      borderColor: tokens.hairline,
      marginBottom: 2,
    },
    searchInput: {
      flex: 1,
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      color: tokens.fg1,
      padding: 0,
    },
    friendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: 1,
    },
    friendName: { flex: 1, fontFamily: 'Rubik_500Medium', fontSize: 15 },
    cadenceRow: { flexDirection: 'row', gap: 8 },
    cadenceChip: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      paddingVertical: 12,
      borderRadius: 999,
      borderWidth: 1,
    },
    cadenceText: { fontFamily: 'Rubik_500Medium', fontSize: 14 },
    pressed: { transform: [{ scale: 0.98 }] },
    pressedChip: { transform: [{ scale: 0.96 }] },
  })
}
