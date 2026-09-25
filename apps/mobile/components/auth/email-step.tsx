import { Text, View } from 'react-native'
import { Trans } from 'react-i18next'
import { type AppTokensV2 } from '@/lib/theme'
import { PillButton } from '@/components/ui/pill-button'
import { Input } from '@/components/ui/input'
import type { LoginStyles } from '@/app/login-styles'
import { LoginOfflineNotice } from './login-sections'

interface EmailStepProps {
  email: string
  emailFocusRequest: number
  onEmailChange: (email: string) => void
  isSubmitting: boolean
  isGoogleLoading: boolean
  isOnline: boolean
  errorKey: string | null
  errorMessage: string | null
  onSendCode: () => void
  onSignInWithGoogle: () => void
  onOpenTerms: () => void
  onOpenPrivacy: () => void
  tokens: AppTokensV2
  styles: LoginStyles
  t: (key: string, params?: Record<string, unknown>) => string
  sendCodeLabel?: string
}

export function EmailStep({ email, emailFocusRequest, onEmailChange, isSubmitting, isGoogleLoading, isOnline, errorKey,
  errorMessage, onSendCode, onSignInWithGoogle, onOpenTerms, onOpenPrivacy, tokens, styles, t,
  sendCodeLabel }: Readonly<EmailStepProps>) {
  const fieldError = isOnline && errorKey === 'auth.errors.invalidEmail' ? errorMessage : null
  const googleError = isOnline && errorKey === 'auth.errors.googleError' ? errorMessage : null
  const sendError = isOnline && errorMessage && !fieldError && !googleError ? errorMessage : null
  return <View style={styles.step}>
    <Input label={t('auth.email')} value={email} onChange={onEmailChange} placeholder={t('auth.emailPlaceholder')}
      kind="email" name="email" focusRequest={emailFocusRequest} autoComplete="email" disabled={isSubmitting || isGoogleLoading}
      onSubmit={onSendCode} error={fieldError ?? undefined} />
    <View style={styles.actionGroup}>
      {!isOnline && <LoginOfflineNotice t={t} styles={styles} tokens={tokens} />}
      {sendError && <Text accessibilityRole="alert" style={styles.error}>{sendError}</Text>}
      <PillButton onClick={onSendCode} disabled={isSubmitting || isGoogleLoading || !email.trim() || !isOnline} loading={isSubmitting}>
        {sendCodeLabel ?? t('auth.sendCode')}
      </PillButton>
    </View>
    <View style={styles.divider} importantForAccessibility="no-hide-descendants">
      <View style={styles.dividerLine} /><Text style={styles.dividerText}>{t('auth.orContinueWith')}</Text><View style={styles.dividerLine} />
    </View>
    <View style={styles.titleBlock}>
      {/* eslint-disable-next-line local/max-button-words -- Google's approved sign-in wording is required. */}
      <PillButton variant="ghost" onClick={onSignInWithGoogle} disabled={isGoogleLoading || isSubmitting || !isOnline}
        loading={isGoogleLoading}>{t('auth.signInWithGoogle')}</PillButton>
      {!isOnline && <Text style={styles.reason}>{t('auth.googleOffline')}</Text>}
      {googleError && <Text accessibilityRole="alert" style={styles.error}>{googleError}</Text>}
    </View>
    <Text style={styles.legal}>
      <Trans i18nKey="auth.legalConsent" components={{
        terms: <Text accessibilityRole="link" style={styles.legalLink} onPress={onOpenTerms} />,
        privacy: <Text accessibilityRole="link" style={styles.legalLink} onPress={onOpenPrivacy} />,
      }} />
    </Text>
  </View>
}
