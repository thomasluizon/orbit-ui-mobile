'use client'

import { fetchWithThrottle } from '@/lib/throttle-fetch'
import { useRef, useCallback, useEffect, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { API } from '@orbit/shared/api'
import {
  VOICE_LEVEL_POLL_MS,
  VOICE_SILENCE_TIMEOUT_MS,
  VOICE_WEB_SPEECH_RMS_THRESHOLD,
} from '@orbit/shared/chat'
import { ERROR_CODE_TO_KEY, getErrorSurface } from '@orbit/shared/utils'
import { useThrottleStore } from '@/stores/throttle-store'
import { useAccountScopedState, useResetOnAccountChange } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
export { CHAT_VISUALIZER_BAR_OFFSETS as VISUALIZER_BAR_OFFSETS } from '@orbit/shared/chat'

interface TranscriptionResponse {
  text?: string
  error?: string
  errorCode?: string
}

function subscribeToRecordingSupport(): () => void {
  return () => {}
}

function getRecordingSupportSnapshot(): boolean {
  return (
    'mediaDevices' in navigator &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  )
}

function getServerRecordingSupportSnapshot(): boolean {
  return false
}

export function useSpeechToText() {
  const t = useTranslations()

  const [isRecording, setIsRecording] = useAccountScopedState(false)
  const [isTranscribing, setIsTranscribing] = useAccountScopedState(false)
  const isSupported = useSyncExternalStore(
    subscribeToRecordingSupport,
    getRecordingSupportSnapshot,
    getServerRecordingSupportSnapshot,
  )
  const [transcript, setTranscript] = useAccountScopedState('')
  const [error, setError] = useAccountScopedState<string | null>(null)
  const [recordingDuration, setRecordingDuration] = useAccountScopedState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const silenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const stopSilenceMonitor = useCallback(() => {
    if (silenceIntervalRef.current) {
      clearInterval(silenceIntervalRef.current)
      silenceIntervalRef.current = null
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
  }, [])

  const transcribe = useCallback(
    async (blob: Blob, transcribingAccount: number) => {
      if (getAccountGeneration() !== transcribingAccount) return
      setIsTranscribing(true)
      try {
        const formData = new FormData()
        formData.append('audio', blob, 'recording.webm')
        const response = await fetchWithThrottle(API.chat.transcribe, { method: 'POST', body: formData })
        const data = (await response.json().catch(() => null)) as TranscriptionResponse | null
        const text = data?.text?.trim() ?? ''
        /**
         * The tab may hold another account by now, and these are the previous account's spoken
         * words. The composer appends a landed transcript to the draft it saves, so this one has
         * to go nowhere rather than become the next account's message.
         */
        if (getAccountGeneration() !== transcribingAccount) return
        if (!response.ok || !text) {
          const key =
            (data?.errorCode && ERROR_CODE_TO_KEY[data.errorCode]) ?? 'errors.api.transcriptionFailed'
          setError(t(key))
          return
        }
        setTranscript(text)
      } catch {
        if (getAccountGeneration() !== transcribingAccount) return
        setError(t('errors.api.transcriptionFailed'))
      } finally {
        if (getAccountGeneration() === transcribingAccount) setIsTranscribing(false)
      }
    },
    [setError, setIsTranscribing, setTranscript, t],
  )

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    clearTimer()
    stopSilenceMonitor()
    setIsRecording(false)
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    } else {
      stopStream()
    }
  }, [clearTimer, setIsRecording, stopSilenceMonitor, stopStream])

  const startSilenceMonitor = useCallback(
    (stream: MediaStream) => {
      try {
        const audioContext = new AudioContext()
        audioContextRef.current = audioContext
        const source = audioContext.createMediaStreamSource(stream)
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 2048
        source.connect(analyser)

        const samples = new Uint8Array(analyser.fftSize)
        let speechDetected = false
        let silentElapsed = 0

        silenceIntervalRef.current = setInterval(() => {
          analyser.getByteTimeDomainData(samples)
          let sumSquares = 0
          for (const sample of samples) {
            const deviation = (sample - 128) / 128
            sumSquares += deviation * deviation
          }
          const rms = Math.sqrt(sumSquares / samples.length)

          if (rms > VOICE_WEB_SPEECH_RMS_THRESHOLD) {
            speechDetected = true
            silentElapsed = 0
          } else if (speechDetected) {
            silentElapsed += VOICE_LEVEL_POLL_MS
            if (silentElapsed >= VOICE_SILENCE_TIMEOUT_MS) {
              stopRecording()
            }
          }
        }, VOICE_LEVEL_POLL_MS)
      } catch {
        stopSilenceMonitor()
      }
    },
    [stopRecording, stopSilenceMonitor],
  )

  const startRecording = useCallback(async () => {
    if (!isSupported || isRecording) return
    if ((getErrorSurface(useThrottleStore.getState().error).retryAt ?? 0) > Date.now()) return
    const recordingAccount = getAccountGeneration()
    setError(null)
    setTranscript('')
    setRecordingDuration(0)
    chunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (getAccountGeneration() !== recordingAccount) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (getAccountGeneration() !== recordingAccount) return
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        if (getAccountGeneration() !== recordingAccount) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        clearTimer()
        stopSilenceMonitor()
        stopStream()
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        chunksRef.current = []
        if (blob.size > 0) void transcribe(blob, recordingAccount)
      }

      recorder.start()
      setIsRecording(true)
      timerRef.current = setInterval(() => setRecordingDuration((prev) => prev + 1), 1000)
      startSilenceMonitor(stream)
    } catch (err: unknown) {
      if (getAccountGeneration() !== recordingAccount) return
      stopStream()
      const denied =
        err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
      setError(denied ? t('speech.micDenied') : t('speech.failedToStart'))
    }
  }, [
    clearTimer,
    isRecording,
    isSupported,
    setError,
    setIsRecording,
    setRecordingDuration,
    setTranscript,
    startSilenceMonitor,
    stopSilenceMonitor,
    stopStream,
    t,
    transcribe,
  ])

  /**
   * The app shell keeps this hook mounted through an account change, so a recording the previous
   * account started would keep running and post their audio under the next account's cookie, where
   * the composer appends the text to a draft it saves. Detaching the handlers before the stop is
   * what makes that airtight: `stop()` can still deliver one last chunk, and a listener left
   * attached would build a blob out of it and send it. The microphone is released with it, rather
   * than left open for a person who never turned it on.
   */
  const discardRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder) {
      recorder.ondataavailable = null
      recorder.onstop = null
      if (recorder.state !== 'inactive') recorder.stop()
      mediaRecorderRef.current = null
    }
    chunksRef.current = []
    clearTimer()
    stopSilenceMonitor()
    stopStream()
  }, [clearTimer, stopSilenceMonitor, stopStream])

  useResetOnAccountChange(discardRecording)

  const toggleRecording = useCallback(() => {
    if (isRecording) stopRecording()
    else void startRecording()
  }, [isRecording, startRecording, stopRecording])

  useEffect(() => {
    return () => {
      clearTimer()
      stopSilenceMonitor()
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      stopStream()
    }
  }, [clearTimer, stopSilenceMonitor, stopStream])

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
