import { Text, View } from 'react-native'
import { type AppTokensV2 } from '@/lib/theme'
import { PillButton } from '@/components/ui/pill-button'
import { Input } from '@/components/ui/input'
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
  sendCodeLabel?: string
}

// react-doctor-disable-next-line no-many-boolean-props -- Deliberate presentational auth step: independent submitting/can-submit/google-loading UI-state flags owned by the login flow; an options-object rewrite would churn the caller and the web parity mirror for no runtime benefit. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
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
  tokens: _tokens,
  styles,
  t,
  sendCodeLabel,
}: Readonly<EmailStepProps>) {
  return (
    <>
      <Input
        label={t('auth.email')}
        value={email}
        onChange={onEmailChange}
        placeholder={t('auth.emailPlaceholder')}
        kind="email"
        autoComplete="email"
        disabled={isSubmitting}
        onSubmit={onSendCode}
      />

      <PillButton

        onClick={onSendCode}
        disabled={!canSubmitEmail}
        loading={isSubmitting}

      >
        {sendCodeLabel ?? t('auth.sendCode')}
      </PillButton>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{t('auth.orContinueWith')}</Text>
        <View style={styles.dividerLine} />
      </View>

      <PillButton
        variant="ghost"

        onClick={onSignInWithGoogle}
        disabled={isGoogleLoading || !isOnline}
        loading={isGoogleLoading}

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
