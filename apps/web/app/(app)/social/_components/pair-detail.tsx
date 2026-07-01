'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { AccountabilityPair } from '@orbit/shared/types/accountability'
import { formatAPIDate, formatLocaleDate, getAccountabilityErrorKey } from '@orbit/shared/utils'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PillButton } from '@/components/ui/pill-button'
import { SectionLabel } from '@/components/ui/section-label'
import { useAppToast } from '@/hooks/use-app-toast'
import { useHabits } from '@/hooks/use-habits'
import {
  useAccountabilityCheckIns,
  useAccountabilityPairs,
  useCheckInAccountability,
  useEndAccountabilityPair,
  useSetAccountabilityHabits,
} from '@/hooks/use-accountability'
import { HabitMultiSelect } from './habit-multi-select'

interface PairDetailProps {
  pairId: string | null
  onClose: () => void
}

const MAX_NOTE = 200

const rowLabelStyle = {
  fontFamily: 'var(--font-sans)',
  fontSize: 14,
  color: 'var(--fg-3)',
} as const

/** Overlay detail for one active pair: your habits, buddy count, history, check-in, edit habits, unpair. */
export function PairDetail({ pairId, onClose }: Readonly<PairDetailProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const { showSuccess, showError } = useAppToast()
  const { data } = useAccountabilityPairs()
  const { data: habitsData } = useHabits({})
  const checkInsQuery = useAccountabilityCheckIns(pairId)
  const checkIn = useCheckInAccountability()
  const setHabits = useSetAccountabilityHabits()
  const end = useEndAccountabilityPair()

  const [note, setNote] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editHabitIds, setEditHabitIds] = useState<string[]>([])
  const [confirmUnpair, setConfirmUnpair] = useState(false)

  const pair: AccountabilityPair | undefined = data?.activePairs.find((item) => item.id === pairId)
  const open = pairId !== null

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
      onClose()
    } catch (error: unknown) {
      showError(t(getAccountabilityErrorKey(error)))
    }
  }

  return (
    <>
      <AppOverlay
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose()
        }}
        title={pair ? pair.buddy.displayName : t('social.buddies.detail.title')}
      >
        {!pair ? (
          <p style={{ margin: 0, padding: '8px 0 24px', fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--fg-3)' }}>
            {t('social.buddies.detail.notFound')}
          </p>
        ) : (
          <div className="flex flex-col" style={{ gap: 4 }}>
            <div className="flex items-center justify-between" style={{ padding: '8px 0' }}>
              <span style={rowLabelStyle}>{t('social.buddies.detail.cadenceLabel')}</span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 500, color: 'var(--fg-1)' }}>
                {t(`social.buddies.cadence.${pair.cadence}`)}
              </span>
            </div>

            <SectionLabel>{t('social.buddies.detail.yourHabits')}</SectionLabel>
            <div className="flex flex-wrap" style={{ gap: 8, paddingBottom: 4 }}>
              {myHabitTitles.map((title) => (
                <span
                  key={title}
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    color: 'var(--fg-2)',
                    background: 'var(--bg-elev)',
                    boxShadow: 'inset 0 0 0 1px var(--hairline)',
                    padding: '6px 12px',
                    borderRadius: 999,
                  }}
                >
                  {title}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={openEdit}
              className="self-start cursor-pointer"
              style={{
                marginTop: 4,
                padding: 0,
                border: 0,
                background: 'transparent',
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--primary)',
              }}
            >
              {t('social.buddies.detail.editHabits')}
            </button>

            <SectionLabel>{t('social.buddies.detail.buddyHabits', { name: pair.buddy.displayName })}</SectionLabel>
            <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-3)' }}>
              {t('social.buddies.detail.buddyHabitsCount', { count: pair.buddyHabitIds.length })}
            </p>

            <SectionLabel>{t('social.buddies.checkInTitle')}</SectionLabel>
            {checkedInToday ? (
              <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-3)' }}>
                {t('social.buddies.checkedInLabel')}
              </p>
            ) : (
              <div className="flex flex-col" style={{ gap: 10 }}>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value.slice(0, MAX_NOTE))}
                  maxLength={MAX_NOTE}
                  placeholder={t('social.buddies.checkInNotePlaceholder')}
                  aria-label={t('social.buddies.checkInNotePlaceholder')}
                  rows={2}
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
                <PillButton
                  onClick={handleCheckIn}
                  disabled={checkIn.isPending}
                  busy={checkIn.isPending}
                  fullWidth
                >
                  {t('social.buddies.checkInSubmit')}
                </PillButton>
              </div>
            )}

            <SectionLabel>{t('social.buddies.detail.history')}</SectionLabel>
            {(checkInsQuery.data?.items.length ?? 0) === 0 ? (
              <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-3)' }}>
                {t('social.buddies.detail.historyEmpty')}
              </p>
            ) : (
              <div className="flex flex-col" style={{ gap: 10, paddingBottom: 8 }}>
                {checkInsQuery.data?.items.map((item) => (
                  <div key={item.id} className="flex flex-col" style={{ gap: 2 }}>
                    <div className="flex items-center justify-between" style={{ gap: 10 }}>
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 500, color: 'var(--fg-1)' }}>
                        {item.displayName}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-3)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatLocaleDate(item.date, locale, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    {item.note ? (
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-2)' }}>
                        {item.note}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setConfirmUnpair(true)}
              className="self-start cursor-pointer"
              style={{
                marginTop: 16,
                padding: 0,
                border: 0,
                background: 'transparent',
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--status-bad)',
              }}
            >
              {t('social.buddies.detail.unpair')}
            </button>
          </div>
        )}
      </AppOverlay>

      <AppOverlay
        open={editOpen}
        onOpenChange={setEditOpen}
        title={t('social.buddies.detail.editHabitsTitle')}
        footer={
          <PillButton
            onClick={handleSaveHabits}
            disabled={editHabitIds.length === 0 || setHabits.isPending}
            busy={setHabits.isPending}
            fullWidth
          >
            {t('common.save')}
          </PillButton>
        }
      >
        <HabitMultiSelect selectedIds={editHabitIds} onChange={setEditHabitIds} />
      </AppOverlay>

      <ConfirmDialog
        open={confirmUnpair}
        onOpenChange={setConfirmUnpair}
        title={t('social.buddies.detail.unpairConfirmTitle', { name: pair?.buddy.displayName ?? '' })}
        description={t('social.buddies.detail.unpairConfirmBody')}
        confirmLabel={t('social.buddies.detail.unpair')}
        onConfirm={handleUnpair}
        variant="danger"
      />
    </>
  )
}
