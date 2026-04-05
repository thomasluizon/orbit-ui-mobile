import 'react-native-url-polyfill/auto'
import 'expo-sqlite/localStorage/install'

import { createClient } from '@supabase/supabase-js'

interface SupabaseStorageAdapter {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL
  ?? 'https://wdscxamegetmhqldqsdg.supabase.co'

const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? 'sb_publishable_CGlL4PSxvp2Ia0SCHcathQ_iAQnmXis'

const storage = (globalThis as typeof globalThis & { localStorage: SupabaseStorageAdapter }).localStorage

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
