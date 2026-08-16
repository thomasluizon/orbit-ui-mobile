import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Check } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { buildSupportRequestBody, getFriendlyErrorMessage } from '@orbit/shared/utils'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useProfile } from '@/hooks/use-profile'
import { apiClient } from '@/lib/api-client'
import { AppTextInput } from '@/components/ui/app-text-input'
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { PillButton } from '@/components/ui/pill-button'
import { useAppTheme } from '@/lib/use-app-theme'
import { useOffline } from '@/hooks/use-offline'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { AppBar } from '@/components/ui/app-bar'

type Tokens = ReturnType<typeof createTokensV2>

const SUPPORT_DRAFT_STORAGE_KEY = 'orbit-support-draft'

interface SupportFieldProps {
  label: string
  value: string
  onChangeText: (v: string) => void
  placeholder: string
  multiline?: boolean
  tokens: Tokens
}

function SupportField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  tokens,
}: Readonly<SupportFieldProps>) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: tokens.fg2 }]}>
        {label}
      </Text>
      <AppTextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multiline={multiline}
        numberOfLines={multiline ? 6 : 1}
        textAlignVertical={multiline ? 'top' : 'auto'}
        accessibilityLabel={label}
        style={multiline ? styles.inputMultiline : null}
      />
    </View>
  )
}

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
        <Check size={34} color={tokens.primarySoft} strokeWidth={1.8} />
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
  subject: string
  message: string
  error: string | null
  canSend: boolean
  onChangeSubject: (value: string) => void
  onChangeMessage: (value: string) => void
  onSend: () => void
}

function SupportForm({
  tokens,
  isOnline,
  sending,
  subject,
  message,
  error,
  canSend,
  onChangeSubject,
  onChangeMessage,
  onSend,
}: Readonly<SupportFormProps>) {
  const { t } = useTranslation()
  return (
    <Animated.View
      style={styles.formBlock}
      entering={FadeInDown.duration(280).reduceMotion(ReduceMotion.System)}
    >
      {!isOnline ? (
        <OfflineUnavailableState
          title={t('offline.title')}
          description={t('offline.description')}
          compact
        />
      ) : null}
      <Text style={[styles.formDescription, { color: tokens.fg3 }]}>
        {t('profile.support.description')}
      </Text>
      <SupportField
        label={t('profile.support.subject')}
        value={subject}
        onChangeText={onChangeSubject}
        placeholder={t('profile.support.subjectPlaceholder')}
        tokens={tokens}
      />
      <SupportField
        label={t('profile.support.message')}
        value={message}
        onChangeText={onChangeMessage}
        placeholder={t('profile.support.messagePlaceholder')}
        multiline
        tokens={tokens}
      />
      {error ? (
        <Text style={[styles.formErrorText, { color: tokens.statusBadText }]}>
          {error}
        </Text>
      ) : null}
      <View style={styles.actionPad}>
        <PillButton
          onPress={onSend}
          disabled={!canSend}
          busy={sending}
          // eslint-disable-next-line local/no-fullbleed-button -- support form submit (allowlist: form submit)
          fullWidth
          accessibilityLabel={t('profile.support.send')}
        >
          {t('profile.support.send')}
        </PillButton>
      </View>
    </Animated.View>
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
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    void AsyncStorage.getItem(SUPPORT_DRAFT_STORAGE_KEY)
      .then((storedDraft) => {
        if (!isMounted || !storedDraft) return
        try {
          const draft = JSON.parse(storedDraft) as Partial<
            Record<'subject' | 'message', string>
          >
          setSubject(draft.subject ?? '')
          setMessage(draft.message ?? '')
        } catch {
          void AsyncStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
        }
      })
      .catch(() => {})
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const draft = { subject, message }
    const hasDraft = Object.values(draft).some(
      (value) => value.trim().length > 0,
    )

    if (!hasDraft) {
      void AsyncStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
      return
    }
    void AsyncStorage.setItem(SUPPORT_DRAFT_STORAGE_KEY, JSON.stringify(draft))
  }, [message, subject])

  const handleSend = useCallback(async () => {
    if (!isOnline) {
      setError(t('offline.title'))
      return
    }
    if (!subject.trim() || !message.trim()) return

    setSending(true)
    setError(null)
    setSuccess(false)

    try {
      await apiClient(API.support.send, {
        method: 'POST',
        body: JSON.stringify(
          buildSupportRequestBody(profile, {
            name: '',
            email: '',
            subject,
            message,
          }),
        ),
      })
      setSuccess(true)
      setSubject('')
      setMessage('')
      void AsyncStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
    } catch (err: unknown) {
      setError(getFriendlyErrorMessage(err, t, 'auth.genericError', 'generic'))
    } finally {
      setSending(false)
    }
  }, [isOnline, message, profile, subject, t])

  const canSend =
    subject.trim().length > 0 && message.trim().length > 0 && isOnline && !sending

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: tokens.bg }]}
      edges={['top']}
    >
      <AppBar
        back
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
          <SupportSuccessState tokens={tokens} />
        ) : (
          <SupportForm
            tokens={tokens}
            isOnline={isOnline}
            sending={sending}
            subject={subject}
            message={message}
            error={error}
            canSend={canSend}
            onChangeSubject={setSubject}
            onChangeMessage={setMessage}
            onSend={() => {
              void handleSend()
            }}
          />
        )}
        <View style={{ height: 24 }} />
      </KeyboardAwareScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  formBlock: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 16,
  },
  fieldWrap: {
    gap: 8,
  },
  fieldLabel: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
  },
  formDescription: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  inputMultiline: {
    minHeight: 132,
  },
  formErrorText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
  actionPad: {
    paddingTop: 8,
  },
  successBlock: {
    paddingHorizontal: 24,
    paddingVertical: 48,
    alignItems: 'center',
    gap: 14,
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 22,
    letterSpacing: -0.22,
    textAlign: 'center',
  },
  successHint: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 15,
    lineHeight: 22.5,
    textAlign: 'center',
    maxWidth: 320,
  },
})
