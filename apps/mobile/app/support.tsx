import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  AccessibilityInfo,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import Constants from 'expo-constants'
import { Check, WifiOff } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import {
  buildSupportRequestBody,
  attachSupportVersion,
  getFriendlyErrorMessage,
  getSupportMessageFit,
  getSupportMessageMaxLength,
  getSupportSendReasonKey,
  isValidEmail,
  normalizeSupportSubjectId,
  SUPPORT_SUBJECT_OPTIONS,
  type SupportSubjectId,
} from '@orbit/shared/utils'
import { createTokensV2, radius } from '@/lib/theme'
import { useProfile } from '@/hooks/use-profile'
import { apiClient } from '@/lib/api-client'
import { Input } from '@/components/ui/input'
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { PillButton } from '@/components/ui/pill-button'
import { useAppTheme } from '@/lib/use-app-theme'
import { useOffline } from '@/hooks/use-offline'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import {
  forgetStoredSupportDraft,
  readStoredSupportDraft,
  writeStoredSupportDraft,
} from '@/lib/support-draft-storage'
import { AppBar } from '@/components/ui/app-bar'
import { RadioGroup } from '@/components/ui/radio-row'
import { RadioRow } from '@/components/ui/select-check'

type Tokens = ReturnType<typeof createTokensV2>

interface SupportDraft {
  subject: SupportSubjectId | null
  message: string
}

function SupportSuccessState({
  tokens,
  email,
  onBack,
}: Readonly<{ tokens: Tokens; email: string; onBack: () => void }>) {
  const { t } = useTranslation()
  return (
    <View style={styles.successBlock}>
      <View
        accessible={false}
        style={[styles.successIconCircle, { backgroundColor: tokens.fg1 }]}
      >
        <Check size={24} color={tokens.bg} strokeWidth={1.8} accessible={false} />
      </View>
      <Text accessibilityRole="header" style={[styles.successTitle, { color: tokens.fg1 }]}>
        {t('profile.support.success')}
      </Text>
      <Text style={[styles.successHint, { color: tokens.fg2 }]}>
        {t('profile.support.successHint', { email })}
      </Text>
      <PillButton variant="ghost" onClick={onBack}>
        {t('profile.support.backToAbout')}
      </PillButton>
    </View>
  )
}

interface SupportFormProps {
  tokens: Tokens
  isOnline: boolean
  sending: boolean
  name: string
  email: string
  subject: SupportSubjectId | null
  message: string
  appVersion?: string
  messageMaxLength: number
  messageOverLimitHint: string | null
  error: string | null
  nameError: string | null
  emailError: string | null
  subjectError: string | null
  messageError: string | null
  canSend: boolean
  disabledReason: string | null
  emailDisabled: boolean
  nameFocusRequest: number
  emailFocusRequest: number
  messageFocusRequest: number
  onChangeName: (value: string) => void
  onChangeEmail: (value: string) => void
  onChangeSubject: (value: SupportSubjectId) => void
  onChangeMessage: (value: string) => void
  onSubjectBlur: () => void
  onMessageBlur: () => void
  onSend: () => void
}

