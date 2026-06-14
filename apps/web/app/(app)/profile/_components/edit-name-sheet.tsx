'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { setNameRequestSchema } from '@orbit/shared/types/profile'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import { AppOverlay } from '@/components/ui/app-overlay'
import { FieldInput } from '@/components/ui/field-input'
import { PillButton } from '@/components/ui/pill-button'
import { useProfile } from '@/hooks/use-profile'
import { updateName } from '@/app/actions/profile'

interface EditNameSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditNameSheet({ open, onOpenChange }: Readonly<EditNameSheetProps>) {
  const t = useTranslations()
  const { profile, patchProfile, invalidate } = useProfile()

  const [name, setName] = useState(() => profile?.name ?? '')
  const [error, setError] = useState('')
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setName(profile?.name ?? '')
      setError('')
    }
  }

  const mutation = useMutation<void, Error, string, { previous: string | undefined }>({
    mutationFn: (nextName) => updateName({ name: nextName }),
    onMutate: (nextName) => {
      const previous = profile?.name
      patchProfile({ name: nextName })
      return { previous }
    },
    onSuccess: () => {
      onOpenChange(false)
    },
    onError: (err, _nextName, context) => {
      if (context?.previous !== undefined) {
        patchProfile({ name: context.previous })
      }
      setError(getFriendlyErrorMessage(err, t, 'profile.editName.errorGeneric', 'generic'))
    },
    onSettled: () => {
      invalidate()
    },
  })

  function handleNameChange(value: string) {
    setName(value)
    if (error) setError('')
  }

  function handleSave() {
    const parsed = setNameRequestSchema.safeParse({ name })
    if (!parsed.success) {
      setError(
        name.trim().length === 0
          ? t('profile.editName.required')
          : t('profile.editName.tooLong'),
      )
      return
    }
    mutation.mutate(parsed.data.name)
  }

  return (
    <AppOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={t('profile.editName.title')}
      isDirty={name !== (profile?.name ?? '')}
    >
      <div className="flex flex-col" style={{ gap: 16 }}>
        <FieldInput
          label={t('profile.editName.label')}
          value={name}
          onChange={handleNameChange}
          placeholder={t('profile.editName.placeholder')}
          autoComplete="name"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleSave()
          }}
        />
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
            onClick={handleSave}
            disabled={mutation.isPending}
            busy={mutation.isPending}
          >
            {t('common.save')}
          </PillButton>
          <PillButton
            variant="ghost"
            fullWidth
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel')}
          </PillButton>
        </div>
      </div>
    </AppOverlay>
  )
}
