'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { X, Check } from 'lucide-react'
import { getErrorMessage } from '@orbit/shared/utils'
import { AppOverlay } from '@/components/ui/app-overlay'
import { FreshStartAnimation } from '@/components/ui/fresh-start-animation'
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

  function handleOpenChange(value: boolean) {
    if (value) {
      setStep('info')
      setConfirmText('')
      setError('')
      setLoading(false)
    }
    onOpenChange(value)
  }

  async function handleReset() {
    if (!isConfirmed) return
    setLoading(true)
    setError('')
    try {
      await resetAccount()
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

  const deletedItems = [
    t('profile.freshStart.deleteHabits'),
    t('profile.freshStart.deleteGoals'),
    t('profile.freshStart.deleteChat'),
    t('profile.freshStart.deleteUserFacts'),
    t('profile.freshStart.deleteAchievements'),
    t('profile.freshStart.deleteNotifications'),
    t('profile.freshStart.deleteChecklist'),
    t('profile.freshStart.deleteOnboarding'),
  ]

  const preservedItems = [
    t('profile.freshStart.preserveAccount'),
    t('profile.freshStart.preserveSubscription'),
    t('profile.freshStart.preservePreferences'),
  ]

  return (
    <>
      <AppOverlay
        open={open}
        onOpenChange={handleOpenChange}
        title={t('profile.freshStart.title')}
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

      {showAnimation && (
        <FreshStartAnimation onComplete={handleAnimationComplete} />
      )}
    </>
  )
}

// --- Sub-components for each step ---

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
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        {t('profile.freshStart.description')}
      </p>

      <div className="border border-primary/20 rounded-2xl p-4">
        <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">
          {t('profile.freshStart.whatDeleted')}
        </p>
        <ul className="space-y-1.5">
          {deletedItems.map((item) => (
            <li key={item} className="text-xs text-text-secondary flex items-start gap-2">
              <X className="size-3.5 text-red-400 shrink-0 mt-0.5" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-success/10 border border-success/20 rounded-2xl p-4">
        <p className="text-xs font-bold text-success uppercase tracking-wider mb-2">
          {t('profile.freshStart.whatPreserved')}
        </p>
        <ul className="space-y-1.5">
          {preservedItems.map((item) => (
            <li key={item} className="text-xs text-text-secondary flex items-start gap-2">
              <Check className="size-3.5 text-success shrink-0 mt-0.5" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <button
        className="w-full py-3 rounded-2xl bg-primary text-text-inverse font-bold text-sm hover:bg-primary/90 transition-colors"
        onClick={onContinue}
      >
        {t('common.continue')}
      </button>
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
    <div className="space-y-4">
      <p className="text-sm text-text-secondary text-center">
        {t('profile.freshStart.confirmInstruction')}
      </p>
      <input
        type="text"
        value={confirmText}
        onChange={(e) => onConfirmTextChange(e.target.value)}
        className="form-input text-center"
        placeholder={t('profile.freshStart.confirmPlaceholder')}
        autoComplete="off"
      />
      {error && (
        <p className="text-xs text-red-400 text-center">{error}</p>
      )}
      <button
        className="w-full py-3 rounded-2xl bg-primary text-text-inverse font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
        disabled={!isConfirmed || loading}
        onClick={onReset}
      >
        {loading ? t('profile.freshStart.processing') : t('profile.freshStart.confirmButton')}
      </button>
    </div>
  )
}
