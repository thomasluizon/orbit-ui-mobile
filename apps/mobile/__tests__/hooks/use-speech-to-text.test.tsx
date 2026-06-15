import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { VOICE_SILENCE_TIMEOUT_MS, VOICE_LEVEL_POLL_MS } from '@orbit/shared/chat'

import { useSpeechToText } from '@/hooks/use-speech-to-text'

const TestRenderer = require('react-test-renderer')

type AnalysisHandler = (event: { dataPoints: { rms: number }[] }) => Promise<void>

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
  requestPermissionsAsync: vi.fn(async () => ({ granted: true })),
  startRecording: vi.fn(),
  stopRecording: vi.fn(async () => ({ fileUri: 'file:///tmp/recording.wav' })),
  onAnalysis: undefined as AnalysisHandler | undefined,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

vi.mock('@siteed/audio-studio', () => ({
  AudioStudioModule: {
    requestPermissionsAsync: mocks.requestPermissionsAsync,
  },
  useAudioRecorder: () => ({
    startRecording: mocks.startRecording,
    stopRecording: mocks.stopRecording,
  }),
}))

type SpeechApi = ReturnType<typeof useSpeechToText>

async function renderHook(): Promise<{ current: SpeechApi }> {
  const ref: { current: SpeechApi | null } = { current: null }

  function Harness() {
    ref.current = useSpeechToText()
    return null
  }

  await TestRenderer.act(async () => {
    TestRenderer.create(<Harness />)
    await Promise.resolve()
  })

  if (!ref.current) {
    throw new Error('useSpeechToText did not render')
  }

  return ref as { current: SpeechApi }
}

describe('useSpeechToText', () => {
  beforeEach(() => {
    mocks.apiClient.mockReset()
    mocks.requestPermissionsAsync.mockReset()
    mocks.requestPermissionsAsync.mockResolvedValue({ granted: true })
    mocks.startRecording.mockReset()
    mocks.startRecording.mockImplementation(async (config: { onAudioAnalysis?: AnalysisHandler }) => {
      mocks.onAnalysis = config.onAudioAnalysis
      return { fileUri: 'file:///tmp/recording.wav' }
    })
    mocks.stopRecording.mockReset()
    mocks.stopRecording.mockResolvedValue({ fileUri: 'file:///tmp/recording.wav' })
    mocks.onAnalysis = undefined
  })

  it('records, uploads the audio, and commits the transcribed text', async () => {
    mocks.apiClient.mockResolvedValue({ text: '  log water  ' })
    const hook = await renderHook()

    await TestRenderer.act(async () => {
      await hook.current.startRecording()
    })
    expect(hook.current.isRecording).toBe(true)
    expect(mocks.startRecording).toHaveBeenCalledTimes(1)

    await TestRenderer.act(async () => {
      await hook.current.stopRecording()
      await Promise.resolve()
    })

    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.chat.transcribe,
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    )
    expect(hook.current.transcript).toBe('log water')
    expect(hook.current.isRecording).toBe(false)
    expect(hook.current.isTranscribing).toBe(false)
    expect(hook.current.error).toBeNull()
  })

  it('surfaces the no-speech message when the transcript is empty', async () => {
    mocks.apiClient.mockResolvedValue({ text: '   ' })
    const hook = await renderHook()

    await TestRenderer.act(async () => {
      await hook.current.startRecording()
    })
    await TestRenderer.act(async () => {
      await hook.current.stopRecording()
      await Promise.resolve()
    })

    expect(hook.current.transcript).toBe('')
    expect(hook.current.error).toBe('speech.noSpeech')
  })

  it('surfaces a friendly error when the upload fails', async () => {
    mocks.apiClient.mockRejectedValue(new Error('network down'))
    const hook = await renderHook()

    await TestRenderer.act(async () => {
      await hook.current.startRecording()
    })
    await TestRenderer.act(async () => {
      await hook.current.stopRecording()
      await Promise.resolve()
    })

    expect(hook.current.error).toBe('errors.api.transcriptionFailed')
    expect(hook.current.isTranscribing).toBe(false)
  })

  it('denies recording and surfaces the mic-denied message without recording', async () => {
    mocks.requestPermissionsAsync.mockResolvedValue({ granted: false })
    const hook = await renderHook()

    await TestRenderer.act(async () => {
      await hook.current.startRecording()
    })

    expect(hook.current.isRecording).toBe(false)
    expect(hook.current.error).toBe('speech.micDenied')
    expect(mocks.startRecording).not.toHaveBeenCalled()
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('auto-stops and transcribes after a silence once speech has been detected', async () => {
    mocks.apiClient.mockResolvedValue({ text: 'log water' })
    const hook = await renderHook()

    await TestRenderer.act(async () => {
      await hook.current.startRecording()
    })
    expect(hook.current.isRecording).toBe(true)
    expect(mocks.onAnalysis).toBeTypeOf('function')

    await TestRenderer.act(async () => {
      await mocks.onAnalysis?.({ dataPoints: [{ rms: 0.5 }] })
      const silentPolls = Math.ceil(VOICE_SILENCE_TIMEOUT_MS / VOICE_LEVEL_POLL_MS)
      for (let i = 0; i < silentPolls; i++) {
        await mocks.onAnalysis?.({ dataPoints: [{ rms: 0.001 }] })
      }
      await Promise.resolve()
    })

    expect(mocks.stopRecording).toHaveBeenCalled()
    expect(hook.current.isRecording).toBe(false)
    expect(hook.current.transcript).toBe('log water')
  })
})
