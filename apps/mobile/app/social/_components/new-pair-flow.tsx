import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react-native'
import type { AccountabilityCadence } from '@orbit/shared/types/accountability'
import { getAccountabilityErrorKey } from '@orbit/shared/utils'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { PillButton } from '@/components/ui/pill-button'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useAppToast } from '@/hooks/use-app-toast'
import { useFriends } from '@/hooks/use-friends'
import { useInviteAccountabilityBuddy } from '@/hooks/use-accountability'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { HabitMultiSelect } from './habit-multi-select'

const CADENCES: AccountabilityCadence[] = ['Daily', 'Weekly']

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

  const canSubmit =
    buddyUserId !== null && habitIds.length >= 1 && habitIds.length <= 10 && !invite.isPending

  function resetState() {
    setBuddyUserId(null)
    setCadence('Daily')
    setHabitIds(initialHabitId ? [initialHabitId] : [])
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
      resetState()
      onClose()
    } catch (error: unknown) {
      showError(t(getAccountabilityErrorKey(error)))
    }
  }

  return (
    <BottomSheetModal
      open={open}
      onClose={onClose}
      title={t('social.buddies.newPair.title')}
      snapPoints={['70%', '92%']}
    >
      <View style={styles.body}>
        <Text style={styles.fieldLabel}>{t('social.buddies.newPair.friendLabel')}</Text>
        {friends.length === 0 ? (
          <Text style={styles.muted}>{t('social.buddies.newPair.noFriends')}</Text>
        ) : (
          <View style={styles.list}>
            {friends.map((friend) => {
              const active = friend.userId === buddyUserId
              return (
                <Pressable
                  key={friend.userId}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setBuddyUserId(friend.userId)}
                  style={[
                    styles.friendRow,
                    {
                      backgroundColor: active ? tokens.primarySoft : tokens.bgElev,
                      borderColor: active ? tokens.primary : tokens.hairline,
                    },
                  ]}
                >
                  <UserAvatar name={friend.displayName} size={36} />
                  <Text
                    style={[styles.friendName, { color: active ? tokens.primary : tokens.fg1 }]}
                    numberOfLines={1}
                  >
                    {friend.displayName}
                  </Text>
                  {active ? <Check size={18} color={tokens.primary} strokeWidth={2} /> : null}
                </Pressable>
              )
            })}
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
                style={[
                  styles.cadenceChip,
                  {
                    backgroundColor: active ? tokens.primarySoft : tokens.bgElev,
                    borderColor: active ? tokens.primary : tokens.hairline,
                  },
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

        <PillButton onPress={handleSubmit} disabled={!canSubmit} busy={invite.isPending} fullWidth>
          {t('social.buddies.newPair.submit')}
        </PillButton>
      </View>
    </BottomSheetModal>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    body: { paddingHorizontal: 22, paddingTop: 4, paddingBottom: 24, gap: 12 },
    fieldLabel: { fontFamily: 'Rubik_500Medium', fontSize: 14, color: tokens.fg2, marginTop: 4 },
    muted: { fontFamily: 'Rubik_400Regular', fontSize: 14, color: tokens.fg3 },
    list: { gap: 6 },
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
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
    },
    cadenceText: { fontFamily: 'Rubik_500Medium', fontSize: 14 },
  })
}
