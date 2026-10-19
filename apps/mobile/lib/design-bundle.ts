import * as SecureStore from 'expo-secure-store'
import * as Updates from 'expo-updates'
import { claimDesignBundleLaunch } from '../modules/orbit-design-bundle'
import { captureError } from './sentry'
import { BUNDLE_DESIGN } from './design-bundle-identity'

export type AppDesign = 'legacy' | 'redesign'

let choiceWriteTail = Promise.resolve()

function accountDesignKey(accountId: string): string {
  const encoded = Array.from(accountId, character => character.codePointAt(0)!.toString(16).padStart(6, '0')).join('')
  return `design_bundle_${encoded}`
}

export function rememberAccountDesign(accountId: string, redesign: boolean): Promise<void> {
  const write = choiceWriteTail.then(() =>
    SecureStore.setItemAsync(accountDesignKey(accountId), redesign ? 'redesign' : 'legacy'),
  )
  choiceWriteTail = write.catch(captureError)
  return write
}

export async function launchAccountDesign(accountId: string | null): Promise<boolean> {
  try {
    if (!Updates.isEnabled || !claimDesignBundleLaunch()) return false
    await choiceWriteTail
    const selected = accountId ? await SecureStore.getItemAsync(accountDesignKey(accountId)) : null
    const desired: AppDesign = selected === 'redesign' ? 'redesign' : 'legacy'
    if (BUNDLE_DESIGN === desired) return false

    Updates.setUpdateRequestHeadersOverride({
      'expo-channel-name': desired,
      'orbit-design-launch': 'selected',
    })
    const result = await Updates.fetchUpdateAsync()
    if (result.isNew || result.isRollBackToEmbedded) {
      await Updates.reloadAsync()
      return true
    }
  } catch (error) {
    captureError(error)
  }
  return false
}
