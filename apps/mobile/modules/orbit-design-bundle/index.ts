import { requireNativeModule } from 'expo'

export function claimDesignBundleLaunch(): boolean {
  return requireNativeModule<{ claimLaunch: () => boolean }>('OrbitDesignBundle').claimLaunch()
}
