'use client'

import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import {
  buildFreshStartDeletedItems,
  buildFreshStartPreservedItems,
  getErrorMessage,
} from '@orbit/shared/utils'
import { AppOverlay } from '@/components/ui/app-overlay'
import { FreshStartAnimation } from '@/components/ui/fresh-start-animation'
import { FieldInput } from '@/components/ui/field-input'
import { resetAccount } from '@/app/actions/profile'

interface FreshStartModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FreshStartModal({ open, onOpenChange }: Readonly<FreshStartModalProps>) {
  const t = useTranslations()
  const queryClient = useQueryClient()

  const [step, setStep] = useState<'info' | 'confirm'>('info')
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAnimation, setShowAnimation] = useState(false)

  const isConfirmed = confirmText.trim().toUpperCase() === 'ORBIT'

  const handleOpenChange = useCallback(
    (value: boolean) => {
      if (value) {
        setStep('info')
        setConfirmText('')
        setError('')
        setLoading(false)
      }
      onOpenChange(value)
    },
    [onOpenChange],
  )

  async function handleReset() {
    if (!isConfirmed) return
    setLoading(true)
    setError('')
    try {
      await resetAccount()
      localStorage.removeItem('orbit-checklist-templates')
      localStorage.removeItem('orbit:checklist-templates')
      localStorage.removeItem('orbit_trial_expired_seen')
      onOpenChange(false)
      setShowAnimation(true)
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('profile.freshStart.errorGeneric')))
    } finally {
      setLoading(false)
    }
  }

  function handleAnimationComplete() {
    setShowAnimation(false)
    queryClient.clear()
    globalThis.location.href = '/'
  }

  const deletedItems = buildFreshStartDeletedItems(t)
  const preservedItems = buildFreshStartPreservedItems(t)

  return (
    <>
      <AppOverlay
        open={open}
        onOpenChange={handleOpenChange}
        title={
          step === 'info'
            ? t('profile.freshStart.heading')
            : t('profile.freshStart.confirmHeading')
        }
      >
        {step === 'info' ? (
          <FreshStartInfoStep
            deletedItems={deletedItems}
            preservedItems={preservedItems}
            onContinue={() => setStep('confirm')}
          />
        ) : (
          <FreshStartConfirmStep
            confirmText={confirmText}
            onConfirmTextChange={setConfirmText}
            isConfirmed={isConfirmed}
            loading={loading}
            error={error}
            onReset={handleReset}
          />
        )}
      </AppOverlay>

      {showAnimation && <FreshStartAnimation onComplete={handleAnimationComplete} />}
    </>
  )
}

function ListBlock({ title, items }: Readonly<{ title: string; items: string[] }>) {
  return (
    <div className="flex flex-col" style={{ gap: 6 }}>
      <div
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--fg-3)',
        }}
      >
        {title}
      </div>
      <div className="flex flex-col" style={{ gap: 3 }}>
        {items.map((item) => (
          <span
            key={item}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--fg-1)',
            }}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

function FreshStartInfoStep({
  deletedItems,
  preservedItems,
  onContinue,
}: Readonly<{
  deletedItems: string[]
  preservedItems: string[]
  onContinue: () => void
}>) {
  const t = useTranslations()

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          fontStyle: 'italic',
          color: 'var(--fg-2)',
          lineHeight: 1.55,
        }}
      >
        {t('profile.freshStart.description')}
      </p>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ListBlock title={t('profile.freshStart.willDelete')} items={deletedItems} />
        <ListBlock title={t('profile.freshStart.willKeep')} items={preservedItems} />
      </div>
      <div
        className="flex items-center justify-end"
        style={{ gap: 12, paddingTop: 8 }}
      >
        <button
          type="button"
          className="appearance-none border-0 bg-transparent cursor-pointer"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            color: 'var(--fg-3)',
            padding: 6,
          }}
          onClick={() => globalThis.history.back()}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="appearance-none border-0 cursor-pointer"
          onClick={onContinue}
          style={{
            padding: '10px 18px',
            background: 'var(--primary)',
            color: 'var(--fg-on-primary)',
            borderRadius: 10,
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {t('common.continue')}
        </button>
      </div>
    </div>
  )
}

function FreshStartConfirmStep({
  confirmText,
  onConfirmTextChange,
  isConfirmed,
  loading,
  error,
  onReset,
}: Readonly<{
  confirmText: string
  onConfirmTextChange: (value: string) => void
  isConfirmed: boolean
  loading: boolean
  error: string
  onReset: () => void
}>) {
  const t = useTranslations()

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          fontStyle: 'italic',
          color: 'var(--fg-3)',
        }}
      >
        {t('profile.freshStart.confirmInstruction')}
      </p>
      <FieldInput
        mono
        value={confirmText}
        onChange={onConfirmTextChange}
        placeholder={t('profile.freshStart.confirmPlaceholder')}
        autoComplete="off"
        ariaLabel={t('profile.freshStart.confirmInstruction')}
      />
      {error && (
        <p
          role="alert"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            fontStyle: 'italic',
            color: 'var(--status-overdue)',
          }}
        >
          {error}
        </p>
      )}
      <div
        className="flex items-center justify-end"
        style={{ gap: 12, paddingTop: 8 }}
      >
        <button
          type="button"
          className="appearance-none border-0 bg-transparent cursor-pointer"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            color: 'var(--fg-3)',
            padding: 6,
          }}
          disabled={loading}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="appearance-none border-0 bg-transparent cursor-pointer disabled:opacity-50"
          disabled={!isConfirmed || loading}
          onClick={onReset}
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--fg-1)',
            fontStyle: 'italic',
            padding: 6,
          }}
        >
          {loading ? t('profile.freshStart.processing') : t('profile.freshStart.confirmButton')}
        </button>
      </div>
    </div>
  )
}