function SupportForm({
  tokens,
  isOnline,
  sending,
  name,
  email,
  subject,
  message,
  appVersion,
  messageMaxLength,
  messageOverLimitHint,
  error,
  nameError,
  emailError,
  subjectError,
  messageError,
  canSend,
  disabledReason,
  emailDisabled,
  nameFocusRequest,
  emailFocusRequest,
  messageFocusRequest,
  onChangeName,
  onChangeEmail,
  onChangeSubject,
  onChangeMessage,
  onSubjectBlur,
  onMessageBlur,
  onSend,
}: Readonly<SupportFormProps>) {
  const { t } = useTranslation()
  return (
    <View style={styles.formBlock}>
      <Text style={[styles.formDescription, { color: tokens.fg2 }]}>
        {t('profile.support.description')}
      </Text>
      {error ? (
        <View
          accessibilityRole="alert"
          style={[styles.failureBlock, { backgroundColor: tokens.bgWell }]}
        >
          <Text style={[styles.failureTitle, { color: tokens.fg1 }]}>
            {t('profile.support.failureTitle')}
          </Text>
          <Text style={[styles.failureBody, { color: tokens.fg2 }]}>
            {t('profile.support.failureBody')}
          </Text>
        </View>
      ) : null}
      <Input
        label={t('profile.support.name')}
        value={name}
        onChange={onChangeName}
        placeholder={t('profile.support.namePlaceholder')}
        disabled={sending}
        error={nameError ?? undefined}
        autoComplete="name"
        focusRequest={nameFocusRequest}
      />
      <Input
        label={t('profile.support.email')}
        value={email}
        onChange={onChangeEmail}
        placeholder={t('profile.support.emailPlaceholder')}
        disabled={sending || emailDisabled}
        error={emailError ?? undefined}
        hint={emailDisabled ? t('profile.support.emailLockedReason') : undefined}
        kind="email"
        inputMode="email"
        autoComplete="email"
        focusRequest={emailFocusRequest}
      />
      <View style={styles.subjectField}>
        <Text style={[styles.subjectLabel, { color: tokens.fg2 }]}>
          {t('profile.support.subject')}
        </Text>
        <RadioGroup
          accessibilityLabel={t('profile.support.subject')}
          onBlur={onSubjectBlur}
          style={{ gap: 4 }}
        >
          {SUPPORT_SUBJECT_OPTIONS.map((option) => (
            sending ? (
              <RadioRow
                key={option.id}
                label={t(option.labelKey)}
                description={t(option.descriptionKey)}
                selected={subject === option.id}
                disabled
                reason={t('profile.support.subjectSendingReason')}
              />
            ) : (
              <RadioRow
                key={option.id}
                label={t(option.labelKey)}
                description={t(option.descriptionKey)}
                selected={subject === option.id}
                onSelect={() => onChangeSubject(option.id)}
              />
            )
          ))}
        </RadioGroup>
        {subjectError ? (
          <Text accessibilityRole="alert" style={[styles.subjectError, { color: tokens.statusBadText }]}>
            {subjectError}
          </Text>
        ) : null}
      </View>
      <Input
        label={t('profile.support.message')}
        value={message}
        onChange={onChangeMessage}
        placeholder={t('profile.support.messagePlaceholder')}
        disabled={sending}
        error={messageError ?? undefined}
        hint={messageOverLimitHint ?? undefined}
        maxLength={messageMaxLength}
        multiline
        rows={6}
        focusRequest={messageFocusRequest}
        onBlur={onMessageBlur}
      />
      {appVersion ? (
        <Text style={[styles.versionIncluded, { color: tokens.fg3 }]}>
          {t('profile.support.versionIncluded', { version: appVersion })}
        </Text>
      ) : null}
      {!isOnline ? (
        <View accessibilityLiveRegion="polite" style={[styles.offlineNotice, { backgroundColor: tokens.bgWell }]}>
          <WifiOff size={20} color={tokens.fg3} accessible={false} />
          <Text style={[styles.offlineText, { color: tokens.fg2 }]}>
            {t('profile.support.offlineReason')}
          </Text>
        </View>
      ) : null}
      {isOnline && disabledReason ? (
        <Text style={[styles.formDescription, { color: tokens.fg2 }]}>
          {disabledReason}
        </Text>
      ) : null}
      <View>
        <PillButton
          onClick={onSend}
          disabled={!canSend}
          loading={sending}
          hint={!isOnline ? t('profile.support.offlineReason') : disabledReason ?? undefined}
        >
          {error ? t('profile.support.retry') : t('profile.support.send')}
        </PillButton>
      </View>
    </View>
  )
}

