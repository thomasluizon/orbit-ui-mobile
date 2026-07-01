'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { handleSchema } from '@orbit/shared/types/social'
import { getSocialErrorKey } from '@orbit/shared/utils'
import { AppOverlay } from '@/components/ui/app-overlay'
import { FieldInput } from '@/components/ui/field-input'
import { PillButton } from '@/components/ui/pill-button'
import { useAppToast } from '@/hooks/use-app-toast'
import { useProfile } from '@/hooks/use-profile'
import { useSetHandle } from '@/hooks/use-friends'

interface EditHandleSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Sheet to view and change the social handle after opt-in; the persistent editor the first-run gate never left behind. */
export function EditHandleSheet({ open, onOpenChange }: Readonly<EditHandleSheetProps>) {
  const t = useTranslations()
  const { profile } = useProfile()
  const { showSuccess, showError } = useAppToast()
  const setHandleMutation = useSetHandle()

  const [handle, setHandle] = useState(profile?.handle ?? '')
  const [error, setError] = useState('')
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setHandle(profile?.handle ?? '')
      setError('')
    }
  }

  function handleChange(value: string) {
    setHandle(value)
    if (error) setError('')
  }

  async function handleSave() {
    const trimmed = handle.trim()
    if (!handleSchema.safeParse(trimmed).success) {
      setError(t('social.editHandle.hint'))
      return
    }
    if (trimmed === (profile?.handle ?? '')) {
      onOpenChange(false)
      return
    }
    try {
      await setHandleMutation.mutateAsync(trimmed)
      showSuccess(t('social.editHandle.success'))
      onOpenChange(false)
    } catch (err: unknown) {
      const key = getSocialErrorKey(err)
      setError(t(key))
      showError(t(key))
    }
  }

  return (
    <AppOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={t('social.editHandle.title')}
      isDirty={handle.trim() !== (profile?.handle ?? '')}
    >
      <div className="flex flex-col text-left" style={{ gap: 16 }}>
        <div className="flex flex-col" style={{ gap: 6 }}>
          <FieldInput
            label={t('social.editHandle.label')}
            value={handle}
            onChange={handleChange}
            placeholder={t('social.editHandle.placeholder')}
            maxLength={20}
            autoComplete="off"
            autoFocus
            ariaLabel={t('social.editHandle.label')}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleSave()
            }}
          />
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-3)' }}>
            {t('social.editHandle.hint')}
          </span>
        </div>
        {error && (
          <p
            role="alert"
            style={{
              margin: 0,
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: 'var(--status-bad)',
            }}
          >
            {error}
          </p>
        )}
        <div className="flex flex-col" style={{ gap: 12, paddingTop: 8 }}>
          <PillButton
            fullWidth
            onClick={() => void handleSave()}
            disabled={setHandleMutation.isPending}
            busy={setHandleMutation.isPending}
          >
            {t('common.save')}
          </PillButton>
          <PillButton
            variant="ghost"
            fullWidth
            disabled={setHandleMutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel')}
          </PillButton>
        </div>
      </div>
    </AppOverlay>
  )
}
