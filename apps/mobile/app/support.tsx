import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  StyleSheet,
  Text,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Check } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { isValidEmail } from '@orbit/shared/utils/email'
import { buildSupportRequestBody, getErrorMessage } from '@orbit/shared/utils'
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
  keyboardType?: 'default' | 'email-address'
  autoCapitalize?: 'none' | 'sentences'
  mono?: boolean
  error?: string | null
  tokens: Tokens
}

function SupportField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  mono = false,
  error,
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
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        textAlignVertical={multiline ? 'top' : 'auto'}
        accessibilityLabel={label}
        style={[
          mono ? styles.inputMono : null,
          multiline ? styles.inputMultiline : null,
          error ? { borderColor: tokens.statusBad } : null,
        ]}
      />
      {error ? (
        <Text style={[styles.errorText, { color: tokens.statusBad }]}>
          {error}
        </Text>
      ) : null}
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
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    void AsyncStorage.getItem(SUPPORT_DRAFT_STORAGE_KEY)
      .then((storedDraft) => {
        if (!isMounted || !storedDraft) return
        try {
          const draft = JSON.parse(storedDraft) as Partial<
            Record<'name' | 'email' | 'subject' | 'message', string>
          >
          setName(draft.name ?? '')
          setEmail(draft.email ?? '')
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
    if (profile) {

      setName((current) => current || profile.name || '')
      setEmail((current) => current || profile.email || '')
    }
  }, [profile])

  useEffect(() => {
    const draft = { name, email, subject, message }
    const hasDraft = Object.values(draft).some(
      (value) => value.trim().length > 0,
    )

    if (!hasDraft) {
      void AsyncStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
      return
    }
    void AsyncStorage.setItem(SUPPORT_DRAFT_STORAGE_KEY, JSON.stringify(draft))
  }, [email, message, name, subject])

  const validateForm = useCallback((): boolean => {
    setNameError(null)
    setEmailError(null)
    let valid = true

    const effectiveName = name.trim() || profile?.name
    if (!effectiveName) {
      setNameError(t('profile.support.nameRequired'))
      valid = false
    }

    const effectiveEmail = email.trim() || profile?.email
    if (!effectiveEmail) {
      setEmailError(t('profile.support.emailRequired'))
      valid = false
    } else if (!isValidEmail(effectiveEmail)) {
      setEmailError(t('profile.support.emailInvalid'))
      valid = false
    }
    return valid
  }, [email, name, profile?.email, profile?.name, t])

  const handleSend = useCallback(async () => {
    if (!isOnline) {
      setError(t('offline.title'))
      return
    }
    if (!subject.trim() || !message.trim()) return
    if (!validateForm()) return

    setSending(true)
    setError(null)
    setSuccess(false)

    try {
      await apiClient(API.support.send, {
        method: 'POST',
        body: JSON.stringify(
          buildSupportRequestBody(profile, { name, email, subject, message }),
        ),
      })
      setSuccess(true)
      setSubject('')
      setMessage('')
      void AsyncStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('auth.genericError')))
    } finally {
      setSending(false)
    }
  }, [email, isOnline, message, name, profile, subject, t, validateForm])

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
        backLabel={t('common.goBack')}
      />
      <KeyboardAwareScrollView
        style={styles.container}
        containerStyle={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardVerticalOffset={12}
      >
        {success ? (
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
        ) : (
          <View style={styles.formBlock}>
            {!isOnline ? (
              <OfflineUnavailableState
                title={t('offline.title')}
                description={t('offline.description')}
                compact
              />
            ) : null}
            <View style={styles.rowPair}>
              <View style={styles.halfField}>
                <SupportField
                  label={t('profile.support.name')}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('profile.support.namePlaceholder')}
                  error={nameError}
                  tokens={tokens}
                />
              </View>
              <View style={styles.halfField}>
                <SupportField
                  label={t('profile.support.email')}
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t('profile.support.emailPlaceholder')}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  mono
                  error={emailError}
                  tokens={tokens}
                />
              </View>
            </View>
            <SupportField
              label={t('profile.support.subject')}
              value={subject}
              onChangeText={setSubject}
              placeholder={t('profile.support.subjectPlaceholder')}
              tokens={tokens}
            />
            <SupportField
              label={t('profile.support.message')}
              value={message}
              onChangeText={setMessage}
              placeholder={t('profile.support.messagePlaceholder')}
              multiline
              tokens={tokens}
            />
            {error ? (
              <Text style={[styles.formErrorText, { color: tokens.statusBad }]}>
                {error}
              </Text>
            ) : null}
            <View style={styles.actionPad}>
              <PillButton
                onPress={() => {
                  void handleSend()
                }}
                disabled={!canSend}
                fullWidth
                accessibilityLabel={t('profile.support.send')}
              >
                {t('profile.support.send')}
              </PillButton>
            </View>
          </View>
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
  rowPair: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: { flex: 1 },
  fieldWrap: {
    gap: 8,
  },
  fieldLabel: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
  },
  inputMono: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  inputMultiline: {
    minHeight: 132,
  },
  errorText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
    marginTop: -2,
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
