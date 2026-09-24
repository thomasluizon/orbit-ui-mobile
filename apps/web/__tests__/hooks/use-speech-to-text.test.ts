import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { VOICE_LEVEL_POLL_MS, VOICE_SILENCE_TIMEOUT_MS } from '@orbit/shared/chat'
import { API } from '@orbit/shared/api'
import { useSpeechToText } from '@/hooks/use-speech-to-text'
import { useThrottleStore } from '@/stores/throttle-store'
import { getErrorSurface } from '@orbit/shared/utils'
import {
  holdAccount,
  recoverSameAccount,
  replaceAccountWith,
} from '@/__tests__/support/account-change'
import { useAuthStore } from '@/stores/auth-store'

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

const microphoneTracks: { stop: ReturnType<typeof vi.fn> }[] = []

function makeStream(): MediaStream {
  const track = { stop: vi.fn() }
  microphoneTracks.push(track)
  return { getTracks: () => [track] } as unknown as MediaStream
}

/** The microphone this recording opened, which an account change has to close. */
function openMicrophone(): { stop: ReturnType<typeof vi.fn> } {
  return microphoneTracks.at(-1)!
}

function transcriptionCalls(fetchMock: ReturnType<typeof vi.fn>): unknown[][] {
  return fetchMock.mock.calls.filter((call) => call[0] === API.chat.transcribe)
}

const getUserMedia = vi.fn(async () => makeStream())

