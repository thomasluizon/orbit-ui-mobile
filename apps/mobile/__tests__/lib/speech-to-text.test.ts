import { describe, expect, it } from 'vitest'

import {
  buildSpeechRecognitionStartConfig,
  resolveSpeechTranscript,
} from '@/lib/speech-to-text'

describe('speech-to-text helpers', () => {
  it('keeps only the top non-empty speech transcript', () => {
    expect(
      resolveSpeechTranscript([
        { transcript: 'I want to workout from Monday to Friday' },
        { transcript: 'I want to work out from Monday to Friday' },
        { transcript: 'Monday to Friday I want to workout' },
      ]),
    ).toBe('I want to workout from Monday to Friday')
  })

  it('falls back to the next non-empty speech alternative', () => {
    expect(
      resolveSpeechTranscript([
        { transcript: '   ' },
        { transcript: 'Workout from Monday to Friday' },
      ]),
    ).toBe('Workout from Monday to Friday')
  })

  it('starts recognition with a single returned alternative', () => {
    expect(buildSpeechRecognitionStartConfig('en-US')).toEqual({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
      maxAlternatives: 1,
      androidIntentOptions: {
        EXTRA_MASK_OFFENSIVE_WORDS: false,
        EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 10000,
      },
    })
  })
})
