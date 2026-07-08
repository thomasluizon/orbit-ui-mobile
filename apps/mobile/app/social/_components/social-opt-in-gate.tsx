import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { handleSchema } from '@orbit/shared/types/social'
import { getSocialErrorKey } from '@orbit/shared/utils'
import { AppTextInput } from '@/components/ui/app-text-input'
import { PillButton } from '@/components/ui/pill-button'
import { useAppToast } from '@/hooks/use-app-toast'
import { useProfile } from '@/hooks/use-profile'
import { useSetHandle, useSetSocialOptIn } from '@/hooks/use-friends'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/**
 * First-run gate shown when the user has not opted into social: confirms a handle and flips the
 * `socialOptIn` flag. Until enabled, every friends call returns 403, so this stands in for the
 * surface rather than letting the reads error.
 */
export function SocialOptInGate() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const { profile } = useProfile()
  const { showSuccess, showError } = useAppToast()
  const setHandle = useSetHandle()
  const setSocialOptIn = useSetSocialOptIn()
  const [handle, setHandleValue] = useState(profile?.handle ?? '')

  const isSubmitting = setHandle.isPending || setSocialOptIn.isPending

  async function handleEnable() {
    const trimmed = handle.trim()
    if (!handleSchema.safeParse(trimmed).success) {
      showError(t('social.optInGate.handleHint'))
      return
    }
    try {
      if (trimmed !== profile?.handle) {
        await setHandle.mutateAsync(trimmed)
      }
      await setSocialOptIn.mutateAsync(true)
      showSuccess(t('social.optInGate.success'))
    } catch (error: unknown) {
      showError(t(getSocialErrorKey(error)))
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{t('social.optInGate.title')}</Text>
      <Text style={styles.body}>{t('social.optInGate.body')}</Text>
      <View style={styles.field}>
        <Text style={styles.label}>{t('social.optInGate.handleLabel')}</Text>
        <AppTextInput
          value={handle}
          onChangeText={setHandleValue}
          placeholder={t('social.optInGate.handlePlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
        />
        <Text style={styles.hint}>{t('social.optInGate.handleHint')}</Text>
      </View>
      <PillButton onPress={() => void handleEnable()} disabled={isSubmitting} busy={isSubmitting} fullWidth>
        {isSubmitting ? t('social.optInGate.enabling') : t('social.optInGate.enable')}
      </PillButton>
    </ScrollView>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    container: { paddingHorizontal: 24, paddingVertical: 28, gap: 18, alignItems: 'center' },
    title: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 28,
      lineHeight: 36,
      letterSpacing: -0.28,
      color: tokens.fg1,
      textAlign: 'center',
    },
    body: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      lineHeight: 23,
      color: tokens.fg2,
      textAlign: 'center',
    },
    field: { alignSelf: 'stretch', gap: 6 },
    label: { fontFamily: 'Rubik_500Medium', fontSize: 14, color: tokens.fg2 },
    hint: { fontFamily: 'Rubik_400Regular', fontSize: 13, color: tokens.fg3 },
  })
}
