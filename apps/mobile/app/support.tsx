import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  StyleSheet,
  Text,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Check } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import {
  buildSupportRequestBody,
  getFriendlyErrorMessage,
  isValidEmail,
  SUPPORT_API_MESSAGE_MAX_LENGTH,
  SUPPORT_API_SUBJECT_MAX_LENGTH,
} from '@orbit/shared/utils'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useProfile } from '@/hooks/use-profile'
import { apiClient } from '@/lib/api-client'
import { Input } from '@/components/ui/input'
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { PillButton } from '@/components/ui/pill-button'
import { useAppTheme } from '@/lib/use-app-theme'
import { useOffline } from '@/hooks/use-offline'
import { ErrorState } from '@/components/ui/error-state'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { AppBar } from '@/components/ui/app-bar'

type Tokens = ReturnType<typeof createTokensV2>

const SUPPORT_DRAFT_STORAGE_KEY = 'orbit-support-draft'

function SupportSuccessState({ tokens }: Readonly<{ tokens: Tokens }>) {
  const { t } = useTranslation()
  return (
    <View style={styles.successBlock}>
      <View
        style={[
          styles.successIconCircle,
          { backgroundColor: tintFromPrimary(tokens, 0.15) },
        ]}
      >
        <Check size={24} color={tokens.primary} strokeWidth={1.8} />
      </View>
      <Text style={[styles.successTitle, { color: tokens.fg1 }]}>
        {t('profile.support.success')}
      </Text>
      <Text style={[styles.successHint, { color: tokens.fg2 }]}>
        {t('profile.support.successHint')}
      </Text>
    </View>
  )
}

interface SupportFormProps {
  tokens: Tokens
  isOnline: boolean
  sending: boolean
  name: string
  email: string
  subject: string
  message: string
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
  subjectFocusRequest: number
  messageFocusRequest: number
  onChangeName: (value: string) => void
  onChangeEmail: (value: string) => void
  onChangeSubject: (value: string) => void
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
  subjectFocusRequest,
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
      {!isOnline ? (
        <ErrorState message={t('offline.description')} />
      ) : null}
      <Text style={[styles.formDescription, { color: tokens.fg2 }]}>
        {t('profile.support.description')}
      </Text>
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
      <Input
        label={t('profile.support.subject')}
        value={subject}
        onChange={onChangeSubject}
        placeholder={t('profile.support.subjectPlaceholder')}
        disabled={sending}
        error={subjectError ?? undefined}
        maxLength={SUPPORT_API_SUBJECT_MAX_LENGTH}
        focusRequest={subjectFocusRequest}
        onBlur={onSubjectBlur}
      />
      <Input
        label={t('profile.support.message')}
        value={message}
        onChange={onChangeMessage}
        placeholder={t('profile.support.messagePlaceholder')}
        disabled={sending}
        error={messageError ?? undefined}
        maxLength={SUPPORT_API_MESSAGE_MAX_LENGTH}
        multiline
        rows={6}
        focusRequest={messageFocusRequest}
        onBlur={onMessageBlur}
      />
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[styles.formErrorText, { color: tokens.statusBadText }]}
        >
          {error}
        </Text>
      ) : null}
      {disabledReason ? (
        <Text style={[styles.formDescription, { color: tokens.fg2 }]}>
          {disabledReason}
        </Text>
      ) : null}
      <View>
        <PillButton
          onClick={onSend}
          disabled={!canSend}
          loading={sending}
          hint={disabledReason ?? undefined}
        >
          {t('profile.support.send')}
        </PillButton>
      </View>
    </View>
  )
}

