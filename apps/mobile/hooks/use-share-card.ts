import { useRef, useState } from 'react'
import type { View } from 'react-native'
import Share from 'react-native-share'
import { captureRef } from 'react-native-view-shot'
import { Directory, File } from 'expo-file-system'
import { ACHIEVEMENT_EVENT_KEYS } from '@orbit/shared/types/gamification'
import { SHARE_CARD_FILE_NAME } from '@orbit/shared/utils'
import { useReportEvent } from '@/hooks/use-gamification'

const PICKER_CANCELLED_CODE = 'ERR_PICKER_CANCELLED'

interface ShareCardPayload {
  shareTitle: string
  shareText: string
  url: string
}

function isPickerCancellation(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === PICKER_CANCELLED_CODE
}

function getDownloadDestination(directory: Directory) {
  const existingFile = directory.list().find(
    (entry) => entry instanceof File && entry.name === SHARE_CARD_FILE_NAME,
  )
  return existingFile ?? directory.createFile(SHARE_CARD_FILE_NAME, 'image/png')
}

/** Captures a ShareCard View to a temp PNG and opens the native share sheet. */
export function useShareCard() {
  const shareRef = useRef<View>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [hasError, setHasError] = useState(false)
  const canShareFiles = typeof Share.open === 'function'
  const { mutate: reportEvent } = useReportEvent()

  function captureCard() {
    return captureRef(shareRef, { format: 'png', quality: 1, result: 'tmpfile' })
  }

  async function share(payload: ShareCardPayload) {
    if (isSharing) {
      return
    }
    setIsSharing(true)
    setHasError(false)
    try {
      const uri = await captureCard()
      await Share.open({
        title: payload.shareTitle,
        message: `${payload.shareText} ${payload.url}`,
        url: uri,
        type: 'image/png',
        failOnCancel: false,
      })
      reportEvent(ACHIEVEMENT_EVENT_KEYS.cardShared)
    } catch {
      setHasError(true)
    } finally {
      setIsSharing(false)
    }
  }

  async function download() {
    if (isSharing) {
      return
    }
    setIsSharing(true)
    setHasError(false)
    try {
      const uri = await captureCard()
      let directory: Directory
      try {
        directory = await Directory.pickDirectoryAsync()
      } catch (error) {
        if (isPickerCancellation(error)) return
        throw error
      }
      const source = new File(uri)
      const destination = getDownloadDestination(directory)
      await source.copy(destination, { overwrite: true })
      reportEvent(ACHIEVEMENT_EVENT_KEYS.cardShared)
    } catch {
      setHasError(true)
    } finally {
      setIsSharing(false)
    }
  }

  return { shareRef, isSharing, hasError, canShareFiles, share, download }
}
