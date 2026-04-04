import { useEffect } from 'react'
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuthStore } from '@/stores/auth-store'

/**
 * Handles the OAuth deep link callback.
 *
 * The deep link scheme is: orbit://auth-callback?token=...&refreshToken=...&userId=...&name=...&email=...
 *
 * This screen extracts the params, stores credentials via auth store,
 * and redirects to the main app.
 */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{
    token?: string
    refreshToken?: string
    userId?: string
    name?: string
    email?: string
    error?: string
  }>()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)

  useEffect(() => {
    async function handleCallback() {
      if (params.error) {
        // Redirect back to login with error context
        router.replace('/login')
        return
      }

      const { token, refreshToken, userId, name, email } = params

      if (token && userId && name && email) {
        try {
          await login(token, refreshToken ?? null, { userId, name, email })
          // Auth guard in root layout will handle redirect to (tabs)
        } catch {
          router.replace('/login')
        }
      } else {
        // Missing required params - go back to login
        router.replace('/login')
      }
    }

    handleCallback()
  }, [params, login, router])

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#8b5cf6" />
      <Text style={styles.text}>Signing in...</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07060e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#9b95ad',
    fontSize: 16,
    marginTop: 16,
  },
})
