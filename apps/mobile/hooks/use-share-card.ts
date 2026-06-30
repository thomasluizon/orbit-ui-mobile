import { useRef, useState } from 'react'
import type { View } from 'react-native'
import { captureRef } from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import { ACHIEVEMENT_EVENT_KEYS } from '@orbit/shared/types/gamification'
import { useReportEvent } from '@/hooks/use-gamification'

/** Captures a ShareCard View to a temp PNG and opens the native share sheet via expo-sharing. */
export function useShareCard() {
  const shareRef = useRef<View>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [hasError, setHasError] = useState(false)
  const { mutate: reportEvent } = useReportEvent()

  async function share(dialogTitle: string) {
    if (isSharing) {
      return
    }
    setIsSharing(true)
    setHasError(false)
    try {
      const available = await Sharing.isAvailableAsync()
      if (!available) {
        setHasError(true)
        return
      }
      const uri = await captureRef(shareRef, { format: 'png', quality: 1, result: 'tmpfile' })
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle,
        UTI: 'public.png',
      })
      reportEvent(ACHIEVEMENT_EVENT_KEYS.cardShared)
    } catch {
      setHasError(true)
    } finally {
      setIsSharing(false)
    }
  }

  return { shareRef, isSharing, hasError, share }
}
