import { useState, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as WebBrowser from 'expo-web-browser'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient } from '@/lib/api-client'
import type { BackendLoginResponse } from '@orbit/shared/types/auth'

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://api.useorbit.org'

type LoginStep = 'email' | 'code'

export default function LoginScreen() {
  const insets = useSafeAreaInsets()
  const login = useAuthStore((s) => s.login)

  const [step, setStep] = useState<LoginStep>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSendCode = useCallback(async () => {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return

    setIsLoading(true)
    try {
      await apiClient('/api/auth/send-code', {
        method: 'POST',
        body: JSON.stringify({ email: trimmed, language: 'en' }),
      })
      setStep('code')
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to send code')
    } finally {
      setIsLoading(false)
    }
  }, [email])

  const handleVerifyCode = useCallback(async () => {
    const trimmed = code.trim()
    if (trimmed.length !== 6) return

    setIsLoading(true)
    try {
      const res = await apiClient<BackendLoginResponse>('/api/auth/verify-code', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: trimmed,
          language: 'en',
        }),
      })
      await login(res.token, res.refreshToken, {
        userId: res.userId,
        name: res.name,
        email: res.email,
      })
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Invalid code')
    } finally {
      setIsLoading(false)
    }
  }, [code, email, login])

  const handleGoogleAuth = useCallback(async () => {
    try {
      const redirectUri = `${API_BASE}/api/auth/google/mobile-callback`
      const result = await WebBrowser.openAuthSessionAsync(
        `${API_BASE}/api/auth/google?redirect_uri=${encodeURIComponent(redirectUri)}&platform=mobile`,
        redirectUri,
      )

      if (result.type === 'success' && result.url) {
        const url = new URL(result.url)
        const token = url.searchParams.get('token')
        const refreshToken = url.searchParams.get('refreshToken')
        const userId = url.searchParams.get('userId')
        const name = url.searchParams.get('name')
        const userEmail = url.searchParams.get('email')

        if (token && userId && name && userEmail) {
          await login(token, refreshToken, { userId, name, email: userEmail })
        }
      }
    } catch (err) {
      Alert.alert('Error', 'Google sign-in failed. Please try again.')
    }
  }, [login])

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <Text style={styles.logo}>Orbit</Text>
        <Text style={styles.subtitle}>Build better habits</Text>
      </View>

      <View style={styles.form}>
        {step === 'email' ? (
          <>
            <Text style={styles.label}>Email address</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor="#7a7490"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              editable={!isLoading}
            />
            <TouchableOpacity
              style={[styles.button, !email.trim() && styles.buttonDisabled]}
              onPress={handleSendCode}
              disabled={!email.trim() || isLoading}
              activeOpacity={0.7}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Continue</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.label}>Enter the 6-digit code</Text>
            <Text style={styles.helperText}>
              We sent a code to {email.trim().toLowerCase()}
            </Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="000000"
              placeholderTextColor="#7a7490"
              value={code}
              onChangeText={(text) => setCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              editable={!isLoading}
            />
            <TouchableOpacity
              style={[styles.button, code.trim().length !== 6 && styles.buttonDisabled]}
              onPress={handleVerifyCode}
              disabled={code.trim().length !== 6 || isLoading}
              activeOpacity={0.7}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Verify</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                setStep('email')
                setCode('')
              }}
            >
              <Text style={styles.backButtonText}>Use a different email</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={styles.googleButton}
          onPress={handleGoogleAuth}
          activeOpacity={0.7}
        >
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07060e',
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    fontSize: 40,
    fontWeight: '700',
    color: '#8b5cf6',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: '#9b95ad',
    marginTop: 8,
  },
  form: {
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f0eef6',
    marginBottom: 8,
  },
  helperText: {
    fontSize: 13,
    color: '#9b95ad',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#13111f',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#f0eef6',
    marginBottom: 16,
  },
  codeInput: {
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 8,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#8b5cf6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 8,
  },
  backButtonText: {
    color: '#8b5cf6',
    fontSize: 14,
    fontWeight: '500',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  dividerText: {
    color: '#7a7490',
    fontSize: 13,
    marginHorizontal: 16,
  },
  googleButton: {
    backgroundColor: '#13111f',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  googleButtonText: {
    color: '#f0eef6',
    fontSize: 16,
    fontWeight: '600',
  },
})
