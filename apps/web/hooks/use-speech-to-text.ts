'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  CHAT_SPEECH_LANG_KEY,
  getDefaultChatSpeechLanguage,
} from '@orbit/shared/chat'
export {
  CHAT_SPEECH_LANGUAGES as SPEECH_LANGUAGES,
  CHAT_VISUALIZER_BAR_OFFSETS as VISUALIZER_BAR_OFFSETS,
} from '@orbit/shared/chat'

// ---------------------------------------------------------------------------
// Web Speech API type declarations (not in default TS DOM lib)
// ---------------------------------------------------------------------------

interface SpeechRecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: { readonly transcript: string; readonly confidence: number }
}

interface SpeechRecognitionResultList {
  readonly length: number
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

declare global {
  // eslint-disable-next-line no-var
  var SpeechRecognition: SpeechRecognitionConstructor | undefined
  // eslint-disable-next-line no-var
  var webkitSpeechRecognition: SpeechRecognitionConstructor | undefined
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSpeechToText() {
  const locale = useLocale()
  const t = useTranslations()

  const [isRecording, setIsRecording] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [selectedLanguage, setSelectedLanguageRaw] = useState(() => { // NOSONAR - setter wrapped by useCallback below
    const defaultLanguage = getDefaultChatSpeechLanguage(locale)
    if (typeof globalThis === 'undefined' || typeof globalThis.localStorage === 'undefined') return defaultLanguage // NOSONAR - SSR guard
    return localStorage.getItem(CHAT_SPEECH_LANG_KEY) ?? defaultLanguage
  })
  const [recordingDuration, setRecordingDuration] = useState(0)

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Check browser support and create recognition instance
  useEffect(() => {
    const Ctor = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition
    setIsSupported(!!Ctor)

    if (Ctor) {
      const recognition = new Ctor()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = selectedLanguage
      recognitionRef.current = recognition
    }

    return () => {
      recognitionRef.current?.abort()
      recognitionRef.current = null
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Set language and persist
  const setSelectedLanguage = useCallback((newLang: string) => {
    setSelectedLanguageRaw(newLang)
    localStorage.setItem(CHAT_SPEECH_LANG_KEY, newLang)
    if (recognitionRef.current) {
      recognitionRef.current.lang = newLang
    }
  }, [])

  // Clear the recording timer
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Start recording timer
  const startTimer = useCallback(() => {
    setRecordingDuration(0)
    timerRef.current = setInterval(() => {
      setRecordingDuration((prev) => prev + 1)
    }, 1000)
  }, [])

  const startRecording = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return

    setError(null)
    setTranscript('')
    recognition.lang = selectedLanguage

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = ''
      let interimText = ''

      for (const result of Array.from({ length: event.results.length }, (_, i) => event.results[i])) {
        if (!result?.[0]) continue
        if (result.isFinal) {
          finalText += result[0].transcript
        } else {
          interimText += result[0].transcript
        }
      }

      setTranscript(finalText + interimText)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed') {
        setError(t('speech.micDenied'))
      } else if (event.error === 'no-speech') {
        setError(t('speech.noSpeech'))
      } else {
        setError(t('speech.recognitionError', { error: event.error }))
      }
      setIsRecording(false)
      clearTimer()
    }

    recognition.onend = () => {
      setIsRecording(false)
      clearTimer()
    }

    try {
      recognition.start()
      setIsRecording(true)
      startTimer()
    } catch {
      setError(t('speech.failedToStart'))
    }
  }, [selectedLanguage, t, clearTimer, startTimer])

  const stopRecording = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return
    recognition.stop()
    setIsRecording(false)
    clearTimer()
  }, [clearTimer])

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
      clearTimer()
    }
  }, [clearTimer])

  return {
    isRecording,
    isSupported,
    transcript,
    error,
    selectedLanguage,
    setSelectedLanguage,
    startRecording,
    stopRecording,
    toggleRecording,
    recordingDuration,
  }
}