describe('useSpeechToText', () => {
  beforeEach(() => {
    MockMediaRecorder.instances = []
    microphoneTracks.length = 0
    vi.clearAllMocks()
    useThrottleStore.getState().clear()
    holdAccount('user-1')
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
    it('blocks recording after a timed transcription refusal until the deadline, then allows another attempt', async () => {
      const retryAt = Date.now() + 60_000
      const fetchMock = vi.fn(async () => Response.json({
        error: 'Rate limited', requestId: 'transcription-request', limit: 1, count: 2,
        retryAfterUtc: new Date(retryAt).toISOString(),
      }, { status: 429 }))
      vi.stubGlobal('fetch', fetchMock)
      const { result } = renderHook(() => useSpeechToText())
      await act(async () => { await result.current.startRecording() })
      await act(async () => { result.current.stopRecording() })
      await waitFor(() => expect(result.current.isTranscribing).toBe(false))

      await act(async () => { await result.current.startRecording() })
      expect(result.current.isRecording).toBe(false)
      expect(getUserMedia).toHaveBeenCalledTimes(1)
      expect(getErrorSurface(useThrottleStore.getState().error)).toEqual({
        retryAt, requestId: 'transcription-request',
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)

      vi.spyOn(Date, 'now').mockReturnValue(retryAt - 1)
      await act(async () => { await result.current.startRecording() })
      expect(result.current.isRecording).toBe(false)
      vi.spyOn(Date, 'now').mockReturnValue(retryAt)
      await act(async () => { await result.current.startRecording() })
      expect(result.current.isRecording).toBe(true)
      expect(getUserMedia).toHaveBeenCalledTimes(2)
      vi.restoreAllMocks()
    })

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

    it('auto-stops and transcribes after a silence once speech is detected', async () => {
      vi.useFakeTimers()
      const fetchMock = vi.fn(async () => Response.json({ text: 'log water' }, { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)

      let sampleValue = 200
      class MockAudioContext {
        createMediaStreamSource() {
          return { connect: vi.fn() }
        }
        createAnalyser() {
          return {
            fftSize: 2048,
            getByteTimeDomainData: (buffer: Uint8Array) => buffer.fill(sampleValue),
          }
        }
        close = vi.fn(async () => {})
      }
      vi.stubGlobal('AudioContext', MockAudioContext)

      const { result } = renderHook(() => useSpeechToText())

      await act(async () => {
        await result.current.startRecording()
      })
      expect(result.current.isRecording).toBe(true)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(VOICE_LEVEL_POLL_MS)
      })

      sampleValue = 128
      await act(async () => {
        await vi.advanceTimersByTimeAsync(VOICE_SILENCE_TIMEOUT_MS + VOICE_LEVEL_POLL_MS)
      })

      expect(result.current.isRecording).toBe(false)
      expect(result.current.transcript).toBe('log water')
    })

    it('closes the microphone and forgets the recording when another account replaces the tab', async () => {
      vi.useFakeTimers()
      const fetchMock = vi.fn(async () => Response.json({ text: 'log water' }, { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
      const { result } = renderHook(() => useSpeechToText())

      await act(async () => { await result.current.startRecording() })
      expect(result.current.isRecording).toBe(true)
      const recorder = MockMediaRecorder.instances.at(-1)!
      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      expect(result.current.recordingDuration).toBe(3)

      await replaceAccountWith('user-2')

      expect(result.current.isRecording).toBe(false)
      expect(result.current.recordingDuration).toBe(0)
      expect(recorder.state).toBe('inactive')
      expect(openMicrophone().stop).toHaveBeenCalled()
      expect(transcriptionCalls(fetchMock)).toEqual([])
    })

    it('drops the previous account transcript when another account replaces the tab', async () => {
      const fetchMock = vi.fn(async () => Response.json({ text: 'cancel my meds reminder' }, { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
      const { result } = renderHook(() => useSpeechToText())

      await act(async () => { await result.current.startRecording() })
      await act(async () => { result.current.stopRecording() })
      await waitFor(() => expect(result.current.transcript).toBe('cancel my meds reminder'))

      await replaceAccountWith('user-2')

      expect(result.current.transcript).toBe('')
      expect(result.current.isTranscribing).toBe(false)
    })

    it('drops the previous account microphone refusal when another account replaces the tab', async () => {
      vi.stubGlobal('fetch', vi.fn())
      getUserMedia.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
      const { result } = renderHook(() => useSpeechToText())

      await act(async () => { await result.current.startRecording() })
      expect(result.current.error).toBe('speech.micDenied')

      await replaceAccountWith('user-2')

      expect(result.current.error).toBeNull()
    })

    it('never posts the previous account audio under the next account', async () => {
      const fetchMock = vi.fn(async () => Response.json({ text: 'cancel my meds reminder' }, { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
      const { result } = renderHook(() => useSpeechToText())

      await act(async () => { await result.current.startRecording() })
      await replaceAccountWith('user-2')
      await act(async () => { result.current.stopRecording() })

      expect(transcriptionCalls(fetchMock)).toEqual([])
      expect(result.current.transcript).toBe('')
    })

    it('does not post audio when the stop event arrives after account replacement', async () => {
      const fetchMock = vi.fn(async () => Response.json({ text: 'old words' }, { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
      const { result } = renderHook(() => useSpeechToText())

      await act(async () => { await result.current.startRecording() })
      const recorder = MockMediaRecorder.instances.at(-1)!
      recorder.stop = vi.fn(() => { recorder.state = 'inactive' })
      act(() => { result.current.stopRecording() })
      expect(transcriptionCalls(fetchMock)).toEqual([])

      await replaceAccountWith('user-2')
      act(() => {
        recorder.ondataavailable?.({ data: new Blob(['old audio'], { type: 'audio/webm' }) })
        recorder.onstop?.()
      })

      expect(transcriptionCalls(fetchMock)).toEqual([])
      expect(result.current.transcript).toBe('')
    })

    it('does not post a queued stop event before account-change effects run', async () => {
      const fetchMock = vi.fn(async () => Response.json({ text: 'old words' }, { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
      const { result } = renderHook(() => useSpeechToText())

      await act(async () => { await result.current.startRecording() })
      const recorder = MockMediaRecorder.instances.at(-1)!
      recorder.stop = vi.fn(() => { recorder.state = 'inactive' })
      act(() => { result.current.stopRecording() })

      act(() => {
        useAuthStore.getState().setAuth({
          userId: 'user-2', name: 'Next account', email: 'next@example.com',
        })
        recorder.ondataavailable?.({ data: new Blob(['old audio'], { type: 'audio/webm' }) })
        recorder.onstop?.()
      })

      expect(transcriptionCalls(fetchMock)).toEqual([])
      expect(result.current.transcript).toBe('')
    })

    it('closes a microphone granted after the account changes before recording begins', async () => {
      let grantMicrophone!: (stream: MediaStream) => void
      getUserMedia.mockImplementationOnce(() => new Promise<MediaStream>((resolve) => {
        grantMicrophone = resolve
      }))
      const fetchMock = vi.fn(async () => Response.json({ text: 'old words' }, { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
      const { result } = renderHook(() => useSpeechToText())

      let startPromise!: Promise<void>
      act(() => { startPromise = result.current.startRecording() })
      await replaceAccountWith('user-2')
      const stream = makeStream()
      await act(async () => { grantMicrophone(stream); await startPromise })

      expect(result.current.isRecording).toBe(false)
      expect(openMicrophone().stop).toHaveBeenCalled()
      expect(MockMediaRecorder.instances).toHaveLength(0)
      expect(transcriptionCalls(fetchMock)).toEqual([])
    })

    it('drops a transcription still in flight when another account replaces the tab', async () => {
      let settleTranscription!: (response: Response) => void
      const fetchMock = vi.fn((input: unknown) =>
        input === API.chat.transcribe
          ? new Promise<Response>((resolve) => { settleTranscription = resolve })
          : Promise.resolve(Response.json({ expiresAt: Date.now() + 3600000, userId: 'user-2', refreshFailed: false })))
      vi.stubGlobal('fetch', fetchMock)
      const { result } = renderHook(() => useSpeechToText())

      await act(async () => { await result.current.startRecording() })
      await act(async () => { result.current.stopRecording() })
      await waitFor(() => expect(transcriptionCalls(fetchMock)).toHaveLength(1))

      await replaceAccountWith('user-2')
      await act(async () => {
        settleTranscription(Response.json({ text: 'cancel my meds reminder' }, { status: 200 }))
        await Promise.resolve()
      })

      expect(result.current.transcript).toBe('')
      expect(result.current.error).toBeNull()
    })

    it('never reports the previous account transcription failure to the next account', async () => {
      let refuseTranscription!: (reason: Error) => void
      const fetchMock = vi.fn((input: unknown) =>
        input === API.chat.transcribe
          ? new Promise<Response>((_resolve, reject) => { refuseTranscription = reject })
          : Promise.resolve(Response.json({ expiresAt: Date.now() + 3600000, userId: 'user-2', refreshFailed: false })))
      vi.stubGlobal('fetch', fetchMock)
      const { result } = renderHook(() => useSpeechToText())

      await act(async () => { await result.current.startRecording() })
      await act(async () => { result.current.stopRecording() })
      await waitFor(() => expect(transcriptionCalls(fetchMock)).toHaveLength(1))

      await replaceAccountWith('user-2')
      await act(async () => {
        refuseTranscription(new Error('network down'))
        await Promise.resolve()
      })

      expect(result.current.error).toBeNull()
    })

    it('keeps the recording running when the same account recovers from a rejected refresh', async () => {
      const fetchMock = vi.fn(async () => Response.json({ text: 'log water' }, { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
      const { result } = renderHook(() => useSpeechToText())

      await act(async () => { await result.current.startRecording() })
      await recoverSameAccount('user-1')

      expect(result.current.isRecording).toBe(true)
      expect(openMicrophone().stop).not.toHaveBeenCalled()

      fetchMock.mockImplementation(async () => Response.json({ text: 'log water' }, { status: 200 }))
      await act(async () => { result.current.stopRecording() })
      await waitFor(() => expect(result.current.transcript).toBe('log water'))
    })

    it('stops the duration timer so it cannot double count the next account recording', async () => {
      vi.useFakeTimers()
      vi.stubGlobal('fetch', vi.fn(async () => Response.json({ text: 'log water' }, { status: 200 })))
      const { result } = renderHook(() => useSpeechToText())

      await act(async () => { await result.current.startRecording() })
      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      expect(result.current.recordingDuration).toBe(3)

      await replaceAccountWith('user-2')
      await act(async () => { await result.current.startRecording() })
      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })

      expect(result.current.recordingDuration).toBe(3)
    })

    it('closes the silence monitor so it cannot poll under the next account', async () => {
      vi.useFakeTimers()
      vi.stubGlobal('fetch', vi.fn(async () => Response.json({ text: 'log water' }, { status: 200 })))
      let analyserReads = 0
      const contexts: { close: ReturnType<typeof vi.fn> }[] = []
      class MockAudioContext {
        close = vi.fn(async () => {})
        constructor() {
          contexts.push(this)
        }
        createMediaStreamSource() {
          return { connect: vi.fn() }
        }
        createAnalyser() {
          return {
            fftSize: 2048,
            getByteTimeDomainData: (buffer: Uint8Array) => {
              analyserReads += 1
              buffer.fill(200)
            },
          }
        }
      }
      vi.stubGlobal('AudioContext', MockAudioContext)
      const { result } = renderHook(() => useSpeechToText())

      await act(async () => { await result.current.startRecording() })
      await act(async () => { await vi.advanceTimersByTimeAsync(VOICE_LEVEL_POLL_MS) })
      expect(analyserReads).toBeGreaterThan(0)

      await replaceAccountWith('user-2')
      const readsAtReplacement = analyserReads
      await act(async () => { await vi.advanceTimersByTimeAsync(VOICE_LEVEL_POLL_MS * 3) })

      expect(contexts.at(-1)!.close).toHaveBeenCalled()
      expect(analyserReads).toBe(readsAtReplacement)
    })
  })
})
