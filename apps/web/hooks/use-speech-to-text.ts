'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { API } from '@orbit/shared/api'
import {
  VOICE_LEVEL_POLL_MS,
  VOICE_SILENCE_TIMEOUT_MS,
  VOICE_WEB_SPEECH_RMS_THRESHOLD,
} from '@orbit/shared/chat'
import { ERROR_CODE_TO_KEY } from '@orbit/shared/utils'
export { CHAT_VISUALIZER_BAR_OFFSETS as VISUALIZER_BAR_OFFSETS } from '@orbit/shared/chat'

interface TranscriptionResponse {
  text?: string
  error?: string
  errorCode?: string
}

export function useSpeechToText() {
  const t = useTranslations()

  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isSupported] = useState(() => {
    if (typeof navigator === 'undefined') return false
    return (
      'mediaDevices' in navigator &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof MediaRecorder !== 'undefined'
    )
  })
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)

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
    async (blob: Blob) => {
      setIsTranscribing(true)
      try {
        const formData = new FormData()
        formData.append('audio', blob, 'recording.webm')
        const response = await fetch(API.chat.transcribe, { method: 'POST', body: formData })
        const data = (await response.json().catch(() => null)) as TranscriptionResponse | null
        const text = data?.text?.trim() ?? ''
        if (!response.ok || !text) {
          const key =
            (data?.errorCode && ERROR_CODE_TO_KEY[data.errorCode]) ?? 'errors.api.transcriptionFailed'
          setError(t(key))
          return
        }
        setTranscript(text)
      } catch {
        setError(t('errors.api.transcriptionFailed'))
      } finally {
        setIsTranscribing(false)
      }
    },
    [t],
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
  }, [clearTimer, stopSilenceMonitor, stopStream])

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
    setError(null)
    setTranscript('')
    setRecordingDuration(0)
    chunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        clearTimer()
        stopSilenceMonitor()
        stopStream()
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        chunksRef.current = []
        if (blob.size > 0) void transcribe(blob)
      }

      recorder.start()
      setIsRecording(true)
      timerRef.current = setInterval(() => setRecordingDuration((prev) => prev + 1), 1000)
      startSilenceMonitor(stream)
    } catch (err: unknown) {
      stopStream()
      const denied =
        err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
      setError(denied ? t('speech.micDenied') : t('speech.failedToStart'))
    }
  }, [clearTimer, isRecording, isSupported, startSilenceMonitor, stopSilenceMonitor, stopStream, t, transcribe])

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
