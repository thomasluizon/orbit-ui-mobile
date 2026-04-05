import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSpeechToText } from '@/hooks/use-speech-to-text'

// Mock next-intl
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (params) return `${key}: ${JSON.stringify(params)}`
    return key
  },
}))

// Mock localStorage
const mockStorage: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value
  }),
})

// Mock SpeechRecognition
class MockSpeechRecognition {
  continuous = false
  interimResults = false
  lang = ''
  onresult: ((event: unknown) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onend: (() => void) | null = null

  start = vi.fn(() => {
    // Simulate successful start
  })
  stop = vi.fn(() => {
    // Simulate stop - trigger onend
    if (this.onend) this.onend()
  })
  abort = vi.fn()
}

describe('useSpeechToText', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key])
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('without SpeechRecognition API', () => {
    beforeEach(() => {
      globalThis.SpeechRecognition = undefined
      globalThis.webkitSpeechRecognition = undefined
    })

    it('reports not supported', () => {
      const { result } = renderHook(() => useSpeechToText())
      expect(result.current.isSupported).toBe(false)
      expect(result.current.isRecording).toBe(false)
    })

    it('does nothing on startRecording when not supported', () => {
      const { result } = renderHook(() => useSpeechToText())

      act(() => {
        result.current.startRecording()
      })

      expect(result.current.isRecording).toBe(false)
    })
  })

  describe('with SpeechRecognition API', () => {
    beforeEach(() => {
      globalThis.SpeechRecognition = MockSpeechRecognition as unknown as typeof globalThis.SpeechRecognition
    })

    afterEach(() => {
      globalThis.SpeechRecognition = undefined
    })

    it('reports supported', () => {
      const { result } = renderHook(() => useSpeechToText())
      expect(result.current.isSupported).toBe(true)
    })

    it('starts with default language based on locale', () => {
      const { result } = renderHook(() => useSpeechToText())
      expect(result.current.selectedLanguage).toBe('en-US')
    })

    it('reads stored language from localStorage', () => {
      mockStorage['orbit:speech-lang'] = 'pt-BR'
      const { result } = renderHook(() => useSpeechToText())
      expect(result.current.selectedLanguage).toBe('pt-BR')
    })

    it('allows changing language', () => {
      const { result } = renderHook(() => useSpeechToText())

      act(() => {
        result.current.setSelectedLanguage('es-ES')
      })

      expect(result.current.selectedLanguage).toBe('es-ES')
      expect(localStorage.setItem).toHaveBeenCalledWith('orbit:speech-lang', 'es-ES')
    })

    it('starts recording', () => {
      const { result } = renderHook(() => useSpeechToText())

      act(() => {
        result.current.startRecording()
      })

      expect(result.current.isRecording).toBe(true)
      expect(result.current.error).toBeNull()
      expect(result.current.transcript).toBe('')
    })

    it('stops recording', () => {
      const { result } = renderHook(() => useSpeechToText())

      act(() => {
        result.current.startRecording()
      })

      act(() => {
        result.current.stopRecording()
      })

      expect(result.current.isRecording).toBe(false)
    })

    it('toggleRecording starts and stops', () => {
      const { result } = renderHook(() => useSpeechToText())

      act(() => {
        result.current.toggleRecording()
      })
      expect(result.current.isRecording).toBe(true)

      act(() => {
        result.current.toggleRecording()
      })
      expect(result.current.isRecording).toBe(false)
    })

    it('tracks recording duration', () => {
      const { result } = renderHook(() => useSpeechToText())

      act(() => {
        result.current.startRecording()
      })

      expect(result.current.recordingDuration).toBe(0)

      act(() => {
        vi.advanceTimersByTime(3000) // 3 seconds
      })

      expect(result.current.recordingDuration).toBe(3)
    })

    it('resets duration on new recording', () => {
      const { result } = renderHook(() => useSpeechToText())

      act(() => {
        result.current.startRecording()
      })

      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(result.current.recordingDuration).toBe(5)

      act(() => {
        result.current.stopRecording()
      })

      act(() => {
        result.current.startRecording()
      })

      expect(result.current.recordingDuration).toBe(0)
    })

    it('starts with empty transcript', () => {
      const { result } = renderHook(() => useSpeechToText())
      expect(result.current.transcript).toBe('')
    })

    it('starts with no error', () => {
      const { result } = renderHook(() => useSpeechToText())
      expect(result.current.error).toBeNull()
    })
  })

  describe('with webkitSpeechRecognition fallback', () => {
    beforeEach(() => {
      globalThis.SpeechRecognition = undefined
      globalThis.webkitSpeechRecognition = MockSpeechRecognition as unknown as typeof globalThis.webkitSpeechRecognition
    })

    afterEach(() => {
      globalThis.webkitSpeechRecognition = undefined
    })

    it('detects webkit variant as supported', () => {
      const { result } = renderHook(() => useSpeechToText())
      expect(result.current.isSupported).toBe(true)
    })
  })
})
