import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MoreVertical } from 'lucide-react-native'
import {
  reportReasonSchema,
  type FriendSummary,
  type ReportReason,
} from '@orbit/shared/types/social'
import { getSocialErrorKey } from '@orbit/shared/utils'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PillButton } from '@/components/ui/pill-button'
import { SettingsGroup, SettingsGroupRow } from '@/components/ui/settings-group'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useAppToast } from '@/hooks/use-app-toast'
import { useBlockUser, useRemoveFriend, useReportUser } from '@/hooks/use-friends'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import type { ProfileTarget } from './friend-profile-sheet'
import type { CheerTarget } from './cheer-composer'

type AppTokens = ReturnType<typeof createTokensV2>

interface FriendRowProps {
  friend: FriendSummary
  onCheer: (target: CheerTarget) => void
  onOpenProfile: (target: ProfileTarget) => void
}

function ReportSheet({
  open,
  onClose,
  displayName,
  onSubmit,
  busy,
  tokens,
}: Readonly<{
  open: boolean
  onClose: () => void
  displayName: string
  onSubmit: (reason: ReportReason, details: string) => void
  busy: boolean
  tokens: AppTokens
}>) {
  const { t } = useTranslation()
  const styles = createStyles(tokens)
  const [reason, setReason] = useState<ReportReason>('Spam')
  const [details, setDetails] = useState('')

  return (
    <BottomSheetModal
      open={open}
      onClose={onClose}
      title={t('social.report.title', { name: displayName })}
      snapPoints={['62%']}
    >
      <View style={styles.sheetBody}>
        <Text style={styles.fieldLabel}>{t('social.report.reasonLabel')}</Text>
        <View style={styles.reasonRow}>
          {reportReasonSchema.options.map((option) => {
            const active = option === reason
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setReason(option)}
                style={({ pressed }) => [
                  styles.reasonChip,
                  {
                    backgroundColor: active ? tintFromPrimary(tokens, 0.12) : tokens.bgElev,
                    borderColor: active ? tokens.primary : tokens.hairline,
                  },
                  pressed ? styles.reasonChipPressed : null,
                ]}
              >
                <Text style={[styles.reasonText, { color: active ? tokens.primary : tokens.fg2 }]}>
                  {t(`social.report.reasons.${option}`)}
                </Text>
              </Pressable>
            )
          })}
        </View>
        <Text style={styles.fieldLabel}>{t('social.report.detailsLabel')}</Text>
        <TextInput
          value={details}
          onChangeText={(value) => setDetails(value.slice(0, 500))}
          maxLength={500}
          placeholder={t('social.report.detailsPlaceholder')}
          placeholderTextColor={tokens.fg3}
          multiline
          style={styles.details}
        />
        <PillButton onPress={() => onSubmit(reason, details)} disabled={busy} busy={busy} fullWidth>
          {t('social.report.submit')}
        </PillButton>
      </View>
    </BottomSheetModal>
  )
}