export default function SupportScreen() {
  const goBackOrFallback = useGoBackOrFallback()
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const { isOnline } = useOffline()
  const { profile } = useProfile()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const draftRef = useRef({ subject: '', message: '' })
  const draftChangedRef = useRef(false)
  const [subject, setSubject] = useState('')
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
  const [subjectFocusRequest, setSubjectFocusRequest] = useState(0)
  const [messageFocusRequest, setMessageFocusRequest] = useState(0)
  const resolvedEmail = profile?.email || email
  const displayedName = name || profile?.name || ''
  const displayedNameError = displayedName.trim() ? null : nameError
  const displayedEmailError = resolvedEmail.trim() && isValidEmail(resolvedEmail)
    ? null
    : emailError
  const isIncomplete = !subject || !message.length
  const incompleteReason = !isOnline || sending || !isIncomplete
    ? null
    : !subject && !message.length
      ? t('profile.support.sendIncomplete')
      : !subject
        ? t('profile.support.sendNeedsSubject')
        : t('profile.support.sendNeedsMessage')

  useEffect(() => {
    let isMounted = true
    void AsyncStorage.getItem(SUPPORT_DRAFT_STORAGE_KEY)
      .then((storedDraft) => {
        if (!isMounted || !storedDraft || draftChangedRef.current) return
        try {
          const draft = JSON.parse(storedDraft) as Record<string, unknown>
          const restoredDraft = {
            subject: typeof draft.subject === 'string' ? draft.subject : '',
            message: typeof draft.message === 'string' ? draft.message : '',
          }
          draftRef.current = restoredDraft
          setSubject(restoredDraft.subject)
          setMessage(restoredDraft.message)
        } catch {
          void AsyncStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
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
    void AsyncStorage.setItem(
      SUPPORT_DRAFT_STORAGE_KEY,
      JSON.stringify(draftRef.current),
    )
  }, [])

  const validateFields = useCallback(() => {
    const effectiveName = name.trim() || profile?.name || ''
    const effectiveEmail = resolvedEmail.trim()
    const nextNameError = effectiveName ? null : t('profile.support.nameRequired')
    const nextEmailError = !effectiveEmail
      ? t('profile.support.emailRequired')
      : isValidEmail(effectiveEmail) ? null : t('profile.support.emailInvalid')
    const nextSubjectError = subject.trim() ? null : t('profile.support.subjectRequired')
    const nextMessageError = message.trim() ? null : t('profile.support.messageRequired')
    setNameError(nextNameError)
    setEmailError(nextEmailError)
    setSubjectError(nextSubjectError)
    setMessageError(nextMessageError)
    if (nextNameError) setNameFocusRequest((request) => request + 1)
    else if (nextEmailError) setEmailFocusRequest((request) => request + 1)
    else if (nextSubjectError) setSubjectFocusRequest((request) => request + 1)
    else if (nextMessageError) setMessageFocusRequest((request) => request + 1)
    return !nextNameError && !nextEmailError && !nextSubjectError && !nextMessageError
  }, [message, name, profile, resolvedEmail, subject, t])

  const handleSend = useCallback(async () => {
    if (!isOnline) {
      setError(t('offline.title'))
      return
    }
    if (!validateFields()) return

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
            subject,
            message,
          }),
        ),
      })
      setSuccess(true)
      draftRef.current = { subject: '', message: '' }
      setSubject('')
      setMessage('')
      void AsyncStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
    } catch (err: unknown) {
      setError(getFriendlyErrorMessage(err, t, 'auth.genericError', 'generic'))
    } finally {
      setSending(false)
    }
  }, [isOnline, message, name, profile, resolvedEmail, subject, t, validateFields])

  const canSend = isOnline && !sending && !isIncomplete

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
        <Text accessibilityLiveRegion="polite" style={styles.screenReaderOnly}>
          {success ? t('profile.support.success') : ''}
        </Text>
        {success ? (
          <SupportSuccessState tokens={tokens} />
        ) : (
          <SupportForm
            tokens={tokens}
            isOnline={isOnline}
            sending={sending}
            name={displayedName}
            email={resolvedEmail}
            subject={subject}
            message={message}
            error={error}
            nameError={displayedNameError}
            emailError={displayedEmailError}
            subjectError={subjectError}
            messageError={messageError}
            canSend={canSend}
            disabledReason={incompleteReason}
            emailDisabled={Boolean(profile?.email)}
            nameFocusRequest={nameFocusRequest}
            emailFocusRequest={emailFocusRequest}
            subjectFocusRequest={subjectFocusRequest}
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
              if (!subject.trim()) setSubjectError(t('profile.support.subjectRequired'))
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
  formErrorText: {
    fontFamily: 'Geist_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
  screenReaderOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  successBlock: {
    paddingHorizontal: 24,
    paddingVertical: 48,
    alignItems: 'center',
    gap: 16,
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontFamily: 'Geist_500Medium',
    fontSize: 22,
    letterSpacing: -0.22,
    textAlign: 'center',
  },
  successHint: {
    fontFamily: 'Geist_400Regular',
    fontSize: 15,
    lineHeight: 22.5,
    textAlign: 'center',
    maxWidth: 320,
  },
})
