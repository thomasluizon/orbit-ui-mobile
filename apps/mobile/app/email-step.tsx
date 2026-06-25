import { Text, View } from 'react-native'
import { type AppTokensV2 } from '@/lib/theme'
import { PillButton } from '@/components/ui/pill-button'
import { FieldInput } from '@/components/ui/field-input'
import { Spinner, GoogleIcon } from './login-atoms'
import type { LoginStyles } from './login-styles'

type TranslationFn = (key: string, params?: Record<string, unknown>) => string

interface EmailStepProps {
  email: string
  onEmailChange: (email: string) => void
  isSubmitting: boolean
  canSubmitEmail: boolean
  isGoogleLoading: boolean
  isOnline: boolean
  onSendCode: () => void
  onSignInWithGoogle: () => void
  onOpenTerms: () => void
  onOpenPrivacy: () => void
  tokens: AppTokensV2
  styles: LoginStyles
  t: TranslationFn
}

export function EmailStep({
  email,
  onEmailChange,
  isSubmitting,
  canSubmitEmail,
  isGoogleLoading,
  isOnline,
  onSendCode,
  onSignInWithGoogle,
  onOpenTerms,
  onOpenPrivacy,
  tokens,
  styles,
  t,
}: Readonly<EmailStepProps>) {
  return (
    <>
      <FieldInput
        label={t('auth.email')}
        value={email}
        onChangeText={onEmailChange}
        placeholder={t('auth.emailPlaceholder')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        editable={!isSubmitting}
        onSubmitEditing={onSendCode}
        returnKeyType="send"
        accessibilityLabel={t('auth.email')}
      />

      <PillButton
        fullWidth
        onPress={onSendCode}
        disabled={!canSubmitEmail}
        busy={isSubmitting}
        leading={isSubmitting ? <Spinner color={tokens.fgOnPrimary} /> : undefined}
      >
        {t('auth.sendCode')}
      </PillButton>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{t('auth.orContinueWith')}</Text>
        <View style={styles.dividerLine} />
      </View>

      <PillButton
        variant="ghost"
        fullWidth
        onPress={onSignInWithGoogle}
        disabled={isGoogleLoading || !isOnline}
        busy={isGoogleLoading}
        leading={
          isGoogleLoading ? (
            <Spinner size={20} color={tokens.fg1} />
          ) : (
            <GoogleIcon />
          )
        }
      >
        {t('auth.signInWithGoogle')}
      </PillButton>

      <Text style={styles.legal}>
        {t('auth.legalPrefix')}{' '}
        <Text style={styles.legalLink} onPress={onOpenTerms}>
          {t('auth.terms')}
        </Text>{' '}
        {t('auth.legalConjunction')}{' '}
        <Text style={styles.legalLink} onPress={onOpenPrivacy}>
          {t('auth.privacy')}
        </Text>
        .
      </Text>
    </>
  )
}
