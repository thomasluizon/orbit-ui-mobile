'use client'

import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Check, RotateCcw, X } from 'lucide-react'
import {
  buildFreshStartDeletedItems,
  buildFreshStartPreservedItems,
  getFriendlyErrorMessage,
} from '@orbit/shared/utils'
import { AppOverlay } from '@/components/ui/app-overlay'
import { FreshStartAnimation } from '@/components/ui/fresh-start-animation'
import { FieldInput } from '@/components/ui/field-input'
import { PillButton } from '@/components/ui/pill-button'
import { resetAccount } from '@/app/actions/profile'

function AmberPillButton({
  disabled = false,
  onClick,
  children,
}: Readonly<{
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}>) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex w-full cursor-pointer items-center justify-center gap-[9px] rounded-full border-0 px-[26px] py-[15px] text-[16px] font-medium transition-[opacity,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] enabled:hover:opacity-90 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        fontFamily: 'var(--font-sans)',
        background: 'var(--status-overdue)',
        color: 'var(--fg-on-overdue)',
      }}
    >
      {children}
    </button>
  )
}

function FreshStartHero({ body }: Readonly<{ body: string }>) {
  return (
    <div className="flex flex-col items-center text-center" style={{ gap: 16 }}>
      <div
        aria-hidden="true"
        className="flex items-center justify-center rounded-full"
        style={{
          width: 80,
          height: 80,
          background: 'color-mix(in srgb, var(--status-overdue) 14%, transparent)',
        }}
      >
        <RotateCcw size={34} strokeWidth={1.8} color="var(--status-overdue)" />
      </div>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 15,
          color: 'var(--fg-2)',
          lineHeight: 1.5,
          margin: 0,
          textWrap: 'pretty',
        }}
      >
        {body}
      </p>
    </div>
  )
}

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
      setError(getFriendlyErrorMessage(err, t, 'profile.freshStart.errorGeneric', 'generic'))
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
            onCancel={() => onOpenChange(false)}
            onContinue={() => setStep('confirm')}
          />
        ) : (
          <FreshStartConfirmStep
            confirmText={confirmText}
            onConfirmTextChange={setConfirmText}
            isConfirmed={isConfirmed}
            loading={loading}
            error={error}
            onCancel={() => onOpenChange(false)}
            onReset={() => void handleReset()}
          />
        )}
      </AppOverlay>

      {showAnimation && <FreshStartAnimation onComplete={handleAnimationComplete} />}
    </>
  )
}

function ListBlock({
  title,
  items,
  itemIcon,
}: Readonly<{ title: string; items: string[]; itemIcon: 'delete' | 'keep' }>) {
  return (
    <div
      className="flex flex-col rounded-[16px]"
      style={{
        gap: 8,
        padding: '14px 16px',
        background: 'var(--bg-card)',
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--fg-3)',
        }}
      >
        {title}
      </div>
      <div className="flex flex-col" style={{ gap: 6 }}>
        {items.map((item) => (
          <span key={item} className="flex items-start" style={{ gap: 8 }}>
            {itemIcon === 'delete' ? (
              <X
                size={14}
                strokeWidth={1.8}
                color="var(--status-bad)"
                aria-hidden="true"
                className="shrink-0"
                style={{ marginTop: 2 }}
              />
            ) : (
              <Check
                size={14}
                strokeWidth={1.8}
                color="var(--status-done)"
                aria-hidden="true"
                className="shrink-0"
                style={{ marginTop: 2 }}
              />
            )}
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                lineHeight: 1.4,
                color: 'var(--fg-2)',
              }}
            >
              {item}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

function FreshStartInfoStep({
  deletedItems,
  preservedItems,
  onCancel,
  onContinue,
}: Readonly<{
  deletedItems: string[]
  preservedItems: string[]
  onCancel: () => void
  onContinue: () => void
}>) {
  const t = useTranslations()

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <FreshStartHero body={t('profile.freshStart.description')} />
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <ListBlock
          title={t('profile.freshStart.willDelete')}
          items={deletedItems}
          itemIcon="delete"
        />
        <ListBlock
          title={t('profile.freshStart.willKeep')}
          items={preservedItems}
          itemIcon="keep"
        />
      </div>
      <div
        className="flex flex-col sm:mx-auto sm:w-full sm:max-w-[360px]"
        style={{ gap: 12, paddingTop: 8 }}
      >
        <AmberPillButton onClick={onContinue}>
          {t('common.continue')}
        </AmberPillButton>
        <PillButton variant="ghost" fullWidth onClick={onCancel}>
          {t('common.cancel')}
        </PillButton>
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
  onCancel,
  onReset,
}: Readonly<{
  confirmText: string
  onConfirmTextChange: (value: string) => void
  isConfirmed: boolean
  loading: boolean
  error: string
  onCancel: () => void
  onReset: () => void
}>) {
  const t = useTranslations()

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 15,
          color: 'var(--fg-2)',
          lineHeight: 1.55,
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
        onKeyDown={(event) => {
          if (event.key === 'Enter' && isConfirmed && !loading) {
            event.preventDefault()
            onReset()
          }
        }}
      />
      {error && (
        <p
          role="alert"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            color: 'var(--status-bad-text)',
          }}
        >
          {error}
        </p>
      )}
      <div
        className="flex flex-col sm:mx-auto sm:w-full sm:max-w-[360px]"
        style={{ gap: 12, paddingTop: 8 }}
      >
        <AmberPillButton disabled={!isConfirmed || loading} onClick={onReset}>
          {loading ? t('profile.freshStart.processing') : t('profile.freshStart.confirmButton')}
        </AmberPillButton>
        <PillButton variant="ghost" fullWidth disabled={loading} onClick={onCancel}>
          {t('common.cancel')}
        </PillButton>
      </div>
    </div>
  )
}
