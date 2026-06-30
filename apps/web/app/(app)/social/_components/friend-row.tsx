'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { MoreVertical } from 'lucide-react'
import {
  reportReasonSchema,
  type FriendSummary,
  type ReportReason,
} from '@orbit/shared/types/social'
import { getSocialErrorKey } from '@orbit/shared/utils'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PillButton } from '@/components/ui/pill-button'
import { SettingsGroup, SettingsGroupRow } from '@/components/ui/settings-group'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useAppToast } from '@/hooks/use-app-toast'
import { useBlockUser, useRemoveFriend, useReportUser } from '@/hooks/use-friends'
import type { CheerTarget } from './cheer-composer'

interface FriendRowProps {
  friend: FriendSummary
  onCheer: (target: CheerTarget) => void
}

function ReportSheet({
  open,
  onOpenChange,
  displayName,
  onSubmit,
  busy,
}: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  displayName: string
  onSubmit: (reason: ReportReason, details: string) => void
  busy: boolean
}>) {
  const t = useTranslations()
  const [reason, setReason] = useState<ReportReason>('Spam')
  const [details, setDetails] = useState('')

  return (
    <AppOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={t('social.report.title', { name: displayName })}
      footer={
        <PillButton onClick={() => onSubmit(reason, details)} disabled={busy} busy={busy} fullWidth>
          {t('social.report.submit')}
        </PillButton>
      }
    >
      <div className="flex flex-col" style={{ gap: 14 }}>
        <div className="flex flex-col" style={{ gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 500, color: 'var(--fg-2)' }}>
            {t('social.report.reasonLabel')}
          </span>
          <div className="flex flex-wrap" style={{ gap: 8 }}>
            {reportReasonSchema.options.map((option) => {
              const active = option === reason
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setReason(option)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 999,
                    border: 0,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 14,
                    color: active ? 'var(--primary)' : 'var(--fg-2)',
                    background: active ? 'rgba(var(--primary-rgb), 0.12)' : 'var(--bg-elev)',
                    boxShadow: active ? 'inset 0 0 0 1px var(--primary)' : 'inset 0 0 0 1px var(--hairline)',
                  }}
                >
                  {t(`social.report.reasons.${option}`)}
                </button>
              )
            })}
          </div>
        </div>
        <textarea
          value={details}
          onChange={(event) => setDetails(event.target.value.slice(0, 500))}
          maxLength={500}
          placeholder={t('social.report.detailsPlaceholder')}
          aria-label={t('social.report.detailsLabel')}
          rows={3}
          style={{
            width: '100%',
            resize: 'none',
            borderRadius: 14,
            background: 'var(--bg-field)',
            boxShadow: 'inset 0 0 0 1px var(--hairline)',
            padding: '12px 14px',
            fontFamily: 'var(--font-sans)',
            fontSize: 16,
            color: 'var(--fg-1)',
            outline: 'none',
          }}
        />
      </div>
    </AppOverlay>
  )
}

/** One accepted friend: cheer them, or open an action sheet to remove, block, or report. */
export function FriendRow({ friend, onCheer }: Readonly<FriendRowProps>) {
  const t = useTranslations()
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
      <div className="flex items-center" style={{ gap: 12, padding: '12px 20px' }}>
        <UserAvatar name={friend.displayName} />
        <div className="flex-1 min-w-0">
          <p
            className="truncate"
            style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500, color: 'var(--fg-1)' }}
          >
            {friend.displayName}
          </p>
          <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-3)' }}>
            {t('social.friends.streakLabel', { count: friend.currentStreak })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onCheer({ recipientId: friend.userId, displayName: friend.displayName })}
          className="shrink-0 cursor-pointer rounded-full transition-transform active:scale-95"
          style={{
            padding: '7px 14px',
            border: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--primary)',
            background: 'rgba(var(--primary-rgb), 0.12)',
          }}
        >
          {t('social.friends.cheer')}
        </button>
        <button
          type="button"
          aria-label={t('social.friends.remove')}
          onClick={() => setActionsOpen(true)}
          className="inline-flex shrink-0 items-center justify-center rounded-full"
          style={{ width: 36, height: 36, border: 0, background: 'transparent', color: 'var(--fg-3)', cursor: 'pointer' }}
        >
          <MoreVertical size={20} strokeWidth={1.8} />
        </button>
      </div>

      <AppOverlay open={actionsOpen} onOpenChange={setActionsOpen} title={friend.displayName}>
        <SettingsGroup>
          <SettingsGroupRow
            label={t('social.friends.remove')}
            accessory="none"
            onClick={() => {
              setActionsOpen(false)
              setConfirmRemove(true)
            }}
          />
          <SettingsGroupRow
            label={t('social.friends.block')}
            accessory="none"
            onClick={() => {
              setActionsOpen(false)
              setConfirmBlock(true)
            }}
          />
          <SettingsGroupRow
            label={t('social.friends.report')}
            accessory="none"
            onClick={() => {
              setActionsOpen(false)
              setReportOpen(true)
            }}
          />
        </SettingsGroup>
      </AppOverlay>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t('social.friends.removeConfirmTitle')}
        description={t('social.friends.removeConfirmBody', { name: friend.displayName })}
        confirmLabel={t('social.friends.remove')}
        onConfirm={() => runAction(() => removeFriend.mutateAsync(friend.userId))}
        variant="danger"
      />
      <ConfirmDialog
        open={confirmBlock}
        onOpenChange={setConfirmBlock}
        title={t('social.block.confirmTitle', { name: friend.displayName })}
        description={t('social.block.confirmBody')}
        confirmLabel={t('social.friends.block')}
        onConfirm={() => runAction(() => blockUser.mutateAsync(friend.userId), 'social.block.success')}
        variant="danger"
      />

      <ReportSheet
        open={reportOpen}
        onOpenChange={setReportOpen}
        displayName={friend.displayName}
        busy={reportUser.isPending}
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
