import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'

import { useSpeechToText } from '@/hooks/use-speech-to-text'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
  requestRecordingPermissionsAsync: vi.fn(async () => ({ granted: true })),
  setAudioModeAsync: vi.fn(async () => {}),
  prepareToRecordAsync: vi.fn(async () => {}),
  record: vi.fn(),
  stop: vi.fn(async () => {}),
  recorderUri: 'file:///tmp/recording.m4a' as string | null,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

vi.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  AudioModule: {
    requestRecordingPermissionsAsync: mocks.requestRecordingPermissionsAsync,
  },
  setAudioModeAsync: mocks.setAudioModeAsync,
  useAudioRecorder: () => ({
    prepareToRecordAsync: mocks.prepareToRecordAsync,
    record: mocks.record,
    stop: mocks.stop,
    get uri() {
      return mocks.recorderUri
    },
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
    mocks.requestRecordingPermissionsAsync.mockReset()
    mocks.requestRecordingPermissionsAsync.mockResolvedValue({ granted: true })
    mocks.setAudioModeAsync.mockClear()
    mocks.prepareToRecordAsync.mockClear()
    mocks.record.mockClear()
    mocks.stop.mockClear()
    mocks.recorderUri = 'file:///tmp/recording.m4a'
  })

  it('records, uploads the audio, and commits the transcribed text', async () => {
    mocks.apiClient.mockResolvedValue({ text: '  log water  ' })
    const hook = await renderHook()

    await TestRenderer.act(async () => {
      await hook.current.startRecording()
    })
    expect(hook.current.isRecording).toBe(true)
    expect(mocks.record).toHaveBeenCalledTimes(1)

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

  it('denies recording and surfaces the mic-denied message without uploading', async () => {
    mocks.requestRecordingPermissionsAsync.mockResolvedValue({ granted: false })
    const hook = await renderHook()

    await TestRenderer.act(async () => {
      await hook.current.startRecording()
    })

    expect(hook.current.isRecording).toBe(false)
    expect(hook.current.error).toBe('speech.micDenied')
    expect(mocks.record).not.toHaveBeenCalled()
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })
})
