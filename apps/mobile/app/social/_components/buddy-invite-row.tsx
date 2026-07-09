import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { AccountabilityPair } from '@orbit/shared/types/accountability'
import { getAccountabilityErrorKey } from '@orbit/shared/utils'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { PillButton } from '@/components/ui/pill-button'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useAppToast } from '@/hooks/use-app-toast'
import {
  useAcceptAccountabilityPair,
  useEndAccountabilityPair,
} from '@/hooks/use-accountability'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { HabitMultiSelect } from './habit-multi-select'

interface BuddyInviteRowProps {
  pair: AccountabilityPair
  direction: 'incoming' | 'outgoing'
}

/** A pending accountability invite: accept (picking habits) / decline when incoming, rescind when outgoing. */
export function BuddyInviteRow({ pair, direction }: Readonly<BuddyInviteRowProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const { showSuccess, showError } = useAppToast()
  const accept = useAcceptAccountabilityPair()
  const end = useEndAccountabilityPair()
  const [acceptOpen, setAcceptOpen] = useState(false)
  const [habitIds, setHabitIds] = useState<string[]>([])
  const busy = accept.isPending || end.isPending

  async function handleEnd() {
    try {
      await end.mutateAsync(pair.id)
    } catch (error: unknown) {
      showError(t(getAccountabilityErrorKey(error)))
    }
  }

  async function handleAccept() {
    if (habitIds.length === 0) {
      showError(t('social.buddies.errors.habitRequired'))
      return
    }
    try {
      await accept.mutateAsync({ pairId: pair.id, habitIds })
      showSuccess(t('social.buddies.acceptSuccess'))
      setAcceptOpen(false)
    } catch (error: unknown) {
      showError(t(getAccountabilityErrorKey(error)))
    }
  }

  return (
    <>
      <View style={styles.row}>
        <UserAvatar name={pair.buddy.displayName} />
        <View style={styles.identity}>
          <Text style={styles.name} numberOfLines={1}>
            {pair.buddy.displayName}
          </Text>
          <Text style={styles.sub}>
            {direction === 'incoming'
              ? t('social.buddies.invitedYou', { cadence: t(`social.buddies.cadence.${pair.cadence}`) })
              : t('social.buddies.youInvited')}
          </Text>
        </View>
        <View style={styles.actions}>
          {direction === 'incoming' ? (
            <>
              <Pressable
                accessibilityRole="button"
                onPress={() => setAcceptOpen(true)}
                disabled={busy}
                hitSlop={{ top: 6, bottom: 6 }}
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: pressed ? tokens.primaryPressed : tokens.primary },
                  busy ? styles.actionBusy : null,
                  pressed ? styles.actionPressed : null,
                ]}
              >
                <Text style={[styles.actionText, { color: tokens.fgOnPrimary }]}>
                  {t('social.buddies.accept')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => void handleEnd()}
                disabled={busy}
                hitSlop={{ top: 6, bottom: 6 }}
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: tokens.bgElev },
                  busy ? styles.actionBusy : null,
                  pressed ? styles.actionPressed : null,
                ]}
              >
                <Text style={[styles.actionText, { color: tokens.fg2 }]}>
                  {t('social.buddies.decline')}
                </Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => void handleEnd()}
              disabled={busy}
              hitSlop={{ top: 6, bottom: 6 }}
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: tokens.bgElev },
                busy ? styles.actionBusy : null,
                pressed ? styles.actionPressed : null,
              ]}
            >
              <Text style={[styles.actionText, { color: tokens.fg2 }]}>
                {t('social.buddies.rescind')}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <BottomSheetModal
        open={acceptOpen}
        onClose={() => setAcceptOpen(false)}
        title={t('social.buddies.acceptTitle')}
        snapPoints={['70%', '92%']}
      >
        <View style={styles.sheetBody}>
          <Text style={styles.sheetSubtitle}>
            {t('social.buddies.acceptSubtitle', { name: pair.buddy.displayName })}
          </Text>
          <HabitMultiSelect selectedIds={habitIds} onChange={setHabitIds} />
          <PillButton
            onPress={() => void handleAccept()}
            disabled={habitIds.length === 0 || accept.isPending}
            busy={accept.isPending}
            // eslint-disable-next-line local/no-fullbleed-button -- accept sheet footer primary action
            fullWidth
          >
            {t('social.buddies.acceptSubmit')}
          </PillButton>
        </View>
      </BottomSheetModal>
    </>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    identity: { flex: 1, gap: 2 },
    name: { fontFamily: 'Rubik_500Medium', fontSize: 15, color: tokens.fg1 },
    sub: { fontFamily: 'Rubik_400Regular', fontSize: 13, color: tokens.fg3 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    actionButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
    actionPressed: { transform: [{ scale: 0.96 }] },
    actionBusy: { opacity: 0.4 },
    actionText: { fontFamily: 'Rubik_500Medium', fontSize: 14 },
    sheetBody: { paddingHorizontal: 22, paddingTop: 4, paddingBottom: 24, gap: 16 },
    sheetSubtitle: { fontFamily: 'Rubik_400Regular', fontSize: 14, color: tokens.fg3 },
  })
}
