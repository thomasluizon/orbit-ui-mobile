import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { setNameRequestSchema } from '@orbit/shared/types/profile'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { AppTextInput } from '@/components/ui/app-text-input'
import { PillButton } from '@/components/ui/pill-button'
import { useProfile } from '@/hooks/use-profile'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

interface EditNameSheetProps {
  open: boolean
  onClose: () => void
}

export function EditNameSheet({ open, onClose }: Readonly<EditNameSheetProps>) {
  const { t } = useTranslation()
  const { profile, patchProfile } = useProfile()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

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

  const mutation = useMutation<unknown, Error, string, { previous: string | undefined }>({
    mutationFn: (nextName) =>
      performQueuedApiMutation({
        type: 'setName',
        scope: 'profile',
        endpoint: API.profile.name,
        method: 'PUT',
        payload: { name: nextName },
        dedupeKey: 'profile-name',
      }),
    onMutate: (nextName) => {
      const previous = profile?.name
      patchProfile({ name: nextName })
      return { previous }
    },
    onSuccess: () => {
      onClose()
    },
    onError: (err, _nextName, context) => {
      if (context?.previous !== undefined) {
        patchProfile({ name: context.previous })
      }
      setError(getFriendlyErrorMessage(err, t, 'profile.editName.errorGeneric', 'generic'))
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
    <BottomSheetModal
      open={open}
      onClose={onClose}
      title={t('profile.editName.title')}
      isDirty={name !== (profile?.name ?? '')}
      snapPoints={['55%']}
    >
      <View style={styles.body}>
        <Text style={[styles.label, { color: tokens.fg2 }]}>
          {t('profile.editName.label')}
        </Text>
        <AppTextInput
          value={name}
          onChangeText={handleNameChange}
          placeholder={t('profile.editName.placeholder')}
          autoComplete="name"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSave}
          accessibilityLabel={t('profile.editName.label')}
          testID="edit-name-input"
        />
        {error ? (
          <Text
            accessibilityRole="alert"
            testID="edit-name-error"
            style={[styles.error, { color: tokens.statusBad }]}
          >
            {error}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <PillButton
            fullWidth
            onPress={handleSave}
            disabled={mutation.isPending}
            busy={mutation.isPending}
            accessibilityLabel={t('common.save')}
          >
            {t('common.save')}
          </PillButton>
          <PillButton
            variant="ghost"
            fullWidth
            disabled={mutation.isPending}
            onPress={onClose}
            accessibilityLabel={t('common.cancel')}
          >
            {t('common.cancel')}
          </PillButton>
        </View>
      </View>
    </BottomSheetModal>
  )
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 22,
    paddingTop: 8,
    gap: 16,
  },
  label: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
  },
  error: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    gap: 12,
    paddingTop: 8,
  },
})
