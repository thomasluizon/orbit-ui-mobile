import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSpeechToText } from '@/hooks/use-speech-to-text'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

type RecorderState = 'inactive' | 'recording'

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = []
  state: RecorderState = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null

  constructor(public stream: MediaStream) {
    MockMediaRecorder.instances.push(this)
  }

  start = vi.fn(() => {
    this.state = 'recording'
  })

  stop = vi.fn(() => {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) })
    this.onstop?.()
  })
}

function makeStream(): MediaStream {
  const track = { stop: vi.fn() }
  return { getTracks: () => [track] } as unknown as MediaStream
}

const getUserMedia = vi.fn(async () => makeStream())

describe('useSpeechToText', () => {
  beforeEach(() => {
    MockMediaRecorder.instances = []
    vi.clearAllMocks()
    vi.stubGlobal('MediaRecorder', MockMediaRecorder)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  describe('without recording support', () => {
    beforeEach(() => {
      vi.stubGlobal('navigator', {})
    })

    it('reports not supported', () => {
      const { result } = renderHook(() => useSpeechToText())
      expect(result.current.isSupported).toBe(false)
    })

    it('does nothing on startRecording when not supported', async () => {
      const { result } = renderHook(() => useSpeechToText())
      await act(async () => {
        await result.current.startRecording()
      })
      expect(result.current.isRecording).toBe(false)
    })
  })

  describe('with recording support', () => {
    it('reports supported', () => {
      const { result } = renderHook(() => useSpeechToText())
      expect(result.current.isSupported).toBe(true)
    })

    it('starts recording and requests the microphone', async () => {
      const { result } = renderHook(() => useSpeechToText())

      await act(async () => {
        await result.current.startRecording()
      })

      expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
      expect(result.current.isRecording).toBe(true)
      expect(result.current.error).toBeNull()
    })

    it('tracks recording duration', async () => {
      vi.useFakeTimers()
      const { result } = renderHook(() => useSpeechToText())

      await act(async () => {
        await result.current.startRecording()
      })
      expect(result.current.recordingDuration).toBe(0)

      act(() => {
        vi.advanceTimersByTime(3000)
      })
      expect(result.current.recordingDuration).toBe(3)
    })

    it('commits the transcript after a successful transcription', async () => {
      const fetchMock = vi.fn(
        async (_input: string, _init?: RequestInit) =>
          Response.json({ text: '  log water  ' }, { status: 200 }),
      )
      vi.stubGlobal('fetch', fetchMock)

      const { result } = renderHook(() => useSpeechToText())

      await act(async () => {
        await result.current.startRecording()
      })
      await act(async () => {
        result.current.stopRecording()
      })

      await waitFor(() => expect(result.current.transcript).toBe('log water'))
      expect(result.current.isRecording).toBe(false)
      expect(result.current.isTranscribing).toBe(false)
      expect(result.current.error).toBeNull()

      const init = fetchMock.mock.calls[0]?.[1]
      const body = init?.body
      expect(body).toBeInstanceOf(FormData)
      if (body instanceof FormData) {
        expect(body.get('audio')).toBeInstanceOf(Blob)
      }
    })

    it('surfaces the mapped error key when transcription returns an error code', async () => {
      const fetchMock = vi.fn(async () =>
        Response.json({ error: 'no speech', errorCode: 'AUDIO_TRANSCRIPTION_EMPTY' }, { status: 400 }),
      )
      vi.stubGlobal('fetch', fetchMock)

      const { result } = renderHook(() => useSpeechToText())

      await act(async () => {
        await result.current.startRecording()
      })
      await act(async () => {
        result.current.stopRecording()
      })

      await waitFor(() => expect(result.current.error).toBe('speech.noSpeech'))
      expect(result.current.transcript).toBe('')
    })

    it('falls back to the generic failure key on a network error', async () => {
      const fetchMock = vi.fn(async () => {
        throw new Error('network down')
      })
      vi.stubGlobal('fetch', fetchMock)

      const { result } = renderHook(() => useSpeechToText())

      await act(async () => {
        await result.current.startRecording()
      })
      await act(async () => {
        result.current.stopRecording()
      })

      await waitFor(() => expect(result.current.error).toBe('errors.api.transcriptionFailed'))
    })

    it('surfaces a permission-denied error without throwing', async () => {
      getUserMedia.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
      const { result } = renderHook(() => useSpeechToText())

      await act(async () => {
        await result.current.startRecording()
      })

      expect(result.current.error).toBe('speech.micDenied')
      expect(result.current.isRecording).toBe(false)
    })
  })
})
