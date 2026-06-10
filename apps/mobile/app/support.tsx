import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Check } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { isValidEmail } from '@orbit/shared/utils/email'
import { buildSupportRequestBody, getErrorMessage } from '@orbit/shared/utils'
import { createTokensV2 } from '@/lib/theme'
import { useProfile } from '@/hooks/use-profile'
import { apiClient } from '@/lib/api-client'
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { useAppTheme } from '@/lib/use-app-theme'
import { useOffline } from '@/hooks/use-offline'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { AppBar } from '@/components/ui/app-bar'

type Tokens = ReturnType<typeof createTokensV2>

const SUPPORT_DRAFT_STORAGE_KEY = 'orbit-support-draft'

interface UnderlinedInputProps {
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

function UnderlinedInput({
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
}: Readonly<UnderlinedInputProps>) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: tokens.fg3 }]}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.fg4}
        multiline={multiline}
        numberOfLines={multiline ? 6 : 1}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        textAlignVertical={multiline ? 'top' : 'auto'}
        style={[
          mono ? styles.inputMono : styles.input,
          {
            color: tokens.fg1,
            borderBottomColor: error ? tokens.statusBad : tokens.hairlineStrong,
            minHeight: multiline ? 110 : 36,
          },
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
      setError(t('calendarSync.notConnected'))
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
            <Check size={28} color={tokens.primary} strokeWidth={1.7} />
            <Text style={[styles.successTitle, { color: tokens.fg1 }]}>
              {t('profile.support.success')}
            </Text>
            <Text style={[styles.successHint, { color: tokens.fg3 }]}>
              {t('profile.support.successHint')}
            </Text>
          </View>
        ) : (
          <View style={styles.formBlock}>
            {!isOnline ? (
              <OfflineUnavailableState
                title={t('calendarSync.notConnected')}
                description={`${t('profile.support.send')} / ${t('profile.support.description')}`}
                compact
              />
            ) : null}
            <View style={styles.rowPair}>
              <View style={styles.halfField}>
                <UnderlinedInput
                  label={t('profile.support.name')}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('profile.support.namePlaceholder')}
                  error={nameError}
                  tokens={tokens}
                />
              </View>
              <View style={styles.halfField}>
                <UnderlinedInput
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
            <UnderlinedInput
              label={t('profile.support.subject')}
              value={subject}
              onChangeText={setSubject}
              placeholder={t('profile.support.subjectPlaceholder')}
              tokens={tokens}
            />
            <UnderlinedInput
              label={t('profile.support.message')}
              value={message}
              onChangeText={setMessage}
              placeholder={t('profile.support.messagePlaceholder')}
              multiline
              tokens={tokens}
            />
            {error ? (
              <Text style={[styles.fieldErrorText, { color: tokens.statusOverdue }]}>
                {error}
              </Text>
            ) : null}
            <View style={styles.actionPad}>
              <Pressable
                onPress={() => {
                  void handleSend()
                }}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityLabel={t('profile.support.send')}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor: pressed
                      ? tokens.primaryPressed
                      : tokens.primary,
                  },
                  !canSend && { opacity: 0.5 },
                ]}
              >
                <Text
                  style={[styles.primaryBtnText, { color: tokens.fgOnPrimary }]}
                >
                  {t('profile.support.send')}
                </Text>
              </Pressable>
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
    gap: 14,
  },
  rowPair: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: { flex: 1 },
  fieldWrap: {
    gap: 4,
  },
  fieldLabel: {
    fontFamily: 'Roboto_500Medium',
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  input: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    paddingVertical: 6,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inputMono: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 14,
    paddingVertical: 6,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    fontVariant: ['tabular-nums'],
  },
  errorText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 2,
  },
  fieldErrorText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    fontStyle: 'italic',
  },
  actionPad: {
    paddingTop: 8,
  },
  primaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 14,
    },
  successBlock: {
    paddingHorizontal: 24,
    paddingVertical: 48,
    alignItems: 'center',
    gap: 14,
  },
  successTitle: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 17,
    letterSpacing: -0.17,
  },
  successHint: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
  },
})
