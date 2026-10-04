'use client'

import { PersonalText } from '@/components/ui/personal-text'

import { useTranslations } from 'next-intl'
import { setNameRequestSchema } from '@orbit/shared/types/profile'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import { Input } from '@/components/ui/input'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import { ActionRow } from '@/components/ui/action-row'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
import { useProfile } from '@/hooks/use-profile'
import { updateName } from '@/lib/actions/profile'
import { useAccountScopedState } from '@/hooks/use-session-reset'

interface EditNameSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditNameSheet({ open, onOpenChange }: Readonly<EditNameSheetProps>) {
  const t = useTranslations()
  const { profile, patchProfile, invalidate } = useProfile()

  const { sheetRef, closeSheet } = useSheetHost()
  const [name, setName] = useAccountScopedState(() => profile?.name ?? '')
  const [error, setError] = useAccountScopedState('')
  const [prevOpen, setPrevOpen] = useAccountScopedState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setName(profile?.name ?? '')
      setError('')
    }
  }

  const mutation = useAccountScopedMutation<void, Error, string, { previous: string | undefined }>({
    mutationFn: (nextName, intendedAccountId) => updateName({ name: nextName }, intendedAccountId),
    onMutate: (nextName) => {
      const previous = profile?.name
      patchProfile({ name: nextName })
      return { previous }
    },
    onSuccess: () => {
      closeSheet()
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
    open ? (<Sheet
      ref={sheetRef}
      open
      onClose={() => onOpenChange(false)}
      title={t('profile.editName.title')}
      actions={(
        <ActionRow>
          <PillButton size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => closeSheet()}>
            {t('common.cancel')}
          </PillButton>
          <PillButton size="sm" onClick={handleSave} disabled={mutation.isPending} loading={mutation.isPending}>
            {t('common.save')}
          </PillButton>
        </ActionRow>
      )}
    >
      <div className="flex flex-col" style={{ gap: 16 }}>
        <Input
          label={t('profile.editName.label')}
          value={name}
          onChange={handleNameChange}
          autoComplete="name"
          autoFocus
          onSubmit={handleSave}
        />
        {profile?.email ? <PersonalText expanded translate="no" className="text-sm text-[var(--fg-2)]">{profile.email}</PersonalText> : null}
        {error && (
          <p
            role="alert"
            style={{
              margin: 0,
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              color: 'var(--status-bad-text)',
            }}
          >
            {error}
          </p>
        )}
      </div>
    </Sheet>) : null
  )
}
