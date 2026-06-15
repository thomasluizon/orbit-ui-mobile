import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio'
import { API } from '@orbit/shared/api'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'
export { CHAT_VISUALIZER_BAR_OFFSETS as VISUALIZER_BAR_OFFSETS } from '@orbit/shared/chat'

interface RecordingUpload {
  uri: string
  name: string
  type: string
}

declare global {
  interface FormData {
    append(name: string, value: RecordingUpload): void
  }
}

interface TranscriptionResponse {
  text: string
}

/**
 * Records microphone audio with `expo-audio` and uploads it to the server
 * transcription endpoint, returning the recognized text. Mirrors the web
 * `useSpeechToText` return shape; the backend auto-detects language, so there is
 * no language selector.
 */
export function useSpeechToText() {
  const { t } = useTranslation()
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)

  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isSupported] = useState(true)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startTimer = useCallback(() => {
    clearTimer()
    setRecordingDuration(0)
    timerRef.current = setInterval(() => {
      setRecordingDuration((current) => current + 1)
    }, 1000)
  }, [clearTimer])

  const transcribe = useCallback(
    async (uri: string) => {
      setIsTranscribing(true)
      try {
        const formData = new FormData()
        formData.append('audio', { uri, name: 'recording.m4a', type: 'audio/m4a' })
        const { text } = await apiClient<TranscriptionResponse>(API.chat.transcribe, {
          method: 'POST',
          body: formData,
        })
        const trimmed = text.trim()
        if (trimmed) {
          setTranscript(trimmed)
        } else {
          setError(t('speech.noSpeech'))
        }
      } catch (err: unknown) {
        setError(getFriendlyErrorMessage(err, t, 'errors.api.transcriptionFailed', 'generic'))
      } finally {
        setIsTranscribing(false)
      }
    },
    [t],
  )

  const startRecording = useCallback(async () => {
    if (isRecording) return

    setError(null)
    setTranscript('')
    setRecordingDuration(0)

    const permission = await AudioModule.requestRecordingPermissionsAsync()
    if (!permission.granted) {
      setError(t('speech.micDenied'))
      return
    }

    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      await audioRecorder.prepareToRecordAsync()
      audioRecorder.record()
      setIsRecording(true)
      startTimer()
    } catch {
      setError(t('speech.failedToStart'))
      setIsRecording(false)
      clearTimer()
    }
  }, [audioRecorder, clearTimer, isRecording, startTimer, t])

  const stopRecording = useCallback(async () => {
    if (!isRecording) return

    setIsRecording(false)
    clearTimer()
    await audioRecorder.stop()
    const uri = audioRecorder.uri
    if (uri) void transcribe(uri)
  }, [audioRecorder, clearTimer, isRecording, transcribe])

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      void stopRecording()
    } else {
      void startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  useEffect(() => {
    return () => {
      clearTimer()
    }
  }, [clearTimer])

  return {
    isRecording,
    isTranscribing,
    isSupported,
    transcript,
    error,
    startRecording,
    stopRecording,
    toggleRecording,
    recordingDuration,
  }
}
