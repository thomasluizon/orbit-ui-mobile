import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { handleSchema } from '@orbit/shared/types/social'
import { getSocialErrorKey } from '@orbit/shared/utils'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { AppTextInput } from '@/components/ui/app-text-input'
import { PillButton } from '@/components/ui/pill-button'
import { useAppToast } from '@/hooks/use-app-toast'
import { useProfile } from '@/hooks/use-profile'
import { useSetHandle } from '@/hooks/use-friends'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface EditHandleSheetProps {
  open: boolean
  onClose: () => void
}

/** Sheet to view and change the social handle after opt-in; the persistent editor the first-run gate never left behind. */
export function EditHandleSheet({ open, onClose }: Readonly<EditHandleSheetProps>) {
  const { t } = useTranslation()
  const { profile } = useProfile()
  const { showSuccess, showError } = useAppToast()
  const setHandle = useSetHandle()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  const [handle, setHandleValue] = useState(() => profile?.handle ?? '')
  const [error, setError] = useState('')
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setHandleValue(profile?.handle ?? '')
      setError('')
    }
  }

  function handleChange(value: string) {
    setHandleValue(value)
    if (error) setError('')
  }

  async function handleSave() {
    const trimmed = handle.trim()
    if (!handleSchema.safeParse(trimmed).success) {
      setError(t('social.editHandle.hint'))
      return
    }
    if (trimmed === (profile?.handle ?? '')) {
      onClose()
      return
    }
    try {
      await setHandle.mutateAsync(trimmed)
      showSuccess(t('social.editHandle.success'))
      onClose()
    } catch (err: unknown) {
      const key = getSocialErrorKey(err)
      setError(t(key))
      showError(t(key))
    }
  }

  return (
    <BottomSheetModal
      open={open}
      onClose={onClose}
      title={t('social.editHandle.title')}
      isDirty={handle.trim() !== (profile?.handle ?? '')}
      snapPoints={['55%']}
    >
      <View style={styles.body}>
        <Text style={[styles.label, { color: tokens.fg2 }]}>{t('social.editHandle.label')}</Text>
        <AppTextInput
          value={handle}
          onChangeText={handleChange}
          placeholder={t('social.editHandle.placeholder')}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSave}
          accessibilityLabel={t('social.editHandle.label')}
          testID="edit-handle-input"
        />
        <Text style={[styles.hint, { color: tokens.fg3 }]}>{t('social.editHandle.hint')}</Text>
        {error ? (
          <Text
            accessibilityRole="alert"
            testID="edit-handle-error"
            style={[styles.error, { color: tokens.statusBad }]}
          >
            {error}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <PillButton
            fullWidth
            onPress={handleSave}
            disabled={setHandle.isPending}
            busy={setHandle.isPending}
            accessibilityLabel={t('common.save')}
          >
            {t('common.save')}
          </PillButton>
          <PillButton
            variant="ghost"
            fullWidth
            disabled={setHandle.isPending}
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
  body: { paddingHorizontal: 22, paddingTop: 8, gap: 16 },
  label: { fontFamily: 'Rubik_500Medium', fontSize: 14 },
  hint: { fontFamily: 'Rubik_400Regular', fontSize: 13, lineHeight: 18 },
  error: { fontFamily: 'Rubik_400Regular', fontSize: 13, lineHeight: 18 },
  actions: { gap: 12, paddingTop: 8 },
})
