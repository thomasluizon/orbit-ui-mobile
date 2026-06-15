import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio'
import { API } from '@orbit/shared/api'
import {
  VOICE_LEVEL_POLL_MS,
  VOICE_MOBILE_SPEECH_DB_THRESHOLD,
  VOICE_SILENCE_TIMEOUT_MS,
} from '@orbit/shared/chat'
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
 * no language selector. Recording auto-stops after a short silence once speech
 * has been detected.
 */
export function useSpeechToText() {
  const { t } = useTranslation()
  const audioRecorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  })

  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isSupported] = useState(true)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const silenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isRecordingRef = useRef(false)

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

  const stopSilenceMonitor = useCallback(() => {
    if (silenceIntervalRef.current) {
      clearInterval(silenceIntervalRef.current)
      silenceIntervalRef.current = null
    }
  }, [])

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

  const stopRecording = useCallback(async () => {
    if (!isRecordingRef.current) return

    isRecordingRef.current = false
    setIsRecording(false)
    clearTimer()
    stopSilenceMonitor()
    await audioRecorder.stop()
    const uri = audioRecorder.uri
    if (uri) void transcribe(uri)
  }, [audioRecorder, clearTimer, stopSilenceMonitor, transcribe])

  const startSilenceMonitor = useCallback(() => {
    stopSilenceMonitor()
    let speechDetected = false
    let silentElapsed = 0

    silenceIntervalRef.current = setInterval(() => {
      const metering = audioRecorder.getStatus().metering
      if (metering === undefined) return

      if (metering > VOICE_MOBILE_SPEECH_DB_THRESHOLD) {
        speechDetected = true
        silentElapsed = 0
      } else if (speechDetected) {
        silentElapsed += VOICE_LEVEL_POLL_MS
        if (silentElapsed >= VOICE_SILENCE_TIMEOUT_MS) {
          void stopRecording()
        }
      }
    }, VOICE_LEVEL_POLL_MS)
  }, [audioRecorder, stopRecording, stopSilenceMonitor])

  const startRecording = useCallback(async () => {
    if (isRecordingRef.current) return

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
      isRecordingRef.current = true
      setIsRecording(true)
      startTimer()
      startSilenceMonitor()
    } catch {
      isRecordingRef.current = false
      setError(t('speech.failedToStart'))
      setIsRecording(false)
      clearTimer()
      stopSilenceMonitor()
    }
  }, [audioRecorder, clearTimer, startSilenceMonitor, startTimer, stopSilenceMonitor, t])

  const toggleRecording = useCallback(() => {
    if (isRecordingRef.current) {
      void stopRecording()
    } else {
      void startRecording()
    }
  }, [startRecording, stopRecording])

  useEffect(() => {
    return () => {
      clearTimer()
      stopSilenceMonitor()
    }
  }, [clearTimer, stopSilenceMonitor])

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