/** One accepted friend: cheer them, or open an action sheet to remove, block, or report. */
export function FriendRow({ friend, onCheer, onOpenProfile }: Readonly<FriendRowProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const { showSuccess, showError } = useAppToast()
  const removeFriend = useRemoveFriend()
  const blockUser = useBlockUser()
  const reportUser = useReportUser()
  const [actionsOpen, setActionsOpen] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  async function runAction(operation: () => Promise<unknown>, successKey?: string) {
    try {
      await operation()
      if (successKey) showSuccess(t(successKey))
    } catch (error: unknown) {
      showError(t(getSocialErrorKey(error)))
    }
  }

  return (
    <>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('social.friends.viewProfile')}
          onPress={() => onOpenProfile({ userId: friend.userId, displayName: friend.displayName })}
          style={({ pressed }) => [styles.identityPress, pressed ? styles.identityPressed : null]}
        >
          <UserAvatar name={friend.displayName} />
          <View style={styles.identity}>
            <Text style={styles.name} numberOfLines={1}>
              {friend.displayName}
            </Text>
            <Text style={styles.sub}>
              {t('social.friends.streakLabel', { count: friend.currentStreak })}
            </Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('social.friends.cheer')}
          onPress={() => onCheer({ recipientId: friend.userId, displayName: friend.displayName })}
          hitSlop={{ top: 7, bottom: 7 }}
          style={({ pressed }) => [styles.cheer, pressed ? styles.cheerPressed : null]}
        >
          <Text style={styles.cheerText}>{t('social.friends.cheer')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('social.friends.moreActions')}
          onPress={() => setActionsOpen(true)}
          hitSlop={4}
          style={({ pressed }) => [styles.more, pressed ? styles.morePressed : null]}
        >
          <MoreVertical size={20} color={tokens.fg3} strokeWidth={1.8} />
        </Pressable>
      </View>

      <BottomSheetModal
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        title={friend.displayName}
        snapPoints={['46%']}
      >
        <View style={styles.actionsSheet}>
          <SettingsGroup>
            <SettingsGroupRow
              label={t('social.friends.viewProfile')}
              accessory="none"
              onPress={() => {
                setActionsOpen(false)
                onOpenProfile({ userId: friend.userId, displayName: friend.displayName })
              }}
            />
            <SettingsGroupRow
              label={t('social.friends.remove')}
              accessory="none"
              onPress={() => {
                setActionsOpen(false)
                setConfirmRemove(true)
              }}
            />
            <SettingsGroupRow
              label={t('social.friends.block')}
              accessory="none"
              onPress={() => {
                setActionsOpen(false)
                setConfirmBlock(true)
              }}
            />
            <SettingsGroupRow
              label={t('social.friends.report')}
              accessory="none"
              onPress={() => {
                setActionsOpen(false)
                setReportOpen(true)
              }}
            />
          </SettingsGroup>
        </View>
      </BottomSheetModal>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t('social.friends.removeConfirmTitle')}
        description={t('social.friends.removeConfirmBody', { name: friend.displayName })}
        confirmLabel={t('social.friends.remove')}
        onConfirm={() => void runAction(() => removeFriend.mutateAsync(friend.userId))}
        variant="danger"
      />
      <ConfirmDialog
        open={confirmBlock}
        onOpenChange={setConfirmBlock}
        title={t('social.block.confirmTitle', { name: friend.displayName })}
        description={t('social.block.confirmBody')}
        confirmLabel={t('social.friends.block')}
        onConfirm={() =>
          void runAction(() => blockUser.mutateAsync(friend.userId), 'social.block.success')
        }
        variant="danger"
      />

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        displayName={friend.displayName}
        busy={reportUser.isPending}
        tokens={tokens}
        onSubmit={async (reason, details) => {
          await runAction(
            () =>
              reportUser.mutateAsync({
                reportedUserId: friend.userId,
                reason,
                details: details.trim() || undefined,
              }),
            'social.report.success',
          )
          setReportOpen(false)
        }}
      />
    </>
  )
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    identityPress: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    identityPressed: { opacity: 0.7 },
    identity: { flex: 1, minWidth: 0, gap: 2 },
    name: { fontFamily: 'Rubik_500Medium', fontSize: 15, color: tokens.fg1 },
    sub: { fontFamily: 'Rubik_400Regular', fontSize: 13, color: tokens.fg3 },
    cheer: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: tintFromPrimary(tokens, 0.12),
    },
    cheerPressed: { transform: [{ scale: 0.96 }] },
    cheerText: { fontFamily: 'Rubik_500Medium', fontSize: 14, color: tokens.primary },
    more: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    morePressed: { transform: [{ scale: 0.96 }] },
    actionsSheet: { paddingHorizontal: 20, paddingBottom: 24 },
    sheetBody: { paddingHorizontal: 22, paddingTop: 4, paddingBottom: 24, gap: 12 },
    fieldLabel: { fontFamily: 'Rubik_500Medium', fontSize: 14, color: tokens.fg2 },
    reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    reasonChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
    reasonChipPressed: { transform: [{ scale: 0.96 }] },
    reasonText: { fontFamily: 'Rubik_400Regular', fontSize: 14 },
    details: {
      minHeight: 80,
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
  })
}
