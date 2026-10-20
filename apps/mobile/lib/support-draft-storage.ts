import AsyncStorage from '@react-native-async-storage/async-storage'
import { captureError } from '@/lib/sentry'

export const SUPPORT_DRAFT_STORAGE_KEY = 'orbit-support-draft'

/**
 * The one owner of the stored support draft. The key carries no account, and AsyncStorage
 * keeps it through a sign out and an app restart, so the person who signs in next would read
 * the previous person's subject and message straight back into the form.
 */
export async function readStoredSupportDraft(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SUPPORT_DRAFT_STORAGE_KEY)
  } catch (error) {
    captureError(error)
    return null
  }
}

/** Stores the serialized support draft, and reports a write the device refuses. */
export async function writeStoredSupportDraft(draft: string): Promise<void> {
  try {
    await AsyncStorage.setItem(SUPPORT_DRAFT_STORAGE_KEY, draft)
  } catch (error) {
    captureError(error)
  }
}

/** Removes the stored support draft so the next account cannot read it back. */
export async function forgetStoredSupportDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
  } catch (error) {
    captureError(error)
  }
}
