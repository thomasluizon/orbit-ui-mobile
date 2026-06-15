import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AudioStudioModule,
  useAudioRecorder,
  type AudioAnalysis,
} from '@siteed/audio-studio'
import { API } from '@orbit/shared/api'
import {
  VOICE_LEVEL_POLL_MS,
  VOICE_MOBILE_SPEECH_RMS_THRESHOLD,
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

interface MicPermission {
  granted: boolean
}

const audioStudio = AudioStudioModule as {
  requestPermissionsAsync: () => Promise<MicPermission>
}

const ALLOWED_AUDIO_EXTENSIONS = ['wav', 'webm', 'm4a', 'mp4', 'mp3', 'ogg', 'oga', 'flac']

function buildRecordingUpload(uri: string): RecordingUpload {
  const path = uri.split('?')[0] ?? uri
  const candidate = path.includes('.') ? path.split('.').pop()?.toLowerCase() : undefined
  const extension = candidate && ALLOWED_AUDIO_EXTENSIONS.includes(candidate) ? candidate : 'wav'
  const type = extension === 'm4a' || extension === 'mp4' ? 'audio/mp4' : `audio/${extension}`
  return { uri, name: `recording.${extension}`, type }
}

/**
 * Records microphone audio with `@siteed/audio-studio` and uploads it to the
 * server transcription endpoint, returning the recognized text. Mirrors the web
 * `useSpeechToText` return shape and its silence auto-stop: the recorder's
 * real-time `onAudioAnalysis` RMS is watched, and once speech is heard a
 * sustained drop below the threshold for VOICE_SILENCE_TIMEOUT_MS stops the
 * recording. If real-time analysis never fires, recording still works with the
 * manual stop button. The backend auto-detects language, so there is no selector.
 */
export function useSpeechToText() {
  const { t } = useTranslation()
  const { startRecording: startNativeRecording, stopRecording: stopNativeRecording } =
    useAudioRecorder()

  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isSupported] = useState(true)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isRecordingRef = useRef(false)
  const speechDetectedRef = useRef(false)
  const silentElapsedRef = useRef(0)
  const stopRecordingRef = useRef<() => Promise<void>>(async () => {})

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
        formData.append('audio', buildRecordingUpload(uri))
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
    speechDetectedRef.current = false
    silentElapsedRef.current = 0

    try {
      const recording = await stopNativeRecording()
      if (recording.fileUri) void transcribe(recording.fileUri)
    } catch {
      setError(t('speech.failedToStart'))
    }
  }, [clearTimer, stopNativeRecording, t, transcribe])

  useEffect(() => {
    stopRecordingRef.current = stopRecording
  }, [stopRecording])

  const handleAnalysis = useCallback(async (event: AudioAnalysis) => {
    const latest = event.dataPoints[event.dataPoints.length - 1]
    if (!latest) return

    if (latest.rms > VOICE_MOBILE_SPEECH_RMS_THRESHOLD) {
      speechDetectedRef.current = true
      silentElapsedRef.current = 0
    } else if (speechDetectedRef.current) {
      silentElapsedRef.current += VOICE_LEVEL_POLL_MS
      if (silentElapsedRef.current >= VOICE_SILENCE_TIMEOUT_MS) {
        await stopRecordingRef.current()
      }
    }
  }, [])

  const startRecording = useCallback(async () => {
    if (isRecordingRef.current) return

    setError(null)
    setTranscript('')
    setRecordingDuration(0)
    speechDetectedRef.current = false
    silentElapsedRef.current = 0

    const permission = await audioStudio.requestPermissionsAsync()
    if (!permission.granted) {
      setError(t('speech.micDenied'))
      return
    }

    try {
      await startNativeRecording({
        sampleRate: 16000,
        channels: 1,
        encoding: 'pcm_16bit',
        enableProcessing: true,
        intervalAnalysis: VOICE_LEVEL_POLL_MS,
        keepFullAnalysis: false,
        features: { rms: true },
        output: { primary: { enabled: true } },
        onAudioAnalysis: handleAnalysis,
      })
      isRecordingRef.current = true
      setIsRecording(true)
      startTimer()
    } catch {
      setError(t('speech.failedToStart'))
      isRecordingRef.current = false
      setIsRecording(false)
      clearTimer()
    }
  }, [clearTimer, handleAnalysis, startNativeRecording, startTimer, t])

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
      if (isRecordingRef.current) void stopNativeRecording().catch(() => {})
    }
  }, [clearTimer, stopNativeRecording])

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
