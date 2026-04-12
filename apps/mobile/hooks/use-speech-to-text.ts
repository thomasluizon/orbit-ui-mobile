import { useCallback, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import Constants, { AppOwnership } from 'expo-constants'
import { useTranslation } from 'react-i18next'
import { CHAT_SPEECH_LANG_KEY, getDefaultChatSpeechLanguage } from '@orbit/shared/chat'
import {
  buildSpeechRecognitionStartConfig,
  resolveSpeechTranscript,
} from '@/lib/speech-to-text'
export {
  CHAT_SPEECH_LANGUAGES as SPEECH_LANGUAGES,
  CHAT_VISUALIZER_BAR_OFFSETS as VISUALIZER_BAR_OFFSETS,
} from '@orbit/shared/chat'

interface SpeechResultEvent {
  isFinal?: boolean
  results: Array<{ transcript: string }>
}

interface SpeechErrorEvent {
  error: string
}

interface SpeechRecognitionModule {
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: () => boolean
    requestPermissionsAsync: () => Promise<{ granted: boolean }>
    start: (config: {
      lang: string
      interimResults: boolean
      continuous: boolean
      maxAlternatives?: number
      androidIntentOptions?: Record<string, boolean | number>
    }) => void
    stop: () => void
    abort: () => void
  }
  useSpeechRecognitionEvent: (
    event: 'start' | 'end' | 'result' | 'error',
    callback: (event: SpeechResultEvent | SpeechErrorEvent) => void,
  ) => void
}

function getSpeechModule(): SpeechRecognitionModule | null {
  if (Platform.OS === 'web') return null
  // expo-speech-recognition is unavailable in Expo Go because the native module isn't bundled there.
  if (Constants.appOwnership === AppOwnership.Expo) return null

  try {
    return require('expo-speech-recognition') as SpeechRecognitionModule
  } catch {
    return null
  }
}

const speechModule = getSpeechModule()
const speechEventHook = speechModule?.useSpeechRecognitionEvent ?? (() => {})

function getSpeechRecognitionAvailability(): boolean {
  if (!speechModule) return false
  try {
    return speechModule.ExpoSpeechRecognitionModule.isRecognitionAvailable()
  } catch {
    return false
  }
}

function getSpeechErrorMessageFromCode(error: string, t: (key: string, options?: Record<string, unknown>) => string) {
  if (error === 'not-allowed') return t('speech.micDenied')
  if (error === 'no-speech' || error === 'speech-timeout') {
    return t('speech.noSpeech')
  }
  return t('speech.recognitionError', { error })
}

export function useSpeechToText() {
  const { t, i18n } = useTranslation()
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isMountedRef = useRef(true)

  const [isRecording, setIsRecording] = useState(false)
  const [isSupported, setIsSupported] = useState(() => getSpeechRecognitionAvailability())
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [selectedLanguage, setSelectedLanguageState] = useState(() =>
    getDefaultChatSpeechLanguage(i18n.language),
  )
  const [recordingDuration, setRecordingDuration] = useState(0)

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

  useEffect(() => {
    isMountedRef.current = true
    setIsSupported(getSpeechRecognitionAvailability())

    AsyncStorage.getItem(CHAT_SPEECH_LANG_KEY)
      .then((storedLanguage) => {
        if (storedLanguage && isMountedRef.current) {
          setSelectedLanguageState(storedLanguage)
        }
      })
      .catch(() => {
        // Ignore storage failures and keep the locale-derived default.
      })

    return () => {
      isMountedRef.current = false
      clearTimer()
      try {
        speechModule?.ExpoSpeechRecognitionModule.abort()
      } catch {
        // Ignore cleanup failures when the native module is unavailable.
      }
    }
  }, [clearTimer])

  speechEventHook('start', () => {
    setError(null)
    setIsRecording(true)
    startTimer()
  })

  speechEventHook('end', () => {
    setIsRecording(false)
    clearTimer()
  })

  speechEventHook('result', (event: SpeechResultEvent | SpeechErrorEvent) => {
    const resultEvent = event as SpeechResultEvent
    setTranscript(resolveSpeechTranscript(resultEvent.results))
  })

  speechEventHook('error', (event: SpeechResultEvent | SpeechErrorEvent) => {
    const errorEvent = event as SpeechErrorEvent
    setError(getSpeechErrorMessageFromCode(errorEvent.error, t))
    setIsRecording(false)
    clearTimer()
  })

  const updateSelectedLanguage = useCallback((newLanguage: string) => {
    setSelectedLanguageState(newLanguage)
    AsyncStorage.setItem(CHAT_SPEECH_LANG_KEY, newLanguage).catch(() => {
      // Ignore persistence failures and keep the in-memory selection.
    })
  }, [])

  const startRecording = useCallback(async () => {
    if (!isSupported || !speechModule) {
      setError(t('chat.voiceUnsupportedError'))
      return
    }

    if (isRecording) return

    setError(null)
    setTranscript('')
    setRecordingDuration(0)

    const permissions = await speechModule.ExpoSpeechRecognitionModule.requestPermissionsAsync()
    if (!permissions.granted) {
      setError(t('speech.micDenied'))
      return
    }

    try {
      speechModule.ExpoSpeechRecognitionModule.start(
        buildSpeechRecognitionStartConfig(selectedLanguage),
      )
    } catch {
      setError(t('speech.failedToStart'))
      setIsRecording(false)
      clearTimer()
    }
  }, [clearTimer, isRecording, isSupported, selectedLanguage, t])

  const stopRecording = useCallback(() => {
    if (!isRecording || !speechModule) return

    try {
      speechModule.ExpoSpeechRecognitionModule.stop()
    } catch {
      setError(t('speech.failedToStart'))
      setIsRecording(false)
      clearTimer()
    }
  }, [clearTimer, isRecording, t])

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording()
    } else {
      void startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  return {
    isRecording,
    isSupported,
    transcript,
    error,
    selectedLanguage,
    setSelectedLanguage: updateSelectedLanguage,
    startRecording,
    stopRecording,
    toggleRecording,
    recordingDuration,
  }
}
