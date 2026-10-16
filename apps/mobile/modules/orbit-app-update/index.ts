import { requireNativeModule } from 'expo'

export function isAndroidUpdateDownloaded(): Promise<boolean> {
  return requireNativeModule<{
    isUpdateDownloaded: () => Promise<boolean>
  }>('OrbitAppUpdate').isUpdateDownloaded()
}