export default function SupportScreen() {
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const { isOnline } = useOffline()
  const { profile } = useProfile()
  const appVersion = Constants.expoConfig?.version?.trim() || undefined
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const draftRef = useRef<SupportDraft>({ subject: null, message: '' })
  const draftChangedRef = useRef(false)
  const [subject, setSubject] = useState<SupportSubjectId | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [subjectError, setSubjectError] = useState<string | null>(null)
  const [messageError, setMessageError] = useState<string | null>(null)
  const [nameFocusRequest, setNameFocusRequest] = useState(0)
  const [emailFocusRequest, setEmailFocusRequest] = useState(0)
  const [messageFocusRequest, setMessageFocusRequest] = useState(0)
  const resolvedEmail = profile?.email || email
  const displayedName = name || profile?.name || ''
  const displayedNameError = displayedName.trim() ? null : nameError
  const displayedEmailError = resolvedEmail.trim() && isValidEmail(resolvedEmail)
    ? null
    : emailError
  const hasSubject = subject !== null
  const hasMessage = Boolean(message.trim())
  const messageFit = getSupportMessageFit(message, appVersion)
  const messageMaxLength = Math.max(getSupportMessageMaxLength(appVersion), message.length)
  const messageOverLimitHint = messageFit.fits
    ? null
    : t('profile.support.messageOverLimit', { overage: messageFit.overage })
  const isIncomplete = !hasSubject || !hasMessage
  const disabledReasonKey = getSupportSendReasonKey({
    hasMessage,
    hasSubject,
    isOnline,
    isSending: sending,
    messageFits: messageFit.fits,
  })
  const disabledReason = disabledReasonKey ? t(disabledReasonKey) : null

  useEffect(() => {
    let isMounted = true
    void readStoredSupportDraft()
      .then((storedDraft) => {
        if (!isMounted || !storedDraft || draftChangedRef.current) return
        try {
          const draft = JSON.parse(storedDraft) as Record<string, unknown>
          const restoredDraft = {
            subject: normalizeSupportSubjectId(draft.subject),
            message: typeof draft.message === 'string' ? draft.message : '',
          } satisfies SupportDraft
          draftRef.current = restoredDraft
          setSubject(restoredDraft.subject)
          setMessage(restoredDraft.message)
        } catch {
          void forgetStoredSupportDraft()
        }
      })
      .catch(() => {})
    return () => {
      isMounted = false
    }
  }, [])

  const persistDraft = useCallback((change: Partial<typeof draftRef.current>) => {
    draftChangedRef.current = true
    draftRef.current = { ...draftRef.current, ...change }
    void writeStoredSupportDraft(JSON.stringify(draftRef.current))
  }, [])

  const validateFields = () => {
    const effectiveName = name.trim() || profile?.name || ''
    const effectiveEmail = resolvedEmail.trim()
    const nextNameError = effectiveName ? null : t('profile.support.nameRequired')
    const nextEmailError = !effectiveEmail
      ? t('profile.support.emailRequired')
      : isValidEmail(effectiveEmail) ? null : t('profile.support.emailInvalid')
    const nextSubjectError = subject ? null : t('profile.support.subjectRequired')
    const nextMessageError = message.trim() ? null : t('profile.support.messageRequired')
    setNameError(nextNameError)
    setEmailError(nextEmailError)
    setSubjectError(nextSubjectError)
    setMessageError(nextMessageError)
    if (nextNameError) setNameFocusRequest((request) => request + 1)
    else if (nextEmailError) setEmailFocusRequest((request) => request + 1)
    else if (nextMessageError) setMessageFocusRequest((request) => request + 1)
    return !nextNameError && !nextEmailError && !nextSubjectError && !nextMessageError
  }

  const handleSend = async () => {
    if (!isOnline || !messageFit.fits) return
    if (!validateFields()) return
    const selectedSubject = SUPPORT_SUBJECT_OPTIONS.find((option) => option.id === subject)
    if (!selectedSubject) return

    setSending(true)
    setError(null)
    setSuccess(false)

    try {
      await apiClient(API.support.send, {
        method: 'POST',
        body: JSON.stringify(
          buildSupportRequestBody(profile, {
            name,
            email: resolvedEmail,
            subject: t(selectedSubject.labelKey),
            message: attachSupportVersion(message, appVersion),
          }),
        ),
      })
      setSuccess(true)
      AccessibilityInfo.announceForAccessibility(t('profile.support.success'))
      draftRef.current = { subject: null, message: '' }
      setSubject(null)
      setMessage('')
      void forgetStoredSupportDraft()
    } catch (err: unknown) {
      setError(getFriendlyErrorMessage(err, t, 'auth.genericError', 'generic'))
    } finally {
      setSending(false)
    }
  }

  const canSend = isOnline && !sending && !isIncomplete && messageFit.fits

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: tokens.bg }]}
      edges={['top']}
    >
      <AppBar
        onBack={() => goBackOrFallback('/profile')}
        title={t('profile.support.title')}
        backLabel={t('common.backToProfile')}
      />
      <KeyboardAwareScrollView
        style={styles.container}
        containerStyle={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardVerticalOffset={12}
      >
        {success ? (
          <SupportSuccessState
            tokens={tokens}
            email={resolvedEmail}
            onBack={() => router.push('/about')}
          />
        ) : (
          <SupportForm
            tokens={tokens}
            isOnline={isOnline}
            sending={sending}
            name={displayedName}
            email={resolvedEmail}
            subject={subject}
            message={message}
            appVersion={appVersion}
            messageMaxLength={messageMaxLength}
            messageOverLimitHint={messageOverLimitHint}
            error={error}
            nameError={displayedNameError}
            emailError={displayedEmailError}
            subjectError={subjectError}
            messageError={messageError}
            canSend={canSend}
            disabledReason={disabledReason}
            emailDisabled={Boolean(profile?.email)}
            nameFocusRequest={nameFocusRequest}
            emailFocusRequest={emailFocusRequest}
            messageFocusRequest={messageFocusRequest}
            onChangeName={(next) => {
              setName(next)
              setNameError(null)
            }}
            onChangeEmail={(next) => {
              setEmail(next)
              setEmailError(null)
            }}
            onChangeSubject={(next) => {
              setSubject(next)
              setSubjectError(null)
              persistDraft({ subject: next })
            }}
            onSubjectBlur={() => {
              if (!subject) setSubjectError(t('profile.support.subjectRequired'))
            }}
            onChangeMessage={(next) => {
              setMessage(next)
              setMessageError(null)
              persistDraft({ message: next })
            }}
            onMessageBlur={() => {
              if (!message.trim()) setMessageError(t('profile.support.messageRequired'))
            }}
            onSend={() => {
              void handleSend()
            }}
          />
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24 },
  formBlock: {
    gap: 24,
  },
  formDescription: {
    fontFamily: 'Geist_400Regular',
    fontSize: 16,
    lineHeight: 24,
  },
  failureBlock: { gap: 8, padding: 16, borderRadius: radius.md },
  failureTitle: { fontFamily: 'Geist_500Medium', fontSize: 17, lineHeight: 23.8 },
  failureBody: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21.7 },
  subjectField: { gap: 8 },
  subjectLabel: { fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 19.6 },
  subjectError: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21 },
  versionIncluded: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21 },
  offlineNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
  },
  offlineText: { flex: 1, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21 },
  successBlock: {
    paddingHorizontal: 24,
    paddingVertical: 48,
    alignItems: 'flex-start',
    gap: 16,
  },
  successIconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontFamily: 'Geist_500Medium',
    fontSize: 22,
    letterSpacing: -0.22,
    lineHeight: 26.4,
  },
  successHint: {
    fontFamily: 'Geist_400Regular',
    fontSize: 16,
    lineHeight: 24.8,
  },
})
